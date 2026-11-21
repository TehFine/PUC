import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import type { AuthUser } from "../auth/auth-user";

export interface AuditContext {
  ip?: string;
  user?: Pick<AuthUser, "id" | "fullName">;
  userName?: string;
}

export interface AuditEntry {
  action: string;
  object: string;
  detail?: string;
}

const CONTROL_AND_BIDI_RE = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;
const MAX_ACTOR_OR_OBJECT_LEN = 160;
const MAX_DETAIL_LEN = 500;
const ANONYMOUS_ACTOR_LABEL = "Khách (chưa xác thực)";

const RAW_REPORT_OBJECT_MAP: Record<string, string> = {
  "Báo cáo households": "Báo cáo hộ nông dân",
  "Báo cáo journal": "Báo cáo nhật ký canh tác",
  "Báo cáo spray": "Báo cáo nhật ký phun thuốc",
  "Báo cáo lab-tests": "Báo cáo kiểm nghiệm",
  "Báo cáo violations": "Báo cáo vi phạm",
  "Báo cáo harvest": "Báo cáo thu hoạch",
  "Báo cáo training-registrations": "Báo cáo tập huấn",
};

/**
 * Ẩn tên trường kỹ thuật (camelCase/snake_case), cấu trúc JSON bộ lọc hoặc thông số MIME nội bộ
 * khỏi nội dung nhật ký thao tác để không lộ lược đồ dữ liệu ra giao diện quản trị hay API.
 */
export function redactAuditObjectLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (RAW_REPORT_OBJECT_MAP[trimmed]) return RAW_REPORT_OBJECT_MAP[trimmed];
  const fileMatch = /^Tệp #(\d+)\s*\([a-z_-]+\)$/i.exec(trimmed);
  if (fileMatch) return `Tệp đính kèm #${fileMatch[1]}`;
  return trimmed;
}

export function redactAuditDetailText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^Trường\s*:/i.test(trimmed)) {
    return "Đã cập nhật thông tin hồ sơ";
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as { from?: unknown; to?: unknown; villageId?: unknown };
      const parts: string[] = [];
      if (typeof parsed.from === "string" && typeof parsed.to === "string") {
        parts.push(`Từ ${parsed.from} đến ${parsed.to}`);
      } else if (typeof parsed.from === "string") {
        parts.push(`Từ ngày ${parsed.from}`);
      } else if (typeof parsed.to === "string") {
        parts.push(`Đến ngày ${parsed.to}`);
      }
      if (parsed.villageId !== undefined) {
        parts.push("Lọc theo địa bàn thôn");
      }
      return parts.length > 0 ? parts.join(", ") : "Toàn bộ phạm vi quản lý";
    } catch {
      return "Đã áp dụng bộ lọc tra cứu";
    }
  }

  if (/bộ lọc:\s*\{.*\}$/i.test(trimmed)) {
    return "Bản kiểm toán đầy đủ theo phạm vi quản lý";
  }

  const mimeBytesMatch = /^[a-z0-9.+-]+\/[a-z0-9.+-]+\s*\((\d+)\s*bytes\)$/i.exec(trimmed);
  if (mimeBytesMatch) {
    const kb = Math.max(1, Math.round(Number(mimeBytesMatch[1]) / 1024));
    return `Đã lưu tệp minh chứng (${kb} KB)`;
  }

  return trimmed;
}

function sanitizeAuditText(value: string, maxLen: number): string {
  const cleaned = value
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(CONTROL_AND_BIDI_RE, "")
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

function foldVietnamese(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isImpersonatedPrivilegedLabel(value: string, hasVerifiedUserId: boolean): boolean {
  const folded = foldVietnamese(value);
  if (!folded) return true;
  if (
    folded === "he thong" ||
    folded === "system" ||
    folded.startsWith("he thong ") ||
    folded.startsWith("system ")
  ) {
    return true;
  }
  if (!hasVerifiedUserId) {
    if (
      folded === "admin" ||
      folded === "administrator" ||
      folded === "quan tri" ||
      folded === "quan tri vien" ||
      folded === "truong htx" ||
      folded === "pho htx" ||
      folded === "chuyen vien ho tro" ||
      folded === "chuyen vien ho tro he thong" ||
      folded.startsWith("admin ") ||
      folded.startsWith("administrator ") ||
      folded.startsWith("quan tri ") ||
      folded.startsWith("truong htx ") ||
      folded.startsWith("pho htx ") ||
      folded.startsWith("chuyen vien ho tro ")
    ) {
      return true;
    }
  }
  return false;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Ghi nhật ký thao tác. Lỗi ghi log không được làm hỏng yêu cầu chính. */
  async write(
    context: AuditContext,
    entry: AuditEntry,
    actor?: { id: number | null; name: string },
  ): Promise<void> {
    let userId: number | null;
    let userName: string;

    if (context.user) {
      userId = actor !== undefined ? actor.id : context.user.id;
      const rawName = actor !== undefined ? actor.name : context.user.fullName;
      userName = sanitizeAuditText(rawName || context.user.fullName, MAX_ACTOR_OR_OBJECT_LEN) || ANONYMOUS_ACTOR_LABEL;
    } else {
      userId = actor?.id ?? null;
      const suppliedRaw = actor?.name ?? context.userName ?? "";
      const sanitizedSupplied = sanitizeAuditText(suppliedRaw, MAX_ACTOR_OR_OBJECT_LEN);
      if (!sanitizedSupplied || isImpersonatedPrivilegedLabel(sanitizedSupplied, userId !== null)) {
        userName = ANONYMOUS_ACTOR_LABEL;
      } else {
        userName = sanitizedSupplied;
      }
    }

    const cleanAction = sanitizeAuditText(entry.action, MAX_ACTOR_OR_OBJECT_LEN);
    const cleanObject = sanitizeAuditText(redactAuditObjectLabel(entry.object), MAX_ACTOR_OR_OBJECT_LEN);
    const redactedDetail = redactAuditDetailText(entry.detail);
    const cleanDetail =
      redactedDetail !== null ? sanitizeAuditText(redactedDetail, MAX_DETAIL_LEN) : null;

    try {
      await this.db.query(
        `INSERT INTO audit_logs (user_id, user_name, ip, action, object, detail) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, userName, context.ip ?? null, cleanAction, cleanObject, cleanDetail],
      );
    } catch (error) {
      this.logger.error(`Không ghi được audit log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
