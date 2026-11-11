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

export const UPLOAD_PURPOSES = ["journal", "harvest", "stamp", "approval", "violation", "news", "catalog", "avatar"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/** Mục đích hộ dân được phép tải tệp lên; các mục đích còn lại chỉ dành cho cán bộ. */
const FARMER_PURPOSES: ReadonlySet<UploadPurpose> = new Set([
  "journal",
  "harvest",
  "stamp",
  "approval",
  "violation",
  "avatar",
]);
/** Tệp dùng trên trang công khai (ảnh bản tin, ảnh danh mục, ảnh đại diện hộ trên trang truy xuất) – ai cũng xem được. */
export const PUBLIC_PURPOSES: ReadonlySet<UploadPurpose> = new Set(["news", "catalog", "avatar"]);

const PURPOSE_RESOURCE: Partial<Record<UploadPurpose, ResourceKey>> = {
  journal: "journal",
  harvest: "harvest",
  stamp: "stamps",
  approval: "approvals",
  violation: "violations",
  avatar: "households",
};

const PURPOSE_WRITE_RESOURCE: Record<UploadPurpose, ResourceKey> = {
  journal: "journal",
  harvest: "harvest",
  stamp: "stamps",
  approval: "approvals",
  violation: "violations",
  news: "news",
  catalog: "pesticides",
  avatar: "households",
};

const VIDEO_PURPOSES: ReadonlySet<UploadPurpose> = new Set(["journal", "harvest", "approval", "violation", "news"]);
const DEFAULT_MAX_VIDEO_BYTES = 20 * 1024 * 1024;

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
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    /^(isom|iso2|mp41|mp42|avc1|M4V |qt  |mmp4|dash|MSNV|3gp)/i.test(buffer.toString("ascii", 8, 12))
  ) {
    return { mime: "video/mp4", ext: "mp4" };
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mime: "video/webm", ext: "webm" };
  }
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
    if (user.role === "farmer") {
      if (!FARMER_PURPOSES.has(purpose)) throw forbidden();
      if (user.householdId === null) {
        throw forbidden("Tài khoản chưa được liên kết với hộ nào. Vui lòng liên hệ cán bộ HTX.");
      }
    } else {
      const resource = PURPOSE_WRITE_RESOURCE[purpose];
      if (!can(user.role, resource, "create") && !can(user.role, resource, "update")) {
        throw forbidden();
      }
    }

    const type = detectType(file.buffer);
    if (!type) {
      if (file.size > this.maxBytes) throw badRequest(`Tệp vượt quá ${Math.round(this.maxBytes / 1024 / 1024)} MB.`);
      throw badRequest("Chỉ chấp nhận ảnh JPG, PNG, WEBP, video MP4/WEBM hoặc tệp PDF.");
    }
    const isVideo = type.mime.startsWith("video/");
    const limitBytes = isVideo ? Math.max(this.maxBytes, DEFAULT_MAX_VIDEO_BYTES) : this.maxBytes;
    if (file.size > limitBytes) {
      throw badRequest(`Tệp vượt quá ${Math.round(limitBytes / 1024 / 1024)} MB.`);
    }
    if (type.mime === "application/pdf" && purpose !== "approval") throw badRequest("Mục này chỉ nhận tệp ảnh.");
    if (isVideo && !VIDEO_PURPOSES.has(purpose)) throw badRequest("Mục này chỉ nhận tệp ảnh.");

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
   * Đồng thời liên kết `household_id` nếu tệp do cán bộ tải lên cho một hộ cụ thể để hộ đó và cán bộ thôn đúng phạm vi xem được.
   */
  async assertUsable(
    ids: number[] | undefined | null,
    user: AuthUser,
    purpose: UploadPurpose,
    householdId?: number | null,
  ): Promise<number[]> {
    const unique = [...new Set((ids ?? []).filter((id) => id !== null && id !== undefined))];
    if (unique.length === 0) return [];
    const targetHouseholdId = householdId ?? user.householdId ?? null;
    const { rows } = await this.db.query<{ id: number }>(
      `UPDATE attachments
       SET household_id = COALESCE(household_id, $4)
       WHERE id = ANY($1::bigint[]) AND owner_user_id = $2 AND purpose = $3
       RETURNING id`,
      [unique, user.id, purpose, targetHouseholdId],
    );
    if (rows.length !== unique.length) throw badRequest("Tệp đính kèm không hợp lệ hoặc không thuộc về bạn.");
    return unique;
  }

  async find(id: number): Promise<AttachmentRow | null> {
    const { rows } = await this.db.query<AttachmentRow>("SELECT * FROM attachments WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  /** Quyền xem tệp: tệp công khai; hộ dân cùng hộ; cán bộ đúng phân quyền hiện tại (thôn: chỉ hộ trong thôn mình phụ trách). */
  async assertReadable(attachment: AttachmentRow, user: AuthUser | undefined) {
    if (PUBLIC_PURPOSES.has(attachment.purpose)) return;
    if (!user) throw notFound();
    if (user.role === "farmer") {
      if (
        (attachment.household_id !== null && attachment.household_id === user.householdId) ||
        (attachment.household_id === null && attachment.owner_user_id === user.id)
      ) {
        return;
      }
      throw notFound();
    }
    const requiredResource = PURPOSE_RESOURCE[attachment.purpose];
    if (requiredResource && !can(user.role, requiredResource, "read")) {
      throw notFound();
    }
    if (user.role === "village_officer") {
      if (attachment.household_id === null) {
        if (attachment.owner_user_id === user.id) return;
        throw notFound();
      }
      const { rows } = await this.db.query("SELECT 1 FROM households WHERE id = $1 AND village_id = $2", [
        attachment.household_id,
        user.villageId ?? -1,
      ]);
      if (rows.length === 0) throw notFound();
    }
  }

  async open(attachment: AttachmentRow, range?: { start: number; end: number }) {
    const path = this.pathOf(attachment.storage_key);
    await stat(path).catch(() => {
      throw notFound();
    });
    return createReadStream(path, range);
  }

  private pathOf(key: string) {
    const path = resolve(join(this.root, key));
    if (path === this.root || !path.startsWith(this.root + sep)) throw notFound();
    return path;
  }
}
