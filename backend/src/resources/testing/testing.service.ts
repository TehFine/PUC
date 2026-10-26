import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class TestingService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "testing",
      label: "Kết quả kiểm nghiệm",
      table: "lab_tests",
      fields: `t.id, t.code, t.household_id, h.name AS household_name, t.plot_code, t.sampled_on,
      t.cd_mg_kg, t.yellow_o_positive, t.residue_mg_kg, t.chlorpyrifos_mg_kg, t.result, t.lab`,
      from: `lab_tests t JOIN households h ON h.id = t.household_id`,
      orderBy: "t.sampled_on DESC, t.id DESC",
      search: ["t.code", "h.name", "t.plot_code", "t.lab"],
      filters: { householdId: "t.household_id", result: "t.result" },
    });
  }
}
