import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "db", "migrations");
const MIGRATION_ADVISORY_LOCK_ID = 88421017;

export interface MigrateOptions {
  /** Bỏ qua migration có tên khớp (ví dụ khi môi trường không có PostGIS). */
  skip?: (name: string) => boolean;
  log?: (message: string) => void;
}

/** Chạy tuần tự các file db/migrations/*.sql chưa áp dụng, có khóa tư vấn chống xung đột khi nhiều tiến trình cùng khởi động. */
export async function migrate(pool: Pool, options: MigrateOptions = {}): Promise<string[]> {
  const log = options.log ?? (() => undefined);
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
  const hasPending = files.some((file) => !initialApplied.has(file) && !options.skip?.(file));
  if (!hasPending) {
    return [];
  }

  const client = await pool.connect();
  const ran: string[] = [];
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_ID]);
    locked = true;

    const applied = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((row) => row.name),
    );

    for (const file of files) {
      if (applied.has(file) || options.skip?.(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        log(`Đã áp dụng migration: ${file}`);
        ran.push(file);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(`Migration ${file} thất bại: ${(error as Error).message}`);
      }
    }
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_ID]).catch(() => undefined);
    }
    client.release();
  }
  return ran;
}
