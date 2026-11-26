import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import { assertHouseholdInScope, isStaffInCuneCoopScope, villageScope } from "../../common/crud/village-scope";
import { badRequest, forbidden } from "../../common/errors/app.exception";
import { attachmentUrlSql, publicAttachmentUrlSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertPlotOwned } from "../../portal/common/portal-context";
import { UploadsService } from "../../uploads/uploads.service";

const SEALED_VERIFIED_LAB_ERR =
  "Phiếu kiểm nghiệm đã xác thực và niêm phong, không được phép chỉnh sửa thông tin kết quả, mẫu hoặc hộ/thửa liên kết.";
const DEFAULT_LAB_ACCREDITATION = "VILAS 356 - ISO/IEC 17025 (GACC chỉ định)";

interface ExistingLabTestRow {
  code: string;
  household_id: number;
  plot_code: string;
  sampled_on: string;
  cd_mg_kg: number;
  yellow_o_positive: boolean;
  residue_mg_kg: number;
  chlorpyrifos_mg_kg: number | null;
  result: string;
  lab: string;
  record_status: string;
  scan_attachment_id: number | null;
  lab_accreditation_code: string | null;
  external_verify_code: string | null;
  external_verify_url: string | null;
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
        if (user.role === "enterprise") {
          // Doanh nghiệp chỉ xem phiếu đã xác thực của các hộ đã cung ứng vào lô hàng của chính mình.
          if (!user.enterpriseId) return "1 = 0";
          params.push(user.enterpriseId);
          return `t.record_status = 'verified' AND EXISTS (
            SELECT 1 FROM harvest_contributions hc
            JOIN harvest_lots hl ON hl.id = hc.lot_id
            WHERE hc.household_id = t.household_id AND hl.enterprise_id = $${params.length}
          )`;
        }
        return villageScope("h.village_id")(user, params);
      },
      virtual: ["_method", "_notifyVerified"],
    });
  }

  private redactForEnterprise(row: Record<string, unknown>, user: AuthUser) {
    if (user.role !== "enterprise") return row;
    return {
      ...row,
      householdId: undefined,
      scanAttachmentId: undefined,
      householdName: "Vùng liên kết HTX Cư Né",
      plotCode: "Vùng PUC liên kết",
    };
  }

  private async queryVerifiedSummary(user: AuthUser): Promise<{
    total: number;
    passCount: number;
    failCount: number;
  }> {
    const params: unknown[] = [];
    const conditions: string[] = ["t.record_status = 'verified'"];
    const scoped = this.config.scope?.(user, params);
    if (scoped) conditions.push(scoped);
    const { rows } = await this.db.query<{
      total: number;
      pass_count: number;
      fail_count: number;
    }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE t.result = 'pass')::int AS pass_count,
              COUNT(*) FILTER (WHERE t.result = 'fail')::int AS fail_count
         FROM lab_tests t
         JOIN households h ON h.id = t.household_id
        WHERE ${conditions.join(" AND ")}`,
      params,
    );
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      passCount: Number(row?.pass_count ?? 0),
      failCount: Number(row?.fail_count ?? 0),
    };
  }

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const cleanQuery = user.role === "enterprise" ? { ...query, householdId: undefined } : query;
    const [res, summary] = await Promise.all([
      super.list(user, cleanQuery),
      this.queryVerifiedSummary(user),
    ]);
    if (user.role !== "enterprise") return { ...res, summary };
    return { ...res, data: res.data.map((r) => this.redactForEnterprise(r, user)), summary };
  }

  override async findOne(id: number, user: AuthUser) {
    const row = await super.findOne(id, user);
    return this.redactForEnterprise(row, user);
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, true)) {
      throw forbidden("Bạn không có quyền thao tác phiếu kiểm nghiệm ngoài phạm vi quản lý.");
    }
    await assertHouseholdInScope(this.db, input, context.user);
    const out: Record<string, unknown> = { ...input };

    let existing: ExistingLabTestRow | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const exRes = await this.db.query<ExistingLabTestRow>(
        `SELECT code,
                household_id,
                plot_code,
                to_char(sampled_on, 'YYYY-MM-DD') AS sampled_on,
                cd_mg_kg::float8 AS cd_mg_kg,
                yellow_o_positive,
                residue_mg_kg::float8 AS residue_mg_kg,
                chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
                result,
                lab,
                record_status,
                scan_attachment_id,
                lab_accreditation_code,
                external_verify_code,
                external_verify_url
         FROM lab_tests
         WHERE id = $1`,
        [context.id],
      );
      existing = exRes.rows[0];
      if (!existing) {
        return { ...out, _method: context.method };
      }
      await assertHouseholdInScope(this.db, { householdId: existing.household_id }, context.user);

      if (existing.record_status === "verified") {
        if (out.code !== undefined && String(out.code).trim() !== String(existing.code).trim()) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.householdId !== undefined && Number(out.householdId) !== Number(existing.household_id)) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (
          out.plotCode !== undefined &&
          String(out.plotCode ?? "").trim().toUpperCase() !== String(existing.plot_code ?? "").trim().toUpperCase()
        ) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.sampledOn !== undefined && String(out.sampledOn).slice(0, 10) !== String(existing.sampled_on).slice(0, 10)) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.cdMgKg !== undefined && Math.abs(Number(out.cdMgKg) - Number(existing.cd_mg_kg ?? 0)) > 1e-9) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.yellowOPositive !== undefined && Boolean(out.yellowOPositive) !== Boolean(existing.yellow_o_positive)) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.residueMgKg !== undefined && Math.abs(Number(out.residueMgKg) - Number(existing.residue_mg_kg ?? 0)) > 1e-9) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.chlorpyrifosMgKg !== undefined) {
          const nextChlor = out.chlorpyrifosMgKg === null ? null : Number(out.chlorpyrifosMgKg);
          const prevChlor =
            existing.chlorpyrifos_mg_kg === null || existing.chlorpyrifos_mg_kg === undefined
              ? null
              : Number(existing.chlorpyrifos_mg_kg);
          const sameChlor =
            nextChlor === null && prevChlor === null
              ? true
              : nextChlor !== null && prevChlor !== null && Math.abs(nextChlor - prevChlor) <= 1e-9;
          if (!sameChlor) {
            throw badRequest(SEALED_VERIFIED_LAB_ERR);
          }
        }
        if (out.result !== undefined && String(out.result) !== String(existing.result)) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.lab !== undefined && String(out.lab).trim() !== String(existing.lab).trim()) {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.recordStatus !== undefined && String(out.recordStatus) !== "verified") {
          throw badRequest(SEALED_VERIFIED_LAB_ERR);
        }
        if (out.scanAttachmentId !== undefined) {
          const nextScan = out.scanAttachmentId === null ? null : Number(out.scanAttachmentId);
          const prevScan =
            existing.scan_attachment_id === null || existing.scan_attachment_id === undefined
              ? null
              : Number(existing.scan_attachment_id);
          if (nextScan !== prevScan) {
            throw badRequest(SEALED_VERIFIED_LAB_ERR);
          }
        }

        const prevUrl = String(existing.external_verify_url ?? "").trim();
        if (out.externalVerifyUrl !== undefined) {
          const nextUrl = String(out.externalVerifyUrl ?? "").trim();
          if (prevUrl && nextUrl !== prevUrl) {
            throw badRequest(SEALED_VERIFIED_LAB_ERR);
          }
        }
        const prevExtCode = String(existing.external_verify_code ?? "").trim();
        const autoExtCode = `ISO17025-${String(existing.code).replace(/[^A-Za-z0-9-]/g, "").toUpperCase()}`;
        if (out.externalVerifyCode !== undefined) {
          const nextExtCode = String(out.externalVerifyCode ?? "").trim();
          if (!nextExtCode && prevExtCode) {
            throw badRequest(SEALED_VERIFIED_LAB_ERR);
          }
          if (prevExtCode && prevExtCode !== autoExtCode && nextExtCode !== prevExtCode) {
            throw badRequest(SEALED_VERIFIED_LAB_ERR);
          }
        }
        const prevAcc = String(existing.lab_accreditation_code ?? "").trim();
        if (out.labAccreditationCode !== undefined) {
          const nextAcc = String(out.labAccreditationCode ?? "").trim();
          if (!nextAcc && prevAcc) {
            throw badRequest(SEALED_VERIFIED_LAB_ERR);
          }
          if (prevAcc && prevAcc !== DEFAULT_LAB_ACCREDITATION && nextAcc !== prevAcc) {
            throw badRequest(SEALED_VERIFIED_LAB_ERR);
          }
        }
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
    if (out.labAccreditationCode !== undefined) {
      out.labAccreditationCode =
        typeof out.labAccreditationCode === "string" ? out.labAccreditationCode.trim() : "";
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
    const becameVerifiedOnPatch =
      context.method === "PATCH" &&
      existing !== undefined &&
      existing.record_status === "draft" &&
      effRecordStatus === "verified" &&
      effHouseholdId > 0;
    if (becameVerifiedOnPatch && existing) {
      out._notifyVerified = {
        householdId: effHouseholdId,
        code: String(out.code ?? existing.code),
        plotCode: effPlotCode || existing.plot_code,
        lab: String(out.lab ?? existing.lab),
        result: effResult,
      };
    }
    return { ...out, _method: context.method };
  }

  protected override async guardDelete(id: number, _user: AuthUser) {
    // Phiếu đã xác thực là bằng chứng kiểm định gắn với lô hàng và trang QR: không được xóa để che giấu kết quả.
    const { rows } = await this.db.query<{ record_status: string }>("SELECT record_status FROM lab_tests WHERE id = $1", [id]);
    if (rows[0]?.record_status === "verified") {
      throw badRequest("Phiếu kiểm nghiệm đã xác thực được niêm phong, không thể xóa.");
    }
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
      return;
    }
    const verifiedPatch = input._notifyVerified as
      | { householdId: number; code: string; plotCode: string; lab: string; result: string }
      | undefined;
    if (verifiedPatch) {
      const passed = verifiedPatch.result === "pass";
      await this.notifications.notifyHousehold(verifiedPatch.householdId, {
        kind: "lab",
        title: `Kết quả kiểm nghiệm mẫu ${verifiedPatch.code}: ${passed ? "Đạt" : "Không đạt"}`,
        body: `Thửa ${verifiedPatch.plotCode}, đơn vị ${verifiedPatch.lab}`,
        link: "/portal?tab=inspection",
      });
    }
  }
}
