import { Injectable, Logger, OnApplicationShutdown, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from "pg";
import { AppCacheService, type CacheTag } from "../common/cache/app-cache.service";
import type { AppConfig } from "../config/configuration";
import { migrate } from "./migrate";
import { createPool } from "./pool";
import { seedSupplyChain } from "./seed-supply-chain";

const WRAPPED_CLIENT = Symbol("puc.cacheWrappedClient");
const TX_DIRTY_TAGS = Symbol("puc.txDirtyTags");

type InstrumentedClient = PoolClient & {
  [WRAPPED_CLIENT]?: boolean;
  [TX_DIRTY_TAGS]?: Set<CacheTag>;
};

function extractSqlText(queryTextOrConfig: unknown): string | null {
  if (typeof queryTextOrConfig === "string") return queryTextOrConfig;
  if (queryTextOrConfig && typeof queryTextOrConfig === "object" && "text" in queryTextOrConfig) {
    const t = (queryTextOrConfig as QueryConfig).text;
    return typeof t === "string" ? t : null;
  }
  return null;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly pool: Pool;
  private readonly isProduction: boolean;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    config: ConfigService<AppConfig, true>,
    @Optional() readonly cache?: AppCacheService,
  ) {
    this.pool = createPool(config.get("database", { infer: true }));
    this.isProduction = config.get("isProduction", { infer: true });
    this.instrumentPoolForCacheInvalidation();
  }

  private instrumentPoolForCacheInvalidation(): void {
    if (!this.cache) return;
    const cache = this.cache;

    const origPoolQuery = this.pool.query.bind(this.pool) as (...args: unknown[]) => unknown;
    (this.pool as unknown as { query: (...args: unknown[]) => unknown }).query = (...args: unknown[]) => {
      const hasCallback = typeof args[args.length - 1] === "function";
      const sql = extractSqlText(args[0]);
      if (hasCallback || !sql) {
        return origPoolQuery(...args);
      }
      const res = origPoolQuery(...args) as Promise<unknown>;
      return res.then((out) => {
        cache.onSqlMutation(sql);
        return out;
      });
    };

    const origConnect = this.pool.connect.bind(this.pool) as (...args: unknown[]) => unknown;
    (this.pool as unknown as { connect: (...args: unknown[]) => unknown }).connect = (...args: unknown[]) => {
      if (args.length > 0 && typeof args[0] === "function") {
        return origConnect(...args);
      }
      return (origConnect() as Promise<InstrumentedClient>).then((client) => {
        if (!client[WRAPPED_CLIENT]) {
          client[WRAPPED_CLIENT] = true;
          const origClientQuery = client.query.bind(client) as (...qArgs: unknown[]) => unknown;
          (client as unknown as { query: (...qArgs: unknown[]) => unknown }).query = (...qArgs: unknown[]) => {
            const hasCallback = typeof qArgs[qArgs.length - 1] === "function";
            const sql = extractSqlText(qArgs[0]);
            if (hasCallback || !sql) {
              return origClientQuery(...qArgs);
            }
            const trimmedUpper = sql.trimStart().slice(0, 12).toUpperCase();
            if (trimmedUpper.startsWith("BEGIN")) {
              client[TX_DIRTY_TAGS] = new Set<CacheTag>();
            }
            const p = origClientQuery(...qArgs) as Promise<unknown>;
            return p.then((out) => {
              if (trimmedUpper.startsWith("COMMIT")) {
                if (client[TX_DIRTY_TAGS] && client[TX_DIRTY_TAGS].size > 0) {
                  cache.invalidateTags(client[TX_DIRTY_TAGS]);
                  client[TX_DIRTY_TAGS].clear();
                }
              } else if (trimmedUpper.startsWith("ROLLBACK")) {
                client[TX_DIRTY_TAGS]?.clear();
              } else {
                const tags = cache.onSqlMutation(sql);
                if (tags.length > 0 && client[TX_DIRTY_TAGS]) {
                  for (const t of tags) client[TX_DIRTY_TAGS].add(t);
                }
              }
              return out;
            });
          };
        }
        return client;
      });
    };
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

  /**
   * Dừng khởi động ngay nếu không kết nối được CSDL; tự động chạy migration lược đồ còn thiếu
   * (kể cả trên Render Free Tier nơi không có SSH Shell chạy tay `db:migrate`), nhưng tuyệt đối
   * không tự seed dữ liệu mẫu trên môi trường production.
   */
  async onModuleInit(): Promise<void> {
    await this.pool.query("SELECT 1");
    if (process.env.NODE_ENV !== "test" && process.env.AUTO_MIGRATE !== "false") {
      try {
        const postgis = await this.pool.query(
          "SELECT 1 FROM pg_extension WHERE extname = 'postgis' UNION ALL SELECT 1 FROM pg_available_extensions WHERE name = 'postgis' LIMIT 1",
        );
        const hasPostgis = (postgis.rowCount ?? 0) > 0;
        const ran = await migrate(this.pool, {
          skip: (name) => !hasPostgis && name === "002_plots.sql",
          log: (msg) => this.logger.log(msg),
          // Trên production, migration lỗi được báo ở mức error (không ghi nhận đã áp dụng, tạm dừng các file sau).
          warn: (msg) => (this.isProduction ? this.logger.error(msg) : this.logger.warn(msg)),
          continueOnError: this.isProduction,
        });
        if (!this.isProduction && ran.length > 0) {
          await seedSupplyChain(this.pool).catch(() => undefined);
        }
      } catch (err) {
        if (!this.isProduction) throw err;
        this.logger.error(
          `Lỗi khi chạy tự động migration trên production: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
