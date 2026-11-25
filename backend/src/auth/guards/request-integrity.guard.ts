import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AppException } from "../../common/errors/app.exception";
import {
  type RequestWithVerifiedToken,
  VERIFIED_TOKEN_CACHE_KEY,
} from "../../common/throttler/app-throttler.guard";
import type { AppConfig } from "../../config/configuration";
import { type IntegrityStrikeCode, SecurityDefenseService } from "../security-defense.service";
import { ACCESS_COOKIE, TokensService, type VerifiedAccessToken } from "../tokens.service";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MAX_PAST_CLOCK_SKEW_MS = 120_000; // Cho phép lệch quá khứ 2 phút trên mạng rẫy chập chờn
const MAX_FUTURE_CLOCK_SKEW_MS = 60_000; // Giới hạn lệch tương lai tối đa 60 giây
const NONCE_RETENTION_BUFFER_MS = MAX_PAST_CLOCK_SKEW_MS + MAX_FUTURE_CLOCK_SKEW_MS + 30_000; // >= 210 giây, phủ kín toàn bộ cửa sổ hợp lệ
const MAX_SESSION_NONCE_CACHE_SIZE = 25_000;
const MAX_ANON_NONCE_CACHE_SIZE = 10_000;
const NONCE_FORMAT_RE = /^[A-Za-z0-9_-]{16,64}$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;

function readSingleHeader(req: Request, name: string): string | undefined {
  const val = req.headers[name];
  const raw = Array.isArray(val) ? val[0] : val;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function safeHexEqual(hexA: string, hexB: string): boolean {
  if (hexA.length !== hexB.length) return false;
  try {
    const bufA = Buffer.from(hexA.toLowerCase(), "hex");
    const bufB = Buffer.from(hexB.toLowerCase(), "hex");
    if (bufA.length !== 32 || bufB.length !== 32) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Guard bảo vệ toàn vẹn yêu cầu API & chống bắt gói tin phát lại (Anti-Replay, Anti-Tampering & Active Lockdown):
 * 1. Từ chối ngay thiết bị đang bị cách ly 15 phút (`SECURITY_QUARANTINED`).
 * 2. Kiểm tra dấu thời gian `X-PUC-Timestamp` nằm trong cửa sổ ±120 giây.
 * 3. Kiểm tra mã ngẫu nhiên một lần `X-PUC-Nonce` chưa từng xuất hiện trong bộ đệm chống phát lại.
 * 4. Đối chiếu `X-PUC-Payload-Hash = SHA-256(METHOD + PATH + TIMESTAMP + NONCE + RAW_BODY)`.
 * 5. Đối chiếu chữ ký phiên `X-PUC-Signature = HMAC-SHA256(htx_csrf, payloadHash)`.
 * 6. Khi phát hiện lặp lại hành vi chỉnh sửa/giả mạo qua proxy (Burp Suite), tự động thu hồi phiên đăng nhập,
 *    xóa cookie, khóa tạm thiết bị 15 phút và bắn cảnh báo thời gian thực tới Quản trị viên.
 */
@Injectable()
export class RequestIntegrityGuard implements CanActivate {
  private readonly isTest: boolean;
  private readonly seenSessionNonces = new Map<string, number>();
  private readonly seenAnonNonces = new Map<string, number>();

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly tokens: TokensService,
    private readonly defense: SecurityDefenseService,
  ) {
    this.isTest = config.get("nodeEnv", { infer: true }) === "test";
  }

  private consumeNonce(
    nonceKey: string,
    isAuthenticatedSession: boolean,
    now: number,
    tsMs: number,
  ): boolean {
    const store = isAuthenticatedSession ? this.seenSessionNonces : this.seenAnonNonces;
    const maxCap = isAuthenticatedSession ? MAX_SESSION_NONCE_CACHE_SIZE : MAX_ANON_NONCE_CACHE_SIZE;
    const existingExp = store.get(nonceKey);
    if (existingExp !== undefined && existingExp > now) {
      return false;
    }

    if (store.size >= maxCap) {
      for (const [k, exp] of store) {
        if (exp <= now) {
          store.delete(k);
        }
      }
      if (store.size >= maxCap) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    }

    const expiresAt = Math.max(now, tsMs) + NONCE_RETENTION_BUFFER_MS;
    store.set(nonceKey, expiresAt);
    return true;
  }

  private async rejectWithStrike(
    req: Request,
    res: Response,
    canonicalPath: string,
    method: string,
    verified: VerifiedAccessToken | null,
    code: IntegrityStrikeCode,
    message: string,
  ): Promise<never> {
    const { lockedDown, retryAfterSec } = await this.defense.recordIntegrityStrike({
      ip: req.ip,
      userAgent: readSingleHeader(req, "user-agent"),
      path: canonicalPath,
      method,
      code,
      sessionId: verified?.sessionId,
      userId: verified?.userId,
      res,
    });
    if (lockedDown) {
      res.setHeader("Retry-After", String(retryAfterSec));
      throw new AppException(
        429,
        "Phiên đăng nhập đã bị thu hồi và thiết bị tạm khóa 15 phút do phát hiện hành vi can thiệp gói tin API trái phép.",
        "SECURITY_QUARANTINED",
      );
    }
    throw new AppException(403, message, code);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: string; precomputedPayloadHash?: string }>();
    const res = context.switchToHttp().getResponse<Response>();
    const ua = readSingleHeader(req, "user-agent");
    const cookies = (req.cookies ?? {}) as Record<string, unknown>;
    const rawAccessToken = typeof cookies[ACCESS_COOKIE] === "string" ? cookies[ACCESS_COOKIE] : null;
    const hasAuthCookie = Boolean(rawAccessToken && rawAccessToken.length >= 16);

    const retrySec = this.defense.getQuarantineRemainingSec(req.ip, ua, hasAuthCookie);
    if (retrySec > 0) {
      res.setHeader("Retry-After", String(retrySec));
      throw new AppException(
        429,
        "Thiết bị tạm thời bị khóa truy cập 15 phút do phát hiện hành vi can thiệp gói tin API bất thường.",
        "SECURITY_QUARANTINED",
      );
    }

    const method = (req.method || "GET").toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return true;
    }

    const canonicalPath = (req.originalUrl || req.url || "").split("#")[0] || "/";
    const cleanRoutePath = canonicalPath.split("?")[0] || "/";

    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    const isMultipartUpload =
      contentType.startsWith("multipart/form-data") && method === "POST" && cleanRoutePath === "/api/uploads";

    const tsRaw = readSingleHeader(req, "x-puc-timestamp");
    const nonceRaw = readSingleHeader(req, "x-puc-nonce");
    const hashRaw = readSingleHeader(req, "x-puc-payload-hash");
    const sigRaw = readSingleHeader(req, "x-puc-signature");

    const enforceStrict = !this.isTest || process.env.ANTI_REPLAY_ENFORCE === "true";
    const hasAnyIntegrityHeader = Boolean(tsRaw || nonceRaw || hashRaw || sigRaw);

    if (!enforceStrict && !hasAnyIntegrityHeader) {
      return true;
    }

    const reqWithToken = req as RequestWithVerifiedToken & {
      rawBody?: string;
      precomputedPayloadHash?: string;
    };
    let verified = reqWithToken[VERIFIED_TOKEN_CACHE_KEY];
    if (verified === undefined) {
      verified =
        rawAccessToken && rawAccessToken.length >= 16 && rawAccessToken.length <= 4096
          ? await this.tokens.verifyAccessToken(rawAccessToken)
          : null;
      reqWithToken[VERIFIED_TOKEN_CACHE_KEY] = verified;
    }

    if (!tsRaw || !nonceRaw || !hashRaw) {
      return this.rejectWithStrike(
        req,
        res,
        canonicalPath,
        method,
        verified,
        "INTEGRITY_REQUIRED",
        "Thiếu thông tin xác thực toàn vẹn yêu cầu API.",
      );
    }

    if (!/^\d{10,16}$/.test(tsRaw) || !NONCE_FORMAT_RE.test(nonceRaw) || !HEX64_RE.test(hashRaw)) {
      return this.rejectWithStrike(
        req,
        res,
        canonicalPath,
        method,
        verified,
        "INTEGRITY_MALFORMED",
        "Định dạng mã xác thực toàn vẹn yêu cầu không hợp lệ.",
      );
    }

    const now = Date.now();
    const tsMs = Number(tsRaw);
    if (
      !Number.isFinite(tsMs) ||
      now - tsMs > MAX_PAST_CLOCK_SKEW_MS ||
      tsMs - now > MAX_FUTURE_CLOCK_SKEW_MS
    ) {
      // Lệch đồng hồ thiết bị quá ngưỡng không bị tính điểm phá hoại để tránh khóa nhầm máy nông dân vừa mở lại mạng
      throw new AppException(
        403,
        "Yêu cầu API đã hết hạn hiệu lực thời gian thực. Vui lòng thử lại.",
        "REQUEST_EXPIRED",
      );
    }

    let expectedPayloadHash: string;
    if (typeof req.precomputedPayloadHash === "string" && req.precomputedPayloadHash.length === 64) {
      expectedPayloadHash = req.precomputedPayloadHash;
    } else if (isMultipartUpload) {
      const uploadSha = readSingleHeader(req, "x-upload-sha256");
      const multipartToken = uploadSha ? `multipart:${uploadSha.toLowerCase()}` : "multipart";
      const canonicalPayload = `${method}\n${canonicalPath}\n${tsRaw}\n${nonceRaw}\n${multipartToken}`;
      expectedPayloadHash = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
    } else {
      const rawBodyText =
        typeof req.rawBody === "string"
          ? req.rawBody
          : req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0
            ? JSON.stringify(req.body)
            : "";
      const canonicalPayload = `${method}\n${canonicalPath}\n${tsRaw}\n${nonceRaw}\n${rawBodyText}`;
      expectedPayloadHash = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
    }

    if (!safeHexEqual(hashRaw, expectedPayloadHash)) {
      return this.rejectWithStrike(
        req,
        res,
        canonicalPath,
        method,
        verified,
        "PAYLOAD_TAMPERED",
        "Phát hiện nội dung hoặc đường dẫn yêu cầu API đã bị thay đổi trái phép.",
      );
    }

    let scopePrefix = "anon";
    const isLogoutEndpoint = method === "POST" && cleanRoutePath === "/api/auth/logout";
    if (verified) {
      scopePrefix = `sid:${verified.sessionId}`;
      if (!isLogoutEndpoint || sigRaw) {
        if (!sigRaw || !HEX64_RE.test(sigRaw)) {
          return this.rejectWithStrike(
            req,
            res,
            canonicalPath,
            method,
            verified,
            "SIGNATURE_REQUIRED",
            "Thiếu chữ ký bảo mật của phiên đăng nhập.",
          );
        }
        const expectedKey = this.tokens.deriveCsrfSigningKey(verified.userId, verified.sessionId);
        const expectedSig = createHmac("sha256", expectedKey)
          .update(expectedPayloadHash, "utf8")
          .digest("hex");
        if (!safeHexEqual(sigRaw, expectedSig)) {
          return this.rejectWithStrike(
            req,
            res,
            canonicalPath,
            method,
            verified,
            "INVALID_SIGNATURE",
            "Chữ ký bảo mật của phiên đăng nhập không hợp lệ.",
          );
        }
      }
    }

    if (!this.consumeNonce(`${scopePrefix}:${nonceRaw}`, Boolean(verified), now, tsMs)) {
      return this.rejectWithStrike(
        req,
        res,
        canonicalPath,
        method,
        verified,
        "REPLAY_DETECTED",
        "Phát hiện yêu cầu bị gửi lặp lại trái phép (Replay Attack).",
      );
    }

    return true;
  }
}
