import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { json } from "express";
import helmet from "helmet";
import { apiCompressionMiddleware } from "./common/http/compression.middleware";
import type { AppConfig } from "./config/configuration";

/**
 * Cấu hình dùng chung cho server thật và test e2e (app phải được tạo với `bodyParser: false`
 * để giới hạn kích thước body theo từng đường dẫn như dưới đây).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.set("trust proxy", config.get("trustProxy", { infer: true }));
  app.disable("x-powered-by");

  app.use(
    helmet({
      frameguard: { action: "deny" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.enableCors({
    origin: config.get("corsOrigins", { infer: true }),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "X-Requested-With",
      "X-Audit-Pass",
      "X-Idempotency-Key",
      "If-None-Match",
    ],
    maxAge: 600,
  });

  app.use(cookieParser());

  // Nhập GeoJSON địa chính có thể lớn (giới hạn 10 MB) nhưng chỉ mở bộ đệm 10 MB khi đã có cookie phiên; các route khác giới hạn 1 MB.
  const plotsImportJson = json({ limit: "10mb" });
  app.use("/api/plots/import", (req: { cookies?: Record<string, unknown> }, res: unknown, next: () => void) => {
    const hasAccessCookie = typeof req.cookies?.htx_access === "string" && req.cookies.htx_access.length > 16;
    if (!hasAccessCookie) {
      next();
      return;
    }
    plotsImportJson(req as never, res as never, next);
  });
  app.use(json({ limit: "1mb" }));
  app.use(apiCompressionMiddleware);

  // Mặc định không lưu bộ nhớ đệm cho các API có xác thực (các route tệp sẽ ghi đè khi cần).
  app.use("/api", (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    next();
  });

  app.setGlobalPrefix("api");
}
