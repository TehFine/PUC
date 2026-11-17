import { readFileSync } from "node:fs";
import { Pool, types } from "pg";

// Trả về kiểu JS tự nhiên thay vì chuỗi: BIGINT/NUMERIC -> number, DATE -> 'YYYY-MM-DD'.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number.parseFloat(value));
types.setTypeParser(1082, (value) => value);

interface SplitSslParams {
  connectionString: string;
  sslmode?: string;
  sslrootcert?: string;
}

/**
 * Tách các tham số SSL kiểu libpq khỏi DATABASE_URL (pg sẽ ghi đè cấu hình `ssl` tường minh nếu để lại),
 * nhưng vẫn giữ lại `sslmode` và `sslrootcert` để không âm thầm hạ cấp `verify-full` / `verify-ca`.
 */
function splitSslParams(connUrl: string): SplitSslParams {
  const qIdx = connUrl.indexOf("?");
  if (qIdx === -1) return { connectionString: connUrl };
  const base = connUrl.slice(0, qIdx);
  const kept: string[] = [];
  let sslmode: string | undefined;
  let sslrootcert: string | undefined;
  for (const kv of connUrl.slice(qIdx + 1).split("&")) {
    if (kv.length === 0) continue;
    const eq = kv.indexOf("=");
    const key = (eq === -1 ? kv : kv.slice(0, eq)).toLowerCase();
    const rawValue = eq === -1 ? "" : kv.slice(eq + 1);
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      value = rawValue;
    }
    if (key === "sslmode") sslmode = value.toLowerCase();
    else if (key === "sslrootcert") sslrootcert = value;
    else if (key === "sslcert" || key === "sslkey" || key === "uselibpqcompat") continue;
    else kept.push(kv);
  }
  return { connectionString: kept.length > 0 ? `${base}?${kept.join("&")}` : base, sslmode, sslrootcert };
}

export function createPool(options: {
  url: string;
  ssl: boolean;
  sslRejectUnauthorized?: boolean;
  sslCa?: string;
}): Pool {
  const poolMax = Number(process.env.DB_POOL_MAX) || 4;
  const split: SplitSslParams = options.ssl ? splitSslParams(options.url) : { connectionString: options.url };

  let ca = options.sslCa;
  if (!ca && split.sslrootcert && split.sslrootcert !== "system") {
    try {
      ca = readFileSync(split.sslrootcert, "utf8");
    } catch (err) {
      throw new Error(
        `Không đọc được tệp chứng chỉ CA (sslrootcert) của DATABASE_URL: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const verifyRequestedByUrl = split.sslmode === "verify-full" || split.sslmode === "verify-ca";
  const strictSsl =
    verifyRequestedByUrl ||
    (options.sslRejectUnauthorized ??
      (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED
        ? process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
        : process.env.NODE_ENV === "production" || Boolean(ca)));

  const pool = new Pool({
    connectionString: split.connectionString,
    ssl: options.ssl
      ? {
          rejectUnauthorized: strictSsl,
          ...(ca ? { ca } : {}),
          // verify-ca theo chuẩn libpq: xác minh chuỗi CA nhưng không đối chiếu tên máy chủ.
          ...(split.sslmode === "verify-ca" ? { checkServerIdentity: () => undefined } : {}),
        }
      : undefined,
    // Giới hạn tối đa 4 kết nối/tiến trình để khi chạy song song cả Render lẫn localhost
    // (hoặc khi nhiều truy vấn Promise.all chạy cùng lúc) không bao giờ vượt ngưỡng
    // pool_size: 15 của Supabase Session Mode (EMAXCONNSESSION). pg.Pool sẽ tự xếp hàng
    // các truy vấn trên các kết nối sẵn có.
    max: poolMax,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Không treo request hoặc giữ kết nối vô thời hạn khi CSDL không phản hồi / truy vấn bị khóa.
    connectionTimeoutMillis: 15_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  });
  // Kết nối rảnh bị máy chủ CSDL ngắt (khởi động lại, hết hạn phiên...) phát sự kiện 'error' trên pool;
  // thiếu listener thì Node sẽ dừng cả tiến trình. pg tự loại kết nối hỏng và mở kết nối mới ở lần sau.
  pool.on("error", (err) => {
    console.error(`[database] Kết nối rảnh bị ngắt: ${err.message}`);
  });
  return pool;
}
