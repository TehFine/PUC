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

  const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (corsOrigins.length === 0 || corsOrigins.some((origin) => origin === "*" || origin === "null" || !/^https?:\/\/[^/\s]+$/i.test(origin))) {
    throw new Error("Cấu hình môi trường không hợp lệ:\n  - CORS_ORIGIN: Phải là danh sách origin http(s) cụ thể, không dùng '*' hoặc 'null'");
  }

  const isProduction = env.NODE_ENV === NodeEnv.Production;
  const rawTrustProxy = env.TRUST_PROXY?.trim();

  if (isProduction) {
    if (/change-me|example|htx_dev_password/i.test(env.JWT_ACCESS_SECRET) || new Set(env.JWT_ACCESS_SECRET).size < 10) {
      throw new Error(
        "Cấu hình môi trường không hợp lệ:\n  - JWT_ACCESS_SECRET: Không được dùng khóa mẫu hoặc khóa có độ ngẫu nhiên thấp khi NODE_ENV=production",
      );
    }
    if (env.ALLOW_DEV_DEMO_LOGIN === "true") {
      throw new Error(
        "Cấu hình môi trường không hợp lệ:\n  - ALLOW_DEV_DEMO_LOGIN: Không được bật chế độ đăng nhập thử nghiệm khi NODE_ENV=production",
      );
    }
    if (env.COOKIE_SECURE === "false") {
      throw new Error(
        "Cấu hình môi trường không hợp lệ:\n  - COOKIE_SECURE: Không được tắt cờ Secure của cookie phiên khi NODE_ENV=production",
      );
    }
    if (rawTrustProxy === "true") {
      throw new Error(
        "Cấu hình môi trường không hợp lệ:\n  - TRUST_PROXY: Không được đặt 'true' mở toàn bộ trên production; hãy chỉ định số bước nhảy (ví dụ '1') hoặc dải IP proxy tin cậy",
      );
    }
  }

  let trustProxy: string[] | boolean | number = ["loopback"];
  if (rawTrustProxy) {
    if (rawTrustProxy === "true") trustProxy = true;
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
  const sslRejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED
    ? env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
    : Boolean(sslCa);

  const isLocalDb = (() => {
    try {
      const host = new URL(env.DATABASE_URL).hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "db";
    } catch {
      return false;
    }
  })();
  const sslEnabled = env.DATABASE_SSL !== undefined ? env.DATABASE_SSL === "true" : !isLocalDb;

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
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : isProduction,
    seedPassword: env.SEED_PASSWORD,
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || undefined,
    allowDevDemoLogin: !isProduction && env.ALLOW_DEV_DEMO_LOGIN === "true",
    uploads: { dir: env.UPLOAD_DIR, maxBytes: env.UPLOAD_MAX_MB * 1024 * 1024 },
    rateLimit: {
      burstMax: env.RATE_LIMIT_BURST_MAX ?? 120,
      defaultMax: env.RATE_LIMIT_DEFAULT_MAX ?? 240,
      writeMax: env.RATE_LIMIT_WRITE_MAX ?? 60,
      maxKeys: env.RATE_LIMIT_MAX_KEYS ?? 25_000,
    },
    cache: {
      maxKeys: env.CACHE_MAX_KEYS ?? 4_000,
    },
  };
}

export const configuration = (): AppConfig => loadConfig();
