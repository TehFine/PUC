import { Pool, types } from "pg";

// Trả về kiểu JS tự nhiên thay vì chuỗi: BIGINT/NUMERIC -> number, DATE -> 'YYYY-MM-DD'.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number.parseFloat(value));
types.setTypeParser(1082, (value) => value);

export function createPool(options: { url: string; ssl: boolean }): Pool {
  const pool = new Pool({
    connectionString: options.url,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    // CSDL từ xa (Supabase): mở kết nối mới mất ~1,5–2 giây (bắt tay TLS) so với ~0,2 giây khi dùng lại.
    // Giữ kết nối rảnh lâu hơn (10 phút thay vì 30 giây) và bật TCP keep-alive để người dùng
    // không phải chờ mở lại kết nối mỗi khi quay lại trang sau một lúc không thao tác.
    idleTimeoutMillis: 10 * 60_000,
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
