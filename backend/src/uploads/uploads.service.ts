import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { AuthUser } from "../auth/auth-user";
import { can, type ResourceKey } from "../auth/permissions";
import { badRequest, forbidden, notFound } from "../common/errors/app.exception";
import type { AppConfig } from "../config/configuration";
import { DatabaseService } from "../database/database.service";

export const UPLOAD_PURPOSES = ["journal", "harvest", "stamp", "approval", "violation", "news", "catalog"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/** Mục đích hộ dân được phép tải tệp lên; các mục đích còn lại chỉ dành cho cán bộ. */
const FARMER_PURPOSES: ReadonlySet<UploadPurpose> = new Set(["journal", "harvest", "stamp", "approval", "violation"]);
/** Tệp dùng trên trang công khai (ảnh bản tin, ảnh danh mục) – ai cũng xem được. */
export const PUBLIC_PURPOSES: ReadonlySet<UploadPurpose> = new Set(["news", "catalog"]);

const PURPOSE_RESOURCE: Partial<Record<UploadPurpose, ResourceKey>> = {
  journal: "journal",
  harvest: "harvest",
  stamp: "stamps",
  approval: "approvals",
  violation: "violations",
};

interface DetectedType {
  mime: string;
  ext: string;
}

/** Nhận diện loại tệp theo chữ ký nhị phân (không tin `Content-Type` do client gửi). */
function detectType(buffer: Buffer): DetectedType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

export interface AttachmentRow {
  id: number;
  owner_user_id: number | null;
  household_id: number | null;
  purpose: UploadPurpose;
  storage_key: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
}

export interface UploadedFileInput {
  buffer: Buffer;
  originalname?: string;
  size: number;
}

/**
 * Lưu tệp tải lên ra đĩa (thư mục UPLOAD_DIR) và ghi siêu dữ liệu vào bảng `attachments`.
 * Các nghiệp vụ khác chỉ lưu `attachments.id` và gọi `assertUsable` trước khi gắn tệp vào bản ghi.
 */
@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService<AppConfig, true>,
  ) {
    const uploads = config.get("uploads", { infer: true });
    this.root = resolve(uploads.dir);
    this.maxBytes = uploads.maxBytes;
  }

  async onModuleInit() {
    await mkdir(this.root, { recursive: true });
  }

  get maxFileBytes() {
    return this.maxBytes;
  }

  async save(file: UploadedFileInput | undefined, purpose: UploadPurpose, user: AuthUser) {
    if (!file?.buffer?.length) throw badRequest("Chưa chọn tệp để tải lên.");
    if (file.size > this.maxBytes) throw badRequest(`Tệp vượt quá ${Math.round(this.maxBytes / 1024 / 1024)} MB.`);
    if (user.role === "farmer" && !FARMER_PURPOSES.has(purpose)) throw forbidden();
    if (user.role === "farmer" && user.householdId === null) {
      throw forbidden("Tài khoản chưa được liên kết với hộ nào. Vui lòng liên hệ cán bộ HTX.");
    }

    const type = detectType(file.buffer);
    if (!type) throw badRequest("Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc tệp PDF.");
    if (type.mime === "application/pdf" && purpose !== "approval") throw badRequest("Mục này chỉ nhận tệp ảnh.");

    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${type.ext}`;
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.buffer, { flag: "wx" });

    try {
      const { rows } = await this.db.query<{ id: number }>(
        `INSERT INTO attachments (owner_user_id, household_id, purpose, storage_key, original_name, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [user.id, user.role === "farmer" ? user.householdId : null, purpose, key, file.originalname?.slice(0, 200) ?? null, type.mime, file.size],
      );
      const id = rows[0].id;
      return { id, url: this.urlOf(id, purpose), mimeType: type.mime, sizeBytes: file.size };
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  /** URL tải tệp: tệp công khai đi qua /api/public/files, còn lại qua /api/uploads (cần đăng nhập). */
  urlOf(id: number, purpose: UploadPurpose) {
    return PUBLIC_PURPOSES.has(purpose) ? `/api/public/files/${id}` : `/api/uploads/${id}`;
  }

  /**
   * Kiểm tra các tệp do chính người dùng này tải lên đúng mục đích, trước khi gắn vào một bản ghi nghiệp vụ.
   * Trả về danh sách id (đã khử trùng lặp).
   */
  async assertUsable(ids: number[] | undefined | null, user: AuthUser, purpose: UploadPurpose): Promise<number[]> {
    const unique = [...new Set((ids ?? []).filter((id) => id !== null && id !== undefined))];
    if (unique.length === 0) return [];
    const { rows } = await this.db.query<{ id: number }>(
      `SELECT id FROM attachments WHERE id = ANY($1::bigint[]) AND owner_user_id = $2 AND purpose = $3`,
      [unique, user.id, purpose],
    );
    if (rows.length !== unique.length) throw badRequest("Tệp đính kèm không hợp lệ hoặc không thuộc về bạn.");
    return unique;
  }

  async find(id: number): Promise<AttachmentRow | null> {
    const { rows } = await this.db.query<AttachmentRow>("SELECT * FROM attachments WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  /** Quyền xem tệp: tệp công khai; người tải lên; hộ dân cùng hộ; cán bộ (thôn: chỉ hộ trong thôn mình và đúng phân quyền). */
  async assertReadable(attachment: AttachmentRow, user: AuthUser | undefined) {
    if (PUBLIC_PURPOSES.has(attachment.purpose)) return;
    if (!user) throw notFound();
    if (attachment.owner_user_id === user.id) return;
    if (user.role === "farmer") {
      if (attachment.household_id !== null && attachment.household_id === user.householdId) return;
      throw notFound();
    }
    const requiredResource = PURPOSE_RESOURCE[attachment.purpose];
    if (requiredResource && !can(user.role, requiredResource, "read")) {
      throw notFound();
    }
    if (user.role === "village_officer") {
      if (attachment.household_id === null) {
        throw notFound();
      }
      const { rows } = await this.db.query("SELECT 1 FROM households WHERE id = $1 AND village_id = $2", [
        attachment.household_id,
        user.villageId ?? -1,
      ]);
      if (rows.length === 0) throw notFound();
    }
  }

  async open(attachment: AttachmentRow) {
    const path = this.pathOf(attachment.storage_key);
    await stat(path).catch(() => {
      throw notFound();
    });
    return createReadStream(path);
  }

  private pathOf(key: string) {
    const path = resolve(join(this.root, key));
    if (path === this.root || !path.startsWith(this.root + sep)) throw notFound();
    return path;
  }
}
