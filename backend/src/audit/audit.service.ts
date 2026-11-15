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
      folded.startsWith("admin ") ||
      folded.startsWith("administrator ") ||
      folded.startsWith("quan tri ")
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
    const cleanObject = sanitizeAuditText(entry.object, MAX_ACTOR_OR_OBJECT_LEN);
    const cleanDetail =
      entry.detail !== undefined && entry.detail !== null ? sanitizeAuditText(entry.detail, MAX_DETAIL_LEN) : null;

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
