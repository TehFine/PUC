import { Injectable, Optional } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { TODAY_VN_SQL } from "../shared/state";

export function slugifyVietnamese(text: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "ban-tin";
}

const MAX_NEWS_CONTENT_BYTES = 50_000;
const MAX_NEWS_SECTIONS = 30;
const MAX_SECTION_HEADING_LEN = 300;
const MAX_SECTION_ITEMS = 30;
const MAX_PARAGRAPH_LEN = 4000;
const MAX_BULLET_LEN = 1000;
const ALLOWED_SECTION_KEYS = new Set(["heading", "paragraphs", "bulletPoints"]);

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function validateNewsContent(content: unknown): string {
  if (!isPlainRecord(content)) {
    throw badRequest("Nội dung bản tin phải là một đối tượng.");
  }
  const obj = content as { lead?: unknown; sections?: unknown };
  if (typeof obj.lead !== "string" || !obj.lead.trim() || obj.lead.length > 5000) {
    throw badRequest("Nội dung bản tin phải có phần mở đầu (lead) hợp lệ.");
  }
  if (!Array.isArray(obj.sections) || obj.sections.length > MAX_NEWS_SECTIONS) {
    throw badRequest("Nội dung bản tin phải có danh sách các mục (sections) hợp lệ.");
  }

  const sanitizedSections: Array<{
    heading?: string;
    paragraphs: string[];
    bulletPoints?: string[];
  }> = [];

  for (const rawSection of obj.sections) {
    if (!isPlainRecord(rawSection)) {
      throw badRequest("Mỗi mục trong sections phải là một đối tượng hợp lệ.");
    }
    for (const key of Object.keys(rawSection)) {
      if (!ALLOWED_SECTION_KEYS.has(key)) {
        throw badRequest(`Trường "${key}" trong mục nội dung bản tin không được hỗ trợ.`);
      }
    }

    let cleanHeading: string | undefined;
    if (rawSection.heading !== undefined && rawSection.heading !== null) {
      if (typeof rawSection.heading !== "string" || rawSection.heading.length > MAX_SECTION_HEADING_LEN) {
        throw badRequest(`Tiêu đề mục (heading) phải là chuỗi tối đa ${MAX_SECTION_HEADING_LEN} ký tự.`);
      }
      cleanHeading = rawSection.heading;
    }

    if (!Array.isArray(rawSection.paragraphs) || rawSection.paragraphs.length > MAX_SECTION_ITEMS) {
      throw badRequest(`Mỗi mục phải có mảng đoạn văn (paragraphs) tối đa ${MAX_SECTION_ITEMS} phần tử.`);
    }
    const cleanParagraphs: string[] = [];
    for (const para of rawSection.paragraphs) {
      if (typeof para !== "string" || para.length > MAX_PARAGRAPH_LEN) {
        throw badRequest(`Mỗi đoạn văn (paragraphs) phải là chuỗi tối đa ${MAX_PARAGRAPH_LEN} ký tự.`);
      }
      cleanParagraphs.push(para);
    }

    let cleanBullets: string[] | undefined;
    if (rawSection.bulletPoints !== undefined && rawSection.bulletPoints !== null) {
      if (!Array.isArray(rawSection.bulletPoints) || rawSection.bulletPoints.length > MAX_SECTION_ITEMS) {
        throw badRequest(`Danh sách ý chính (bulletPoints) tối đa ${MAX_SECTION_ITEMS} phần tử.`);
      }
      cleanBullets = [];
      for (const bullet of rawSection.bulletPoints) {
        if (typeof bullet !== "string" || bullet.length > MAX_BULLET_LEN) {
          throw badRequest(`Mỗi ý chính (bulletPoints) phải là chuỗi tối đa ${MAX_BULLET_LEN} ký tự.`);
        }
        cleanBullets.push(bullet);
      }
    }

    sanitizedSections.push({
      ...(cleanHeading !== undefined ? { heading: cleanHeading } : {}),
      paragraphs: cleanParagraphs,
      ...(cleanBullets !== undefined ? { bulletPoints: cleanBullets } : {}),
    });
  }

  const normalizedContent = {
    lead: obj.lead,
    sections: sanitizedSections,
  };
  const serialized = JSON.stringify(normalizedContent);
  if (serialized.length > MAX_NEWS_CONTENT_BYTES) {
    throw badRequest("Nội dung bản tin vượt quá dung lượng cho phép.");
  }
  return serialized;
}

@Injectable()
export class NewsService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {
    super(db, audit, {
      resource: "news",
      label: "Bản tin",
      table: "news_articles",
      fields: `t.id, t.slug, t.category, t.title, t.excerpt, t.content, t.author,
      t.image_url, t.image_alt, t.read_time, t.featured, t.status, t.published_on,
      t.created_by, t.created_at, t.updated_at`,
      from: `news_articles t`,
      orderBy: "COALESCE(t.published_on, t.created_at::date) DESC, t.id DESC",
      search: ["t.title", "t.excerpt", "t.author", "t.slug"],
      filters: { category: "t.category", status: "t.status" },
      virtual: ["_notifyNews"],
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    const out: Record<string, unknown> = { ...input };

    let prevStatus: string | null = null;
    let prevTitle = "";
    let prevExcerpt = "";
    if (context.method === "PATCH" && context.id !== undefined) {
      const ex = await this.db.query<{ status: string; title: string; excerpt: string }>(
        "SELECT status, title, excerpt FROM news_articles WHERE id = $1",
        [context.id],
      );
      if (ex.rows[0]) {
        prevStatus = ex.rows[0].status;
        prevTitle = ex.rows[0].title;
        prevExcerpt = ex.rows[0].excerpt;
      }
    }

    if (context.method === "POST") {
      out.createdBy = context.user.id;
      if (!out.slug) {
        out.slug = await this.uniqueSlug(String(out.title ?? ""));
      }
      if (out.status === "published" && !out.publishedOn) {
        out.publishedOn = todayVn();
      }
    } else if (out.status === "published" && out.publishedOn === undefined) {
      out.publishedOn = todayVn();
    }

    if (out.content !== undefined) {
      out.content = validateNewsContent(out.content);
    }

    const effectiveStatus = String(out.status ?? prevStatus ?? "draft");
    if (effectiveStatus === "published") {
      out._notifyNews = {
        isNew: context.method === "POST" || prevStatus !== "published",
        title: String(out.title ?? prevTitle).trim(),
        excerpt: String(out.excerpt ?? prevExcerpt).trim(),
        actorId: context.user.id,
        actorName: context.user.fullName,
      };
    }

    return out;
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    const info = input._notifyNews as
      | { isNew: boolean; title: string; excerpt: string; actorId?: number; actorName?: string }
      | undefined;
    if (!info || !this.notifications || !info.title) return;
    const notifTitle = info.isNew
      ? `Bản tin mới từ HTX: ${info.title}`
      : `Cập nhật bản tin HTX: ${info.title}`;
    const cleanExcerpt = info.excerpt ? info.excerpt.slice(0, 220) : null;
    await Promise.all([
      this.notifications.notifyAllFarmers({
        kind: "system",
        title: notifTitle,
        body: cleanExcerpt,
        link: "/#tin-tuc",
      }),
      this.notifications.notifyRoles(
        ["htx_head", "htx_deputy", "admin"],
        {
          kind: "system",
          title: notifTitle,
          body: info.actorName
            ? `${info.actorName} đã đăng tải tới nông hộ${cleanExcerpt ? `: ${cleanExcerpt}` : ""}`
            : cleanExcerpt,
          link: "/admin?section=news",
        },
        { excludeUserId: info.actorId },
      ),
    ]);
  }

  async publish(id: number, user: AuthUser, ip?: string) {
    const { rows } = await this.db.query<{ id: number; title: string; excerpt: string; was_published: boolean }>(
      `UPDATE news_articles
       SET status = 'published', published_on = COALESCE(published_on, ${TODAY_VN_SQL})
       WHERE id = $1
       RETURNING id, title, excerpt, (status = 'published') AS was_published`,
      [id],
    );
    if (rows.length === 0) throw notFound("Không tìm thấy bản tin.");
    const cleanExcerpt = rows[0].excerpt ? rows[0].excerpt.slice(0, 220) : null;
    await Promise.all([
      this.audit.write(
        { ip, user },
        { action: "Xuất bản bản tin", object: `${this.config.label} #${id}`, detail: rows[0].title },
      ),
      ...(this.notifications
        ? [
            this.notifications.notifyAllFarmers({
              kind: "system",
              title: `Bản tin mới từ HTX: ${rows[0].title}`,
              body: cleanExcerpt,
              link: "/#tin-tuc",
            }),
            this.notifications.notifyRoles(
              ["htx_head", "htx_deputy", "admin"],
              {
                kind: "system",
                title: `Bản tin mới từ HTX: ${rows[0].title}`,
                body: `${user.fullName} đã xuất bản tới nông hộ${cleanExcerpt ? `: ${cleanExcerpt}` : ""}`,
                link: "/admin?section=news",
              },
              { excludeUserId: user.id },
            ),
          ]
        : []),
    ]);
    return this.findOne(id, user);
  }

  async unpublish(id: number, user: AuthUser, ip?: string) {
    const { rows } = await this.db.query<{ id: number; title: string }>(
      `UPDATE news_articles
       SET status = 'draft'
       WHERE id = $1
       RETURNING id, title`,
      [id],
    );
    if (rows.length === 0) throw notFound("Không tìm thấy bản tin.");
    const [, article] = await Promise.all([
      this.audit.write(
        { ip, user },
        { action: "Gỡ xuất bản bản tin", object: `${this.config.label} #${id}`, detail: rows[0].title },
      ),
      this.findOne(id, user),
    ]);
    return article;
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugifyVietnamese(title);
    const escapedBase = base.replace(/[\\%_]/g, "\\$&");
    const existing = await this.db.query<{ slug: string }>(
      "SELECT slug FROM news_articles WHERE slug = $1 OR slug LIKE $2 ESCAPE '\\'",
      [base, `${escapedBase}-%`],
    );
    if (existing.rowCount === 0) return base;
    const taken = new Set(existing.rows.map((r) => r.slug));
    if (!taken.has(base)) return base;
    for (let i = 2; i <= 50; i++) {
      const candidate = `${base}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
