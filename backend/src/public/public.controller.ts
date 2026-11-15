import { Controller, Get, Header, Ip, Param, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser, OptionalAuth, OptionalCurrentUser, Public } from "../auth/auth.decorators";
import { notFound } from "../common/errors/app.exception";
import { camelRow, camelRows } from "../common/sql/rows";
import { querySystemScaleOverview } from "../common/sql/stats-sync";
import { DatabaseService } from "../database/database.service";
import { TraceabilityService } from "./traceability.service";

const PUBLIC_TRACE_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 30;
const AUTH_TRACE_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 60;
const TRACE_WINDOW_MS = 60_000;

function extractCountryCode(req: Request): string | undefined {
  const rawCountry =
    req.headers["cf-ipcountry"] ??
    req.headers["x-vercel-ip-country"] ??
    req.headers["x-country-code"] ??
    req.headers["x-geo-country"];
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
  @Get("overview")
  @Header("Cache-Control", "no-cache")
  async overview() {
    const row = await querySystemScaleOverview(this.db);
    return camelRow(row);
  }

  @Public()
  @Get("catalog")
  @Header("Cache-Control", "no-cache")
  async catalog() {
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
  }

  @Public()
  @Get("news")
  @Header("Cache-Control", "no-cache")
  async news() {
    const { rows } = await this.db.query(
      `SELECT slug, category, title, excerpt, content, author, image_url, image_alt,
              read_time, featured, published_on
       FROM news_articles
       WHERE status = 'published'
       ORDER BY published_on DESC NULLS LAST, id DESC
       LIMIT 100`,
    );
    return { data: camelRows(rows) };
  }

  @Public()
  @Get("news/:slug")
  @Header("Cache-Control", "no-cache")
  async newsDetail(@Param("slug") slug: string) {
    const cleanSlug = slug.trim();
    if (!cleanSlug || cleanSlug.length > 120 || !/^[a-z0-9-]+$/i.test(cleanSlug)) {
      throw notFound("Không tìm thấy bản tin.");
    }
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
  }

  /** Danh sách thôn (chỉ id và tên) cho biểu mẫu đăng ký. */
  @Public()
  @Get("villages")
  @Header("Cache-Control", "no-cache")
  async villages() {
    return (await this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages ORDER BY name")).rows;
  }

  /** Danh sách mã lô thu hoạch - thùng đóng gói mẫu trên trang tra cứu công khai `/trace`. */
  @Public()
  @Throttle({ default: { limit: PUBLIC_TRACE_LIMIT, ttl: TRACE_WINDOW_MS } })
  @Get("trace-samples")
  @Header("Cache-Control", "no-cache")
  async traceSamples() {
    return this.traceability.traceSamples();
  }

  /** API 1 (Công khai + tùy chọn phiên): Tra cứu hồ sơ QR bằng token ngẫu nhiên (/t/:token), giới hạn tốc độ chống quét dò token. */
  @Public()
  @OptionalAuth()
  @Throttle({ default: { limit: PUBLIC_TRACE_LIMIT, ttl: TRACE_WINDOW_MS } })
  @Get("trace/:code")
  @Header("Cache-Control", "no-store")
  async trace(
    @Param("code") code: string,
    @Query("view") view: string | undefined,
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

  @Throttle({ default: { limit: AUTH_TRACE_LIMIT, ttl: TRACE_WINDOW_MS } })
  @Get(":code")
  @Header("Cache-Control", "no-store")
  async traceAuthenticated(
    @Param("code") code: string,
    @Query("view") view: string | undefined,
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
      countryCode: extractCountryCode(req),
    });
  }
}
