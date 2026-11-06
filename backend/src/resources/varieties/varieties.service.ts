import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { badRequest } from "../../common/errors/app.exception";
import { DatabaseService } from "../../database/database.service";

const MAX_FARMING_TECHNIQUES_BYTES = 20_000;

@Injectable()
export class VarietiesService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
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
    });
  }

  protected override prepare(input: Record<string, unknown>) {
    const out = { ...input };
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
}
