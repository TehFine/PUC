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

  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params);
  }

  /** Dừng khởi động ngay nếu không kết nối được CSDL. */
  async onModuleInit(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
