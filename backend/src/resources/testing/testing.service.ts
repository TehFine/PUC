import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import { assertHouseholdInScope } from "../../common/crud/village-scope";
import { publicAttachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { UploadsService } from "../../uploads/uploads.service";

@Injectable()
export class TestingService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
  ) {
    super(db, audit, {
      resource: "testing",
      label: "Kết quả kiểm nghiệm",
      table: "lab_tests",
      fields: `t.id, t.code, t.household_id, h.name AS household_name, t.plot_code, t.sampled_on,
      t.cd_mg_kg, t.yellow_o_positive, t.residue_mg_kg, t.chlorpyrifos_mg_kg, t.result, t.lab,
      t.record_status, t.scan_attachment_id, ${publicAttachmentUrlSql("t.scan_attachment_id")} AS scan_url`,
      from: `lab_tests t JOIN households h ON h.id = t.household_id`,
      orderBy: "t.sampled_on DESC, t.id DESC",
      search: ["t.code", "h.name", "t.plot_code", "t.lab"],
      searchFor: (user) => (user.role === "enterprise" ? ["t.code", "t.lab"] : ["t.code", "h.name", "t.plot_code", "t.lab"]),
      filters: { householdId: "t.household_id", result: "t.result", recordStatus: "t.record_status" },
      scope: (user) => (user.role === "enterprise" ? "t.record_status = 'verified'" : null),
      virtual: ["_method"],
    });
  }

  private redactForEnterprise(row: Record<string, unknown>, user: AuthUser) {
    if (user.role !== "enterprise") return row;
    return {
      ...row,
      householdId: undefined,
      householdName: "Vùng liên kết HTX Cư Né",
      plotCode: "Vùng PUC liên kết",
    };
  }

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const cleanQuery = user.role === "enterprise" ? { ...query, householdId: undefined } : query;
    const res = await super.list(user, cleanQuery);
    if (user.role !== "enterprise") return res;
    return { ...res, data: res.data.map((r) => this.redactForEnterprise(r, user)) };
  }

  override async findOne(id: number, user: AuthUser) {
    const row = await super.findOne(id, user);
    return this.redactForEnterprise(row, user);
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    await assertHouseholdInScope(this.db, input, context.user);
    if (input.scanAttachmentId !== undefined) {
      if (input.scanAttachmentId === null) {
        input.scanAttachmentId = null;
      } else {
        const [validId] = await this.uploads.assertUsable(
          [Number(input.scanAttachmentId)],
          context.user,
          "lab",
          input.householdId ? Number(input.householdId) : null,
        );
        input.scanAttachmentId = validId ?? null;
      }
    }
    return { ...input, _method: context.method };
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    if (input._method === "POST" && input.householdId && input.recordStatus !== "draft") {
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
