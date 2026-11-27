import { plainToInstance, Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min, MinLength, validateSync } from "class-validator";

enum NodeEnv {
  Development = "development",
  Test = "test",
  Production = "production",
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT = 4000;

  @IsString()
  CORS_ORIGIN = "http://localhost:3000";

  @IsString()
  @MinLength(1, { message: "DATABASE_URL là bắt buộc" })
  DATABASE_URL!: string;

  @IsOptional()
  @IsIn(["true", "false"])
  DATABASE_SSL?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  DATABASE_SSL_REJECT_UNAUTHORIZED?: string;

  @IsOptional()
  @IsString()
  DATABASE_CA_CERT?: string;

  @IsString()
  @MinLength(32, { message: "JWT_ACCESS_SECRET cần tối thiểu 32 ký tự" })
  JWT_ACCESS_SECRET!: string;

  /** Khóa gốc riêng để mã hóa khóa TOTP 2 lớp (AES-256-GCM) và làm pepper HMAC cho mã dự phòng. */
  @IsOptional()
  @IsString()
  @MinLength(32, { message: "TOTP_ENCRYPTION_KEY cần tối thiểu 32 ký tự" })
  TOTP_ENCRYPTION_KEY?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ACCESS_TOKEN_TTL_MIN = 15;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS = 7;

  @IsOptional()
  @IsIn(["true", "false"])
  COOKIE_SECURE?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  SEED_PASSWORD?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  ALLOW_DEV_DEMO_LOGIN?: string;

  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;

  @IsString()
  UPLOAD_DIR = "uploads";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  UPLOAD_MAX_MB = 8;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_BURST_MAX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_DEFAULT_MAX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_WRITE_MAX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  RATE_LIMIT_MAX_KEYS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  CACHE_MAX_KEYS?: number;
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  trustProxy: string[] | boolean | number;
  database: { url: string; ssl: boolean; sslRejectUnauthorized: boolean; sslCa?: string };
  jwt: { accessSecret: string; accessTtlMin: number; refreshTtlDays: number };
  /** Khóa gốc mã hóa bí mật 2 lớp; để trống thì dẫn xuất HKDF từ JWT_ACCESS_SECRET với nhãn riêng. */
  totpEncryptionKey?: string;
  cookieSecure: boolean;
  seedPassword?: string;
  googleClientId?: string;
  allowDevDemoLogin: boolean;
  uploads: { dir: string; maxBytes: number };
  rateLimit: {
    burstMax: number;
    defaultMax: number;
    writeMax: number;
    maxKeys: number;
  };
  cache: {
    maxKeys: number;
  };
}

/** Chuỗi mẫu của môi trường dev/test tuyệt đối không được xuất hiện trong khóa bí mật hay DATABASE_URL trên production. */
const WEAK_SECRET_DENYLIST = /change-?me|example|htx_dev_password|dev-local-secret|test-access-secret/i;
/** Mật khẩu CSDL mẫu trong docker-compose và .env.example. */
const DEV_DATABASE_PASSWORD_RE = /htx_dev_password|change-?me/i;

function isWeakSecret(secret: string): boolean {
  return WEAK_SECRET_DENYLIST.test(secret) || new Set(secret).size < 10;
}

/** Đọc và kiểm tra biến môi trường; ném lỗi liệt kê mọi biến sai để dừng khởi động sớm. */
export function loadConfig(raw: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = plainToInstance(EnvironmentVariables, raw);
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .flatMap((error) => Object.values(error.constraints ?? {}).map((message) => `  - ${error.property}: ${message}`))
      .join("\n");
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${details}`);
  }

  const invalid = (detail: string) => new Error(`Cấu hình môi trường không hợp lệ:\n  - ${detail}`);

  const rawOrigins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (rawOrigins.length === 0) {
    throw invalid("CORS_ORIGIN: Phải là danh sách origin http(s) cụ thể, không dùng '*' hoặc 'null'");
  }
  const corsOrigins: string[] = [];
  for (const item of rawOrigins) {
    if (item === "*" || item.toLowerCase() === "null") {
      throw invalid("CORS_ORIGIN: Phải là danh sách origin http(s) cụ thể, không dùng '*' hoặc 'null'");
    }
    let parsed: URL;
    try {
      parsed = new URL(item);
    } catch {
      throw invalid(`CORS_ORIGIN: Origin không hợp lệ (${item})`);
    }
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.origin === "null"
    ) {
      throw invalid(
        "CORS_ORIGIN: Phải là danh sách origin http(s) cụ thể, không chứa thông tin xác thực",
      );
    }
    if (!corsOrigins.includes(parsed.origin)) {
      corsOrigins.push(parsed.origin);
    }
  }

  // Ở môi trường phát triển cục bộ, khi cổng 3000 bận thì `next dev` tự động nhảy sang 3001..3010;
  // bổ sung sẵn dải cổng loopback cục bộ để OriginGuard không chặn nhầm trình duyệt trên máy dev.
  if (
    env.NODE_ENV === NodeEnv.Development &&
    corsOrigins.some((origin) => /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin))
  ) {
    for (let devPort = 3000; devPort <= 3010; devPort += 1) {
      for (const devHost of ["localhost", "127.0.0.1"]) {
        const candidate = `http://${devHost}:${devPort}`;
        if (!corsOrigins.includes(candidate)) {
          corsOrigins.push(candidate);
        }
      }
    }
  }

  const isLocalDb = (() => {
    try {
      const host = new URL(env.DATABASE_URL).hostname.toLowerCase();
      return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "[::1]" ||
        host === "db" ||
        !host.includes(".")
      );
    } catch {
      return false;
    }
  })();

  const isProduction = env.NODE_ENV === NodeEnv.Production;
  const isManagedProxyPlatform =
    raw.RENDER === "true" ||
    Boolean(raw.RENDER_SERVICE_ID || raw.RENDER_EXTERNAL_URL || raw.RAILWAY_ENVIRONMENT || raw.FLY_APP_NAME);
  const rawTrustProxy = env.TRUST_PROXY?.trim();

  if (isProduction) {
    if (isWeakSecret(env.JWT_ACCESS_SECRET)) {
      throw invalid("JWT_ACCESS_SECRET: Không được dùng khóa mẫu hoặc khóa có độ ngẫu nhiên thấp khi NODE_ENV=production");
    }
    if (env.TOTP_ENCRYPTION_KEY !== undefined && isWeakSecret(env.TOTP_ENCRYPTION_KEY)) {
      throw invalid("TOTP_ENCRYPTION_KEY: Không được dùng khóa mẫu hoặc khóa có độ ngẫu nhiên thấp khi NODE_ENV=production");
    }
    if (DEV_DATABASE_PASSWORD_RE.test(env.DATABASE_URL)) {
      throw invalid("DATABASE_URL: Không được dùng mật khẩu CSDL mẫu của môi trường dev khi NODE_ENV=production");
    }
    if (!isLocalDb && env.DATABASE_SSL === "false") {
      throw invalid("DATABASE_SSL: Không được tắt kết nối TLS tới CSDL từ xa khi NODE_ENV=production");
    }
    if (env.ALLOW_DEV_DEMO_LOGIN === "true" && !isManagedProxyPlatform) {
      throw invalid("ALLOW_DEV_DEMO_LOGIN: Không được bật chế độ đăng nhập thử nghiệm khi NODE_ENV=production");
    }
    if (env.COOKIE_SECURE === "false" && !isManagedProxyPlatform) {
      throw invalid("COOKIE_SECURE: Không được tắt cờ Secure của cookie phiên khi NODE_ENV=production");
    }
    if (rawTrustProxy === "true" && !isManagedProxyPlatform) {
      throw invalid(
        "TRUST_PROXY: Không được đặt 'true' mở toàn bộ trên production; hãy chỉ định số bước nhảy (ví dụ '1') hoặc dải IP proxy tin cậy",
      );
    }
  }

  let trustProxy: string[] | boolean | number = isManagedProxyPlatform ? 1 : ["loopback"];
  if (rawTrustProxy) {
    if (rawTrustProxy === "true") trustProxy = isProduction ? 1 : true;
    else if (rawTrustProxy === "false") trustProxy = false;
    else if (/^\d+$/.test(rawTrustProxy)) trustProxy = Number(rawTrustProxy);
    else {
      trustProxy = rawTrustProxy
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  const rawCa = env.DATABASE_CA_CERT?.trim();
  const sslCa = rawCa
    ? rawCa.includes("BEGIN CERTIFICATE")
      ? rawCa.replace(/\\n/g, "\n")
      : Buffer.from(rawCa, "base64").toString("utf8")
    : undefined;
  const sslEnabled = env.DATABASE_SSL !== undefined ? env.DATABASE_SSL === "true" : !isLocalDb;
  // Bật mã hóa TLS cho mọi CSDL đám mây từ xa (Supabase Pooler, Render Postgres, Neon...); chỉ ép đối chiếu CA gốc
  // khi có DATABASE_CA_CERT hoặc khai báo DATABASE_SSL_REJECT_UNAUTHORIZED=true để tránh lỗi SELF_SIGNED_CERT_IN_CHAIN trên pooler.
  const sslRejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED
    ? env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
    : Boolean(sslCa);

  return {
    nodeEnv: env.NODE_ENV,
    isProduction,
    port: env.PORT,
    corsOrigins,
    trustProxy,
    database: {
      url: env.DATABASE_URL,
      ssl: sslEnabled,
      sslRejectUnauthorized,
      sslCa,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtlMin: env.ACCESS_TOKEN_TTL_MIN,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    },
    totpEncryptionKey: env.TOTP_ENCRYPTION_KEY?.trim() || undefined,
    cookieSecure: isProduction ? true : env.COOKIE_SECURE === "true",
    seedPassword: env.SEED_PASSWORD,
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || undefined,
    allowDevDemoLogin: !isProduction && env.ALLOW_DEV_DEMO_LOGIN === "true",
    uploads: { dir: env.UPLOAD_DIR, maxBytes: env.UPLOAD_MAX_MB * 1024 * 1024 },
    rateLimit: {
      burstMax: env.RATE_LIMIT_BURST_MAX ?? 120,
      defaultMax: env.RATE_LIMIT_DEFAULT_MAX ?? 240,
      writeMax: env.RATE_LIMIT_WRITE_MAX ?? 60,
      maxKeys: env.RATE_LIMIT_MAX_KEYS ?? (isManagedProxyPlatform ? 5_000 : 25_000),
    },
    cache: {
      maxKeys: env.CACHE_MAX_KEYS ?? (isManagedProxyPlatform ? 1_000 : 4_000),
    },
  };
}

export const configuration = (): AppConfig => loadConfig();
