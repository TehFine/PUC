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
  database: { url: string; ssl: boolean };
  jwt: { accessSecret: string; accessTtlMin: number; refreshTtlDays: number };
  cookieSecure: boolean;
  seedPassword?: string;
  googleClientId?: string;
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

  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === NodeEnv.Production,
    port: env.PORT,
    corsOrigins,
    database: { url: env.DATABASE_URL, ssl: env.DATABASE_SSL === "true" },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtlMin: env.ACCESS_TOKEN_TTL_MIN,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    },
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : env.NODE_ENV === NodeEnv.Production,
    seedPassword: env.SEED_PASSWORD,
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || undefined,
    uploads: { dir: env.UPLOAD_DIR, maxBytes: env.UPLOAD_MAX_MB * 1024 * 1024 },
  };
}

export const configuration = (): AppConfig => loadConfig();
