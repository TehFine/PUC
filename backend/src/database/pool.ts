import { Pool, types } from "pg";

// Trả về kiểu JS tự nhiên thay vì chuỗi: BIGINT/NUMERIC -> number, DATE -> 'YYYY-MM-DD'.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number.parseFloat(value));
types.setTypeParser(1082, (value) => value);

export function createPool(options: { url: string; ssl: boolean }): Pool {
  const poolMax = Number(process.env.DB_POOL_MAX) || 4;
  const pool = new Pool({
    connectionString: options.url,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    // Giới hạn tối đa 4 kết nối/tiến trình để khi chạy song song cả Render lẫn localhost
    // (hoặc khi nhiều truy vấn Promise.all chạy cùng lúc) không bao giờ vượt ngưỡng
    // pool_size: 15 của Supabase Session Mode (EMAXCONNSESSION). pg.Pool sẽ tự xếp hàng
    // các truy vấn trên các kết nối sẵn có.
    max: poolMax,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Không treo request vô thời hạn khi CSDL không phản hồi.
    connectionTimeoutMillis: 15_000,
  });
  // Kết nối rảnh bị máy chủ CSDL ngắt (khởi động lại, hết hạn phiên...) phát sự kiện 'error' trên pool;
  // thiếu listener thì Node sẽ dừng cả tiến trình. pg tự loại kết nối hỏng và mở kết nối mới ở lần sau.
  pool.on("error", (err) => {
    console.error(`[database] Kết nối rảnh bị ngắt: ${err.message}`);
  });
  return pool;
}
