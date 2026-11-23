import { Body, Controller, Get, Header, HttpCode, Ip, Param, Post, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { Request, Response } from "express";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser, OptionalAuth, OptionalCurrentUser, Public } from "../auth/auth.decorators";
import { notFound } from "../common/errors/app.exception";
import { camelRow, camelRows } from "../common/sql/rows";
import { querySystemScaleOverview } from "../common/sql/stats-sync";
import { RateLimitTier } from "../common/throttler/rate-limit.policy";
import { DatabaseService } from "../database/database.service";
import { TraceabilityService } from "./traceability.service";

export class VerifyFieldGpsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000)
  accuracyMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  auditPass?: string;
}

function extractAuditPass(req: Request, queryPass?: string): string | undefined {
  const headerVal = req.headers["x-audit-pass"];
  const raw = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().slice(0, 80);
  }
  if (process.env.NODE_ENV !== "production" && typeof queryPass === "string" && queryPass.trim()) {
    return queryPass.trim().slice(0, 80);
  }
  return undefined;
}

function extractCountryCode(req: Request): string | undefined {
  if (process.env.NODE_ENV !== "test" && process.env.TRUST_GEO_HEADERS !== "true") {
    return undefined;
  }
  const rawCountry = req.headers["cf-ipcountry"];
  const countryStr = Array.isArray(rawCountry) ? rawCountry[0] : rawCountry;
  const normCountry =
    typeof countryStr === "string" && /^[A-Za-z]{2}$/.test(countryStr.trim())
      ? countryStr.trim().toUpperCase()
      : undefined;
  return normCountry && normCountry !== "XX" && normCountry !== "T1" ? normCountry : undefined;
}

/**
 * Dữ liệu công khai cho trang giới thiệu, bản tin và tra cứu mã QR truy xuất nguồn gốc 3 cấp độ.
 */
@Controller("public")
export class PublicController {
  constructor(
    private readonly db: DatabaseService,
    private readonly traceability: TraceabilityService,
  ) {}

  @Public()
  @Throttle(RateLimitTier.PUBLIC_READ)
  @Get("overview")
  @Header("Cache-Control", "no-cache")
  async overview() {
    const loadOverview = async () => camelRow(await querySystemScaleOverview(this.db));
    if (!this.db.cache) return loadOverview();
    return this.db.cache.getOrLoad("public:overview", 30_000, ["public-overview"], loadOverview);
  }

  @Public()
  @Throttle(RateLimitTier.PUBLIC_READ)
  @Get("catalog")
  @Header("Cache-Control", "no-cache")
  async catalog() {
    const loadCatalog = async () => {
      const [pesticides, varieties, fertilizers, training] = await Promise.all([
        this.db.query(
          `SELECT name, active_ingredient, concentration, manufacturer, mrl_mg_kg, isolation_days, status
           FROM pesticides ORDER BY CASE status WHEN 'banned' THEN 0 WHEN 'restricted' THEN 1 ELSE 2 END, name`,
        ),
        this.db.query(
          `SELECT name, origin, weight_range, harvest_years, description, category, status,
                  flesh_color, seed_rate, brix, yield_per_ha, image_url, market_potential,
                  morphology, farming_techniques
           FROM varieties ORDER BY name`,
        ),
        this.db.query(
          `SELECT name, category, formula, manufacturer, dosage, application_method, timing,
                  status, image_url, description
           FROM fertilizers ORDER BY id`,
        ),
        this.db.query(
          `SELECT title, held_on, to_char(starts_at, 'HH24:MI') AS starts_at,
                  to_char(ends_at, 'HH24:MI') AS ends_at, location, trainer, description, capacity, enrolled
           FROM training_courses
           WHERE completed = false AND held_on IS NOT NULL ORDER BY held_on ASC LIMIT 6`,
        ),
      ]);
      const upcomingTraining = camelRows(training.rows);
      return {
        pesticides: camelRows(pesticides.rows),
        varieties: camelRows(varieties.rows),
        fertilizers: camelRows(fertilizers.rows),
        training: upcomingTraining,
        upcomingTraining,
      };
    };
    if (!this.db.cache) return loadCatalog();
    return this.db.cache.getOrLoad("public:catalog", 60_000, ["catalog"], loadCatalog);
  }

  @Public()
  @Throttle(RateLimitTier.PUBLIC_READ)
  @Get("news")
  @Header("Cache-Control", "no-cache")
  async news() {
    const loadNews = async () => {
      const { rows } = await this.db.query(
        `SELECT slug, category, title, excerpt, content, author, image_url, image_alt,
                read_time, featured, published_on
         FROM news_articles
         WHERE status = 'published'
         ORDER BY published_on DESC NULLS LAST, id DESC
         LIMIT 100`,
      );
      return { data: camelRows(rows) };
    };
    if (!this.db.cache) return loadNews();
    return this.db.cache.getOrLoad("public:news:list", 45_000, ["news"], loadNews);
  }

  @Public()
  @Throttle(RateLimitTier.PUBLIC_ARTICLE)
  @Get("news/:slug")
  @Header("Cache-Control", "no-cache")
  async newsDetail(@Param("slug") slug: string) {
    const cleanSlug = slug.trim();
    if (!cleanSlug || cleanSlug.length > 120 || !/^[a-z0-9-]+$/i.test(cleanSlug)) {
      throw notFound("Không tìm thấy bản tin.");
    }
    const cleanKey = cleanSlug.toLowerCase();
    const loadArticle = async () => {
      const { rows } = await this.db.query(
        `SELECT slug, category, title, excerpt, content, author, image_url, image_alt,
                read_time, featured, published_on
         FROM news_articles
         WHERE slug = $1 AND status = 'published'
         LIMIT 1`,
        [cleanSlug],
      );
      if (rows.length === 0) throw notFound("Không tìm thấy bản tin.");
      return camelRow(rows[0]);
    };
    if (!this.db.cache) return loadArticle();
    return this.db.cache.getOrLoad(`public:news:slug:${cleanKey}`, 60_000, ["news"], loadArticle);
  }

  /** Danh sách thôn (chỉ id và tên) cho biểu mẫu đăng ký. */
  @Public()
  @Throttle(RateLimitTier.PUBLIC_READ)
  @Get("villages")
  @Header("Cache-Control", "no-cache")
  async villages() {
    const loadVillages = async () =>
      (await this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages ORDER BY name")).rows;
    if (!this.db.cache) return loadVillages();
    return this.db.cache.getOrLoad("public:villages", 60_000, ["catalog"], loadVillages);
  }

  /** Danh sách mã lô thu hoạch - thùng đóng gói mẫu trên trang tra cứu công khai `/trace`. */
  @Public()
  @Throttle(RateLimitTier.PUBLIC_TRACE)
  @Get("trace-samples")
  @Header("Cache-Control", "no-cache")
  async traceSamples() {
    if (!this.db.cache) return this.traceability.traceSamples();
    return this.db.cache.getOrLoad("public:trace-samples", 45_000, ["trace"], () =>
      this.traceability.traceSamples(),
    );
  }

  /** Luồng SSE thời gian thực thông báo ngay khi dữ liệu lô hàng, vùng trồng, kiểm nghiệm hoặc nhật ký thay đổi. */
  @Public()
  @SkipThrottle()
  @Get("trace-stream")
  streamTraceUpdates(@Ip() ip: string, @Req() req: Request, @Res() res: Response): void {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(": connected\n\n");

    let closed = false;
    const heartbeat = setInterval(() => {
      if (closed || res.writableEnded || res.destroyed) return;
      res.write(": ping\n\n");
    }, 25_000);
    heartbeat.unref?.();

    const unsubscribe = this.traceability.subscribeTraceStream(
      ip,
      (event) => {
        if (closed || res.writableEnded || res.destroyed) return;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      () => {
        if (!closed && !res.writableEnded && !res.destroyed) {
          res.end();
        }
      },
    );

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  }

  /** API 1 (Công khai + tùy chọn phiên / Thẻ Đoàn Thẩm định): Tra cứu hồ sơ QR bằng token ngẫu nhiên (/t/:token), giới hạn tốc độ chống quét dò token. */
  @Public()
  @OptionalAuth()
  @Throttle(RateLimitTier.PUBLIC_TRACE)
  @Get("trace/:code")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  @Header("Pragma", "no-cache")
  async trace(
    @Param("code") code: string,
    @Query("view") view: string | undefined,
    @Query("auditPass") auditPass: string | undefined,
    @Query("bg") bg: string | undefined,
    @Query("noGrant") noGrant: string | undefined,
    @OptionalCurrentUser() user: AuthUser | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const ua = req.headers["user-agent"];
    return this.traceability.trace(code, {
      user,
      ip,
      userAgent: typeof ua === "string" ? ua : undefined,
      requestedView: view,
      auditPass: extractAuditPass(req, auditPass),
      countryCode: extractCountryCode(req),
      isBackgroundRefresh: bg === "1" || bg === "true",
      suppressTemporaryGrant: noGrant === "1" || noGrant === "true",
    });
  }

  /** Đối chứng tọa độ GPS thực địa tại vườn khi quét Bảng QR Thửa Đất (yêu cầu Thẻ Đoàn Thẩm định hoặc tài khoản có phạm vi). */
  @Public()
  @OptionalAuth()
  @Throttle(RateLimitTier.GPS_VERIFY)
  @Post("trace/:code/verify-gps")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async verifyLiveGps(
    @Param("code") code: string,
    @Body() dto: VerifyFieldGpsDto,
    @Query("auditPass") queryPass: string | undefined,
    @OptionalCurrentUser() user: AuthUser | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const ua = req.headers["user-agent"];
    return this.traceability.verifyLiveFieldGps(code, dto, {
      user,
      ip,
      userAgent: typeof ua === "string" ? ua : undefined,
      auditPass: extractAuditPass(req, dto.auditPass || queryPass),
      countryCode: extractCountryCode(req),
    });
  }
}

/**
 * API 2 (Yêu cầu xác thực bắt buộc): Phục vụ chức năng "Quét QR" ngay trong PWA quản lý của cán bộ / đối tác
 * đã đăng nhập sẵn (cookie httpOnly), áp dụng đồng thời Rate Limit chống dò token và kiểm tra Vai trò + Phạm vi.
 */
@Controller("trace")
export class AuthenticatedTraceController {
  constructor(private readonly traceability: TraceabilityService) {}

  @Throttle(RateLimitTier.AUTH_TRACE)
  @Get(":code")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  @Header("Pragma", "no-cache")
  async traceAuthenticated(
    @Param("code") code: string,
    @Query("view") view: string | undefined,
    @Query("auditPass") auditPass: string | undefined,
    @Query("bg") bg: string | undefined,
    @Query("noGrant") noGrant: string | undefined,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const ua = req.headers["user-agent"];
    return this.traceability.trace(code, {
      user,
      ip,
      userAgent: typeof ua === "string" ? ua : undefined,
      requestedView: view,
      auditPass: extractAuditPass(req, auditPass),
      countryCode: extractCountryCode(req),
      isBackgroundRefresh: bg === "1" || bg === "true",
      suppressTemporaryGrant: noGrant === "1" || noGrant === "true",
    });
  }

  @Throttle(RateLimitTier.GPS_VERIFY)
  @Post(":code/verify-gps")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async verifyLiveGpsAuthenticated(
    @Param("code") code: string,
    @Body() dto: VerifyFieldGpsDto,
    @Query("auditPass") queryPass: string | undefined,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const ua = req.headers["user-agent"];
    return this.traceability.verifyLiveFieldGps(code, dto, {
      user,
      ip,
      userAgent: typeof ua === "string" ? ua : undefined,
      auditPass: extractAuditPass(req, dto.auditPass || queryPass),
      countryCode: extractCountryCode(req),
    });
  }
}
