import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, villageScope } from "../../common/crud/village-scope";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class JournalService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "journal",
      label: "Nhật ký canh tác",
      table: "journal_entries",
      fields: `t.id, t.entry_on, t.household_id, h.name AS household_name, t.plot_code,
      t.activity, t.detail, t.recorder, t.has_photo`,
      from: `journal_entries t JOIN households h ON h.id = t.household_id`,
      orderBy: "t.entry_on DESC, t.id DESC",
      search: ["h.name", "t.plot_code", "t.activity", "t.detail"],
      filters: { householdId: "t.household_id", activity: "t.activity" },
      scope: villageScope("h.village_id"),
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    await assertHouseholdInScope(this.db, input, context.user);
    return input;
  }
}
