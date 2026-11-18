import "reflect-metadata";
import "dotenv/config";
import { loadConfig } from "../config/configuration";
import { importFromSource } from "./import-from-source";
import { migrate } from "./migrate";
import { createPool } from "./pool";
import { seedDatabase } from "./seed";

const log = (message: string) => console.log(message);

/** CLI: `tsx src/database/cli.ts <migrate|seed|import>` (hoặc `node dist/database/cli.js` sau khi build). */
async function main() {
  const command = process.argv[2];
  const config = loadConfig();
  const pool = createPool(config.database);

  try {
    if (command === "migrate") {
      const ran = await migrate(pool, { log });
      if (ran.length === 0) log("Không có migration mới.");
    } else if (command === "import") {
      const sourceUrl = (process.env.SOURCE_DATABASE_URL ?? process.argv[3] ?? "").trim();
      if (!sourceUrl) {
        throw new Error(
          "Cần truyền biến môi trường SOURCE_DATABASE_URL (chuỗi kết nối Supabase nguồn) để chạy lệnh import.",
        );
      }
      if (sourceUrl === config.database.url) {
        throw new Error("SOURCE_DATABASE_URL không được trùng với DATABASE_URL đích.");
      }
      const postgis = await pool.query(
        "SELECT 1 FROM pg_extension WHERE extname = 'postgis' UNION ALL SELECT 1 FROM pg_available_extensions WHERE name = 'postgis' LIMIT 1",
      );
      const hasPostgis = (postgis.rowCount ?? 0) > 0;
      await migrate(pool, { skip: (name) => !hasPostgis && name === "002_plots.sql", log });

      const sourcePool = createPool({
        url: sourceUrl,
        ssl: !sourceUrl.includes("localhost") && !sourceUrl.includes("127.0.0.1"),
        sslRejectUnauthorized: false,
      });
      try {
        await importFromSource(sourcePool, pool, {
          log,
          skipTables: hasPostgis ? undefined : new Set(["plots", "plot_measurements"]),
        });
      } finally {
        await sourcePool.end();
      }
    } else if (command === "seed") {
      if (config.isProduction) throw new Error("Không được seed dữ liệu mẫu trên môi trường production.");
      const dbHost = (() => {
        try {
          return new URL(config.database.url).hostname.toLowerCase();
        } catch {
          return "";
        }
      })();
      const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1" || dbHost === "::1" || dbHost === "[::1]";
      if (!isLocalDb && process.env.ALLOW_REMOTE_SEED !== "true") {
        throw new Error(
          `Từ chối chạy seed trên máy chủ CSDL từ xa (${dbHost || "unknown"}). Nếu thực sự là CSDL thử nghiệm, đặt ALLOW_REMOTE_SEED=true.`,
        );
      }
      if (!config.seedPassword) {
        throw new Error("Cần đặt SEED_PASSWORD (tối thiểu 8 ký tự) để tạo mật khẩu cho tài khoản mẫu.");
      }
      const hasPostgis = (await pool.query("SELECT to_regclass('plots') AS t")).rows[0].t !== null;
      await seedDatabase(pool, { password: config.seedPassword, withPlots: hasPostgis, log });
    } else {
      console.error("Cách dùng: tsx src/database/cli.ts <migrate|seed|import>");
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
