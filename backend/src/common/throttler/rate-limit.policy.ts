import { ThrottlerException } from "@nestjs/throttler";

const ONE_SECOND_MS = 1_000;
const ONE_MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

export const THROTTLER_BURST_TTL_MS = 10 * ONE_SECOND_MS;
export const THROTTLER_DEFAULT_TTL_MS = ONE_MINUTE_MS;
export const THROTTLER_WRITE_TTL_MS = ONE_MINUTE_MS;

const TEST_RELAXED_LIMIT = 10_000;

/**
 * Đánh giá giới hạn tại thời điểm nhận request thay vì lúc nạp module:
 * - Khi chạy bộ kiểm thử tích hợp thông thường (`NODE_ENV=test`), tự nới rộng để không cản trở luồng nghiệp vụ.
 * - Khi bật `RATE_LIMIT_ENFORCE=true` (hoặc trên môi trường `development` / `production`), áp dụng đúng ngưỡng bảo vệ thực tế.
 */
export function resolveRateLimit(productionLimit: number): number {
  if (process.env.NODE_ENV === "test" && process.env.RATE_LIMIT_ENFORCE !== "true") {
    return TEST_RELAXED_LIMIT;
  }
  return productionLimit;
}

function tier(limit: number, ttl: number) {
  return {
    default: {
      limit: () => resolveRateLimit(limit),
      ttl,
    },
  };
}

/**
 * Ma trận giới hạn tần suất phân tầng toàn hệ thống PUC:
 * kết hợp đồng thời với 2 lớp bảo vệ toàn cục (`burst`: chống dồn dập 10 giây, `write`: chống ghi rác 60 giây).
 */
export const RateLimitTier = {
  /** Đăng nhập mật khẩu / Google OAuth: 20 lần / 15 phút mỗi IP. */
  AUTH_LOGIN: tier(20, FIFTEEN_MINUTES_MS),
  /** Xác thực mã OTP 2FA: 12 lần / 15 phút. */
  AUTH_OTP: tier(12, FIFTEEN_MINUTES_MS),
  /** Đăng ký tài khoản mới: 5 lần / 60 phút mỗi IP. */
  AUTH_REGISTER: tier(5, ONE_HOUR_MS),
  /** Quên mật khẩu / đối chiếu CCCD: 8 lần / 15 phút mỗi IP. */
  AUTH_FORGOT_PASSWORD: tier(8, FIFTEEN_MINUTES_MS),
  /** Đổi mật khẩu / thiết lập hoặc tắt 2FA: 10 lần / 15 phút. */
  AUTH_SENSITIVE_ACCOUNT: tier(10, FIFTEEN_MINUTES_MS),
  /** Làm mới phiên / đăng xuất: 30 lần / phút mỗi IP. */
  AUTH_SESSION: tier(30, ONE_MINUTE_MS),

  /** Dữ liệu trang giới thiệu công khai, danh mục, danh sách thôn, cấu hình OAuth, health check: 60 lần / phút mỗi IP. */
  PUBLIC_READ: tier(60, ONE_MINUTE_MS),
  /** Đọc bài viết bản tin công khai: 90 lần / phút mỗi IP. */
  PUBLIC_ARTICLE: tier(90, ONE_MINUTE_MS),
  /** Tra cứu hồ sơ QR công khai (chống quét dò token ngẫu nhiên): 30 lần / phút mỗi IP. */
  PUBLIC_TRACE: tier(30, ONE_MINUTE_MS),
  /** Tra cứu QR nội bộ đã xác thực (cán bộ / đối tác quét tại kho): 60 lần / phút mỗi tài khoản. */
  AUTH_TRACE: tier(60, ONE_MINUTE_MS),
  /** Đối chứng tọa độ GPS thực địa: 10 lần / phút. */
  GPS_VERIFY: tier(10, ONE_MINUTE_MS),

  /** Tải tệp minh chứng lên máy chủ (`POST /api/uploads`): 30 tệp / phút mỗi tài khoản. */
  UPLOAD_WRITE: tier(30, ONE_MINUTE_MS),
  /** Xem tệp nội bộ đã đăng nhập (`GET /api/uploads/:id`): 180 lượt / phút mỗi tài khoản. */
  MEDIA_READ: tier(180, ONE_MINUTE_MS),
  /** Xem tệp công khai qua token (`GET /api/public/files/:token`): 120 lượt / phút mỗi IP. */
  PUBLIC_MEDIA_READ: tier(120, ONE_MINUTE_MS),

  /** Nhập dữ liệu hàng loạt (GeoJSON địa chính, danh sách hộ, phát cảnh báo toàn hệ thống): 10 lần / phút. */
  BULK_MUTATION: tier(10, ONE_MINUTE_MS),
  /** Cấp hoặc đặt lại tài khoản hộ dân: 20 lần / phút. */
  ACCOUNT_ISSUE: tier(20, ONE_MINUTE_MS),
  /** Xuất báo cáo CSV / JSON tổng hợp: 20 lần / phút. */
  REPORT_EXPORT: tier(20, ONE_MINUTE_MS),
  /** Quét toàn bộ lộ trình chăm sóc để sinh cảnh báo / vi phạm: 4 lần / phút. */
  PROTOCOL_SCAN: tier(4, ONE_MINUTE_MS),
} as const;

export function formatRetryAfterMessage(retryAfterSeconds: number): string {
  const safeSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  if (safeSeconds >= 60) {
    const minutes = Math.ceil(safeSeconds / 60);
    return `Thao tác quá nhanh. Vui lòng thử lại sau khoảng ${minutes} phút.`;
  }
  return `Thao tác quá nhanh. Vui lòng thử lại sau ${safeSeconds} giây.`;
}

export class RateLimitException extends ThrottlerException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, customMessage?: string) {
    const safeSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
    super(customMessage ?? formatRetryAfterMessage(safeSeconds));
    this.retryAfterSeconds = safeSeconds;
  }
}
