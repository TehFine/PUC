import { Injectable, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { constants as fsConstants, type ReadStream } from "node:fs";
import { type FileHandle, mkdir, open as fsOpen, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { can, type ResourceKey } from "../auth/permissions";
import { badRequest, forbidden, notFound } from "../common/errors/app.exception";
import type { AppConfig } from "../config/configuration";
import { DatabaseService } from "../database/database.service";

export const UPLOAD_PURPOSES = [
  "journal",
  "harvest",
  "stamp",
  "approval",
  "violation",
  "news",
  "catalog",
  "avatar",
  "lab",
  "inspection",
] as const;
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
/** Mục đích trả về URL công khai mặc định qua `/api/public/files/<public_token>` khi mới tải lên. */
export const PUBLIC_PURPOSES: ReadonlySet<UploadPurpose> = new Set(["news", "catalog", "avatar", "lab", "inspection"]);
/** Mục đích tuyệt đối không bao giờ phục vụ qua `/api/public/files/:token` dù có token. */
const STRICT_INTERNAL_PURPOSES: ReadonlySet<UploadPurpose> = new Set(["approval", "violation"]);

const PURPOSE_RESOURCE: Partial<Record<UploadPurpose, ResourceKey>> = {
  journal: "journal",
  harvest: "harvest",
  stamp: "stamps",
  approval: "approvals",
  violation: "violations",
  avatar: "households",
  lab: "testing",
  inspection: "minutes",
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
  lab: "testing",
  inspection: "minutes",
};

const VIDEO_PURPOSES: ReadonlySet<UploadPurpose> = new Set([
  "journal",
  "harvest",
  "approval",
  "violation",
  "news",
  "inspection",
]);
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
  public_token: string;
  owner_user_id: number | null;
  household_id: number | null;
  purpose: UploadPurpose;
  storage_key: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
}

export interface OpenedAttachmentFile {
  totalBytes: number;
  close: () => Promise<void>;
  createStream: (range?: { start: number; end: number }) => ReadStream;
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
    @Optional() private readonly audit?: AuditService,
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
    if (type.mime === "application/pdf" && purpose !== "approval" && purpose !== "lab") {
      throw badRequest("Mục này chỉ nhận tệp ảnh.");
    }
    if (isVideo && !VIDEO_PURPOSES.has(purpose)) throw badRequest("Mục này chỉ nhận tệp ảnh.");

    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${type.ext}`;
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.buffer, { flag: "wx" });

    try {
      const safeOriginalName = file.originalname
        ? file.originalname
            .normalize("NFC")
            .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "")
            .slice(0, 200)
        : null;
      const { rows } = await this.db.query<{ id: number; public_token: string }>(
        `INSERT INTO attachments (owner_user_id, household_id, purpose, storage_key, original_name, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, public_token`,
        [user.id, user.role === "farmer" ? user.householdId : null, purpose, key, safeOriginalName, type.mime, file.size],
      );
      const id = rows[0].id;
      const publicToken = rows[0].public_token;
      if (this.audit) {
        await this.audit.write(
          { user },
          {
            action: "Tải tệp",
            object: `Tệp #${id} (${purpose})`,
            detail: `${type.mime} (${file.size} bytes)`,
          },
        );
      }
      return { id, url: this.urlOf(id, purpose, publicToken), mimeType: type.mime, sizeBytes: file.size };
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  /** URL tải tệp: tệp công khai đi qua `/api/public/files/<public_token>`, còn lại qua `/api/uploads/<id>` (cần đăng nhập). */
  urlOf(id: number, purpose: UploadPurpose, publicToken?: string) {
    return PUBLIC_PURPOSES.has(purpose) && publicToken ? `/api/public/files/${publicToken}` : `/api/uploads/${id}`;
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
    options?: { imagesOnly?: boolean },
  ): Promise<number[]> {
    const unique = [...new Set((ids ?? []).filter((id) => id !== null && id !== undefined))];
    if (unique.length === 0) return [];
    const targetHouseholdId = householdId ?? user.householdId ?? null;
    const { rows } = await this.db.query<{ id: number; mime_type: string }>(
      `UPDATE attachments
       SET household_id = COALESCE(household_id, $4)
       WHERE id = ANY($1::bigint[]) AND owner_user_id = $2 AND purpose = $3
       RETURNING id, mime_type`,
      [unique, user.id, purpose, targetHouseholdId],
    );
    if (rows.length !== unique.length) throw badRequest("Tệp đính kèm không hợp lệ hoặc không thuộc về bạn.");
    if (options?.imagesOnly && rows.some((r) => !r.mime_type.startsWith("image/"))) {
      throw badRequest("Mục này chỉ chấp nhận tệp hình ảnh chụp thực tế (JPG, PNG, WEBP).");
    }
    return unique;
  }

  async find(id: number): Promise<AttachmentRow | null> {
    const { rows } = await this.db.query<AttachmentRow>("SELECT * FROM attachments WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  /**
   * Tra cứu tệp phục vụ qua `/api/public/files/:token`:
   * - Bắt buộc khớp chính xác `public_token` ngẫu nhiên (không bao giờ cho phép dò theo ID số tuần tự).
   * - Chặn hoàn toàn tệp hồ sơ phê duyệt / khiếu nại vi phạm nội bộ (`approval`, `violation`).
   * - Chặn bản scan phiếu kiểm nghiệm đang ở trạng thái nháp (`lab_tests.record_status = 'draft'`).
   */
  async findPublicByToken(token: string): Promise<AttachmentRow | null> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    const { rows } = await this.db.query<AttachmentRow>("SELECT * FROM attachments WHERE public_token = $1 LIMIT 1", [
      token,
    ]);
    const attachment = rows[0];
    if (!attachment) return null;
    if (STRICT_INTERNAL_PURPOSES.has(attachment.purpose)) return null;

    if (attachment.purpose === "lab") {
      const labCheck = await this.db.query<{ has_any: boolean; has_verified: boolean }>(
        `SELECT
           EXISTS (SELECT 1 FROM lab_tests WHERE scan_attachment_id = $1) AS has_any,
           EXISTS (SELECT 1 FROM lab_tests WHERE scan_attachment_id = $1 AND record_status = 'verified') AS has_verified`,
        [attachment.id],
      );
      const status = labCheck.rows[0];
      if (status?.has_any && !status.has_verified) {
        return null;
      }
    }

    return attachment;
  }

  /** Quyền xem tệp trên `/api/uploads/:id`: hộ dân cùng hộ; cán bộ đúng phân quyền & phạm vi địa bàn. */
  async assertReadable(attachment: AttachmentRow, user: AuthUser | undefined) {
    if (attachment.purpose === "news" || attachment.purpose === "catalog") return;
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

  /**
   * Mở tệp nguyên tử với cờ `O_NOFOLLOW` chống tấn công symlink/TOCTOU và lấy kích thước thật từ file descriptor.
   */
  async openFile(attachment: AttachmentRow): Promise<OpenedAttachmentFile> {
    const path = this.pathOf(attachment.storage_key);
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
    let handle: FileHandle;
    try {
      handle = await fsOpen(path, flags);
    } catch {
      throw notFound();
    }

    try {
      const st = await handle.stat();
      if (!st.isFile() || st.size <= 0) {
        await handle.close().catch(() => undefined);
        throw notFound();
      }
      let streamCreated = false;
      return {
        totalBytes: st.size,
        close: async () => {
          if (!streamCreated) {
            await handle.close().catch(() => undefined);
          }
        },
        createStream: (range?: { start: number; end: number }) => {
          streamCreated = true;
          const stream = handle.createReadStream(
            range ? { start: range.start, end: range.end, autoClose: true } : { autoClose: true },
          );
          stream.on("error", () => {
            void handle.close().catch(() => undefined);
          });
          return stream;
        },
      };
    } catch (err) {
      await handle.close().catch(() => undefined);
      throw err;
    }
  }

  private pathOf(key: string) {
    const path = resolve(join(this.root, key));
    if (path === this.root || !path.startsWith(this.root + sep)) throw notFound();
    return path;
  }
}
