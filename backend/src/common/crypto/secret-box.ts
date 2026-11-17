import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Hộp mã hóa đối xứng AES-256-GCM cho các bí mật nhỏ lưu trong CSDL (ví dụ khóa TOTP 2 lớp).
 * Định dạng lưu trữ có phiên bản: `enc:v1:<iv>.<tag>.<ciphertext>` (base64url), cho phép
 * nhận diện và giải mã tương thích ngược với giá trị dạng rõ cũ (lazy migration).
 */
export const SEALED_PREFIX_V1 = "enc:v1:";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HKDF_SALT = Buffer.from("puc-secret-box-salt-v1", "utf8");

/** Dẫn xuất khóa 32 byte bằng HKDF-SHA256 từ chuỗi bí mật gốc, tách biệt mục đích qua nhãn `info`. */
export function deriveKey(material: string, info: string, length = KEY_BYTES): Buffer {
  if (!material) throw new Error("Thiếu khóa gốc để dẫn xuất khóa mã hóa.");
  return Buffer.from(hkdfSync("sha256", Buffer.from(material, "utf8"), HKDF_SALT, Buffer.from(info, "utf8"), length));
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(SEALED_PREFIX_V1);
}

/** Mã hóa chuỗi rõ; `aad` ràng buộc bản mã với ngữ cảnh (ví dụ id người dùng) để chống tráo bản mã giữa các dòng. */
export function sealString(key: Buffer, plaintext: string, aad: string): string {
  if (key.length !== KEY_BYTES) throw new Error("Khóa AES-256-GCM phải dài 32 byte.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SEALED_PREFIX_V1}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

/** Giải mã chuỗi đã niêm phong; ném lỗi khi sai khóa, sai ngữ cảnh hoặc bản mã bị sửa đổi. */
export function openString(key: Buffer, sealed: string, aad: string): string {
  if (!isSealed(sealed)) throw new Error("Giá trị không ở định dạng mã hóa enc:v1.");
  const parts = sealed.slice(SEALED_PREFIX_V1.length).split(".");
  if (parts.length !== 3) throw new Error("Bản mã enc:v1 không hợp lệ.");
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(ctB64, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Bản mã enc:v1 không hợp lệ.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Bộ khóa cho xác thực 2 lớp: phần tử đầu là khóa chính (dùng để mã hóa/băm mới), các phần tử sau
 * chỉ dùng để giải mã/đối chiếu dữ liệu cũ (ví dụ trước khi cấu hình TOTP_ENCRYPTION_KEY riêng).
 */
export interface TwoFactorKeyring {
  encryptionKeys: Buffer[];
  backupHmacKeys: Buffer[];
}

const TOTP_ENC_INFO = "puc-totp-secret-aes256gcm-v1";
const BACKUP_HMAC_INFO = "puc-2fa-backup-code-hmac-v1";

export function buildTwoFactorKeyring(options: { totpEncryptionKey?: string; jwtAccessSecret: string }): TwoFactorKeyring {
  const materials: string[] = [];
  const explicit = options.totpEncryptionKey?.trim();
  if (explicit) materials.push(explicit);
  // Khóa dự phòng dẫn xuất từ JWT_ACCESS_SECRET với nhãn info riêng (không trùng khóa ký JWT).
  if (options.jwtAccessSecret && options.jwtAccessSecret !== explicit) materials.push(options.jwtAccessSecret);
  return {
    encryptionKeys: materials.map((m) => deriveKey(m, TOTP_ENC_INFO)),
    backupHmacKeys: materials.map((m) => deriveKey(m, BACKUP_HMAC_INFO)),
  };
}
