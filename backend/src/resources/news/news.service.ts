import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
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

function validateNewsContent(content: unknown): void {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw badRequest("Nội dung bản tin phải là một đối tượng.");
  }
  const obj = content as { lead?: unknown; sections?: unknown };
  if (typeof obj.lead !== "string" || !obj.lead.trim()) {
    throw badRequest("Nội dung bản tin phải có phần mở đầu (lead).");
  }
  if (!Array.isArray(obj.sections)) {
    throw badRequest("Nội dung bản tin phải có danh sách các mục (sections).");
  }
}

@Injectable()
export class NewsService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
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
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    const out: Record<string, unknown> = { ...input };

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
      validateNewsContent(out.content);
      out.content = JSON.stringify(out.content);
    }

    return out;
  }

  async publish(id: number, user: AuthUser, ip?: string) {
    const { rows } = await this.db.query<{ id: number; title: string }>(
      `UPDATE news_articles
       SET status = 'published', published_on = COALESCE(published_on, ${TODAY_VN_SQL})
       WHERE id = $1
       RETURNING id, title`,
      [id],
    );
    if (rows.length === 0) throw notFound("Không tìm thấy bản tin.");
    await this.audit.write(
      { ip, user },
      { action: "Xuất bản bản tin", object: `${this.config.label} #${id}`, detail: rows[0].title },
    );
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
    await this.audit.write(
      { ip, user },
      { action: "Gỡ xuất bản bản tin", object: `${this.config.label} #${id}`, detail: rows[0].title },
    );
    return this.findOne(id, user);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugifyVietnamese(title);
    const existing = await this.db.query("SELECT 1 FROM news_articles WHERE slug = $1", [base]);
    if (existing.rowCount === 0) return base;
    for (let i = 2; i <= 50; i++) {
      const candidate = `${base}-${i}`;
      const check = await this.db.query("SELECT 1 FROM news_articles WHERE slug = $1", [candidate]);
      if (check.rowCount === 0) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
