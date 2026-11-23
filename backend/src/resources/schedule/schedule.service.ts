import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { isStaffInCuneCoopScope } from "../../common/crud/village-scope";
import { forbidden } from "../../common/errors/app.exception";
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
      // Lịch kiểm tra đột xuất chỉ hiển thị cho cán bộ HTX và kiểm tra viên; cán bộ thôn không được biết trước.
      scope: (user) => {
        if (!isStaffInCuneCoopScope(user, true)) return "1 = 0";
        return INSPECTION_ROLES.includes(user.role) ? null : "t.kind <> 'sudden'";
      },
      virtual: ["_method", "_notifySudden"],
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, true)) {
      throw forbidden("Bạn không có quyền thao tác lịch kiểm tra ngoài phạm vi quản lý.");
    }
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
          previousTitle: prev.title,
        };
      }
    }
    return out;
  }

  protected override async afterWrite(id: number, input: Record<string, unknown>) {
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
      | { title: string; scheduledOn: string; officer: string; previousTitle: string }
      | undefined;
    if (suddenAlert) {
      // Đợt kiểm tra chuyển sang đột xuất: thu hồi thông báo lịch đã gửi cho hộ dân để không lộ trước ngày giờ kiểm tra.
      await this.db.query(
        `DELETE FROM notifications n
         USING users u
         WHERE u.id = n.user_id
           AND u.role = 'farmer'
           AND n.kind = 'schedule'
           AND (
             n.link = '/portal?tab=inspection&scheduleId=' || $1::text
             OR n.title = 'Lịch kiểm tra mới: ' || $2
             OR n.title = 'Lịch kiểm tra: ' || $2
           )`,
        [String(id), suddenAlert.previousTitle],
      );
      await this.notifications.notifyRoles(INSPECTION_ROLES, {
        kind: "schedule",
        title: `Lịch kiểm tra đột xuất: ${suddenAlert.title}`,
        body: `Ngày ${suddenAlert.scheduledOn}, cán bộ phụ trách: ${suddenAlert.officer}`,
        link: "/admin?section=schedule",
      });
      return;
    }

    if (input._method === "PATCH") {
      const { rows } = await this.db.query<{
        kind: string;
        title: string;
        scheduled_on: string;
        officer: string;
      }>(
        "SELECT kind, title, scheduled_on::text AS scheduled_on, officer FROM inspection_schedule WHERE id = $1",
        [id],
      );
      const cur = rows[0];
      if (cur && cur.kind !== "sudden") {
        await this.notifications.notifyAllFarmers({
          kind: "schedule",
          title: `Cập nhật lịch kiểm tra: ${cur.title}`,
          body: `Ngày ${cur.scheduled_on}, cán bộ phụ trách: ${cur.officer}`,
          link: `/portal?tab=inspection&scheduleId=${id}`,
        });
      }
    }
  }
}
