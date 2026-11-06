import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { json } from "express";
import helmet from "helmet";
import type { AppConfig } from "./config/configuration";

/**
 * Cấu hình dùng chung cho server thật và test e2e (app phải được tạo với `bodyParser: false`
 * để giới hạn kích thước body theo từng đường dẫn như dưới đây).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);
  app.disable("x-powered-by");

  app.use(helmet());
  app.enableCors({
    origin: config.get("corsOrigins", { infer: true }),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    maxAge: 600,
  });

  // Nhập GeoJSON địa chính có thể lớn (giới hạn 10 MB); các route khác giới hạn 1 MB.
  app.use("/api/plots/import", json({ limit: "10mb" }));
  app.use(json({ limit: "1mb" }));
  app.use(cookieParser());

  // Mặc định không lưu bộ nhớ đệm cho các API có xác thực (các route tệp sẽ ghi đè khi cần).
  app.use("/api", (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.setGlobalPrefix("api");
}
