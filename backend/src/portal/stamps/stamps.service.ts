import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { attachmentUrlSql, camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { UploadsService } from "../../uploads/uploads.service";
import { assertPlotOwned, type ClientContext, householdIdOf } from "../common/portal-context";
import type { ActivatePortalStampDto } from "./stamps.dto";

const STAMP_COLUMNS = `id, allocation_id, plot_code, serial_code, status, activated_at, fruit_weight_kg, grade,
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
    const plotCode = await assertPlotOwned(this.db, householdId, dto.plotCode);
    const [photoId] = await this.uploads.assertUsable(dto.photoId ? [dto.photoId] : [], user, "stamp");
    const today = todayVn();

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
       RETURNING ${STAMP_COLUMNS}`,
      [cleanSerial, householdId, plotCode, dto.fruitWeightKg, dto.grade, photoId ?? null, today],
    );

    if (updated.rowCount === 0) {
      const own = await this.db.query<{ status: string }>(
        "SELECT status FROM farmer_stamps WHERE upper(serial_code) = upper($1) AND household_id = $2 LIMIT 1",
        [cleanSerial, householdId],
      );
      if (own.rowCount === 0) {
        throw notFound("Không tìm thấy mã tem hợp lệ.");
      }
      if (own.rows[0].status === "activated") {
        throw badRequest(`Tem "${cleanSerial}" đã được kích hoạt trước đó.`);
      }
      throw badRequest(`Tem "${cleanSerial}" đã bị thu hồi, không thể kích hoạt.`);
    }

    const row = updated.rows[0];
    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Nông hộ kích hoạt tem quả",
        object: String(row.serial_code),
        detail: `Thửa ${plotCode}, khối lượng ${dto.fruitWeightKg} kg, hạng ${dto.grade}`,
      },
    );

    return camelRow(row);
  }
}
