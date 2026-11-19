import { Injectable, Optional } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { badRequest } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";

const MAX_FARMING_TECHNIQUES_BYTES = 20_000;

@Injectable()
export class VarietiesService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {
    super(db, audit, {
      resource: "varieties",
      label: "Giống sầu riêng",
      table: "varieties",
      fields: `t.id, t.name, t.origin, t.weight_range, t.harvest_years, t.description,
      t.category, t.status, t.flesh_color, t.seed_rate, t.brix, t.yield_per_ha,
      t.image_url, t.market_potential, t.morphology, t.farming_techniques`,
      from: `varieties t`,
      orderBy: "t.id",
      search: ["t.name", "t.origin", "t.description"],
      filters: { category: "t.category", status: "t.status" },
      virtual: ["_method"],
    });
  }

  protected override prepare(input: Record<string, unknown>, context?: WriteContext) {
    const out: Record<string, unknown> = { ...input, _method: context?.method ?? "POST" };
    if (out.morphology !== undefined && out.morphology !== null) {
      out.morphology = JSON.stringify(out.morphology);
    }
    if (out.farmingTechniques !== undefined && out.farmingTechniques !== null) {
      const serialized = JSON.stringify(out.farmingTechniques);
      if (serialized.length > MAX_FARMING_TECHNIQUES_BYTES) {
        throw badRequest("Dữ liệu kỹ thuật canh tác vượt quá dung lượng cho phép.");
      }
      out.farmingTechniques = serialized;
    }
    return out;
  }

  protected override async afterWrite(id: number, input: Record<string, unknown>) {
    if (!this.notifications) return;
    const { rows } = await this.db.query<{ name: string; description: string | null }>(
      "SELECT name, description FROM varieties WHERE id = $1",
      [id],
    );
    const row = rows[0];
    if (!row) return;
    await this.notifications.notifyAllFarmers({
      kind: "system",
      title:
        input._method === "POST"
          ? `Giống sầu riêng mới trong danh mục: ${row.name}`
          : `Cập nhật thông tin giống sầu riêng: ${row.name}`,
      body: row.description ? row.description.slice(0, 200) : null,
      link: "/portal?tab=learn",
    });
  }
}
