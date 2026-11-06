import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope } from "../../common/crud/village-scope";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";

@Injectable()
export class TestingService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
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
      virtual: ["_method"],
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    await assertHouseholdInScope(this.db, input, context.user);
    return { ...input, _method: context.method };
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    if (input._method === "POST" && input.householdId) {
      const passed = input.result === "pass";
      await this.notifications.notifyHousehold(Number(input.householdId), {
        kind: "lab",
        title: `Kết quả kiểm nghiệm mẫu ${String(input.code)}: ${passed ? "Đạt" : "Không đạt"}`,
        body: `Thửa ${String(input.plotCode)} – Đơn vị: ${String(input.lab)}`,
        link: "/portal?tab=inspection",
      });
    }
  }
}
