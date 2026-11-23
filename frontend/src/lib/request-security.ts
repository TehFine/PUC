/**
 * Lớp bảo vệ toàn vẹn yêu cầu API phía trình duyệt (Chống bắt gói tin, phát lại & chỉnh sửa tham số):
 * - Sinh mã ngẫu nhiên một lần 128-bit (`X-PUC-Nonce`) bằng Web Crypto CSPRNG cho từng yêu cầu thay đổi dữ liệu.
 * - Đính kèm dấu thời gian đã hiệu chuẩn đồng hồ máy chủ (`X-PUC-Timestamp`, hiệu lực 120 giây).
 * - Tính mã băm ràng buộc toàn vẹn (`X-PUC-Payload-Hash = SHA-256(METHOD + PATH + TIMESTAMP + NONCE + BODY)`):
 *   mọi can thiệp đổi đường dẫn API, phương thức HTTP hoặc nội dung JSON qua công cụ proxy đều làm lệch mã băm.
 * - Khi có khóa phiên `htx_csrf` do máy chủ cấp theo phiên đăng nhập, ký xác thực `X-PUC-Signature = HMAC-SHA256`.
 */

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256Bytes(msg: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLen = msg.length * 8;
  const padLen = ((msg.length + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function sha256HexUtf8(text: string): string {
  return bytesToHex(sha256Bytes(new TextEncoder().encode(text)));
}

export function hmacSha256Hex(keyText: string, messageText: string): string {
  const enc = new TextEncoder();
  let keyBytes = enc.encode(keyText);
  if (keyBytes.length > 64) {
    keyBytes = new Uint8Array(sha256Bytes(keyBytes));
  }
  const paddedKey = new Uint8Array(64);
  paddedKey.set(keyBytes);

  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c;
    iKeyPad[i] = paddedKey[i] ^ 0x36;
  }

  const msgBytes = enc.encode(messageText);
  const innerInput = new Uint8Array(64 + msgBytes.length);
  innerInput.set(iKeyPad);
  innerInput.set(msgBytes, 64);
  const innerHash = sha256Bytes(innerInput);

  const outerInput = new Uint8Array(64 + 32);
  outerInput.set(oKeyPad);
  outerInput.set(innerHash, 64);
  return bytesToHex(sha256Bytes(outerInput));
}

export function generateRequestNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += alphabet[bytes[i] & 63];
  }
  return out;
}

const CSRF_COOKIE_NAME = "htx_csrf";

export function readCsrfSigningCookie(): string | null {
  if (typeof document === "undefined" || !document.cookie) return null;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === CSRF_COOKIE_NAME) {
      const val = decodeURIComponent(part.slice(eq + 1).trim());
      return val.length >= 16 ? val : null;
    }
  }
  return null;
}

export function buildSignedSecurityHeaders(
  method: string,
  fullApiPath: string,
  rawBody: string | undefined,
  calibratedNowMs: number,
): Record<string, string> {
  const upperMethod = method.toUpperCase();
  const normalizedPath = fullApiPath.startsWith("/api") ? fullApiPath : `/api${fullApiPath}`;
  const ts = String(Math.round(calibratedNowMs));
  const nonce = generateRequestNonce();
  const bodyText = rawBody ?? "";
  const canonical = `${upperMethod}\n${normalizedPath}\n${ts}\n${nonce}\n${bodyText}`;
  const payloadHash = sha256HexUtf8(canonical);
  const csrfKey = readCsrfSigningCookie();

  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    "X-PUC-Timestamp": ts,
    "X-PUC-Nonce": nonce,
    "X-PUC-Payload-Hash": payloadHash,
  };
  if (csrfKey) {
    headers["X-PUC-Signature"] = hmacSha256Hex(csrfKey, payloadHash);
  }
  return headers;
}

let clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sao chép thông tin nhạy cảm (mật khẩu tạm thời, mã dự phòng 2FA) và tự động xóa khỏi khay nhớ tạm
 * sau `ttlMs` (mặc định 45 giây) để ngăn lộ thông tin trên máy tính dùng chung.
 */
export async function copySensitiveWithAutoClear(text: string, ttlMs = 45_000): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    if (clipboardClearTimer) {
      clearTimeout(clipboardClearTimer);
    }
    clipboardClearTimer = setTimeout(() => {
      clipboardClearTimer = null;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText("").catch(() => undefined);
      }
    }, ttlMs);
    return true;
  } catch {
    return false;
  }
}

