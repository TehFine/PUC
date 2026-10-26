import { Pool, types } from "pg";

// Trả về kiểu JS tự nhiên thay vì chuỗi: BIGINT/NUMERIC -> number, DATE -> 'YYYY-MM-DD'.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number.parseFloat(value));
types.setTypeParser(1082, (value) => value);

export function createPool(options: { url: string; ssl: boolean }): Pool {
  return new Pool({
    connectionString: options.url,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}
