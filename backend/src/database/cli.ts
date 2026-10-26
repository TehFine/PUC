import "dotenv/config";
import { loadConfig } from "../config/configuration";
import { migrate } from "./migrate";
import { createPool } from "./pool";
import { seedDatabase } from "./seed";

const log = (message: string) => console.log(message);

/** CLI: `tsx src/database/cli.ts <migrate|seed>` (hoặc `node dist/database/cli.js` sau khi build). */
async function main() {
  const command = process.argv[2];
  const config = loadConfig();
  const pool = createPool(config.database);

  try {
    if (command === "migrate") {
      const ran = await migrate(pool, { log });
      if (ran.length === 0) log("Không có migration mới.");
    } else if (command === "seed") {
      if (config.isProduction) throw new Error("Không được seed dữ liệu mẫu trên môi trường production.");
      if (!config.seedPassword) {
        throw new Error("Cần đặt SEED_PASSWORD (tối thiểu 8 ký tự) để tạo mật khẩu cho tài khoản mẫu.");
      }
      const hasPostgis = (await pool.query("SELECT to_regclass('plots') AS t")).rows[0].t !== null;
      await seedDatabase(pool, { password: config.seedPassword, withPlots: hasPostgis, log });
    } else {
      console.error("Cách dùng: tsx src/database/cli.ts <migrate|seed>");
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
