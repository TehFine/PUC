import { Pool, types as pgTypes, type CustomTypesConfig } from "pg";

export interface ImportFromSourceOptions {
  log?: (message: string) => void;
  /** Bỏ qua bảng tạm thời nếu đích chưa cài PostGIS (chỉ dùng cho kiểm thử nhúng cục bộ). */
  skipTables?: ReadonlySet<string>;
}

export interface TableImportStat {
  table: string;
  sourceRows: number;
  targetRows: number;
}

const EXCLUDED_TABLES = new Set([
  "spatial_ref_sys",
  "geography_columns",
  "geometry_columns",
  "raster_columns",
  "raster_overviews",
  "schema_migrations",
]);

/**
 * Giữ nguyên biểu diễn chuỗi gốc từ PostgreSQL cho date/timestamp/json/jsonb/numeric/int8
 * để không bao giờ lệch múi giờ, mất micro-giây hay lỗi mảng JSON khi ghi sang CSDL đích;
 * riêng `bytea` (OID 17) vẫn dùng bộ giải mã chuẩn sang `Buffer` nhị phân.
 */
const LOSSLESS_TYPES: CustomTypesConfig = {
  getTypeParser: (oid: number, format?: "text" | "binary") => {
    if (oid === pgTypes.builtins.BYTEA) {
      return pgTypes.getTypeParser(oid, format ?? "text");
    }
    return (val: string) => val;
  },
};

function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/**
 * Sao chép nguyên vẹn dữ liệu toàn bộ bảng thuộc lược đồ `public` từ `sourcePool` (ví dụ Supabase)
 * sang `targetPool` (ví dụ PostgreSQL + PostGIS trên máy chủ Cloud) trong một giao dịch nguyên tử,
 * tự động đồng bộ lại toàn bộ bộ đếm `SERIAL`/`IDENTITY` và đối chiếu số bản ghi từng bảng trước khi COMMIT.
 */
export async function importFromSource(
  sourcePool: Pool,
  targetPool: Pool,
  options: ImportFromSourceOptions = {},
): Promise<TableImportStat[]> {
  const log = options.log ?? console.log;

  const sourceTablesRes = await sourcePool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const targetTablesRes = await targetPool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const targetTableSet = new Set(targetTablesRes.rows.map((r) => r.table_name));
  const tablesToCopy: string[] = [];

  for (const { table_name: tbl } of sourceTablesRes.rows) {
    if (EXCLUDED_TABLES.has(tbl) || options.skipTables?.has(tbl)) continue;
    if (!targetTableSet.has(tbl)) {
      throw new Error(
        `Bảng public.${tbl} tồn tại trên CSDL nguồn nhưng chưa có trên CSDL đích. Hãy chạy migration trước khi import.`,
      );
    }
    tablesToCopy.push(tbl);
  }

  if (tablesToCopy.length === 0) {
    log("Không có bảng dữ liệu nào cần sao chép.");
    return [];
  }

  const client = await targetPool.connect();
  const stats: TableImportStat[] = [];

  try {
    await client.query("BEGIN");
    // Tắt tạm thời trigger/khóa ngoại trong giao dịch để sao chép trơn tru các bảng tham chiếu vòng
    // (ví dụ households <-> attachments <-> users), sau đó kiểm tra toàn vẹn trước khi COMMIT.
    await client.query("SET LOCAL session_replication_role = 'replica'");

    const truncateList = tablesToCopy.map((t) => `public.${quoteIdent(t)}`).join(", ");
    log(`Đang làm sạch dữ liệu khởi tạo trên ${tablesToCopy.length} bảng đích...`);
    await client.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);

    for (const tbl of tablesToCopy) {
      const colsRes = await sourcePool.query<{
        column_name: string;
        data_type: string;
        udt_name: string;
      }>(
        `SELECT column_name, data_type, udt_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND is_generated = 'NEVER'
         ORDER BY ordinal_position`,
        [tbl],
      );

      const targetColsRes = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND is_generated = 'NEVER'`,
        [tbl],
      );
      const targetColSet = new Set(targetColsRes.rows.map((r) => r.column_name));
      const cols = colsRes.rows.filter((c) => targetColSet.has(c.column_name));
      if (cols.length === 0) continue;

      const countRes = await sourcePool.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM public.${quoteIdent(tbl)}`,
      );
      const sourceCount = countRes.rows[0]?.c ?? 0;

      if (sourceCount === 0) {
        stats.push({ table: tbl, sourceRows: 0, targetRows: 0 });
        continue;
      }

      const selectColList = cols.map((c) => quoteIdent(c.column_name)).join(", ");
      const hasBytea = cols.some((c) => c.data_type === "bytea");
      const batchSize = hasBytea ? 10 : 250;

      let inserted = 0;
      for (let offset = 0; offset < sourceCount; offset += batchSize) {
        const batchRes = await sourcePool.query({
          text: `SELECT ${selectColList} FROM public.${quoteIdent(tbl)} LIMIT $1 OFFSET $2`,
          values: [batchSize, offset],
          types: LOSSLESS_TYPES,
        });
        const rows = batchRes.rows as Record<string, unknown>[];
        if (rows.length === 0) break;

        const values: unknown[] = [];
        const rowPlaceholders: string[] = [];
        let paramIdx = 1;

        for (const row of rows) {
          const cellPlaceholders: string[] = [];
          for (const col of cols) {
            values.push(row[col.column_name] ?? null);
            let cast = "";
            if (col.udt_name === "jsonb") cast = "::jsonb";
            else if (col.udt_name === "json") cast = "::json";
            else if (col.udt_name === "geometry") cast = "::geometry";
            cellPlaceholders.push(`$${paramIdx}${cast}`);
            paramIdx += 1;
          }
          rowPlaceholders.push(`(${cellPlaceholders.join(", ")})`);
        }

        await client.query(
          `INSERT INTO public.${quoteIdent(tbl)} (${selectColList}) OVERRIDING SYSTEM VALUE VALUES ${rowPlaceholders.join(", ")}`,
          values,
        );
        inserted += rows.length;
      }

      const verifyRes = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM public.${quoteIdent(tbl)}`,
      );
      const targetCount = verifyRes.rows[0]?.c ?? 0;
      if (targetCount !== sourceCount) {
        throw new Error(
          `Lệch số bản ghi tại bảng public.${tbl}: nguồn=${sourceCount}, đích=${targetCount} (đã chèn=${inserted})`,
        );
      }

      log(`  [OK] ${tbl}: ${targetCount}/${sourceCount} bản ghi`);
      stats.push({ table: tbl, sourceRows: sourceCount, targetRows: targetCount });
    }

    // Đồng bộ lại toàn bộ sequence của các cột SERIAL / IDENTITY trên CSDL đích
    const seqRes = await client.query<{
      table_name: string;
      column_name: string;
      seq_name: string;
    }>(`
      SELECT c.table_name,
             c.column_name,
             pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) AS seq_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) IS NOT NULL
    `);

    for (const { table_name: tbl, column_name: col, seq_name: seqName } of seqRes.rows) {
      if (EXCLUDED_TABLES.has(tbl) || options.skipTables?.has(tbl)) continue;
      await client.query(
        `SELECT setval($1, COALESCE((SELECT MAX(${quoteIdent(col)})::bigint FROM public.${quoteIdent(tbl)}), 1), (SELECT COUNT(*) > 0 FROM public.${quoteIdent(tbl)}))`,
        [seqName],
      );
    }

    await client.query("SET LOCAL session_replication_role = 'origin'");
    await client.query("COMMIT");
    log(`Hoàn tất sao chép và đối chiếu ${stats.length} bảng thành công.`);
    return stats;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

