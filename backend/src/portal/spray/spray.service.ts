import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { ADMIN_LINKS, INSPECTION_ROLES } from "../common/admin-links";
import { assertPlotOwned, type ClientContext, householdIdOf } from "../common/portal-context";
import type { CreatePortalSprayDto } from "./spray.dto";

const SPRAY_COLUMNS = `s.id, s.sprayed_on, s.plot_code, s.pesticide_id, p.name AS pesticide, p.status AS pesticide_status, s.source,
  s.dose, s.area_ha, s.isolation_days, (s.sprayed_on + s.isolation_days) AS isolation_ends_on, s.mrl_status, s.created_at,
  (s.created_at > now() - interval '24 hours' AND p.status <> 'banned') AS can_delete`;

/** Nhật ký phun thuốc của hộ. */
@Injectable()
export class SprayService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT ${SPRAY_COLUMNS}
       FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id
       WHERE s.household_id = $1 ORDER BY s.sprayed_on DESC, s.id DESC LIMIT 200`,
      [householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async create(dto: CreatePortalSprayDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const sprayedOn = dto.sprayedOn ?? todayVn();
    if (sprayedOn > todayVn()) throw badRequest("Ngày phun thuốc không được ở tương lai.");
    const plotCode = dto.plotCode ? await assertPlotOwned(this.db, householdId, dto.plotCode) : null;

    const pesticide = (
      await this.db.query<{ name: string; status: string; isolation_days: number | null }>(
        "SELECT name, status, isolation_days FROM pesticides WHERE id = $1",
        [dto.pesticideId],
      )
    ).rows[0];
    if (!pesticide) throw badRequest("Không tìm thấy loại thuốc đã chọn.");

    // Thuốc bị cấm luôn bị ghi nhận là không đạt để cán bộ kiểm tra theo dõi và cảnh báo ngay.
    const mrlStatus = pesticide.status === "banned" ? "exceeded" : "pass";
    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO spray_records (sprayed_on, household_id, pesticide_id, source, dose, area_ha, isolation_days, mrl_status, plot_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [sprayedOn, householdId, dto.pesticideId, dto.source ?? null, dto.dose, dto.areaHa, pesticide.isolation_days ?? 0, mrlStatus, plotCode],
    );

    const id = rows[0].id;
    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Hộ ghi nhật ký phun thuốc",
        object: `Nhật ký phun thuốc #${id}`,
        detail: `${pesticide.name}${plotCode ? ` – ${plotCode}` : ""}`,
      },
    );

    if (pesticide.status === "banned" || pesticide.status === "restricted") {
      await this.notifications.notifyRoles(INSPECTION_ROLES, {
        kind: "violation",
        title:
          pesticide.status === "banned"
            ? `CẢNH BÁO: Hộ ${user.fullName} khai báo dùng thuốc CẤM (${pesticide.name})`
            : `Lưu ý giám sát: Hộ ${user.fullName} phun hoạt chất hạn chế (${pesticide.name})`,
        body: `${plotCode ? `Thửa ${plotCode} · ` : ""}Liều lượng ${dto.dose}, ngày ${sprayedOn}.`,
        link: ADMIN_LINKS.journal,
      });
    }

    const created = await this.db.query(
      `SELECT ${SPRAY_COLUMNS} FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id WHERE s.id = $1`,
      [id],
    );
    return camelRow(created.rows[0]);
  }

  /** Cho phép hộ xóa bản ghi phun thuốc nhập nhầm trong vòng 24 giờ (trừ bản ghi thuốc cấm cần lưu vết giám sát). */
  async remove(id: number, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const deleted = await this.db.query<{ id: number; pesticide: string; plot_code: string | null }>(
      `DELETE FROM spray_records s
       USING pesticides p
       WHERE s.id = $1
         AND s.household_id = $2
         AND p.id = s.pesticide_id
         AND s.created_at > now() - interval '24 hours'
         AND p.status <> 'banned'
       RETURNING s.id, p.name AS pesticide, s.plot_code`,
      [id, householdId],
    );
    if (deleted.rowCount === 0) {
      const exists = await this.db.query<{ status: string }>(
        `SELECT p.status FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id
         WHERE s.id = $1 AND s.household_id = $2`,
        [id, householdId],
      );
      if (exists.rowCount === 0) throw notFound("Không tìm thấy bản ghi phun thuốc.");
      if (exists.rows[0].status === "banned") {
        throw forbidden("Bản ghi khai báo thuốc cấm đã được chuyển tới cán bộ kỹ thuật HTX để hỗ trợ xử lý, không thể tự xóa.");
      }
      throw forbidden("Chỉ xóa được bản ghi phun thuốc trong vòng 24 giờ sau khi nhập.");
    }
    const row = deleted.rows[0];
    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Hộ xóa nhật ký phun thuốc",
        object: `Nhật ký phun thuốc #${row.id}`,
        detail: `${row.pesticide}${row.plot_code ? ` – ${row.plot_code}` : ""}`,
      },
    );
    return { ok: true };
  }
}
