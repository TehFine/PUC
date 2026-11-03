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
    // Mở sẵn thêm vài kết nối (song song) để các request đầu tiên chạy truy vấn song song
    // không phải chờ bắt tay TLS với CSDL từ xa. Lỗi ở bước làm nóng không chặn khởi động.
    await Promise.all(Array.from({ length: 3 }, () => this.pool.query("SELECT 1"))).catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
