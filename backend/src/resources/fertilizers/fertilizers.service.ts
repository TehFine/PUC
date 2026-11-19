import { Injectable, Optional } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";

@Injectable()
export class FertilizersService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {
    super(db, audit, {
      resource: "fertilizers",
      label: "Phân bón",
      table: "fertilizers",
      fields: `t.id, t.name, t.category, t.formula, t.manufacturer, t.dosage,
      t.application_method, t.timing, t.status, t.image_url, t.description,
      t.created_at, t.updated_at`,
      from: `fertilizers t`,
      orderBy: "t.id",
      search: ["t.name", "t.formula", "t.manufacturer"],
      filters: { category: "t.category", status: "t.status" },
      virtual: ["_method"],
    });
  }

  protected override prepare(input: Record<string, unknown>, context: WriteContext) {
    return { ...input, _method: context.method };
  }

  protected override async afterWrite(id: number, input: Record<string, unknown>) {
    if (!this.notifications) return;
    const { rows } = await this.db.query<{ name: string; dosage: string | null }>(
      "SELECT name, dosage FROM fertilizers WHERE id = $1",
      [id],
    );
    const row = rows[0];
    if (!row) return;
    await this.notifications.notifyAllFarmers({
      kind: "system",
      title:
        input._method === "POST"
          ? `Phân bón mới trong danh mục: ${row.name}`
          : `Cập nhật danh mục phân bón: ${row.name}`,
      body: row.dosage ? `Liều lượng khuyến nghị: ${row.dosage}` : "Xem hướng dẫn sử dụng chi tiết trong mục Kiến thức.",
      link: "/portal?tab=learn",
    });
  }
}
