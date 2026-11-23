import { Injectable, Logger } from "@nestjs/common";
import type { Response } from "express";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TokensService } from "./tokens.service";

export type IntegrityStrikeCode =
  | "INTEGRITY_REQUIRED"
  | "INTEGRITY_MALFORMED"
  | "PAYLOAD_TAMPERED"
  | "SIGNATURE_REQUIRED"
  | "INVALID_SIGNATURE"
  | "REPLAY_DETECTED";

interface StrikeBucket {
  score: number;
  count: number;
  windowStart: number;
  updatedAt: number;
}

interface QuarantineRecord {
  until: number;
  reason: string;
}

const STRIKE_WINDOW_MS = 60_000;
const STRIKE_THRESHOLD = 6; // Ví dụ: 3 lần sửa gói tin PAYLOAD_TAMPERED / INVALID_SIGNATURE (3 x 2 = 6) hoặc 6 lần phát lại gói tin trong 60 giây
const QUARANTINE_TTL_MS = 15 * 60_000; // Khóa tạm thiết bị vi phạm trong 15 phút
const ALERT_COOLDOWN_MS = 5 * 60_000; // Chống dội thông báo trùng lặp trong 5 phút
const MAX_TRACKED_KEYS = 10_000;

const SCRIPTING_TOOL_PATTERNS: ReadonlyArray< readonly [RegExp, string]> = [
  [/\bpython(?:-requests|-httpx|-urllib|\/|\b)/i, "tool:python"],
  [/\bcurl\b/i, "tool:curl"],
  [/\bpostmanruntime\b|\bpostman\b/i, "tool:postman"],
  [/\binsomnia\b/i, "tool:insomnia"],
  [/\bgo-http-client\b/i, "tool:go-http"],
  [/\bnode-superagent\b|\bsuperagent\b/i, "tool:superagent"],
  [/\baxios\b/i, "tool:axios"],
  [/\bundici\b|\bnode-fetch\b/i, "tool:node"],
  [/\bwget\b/i, "tool:wget"],
  [/\bpowershell\b|\bwindows-powershell\b/i, "tool:powershell"],
  [/\bokhttp\b/i, "tool:okhttp"],
  [/\bjava\//i, "tool:java"],
  [/\bburp\b|\bportswigger\b/i, "tool:burp"],
];

/**
 * Rút trích dấu hiệu chuẩn hóa Hệ điều hành + Họ trình duyệt/công cụ từ `User-Agent`:
 * - Chấp nhận trình duyệt tự cập nhật phiên bản nhỏ/lớn (ví dụ Chrome 131 lên Chrome 132 trên Windows vẫn là `windows:chrome`).
 * - Phát hiện tức thì hành vi đánh cắp cookie từ trình duyệt dán sang công cụ khác (`python`, `curl`, `Postman`, hệ điều hành khác, trình duyệt khác).
 */
export function computeSessionAgentFingerprint(rawUa: string | null | undefined): string {
  const trimmed = typeof rawUa === "string" ? rawUa.trim() : "";
  if (!trimmed) return "empty";

  for (const [re, label] of SCRIPTING_TOOL_PATTERNS) {
    if (re.test(trimmed)) return label;
  }

  const lower = trimmed.toLowerCase();

  let os = "other-os";
  if (lower.includes("android")) {
    os = "android";
  } else if (lower.includes("iphone") || lower.includes("ipad") || lower.includes("ipod")) {
    os = "ios";
  } else if (lower.includes("windows")) {
    os = "windows";
  } else if (lower.includes("macintosh") || lower.includes("mac os x")) {
    os = "macos";
  } else if (lower.includes("cros")) {
    os = "cros";
  } else if (lower.includes("linux")) {
    os = "linux";
  }

  let browser = "other-ua";
  if (lower.includes("edg/") || lower.includes("edgios/") || lower.includes("edga/")) {
    browser = "edge";
  } else if (lower.includes("opr/") || lower.includes("opera")) {
    browser = "opera";
  } else if (lower.includes("samsungbrowser/")) {
    browser = "samsung";
  } else if (lower.includes("coc_coc_browser")) {
    browser = "coccoc";
  } else if (lower.includes("zalo")) {
    browser = "zalo";
  } else if (lower.includes("firefox/") || lower.includes("fxios/")) {
    browser = "firefox";
  } else if (lower.includes("chrome/") || lower.includes("crios/") || lower.includes("headlesschrome/")) {
    browser = "chrome";
  } else if (lower.includes("safari/")) {
    browser = "safari";
  } else if (lower.includes("; wv)") || lower.includes("webview")) {
    browser = "webview";
  } else {
    const firstToken = lower.split(/[\s/]+/)[0]?.replace(/[^a-z0-9_-]/g, "").slice(0, 24);
    if (firstToken) {
      browser = `custom:${firstToken}`;
    }
  }

  return `${os}:${browser}`;
}

export function isSessionAgentCompatible(
  boundUa: string | null | undefined,
  currentUa: string | null | undefined,
): boolean {
  const boundFp = computeSessionAgentFingerprint(boundUa);
  const currFp = computeSessionAgentFingerprint(currentUa);
  return boundFp === currFp;
}

function normalizeIp(ip: string | undefined): string {
  const raw = (ip || "unknown").trim().toLowerCase();
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function weightForStrike(code: IntegrityStrikeCode): number {
  switch (code) {
    case "PAYLOAD_TAMPERED":
    case "INVALID_SIGNATURE":
      return 2;
    case "SIGNATURE_REQUIRED":
    case "INTEGRITY_MALFORMED":
    case "REPLAY_DETECTED":
    case "INTEGRITY_REQUIRED":
      return 1;
  }
}

@Injectable()
export class SecurityDefenseService {
  private readonly logger = new Logger(SecurityDefenseService.name);
  private readonly strikes = new Map<string, StrikeBucket>();
  private readonly quarantinedClients = new Map<string, QuarantineRecord>();
  private readonly lastAlertAt = new Map<string, number>();

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tokens: TokensService,
  ) {}

  clearState(): void {
    this.strikes.clear();
    this.quarantinedClients.clear();
    this.lastAlertAt.clear();
  }

  private clientKeyOf(ip: string | undefined, rawUa: string | undefined): string {
    return `${normalizeIp(ip)}|${computeSessionAgentFingerprint(rawUa)}`;
  }

  private pruneMaps(now: number): void {
    if (this.strikes.size > MAX_TRACKED_KEYS) {
      for (const [k, v] of this.strikes) {
        if (now - v.updatedAt > STRIKE_WINDOW_MS) {
          this.strikes.delete(k);
        }
      }
      if (this.strikes.size > MAX_TRACKED_KEYS) {
        const oldest = this.strikes.keys().next().value;
        if (oldest !== undefined) this.strikes.delete(oldest);
      }
    }

    if (this.quarantinedClients.size > MAX_TRACKED_KEYS) {
      for (const [k, v] of this.quarantinedClients) {
        if (v.until <= now) {
          this.quarantinedClients.delete(k);
        }
      }
      if (this.quarantinedClients.size > MAX_TRACKED_KEYS) {
        const oldest = this.quarantinedClients.keys().next().value;
        if (oldest !== undefined) this.quarantinedClients.delete(oldest);
      }
    }

    if (this.lastAlertAt.size > MAX_TRACKED_KEYS) {
      for (const [k, ts] of this.lastAlertAt) {
        if (now - ts > ALERT_COOLDOWN_MS) {
          this.lastAlertAt.delete(k);
        }
      }
    }
  }

  private bumpStrike(key: string, weight: number, now: number): StrikeBucket {
    const prev = this.strikes.get(key);
    if (!prev || now - prev.windowStart > STRIKE_WINDOW_MS) {
      const fresh: StrikeBucket = { score: weight, count: 1, windowStart: now, updatedAt: now };
      this.strikes.set(key, fresh);
      return fresh;
    }
    const next: StrikeBucket = {
      score: prev.score + weight,
      count: prev.count + 1,
      windowStart: prev.windowStart,
      updatedAt: now,
    };
    this.strikes.set(key, next);
    return next;
  }

  private canEmitAlert(alertKey: string, now: number): boolean {
    const last = this.lastAlertAt.get(alertKey);
    if (last !== undefined && now - last < ALERT_COOLDOWN_MS) {
      return false;
    }
    this.lastAlertAt.set(alertKey, now);
    return true;
  }

  getQuarantineRemainingSec(ip: string | undefined, rawUa: string | undefined): number {
    const key = this.clientKeyOf(ip, rawUa);
    const rec = this.quarantinedClients.get(key);
    if (!rec) return 0;
    const now = Date.now();
    if (rec.until <= now) {
      this.quarantinedClients.delete(key);
      return 0;
    }
    return Math.max(1, Math.ceil((rec.until - now) / 1000));
  }

  /**
   * Ghi nhận vi phạm toàn vẹn gói tin API (chỉnh sửa JSON/URL qua Burp Suite, giả mạo chữ ký, phát lại gói tin).
   * Khi vượt ngưỡng trong 60 giây: tự động thu hồi phiên đăng nhập ngay trong cơ sở dữ liệu, xóa cookie,
   * khóa tạm thiết bị 15 phút, ghi nhật ký kiểm toán và đẩy cảnh báo thời gian thực tới Quản trị viên.
   */
  async recordIntegrityStrike(params: {
    ip?: string;
    userAgent?: string;
    path: string;
    method: string;
    code: IntegrityStrikeCode;
    sessionId?: number;
    userId?: number;
    res?: Response;
  }): Promise<{ lockedDown: boolean; retryAfterSec: number }> {
    const now = Date.now();
    this.pruneMaps(now);

    const weight = weightForStrike(params.code);
    const clientKey = this.clientKeyOf(params.ip, params.userAgent);
    const clientBucket = this.bumpStrike(`cli:${clientKey}`, weight, now);
    const sessionBucket =
      params.sessionId !== undefined
        ? this.bumpStrike(`sid:${params.sessionId}`, weight, now)
        : null;

    const maxScore = Math.max(clientBucket.score, sessionBucket?.score ?? 0);
    if (maxScore < STRIKE_THRESHOLD) {
      return { lockedDown: false, retryAfterSec: 0 };
    }

    const until = now + QUARANTINE_TTL_MS;
    this.quarantinedClients.set(clientKey, { until, reason: params.code });
    this.strikes.delete(`cli:${clientKey}`);
    if (params.sessionId !== undefined) {
      this.strikes.delete(`sid:${params.sessionId}`);
    }

    if (params.res) {
      this.tokens.clearAuthCookies(params.res);
    }

    let actorInfo: { id: number | null; name: string; username: string | null } = {
      id: null,
      name: "Khách (chưa xác thực)",
      username: null,
    };

    if (params.sessionId && params.userId) {
      try {
        await this.db.query(
          `UPDATE refresh_tokens
           SET revoked_at = now(), revoked_reason = 'security'
           WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
          [params.sessionId, params.userId],
        );
        const uRes = await this.db.query<{ full_name: string; username: string }>(
          "SELECT full_name, username FROM users WHERE id = $1",
          [params.userId],
        );
        if (uRes.rows[0]) {
          actorInfo = {
            id: params.userId,
            name: uRes.rows[0].full_name,
            username: uRes.rows[0].username,
          };
        }
      } catch (error) {
        this.logger.error(
          `Lỗi khi thu hồi phiên vi phạm toàn vẹn #${params.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const alertKey = params.sessionId ? `tamper:sid:${params.sessionId}` : `tamper:cli:${clientKey}`;
    if (this.canEmitAlert(alertKey, now)) {
      const cleanIp = normalizeIp(params.ip);
      const targetLabel = actorInfo.username || "Thiết bị chưa đăng nhập";
      const detailText = params.sessionId
        ? `Thu hồi phiên #${params.sessionId} và tạm khóa thiết bị 15 phút do phát hiện can thiệp hoặc phát lại gói tin trái phép (${params.code}) tại IP ${cleanIp}.`
        : `Tạm khóa thiết bị 15 phút do phát hiện can thiệp hoặc phát lại gói tin trái phép (${params.code}) tại IP ${cleanIp}.`;

      await this.audit.write(
        { ip: params.ip },
        {
          action: "Chặn can thiệp gói tin API",
          object: targetLabel,
          detail: detailText,
        },
        actorInfo.id !== null ? { id: actorInfo.id, name: actorInfo.name } : undefined,
      );

      await this.notifications.notifyRoles(["admin", "htx_head"], {
        kind: "system",
        title: "Cảnh báo bảo mật: Chặn hành vi can thiệp gói tin API",
        body: actorInfo.username
          ? `Tài khoản ${actorInfo.name} (${actorInfo.username}) vừa bị thu hồi phiên #${params.sessionId} và khóa tạm 15 phút do sửa hoặc phát lại gói tin bất thường từ IP ${cleanIp}.`
          : `Một thiết bị tại IP ${cleanIp} vừa bị khóa tạm 15 phút do liên tục gửi gói tin API giả mạo hoặc phát lại trái phép.`,
        link: "/admin?section=system",
      });
    }

    return {
      lockedDown: true,
      retryAfterSec: Math.ceil(QUARANTINE_TTL_MS / 1000),
    };
  }

  /**
   * Xử lý tức thời khi phát hiện cookie xác thực (`htx_access` / `htx_refresh`) của một phiên đang hoạt động
   * bị sao chép và mang sang công cụ/thiết bị khác (`curl`, `python`, `Postman`, trình duyệt hoặc hệ điều hành khác).
   */
  async handleSessionBindingViolation(params: {
    userId: number;
    username: string;
    fullName: string;
    sessionId: number;
    ip?: string;
    expectedUa?: string | null;
    actualUa?: string | null;
    revokeAll?: boolean;
    res?: Response;
  }): Promise<void> {
    if (params.res) {
      this.tokens.clearAuthCookies(params.res);
    }

    try {
      if (params.revokeAll) {
        await Promise.all([
          this.db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [params.userId]),
          this.db.query(
            "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'security' WHERE user_id = $1 AND revoked_at IS NULL",
            [params.userId],
          ),
        ]);
      } else {
        await this.db.query(
          `UPDATE refresh_tokens
           SET revoked_at = now(), revoked_reason = 'security'
           WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
          [params.sessionId, params.userId],
        );
      }
    } catch (error) {
      this.logger.error(
        `Lỗi thu hồi phiên nghi vấn đánh cắp #${params.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const now = Date.now();
    const alertKey = `bind:u:${params.userId}:s:${params.sessionId}`;
    if (!this.canEmitAlert(alertKey, now)) return;

    const cleanIp = normalizeIp(params.ip);
    const expectedFp = computeSessionAgentFingerprint(params.expectedUa);
    const actualFp = computeSessionAgentFingerprint(params.actualUa);

    await this.audit.write(
      { ip: params.ip },
      {
        action: "Chặn đánh cắp phiên đăng nhập",
        object: params.username,
        detail: `Đã thu hồi phiên #${params.sessionId} do dấu hiệu thiết bị chuyển bất thường từ ${expectedFp} sang ${actualFp} tại IP ${cleanIp}.`,
      },
      { id: params.userId, name: params.fullName },
    );

    await Promise.all([
      this.notifications.notifyRoles(["admin", "htx_head"], {
        kind: "system",
        title: "Cảnh báo bảo mật: Chặn nghi vấn đánh cắp cookie phiên",
        body: `Phiên #${params.sessionId} của tài khoản ${params.fullName} (${params.username}) vừa bị thu hồi tự động do xuất hiện trên công cụ hoặc thiết bị lạ (${actualFp}) từ IP ${cleanIp}.`,
        link: "/admin?section=system",
      }),
      this.notifications.notifyUsers([params.userId], {
        kind: "system",
        title: "Đã thu hồi một phiên đăng nhập có dấu hiệu bất thường",
        body: `Hệ thống phát hiện phiên đăng nhập của bạn được sử dụng từ môi trường khác với lúc đăng nhập nên đã tự động hủy phiên để bảo vệ tài khoản.`,
        link: "/login",
      }),
    ]);
  }
}

