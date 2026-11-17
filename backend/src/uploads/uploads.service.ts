import { Injectable, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, type ReadStream } from "node:fs";
import { type FileHandle, mkdir, open as fsOpen, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { can, type ResourceKey } from "../auth/permissions";
import { isStaffInCuneCoopScope, isStaffInParcelScope } from "../common/crud/village-scope";
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
const STRICT_INTERNAL_PURPOSES: ReadonlySet<UploadPurpose> = new Set(["approval", "violation", "harvest", "stamp"]);

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
const ATTACHMENT_META_COLUMNS =
  "id, public_token, owner_user_id, household_id, purpose, storage_key, original_name, mime_type, size_bytes";

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
  if (buffer.length >= 16 && buffer.toString("ascii", 4, 8) === "ftyp") {
    // Hộp `ftyp` hợp lệ: 4 byte kích thước (big-endian) gồm phần đầu 8 byte, major brand, minor version
    // và danh sách compatible brands 4 byte, nên nằm trong khoảng 16 đến 128 byte, chia hết cho 4 và không vượt quá tệp.
    const boxSize = buffer.readUInt32BE(0);
    if (
      boxSize >= 16 &&
      boxSize <= 128 &&
      boxSize % 4 === 0 &&
      boxSize <= buffer.length &&
      /^(isom|iso[2-9]|mp41|mp42|avc1|hvc1|hevc|hev1|M4V |qt  |mmp4|dash|MSNV|3gp|f4v |NDSC)/i.test(
        buffer.toString("ascii", 8, 12),
      )
    ) {
      return { mime: "video/mp4", ext: "mp4" };
    }
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
  private readonly rehydrating = new Map<number, Promise<boolean>>();

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
    await this.ensureMultiPhotoSchema().catch(() => undefined);
    if (process.env.NODE_ENV !== "test") {
      void this.backfillLocalFilesToDb().catch(() => undefined);
    }
  }

  /**
   * Đảm bảo cột lưu nhị phân bền vững (`attachments.file_data`) và các cột mảng lưu nhiều ảnh hiện trường
   * luôn tồn tại ngay cả khi môi trường đám mây khởi chạy trước khi chạy lệnh `db:migrate`.
   */
  private async ensureMultiPhotoSchema() {
    await this.db.query(`
      DO $$
      BEGIN
        IF to_regclass('public.attachments') IS NOT NULL THEN
          ALTER TABLE attachments
            ADD COLUMN IF NOT EXISTS file_data BYTEA,
            ADD COLUMN IF NOT EXISTS sha256_hex TEXT;
          CREATE INDEX IF NOT EXISTS idx_attachments_owner_purpose_sha256
            ON attachments (owner_user_id, purpose, sha256_hex)
            WHERE sha256_hex IS NOT NULL;
        END IF;
        IF to_regclass('public.care_milestone_declarations') IS NOT NULL THEN
          ALTER TABLE care_milestone_declarations
            ADD COLUMN IF NOT EXISTS field_photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[],
            ADD COLUMN IF NOT EXISTS invoice_photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[],
            ADD COLUMN IF NOT EXISTS declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            ADD COLUMN IF NOT EXISTS declared_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
            ADD COLUMN IF NOT EXISTS late_declaration_days INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS late_reason TEXT;
        END IF;
        IF to_regclass('public.plot_care_plans') IS NOT NULL THEN
          ALTER TABLE plot_care_plans
            ADD COLUMN IF NOT EXISTS reminder_lead_days INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS last_late_declaration_days INTEGER NOT NULL DEFAULT 0;
        END IF;
        IF to_regclass('public.care_protocol_alert_logs') IS NOT NULL THEN
          ALTER TABLE care_protocol_alert_logs DROP CONSTRAINT IF EXISTS care_protocol_alert_logs_alert_type_check;
          ALTER TABLE care_protocol_alert_logs
            ADD CONSTRAINT care_protocol_alert_logs_alert_type_check
            CHECK (alert_type IN ('due_soon', 'due_day_prompt', 'overdue_warning', 'overdue_critical', 'next_stage'));
        END IF;
        IF to_regclass('public.journal_entries') IS NOT NULL THEN
          ALTER TABLE journal_entries
            ADD COLUMN IF NOT EXISTS photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[];
        END IF;
        IF to_regclass('public.spray_records') IS NOT NULL THEN
          ALTER TABLE spray_records
            ADD COLUMN IF NOT EXISTS photo_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[],
            ADD COLUMN IF NOT EXISTS note TEXT,
            ADD COLUMN IF NOT EXISTS recorded_by_role TEXT,
            ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF to_regclass('public.violations') IS NOT NULL THEN
          ALTER TABLE violations
            ADD COLUMN IF NOT EXISTS farmer_response_photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[];
        END IF;
        IF to_regclass('public.inspection_minutes') IS NOT NULL THEN
          ALTER TABLE inspection_minutes
            ADD COLUMN IF NOT EXISTS photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[];
        END IF;
      END $$;
    `);
  }

  get maxFileBytes() {
    return this.maxBytes;
  }

  private assertCanWritePurpose(purpose: UploadPurpose, user: AuthUser): void {
    if (!(UPLOAD_PURPOSES as readonly string[]).includes(purpose)) {
      throw badRequest("Mục đích tải tệp không hợp lệ.");
    }
    if (user.role === "farmer") {
      if (!FARMER_PURPOSES.has(purpose)) throw forbidden();
      if (user.householdId === null) {
        throw forbidden("Tài khoản chưa được liên kết với hộ nào. Vui lòng liên hệ cán bộ HTX.");
      }
      return;
    }
    const resource = PURPOSE_WRITE_RESOURCE[purpose];
    if (!can(user.role, resource, "create") && !can(user.role, resource, "update")) {
      throw forbidden();
    }
  }

  /**
   * Kiểm tra nhanh bằng mã băm SHA-256 (chỉ trong phạm vi tệp do chính tài khoản hiện tại đã tải lên cùng `purpose`)
   * để điện thoại ở vùng rẫy sóng 2G/3G yếu không phải tải lại hàng trăm KB hoặc video nhiều MB khi lần gửi trước
   * đã tới máy chủ nhưng mất phản hồi chiều về.
   */
  async findOwnedByHash(
    user: AuthUser,
    purpose: UploadPurpose,
    sha256Raw: string | undefined,
    sizeBytes?: number,
  ): Promise<{ found: false } | { found: true; id: number; url: string; mimeType: string; sizeBytes: number; sha256: string }> {
    this.assertCanWritePurpose(purpose, user);
    const normalizedSha = typeof sha256Raw === "string" ? sha256Raw.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(normalizedSha)) {
      throw badRequest("Mã kiểm tra toàn vẹn tệp (SHA-256) không hợp lệ.");
    }
    const params: unknown[] = [user.id, purpose, normalizedSha];
    let sizeClause = "";
    if (typeof sizeBytes === "number" && Number.isInteger(sizeBytes) && sizeBytes > 0) {
      params.push(sizeBytes);
      sizeClause = ` AND size_bytes = $${params.length}`;
    }

    let householdClause: string;
    if (user.role === "farmer") {
      if (user.householdId === null) {
        return { found: false };
      }
      params.push(user.householdId);
      householdClause = ` AND household_id = $${params.length}`;
    } else {
      householdClause = " AND household_id IS NULL";
    }

    const { rows } = await this.db.query<{
      id: number;
      public_token: string;
      mime_type: string;
      size_bytes: number;
    }>(
      `SELECT id, public_token, mime_type, size_bytes
       FROM attachments
       WHERE owner_user_id = $1
         AND purpose = $2
         AND sha256_hex = $3${sizeClause}${householdClause}
         AND file_data IS NOT NULL
       ORDER BY id DESC
       LIMIT 1`,
      params,
    );
    const existing = rows[0];
    if (!existing) return { found: false };

    const id = Number(existing.id);
    return {
      found: true,
      id,
      url: this.urlOf(id, purpose, existing.public_token),
      mimeType: existing.mime_type,
      sizeBytes: Number(existing.size_bytes),
      sha256: normalizedSha,
    };
  }

  async save(
    file: UploadedFileInput | undefined,
    purpose: UploadPurpose,
    user: AuthUser,
    expectedSha256?: string | string[],
  ) {
    if (!file?.buffer?.length) throw badRequest("Chưa chọn tệp để tải lên.");
    this.assertCanWritePurpose(purpose, user);

    let normalizedExpectedSha = "";
    if (expectedSha256 !== undefined) {
      if (Array.isArray(expectedSha256) || typeof expectedSha256 !== "string") {
        throw badRequest("Mã kiểm tra toàn vẹn ảnh SHA-256 không hợp lệ.");
      }
      normalizedExpectedSha = expectedSha256.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(normalizedExpectedSha)) {
        throw badRequest("Mã kiểm tra toàn vẹn ảnh SHA-256 không hợp lệ.");
      }
    }

    // Kích thước thật lấy từ bộ đệm đã nhận (không tin trường `size` do tầng trung gian hoặc client cung cấp).
    const actualBytes = file.buffer.byteLength;
    const type = detectType(file.buffer);
    if (!type) {
      if (actualBytes > this.maxBytes) throw badRequest(`Tệp vượt quá ${Math.round(this.maxBytes / 1024 / 1024)} MB.`);
      throw badRequest("Chỉ chấp nhận ảnh JPG, PNG, WEBP, video MP4/WEBM hoặc tệp PDF.");
    }
    const isVideo = type.mime.startsWith("video/");
    const limitBytes = isVideo ? Math.max(this.maxBytes, DEFAULT_MAX_VIDEO_BYTES) : this.maxBytes;
    if (actualBytes > limitBytes) {
      throw badRequest(`Tệp vượt quá ${Math.round(limitBytes / 1024 / 1024)} MB.`);
    }
    if (type.mime === "application/pdf" && purpose !== "approval" && purpose !== "lab") {
      throw badRequest("Mục này chỉ nhận tệp ảnh.");
    }
    if (isVideo && !VIDEO_PURPOSES.has(purpose)) throw badRequest("Mục này chỉ nhận tệp ảnh.");

    const sha256Hex = createHash("sha256").update(file.buffer).digest("hex");
    if (normalizedExpectedSha) {
      if (normalizedExpectedSha !== sha256Hex) {
        throw badRequest("Dữ liệu tệp tải lên bị gián đoạn do mạng yếu. Hệ thống sẽ tự động tải lại.");
      }
      const existing = await this.findOwnedByHash(user, purpose, sha256Hex, actualBytes);
      if (existing.found) {
        return {
          id: existing.id,
          url: existing.url,
          mimeType: existing.mimeType,
          sizeBytes: existing.sizeBytes,
          sha256: existing.sha256,
          deduplicated: true,
        };
      }
    }

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
        `INSERT INTO attachments (owner_user_id, household_id, purpose, storage_key, original_name, mime_type, size_bytes, file_data, sha256_hex)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, public_token`,
        [
          user.id,
          user.role === "farmer" ? user.householdId : null,
          purpose,
          key,
          safeOriginalName,
          type.mime,
          actualBytes,
          file.buffer,
          sha256Hex,
        ],
      );
      const id = rows[0].id;
      const publicToken = rows[0].public_token;
      if (this.audit) {
        await this.audit.write(
          { user },
          {
            action: "Tải tệp",
            object: `Tệp #${id} (${purpose})`,
            detail: `${type.mime} (${actualBytes} bytes)`,
          },
        );
      }
      return {
        id,
        url: this.urlOf(id, purpose, publicToken),
        mimeType: type.mime,
        sizeBytes: actualBytes,
        sha256: sha256Hex,
      };
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  /**
   * URL tải tệp: tệp công khai đi qua `/api/public/files/<public_token>`, còn lại qua `/api/uploads/<id>` (cần đăng nhập).
   * Bản scan kiểm nghiệm vừa tải lên chưa gắn phiếu đã xác thực nên chỉ xem nội bộ; URL công khai do TestingService
   * cấp lại khi phiếu chuyển sang `verified`.
   */
  urlOf(id: number, purpose: UploadPurpose, publicToken?: string) {
    if (purpose === "lab") return `/api/uploads/${id}`;
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
    const detailed = await this.assertUsableDetailed(ids, user, purpose, householdId, options);
    return detailed.ids;
  }

  /**
   * Kiểm tra danh sách tệp đính kèm theo đúng thứ tự người dùng chọn và xác định tệp đại diện chính
   * (ưu tiên ảnh chụp đầu tiên nếu danh sách có cả ảnh lẫn video ngắn).
   */
  async assertUsableDetailed(
    ids: number[] | undefined | null,
    user: AuthUser,
    purpose: UploadPurpose,
    householdId?: number | null,
    options?: { imagesOnly?: boolean; requireAtLeastOneImage?: boolean },
  ): Promise<{ ids: number[]; primaryId: number | null }> {
    const unique = [...new Set((ids ?? []).filter((id): id is number => id !== null && id !== undefined && Number.isInteger(id) && id > 0))];
    if (unique.length === 0) return { ids: [], primaryId: null };
    const targetHouseholdId = householdId ?? user.householdId ?? null;
    const { rows } = await this.db.query<{ id: string | number; mime_type: string }>(
      `UPDATE attachments
       SET household_id = COALESCE(household_id, $4)
       WHERE id = ANY($1::bigint[]) AND owner_user_id = $2 AND purpose = $3
       RETURNING id, mime_type`,
      [unique, user.id, purpose, targetHouseholdId],
    );
    if (rows.length !== unique.length) throw badRequest("Tệp đính kèm không hợp lệ hoặc không thuộc về bạn.");
    const mimeById = new Map<number, string>(rows.map((r) => [Number(r.id), r.mime_type]));
    if (options?.imagesOnly && rows.some((r) => !r.mime_type.startsWith("image/"))) {
      throw badRequest("Mục này chỉ chấp nhận tệp hình ảnh chụp thực tế (JPG, PNG, WEBP).");
    }
    if (options?.requireAtLeastOneImage && !rows.some((r) => r.mime_type.startsWith("image/"))) {
      throw badRequest("Vui lòng đính kèm ít nhất 1 ảnh chụp hiện trường bên cạnh video.");
    }
    const firstImageId = unique.find((id) => (mimeById.get(id) ?? "").startsWith("image/"));
    return {
      ids: unique,
      primaryId: firstImageId ?? unique[0] ?? null,
    };
  }

  async find(id: number): Promise<AttachmentRow | null> {
    const queryOne = async () => {
      const { rows } = await this.db.query<AttachmentRow>(
        `SELECT ${ATTACHMENT_META_COLUMNS} FROM attachments WHERE id = $1`,
        [id],
      );
      return rows[0] ?? null;
    };
    if (!this.db.cache) return queryOne();
    return this.db.cache.getOrLoad(`uploads:id:${id}`, 60_000, ["uploads"], queryOne);
  }

  getVerifiedDiskSize(attachmentId: number): number | undefined {
    return this.db.cache?.get<number>(`uploads:disk-size:${attachmentId}`);
  }

  /**
   * Tra cứu tệp phục vụ qua `/api/public/files/:token`:
   * - Bắt buộc khớp chính xác `public_token` ngẫu nhiên (không bao giờ cho phép dò theo ID số tuần tự).
   * - Chặn hoàn toàn tệp hồ sơ phê duyệt, khiếu nại vi phạm, ảnh khai báo thu hoạch và ảnh kích hoạt tem
   *   (`approval`, `violation`, `harvest`, `stamp`).
   * - Bản scan kiểm nghiệm chỉ phục vụ khi đã gắn với ít nhất một phiếu `lab_tests.record_status = 'verified'`
   *   (chặn cả bản nháp lẫn tệp vừa tải lên chưa gắn phiếu).
   */
  async findPublicByToken(token: string): Promise<AttachmentRow | null> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    const queryPublic = async (): Promise<AttachmentRow | null> => {
      const { rows } = await this.db.query<AttachmentRow>(
        `SELECT ${ATTACHMENT_META_COLUMNS} FROM attachments WHERE public_token = $1 LIMIT 1`,
        [token],
      );
      const attachment = rows[0];
      if (!attachment) return null;
      if (STRICT_INTERNAL_PURPOSES.has(attachment.purpose)) return null;

      if (attachment.purpose === "lab") {
        const labCheck = await this.db.query<{ has_verified: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM lab_tests WHERE scan_attachment_id = $1 AND record_status = 'verified'
           ) AS has_verified`,
          [attachment.id],
        );
        if (!labCheck.rows[0]?.has_verified) {
          return null;
        }
      }

      return attachment;
    };

    if (!this.db.cache) return queryPublic();
    return this.db.cache.getOrLoad(`uploads:pub:${token}`, 60_000, ["uploads"], queryPublic);
  }

  /** Quyền xem tệp trên `/api/uploads/:id`: hộ dân cùng hộ; cán bộ đúng phân quyền & phạm vi địa bàn. */
  async assertReadable(attachment: AttachmentRow, user: AuthUser | undefined) {
    if (attachment.purpose === "news" || attachment.purpose === "catalog") return;
    if (!user) throw notFound("Không tìm thấy tệp đính kèm.");
    if (user.role === "farmer") {
      if (
        (attachment.household_id !== null &&
          user.householdId !== null &&
          Number(attachment.household_id) === Number(user.householdId)) ||
        (attachment.household_id === null &&
          attachment.owner_user_id !== null &&
          Number(attachment.owner_user_id) === Number(user.id))
      ) {
        return;
      }
      throw notFound("Không tìm thấy tệp đính kèm.");
    }
    const requiredResource = PURPOSE_RESOURCE[attachment.purpose];
    if (requiredResource && !can(user.role, requiredResource, "read")) {
      throw notFound("Không tìm thấy tệp đính kèm.");
    }
    if (user.role === "enterprise") {
      if (!user.enterpriseId) throw notFound("Không tìm thấy tệp đính kèm.");
      const entRes = await this.db.query<{ active: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM enterprises e WHERE e.id = $1 AND e.status = 'active') AS active",
        [user.enterpriseId],
      );
      if (!entRes.rows[0]?.active || !(await this.isReadableByEnterprise(attachment, user))) {
        throw notFound("Không tìm thấy tệp đính kèm.");
      }
      return;
    }

    if (!isStaffInCuneCoopScope(user, true)) {
      throw notFound("Không tìm thấy tệp đính kèm.");
    }

    if (attachment.household_id === null) {
      if (attachment.owner_user_id !== null && Number(attachment.owner_user_id) === Number(user.id)) {
        return;
      }
      if (user.role === "village_officer" || !isStaffInCuneCoopScope(user, false)) {
        throw notFound("Không tìm thấy tệp đính kèm.");
      }
      return;
    }

    const hhRes = await this.db.query<{ village_id: number | null; village_name: string | null }>(
      `SELECT h.village_id, v.name AS village_name
         FROM households h
         LEFT JOIN villages v ON v.id = h.village_id
        WHERE h.id = $1`,
      [attachment.household_id],
    );
    const hh = hhRes.rows[0];
    if (!hh) {
      throw notFound("Không tìm thấy tệp đính kèm.");
    }
    let officerVillageName: string | null = null;
    if (user.role === "village_officer" && user.villageId) {
      const vr = await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [user.villageId]);
      officerVillageName = vr.rows[0]?.name ?? null;
    }
    if (!isStaffInParcelScope(user, { villageId: hh.village_id, villageName: hh.village_name }, officerVillageName)) {
      throw notFound("Không tìm thấy tệp đính kèm.");
    }
  }

  /**
   * Doanh nghiệp không được dò ID tuần tự để tải tệp nội bộ của hộ khác. Chỉ cho phép:
   * - Ảnh khai báo thu hoạch (`harvest`) của hộ, thửa đã đóng góp vào lô hàng thuộc chính doanh nghiệp.
   * - Bản scan kiểm nghiệm (`lab`) của phiếu đã xác thực, do hộ từng cung ứng vào lô hàng của doanh nghiệp.
   * Mọi mục đích khác (và tài khoản chưa gắn doanh nghiệp) đều bị từ chối.
   */
  private async isReadableByEnterprise(attachment: AttachmentRow, user: AuthUser): Promise<boolean> {
    const enterpriseId = user.enterpriseId ?? null;
    if (!enterpriseId) return false;
    if (attachment.purpose === "harvest") {
      const { rows } = await this.db.query(
        `SELECT 1
         FROM harvest_declarations d
         WHERE d.photo_id = $1
           AND EXISTS (
             SELECT 1
             FROM harvest_contributions hc
             JOIN harvest_lots hl ON hl.id = hc.lot_id
             WHERE hc.household_id = d.household_id
               AND hl.enterprise_id = $2
               AND (btrim(hc.plot_code) = '' OR upper(btrim(hc.plot_code)) = upper(btrim(d.plot_code)))
           )
         LIMIT 1`,
        [attachment.id, enterpriseId],
      );
      return rows.length > 0;
    }
    if (attachment.purpose === "lab") {
      const { rows } = await this.db.query(
        `SELECT 1
         FROM lab_tests lt
         WHERE lt.scan_attachment_id = $1
           AND lt.record_status = 'verified'
           AND EXISTS (
             SELECT 1
             FROM harvest_contributions hc
             JOIN harvest_lots hl ON hl.id = hc.lot_id
             WHERE hc.household_id = lt.household_id AND hl.enterprise_id = $2
           )
         LIMIT 1`,
        [attachment.id, enterpriseId],
      );
      return rows.length > 0;
    }
    return false;
  }

  /**
   * Sao lưu tự động các tệp cũ đang nằm trên đĩa cục bộ vào cột `attachments.file_data`
   * để đảm bảo tính bền vững xuyên suốt giữa các lần triển khai lại.
   */
  private async backfillLocalFilesToDb(): Promise<void> {
    const { rows } = await this.db.query<{ id: number; storage_key: string }>(
      `SELECT id, storage_key
       FROM attachments
       WHERE file_data IS NULL
       ORDER BY id DESC
       LIMIT 200`,
    );
    for (const row of rows) {
      try {
        const diskPath = this.pathOf(row.storage_key);
        const buf = await readFile(diskPath);
        if (buf.length > 0 && buf.length <= DEFAULT_MAX_VIDEO_BYTES) {
          await this.db.query(
            "UPDATE attachments SET file_data = $2 WHERE id = $1 AND file_data IS NULL",
            [row.id, buf],
          );
        }
      } catch {
        // Bỏ qua nếu tệp cũ không tồn tại trên máy hiện tại.
      }
    }
  }

  /**
   * Khôi phục nguyên tử tệp từ PostgreSQL TOAST (`attachments.file_data`) xuống bộ đệm đĩa cục bộ
   * khi container đám mây (Render Free Tier) bị xóa ổ đĩa tạm hoặc khi truy cập từ máy khác chung CSDL.
   * Gộp các luồng tải đồng thời (Singleflight) trên cùng một `attachmentId` để tránh nhân bản bộ đệm 20 MB trên RAM.
   */
  private rehydrateFromDatabase(attachmentId: number, targetPath: string): Promise<boolean> {
    const running = this.rehydrating.get(attachmentId);
    if (running) return running;
    const promise = this.performRehydrateFromDatabase(attachmentId, targetPath).finally(() => {
      if (this.rehydrating.get(attachmentId) === promise) {
        this.rehydrating.delete(attachmentId);
      }
    });
    this.rehydrating.set(attachmentId, promise);
    return promise;
  }

  private async performRehydrateFromDatabase(attachmentId: number, targetPath: string): Promise<boolean> {
    const { rows } = await this.db.query<{ file_data: Buffer | null }>(
      "SELECT file_data FROM attachments WHERE id = $1 AND file_data IS NOT NULL LIMIT 1",
      [attachmentId],
    );
    const blob = rows[0]?.file_data;
    if (!blob || !Buffer.isBuffer(blob) || blob.length === 0) {
      return false;
    }
    await mkdir(dirname(targetPath), { recursive: true });
    const tmpPath = `${targetPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tmpPath, blob, { flag: "wx" });
      await rename(tmpPath, targetPath);
      return true;
    } catch {
      await unlink(tmpPath).catch(() => undefined);
      return false;
    }
  }

  /**
   * Mở tệp nguyên tử với cờ `O_NOFOLLOW` chống tấn công symlink/TOCTOU và lấy kích thước thật từ file descriptor.
   * Nếu tệp chưa có trên đĩa cục bộ, tự động khôi phục từ `attachments.file_data` trong PostgreSQL.
   */
  async openFile(attachment: AttachmentRow): Promise<OpenedAttachmentFile> {
    const path = this.pathOf(attachment.storage_key);
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
    let handle: FileHandle;
    try {
      handle = await fsOpen(path, flags);
    } catch {
      const restored = await this.rehydrateFromDatabase(attachment.id, path).catch(() => false);
      if (!restored) {
        throw notFound();
      }
      try {
        handle = await fsOpen(path, flags);
      } catch {
        throw notFound();
      }
    }

    try {
      const st = await handle.stat();
      if (!st.isFile() || st.size <= 0) {
        await handle.close().catch(() => undefined);
        throw notFound();
      }
      this.db.cache?.set(`uploads:disk-size:${attachment.id}`, st.size, 60_000, ["uploads"]);
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
