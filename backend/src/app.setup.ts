import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { json, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { can, type Role } from "./auth/permissions";
import { ACCESS_COOKIE, TokensService } from "./auth/tokens.service";
import { apiCompressionMiddleware } from "./common/http/compression.middleware";
import type { AppConfig } from "./config/configuration";
import { DatabaseService } from "./database/database.service";

const PLOTS_IMPORT_WINDOW_MS = 60_000;
const PLOTS_IMPORT_MAX_REQUESTS = 10;
const PLOTS_IMPORT_MAX_KEYS = 1_000;

function hasValidImportCsrfPrecondition(req: Request, allowedOrigins: readonly string[], isTest: boolean): boolean {
  const rawSecFetchSite = req.headers["sec-fetch-site"];
  const secFetchSites = Array.isArray(rawSecFetchSite)
    ? rawSecFetchSite
    : rawSecFetchSite
      ? [rawSecFetchSite]
      : [];
  if (secFetchSites.some((v) => v.trim().toLowerCase() === "cross-site")) {
    return false;
  }

  const rawOrigin = req.headers.origin;
  if (rawOrigin !== undefined) {
    if (typeof rawOrigin !== "string" || !rawOrigin.trim() || rawOrigin.trim().toLowerCase() === "null") {
      return false;
    }
    try {
      const parsed = new URL(rawOrigin.trim());
      if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        parsed.username !== "" ||
        parsed.password !== "" ||
        (parsed.pathname !== "/" && parsed.pathname !== "") ||
        parsed.search !== "" ||
        parsed.hash !== ""
      ) {
        return false;
      }
      return allowedOrigins.includes(parsed.origin);
    } catch {
      return false;
    }
  }

  const rawReferer = req.headers.referer;
  if (rawReferer !== undefined) {
    if (typeof rawReferer !== "string" || !rawReferer.trim()) {
      return false;
    }
    try {
      const parsedOrigin = new URL(rawReferer.trim()).origin;
      return Boolean(parsedOrigin && parsedOrigin !== "null" && allowedOrigins.includes(parsedOrigin));
    } catch {
      return false;
    }
  }

  if (isTest) {
    return true;
  }
  return Boolean(req.headers["x-requested-with"]);
}

/**
 * Cấu hình dùng chung cho server thật và test e2e (app phải được tạo với `bodyParser: false`
 * để giới hạn kích thước body theo từng đường dẫn như dưới đây).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const corsOrigins = config.get("corsOrigins", { infer: true });
  const isTest = config.get("nodeEnv", { infer: true }) === "test";

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
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "X-Requested-With",
      "X-Audit-Pass",
      "X-Idempotency-Key",
      "If-None-Match",
      "X-Upload-Sha256",
      "Range",
    ],
    exposedHeaders: ["Retry-After", "ETag", "Content-Range", "X-Idempotency-Replayed"],
    maxAge: 600,
  });

  app.use(cookieParser());

  // Nhập GeoJSON địa chính có thể lớn (giới hạn 10 MB) nhưng chỉ mở bộ đệm 10 MB cho đúng phương thức POST,
  // qua kiểm tra nguồn gửi CSRF, có phiên JWT `sid` đang hoạt động thuộc vai trò có quyền tạo thửa (`plots:create`)
  // và nằm trong ngưỡng tần suất an toàn trước khi đọc luồng JSON 10 MB vào bộ nhớ.
  const plotsImportJson = json({ limit: "10mb" });
  let tokens: TokensService | null = null;
  let db: DatabaseService | null = null;
  try {
    tokens = app.get(TokensService, { strict: false });
  } catch {
    tokens = null;
  }
  try {
    db = app.get(DatabaseService, { strict: false });
  } catch {
    db = null;
  }

  const importSlidingWindows = new Map<string, number[]>();
  const consumeImportWindow = (key: string, now: number): number | null => {
    const prev = importSlidingWindows.get(key);
    const active = prev ? prev.filter((exp) => exp > now) : [];
    if (active.length >= PLOTS_IMPORT_MAX_REQUESTS) {
      importSlidingWindows.set(key, active);
      return Math.max(1, Math.ceil(((active[0] ?? now + PLOTS_IMPORT_WINDOW_MS) - now) / 1000));
    }
    if (!prev && importSlidingWindows.size >= PLOTS_IMPORT_MAX_KEYS) {
      for (const [k, expList] of importSlidingWindows) {
        if (expList.every((exp) => exp <= now)) {
          importSlidingWindows.delete(k);
        }
      }
      if (importSlidingWindows.size >= PLOTS_IMPORT_MAX_KEYS) {
        const oldest = importSlidingWindows.keys().next().value;
        if (oldest !== undefined) importSlidingWindows.delete(oldest);
      }
    }
    active.push(now + PLOTS_IMPORT_WINDOW_MS);
    importSlidingWindows.delete(key);
    importSlidingWindows.set(key, active);
    return null;
  };

  app.use("/api/plots/import", (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") {
      next();
      return;
    }
    if (!hasValidImportCsrfPrecondition(req, corsOrigins, isTest)) {
      next();
      return;
    }
    const rawToken = (req.cookies as Record<string, unknown> | undefined)?.[ACCESS_COOKIE];
    if (!tokens || typeof rawToken !== "string" || rawToken.length < 16 || rawToken.length > 4096) {
      next();
      return;
    }

    void (async () => {
      const verified = await tokens.verifyAccessToken(rawToken);
      if (!verified || !verified.sessionId) {
        next();
        return;
      }

      if (db) {
        const { rows } = await db.query<{
          role: Role;
          status: string;
          token_version: number;
          session_active: boolean;
        }>(
          `SELECT u.role, u.status, u.token_version,
                  EXISTS (
                    SELECT 1 FROM refresh_tokens rt
                    WHERE rt.id = $2::bigint AND rt.user_id = u.id AND rt.revoked_at IS NULL AND rt.expires_at > now()
                  ) AS session_active
           FROM users u
           WHERE u.id = $1`,
          [verified.userId, verified.sessionId],
        );
        const actor = rows[0];
        if (
          !actor ||
          actor.status !== "active" ||
          actor.token_version !== verified.tokenVersion ||
          !actor.session_active ||
          !can(actor.role, "plots", "create")
        ) {
          next();
          return;
        }
      }

      const now = Date.now();
      const clientIp = (req.ip || req.socket?.remoteAddress || "unknown").trim();
      const userRetry = consumeImportWindow(`user:${verified.userId}`, now);
      const ipRetry = userRetry === null ? consumeImportWindow(`ip:${clientIp}`, now) : null;
      const retryAfterSeconds = userRetry ?? ipRetry;
      if (retryAfterSeconds !== null) {
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.status(429).json({
          error: "Thao tác nhập dữ liệu thửa đất quá nhanh. Vui lòng thử lại sau.",
          code: "RATE_LIMITED",
          retryAfterSeconds,
        });
        return;
      }

      plotsImportJson(req, res, next);
    })().catch(() => next());
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
