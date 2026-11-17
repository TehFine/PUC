import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";

export interface StoredIdempotentResponse {
  method: string;
  path: string;
  statusCode: number;
  body: unknown;
  /** SHA-256 (hex) dấu vân tay nội dung yêu cầu gốc; null với bản ghi cũ trước khi có cột này. */
  requestHash: string | null;
  /** Phản hồi gốc vượt trần dung lượng nên không lưu nội dung, chỉ lưu trạng thái đã xử lý. */
  bodyOmitted: boolean;
}

/** Trần dung lượng phản hồi lưu để phát lại (byte UTF-8 của JSON); vượt trần chỉ lưu trạng thái, không lưu nội dung. */
export const MAX_STORED_RESPONSE_BYTES = 64 * 1024;
const BODY_OMITTED_MARKER = "__pucIdempotencyBodyOmitted";

const RETENTION_SQL_INTERVAL = "48 hours";
const CLEANUP_INTERVAL_MS = 30 * 60_000;

@Injectable()
export class IdempotencyService implements OnModuleInit, OnApplicationShutdown {
  private readonly inflightKeys = new Set<string>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema().catch(() => undefined);
    this.cleanupTimer = setInterval(() => {
      void this.purgeExpired().catch(() => undefined);
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.inflightKeys.clear();
  }

  private async ensureSchema(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS api_idempotency_keys (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idem_key VARCHAR(80) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(200) NOT NULL,
        status_code INTEGER NOT NULL,
        response_body JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, idem_key)
      );
      CREATE INDEX IF NOT EXISTS idx_api_idempotency_created_at
        ON api_idempotency_keys (created_at);
      ALTER TABLE api_idempotency_keys ADD COLUMN IF NOT EXISTS request_hash CHAR(64);
    `);
  }

  tryAcquireInflight(userId: number, idemKey: string): boolean {
    const composite = `${userId}:${idemKey}`;
    if (this.inflightKeys.has(composite)) return false;
    this.inflightKeys.add(composite);
    return true;
  }

  releaseInflight(userId: number, idemKey: string): void {
    this.inflightKeys.delete(`${userId}:${idemKey}`);
  }

  async findCompleted(userId: number, idemKey: string): Promise<StoredIdempotentResponse | null> {
    const { rows } = await this.db.query<{
      method: string;
      path: string;
      status_code: number;
      response_body: unknown;
      request_hash: string | null;
    }>(
      `SELECT method, path, status_code, response_body, request_hash
       FROM api_idempotency_keys
       WHERE user_id = $1 AND idem_key = $2 AND created_at > now() - interval '${RETENTION_SQL_INTERVAL}'
       LIMIT 1`,
      [userId, idemKey],
    );
    const row = rows[0];
    if (!row) return null;
    const bodyOmitted =
      row.response_body !== null &&
      typeof row.response_body === "object" &&
      (row.response_body as Record<string, unknown>)[BODY_OMITTED_MARKER] === true;
    return {
      method: row.method,
      path: row.path,
      statusCode: Number(row.status_code),
      body: bodyOmitted ? null : row.response_body,
      requestHash: row.request_hash ? row.request_hash.trim() : null,
      bodyOmitted,
    };
  }

  async saveCompleted(
    userId: number,
    idemKey: string,
    method: string,
    path: string,
    statusCode: number,
    body: unknown,
    requestHash: string | null = null,
  ): Promise<void> {
    if (statusCode < 200 || statusCode >= 300) return;
    let serialized = body === undefined ? null : JSON.stringify(body);
    if (serialized !== null && Buffer.byteLength(serialized, "utf8") > MAX_STORED_RESPONSE_BYTES) {
      // Không lưu phản hồi quá lớn (chống phình bảng); vẫn giữ khóa để lần gửi lại không tạo bản ghi trùng.
      serialized = JSON.stringify({ [BODY_OMITTED_MARKER]: true });
    }
    await this.db.query(
      `INSERT INTO api_idempotency_keys (user_id, idem_key, method, path, status_code, response_body, request_hash)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (user_id, idem_key)
       DO UPDATE SET status_code = EXCLUDED.status_code,
                     response_body = EXCLUDED.response_body,
                     request_hash = EXCLUDED.request_hash,
                     created_at = now()`,
      [userId, idemKey, method.slice(0, 10), path.slice(0, 200), statusCode, serialized, requestHash],
    );
  }

  async purgeExpired(): Promise<void> {
    await this.db.query(
      `DELETE FROM api_idempotency_keys WHERE created_at <= now() - interval '${RETENTION_SQL_INTERVAL}'`,
    );
  }
}

