import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { attachmentUrlSql, camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { UploadsService } from "../../uploads/uploads.service";
import { hasJournalSince, isJournalViolationSql, lastJournalOnSql } from "../../resources/shared/violation-evidence";
import { ADMIN_LINKS, INSPECTION_ROLES } from "../common/admin-links";
import { assertPlotOwned, type ClientContext, conflict, householdIdOf } from "../common/portal-context";
import type { CreatePortalJournalDto, ViolationResponseDto } from "./journal.dto";

/** Người ghi của bản ghi do hộ tự tạo trên cổng hộ dân. */
export const FARMER_RECORDER = "Chủ hộ";

const JOURNAL_COLUMNS = `j.id, j.entry_on, j.plot_code, j.activity, j.detail, j.recorder, j.has_photo,
  ${attachmentUrlSql("j.photo_id")} AS photo_url, j.latitude, j.longitude, j.created_at,
  (j.recorder = '${FARMER_RECORDER}' AND j.created_at > now() - interval '24 hours'
     AND EXISTS (SELECT 1 FROM attachments a WHERE a.id = j.photo_id AND a.household_id = j.household_id)) AS can_delete`;

const VIOLATION_COLUMNS = `v.id, v.severity, v.title, v.detected_on, v.plot_code, v.description, v.status,
  v.farmer_response, v.farmer_response_at, ${attachmentUrlSql("v.farmer_response_photo_id")} AS farmer_response_photo_url,
  v.resolved_on, v.resolution_notes,
  ${isJournalViolationSql("v")} AS is_journal_violation, ${lastJournalOnSql("v")} AS last_journal_on`;

/** Nhật ký canh tác và cảnh báo/vi phạm của hộ. */
@Injectable()
export class JournalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT ${JOURNAL_COLUMNS} FROM journal_entries j
       WHERE j.household_id = $1 ORDER BY j.entry_on DESC, j.id DESC LIMIT 200`,
      [householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async create(dto: CreatePortalJournalDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const entryOn = dto.entryOn ?? todayVn();
    if (entryOn > todayVn()) throw badRequest("Ngày ghi nhật ký không được ở tương lai.");
    const plotCode = await assertPlotOwned(this.db, householdId, dto.plotCode);
    const [photoId] = await this.uploads.assertUsable([dto.photoId], user, "journal");
    if (!photoId) throw badRequest("Vui lòng chụp hoặc chọn ảnh thực địa.");

    const inserted = await this.db.query<{ id: number }>(
      `INSERT INTO journal_entries (entry_on, household_id, plot_code, activity, detail, recorder, has_photo, photo_id, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9) RETURNING id`,
      [entryOn, householdId, plotCode, dto.activity, dto.detail ?? null, FARMER_RECORDER, photoId, dto.latitude ?? null, dto.longitude ?? null],
    );
    const id = inserted.rows[0].id;

    // Tự động ghi nhận phản hồi khắc phục nếu hộ đang có cảnh báo chưa cập nhật nhật ký canh tác.
    // Chỉ áp dụng cho vi phạm cùng thửa (hoặc không gắn thửa) và khi ngày ghi không trước ngày phát hiện,
    // để một bản ghi cũ hoặc của thửa khác không bị tính là đã khắc phục.
    const autoNote = `Đã cập nhật nhật ký canh tác (${dto.activity} – Thửa ${plotCode}, ngày ${entryOn}).`;
    await this.db.query(
      `UPDATE violations v
       SET farmer_response = $2,
           farmer_response_at = now(),
           farmer_response_photo_id = COALESCE(farmer_response_photo_id, $3)
       WHERE v.household_id = $1
         AND v.status = 'open'
         AND v.farmer_response IS NULL
         AND ${isJournalViolationSql("v")}
         AND (v.plot_code IS NULL OR v.plot_code = $4)
         AND v.detected_on <= $5::date`,
      [householdId, autoNote, photoId, plotCode, entryOn],
    );

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ ghi nhật ký", object: `Nhật ký canh tác #${id}`, detail: `${dto.activity} – ${plotCode}` },
    );
    const { rows } = await this.db.query(`SELECT ${JOURNAL_COLUMNS} FROM journal_entries j WHERE j.id = $1`, [id]);
    return camelRow(rows[0]);
  }

  /** Chỉ xóa được bản ghi do chính hộ tạo trên cổng (người ghi "Chủ hộ", ảnh của hộ) trong vòng 24 giờ. */
  async remove(id: number, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const deleted = await this.db.query<{ id: number; activity: string; plot_code: string }>(
      `DELETE FROM journal_entries j
       WHERE j.id = $1 AND j.household_id = $2 AND j.recorder = $3 AND j.created_at > now() - interval '24 hours'
         AND EXISTS (SELECT 1 FROM attachments a WHERE a.id = j.photo_id AND a.household_id = j.household_id)
       RETURNING j.id, j.activity, j.plot_code`,
      [id, householdId, FARMER_RECORDER],
    );
    if (deleted.rowCount === 0) {
      const exists = await this.db.query("SELECT 1 FROM journal_entries WHERE id = $1 AND household_id = $2", [id, householdId]);
      if (exists.rowCount === 0) throw notFound("Không tìm thấy bản ghi nhật ký.");
      throw forbidden("Chỉ xóa được nhật ký do hộ tự ghi trong vòng 24 giờ.");
    }
    const row = deleted.rows[0];
    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ xóa nhật ký", object: `Nhật ký canh tác #${row.id}`, detail: `${row.activity} – ${row.plot_code}` },
    );
    return { ok: true };
  }

  async violations(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT ${VIOLATION_COLUMNS} FROM violations v
       WHERE v.household_id = $1 ORDER BY v.detected_on DESC, v.id DESC LIMIT 100`,
      [householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  /** Hộ phản hồi (báo đã khắc phục) một cảnh báo / vi phạm còn mở tại mục Nhật ký. */
  async respond(id: number, dto: ViolationResponseDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);

    // Kiểm tra trước khi nhận phản hồi: vi phạm phải còn mở; với vi phạm "chưa cập nhật nhật ký",
    // hộ phải thực sự đã ghi nhật ký mới (đúng thửa) kể từ ngày phát hiện — không chỉ bấm "đã khắc phục".
    const current = await this.db.query<{
      status: string;
      detected_on: string;
      plot_code: string | null;
      is_journal: boolean;
      last_journal_on: string | null;
    }>(
      `SELECT v.status, v.detected_on, v.plot_code,
              ${isJournalViolationSql("v")} AS is_journal,
              ${lastJournalOnSql("v")} AS last_journal_on
       FROM violations v
       WHERE v.id = $1 AND v.household_id = $2`,
      [id, householdId],
    );
    const violationRow = current.rows[0];
    if (!violationRow) throw notFound("Không tìm thấy vi phạm.");
    if (violationRow.status !== "open") throw conflict("Vi phạm đã được đóng, không thể gửi phản hồi.");
    if (violationRow.is_journal && !hasJournalSince(violationRow.last_journal_on, violationRow.detected_on)) {
      const [y, m, d] = violationRow.detected_on.split("-");
      const plot = violationRow.plot_code ? ` cho thửa ${violationRow.plot_code}` : "";
      throw conflict(
        `Chưa có nhật ký mới${plot} kể từ ngày phát hiện vi phạm (${d}/${m}/${y}). ` +
          "Vui lòng ghi nhật ký kèm ảnh thực địa trước khi báo đã khắc phục.",
      );
    }

    const [photoId] = await this.uploads.assertUsable(dto.photoId ? [dto.photoId] : [], user, "violation");

    const updated = await this.db.query<{ id: number; title: string }>(
      `UPDATE violations SET farmer_response = $3, farmer_response_at = now(), farmer_response_photo_id = $4
       WHERE id = $1 AND household_id = $2 AND status = 'open'
       RETURNING id, title`,
      [id, householdId, dto.note, photoId ?? null],
    );
    if (updated.rowCount === 0) {
      const exists = await this.db.query("SELECT 1 FROM violations WHERE id = $1 AND household_id = $2", [id, householdId]);
      if (exists.rowCount === 0) throw notFound("Không tìm thấy vi phạm.");
      throw conflict("Vi phạm đã được đóng, không thể gửi phản hồi.");
    }
    const violation = updated.rows[0];

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ phản hồi vi phạm", object: `Vi phạm #${violation.id}`, detail: dto.note.slice(0, 200) },
    );
    await this.notifications.notifyRoles(INSPECTION_ROLES, {
      kind: "violation",
      title: `Hộ ${user.fullName} đã phản hồi vi phạm`,
      body: `${violation.title}: ${dto.note.slice(0, 200)}`,
      link: ADMIN_LINKS.violations,
    });

    const { rows } = await this.db.query(`SELECT ${VIOLATION_COLUMNS} FROM violations v WHERE v.id = $1`, [id]);
    return camelRow(rows[0]);
  }
}
