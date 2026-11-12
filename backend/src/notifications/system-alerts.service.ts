import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { notFound } from "../common/errors/app.exception";
import { camelRow, camelRows } from "../common/sql/rows";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "./notifications.service";
import type { CreateSystemAlertDto, SystemAlertAudience, SystemAlertSeverity } from "./system-alerts.dto";

export interface SystemAlertRecord {
  id: number;
  severity: SystemAlertSeverity;
  title: string;
  message: string;
  audience: SystemAlertAudience;
  active: boolean;
  createdBy: number | null;
  createdByName: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

const STAFF_ROLES = ["admin", "htx_officer", "inspector", "village_officer"];

@Injectable()
export class SystemAlertsService implements OnModuleInit {
  private readonly logger = new Logger(SystemAlertsService.name);
  private cachedActive: { value: SystemAlertRecord | null; expiresAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 5_000;

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS system_alerts (
          id BIGSERIAL PRIMARY KEY,
          severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('critical', 'warning')),
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'farmer', 'staff')),
          active BOOLEAN NOT NULL DEFAULT true,
          created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          created_by_name TEXT,
          resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS system_alerts_active_idx ON system_alerts (active, created_at DESC);
      `);
    } catch (error) {
      this.logger.warn(
        `Không khởi tạo được bảng system_alerts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Lấy thông báo khẩn đang bật (có bộ đệm ngắn 5s để giảm tải cho /api/health). */
  async getActive(): Promise<SystemAlertRecord | null> {
    const now = Date.now();
    if (this.cachedActive && this.cachedActive.expiresAt > now) {
      return this.cachedActive.value;
    }
    try {
      const { rows } = await this.db.query(
        `SELECT id, severity, title, message, audience, active,
                created_by, created_by_name, resolved_by, resolved_at, created_at
         FROM system_alerts
         WHERE active = true
         ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, created_at DESC, id DESC
         LIMIT 1`,
      );
      const value = rows[0] ? (camelRow(rows[0]) as unknown as SystemAlertRecord) : null;
      this.cachedActive = { value, expiresAt: now + SystemAlertsService.CACHE_TTL_MS };
      return value;
    } catch {
      return null;
    }
  }

  async listRecent(limit = 30): Promise<{ active: SystemAlertRecord | null; data: SystemAlertRecord[] }> {
    const { rows } = await this.db.query(
      `SELECT id, severity, title, message, audience, active,
              created_by, created_by_name, resolved_by, resolved_at, created_at
       FROM system_alerts
       ORDER BY active DESC, created_at DESC, id DESC
       LIMIT $1`,
      [limit],
    );
    const data = camelRows(rows) as unknown as SystemAlertRecord[];
    const active = data.find((item) => item.active) ?? null;
    this.cachedActive = { value: active, expiresAt: Date.now() + SystemAlertsService.CACHE_TTL_MS };
    return { active, data };
  }

  async create(dto: CreateSystemAlertDto, user: AuthUser, ip?: string): Promise<SystemAlertRecord> {
    const severity: SystemAlertSeverity = dto.severity ?? "critical";
    const audience: SystemAlertAudience = dto.audience ?? "all";

    // Tự động đóng cảnh báo cũ đang mở để trên toàn hệ thống chỉ hiển thị 1 dải thông báo khẩn rõ ràng nhất.
    const prevActive = await this.db.query<{ id: number }>(
      `UPDATE system_alerts
       SET active = false, resolved_at = now(), resolved_by = $1
       WHERE active = true
       RETURNING id`,
      [user.id],
    );
    for (const prev of prevActive.rows) {
      await this.notifications.resolveByLink(`#system-alert-${prev.id}`);
    }

    const { rows } = await this.db.query(
      `INSERT INTO system_alerts (severity, title, message, audience, active, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, true, $5, $6)
       RETURNING id, severity, title, message, audience, active,
                 created_by, created_by_name, resolved_by, resolved_at, created_at`,
      [severity, dto.title, dto.message, audience, user.id, user.fullName],
    );
    const created = camelRow(rows[0]) as unknown as SystemAlertRecord;
    this.cachedActive = { value: created, expiresAt: Date.now() + SystemAlertsService.CACHE_TTL_MS };

    const prefix = severity === "critical" ? "[KHẨN] " : "[BẢO TRÌ] ";
    const notifTitle = dto.title.startsWith("[") ? dto.title : `${prefix}${dto.title}`;
    const notifInput = {
      kind: "system" as const,
      title: notifTitle,
      body: dto.message,
      link: `#system-alert-${created.id}`,
    };

    if (audience === "farmer") {
      await this.notifications.notifyAllFarmers(notifInput);
    } else if (audience === "staff") {
      await this.notifications.notifyRoles(STAFF_ROLES, notifInput);
    } else {
      await this.notifications.notifyAllUsers(notifInput);
    }

    await this.audit.write(
      { user, ip },
      {
        action: "Cảnh báo",
        object: "Thông báo khẩn hệ thống",
        detail: `${notifTitle} (${audience === "all" ? "Toàn hệ thống" : audience === "farmer" ? "Hộ nông dân" : "Cán bộ"})`,
      },
    );

    return created;
  }

  async resolve(id: number, user: AuthUser, ip?: string): Promise<SystemAlertRecord> {
    const { rows } = await this.db.query(
      `UPDATE system_alerts
       SET active = false, resolved_at = COALESCE(resolved_at, now()), resolved_by = COALESCE(resolved_by, $2)
       WHERE id = $1
       RETURNING id, severity, title, message, audience, active,
                 created_by, created_by_name, resolved_by, resolved_at, created_at`,
      [id, user.id],
    );
    if (rows.length === 0) throw notFound("Không tìm thấy thông báo khẩn.");

    this.cachedActive = null;
    await this.notifications.resolveByLink(`#system-alert-${id}`);

    const resolved = camelRow(rows[0]) as unknown as SystemAlertRecord;
    await this.audit.write(
      { user, ip },
      {
        action: "Cập nhật",
        object: "Thông báo khẩn hệ thống",
        detail: `Đã đánh dấu khắc phục sự cố: ${resolved.title}`,
      },
    );
    return resolved;
  }
}

