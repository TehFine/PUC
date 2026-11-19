import { Injectable, Optional } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";

const PESTICIDE_STATUS_VN: Record<string, string> = {
  allowed: "Được phép sử dụng",
  restricted: "Hạn chế sử dụng",
  banned: "Cấm sử dụng",
};

@Injectable()
export class PesticidesService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {
    super(db, audit, {
      resource: "pesticides",
      label: "Thuốc BVTV",
      table: "pesticides",
      fields: `t.id, t.name, t.active_ingredient, t.concentration, t.manufacturer,
      t.mrl_mg_kg, t.isolation_days, t.status`,
      from: `pesticides t`,
      orderBy: "t.id",
      search: ["t.name", "t.active_ingredient", "t.manufacturer"],
      filters: { status: "t.status" },
      virtual: ["_method"],
    });
  }

  protected override prepare(input: Record<string, unknown>, context: WriteContext) {
    return { ...input, _method: context.method };
  }

  protected override async afterWrite(id: number, input: Record<string, unknown>) {
    if (!this.notifications) return;
    const { rows } = await this.db.query<{ name: string; status: string; isolation_days: number | null }>(
      "SELECT name, status, isolation_days FROM pesticides WHERE id = $1",
      [id],
    );
    const row = rows[0];
    if (!row) return;
    const statusLabel = PESTICIDE_STATUS_VN[row.status] ?? row.status;
    await this.notifications.notifyAllFarmers({
      kind: "system",
      title:
        input._method === "POST"
          ? `Thuốc BVTV mới trong danh mục: ${row.name}`
          : `Cập nhật danh mục thuốc BVTV: ${row.name}`,
      body: `Trạng thái: ${statusLabel}, thời gian cách ly PHI ${row.isolation_days ?? 0} ngày.`,
      link: "/portal?tab=learn",
    });
  }
}
