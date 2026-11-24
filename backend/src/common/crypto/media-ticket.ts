import { createHmac, timingSafeEqual } from "node:crypto";

export type MediaTicketBindingKind = "pass" | "grant" | "user";

export interface MediaTicketAuthBinding {
  kind: MediaTicketBindingKind;
  id: number;
  /** Mốc hết hạn cứng của thẻ/quyền tạm (epoch seconds) nếu nhỏ hơn TTL mặc định. */
  maxExpSec?: number | null;
}

export interface VerifiedMediaTicket {
  publicToken: string;
  expSec: number;
  bindingKind: MediaTicketBindingKind;
  bindingId: number;
}

const DEFAULT_TICKET_TTL_SEC = 30 * 60; // 30 phút
const TICKET_PREFIX = "st1";
const BARE_PUBLIC_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const PUBLIC_FILE_URL_RE = /^\/api\/public\/files\/([A-Za-z0-9_-]{16,64})(\/[A-Za-z0-9._-]{1,40})?$/;

function deriveTicketKey(masterSecret: string): Buffer {
  return createHmac("sha256", masterSecret)
    .update("puc:trace-media-ticket:v1", "utf8")
    .digest();
}

/**
 * Tạo token vé ký số ngắn hạn (`st1.<payloadB64Url>.<hmacB64Url>`) chỉ dùng bảng chữ cái `[A-Za-z0-9._-]`:
 * - Ràng buộc trực tiếp với `public_token` của tệp VÀ phiên/thẻ cấp quyền (`pass:<id>`, `grant:<id>`, `user:<id>`).
 * - Khi thẻ thẩm định hoặc quyền truy xuất tạm thời hết hạn / bị thu hồi, vé lập tức mất hiệu lực dù chưa hết 30 phút.
 */
export function signTraceMediaToken(
  publicToken: string,
  binding: MediaTicketAuthBinding,
  masterSecret: string,
  nowMs = Date.now(),
  ttlSec = DEFAULT_TICKET_TTL_SEC,
): string {
  const nowSec = Math.floor(nowMs / 1000);
  const rawExp = nowSec + Math.max(30, ttlSec);
  const expSec =
    typeof binding.maxExpSec === "number" && Number.isFinite(binding.maxExpSec)
      ? Math.min(rawExp, Math.floor(binding.maxExpSec))
      : rawExp;

  const payloadRaw = `${publicToken}|${expSec}|${binding.kind}:${binding.id}`;
  const payloadB64 = Buffer.from(payloadRaw, "utf8").toString("base64url");
  const sigB64 = createHmac("sha256", deriveTicketKey(masterSecret))
    .update(payloadB64, "ascii")
    .digest()
    .subarray(0, 24)
    .toString("base64url");

  return `${TICKET_PREFIX}.${payloadB64}.${sigB64}`;
}

export function isSignedTraceMediaToken(token: string): boolean {
  return typeof token === "string" && token.startsWith(`${TICKET_PREFIX}.`);
}

export function verifyTraceMediaToken(
  token: string,
  masterSecret: string,
  nowMs = Date.now(),
): VerifiedMediaTicket | null {
  if (typeof token !== "string" || token.length < 32 || token.length > 240) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TICKET_PREFIX) {
    return null;
  }
  const [, payloadB64, sigB64] = parts;
  if (
    !payloadB64 ||
    !sigB64 ||
    !/^[A-Za-z0-9_-]+$/.test(payloadB64) ||
    !/^[A-Za-z0-9_-]+$/.test(sigB64)
  ) {
    return null;
  }

  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  if (providedSig.length !== 24) return null;

  const expectedSig = createHmac("sha256", deriveTicketKey(masterSecret))
    .update(payloadB64, "ascii")
    .digest()
    .subarray(0, 24);

  if (!timingSafeEqual(providedSig, expectedSig)) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const fields = decoded.split("|");
  if (fields.length !== 3) return null;
  const [publicToken, expRaw, bindingRaw] = fields;
  if (!publicToken || !BARE_PUBLIC_TOKEN_RE.test(publicToken)) {
    return null;
  }

  const expSec = Number(expRaw);
  const nowSec = Math.floor(nowMs / 1000);
  if (!Number.isInteger(expSec) || expSec <= nowSec) {
    return null;
  }

  const bindMatch = /^(pass|grant|user):(\d+)$/.exec(bindingRaw || "");
  if (!bindMatch) return null;
  const bindingKind = bindMatch[1] as MediaTicketBindingKind;
  const bindingId = Number(bindMatch[2]);
  if (!Number.isInteger(bindingId) || bindingId <= 0) {
    return null;
  }

  return {
    publicToken,
    expSec,
    bindingKind,
    bindingId,
  };
}

/**
 * Chuyển đổi đường dẫn `/api/public/files/<public_token>[/<mediaHint>]` sang đường dẫn gắn vé ký số ngắn hạn.
 */
export function rewritePublicFileUrlWithTicket(
  url: string,
  binding: MediaTicketAuthBinding,
  masterSecret: string,
  nowMs = Date.now(),
): string {
  const m = PUBLIC_FILE_URL_RE.exec(url);
  if (!m) return url;
  const signed = signTraceMediaToken(m[1]!, binding, masterSecret, nowMs);
  return `/api/public/files/${signed}${m[2] ?? ""}`;
}

