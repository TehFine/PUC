import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { INSPECTION_ROLES } from "../../portal/common/admin-links";

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
      virtual: ["_method", "_notifySudden"],
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    const out: Record<string, unknown> = { ...input, _method: context.method };
    if (context.method === "PATCH" && context.id !== undefined) {
      const exRes = await this.db.query<{
        kind: string;
        scheduled_on: string;
        title: string;
        officer: string;
      }>("SELECT kind, scheduled_on::text AS scheduled_on, title, officer FROM inspection_schedule WHERE id = $1", [
        context.id,
      ]);
      const prev = exRes.rows[0];
      if (prev && out.kind === "sudden" && prev.kind !== "sudden") {
        out._notifySudden = {
          title: String(out.title ?? prev.title),
          scheduledOn: String(out.scheduledOn ?? prev.scheduled_on),
          officer: String(out.officer ?? prev.officer),
        };
      }
    }
    return out;
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    if (input._method === "POST") {
      if (input.kind === "sudden") {
        await this.notifications.notifyRoles(INSPECTION_ROLES, {
          kind: "schedule",
          title: `Lịch kiểm tra đột xuất: ${String(input.title)}`,
          body: `Ngày ${String(input.scheduledOn)}, cán bộ phụ trách: ${String(input.officer)}`,
          link: "/admin?section=schedule",
        });
        return;
      }
      await this.notifications.notifyAllFarmers({
        kind: "schedule",
        title: `Lịch kiểm tra mới: ${String(input.title)}`,
        body: `Ngày ${String(input.scheduledOn)}, cán bộ phụ trách: ${String(input.officer)}`,
        link: "/portal?tab=inspection",
      });
      return;
    }

    const suddenAlert = input._notifySudden as
      | { title: string; scheduledOn: string; officer: string }
      | undefined;
    if (suddenAlert) {
      await this.notifications.notifyRoles(INSPECTION_ROLES, {
        kind: "schedule",
        title: `Lịch kiểm tra đột xuất: ${suddenAlert.title}`,
        body: `Ngày ${suddenAlert.scheduledOn}, cán bộ phụ trách: ${suddenAlert.officer}`,
        link: "/admin?section=schedule",
      });
    }
  }
}
