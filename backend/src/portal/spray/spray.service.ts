import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest } from "../../common/errors/app.exception";
import { camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { assertPlotOwned, type ClientContext, householdIdOf } from "../common/portal-context";
import type { CreatePortalSprayDto } from "./spray.dto";

const SPRAY_COLUMNS = `s.id, s.sprayed_on, s.plot_code, s.pesticide_id, p.name AS pesticide, p.status AS pesticide_status, s.source,
  s.dose, s.area_ha, s.isolation_days, (s.sprayed_on + s.isolation_days) AS isolation_ends_on, s.mrl_status`;

/** Nhật ký phun thuốc của hộ. */
@Injectable()
export class SprayService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
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

    // Thuốc bị cấm luôn bị ghi nhận là không đạt để cán bộ kiểm tra theo dõi.
    const mrlStatus = pesticide.status === "banned" ? "exceeded" : "pass";
    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO spray_records (sprayed_on, household_id, pesticide_id, source, dose, area_ha, isolation_days, mrl_status, plot_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [sprayedOn, householdId, dto.pesticideId, dto.source ?? null, dto.dose, dto.areaHa, pesticide.isolation_days ?? 0, mrlStatus, plotCode],
    );
    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Hộ ghi nhật ký phun thuốc",
        object: `Nhật ký phun thuốc #${rows[0].id}`,
        detail: `${pesticide.name}${plotCode ? ` – ${plotCode}` : ""}`,
      },
    );
    const created = await this.db.query(
      `SELECT ${SPRAY_COLUMNS} FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id WHERE s.id = $1`,
      [rows[0].id],
    );
    return camelRow(created.rows[0]);
  }
}
