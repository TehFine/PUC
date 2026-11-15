import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, "").replace(/[\s-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error("Invalid Base32 secret");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Sinh khóa bí mật TOTP ngẫu nhiên 160-bit (20 bytes) dạng Base32 chuẩn RFC 6238. */
export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

/** Tạo URI otpauth:// tương thích Google Authenticator, Microsoft Authenticator, iOS Passwords. */
export function buildOtpAuthUrl(params: { secret: string; accountName: string; issuer?: string }): string {
  const issuer = params.issuer || "HTX Cu Ne";
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(params.accountName)}`;
  const qs = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${qs.toString()}`;
}

/** Sinh mã TOTP 6 chữ số tại thời điểm chỉ định (mặc định: hiện tại). */
export function generateTotpCode(secretBase32: string, timestampMs = Date.now()): string {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / STEP_SECONDS);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** DIGITS;
  return String(otp).padStart(DIGITS, "0");
}

/** Xác minh mã TOTP 6 chữ số với biên độ lệch đồng hồ ±window chu kỳ 30 giây, dùng so sánh hằng thời gian. */
export function verifyTotpCode(secretBase32: string, rawCode: string, windowSteps = 1, timestampMs = Date.now()): boolean {
  const clean = rawCode.replace(/\s+/g, "");
  if (!/^[0-9]{6}$/.test(clean)) return false;
  let secretOk = true;
  try {
    decodeBase32(secretBase32);
  } catch {
    secretOk = false;
  }
  if (!secretOk) return false;

  const candidateBuf = Buffer.from(clean, "utf8");
  let matched = false;
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const expected = generateTotpCode(secretBase32, timestampMs + delta * STEP_SECONDS * 1000);
    const expectedBuf = Buffer.from(expected, "utf8");
    if (expectedBuf.length === candidateBuf.length && timingSafeEqual(expectedBuf, candidateBuf)) {
      matched = true;
    }
  }
  return matched;
}

const BACKUP_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function hashBackupCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  return createHash("sha256").update(`puc-2fa-backup-v1:${normalized}`).digest("hex");
}

/** Sinh bộ 8 mã khôi phục dự phòng một lần (định dạng XXXX-XXXX) kèm bản băm SHA-256 lưu DB. */
export function generateBackupCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let raw = "";
    for (let j = 0; j < 8; j++) {
      raw += BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length];
    }
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plainCodes.push(formatted);
    hashedCodes.push(hashBackupCode(formatted));
  }
  return { plainCodes, hashedCodes };
}

