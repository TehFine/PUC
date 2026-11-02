import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { ReadOnlyCrudController } from "../../common/crud/crud-controller.factory";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { attachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertExists } from "../shared/state";

void ReadOnlyCrudController;

@Injectable()
export class HarvestDeclarationsService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    super(db, audit, {
      resource: "harvest-declarations",
      label: "Khai báo thu hoạch",
      table: "harvest_declarations",
      fields: `t.id, t.household_id, h.name AS household_name, h.code AS household_code,
      v.name AS village_name, t.plot_code, t.harvested_on, t.weight_kg::float8 AS weight_kg,
      t.grade_a_kg::float8 AS grade_a_kg, t.grade_b_kg::float8 AS grade_b_kg,
      t.quality_rating, t.note, t.status, t.review_note, t.reviewed_by, t.reviewed_at,
      COALESCE(${attachmentUrlSql("t.photo_id")}, t.photo_url) AS photo_url,
      t.created_at`,
      from: `harvest_declarations t
             JOIN households h ON h.id = t.household_id
             JOIN villages v ON v.id = h.village_id`,
      orderBy: "t.harvested_on DESC, t.id DESC",
      search: ["h.name", "h.code", "t.plot_code", "t.note"],
      filters: { status: "t.status", householdId: "t.household_id" },
    });
  }

  async review(
    id: number,
    status: "confirmed" | "rejected",
    note: string | null | undefined,
    user: AuthUser,
    ip?: string,
  ) {
    const { rows } = await this.db.query<{
      id: number;
      household_id: number;
      plot_code: string;
      weight_kg: string;
    }>(
      `UPDATE harvest_declarations
       SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
       WHERE id = $1 AND status = 'submitted'
       RETURNING id, household_id, plot_code, weight_kg`,
      [id, status, user.id, note ?? null],
    );
    if (rows.length === 0) {
      await assertExists(
        this.db,
        "harvest_declarations",
        id,
        "Chỉ xử lý được khai báo thu hoạch đang chờ xác nhận.",
      );
    }
    const row = rows[0];
    const action = status === "confirmed" ? "Xác nhận khai báo thu hoạch" : "Từ chối khai báo thu hoạch";
    await this.audit.write(
      { ip, user },
      { action, object: `${this.config.label} #${id}`, detail: note ?? `Thửa ${row.plot_code}` },
    );
    await this.notifications.notifyHousehold(row.household_id, {
      kind: "harvest",
      title:
        status === "confirmed"
          ? `Khai báo thu hoạch thửa ${row.plot_code} (${row.weight_kg} kg) đã được xác nhận`
          : `Khai báo thu hoạch thửa ${row.plot_code} bị từ chối`,
      body: note ?? null,
      link: "/portal?tab=harvest",
    });
    return this.findOne(id, user);
  }
}
