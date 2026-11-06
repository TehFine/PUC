import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import type { AppConfig } from "../config/configuration";
import { createPool } from "./pool";

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly pool: Pool;

  constructor(config: ConfigService<AppConfig, true>) {
    this.pool = createPool(config.get("database", { infer: true }));
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

  /** Dừng khởi động ngay nếu không kết nối được CSDL. */
  async onModuleInit(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
