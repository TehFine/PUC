import { randomBytes } from "node:crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Sinh token ngẫu nhiên mật mã học (Base62, mặc định 14 ký tự ~ 83.4 bit entropy)
 * dùng cho đường dẫn mã QR chống đoán tuần tự: `/t/9fQ2xKp7LmZ3Vb`.
 */
export function generateQrToken(length = 14): string {
  const safeLen = Math.max(10, Math.min(32, length));
  const out: string[] = [];
  // Rejection sampling tránh lệch modulo (256 % 62 = 8 -> chỉ nhận byte < 248)
  while (out.length < safeLen) {
    const buf = randomBytes(safeLen * 2);
    for (let i = 0; i < buf.length && out.length < safeLen; i++) {
      const b = buf[i];
      if (b < 248) {
        out.push(BASE62[b % 62]);
      }
    }
  }
  return out.join("");
}
