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

  @IsIn(["true", "false"])
  DATABASE_SSL = "false";

  @IsOptional()
  @IsIn(["true", "false"])
  DATABASE_SSL_REJECT_UNAUTHORIZED?: string;

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
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  trustProxy: string[] | boolean | number;
  database: { url: string; ssl: boolean; sslRejectUnauthorized: boolean };
  jwt: { accessSecret: string; accessTtlMin: number; refreshTtlDays: number };
  cookieSecure: boolean;
  seedPassword?: string;
  googleClientId?: string;
  allowDevDemoLogin: boolean;
  uploads: { dir: string; maxBytes: number };
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
  }

  const rawTrustProxy = env.TRUST_PROXY?.trim();
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

  const sslRejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED
    ? env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
    : isProduction;

  return {
    nodeEnv: env.NODE_ENV,
    isProduction,
    port: env.PORT,
    corsOrigins,
    trustProxy,
    database: {
      url: env.DATABASE_URL,
      ssl: env.DATABASE_SSL === "true",
      sslRejectUnauthorized,
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
  };
}

export const configuration = (): AppConfig => loadConfig();
