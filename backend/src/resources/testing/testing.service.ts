import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import { assertHouseholdInScope, villageScope } from "../../common/crud/village-scope";
import { badRequest } from "../../common/errors/app.exception";
import { attachmentUrlSql, publicAttachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertPlotOwned } from "../../portal/common/portal-context";
import { UploadsService } from "../../uploads/uploads.service";

interface ExistingLabTestRow {
  household_id: number;
  plot_code: string;
  cd_mg_kg: number;
  yellow_o_positive: boolean;
  result: string;
  record_status: string;
}

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
      t.record_status, t.scan_attachment_id,
      CASE
        WHEN t.record_status = 'verified' THEN ${publicAttachmentUrlSql("t.scan_attachment_id")}
        ELSE ${attachmentUrlSql("t.scan_attachment_id")}
      END AS scan_url,
      t.lab_accreditation_code, t.external_verify_code, t.external_verify_url`,
      from: `lab_tests t JOIN households h ON h.id = t.household_id`,
      orderBy: "t.sampled_on DESC, t.id DESC",
      search: ["t.code", "h.name", "t.plot_code", "t.lab"],
      searchFor: (user) => (user.role === "enterprise" ? ["t.code", "t.lab"] : ["t.code", "h.name", "t.plot_code", "t.lab"]),
      filters: { householdId: "t.household_id", result: "t.result", recordStatus: "t.record_status" },
      scope: (user, params) => {
        if (user.role === "enterprise") return "t.record_status = 'verified'";
        return villageScope("h.village_id")(user, params);
      },
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
    const out: Record<string, unknown> = { ...input };

    let existing: ExistingLabTestRow | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const exRes = await this.db.query<ExistingLabTestRow>(
        `SELECT household_id, plot_code, cd_mg_kg::float8 AS cd_mg_kg, yellow_o_positive, result, record_status
         FROM lab_tests
         WHERE id = $1`,
        [context.id],
      );
      existing = exRes.rows[0];
      if (!existing) {
        return { ...out, _method: context.method };
      }
    }

    const effHouseholdId = Number(out.householdId ?? existing?.household_id ?? 0);
    const effPlotCode = String(out.plotCode ?? existing?.plot_code ?? "").trim();
    if (effHouseholdId > 0 && effPlotCode) {
      const cleanPlot = await assertPlotOwned(this.db, effHouseholdId, effPlotCode);
      if (out.plotCode !== undefined || context.method === "POST") {
        out.plotCode = cleanPlot;
      }
    }

    const effYellowO =
      out.yellowOPositive !== undefined ? Boolean(out.yellowOPositive) : Boolean(existing?.yellow_o_positive);
    const effCd = out.cdMgKg !== undefined ? Number(out.cdMgKg) : Number(existing?.cd_mg_kg ?? 0);
    const effResult = String(out.result ?? existing?.result ?? "pass");
    const effRecordStatus = String(out.recordStatus ?? existing?.record_status ?? "draft");

    if (effResult === "pass" && (effYellowO === true || effCd > 0.05)) {
      throw badRequest("Mẫu dương tính Vàng O hoặc vượt ngưỡng Cadimi (0.05 mg/kg) bắt buộc phải có kết quả Không đạt.");
    }
    if (
      existing &&
      existing.record_status === "verified" &&
      existing.result === "fail" &&
      (effResult === "pass" || effRecordStatus !== "verified")
    ) {
      throw badRequest("Phiếu kiểm nghiệm Không đạt đã xác thực không được phép chuyển thành Đạt hoặc hạ về bản nháp.");
    }

    if (out.externalVerifyUrl !== undefined) {
      const rawUrl = typeof out.externalVerifyUrl === "string" ? out.externalVerifyUrl.trim() : "";
      if (!rawUrl) {
        out.externalVerifyUrl = null;
      } else if (!/^https:\/\/[^\s<>"'`]+$/i.test(rawUrl)) {
        throw badRequest("Đường dẫn đối chiếu phòng kiểm nghiệm phải bắt đầu bằng https:// hợp lệ.");
      } else {
        out.externalVerifyUrl = rawUrl;
      }
    }
    if (out.externalVerifyCode !== undefined && typeof out.externalVerifyCode === "string" && !out.externalVerifyCode.trim()) {
      out.externalVerifyCode = null;
    }
    if (out.labAccreditationCode !== undefined && typeof out.labAccreditationCode === "string" && !out.labAccreditationCode.trim()) {
      out.labAccreditationCode = "VILAS 356 - ISO/IEC 17025 (GACC chỉ định)";
    }
    if (out.scanAttachmentId !== undefined) {
      if (out.scanAttachmentId === null) {
        out.scanAttachmentId = null;
      } else {
        const [validId] = await this.uploads.assertUsable(
          [Number(out.scanAttachmentId)],
          context.user,
          "lab",
          effHouseholdId > 0 ? effHouseholdId : null,
        );
        out.scanAttachmentId = validId ?? null;
      }
    }
    if (context.method === "POST" && out.code && !out.externalVerifyCode) {
      const safeCode = String(out.code).replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
      if (safeCode) {
        out.externalVerifyCode = `ISO17025-${safeCode}`;
      }
    }
    return { ...out, _method: context.method };
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    if (input._method === "POST" && input.householdId && input.recordStatus !== "draft") {
      const passed = input.result === "pass";
      await this.notifications.notifyHousehold(Number(input.householdId), {
        kind: "lab",
        title: `Kết quả kiểm nghiệm mẫu ${String(input.code)}: ${passed ? "Đạt" : "Không đạt"}`,
        body: `Thửa ${String(input.plotCode)}, đơn vị ${String(input.lab)}`,
        link: "/portal?tab=inspection",
      });
    }
  }
}
