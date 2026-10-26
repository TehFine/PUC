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

  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");

  app.use(helmet());
  app.enableCors({ origin: config.get("corsOrigins", { infer: true }), credentials: true });

  // Nhập GeoJSON địa chính có thể lớn; các route khác giới hạn nhỏ hơn.
  app.use("/api/plots/import", json({ limit: "50mb" }));
  app.use(json({ limit: "1mb" }));
  app.use(cookieParser());

  app.setGlobalPrefix("api");
}
