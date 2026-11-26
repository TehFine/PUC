import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { attachmentUrlSql, camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { UploadsService } from "../../uploads/uploads.service";
import { ADMIN_LINKS } from "../common/admin-links";
import {
  assertPlotNotInIsolation,
  assertPlotOwned,
  type ClientContext,
  conflict,
  exceedsWithTolerance,
  householdIdOf,
  plotsTableExists,
  withTransaction,
} from "../common/portal-context";
import type { CreateHarvestDeclarationDto } from "./harvest.dto";

const DECLARATION_COLUMNS = `d.id, d.plot_code, d.harvested_on, d.weight_kg, d.grade_a_kg, d.grade_b_kg,
  d.quality_rating, d.status, d.review_note, d.reviewed_at,
  coalesce(${attachmentUrlSql("d.photo_id")}, d.photo_url) AS photo_url,
  d.note, d.created_at,
  to_char(d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS declared_on,
  GREATEST(0, ((d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - d.harvested_on))::int AS late_declaration_days`;

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
      `SELECT MIN(c.id)::int AS id,
              l.id::int AS lot_id,
              l.code AS lot_code,
              l.qr_code,
              l.qr_token,
              string_agg(DISTINCT btrim(c.plot_code), ', ' ORDER BY btrim(c.plot_code))
                FILTER (WHERE c.plot_code IS NOT NULL AND btrim(c.plot_code) <> '') AS plot_code,
              l.harvested_on,
              COALESCE(SUM(c.weight_kg), 0)::float8 AS weight_kg,
              CASE WHEN l.weight_tons IS NOT NULL AND l.weight_tons > 0
                THEN ROUND((l.weight_tons * 1000)::numeric, 1)::float8
                ELSE NULL
              END AS lot_weight_kg,
              l.buyer,
              l.market,
              l.status,
              l.revoked_reason
       FROM harvest_contributions c
       JOIN harvest_lots l ON l.id = c.lot_id
       WHERE c.household_id = $1
       GROUP BY l.id, l.code, l.qr_code, l.qr_token, l.harvested_on, l.weight_tons, l.buyer, l.market, l.status, l.revoked_reason
       ORDER BY l.harvested_on DESC, MAX(c.id) DESC
       LIMIT 100`,
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
    const today = todayVn();
    const harvestedOn = dto.harvestedOn ?? today;
    if (harvestedOn > today) {
      throw badRequest("Ngày thu hái không được ở tương lai. Chỉ khai báo sản lượng sau khi đã thu hái thực tế.");
    }
    const harvestBackdateDays = Math.round(
      (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${harvestedOn}T00:00:00Z`).getTime()) / 86_400_000,
    );
    if (harvestBackdateDays > 7) {
      throw badRequest("Không được khai báo thu hái lùi quá 7 ngày.");
    }

    const gradeAKg = dto.gradeAKg ?? 0;
    const gradeBKg = dto.gradeBKg ?? 0;
    if (exceedsWithTolerance(gradeAKg + gradeBKg, dto.weightKg)) {
      throw badRequest("Tổng khối lượng phân loại (A + B) không được vượt quá tổng sản lượng thu hái.");
    }

    const plotCode = await assertPlotOwned(this.db, householdId, dto.plotCode);
    const hasPlots = await plotsTableExists(this.db);
    const [photoId] = await this.uploads.assertUsable(dto.photoId ? [dto.photoId] : [], user, "harvest");

    const { id, householdName } = await withTransaction(this.db, async (client) => {
      const hhRes = await client.query<{ id: number; name: string; status: string }>(
        "SELECT id, name, status FROM households WHERE id = $1 FOR UPDATE",
        [householdId],
      );
      const hhRow = hhRes.rows[0];
      if (!hhRow) {
        throw badRequest("Hộ nông dân không tồn tại.");
      }
      if (hhRow.status === "violation") {
        throw badRequest("Hộ đang có vi phạm chưa khắc phục, không thể khai báo thu hái.");
      }
      if (hhRow.status === "pending") {
        throw badRequest("Hộ nông dân hoặc thửa đất đang chờ phê duyệt hồ sơ, chưa thể khai báo thu hoạch / kích hoạt tem.");
      }

      if (hasPlots) {
        const plotRes = await client.query<{ status: string }>(
          "SELECT status FROM plots WHERE household_id = $1 AND upper(code) = upper($2) LIMIT 1 FOR UPDATE",
          [householdId, plotCode],
        );
        if (plotRes.rows[0]?.status === "violation") {
          throw badRequest("Thửa đất đang có vi phạm chưa khắc phục, không thể khai báo thu hái.");
        }
        if (plotRes.rows[0]?.status === "pending") {
          throw badRequest("Hộ nông dân hoặc thửa đất đang chờ phê duyệt hồ sơ, chưa thể khai báo thu hoạch / kích hoạt tem.");
        }
      }

      await assertPlotNotInIsolation(client, householdId, plotCode, harvestedOn);

      const dupRes = await client.query(
        `SELECT 1
         FROM harvest_declarations
         WHERE household_id = $1
           AND upper(btrim(plot_code)) = upper($2)
           AND harvested_on = $3::date
           AND status IN ('submitted', 'confirmed')
         LIMIT 1`,
        [householdId, plotCode, harvestedOn],
      );
      if ((dupRes.rowCount ?? 0) > 0) {
        throw conflict("Thửa đất này đã có bản khai báo thu hái trong ngày đã chọn.");
      }

      const inserted = await client.query<{ id: number }>(
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
      return { id: inserted.rows[0].id, householdName: hhRow.name || user.fullName };
    });

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Nông hộ khai báo thu hái", object: plotCode, detail: `Sản lượng ${dto.weightKg} kg, ngày ${harvestedOn}` },
    );
    await this.notifications.notifyOversightForHousehold(householdId, {
      kind: "harvest",
      title: `Hộ ${householdName} khai báo thu hái ${dto.weightKg} kg`,
      body: `Thửa ${plotCode}, ngày ${harvestedOn}.`,
      link: `${ADMIN_LINKS.harvest}&id=${id}`,
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
    await this.notifications.resolveByLink(`${ADMIN_LINKS.harvest}&id=${row.id}`);
    await this.audit.write(
      { ip: context.ip, user },
      { action: "Nông hộ xóa khai báo thu hái", object: `Khai báo thu hái #${row.id}`, detail: `${row.plot_code} – ${row.weight_kg} kg` },
    );
    await this.notifications.notifyOversightForHousehold(householdId, {
      kind: "harvest",
      title: `Hộ ${user.fullName} đã rút khai báo thu hái`,
      body: `Thửa ${row.plot_code}, sản lượng ${row.weight_kg} kg.`,
      link: ADMIN_LINKS.harvest,
    });
    return { ok: true };
  }
}
