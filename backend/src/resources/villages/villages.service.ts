import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import {
  isStaffInCuneCoopScope,
  isStaffInParcelScope,
  resolveParcelAdminLocation,
} from "../../common/crud/village-scope";
import { forbidden } from "../../common/errors/app.exception";
import { hasPublicColumn } from "../../common/sql/schema-cache";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class VillagesService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "villages",
      label: "Thôn",
      table: "villages",
      fields: `t.id, t.name, t.leader, t.household_count, t.plot_count, t.area_ha`,
      from: `villages t`,
      orderBy: "t.id",
      search: ["t.name", "t.leader"],
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, true)) {
      throw forbidden("Bạn không có quyền thao tác danh mục thôn ngoài phạm vi quản lý.");
    }
    const next: Record<string, unknown> = { ...input };
    const nextName = typeof next.name === "string" ? next.name.trim() : undefined;

    if (context.method === "PATCH" && context.id !== undefined) {
      const cur = await this.db.query<{ id: number; name: string }>(
        "SELECT id, name FROM villages WHERE id = $1",
        [context.id],
      );
      const existing = cur.rows[0];
      if (existing) {
        if (!isStaffInParcelScope(context.user, { villageId: existing.id, villageName: existing.name }, null)) {
          throw forbidden("Thôn này nằm ngoài địa bàn quản lý của bạn.");
        }
        if (nextName !== undefined) {
          const oldLoc = resolveParcelAdminLocation(existing.name, null);
          const newLoc = resolveParcelAdminLocation(nextName, null);
          if (oldLoc !== newLoc) {
            throw forbidden(
              "Không được phép đổi tên thôn làm thay đổi phân vùng địa giới hành chính của dữ liệu lịch sử.",
            );
          }
        }
      }
    }

    if (nextName !== undefined) {
      if (!isStaffInParcelScope(context.user, { villageName: nextName }, null)) {
        throw forbidden("Tên thôn nằm ngoài địa bàn xã được phân công quản lý của bạn.");
      }
      if (await hasPublicColumn(this.db, "villages", "commune_location")) {
        next.communeLocation = resolveParcelAdminLocation(nextName, null);
      }
    }
    return next;
  }

  protected override async guardDelete(id: number, user?: AuthUser) {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền xóa thôn ngoài phạm vi quản lý.");
    }
    if (user) {
      const cur = await this.db.query<{ id: number; name: string }>(
        "SELECT id, name FROM villages WHERE id = $1",
        [id],
      );
      if (cur.rows[0] && !isStaffInParcelScope(user, { villageId: cur.rows[0].id, villageName: cur.rows[0].name }, null)) {
        throw forbidden("Thôn này nằm ngoài địa bàn quản lý của bạn.");
      }
    }
  }
}
