import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import type { AuthUser } from "../auth/auth-user";

export interface AuditContext {
  ip?: string;
  user?: Pick<AuthUser, "id" | "fullName">;
}

export interface AuditEntry {
  action: string;
  object: string;
  detail?: string;
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
    const user = actor ?? (context.user ? { id: context.user.id, name: context.user.fullName } : { id: null, name: "Hệ thống" });
    try {
      await this.db.query(
        `INSERT INTO audit_logs (user_id, user_name, ip, action, object, detail) VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.name, context.ip ?? null, entry.action, entry.object, entry.detail ?? null],
      );
    } catch (error) {
      this.logger.error(`Không ghi được audit log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
