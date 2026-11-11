import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { attachmentUrlSql, camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { UploadsService } from "../../uploads/uploads.service";
import { ADMIN_LINKS, HTX_ROLES } from "../common/admin-links";
import {
  assertPlotNotInIsolation,
  assertPlotOwned,
  type ClientContext,
  exceedsWithTolerance,
  householdIdOf,
} from "../common/portal-context";
import type { CreateHarvestDeclarationDto } from "./harvest.dto";

const DECLARATION_COLUMNS = `d.id, d.plot_code, d.harvested_on, d.weight_kg, d.grade_a_kg, d.grade_b_kg,
  d.quality_rating, d.status, d.review_note, d.reviewed_at,
  coalesce(${attachmentUrlSql("d.photo_id")}, d.photo_url) AS photo_url,
  d.note, d.created_at`;

/** Sản lượng đóng góp theo lô và khai báo thu hái tại vườn của hộ. */
@Injectable()
export class HarvestService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
  ) {}

  async harvest(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT c.id, l.code AS lot_code, l.qr_code, l.harvested_on, c.weight_kg, l.buyer, l.market, l.status
       FROM harvest_contributions c JOIN harvest_lots l ON l.id = c.lot_id
       WHERE c.household_id = $1 ORDER BY l.harvested_on DESC, c.id DESC LIMIT 100`,
      [householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  /** Thông báo lịch thu hoạch dự kiến do HTX tính toán từ nhật ký chăm sóc và gửi cho hộ dân. */
  async notices(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT n.id, n.title, n.body, n.link, n.read_at, n.created_at
       FROM notifications n
       WHERE n.user_id = $1 AND n.kind = 'harvest'
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 20`,
      [user.id],
    );
    return { data: camelRows(rows) };
  }

  async declarations(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT ${DECLARATION_COLUMNS}
       FROM harvest_declarations d
       WHERE d.household_id = $1
       ORDER BY d.harvested_on DESC, d.id DESC LIMIT 100`,
      [householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async createDeclaration(dto: CreateHarvestDeclarationDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const harvestedOn = dto.harvestedOn ?? todayVn();
    if (harvestedOn > todayVn()) {
      throw badRequest("Ngày thu hái không được ở tương lai.");
    }

    const gradeAKg = dto.gradeAKg ?? 0;
    const gradeBKg = dto.gradeBKg ?? 0;
    if (exceedsWithTolerance(gradeAKg + gradeBKg, dto.weightKg)) {
      throw badRequest("Tổng khối lượng phân loại (A + B) không được vượt quá tổng sản lượng thu hái.");
    }

    const plotCode = await assertPlotOwned(this.db, householdId, dto.plotCode);
    await assertPlotNotInIsolation(this.db, householdId, plotCode, harvestedOn);
    const [photoId] = await this.uploads.assertUsable(dto.photoId ? [dto.photoId] : [], user, "harvest");

    const inserted = await this.db.query<{ id: number }>(
      `INSERT INTO harvest_declarations
         (household_id, plot_code, harvested_on, weight_kg, grade_a_kg, grade_b_kg, quality_rating, note, photo_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        householdId,
        plotCode,
        harvestedOn,
        dto.weightKg,
        gradeAKg,
        gradeBKg,
        dto.qualityRating || "Loại 1 (VIP)",
        dto.note ?? null,
        photoId ?? null,
      ],
    );
    const id = inserted.rows[0].id;

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Nông hộ khai báo thu hái", object: plotCode, detail: `Sản lượng ${dto.weightKg} kg, ngày ${harvestedOn}` },
    );
    await this.notifications.notifyRoles(HTX_ROLES, {
      kind: "harvest",
      title: `Hộ ${user.fullName} khai báo thu hái ${dto.weightKg} kg`,
      body: `Thửa ${plotCode}, ngày ${harvestedOn}.`,
      link: ADMIN_LINKS.harvest,
    });

    const { rows } = await this.db.query(`SELECT ${DECLARATION_COLUMNS} FROM harvest_declarations d WHERE d.id = $1`, [id]);
    return camelRow(rows[0]);
  }

  async removeDeclaration(id: number, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const deleted = await this.db.query<{ id: number; plot_code: string; weight_kg: number }>(
      `DELETE FROM harvest_declarations
       WHERE id = $1 AND household_id = $2 AND status = 'submitted'
       RETURNING id, plot_code, weight_kg`,
      [id, householdId],
    );
    if (deleted.rowCount === 0) {
      const exists = await this.db.query("SELECT status FROM harvest_declarations WHERE id = $1 AND household_id = $2", [
        id,
        householdId,
      ]);
      if (exists.rowCount === 0) throw notFound("Không tìm thấy bản khai báo thu hái.");
      throw badRequest("Chỉ xóa được khai báo đang ở trạng thái chờ xác nhận.");
    }
    const row = deleted.rows[0];
    await this.audit.write(
      { ip: context.ip, user },
      { action: "Nông hộ xóa khai báo thu hái", object: `Khai báo thu hái #${row.id}`, detail: `${row.plot_code} – ${row.weight_kg} kg` },
    );
    return { ok: true };
  }
}
