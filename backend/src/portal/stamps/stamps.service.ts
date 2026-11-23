import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { attachmentUrlSql, camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { UploadsService } from "../../uploads/uploads.service";
import { assertPlotNotInIsolation, assertPlotOwned, type ClientContext, householdIdOf, plotsTableExists } from "../common/portal-context";
import type { ActivatePortalStampDto } from "./stamps.dto";

const STAMP_COLUMNS = `id, allocation_id, plot_code, serial_code, qr_token, status, activated_at, fruit_weight_kg, grade,
  coalesce(${attachmentUrlSql("photo_id")}, photo_url) AS photo_url, harvest_date`;

/** Đợt cấp tem và kích hoạt tem dán quả của hộ. */
@Injectable()
export class StampsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
  ) {}

  async stamps(user: AuthUser) {
    const householdId = householdIdOf(user);

    // Ba truy vấn độc lập: chạy song song (1 lượt chờ CSDL thay vì 3)
    const [statsRes, allocs, stamps] = await Promise.all([
      this.db.query<{ total: number; activated: number; allocated: number }>(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE status = 'activated')::int AS activated,
           count(*) FILTER (WHERE status = 'allocated')::int AS allocated
         FROM farmer_stamps
         WHERE household_id = $1`,
        [householdId],
      ),
      this.db.query(
        `SELECT id, allocation_code, allocated_on, season, max_quota_stamps, quantity_allocated, from_serial, to_serial, status, notes
         FROM farmer_stamp_allocations
         WHERE household_id = $1
         ORDER BY allocated_on DESC, id DESC`,
        [householdId],
      ),
      this.db.query(
        `SELECT ${STAMP_COLUMNS}
         FROM farmer_stamps
         WHERE household_id = $1
         ORDER BY status = 'allocated' DESC, id DESC
         LIMIT 100`,
        [householdId],
      ),
    ]);

    const stats = {
      totalAllocated: Number(statsRes.rows[0]?.total ?? 0),
      totalActivated: Number(statsRes.rows[0]?.activated ?? 0),
      remaining: Number(statsRes.rows[0]?.allocated ?? 0),
    };

    return {
      stats,
      allocations: camelRows(allocs.rows),
      stamps: camelRows(stamps.rows),
    };
  }

  /**
   * Kích hoạt tem quả bằng một câu UPDATE nguyên tử.
   * Tem không tồn tại hoặc thuộc về hộ khác đều trả cùng thông báo 404 để không lộ dải serial giữa các hộ.
   */
  async activate(dto: ActivatePortalStampDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const cleanSerial = dto.serialCode.trim();

    const hhRes = await this.db.query<{ status: string }>("SELECT status FROM households WHERE id = $1", [householdId]);
    if (hhRes.rows[0]?.status === "violation") {
      throw badRequest("Hộ đang có vi phạm chưa khắc phục, tạm khóa kích hoạt tem truy xuất.");
    }
    if (hhRes.rows[0]?.status === "pending") {
      throw badRequest("Hộ nông dân hoặc thửa đất đang chờ phê duyệt hồ sơ, chưa thể khai báo thu hoạch / kích hoạt tem.");
    }

    const cleanPlotCode = await assertPlotOwned(this.db, householdId, dto.plotCode);
    const hasPlots = await plotsTableExists(this.db);
    if (hasPlots) {
      const plotRes = await this.db.query<{ status: string }>(
        "SELECT status FROM plots WHERE household_id = $1 AND upper(code) = upper($2) LIMIT 1",
        [householdId, cleanPlotCode],
      );
      if (plotRes.rows[0]?.status === "violation") {
        throw badRequest("Thửa đất đang có vi phạm chưa khắc phục, không thể kích hoạt tem truy xuất.");
      }
      if (plotRes.rows[0]?.status === "pending") {
        throw badRequest("Hộ nông dân hoặc thửa đất đang chờ phê duyệt hồ sơ, chưa thể khai báo thu hoạch / kích hoạt tem.");
      }
    }

    const own = await this.db.query<{ status: string; plot_code: string | null }>(
      "SELECT status, plot_code FROM farmer_stamps WHERE upper(serial_code) = upper($1) AND household_id = $2 LIMIT 1",
      [cleanSerial, householdId],
    );
    if (own.rowCount === 0) {
      throw notFound("Không tìm thấy mã tem hợp lệ.");
    }
    const stamp = own.rows[0];
    if (stamp.status === "activated") {
      throw badRequest(`Tem "${cleanSerial}" đã được kích hoạt trước đó.`);
    }
    if (stamp.status !== "allocated") {
      throw badRequest(`Tem "${cleanSerial}" đã bị thu hồi, không thể kích hoạt.`);
    }
    if (stamp.plot_code && stamp.plot_code.trim() !== "" && stamp.plot_code.trim().toUpperCase() !== cleanPlotCode.toUpperCase()) {
      throw badRequest("Tem này đã được cấp cố định cho thửa " + stamp.plot_code.trim() + ", không thể kích hoạt sang thửa khác.");
    }

    const today = todayVn();
    await assertPlotNotInIsolation(this.db, householdId, cleanPlotCode, today);
    const [photoId] = await this.uploads.assertUsable(dto.photoId ? [dto.photoId] : [], user, "stamp");

    const updated = await this.db.query(
      `UPDATE farmer_stamps
       SET
         status = 'activated',
         activated_at = now(),
         plot_code = $3,
         fruit_weight_kg = $4,
         grade = $5,
         photo_id = $6,
         harvest_date = $7
       WHERE upper(serial_code) = upper($1)
         AND household_id = $2
         AND status = 'allocated'
         AND (plot_code IS NULL OR btrim(plot_code) = '' OR upper(plot_code) = upper($3))
         AND EXISTS (SELECT 1 FROM households h WHERE h.id = $2 AND h.status NOT IN ('violation', 'pending'))
       RETURNING ${STAMP_COLUMNS}`,
      [cleanSerial, householdId, cleanPlotCode, dto.fruitWeightKg, dto.grade, photoId ?? null, today],
    );

    if (updated.rowCount === 0) {
      throw badRequest(`Tem "${cleanSerial}" đã được kích hoạt hoặc bị thu hồi, không thể thao tác.`);
    }

    const row = updated.rows[0];
    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Nông hộ kích hoạt tem quả",
        object: String(row.serial_code),
        detail: `Thửa ${cleanPlotCode}, khối lượng ${dto.fruitWeightKg} kg, hạng ${dto.grade}`,
      },
    );

    return camelRow(row);
  }
}
