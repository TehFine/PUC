import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { migrate } from "../src/database/migrate";
import { seedDatabase } from "../src/database/seed";

/**
 * `npm run dev:local`: chạy toàn bộ backend mà KHÔNG cần Docker hay cài PostgreSQL.
 * Dùng PostgreSQL nhúng (dữ liệu lưu ở backend/.local-db, giữ nguyên giữa các lần chạy).
 * Giới hạn: bản nhúng không có PostGIS nên các API bản đồ /api/plots* không lưu được dữ liệu.
 */
const PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);
const DB_NAME = "htx";
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Htx@12345";
const dataDir = join(__dirname, "..", ".local-db");

async function main() {
  const fresh = !existsSync(join(dataDir, "PG_VERSION"));
  mkdirSync(dataDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
    onLog: () => undefined,
    onError: () => undefined,
  });

  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(DB_NAME);

  const url = `postgres://postgres:postgres@localhost:${PORT}/${DB_NAME}`;
  const pool = new Pool({ connectionString: url });
  try {
    const postgis = await pool.query("SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'");
    const hasPostgis = (postgis.rowCount ?? 0) > 0;
    if (!hasPostgis) console.log("⚠ PostgreSQL nhúng không có PostGIS: bỏ qua migration bản đồ (002_plots.sql).");
    const ran = await migrate(pool, {
      skip: (name) => !hasPostgis && name === "002_plots.sql",
      log: (message) => console.log(message),
    });
    if (ran.length === 0) console.log("Không có migration mới.");
    const seeded = await seedDatabase(pool, { password: SEED_PASSWORD, withPlots: hasPostgis, log: (m) => console.log(m) });
    if (seeded) console.log(`Đã tạo tài khoản mẫu (mật khẩu: ${SEED_PASSWORD}).`);
  } finally {
    await pool.end();
  }

  console.log(`PostgreSQL nhúng đang chạy ở cổng ${PORT}. Khởi động API...`);
  const nest = spawn("npx", ["nest", "start", "--watch"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL_LOCAL ?? url,
      DATABASE_SSL: "false",
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "dev-local-secret-dev-local-secret-dev-local-secret",
    },
  });

  let stopping = false;
  const shutdown = async (code: number) => {
    if (stopping) return;
    stopping = true;
    nest.kill("SIGTERM");
    await pg.stop().catch(() => undefined);
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  nest.on("exit", (code) => void shutdown(code ?? 0));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
