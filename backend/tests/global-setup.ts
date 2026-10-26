import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { migrate } from "../src/database/migrate";
import { seedDatabase } from "../src/database/seed";
import { TEST_DB_PORT, TEST_PASSWORD } from "./constants";

/** Khởi động PostgreSQL thật (nhúng), chạy migration và seed trước khi test. */
export default async function globalSetup() {
  const dataDir = mkdtempSync(join(tmpdir(), "htx-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: TEST_DB_PORT,
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("htx_test");

  const url = `postgres://postgres:postgres@localhost:${TEST_DB_PORT}/htx_test`;
  const pool = new Pool({ connectionString: url });
  try {
    const postgis = await pool.query("SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'");
    const hasPostgis = (postgis.rowCount ?? 0) > 0;
    // Bản PostgreSQL nhúng không có PostGIS: bỏ qua migration bản đồ (các route thửa đất không được test dữ liệu).
    await migrate(pool, { skip: (name) => !hasPostgis && name === "002_plots.sql" });
    await seedDatabase(pool, { password: TEST_PASSWORD, withPlots: hasPostgis });
  } finally {
    await pool.end();
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = url;
  process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret-1234";
  process.env.CORS_ORIGIN = "http://localhost:3000";

  (globalThis as { __HTX_PG__?: { pg: EmbeddedPostgres; dataDir: string } }).__HTX_PG__ = { pg, dataDir };
}
