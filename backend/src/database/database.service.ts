import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import type { AppConfig } from "../config/configuration";
import { migrate } from "./migrate";
import { createPool } from "./pool";
import { seedSupplyChain } from "./seed-supply-chain";

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly pool: Pool;
  private readonly isProduction: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    this.pool = createPool(config.get("database", { infer: true }));
    this.isProduction = config.get("isProduction", { infer: true });
  }

  async query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
    try {
      return await this.pool.query<R>(text, params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("EMAXCONNSESSION") || msg.includes("max clients reached")) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return this.pool.query<R>(text, params);
      }
      throw err;
    }
  }

  /** Dừng khởi động ngay nếu không kết nối được CSDL; tự động chạy migration còn thiếu trên môi trường dev. */
  async onModuleInit(): Promise<void> {
    await this.pool.query("SELECT 1");
    if (!this.isProduction && process.env.NODE_ENV !== "test") {
      const postgis = await this.pool.query("SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'");
      const hasPostgis = (postgis.rowCount ?? 0) > 0;
      const ran = await migrate(this.pool, {
        skip: (name) => !hasPostgis && name === "002_plots.sql",
      });
      if (ran.length > 0) {
        await seedSupplyChain(this.pool).catch(() => undefined);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
