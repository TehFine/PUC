import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "db", "migrations");
const MIGRATION_ADVISORY_LOCK_ID = 88421017;

export interface MigrateOptions {
  /** Bỏ qua migration có tên khớp (ví dụ khi môi trường không có PostGIS). */
  skip?: (name: string) => boolean;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  /** Trên môi trường đám mây đã tạo bảng thủ công trước đó: không dừng cứng toàn server nếu 1 file cũ báo trùng đối tượng. */
  continueOnError?: boolean;
}

/** Chạy tuần tự các file db/migrations/*.sql chưa áp dụng, dùng khóa tư vấn theo giao dịch tương thích với mọi Connection Pooler. */
export async function migrate(pool: Pool, options: MigrateOptions = {}): Promise<string[]> {
  const log = options.log ?? (() => undefined);
  const warn = options.warn ?? (() => undefined);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const initialApplied = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((row) => row.name),
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();
  const pendingFiles = files.filter((file) => !initialApplied.has(file) && !options.skip?.(file));
  if (pendingFiles.length === 0) {
    return [];
  }

  const client = await pool.connect();
  const ran: string[] = [];
  try {
    for (const file of pendingFiles) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '15s'");
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_ADVISORY_LOCK_ID]);

        const checkRes = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
        if ((checkRes.rowCount ?? 0) > 0) {
          await client.query("COMMIT");
          continue;
        }

        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [file]);
        await client.query("COMMIT");
        log(`Đã áp dụng migration: ${file}`);
        ran.push(file);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        const pgCode = (error as { code?: string })?.code;
        const msg = error instanceof Error ? error.message : String(error);
        if (options.continueOnError) {
          if (pgCode === "42P07" || pgCode === "42710") {
            await client
              .query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [file])
              .catch(() => undefined);
            warn(`Ghi nhận migration ${file} đã tồn tại trước đó trên CSDL (${msg})`);
          } else {
            warn(`Tạm bỏ qua migration ${file} trên production: ${msg}`);
          }
          continue;
        }
        throw new Error(`Migration ${file} thất bại: ${msg}`);
      }
    }
  } finally {
    client.release();
  }
  return ran;
}
