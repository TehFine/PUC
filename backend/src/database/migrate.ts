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
  /**
   * Trên production: không dừng cứng toàn server khi một migration lỗi. File lỗi không bao giờ được ghi nhận
   * là đã áp dụng và các file phía sau bị tạm dừng cho tới khi xử lý xong.
   */
  continueOnError?: boolean;
  /** Thư mục chứa các file .sql (mặc định db/migrations); dùng cho kiểm thử. */
  dir?: string;
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
  const migrationsDir = options.dir ?? MIGRATIONS_DIR;
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  const pendingFiles = files.filter((file) => !initialApplied.has(file) && !options.skip?.(file));
  if (pendingFiles.length === 0) {
    return [];
  }

  const client = await pool.connect();
  const ran: string[] = [];
  try {
    for (const file of pendingFiles) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
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
        const msg = error instanceof Error ? error.message : String(error);
        if (options.continueOnError) {
          // Mỗi file chạy trong 1 giao dịch nên lỗi giữa chừng đã được ROLLBACK toàn bộ: tuyệt đối không ghi nhận
          // file vào schema_migrations (kể cả lỗi trùng đối tượng 42P07/42710), vì như vậy phần còn lại của file
          // sẽ không bao giờ được áp dụng. Dừng luôn các file sau (có thể phụ thuộc file này) và giữ server chạy
          // để quản trị viên xử lý thủ công rồi khởi động lại.
          const remaining = pendingFiles.slice(pendingFiles.indexOf(file) + 1);
          warn(
            `Migration ${file} thất bại trên production và chưa được ghi nhận là đã áp dụng: ${msg}. ` +
              (remaining.length > 0 ? `Tạm dừng ${remaining.length} migration phía sau: ${remaining.join(", ")}.` : ""),
          );
          break;
        }
        throw new Error(`Migration ${file} thất bại: ${msg}`);
      }
    }
  } finally {
    client.release();
  }
  return ran;
}
