import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { AuthUser } from "../../auth/auth-user";
import { verifyPlotGpsProximity, type PlotGpsVerificationResult } from "../../common/geo/plot-proximity";
import { hasPublicColumn, hasPublicTable } from "../../common/sql/schema-cache";
import type { DatabaseService } from "../../database/database.service";

export type FieldCaptureSource = "in_app_camera" | "camera" | "upload" | "system";
export type FieldTrustLevel = 1 | 2 | 3;

export interface ServerTimeAnchorPayload {
  token: string;
  serverTimeMs: number;
  maxAgeDays: number;
}

export interface EvaluateFieldEvidenceInput {
  plotCode?: string | null;
  activityDateIso: string;
  todayVnIso: string;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracyM?: number | null;
  captureSource?: FieldCaptureSource | null;
  clientCapturedAt?: string | null;
  timeAnchorToken?: string | null;
  monotonicElapsedMs?: number | null;
  offlineQueued?: boolean | null;
  signboardQrToken?: string | null;
  serverNow?: Date;
}

export interface EvaluatedFieldEvidence {
  gpsCheck: PlotGpsVerificationResult;
  gpsAccuracyM: number | null;
  captureSource: FieldCaptureSource;
  clientCapturedAt: string | null;
  offlineQueued: boolean;
  signboardQrVerified: boolean;
  trustLevel: FieldTrustLevel;
  trustFlags: string[];
}

const ANCHOR_MAX_AGE_MS = 30 * 86_400_000;
const ANCHOR_DEFAULT_DAYS = 14;
const FUTURE_CLOCK_TOLERANCE_MS = 3 * 60_000;
const ROLLBACK_CLOCK_TOLERANCE_MS = 2 * 60_000;
const MONOTONIC_DRIFT_TOLERANCE_MS = 10 * 60_000;

function deriveTimeAnchorSecret(): Buffer {
  const baseSecret =
    process.env.JWT_ACCESS_SECRET ||
    "puc-dev-fallback-time-anchor-secret-do-not-use-in-prod";
  return createHmac("sha256", baseSecret)
    .update("puc:portal-offline-time-anchor:v1")
    .digest();
}

function diffIsoDays(laterIso: string, earlierIso: string): number {
  const a = Date.parse(`${laterIso}T00:00:00Z`);
  const b = Date.parse(`${earlierIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

function toVnDateIsoFromMs(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochMs));
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Cấp vé neo thời gian máy chủ có chữ ký HMAC-SHA256 để thiết bị nông hộ lưu trước khi lên rẫy mất sóng:
 * Định dạng: `v1.<userId>.<householdId>.<issuedAtMs>.<nonce>.<hexSig>`
 */
export function issueServerTimeAnchor(
  user: Pick<AuthUser, "id" | "householdId">,
  nowMs = Date.now(),
): ServerTimeAnchorPayload {
  const safeTs = Math.floor(nowMs);
  const hhId = user.householdId ?? 0;
  const nonce = randomBytes(6).toString("hex");
  const body = `v1.${user.id}.${hhId}.${safeTs}.${nonce}`;
  const sig = createHmac("sha256", deriveTimeAnchorSecret())
    .update(body)
    .digest("hex");
  return {
    token: `${body}.${sig}`,
    serverTimeMs: safeTs,
    maxAgeDays: ANCHOR_DEFAULT_DAYS,
  };
}

export function verifyServerTimeAnchor(
  rawToken: string | null | undefined,
  user: Pick<AuthUser, "id" | "householdId">,
  nowMs = Date.now(),
): { valid: boolean; issuedAtMs: number | null } {
  if (!rawToken || typeof rawToken !== "string") {
    return { valid: false, issuedAtMs: null };
  }
  const parts = rawToken.trim().split(".");
  if (parts.length !== 6 || parts[0] !== "v1") {
    return { valid: false, issuedAtMs: null };
  }
  const [, uidStr, hhStr, tsStr, nonce, givenSig] = parts;
  if (!/^\d+$/.test(uidStr) || !/^\d+$/.test(hhStr) || !/^\d{10,15}$/.test(tsStr) || !/^[a-f0-9]{8,24}$/i.test(nonce)) {
    return { valid: false, issuedAtMs: null };
  }
  if (!/^[a-f0-9]{64}$/i.test(givenSig)) {
    return { valid: false, issuedAtMs: null };
  }
  if (Number(uidStr) !== Number(user.id) || Number(hhStr) !== Number(user.householdId ?? 0)) {
    return { valid: false, issuedAtMs: null };
  }
  const issuedAtMs = Number(tsStr);
  if (!Number.isFinite(issuedAtMs) || issuedAtMs > nowMs + 60_000 || nowMs - issuedAtMs > ANCHOR_MAX_AGE_MS) {
    return { valid: false, issuedAtMs: null };
  }

  const body = `v1.${uidStr}.${hhStr}.${tsStr}.${nonce}`;
  const expectedBuf = createHmac("sha256", deriveTimeAnchorSecret())
    .update(body)
    .digest();
  const givenBuf = Buffer.from(givenSig, "hex");
  if (expectedBuf.length !== givenBuf.length || !timingSafeEqual(expectedBuf, givenBuf)) {
    return { valid: false, issuedAtMs: null };
  }
  return { valid: true, issuedAtMs };
}

function extractCleanQrToken(raw: string): string {
  const trimmed = raw.trim();
  const tokenMatch = /(?:^|\/)t\/([A-Za-z0-9_-]{4,80})(?:[/?#]|$)/.exec(trimmed);
  if (tokenMatch?.[1]) return tokenMatch[1].trim();
  const traceMatch = /(?:^|\/)trace\/([^/?#\s]+)(?:[/?#]|$)/.exec(trimmed);
  if (traceMatch?.[1]) return decodeURIComponent(traceMatch[1]).trim();
  return trimmed.slice(0, 80);
}

/**
 * Xác thực mã QR biển vườn vật lý do nông hộ quét trực tiếp tại thửa đất khi ghi nhật ký (không cần mạng lúc quét).
 */
export async function verifyPlotSignboardQrToken(
  db: DatabaseService,
  householdId: number,
  plotCode: string | null | undefined,
  rawQrToken: string | null | undefined,
): Promise<{ provided: boolean; verified: boolean }> {
  if (!rawQrToken || !rawQrToken.trim() || !plotCode || !plotCode.trim()) {
    return { provided: false, verified: false };
  }
  const cleanPlot = plotCode.trim();
  const cleanToken = extractCleanQrToken(rawQrToken);
  if (!cleanToken || cleanToken.length < 4) {
    return { provided: true, verified: false };
  }
  // Không chấp nhận việc gửi chính mã thửa công khai làm bằng chứng biển QR bí mật
  if (cleanToken.toUpperCase() === cleanPlot.toUpperCase()) {
    return { provided: true, verified: false };
  }

  if ((await hasPublicTable(db, "plots")) && (await hasPublicColumn(db, "plots", "qr_token"))) {
    const plotRes = await db.query(
      `SELECT 1
       FROM plots
       WHERE household_id = $1
         AND upper(btrim(code)) = upper(btrim($2))
         AND qr_token IS NOT NULL
         AND btrim(qr_token) = $3
       LIMIT 1`,
      [householdId, cleanPlot, cleanToken],
    );
    if ((plotRes.rowCount ?? 0) > 0) {
      return { provided: true, verified: true };
    }
  }

  if (await hasPublicTable(db, "plot_signboard_tokens")) {
    const sbRes = await db.query(
      `SELECT 1
       FROM plot_signboard_tokens
       WHERE household_id = $1
         AND upper(btrim(plot_code)) = upper(btrim($2))
         AND qr_token IS NOT NULL
         AND btrim(qr_token) = $3
       LIMIT 1`,
      [householdId, cleanPlot, cleanToken],
    );
    if ((sbRes.rowCount ?? 0) > 0) {
      return { provided: true, verified: true };
    }
  }

  return { provided: true, verified: false };
}

/**
 * Đánh giá đa tầng bằng chứng hiện trường (Camera trực tiếp, GPS đa giác PostGIS, Biển QR vườn,
 * Kẹp mốc thời gian máy chủ 2 đầu + Đồng hồ đơn điệu) và gán mức độ tin cậy 1 / 2 / 3.
 */
export async function evaluateFieldEvidence(
  db: DatabaseService,
  user: Pick<AuthUser, "id" | "householdId">,
  input: EvaluateFieldEvidenceInput,
): Promise<EvaluatedFieldEvidence> {
  const serverNow = input.serverNow ?? new Date();
  const serverNowMs = serverNow.getTime();
  const householdId = Number(user.householdId ?? 0);

  const safeAccuracy =
    input.gpsAccuracyM !== null &&
    input.gpsAccuracyM !== undefined &&
    Number.isFinite(Number(input.gpsAccuracyM)) &&
    Number(input.gpsAccuracyM) >= 0
      ? Number(Number(input.gpsAccuracyM).toFixed(1))
      : null;

  const captureSource: FieldCaptureSource =
    input.captureSource === "in_app_camera" ||
    input.captureSource === "camera" ||
    input.captureSource === "upload" ||
    input.captureSource === "system"
      ? input.captureSource
      : "camera";

  const offlineQueued = Boolean(input.offlineQueued);

  const [gpsCheck, signboardCheck] = await Promise.all([
    verifyPlotGpsProximity(db, input.plotCode, input.latitude, input.longitude, safeAccuracy),
    householdId > 0
      ? verifyPlotSignboardQrToken(db, householdId, input.plotCode, input.signboardQrToken)
      : Promise.resolve({ provided: false, verified: false }),
  ]);

  const flags = new Set<string>();

  if (captureSource === "in_app_camera") {
    flags.add("in_app_camera");
  } else if (captureSource === "upload") {
    flags.add("gallery_upload");
  }

  if (signboardCheck.verified) {
    flags.add("signboard_qr");
  } else if (signboardCheck.provided) {
    flags.add("invalid_signboard_qr");
  }

  const hasCoords =
    input.latitude !== null &&
    input.latitude !== undefined &&
    input.longitude !== null &&
    input.longitude !== undefined &&
    Number.isFinite(Number(input.latitude)) &&
    Number.isFinite(Number(input.longitude));

  if (hasCoords) {
    if (safeAccuracy !== null && safeAccuracy > 120) {
      flags.add("low_gps_accuracy");
    }
    if (gpsCheck.verified) {
      flags.add("inside_plot");
    } else if (gpsCheck.plotFound) {
      flags.add("outside_plot");
    }
  } else {
    flags.add("missing_gps");
  }

  // Kiểm chứng mốc giờ chụp hiện trường bằng cửa sổ kẹp máy chủ 2 đầu (anchorIssuedAt <= capturedAt <= serverNow)
  // kết hợp khoảng trôi đồng hồ đơn điệu performance.now()
  const anchorCheck = verifyServerTimeAnchor(input.timeAnchorToken, user, serverNowMs);
  if (anchorCheck.valid) {
    flags.add("time_anchored");
  }

  const parsedDeviceMs =
    input.clientCapturedAt && typeof input.clientCapturedAt === "string"
      ? Date.parse(input.clientCapturedAt)
      : NaN;
  const hasDeviceTime =
    Number.isFinite(parsedDeviceMs) &&
    parsedDeviceMs > Date.UTC(2020, 0, 1) &&
    parsedDeviceMs < serverNowMs + 365 * 86_400_000;

  let effectiveCapturedMs: number | null = hasDeviceTime ? parsedDeviceMs : null;
  let clockSkew = false;

  if (hasDeviceTime && parsedDeviceMs > serverNowMs + FUTURE_CLOCK_TOLERANCE_MS) {
    clockSkew = true;
  }

  if (anchorCheck.valid && anchorCheck.issuedAtMs !== null) {
    if (hasDeviceTime && parsedDeviceMs < anchorCheck.issuedAtMs - ROLLBACK_CLOCK_TOLERANCE_MS) {
      clockSkew = true;
    }

    const monoMs =
      input.monotonicElapsedMs !== null &&
      input.monotonicElapsedMs !== undefined &&
      Number.isFinite(Number(input.monotonicElapsedMs)) &&
      Number(input.monotonicElapsedMs) >= 0
        ? Number(input.monotonicElapsedMs)
        : null;

    if (monoMs !== null) {
      const monotonicTrueMs = anchorCheck.issuedAtMs + monoMs;
      if (monotonicTrueMs > serverNowMs + FUTURE_CLOCK_TOLERANCE_MS) {
        clockSkew = true;
      } else {
        if (hasDeviceTime && Math.abs(parsedDeviceMs - monotonicTrueMs) > MONOTONIC_DRIFT_TOLERANCE_MS) {
          clockSkew = true;
        }
        effectiveCapturedMs = monotonicTrueMs;
      }
    }
  }

  if (effectiveCapturedMs !== null && !clockSkew) {
    const capturedDateVn = toVnDateIsoFromMs(effectiveCapturedMs);
    if (input.activityDateIso > capturedDateVn) {
      clockSkew = true;
    }
  }

  if (clockSkew) {
    flags.add("clock_skew");
  }

  if (offlineQueued) {
    flags.add("offline_sync");
  }

  const backdatedDays = Math.max(0, diffIsoDays(input.todayVnIso, input.activityDateIso));
  const syncDelayHours =
    effectiveCapturedMs !== null && !clockSkew
      ? Math.max(0, (serverNowMs - effectiveCapturedMs) / 3_600_000)
      : backdatedDays * 24;

  if (backdatedDays > 2 || syncDelayHours > 72) {
    flags.add("late_sync");
  }

  let trustLevel: FieldTrustLevel = 2;
  if (
    flags.has("clock_skew") ||
    flags.has("outside_plot") ||
    flags.has("invalid_signboard_qr") ||
    flags.has("gallery_upload") ||
    backdatedDays > 3 ||
    syncDelayHours > 72
  ) {
    trustLevel = 3;
  } else if (
    (captureSource === "in_app_camera" || captureSource === "camera" || captureSource === "system") &&
    (gpsCheck.verified || signboardCheck.verified) &&
    (safeAccuracy === null || safeAccuracy <= 65) &&
    backdatedDays <= 2 &&
    syncDelayHours <= 48
  ) {
    trustLevel = 1;
  }

  const clientCapturedAtIso =
    effectiveCapturedMs !== null
      ? new Date(Math.min(effectiveCapturedMs, serverNowMs)).toISOString()
      : hasDeviceTime
        ? new Date(parsedDeviceMs).toISOString()
        : null;

  return {
    gpsCheck,
    gpsAccuracyM: safeAccuracy,
    captureSource,
    clientCapturedAt: clientCapturedAtIso,
    offlineQueued,
    signboardQrVerified: signboardCheck.verified,
    trustLevel,
    trustFlags: Array.from(flags),
  };
}

