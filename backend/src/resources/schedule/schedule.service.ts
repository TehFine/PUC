import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";

@Injectable()
export class ScheduleService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    super(db, audit, {
      resource: "schedule",
      label: "Lịch kiểm tra",
      table: "inspection_schedule",
      fields: `t.id, t.scheduled_on, t.title, t.officer, t.plot_count, t.kind`,
      from: `inspection_schedule t`,
      orderBy: "t.scheduled_on ASC, t.id",
      search: ["t.title", "t.officer"],
      filters: { kind: "t.kind" },
    });
  }

  protected override prepare(input: Record<string, unknown>, context: WriteContext) {
    return { ...input, _method: context.method };
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    if (input._method === "POST") {
      await this.notifications.notifyAllFarmers({
        kind: "schedule",
        title: `Lịch kiểm tra mới: ${String(input.title)}`,
        body: `Ngày ${String(input.scheduledOn)} – Cán bộ: ${String(input.officer)}`,
        link: "/portal?tab=inspection",
      });
    }
  }
}
