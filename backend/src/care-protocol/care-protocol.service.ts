import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { can, isCoopStaffRole } from "../auth/permissions";
import { isStaffInCuneCoopScope } from "../common/crud/village-scope";
import { AppException, badRequest, forbidden, notFound } from "../common/errors/app.exception";
import { verifyPlotGpsProximity } from "../common/geo/plot-proximity";
import { attachmentUrlSql, attachmentUrlsSql, camelRows, todayVn } from "../common/sql/rows";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ADMIN_LINKS, INSPECTION_ROLES } from "../portal/common/admin-links";
import {
  assertPlotOwned,
  type ClientContext,
  conflict,
  householdIdOf,
  plotsTableExists,
  withTransaction,
} from "../portal/common/portal-context";
import { FARMER_RECORDER } from "../portal/journal/journal.service";
import { isJournalViolationSql } from "../resources/shared/violation-evidence";
import { UploadsService } from "../uploads/uploads.service";
import {
  addIsoDays,
  type ComplianceIssue,
  diffIsoDays,
  evaluateDeclarationCompliance,
  formatIsoVn,
  getNextSequentialMilestone,
  getSenProRule,
  getSequentialMilestone,
  SENPRO_RULES_2026_2027,
  SEQUENTIAL_MILESTONES_2026_2027,
  type SequentialMilestoneSpec,
  TOTAL_SEQUENTIAL_MILESTONES,
} from "./care-protocol.catalog";
import type {
  CareProtocolListQueryDto,
  ConfigurePlotCarePlanDto,
  DeclareCareMilestoneDto,
} from "./care-protocol.dto";

const PROTOCOL_SEASON = "2026-2027";
const PORTAL_PROTOCOL_LINK = "/portal?tab=diary&view=protocol";
const ADMIN_PROTOCOL_LINK = "/admin?section=journal&tab=protocol";

function normGeoText(val: string): string {
  return val
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ADMIN_LEVEL_PREFIX_RE = /^(?:xa|phuong|thi tran|huyen|quan|thi xa|thanh pho|tp\.?|tinh)\s+/;

function matchesJurisdiction(assignedRaw: string, adminLocations: string[]): boolean {
  const target = normGeoText(assignedRaw);
  if (!target) return false;
  if (target === "*" || target === "toan quoc") return true;

  const targetHasPrefix = ADMIN_LEVEL_PREFIX_RE.test(target);
  const targetStripped = target.replace(ADMIN_LEVEL_PREFIX_RE, "").trim();

  for (const loc of adminLocations) {
    const segments = loc
      .split(",")
      .map((s) => normGeoText(s))
      .filter(Boolean);
    for (const seg of segments) {
      if (seg === target) return true;
      if (!targetHasPrefix) {
        const segStripped = seg.replace(ADMIN_LEVEL_PREFIX_RE, "").trim();
        if (segStripped === targetStripped) return true;
      }
    }
  }
  return false;
}

function resolveHouseholdAdminLocation(villageName?: string | null, plotCode?: string | null): string {
  const v = (villageName || "").trim();
  const p = (plotCode || "").trim();
  if (/ea\s*kh[aă]l|ea\s*k'?s[oô]/i.test(v) || /^66-PUC-SR0001-/i.test(p)) {
    return "Xã Ea Khăl, Huyện Ea H'Leo, Tỉnh Đắk Lắk";
  }
  return "Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk";
}

function isStaffInPlanScope(
  user: AuthUser,
  row: { village_id: number; village_name?: string | null; plot_code?: string | null },
): boolean {
  if (isCoopStaffRole(user.role)) {
    const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
    if (userCoop !== "HTX-CUNE") return false;
  }
  const locations = [resolveHouseholdAdminLocation(row.village_name, row.plot_code)];
  if (user.role === "village_officer") {
    const hasVillage = user.villageId !== null && user.villageId !== undefined;
    const hasCommune = Boolean(user.assignedCommune && user.assignedCommune.trim());
    if (!hasVillage && !hasCommune) return false;
    if (hasVillage && Number(row.village_id) !== Number(user.villageId)) return false;
    if (hasCommune && !matchesJurisdiction(user.assignedCommune!, locations)) return false;
    return true;
  }
  if (user.role === "inspector") {
    const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
    if (!matchesJurisdiction(region, locations)) return false;
  }
  if (user.assignedCommune && user.assignedCommune.trim()) {
    if (!matchesJurisdiction(user.assignedCommune, locations)) return false;
  }
  return true;
}

interface PlanRow {
  id: number;
  household_id: number;
  household_code: string;
  household_name: string;
  household_phone: string;
  village_id: number;
  village_name: string;
  plot_code: string;
  season: string;
  cycle_start_on: string;
  start_milestone_seq: number;
  current_milestone_code: string;
  reminder_lead_days: number;
  last_late_declaration_days: number;
  status: "active" | "completed" | "paused";
  note: string | null;
  updated_at: string;
}

interface DeclarationRow {
  id: number;
  plan_id: number;
  household_id: number;
  plot_code: string;
  stage_code: string;
  milestone_code: string;
  is_senpro: boolean;
  scheduled_on: string | null;
  due_on: string | null;
  performed_on: string;
  declared_at: string;
  declared_on: string;
  late_declaration_days: number;
  late_reason: string | null;
  expected_tree_state: string;
  actual_tree_state: string;
  followed_standard: boolean;
  selected_products: string[];
  actual_dosage: string;
  extra_inputs: string | null;
  supplier_name: string | null;
  pesticide_id: number | null;
  pesticide_name: string | null;
  pesticide_dose: string | null;
  field_photo_url: string | null;
  field_photo_urls: string[];
  invoice_photo_url: string | null;
  invoice_photo_urls: string[];
  latitude: number | null;
  longitude: number | null;
  gps_verified: boolean;
  gps_distance_m: number | null;
  journal_entry_id: number | null;
  journal_record_hash: string | null;
  spray_record_id: number | null;
  compliance_status: "compliant" | "warning" | "violation";
  compliance_issues: ComplianceIssue[];
  farmer_note: string | null;
  created_at: string;
}

export type MilestoneTimelineState =
  | "completed"
  | "skipped_prior"
  | "overdue_critical"
  | "overdue"
  | "due_now"
  | "upcoming_current"
  | "upcoming_next"
  | "upcoming";

@Injectable()
export class CareProtocolService {
  private readonly logger = new Logger(CareProtocolService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Danh mục chuẩn cho giao diện hiển thị gợi ý mà không cần hardcode lặp lại. */
  getCatalog() {
    return {
      season: PROTOCOL_SEASON,
      totalMilestones: TOTAL_SEQUENTIAL_MILESTONES,
      milestones: SEQUENTIAL_MILESTONES_2026_2027,
      senProRules: SENPRO_RULES_2026_2027,
    };
  }

  /** Đảm bảo hộ dân có sẵn kế hoạch chăm sóc 2026-2027 cho mọi thửa vườn thuộc hộ. */
  async ensureHouseholdPlans(householdId: number): Promise<void> {
    const plotCodes = new Set<string>();

    if (await plotsTableExists(this.db)) {
      const pRes = await this.db.query<{ code: string }>(
        "SELECT code FROM plots WHERE household_id = $1 ORDER BY code",
        [householdId],
      );
      for (const r of pRes.rows) {
        if (r.code?.trim()) plotCodes.add(r.code.trim().toUpperCase());
      }
    }

    if (plotCodes.size === 0) {
      const regSign = await this.db.query<{ reg: string | null }>(
        "SELECT to_regclass('public.plot_signboard_tokens')::text AS reg",
      );
      if (regSign.rows[0]?.reg) {
        const sRes = await this.db.query<{ plot_code: string }>(
          "SELECT plot_code FROM plot_signboard_tokens WHERE household_id = $1 ORDER BY plot_code",
          [householdId],
        );
        for (const r of sRes.rows) {
          if (r.plot_code?.trim()) plotCodes.add(r.plot_code.trim().toUpperCase());
        }
      }
    }

    if (plotCodes.size === 0) {
      const jRes = await this.db.query<{ plot_code: string }>(
        "SELECT DISTINCT plot_code FROM journal_entries WHERE household_id = $1 AND plot_code IS NOT NULL ORDER BY plot_code",
        [householdId],
      );
      for (const r of jRes.rows) {
        if (r.plot_code?.trim()) plotCodes.add(r.plot_code.trim().toUpperCase());
      }
    }

    if (plotCodes.size === 0) {
      const hRes = await this.db.query<{ code: string }>("SELECT code FROM households WHERE id = $1", [householdId]);
      const hCode = hRes.rows[0]?.code?.trim().toUpperCase();
      if (hCode) plotCodes.add(`${hCode}-T01`);
    }

    if (plotCodes.size === 0) return;

    const today = todayVn();
    const codesArr = [...plotCodes];
    await this.db.query(
      `INSERT INTO plot_care_plans (household_id, plot_code, season, cycle_start_on, start_milestone_seq, current_milestone_code)
       SELECT $1, u.code, $3, $4::date, 1, 'cb-rua-vuon'
       FROM unnest($2::text[]) AS u(code)
       WHERE NOT EXISTS (
         SELECT 1 FROM plot_care_plans pcp
         WHERE pcp.household_id = $1
           AND upper(pcp.plot_code) = upper(u.code)
           AND pcp.season = $3
       )
       ON CONFLICT (household_id, plot_code, season) DO NOTHING`,
      [householdId, codesArr, PROTOCOL_SEASON, today],
    );
  }

  /**
   * Đồng bộ tự động kế hoạch 2026-2027 cho toàn bộ thửa đất & hộ nông dân trong HTX
   * để trang Quản trị (Nhật ký -> Tiến độ Quy trình 2026-2027) luôn có dữ liệu ngay cả khi
   * nông hộ chưa từng mở Cổng hộ dân.
   */
  async ensureAllHouseholdPlans(): Promise<void> {
    const today = todayVn();

    if (await plotsTableExists(this.db)) {
      await this.db.query(
        `INSERT INTO plot_care_plans (household_id, plot_code, season, cycle_start_on, start_milestone_seq, current_milestone_code)
         SELECT p.household_id, upper(btrim(p.code)), $1, $2::date, 1, 'cb-rua-vuon'
         FROM plots p
         WHERE p.household_id IS NOT NULL
           AND btrim(p.code) <> ''
           AND NOT EXISTS (
             SELECT 1 FROM plot_care_plans pcp
             WHERE pcp.household_id = p.household_id
               AND upper(pcp.plot_code) = upper(btrim(p.code))
               AND pcp.season = $1
           )
         ON CONFLICT (household_id, plot_code, season) DO NOTHING`,
        [PROTOCOL_SEASON, today],
      );
    }

    const regSign = await this.db.query<{ reg: string | null }>(
      "SELECT to_regclass('public.plot_signboard_tokens')::text AS reg",
    );
    if (regSign.rows[0]?.reg) {
      await this.db.query(
        `INSERT INTO plot_care_plans (household_id, plot_code, season, cycle_start_on, start_milestone_seq, current_milestone_code)
         SELECT pst.household_id, upper(btrim(pst.plot_code)), $1, $2::date, 1, 'cb-rua-vuon'
         FROM plot_signboard_tokens pst
         WHERE pst.household_id IS NOT NULL
           AND btrim(pst.plot_code) <> ''
           AND NOT EXISTS (
             SELECT 1 FROM plot_care_plans pcp
             WHERE pcp.household_id = pst.household_id
               AND pcp.season = $1
           )
         ON CONFLICT (household_id, plot_code, season) DO NOTHING`,
        [PROTOCOL_SEASON, today],
      );
    }

    await this.db.query(
      `INSERT INTO plot_care_plans (household_id, plot_code, season, cycle_start_on, start_milestone_seq, current_milestone_code)
       SELECT h.id,
              COALESCE(
                (
                  SELECT upper(btrim(je.plot_code))
                  FROM journal_entries je
                  WHERE je.household_id = h.id
                    AND je.plot_code IS NOT NULL
                    AND btrim(je.plot_code) <> ''
                  ORDER BY je.id ASC
                  LIMIT 1
                ),
                upper(btrim(h.code)) || '-T01'
              ),
              $1,
              $2::date,
              1,
              'cb-rua-vuon'
       FROM households h
       WHERE btrim(h.code) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM plot_care_plans pcp
           WHERE pcp.household_id = h.id
             AND pcp.season = $1
         )
       ON CONFLICT (household_id, plot_code, season) DO NOTHING`,
      [PROTOCOL_SEASON, today],
    );
  }

  /** Cổng hộ dân: trả về toàn bộ Timeline 2026-2027 của các thửa thuộc hộ, kèm kiểm tra nhắc lịch tức thời. */
  async portalListPlans(user: AuthUser) {
    const householdId = householdIdOf(user);
    await this.ensureHouseholdPlans(householdId);
    await this.scanAndNotifyPlansForHousehold(householdId).catch((err) => {
      this.logger.warn(`Không quét được nhắc lịch hộ #${householdId}: ${err instanceof Error ? err.message : String(err)}`);
    });

    const plans = await this.loadPlanRows("WHERE pcp.household_id = $1", [householdId]);
    const declarations = await this.loadDeclarationsByPlanIds(plans.map((p) => p.id));
    const today = todayVn();

    return {
      season: PROTOCOL_SEASON,
      today,
      senProRules: SENPRO_RULES_2026_2027,
      plans: plans.map((plan) => this.buildDetailedPlanTimeline(plan, declarations.get(plan.id) ?? [], today)),
    };
  }

  /** Hộ dân tự thiết lập / đồng bộ giai đoạn hiện tại của thửa vườn. */
  async portalConfigurePlan(dto: ConfigurePlotCarePlanDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const ownedPlot = await assertPlotOwned(this.db, householdId, dto.plotCode);
    const plotCode = ownedPlot.trim().toUpperCase();

    const existingPlanRes = await this.db.query<{ id: number }>(
      `SELECT id FROM plot_care_plans
       WHERE household_id = $1 AND upper(plot_code) = upper($2) AND season = $3
       LIMIT 1`,
      [householdId, plotCode, PROTOCOL_SEASON],
    );
    const existingPlanId = existingPlanRes.rows[0]?.id ?? null;
    if (existingPlanId) {
      const critLog = await this.db.query(
        `SELECT 1 FROM care_protocol_alert_logs
         WHERE plan_id = $1 AND alert_type = 'overdue_critical'
         LIMIT 1`,
        [existingPlanId],
      );
      if ((critLog.rowCount ?? 0) > 0) {
        throw badRequest(
          "Lộ trình đang có cảnh báo quá hạn nghiêm trọng, vui lòng khai báo mốc thực tế hoặc liên hệ cán bộ HTX để điều chỉnh.",
        );
      }
    }

    const openOverdueViol = await this.db.query(
      `SELECT 1 FROM violations v
       WHERE v.household_id = $1
         AND v.status = 'open'
         AND (v.plot_code IS NULL OR upper(v.plot_code) = upper($2))
         AND (v.title ILIKE '%quá hạn%' OR v.title ILIKE '%trễ hạn%')
       LIMIT 1`,
      [householdId, plotCode],
    );
    if ((openOverdueViol.rowCount ?? 0) > 0) {
      throw badRequest(
        "Lộ trình đang có cảnh báo quá hạn nghiêm trọng, vui lòng khai báo mốc thực tế hoặc liên hệ cán bộ HTX để điều chỉnh.",
      );
    }

    return this.applyPlanConfiguration({
      householdId,
      plotCode,
      dto,
      actor: user,
      ip: context.ip,
      notifyFarmerByAdmin: false,
    });
  }

  /** Quản trị viên / Cán bộ HTX thiết lập lộ trình cho thửa vườn của hộ dân. */
  async adminConfigurePlan(dto: ConfigurePlotCarePlanDto, user: AuthUser, context: ClientContext) {
    if (!dto.householdId) {
      throw badRequest("Vui lòng chọn hộ nông dân cần thiết lập lộ trình.");
    }
    await this.assertStaffCanAccessHousehold(user, dto.householdId);
    if (!dto.plotCode || !dto.plotCode.trim()) {
      throw badRequest("Vui lòng nhập hoặc chọn mã thửa đất.");
    }
    const cleanPlotCode = (await assertPlotOwned(this.db, dto.householdId, dto.plotCode)).trim().toUpperCase();

    return this.applyPlanConfiguration({
      householdId: dto.householdId,
      plotCode: cleanPlotCode,
      dto,
      actor: user,
      ip: context.ip,
      notifyFarmerByAdmin: true,
    });
  }

  private async applyPlanConfiguration(params: {
    householdId: number;
    plotCode: string;
    dto: ConfigurePlotCarePlanDto;
    actor: AuthUser;
    ip?: string;
    notifyFarmerByAdmin: boolean;
  }) {
    const { householdId, dto, actor, ip, notifyFarmerByAdmin } = params;
    const plotCode = params.plotCode.trim().toUpperCase();

    let targetSpec: SequentialMilestoneSpec = SEQUENTIAL_MILESTONES_2026_2027[0];
    let cycleStartOn = dto.anchorDate;

    if (dto.mode === "current_milestone") {
      const found = dto.milestoneCode ? getSequentialMilestone(dto.milestoneCode) : undefined;
      if (!found) {
        throw badRequest("Mốc giai đoạn đã chọn không nằm trong quy trình 2026-2027.");
      }
      targetSpec = found;
      cycleStartOn = addIsoDays(dto.anchorDate, -targetSpec.cycleDayStart);
    }

    const existingCaseVariant = await this.db.query<{ id: number }>(
      `SELECT id FROM plot_care_plans
       WHERE household_id = $1 AND upper(plot_code) = upper($2) AND season = $3
       LIMIT 1`,
      [householdId, plotCode, PROTOCOL_SEASON],
    );

    let planId: number;
    if (existingCaseVariant.rows[0]) {
      const updated = await this.db.query<{ id: number }>(
        `UPDATE plot_care_plans
         SET plot_code = $2,
             cycle_start_on = $3::date,
             start_milestone_seq = $4,
             current_milestone_code = $5,
             status = 'active',
             note = COALESCE($6, note),
             updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [
          existingCaseVariant.rows[0].id,
          plotCode,
          cycleStartOn,
          targetSpec.seq,
          targetSpec.code,
          dto.note?.trim() || null,
        ],
      );
      planId = updated.rows[0].id;
    } else {
      const upserted = await this.db.query<{ id: number }>(
        `INSERT INTO plot_care_plans
           (household_id, plot_code, season, cycle_start_on, start_milestone_seq, current_milestone_code, status, note, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, 'active', $7, $8)
         ON CONFLICT (household_id, plot_code, season)
         DO UPDATE SET
           cycle_start_on = EXCLUDED.cycle_start_on,
           start_milestone_seq = EXCLUDED.start_milestone_seq,
           current_milestone_code = EXCLUDED.current_milestone_code,
           status = 'active',
           note = COALESCE(EXCLUDED.note, plot_care_plans.note),
           updated_at = now()
         RETURNING id`,
        [
          householdId,
          plotCode,
          PROTOCOL_SEASON,
          cycleStartOn,
          targetSpec.seq,
          targetSpec.code,
          dto.note?.trim() || null,
          actor.id,
        ],
      );
      planId = upserted.rows[0].id;
    }

    // Xóa nhật ký cảnh báo cũ của mốc hiện tại; hộ tự cấu hình không được xóa dấu vết overdue_critical.
    if (notifyFarmerByAdmin) {
      await this.db.query(
        `DELETE FROM care_protocol_alert_logs
         WHERE plan_id = $1 AND milestone_code = $2`,
        [planId, targetSpec.code],
      );
    } else {
      await this.db.query(
        `DELETE FROM care_protocol_alert_logs
         WHERE plan_id = $1 AND milestone_code = $2 AND alert_type <> 'overdue_critical'`,
        [planId, targetSpec.code],
      );
    }

    const scheduledOn = addIsoDays(cycleStartOn, targetSpec.cycleDayStart);
    const dueOn = addIsoDays(cycleStartOn, targetSpec.cycleDayEnd);

    await this.notifications.notifyHousehold(householdId, {
      kind: "protocol",
      title: notifyFarmerByAdmin
        ? `HTX đã đồng bộ lộ trình chăm sóc Thửa ${plotCode}`
        : `Đã cập nhật lộ trình chăm sóc Thửa ${plotCode}`,
      body: `Mốc hiện tại: Giai đoạn ${targetSpec.stageOrder} ${targetSpec.stageName} - ${targetSpec.dayLabel} (${targetSpec.treeState}), hạn hoàn thành ${formatIsoVn(dueOn)}. ${targetSpec.actionSummary}`,
      link: `${PORTAL_PROTOCOL_LINK}&plotCode=${encodeURIComponent(plotCode)}`,
    });

    await this.audit.write(
      { ip, user: actor },
      {
        action: "Thiết lập lộ trình chăm sóc",
        object: `Thửa ${plotCode}`,
        detail: `${targetSpec.stageName} - ${targetSpec.dayLabel} (bắt đầu chu kỳ ${cycleStartOn})`,
      },
    );

    await this.scanAndNotifyPlansForHousehold(householdId).catch(() => undefined);

    const [plan] = await this.loadPlanRows("WHERE pcp.id = $1", [planId]);
    const declarations = await this.loadDeclarationsByPlanIds([planId]);
    return this.buildDetailedPlanTimeline(plan, declarations.get(planId) ?? [], todayVn());
  }

  /**
   * Hộ nông dân khai báo thực hiện 1 mốc ngày trong quy trình (hoặc khai báo xử lý đọt SenPro):
   * - Bắt buộc ảnh hiện trường + ảnh hóa đơn vật tư (với mọi mốc có dùng phân/thuốc/chế phẩm).
   * - Tự động ghi sổ nhật ký canh tác SHA-256 (và sổ phun thuốc BVTV nếu có chọn thuốc).
   * - Kiểm tra sai lệch phác đồ / quá hạn -> gửi cảnh báo tới cả Quản trị viên HTX & Hộ dân.
   * - Tự động chuyển mốc và gửi thông báo giai đoạn tiếp theo theo tài liệu 2026-2027.
   */
  async portalDeclareMilestone(dto: DeclareCareMilestoneDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const today = todayVn();
    const performedOn = dto.performedOn ?? today;

    if (performedOn > today) {
      throw badRequest("Ngày thực hiện không được ở tương lai.");
    }
    const backdatedDays = diffIsoDays(today, performedOn);
    if (backdatedDays > 7) {
      throw badRequest(
        "Không được khai báo lùi quá 7 ngày để bảo vệ tính minh bạch sổ cái truy xuất. Vui lòng liên hệ cán bộ kỹ thuật xã nếu cần lập biên bản bổ sung.",
      );
    }

    const hhStatusRes = await this.db.query<{ status: string }>("SELECT status FROM households WHERE id = $1", [
      householdId,
    ]);
    if (hhStatusRes.rows[0]?.status === "violation") {
      throw badRequest("Hộ đang ở trạng thái vi phạm chưa khắc phục, tạm khóa khai báo mốc chăm sóc.");
    }

    const plotCode = (await assertPlotOwned(this.db, householdId, dto.plotCode)).trim().toUpperCase();
    const milestoneSpec = getSequentialMilestone(dto.milestoneCode);
    const senProSpec = !milestoneSpec ? getSenProRule(dto.milestoneCode) : undefined;

    if (!milestoneSpec && !senProSpec) {
      throw badRequest("Mã mốc quy trình không hợp lệ theo tài liệu 2026-2027.");
    }

    const rawFieldIds = [
      ...(dto.fieldPhotoIds ?? []),
      ...(dto.fieldPhotoId ? [dto.fieldPhotoId] : []),
    ];
    if (rawFieldIds.length === 0) {
      throw badRequest("Vui lòng chụp ảnh hoặc quay video hiện trường vườn trước khi gửi khai báo.");
    }

    const rawInvoiceIds = [
      ...(dto.invoicePhotoIds ?? []),
      ...(dto.invoicePhotoId ? [dto.invoicePhotoId] : []),
    ];

    const fieldIdSet = new Set(rawFieldIds.map((id) => Number(id)));
    if (rawInvoiceIds.some((id) => fieldIdSet.has(Number(id)))) {
      throw badRequest("Ảnh hóa đơn vật tư phải là ảnh chụp riêng biệt với ảnh hiện trường vườn.");
    }

    const requiresInvoice = milestoneSpec ? milestoneSpec.requiresInvoicePhoto : true;
    if (requiresInvoice && rawInvoiceIds.length === 0) {
      throw badRequest(
        "Mốc chăm sóc này có sử dụng phân bón hoặc chế phẩm, vui lòng chụp ảnh hóa đơn mua hàng hoặc nhãn bao bì vật tư để hoàn tất khai báo.",
      );
    }

    const fieldMedia = await this.uploads.assertUsableDetailed(rawFieldIds, user, "journal", householdId);
    const primaryFieldPhotoId = fieldMedia.primaryId!;

    const fieldAttMetaRes = await this.db.query<{ earliest_upload_on: string | null }>(
      `SELECT MIN(to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')) AS earliest_upload_on
         FROM attachments
        WHERE id = ANY($1::bigint[])`,
      [fieldMedia.ids],
    );
    const earliestFieldUploadOn = fieldAttMetaRes.rows[0]?.earliest_upload_on;
    if (earliestFieldUploadOn && performedOn > earliestFieldUploadOn) {
      throw badRequest(
        "Ảnh hiện trường đã được chụp và tải lên trước ngày thực hiện đã chọn, không thể dùng để khai trước mốc chăm sóc chưa thực hiện.",
      );
    }
    const reusedMilestonePhotoRes = await this.db.query(
      `SELECT 1
         FROM care_milestone_declarations
        WHERE household_id = $1
          AND (field_photo_id = ANY($2::bigint[]) OR field_photo_ids && $2::bigint[])
        LIMIT 1`,
      [householdId, fieldMedia.ids],
    );
    if ((reusedMilestonePhotoRes.rowCount ?? 0) > 0) {
      throw badRequest(
        "Ảnh hiện trường này đã được sử dụng cho một mốc chăm sóc khác. Vui lòng chụp ảnh thực tế mới tại vườn.",
      );
    }

    const invoiceMedia =
      rawInvoiceIds.length > 0
        ? await this.uploads.assertUsableDetailed(rawInvoiceIds, user, "journal", householdId, { imagesOnly: true })
        : { ids: [] as number[], primaryId: null };
    const primaryInvoicePhotoId = invoiceMedia.primaryId;

    // Kiểm tra diện tích và trạng thái thửa để chặn thửa vi phạm và điền vào sổ phun thuốc (nếu có)
    let plotAreaHa = 1.0;
    if (await plotsTableExists(this.db)) {
      const aRes = await this.db.query<{ area_ha: number; status: string }>(
        "SELECT area_ha::float8 AS area_ha, status FROM plots WHERE household_id = $1 AND upper(code) = upper($2) LIMIT 1",
        [householdId, plotCode],
      );
      if (aRes.rows[0]?.status === "violation") {
        throw badRequest("Thửa đất đang bị khóa do vi phạm, vui lòng liên hệ cán bộ HTX xử lý trước khi khai báo.");
      }
      if (aRes.rows[0]?.area_ha && aRes.rows[0].area_ha > 0) {
        plotAreaHa = aRes.rows[0].area_ha;
      }
    }

    // Đảm bảo kế hoạch tồn tại cho thửa đất này (không tạo bản trùng khác hoa/thường)
    await this.db.query(
      `INSERT INTO plot_care_plans (household_id, plot_code, season, cycle_start_on, start_milestone_seq, current_milestone_code)
       SELECT $1, $2::text, $3, $4::date, 1, 'cb-rua-vuon'
       WHERE NOT EXISTS (
         SELECT 1 FROM plot_care_plans pcp
         WHERE pcp.household_id = $1 AND upper(pcp.plot_code) = upper($2::text) AND pcp.season = $3
       )
       ON CONFLICT (household_id, plot_code, season) DO NOTHING`,
      [householdId, plotCode, PROTOCOL_SEASON, today],
    );

    const [plan] = await this.loadPlanRows(
      "WHERE pcp.household_id = $1 AND upper(pcp.plot_code) = upper($2) AND pcp.season = $3",
      [householdId, plotCode, PROTOCOL_SEASON],
    );
    if (!plan) throw notFound("Không tìm thấy lộ trình chăm sóc của thửa đất.");

    // Kiểm tra thông tin thuốc BVTV nếu có kết hợp phun phòng sâu bệnh
    let pesticideInfo: { id: number; name: string; status: "allowed" | "restricted" | "banned"; isolation_days: number } | null =
      null;
    if (dto.pesticideId) {
      const pRes = await this.db.query<{
        id: number;
        name: string;
        status: "allowed" | "restricted" | "banned";
        isolation_days: number | null;
      }>("SELECT id, name, status, isolation_days FROM pesticides WHERE id = $1", [dto.pesticideId]);
      const pRow = pRes.rows[0];
      if (!pRow) throw badRequest("Không tìm thấy loại thuốc BVTV đã chọn.");
      pesticideInfo = {
        id: pRow.id,
        name: pRow.name,
        status: pRow.status,
        isolation_days: pRow.isolation_days ?? 0,
      };
    }

    const expectedTreeState = milestoneSpec
      ? milestoneSpec.treeState
      : `Đọt ${senProSpec!.shootState}`;

    const gpsCheck = await verifyPlotGpsProximity(this.db, plotCode, dto.latitude, dto.longitude);

    const stageLabel = milestoneSpec
      ? `GĐ ${milestoneSpec.stageOrder} ${milestoneSpec.stageName} (${milestoneSpec.dayLabel})`
      : `Điều tiết đọt SenPro (${senProSpec!.shootState})`;
    const journalActivity = milestoneSpec
      ? milestoneSpec.defaultJournalActivity
      : `Chặn đọt SenPro (${senProSpec!.shootState})`;

    const selectedProductLabels = dto.selectedProducts
      .map((item) => {
        const matched = milestoneSpec?.products.find((p) => p.id === item || p.name === item);
        return matched ? matched.name : item;
      })
      .filter(Boolean);

    const detailParts = [
      `[Quy trình 2026-2027] ${stageLabel}`,
      `Trạng thái vườn: ${dto.actualTreeState.trim()}`,
      selectedProductLabels.length > 0 ? `Vật tư: ${selectedProductLabels.join(", ")}` : null,
      `Định lượng: ${dto.actualDosage.trim()}`,
      dto.extraInputs?.trim() ? `Bổ sung: ${dto.extraInputs.trim()}` : null,
      dto.supplierName?.trim() ? `Đại lý VTNN: ${dto.supplierName.trim()}` : null,
      dto.farmerNote?.trim() ? `Ghi chú: ${dto.farmerNote.trim()}` : null,
    ].filter(Boolean);
    const journalDetail = detailParts.join(" | ").slice(0, 950);

    const lateDeclarationDays = Math.max(0, backdatedDays);
    const isLateOver48h = lateDeclarationDays > 2;
    const lateReason =
      lateDeclarationDays >= 1
        ? (dto.lateReason?.trim() ||
            (isLateOver48h ? "Khai báo bổ sung theo mốc quy trình chăm sóc" : null))
        : null;

    let txResult: {
      declarationId: number;
      declaredAt: string;
      journalEntryId: number;
      sprayRecordId: number | null;
      createdViolationId: number | null;
      nextMilestone: SequentialMilestoneSpec | null;
      effectiveCycleStart: string;
      scheduleAdjustedDays: number;
      nextPlanStatus: "active" | "completed";
      nextReminderLeadDays: number;
      compliance: ReturnType<typeof evaluateDeclarationCompliance>;
    };

    try {
      txResult = await withTransaction(this.db, async (client) => {
        const lockedPlanRes = await client.query<{
          id: number;
          household_id: number;
          plot_code: string;
          cycle_start_on: string;
          start_milestone_seq: number;
          current_milestone_code: string;
          reminder_lead_days: number;
          status: "active" | "completed" | "paused";
        }>(
          `SELECT id,
                  household_id,
                  plot_code,
                  to_char(cycle_start_on, 'YYYY-MM-DD') AS cycle_start_on,
                  start_milestone_seq,
                  current_milestone_code,
                  COALESCE(reminder_lead_days, 1)::int AS reminder_lead_days,
                  status
           FROM plot_care_plans
           WHERE id = $1 AND household_id = $2
           FOR UPDATE`,
          [plan.id, householdId],
        );
        const lockedPlan = lockedPlanRes.rows[0];
        if (!lockedPlan) {
          throw notFound("Không tìm thấy lộ trình chăm sóc của thửa đất.");
        }

        if (!senProSpec) {
          const dupCheck = await client.query(
            `SELECT 1
             FROM care_milestone_declarations
             WHERE plan_id = $1 AND milestone_code = $2 AND is_senpro = false
             LIMIT 1`,
            [lockedPlan.id, dto.milestoneCode],
          );
          if ((dupCheck.rowCount ?? 0) > 0) {
            throw conflict("Mốc chăm sóc này đã được khai báo trước đó.");
          }
        }

        const scheduledOn = milestoneSpec
          ? addIsoDays(lockedPlan.cycle_start_on, milestoneSpec.cycleDayStart)
          : performedOn;
        const dueOn = milestoneSpec
          ? addIsoDays(lockedPlan.cycle_start_on, milestoneSpec.cycleDayEnd)
          : performedOn;
        const compliance = evaluateDeclarationCompliance({
          milestone: milestoneSpec,
          senProRule: senProSpec,
          performedOn,
          dueOn: milestoneSpec ? dueOn : null,
          actualTreeState: dto.actualTreeState.trim(),
          followedStandard: dto.followedStandard,
          selectedProducts: dto.selectedProducts,
          actualDosage: dto.actualDosage.trim(),
          extraInputs: dto.extraInputs?.trim() || null,
          pesticideStatus: pesticideInfo?.status ?? null,
          pesticideName: pesticideInfo?.name ?? null,
        });

        const currentReminderLead = Math.max(1, Number(lockedPlan.reminder_lead_days ?? 1));
        const nextReminderLeadDays =
          lateDeclarationDays >= 2
            ? Math.min(4, Math.max(2, lateDeclarationDays))
            : lateDeclarationDays === 1
              ? Math.max(2, currentReminderLead)
              : Math.max(1, currentReminderLead - 1);

        // 1. Ghi tự động vào sổ cái Nhật ký canh tác (niêm phong SHA-256)
        const jIns = await client.query<{ id: number }>(
          `INSERT INTO journal_entries
             (entry_on, household_id, plot_code, activity, detail, recorder, has_photo, photo_id, photo_ids, latitude, longitude, gps_verified, gps_distance_m, capture_source, late_reason)
           VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8::bigint[], $9, $10, $11, $12, 'camera', $13)
           RETURNING id`,
          [
            performedOn,
            householdId,
            plotCode,
            journalActivity,
            journalDetail,
            FARMER_RECORDER,
            primaryFieldPhotoId,
            fieldMedia.ids,
            dto.latitude ?? null,
            dto.longitude ?? null,
            gpsCheck.verified,
            gpsCheck.distanceMeters,
            lateReason,
          ],
        );
        const journalEntryId = jIns.rows[0].id;

        // 2. Nếu có kết hợp phun thuốc BVTV -> ghi đồng thời vào spray_records để khóa ngày cách ly PHI
        let sprayRecordId: number | null = null;
        if (pesticideInfo) {
          const mrlStatus =
            pesticideInfo.status === "banned" || pesticideInfo.status === "restricted" ? "exceeded" : "pass";
          const sIns = await client.query<{ id: number }>(
            `INSERT INTO spray_records
               (sprayed_on, household_id, pesticide_id, source, dose, area_ha, isolation_days, mrl_status, plot_code, late_reason, recorded_by_role, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'farmer', $11)
             RETURNING id`,
            [
              performedOn,
              householdId,
              pesticideInfo.id,
              dto.supplierName?.trim() || null,
              dto.pesticideDose?.trim() || dto.actualDosage.trim().slice(0, 100),
              plotAreaHa,
              pesticideInfo.isolation_days,
              mrlStatus,
              plotCode,
              lateReason,
              user.id,
            ],
          );
          sprayRecordId = sIns.rows[0].id;
        }

        // 3. Lưu bản khai báo mốc quy trình chăm sóc kèm đồng thời ngày thực làm + thời điểm khai báo thực tế + số ngày khai báo chậm
        const declIns = await client.query<{ id: number; declared_at: string }>(
          `INSERT INTO care_milestone_declarations
             (plan_id, household_id, plot_code, stage_code, milestone_code, is_senpro,
              scheduled_on, due_on, performed_on, declared_at, declared_on, late_declaration_days, late_reason,
              expected_tree_state, actual_tree_state,
              followed_standard, selected_products, actual_dosage, extra_inputs, supplier_name,
              pesticide_id, pesticide_dose, field_photo_id, field_photo_ids, invoice_photo_id, invoice_photo_ids,
              latitude, longitude, gps_verified, gps_distance_m,
              journal_entry_id, spray_record_id, compliance_status, compliance_issues, farmer_note)
           VALUES
             ($1, $2, $3, $4, $5, $6,
              $7, $8, $9, date_trunc('second', clock_timestamp()), $10::date, $11, $12,
              $13, $14,
              $15, $16::jsonb, $17, $18, $19,
              $20, $21, $22, $23::bigint[], $24, $25::bigint[],
              $26, $27, $28, $29,
              $30, $31, $32, $33::jsonb, $34)
           RETURNING id, declared_at::text AS declared_at`,
          [
            lockedPlan.id,
            householdId,
            plotCode,
            milestoneSpec ? milestoneSpec.stageCode : "senpro",
            dto.milestoneCode,
            Boolean(senProSpec),
            milestoneSpec ? scheduledOn : null,
            milestoneSpec ? dueOn : null,
            performedOn,
            today,
            lateDeclarationDays,
            lateReason,
            expectedTreeState,
            dto.actualTreeState.trim(),
            dto.followedStandard,
            JSON.stringify(selectedProductLabels),
            dto.actualDosage.trim(),
            dto.extraInputs?.trim() || null,
            dto.supplierName?.trim() || null,
            pesticideInfo?.id ?? null,
            dto.pesticideDose?.trim() || null,
            primaryFieldPhotoId,
            fieldMedia.ids,
            primaryInvoicePhotoId,
            invoiceMedia.ids,
            dto.latitude ?? null,
            dto.longitude ?? null,
            gpsCheck.verified,
            gpsCheck.distanceMeters,
            journalEntryId,
            sprayRecordId,
            compliance.complianceStatus,
            JSON.stringify(compliance.issues),
            dto.farmerNote?.trim() || null,
          ],
        );

        // 4. Chỉ tự động ghi nhận phản hồi cho vi phạm trễ nhật ký hoặc quá hạn lộ trình khi bản khai báo đạt chuẩn
        if (compliance.complianceStatus === "compliant") {
          const autoResponseNote = `Đã khai báo hoàn thành mốc ${stageLabel} tại Thửa ${plotCode} ngày ${formatIsoVn(performedOn)}.`;
          await client.query(
            `UPDATE violations v
             SET farmer_response = $2,
                 farmer_response_at = now(),
                 farmer_response_photo_id = COALESCE(farmer_response_photo_id, $3),
                 farmer_response_photo_ids = CASE
                   WHEN cardinality(v.farmer_response_photo_ids) > 0 THEN v.farmer_response_photo_ids
                   ELSE $4::bigint[]
                 END
             WHERE v.household_id = $1
               AND v.status = 'open'
               AND v.farmer_response IS NULL
               AND v.detected_on <= $6::date
               AND (${isJournalViolationSql("v")} OR v.title ILIKE '%trễ hạn%' OR v.title ILIKE '%quá hạn%')
               AND (v.plot_code IS NULL OR upper(v.plot_code) = upper($5))`,
            [householdId, autoResponseNote, primaryFieldPhotoId, fieldMedia.ids, plotCode, performedOn],
          );
        }

        // 5. Nếu khai báo sai quy trình nghiêm trọng (violation) -> mở bản ghi vi phạm để cán bộ HTX theo dõi sát
        let createdViolationId: number | null = null;
        if (compliance.complianceStatus === "violation") {
          const issueSummary = compliance.issues.map((i) => i.message).join(" ");
          const vIns = await client.query<{ id: number }>(
            `INSERT INTO violations
               (severity, title, household_id, household_label, detected_on, plot_code, description, status)
             VALUES ($1, $2, $3, $4, $5::date, $6, $7, 'open')
             RETURNING id`,
            [
              compliance.issues.some((i) => i.code === "forbidden_substance" || i.code === "banned_pesticide")
                ? "critical"
                : "warning",
              `Sai lệch quy trình chăm sóc (${stageLabel})`,
              householdId,
              `${plan.household_name} (${plan.household_code})`,
              today,
              plotCode,
              issueSummary.slice(0, 900),
            ],
          );
          createdViolationId = vIns.rows[0].id;
        }

        // 6. Chuyển con trỏ sang mốc tuần tự tiếp theo và tự động căn chỉnh lịch theo ngày thực làm (performedOn)
        let nextMilestone: SequentialMilestoneSpec | null = null;
        let effectiveCycleStart = lockedPlan.cycle_start_on;
        let nextPlanStatus: "active" | "completed" = lockedPlan.status === "completed" ? "completed" : "active";

        if (milestoneSpec) {
          if (performedOn !== scheduledOn) {
            effectiveCycleStart = addIsoDays(performedOn, -milestoneSpec.cycleDayStart);
          }

          const declaredCodesRes = await client.query<{ milestone_code: string }>(
            `SELECT DISTINCT milestone_code
             FROM care_milestone_declarations
             WHERE plan_id = $1 AND is_senpro = false`,
            [lockedPlan.id],
          );
          const doneCodes = new Set(declaredCodesRes.rows.map((r) => r.milestone_code));
          doneCodes.add(milestoneSpec.code);

          nextMilestone =
            SEQUENTIAL_MILESTONES_2026_2027.find(
              (m) => m.seq >= lockedPlan.start_milestone_seq && !doneCodes.has(m.code),
            ) ?? null;

          if (nextMilestone) {
            await client.query(
              `UPDATE plot_care_plans
               SET current_milestone_code = $2,
                   cycle_start_on = $3::date,
                   reminder_lead_days = $4,
                   last_late_declaration_days = $5,
                   status = 'active',
                   updated_at = now()
               WHERE id = $1`,
              [lockedPlan.id, nextMilestone.code, effectiveCycleStart, nextReminderLeadDays, lateDeclarationDays],
            );
            await client.query(
              `DELETE FROM care_protocol_alert_logs
               WHERE plan_id = $1 AND milestone_code = $2 AND alert_type IN ('due_soon', 'due_day_prompt')`,
              [lockedPlan.id, nextMilestone.code],
            );
          } else {
            nextPlanStatus = "completed";
            await client.query(
              `UPDATE plot_care_plans
               SET current_milestone_code = 'completed',
                   cycle_start_on = $2::date,
                   reminder_lead_days = $3,
                   last_late_declaration_days = $4,
                   status = 'completed',
                   updated_at = now()
               WHERE id = $1`,
              [lockedPlan.id, effectiveCycleStart, nextReminderLeadDays, lateDeclarationDays],
            );
          }
        } else {
          await client.query(
            `UPDATE plot_care_plans
             SET reminder_lead_days = $2,
                 last_late_declaration_days = $3,
                 updated_at = now()
             WHERE id = $1`,
            [lockedPlan.id, nextReminderLeadDays, lateDeclarationDays],
          );
        }

        return {
          declarationId: declIns.rows[0].id,
          declaredAt: declIns.rows[0].declared_at,
          journalEntryId,
          sprayRecordId,
          createdViolationId,
          nextMilestone,
          effectiveCycleStart,
          scheduleAdjustedDays: diffIsoDays(effectiveCycleStart, lockedPlan.cycle_start_on),
          nextPlanStatus,
          nextReminderLeadDays,
          compliance,
        };
      });
    } catch (error) {
      if (error instanceof AppException) throw error;
      if ((error as { code?: string })?.code === "23505") {
        throw conflict("Mốc chăm sóc này đã được khai báo trước đó.");
      }
      throw error;
    }

    const { compliance, nextReminderLeadDays } = txResult;

    // 7. Gửi cảnh báo tức thời tới CẢ Hộ nông dân VÀ Quản trị viên HTX nếu phát hiện sai lệch hoặc trễ hạn
    if (pesticideInfo && (pesticideInfo.status === "banned" || pesticideInfo.status === "restricted")) {
      const pestLabel = pesticideInfo.status === "banned" ? "cấm sử dụng" : "hạn chế sử dụng";
      await this.notifications.notifyRoles(INSPECTION_ROLES, {
        kind: "violation",
        title: `Cảnh báo thuốc BVTV ${pestLabel}: ${pesticideInfo.name}`,
        body: `Hộ ${plan.household_name} khai báo mốc ${stageLabel} tại Thửa ${plotCode} có sử dụng ${pesticideInfo.name}.`,
        link: "/admin?section=spray",
      });
    }

    if (compliance.complianceStatus !== "compliant") {
      const issueText = compliance.issues.map((i) => i.message).join(" ");
      const isSevere = compliance.complianceStatus === "violation";

      await Promise.all([
        this.notifications.notifyHousehold(householdId, {
          kind: isSevere ? "violation" : "protocol",
          title: isSevere
            ? `Cảnh báo sai quy trình tại Thửa ${plotCode}`
            : `Lưu ý kỹ thuật tại Thửa ${plotCode}`,
          body: `${stageLabel}: ${issueText} Cán bộ kỹ thuật HTX đã nhận thông tin để hỗ trợ điều chỉnh.`,
          link: `${PORTAL_PROTOCOL_LINK}&plotCode=${encodeURIComponent(plotCode)}`,
        }),
        this.notifications.notifyOversightForHousehold(householdId, {
          kind: isSevere ? "violation" : "protocol",
          title: isSevere
            ? `Cảnh báo: Hộ ${plan.household_name} thực hiện sai phác đồ (Thửa ${plotCode})`
            : `Lưu ý tiến độ: Hộ ${plan.household_name} - Thửa ${plotCode}`,
          body: `${stageLabel}: ${issueText}`,
          link: txResult.createdViolationId
            ? `${ADMIN_LINKS.journal}&violationId=${txResult.createdViolationId}`
            : ADMIN_PROTOCOL_LINK,
        }),
      ]);
    }

    // 8. Thông báo giai đoạn / mốc tiếp theo & nhắc nhở khai báo đúng hạn nếu hộ vừa khai báo bù muộn
    const lateReminderSentence =
      lateDeclarationDays >= 1
        ? ` Hệ thống ghi nhận bạn khai báo chậm ${lateDeclarationDays} ngày (làm ngày ${formatIsoVn(performedOn)}, khai báo ngày ${formatIsoVn(today)}), đã tự động căn chỉnh lịch từ ngày làm thực tế và sẽ nhắc sớm trước ${nextReminderLeadDays} ngày ở mốc tới để bạn khai báo ngay trong ngày.`
        : "";

    if (milestoneSpec) {
      if (txResult.nextMilestone) {
        const nextM = txResult.nextMilestone;
        const nextScheduled = addIsoDays(txResult.effectiveCycleStart, nextM.cycleDayStart);
        const stageChanged = nextM.stageCode !== milestoneSpec.stageCode;
        const nextTitle = stageChanged
          ? `Chuyển sang Giai đoạn ${nextM.stageOrder}: ${nextM.stageName} (Thửa ${plotCode})`
          : `Mốc chăm sóc tiếp theo tại Thửa ${plotCode}: ${nextM.dayLabel}`;
        const nextBody = `Dự kiến ngày ${formatIsoVn(nextScheduled)} khi cây đạt trạng thái "${nextM.treeState}": ${nextM.actionSummary}${lateReminderSentence}`;

        await this.notifications.notifyHousehold(householdId, {
          kind: "protocol",
          title: nextTitle,
          body: nextBody,
          link: `${PORTAL_PROTOCOL_LINK}&plotCode=${encodeURIComponent(plotCode)}`,
        });
      } else if (txResult.nextPlanStatus === "completed") {
        await Promise.all([
          this.notifications.notifyHousehold(householdId, {
            kind: "protocol",
            title: `Hoàn tất quy trình chăm sóc 2026-2027 tại Thửa ${plotCode}`,
            body: `Đã hoàn thành đủ 8 giai đoạn đến mốc Làm cơm Ngày 120. Vui lòng giữ thời gian cách ly PHI và chờ cán bộ HTX lấy mẫu kiểm nghiệm trước thu hoạch.${lateReminderSentence}`,
            link: "/portal?tab=inspection",
          }),
          this.notifications.notifyOversightForHousehold(householdId, {
            kind: "protocol",
            title: `Thửa ${plotCode} (${plan.household_name}) đã hoàn tất quy trình 2026-2027`,
            body: "Đủ điều kiện xếp lịch lấy mẫu kiểm nghiệm Cadimi và dư lượng trước thu hoạch.",
            link: ADMIN_PROTOCOL_LINK,
          }),
        ]);
      }
    } else if (lateDeclarationDays >= 1) {
      await this.notifications.notifyHousehold(householdId, {
        kind: "protocol",
        title: `Ghi nhận khai báo bù chậm ${lateDeclarationDays} ngày tại Thửa ${plotCode}`,
        body: `Đã lưu đồng thời ngày xử lý đọt ${formatIsoVn(performedOn)} và ngày khai báo ${formatIsoVn(today)}. Lần tới vui lòng chụp ảnh và gửi khai báo ngay trong ngày làm vườn.`,
        link: `${PORTAL_PROTOCOL_LINK}&plotCode=${encodeURIComponent(plotCode)}`,
      });
    }

    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Khai báo mốc quy trình chăm sóc",
        object: `Thửa ${plotCode} (#${txResult.declarationId})`,
        detail: `${stageLabel} - Thực làm ${performedOn}, khai báo ${today} (chậm ${lateDeclarationDays} ngày) - ${compliance.complianceStatus === "compliant" ? "Đúng chuẩn" : "Có cảnh báo"}`,
      },
    );

    const [updatedPlan] = await this.loadPlanRows("WHERE pcp.id = $1", [plan.id]);
    const declarations = await this.loadDeclarationsByPlanIds([plan.id]);
    return {
      declarationId: txResult.declarationId,
      complianceStatus: compliance.complianceStatus,
      complianceIssues: compliance.issues,
      declarationTiming: {
        performedOn,
        declaredAt: txResult.declaredAt,
        declaredOn: today,
        lateDeclarationDays,
        scheduleAdjustedDays: txResult.scheduleAdjustedDays,
        nextReminderLeadDays,
      },
      nextMilestone: txResult.nextMilestone
        ? {
            code: txResult.nextMilestone.code,
            stageOrder: txResult.nextMilestone.stageOrder,
            stageName: txResult.nextMilestone.stageName,
            dayLabel: txResult.nextMilestone.dayLabel,
            treeState: txResult.nextMilestone.treeState,
            scheduledOn: addIsoDays(txResult.effectiveCycleStart, txResult.nextMilestone.cycleDayStart),
            dueOn: addIsoDays(txResult.effectiveCycleStart, txResult.nextMilestone.cycleDayEnd),
            actionSummary: txResult.nextMilestone.actionSummary,
          }
        : null,
      plan: this.buildDetailedPlanTimeline(updatedPlan, declarations.get(plan.id) ?? [], today),
    };
  }

  /** Quản trị viên / Cán bộ HTX: danh sách tiến độ toàn xã (có lọc theo phạm vi thôn/xã/địa bàn/HTX). */
  async adminListPlans(query: CareProtocolListQueryDto, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, true)) {
      return {
        season: PROTOCOL_SEASON,
        today: todayVn(),
        kpi: { totalPlans: 0, onTrack: 0, dueNow: 0, overdue: 0, deviated: 0, completed: 0 },
        data: [],
      };
    }

    if (isStaffInCuneCoopScope(user, false) && can(user.role, "journal", "create")) {
      await this.ensureAllHouseholdPlans();
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (user.role === "village_officer" && user.villageId !== null && user.villageId !== undefined) {
      params.push(user.villageId);
      conditions.push(`h.village_id = $${params.length}`);
    }
    if (query.householdId) {
      params.push(query.householdId);
      conditions.push(`pcp.household_id = $${params.length}`);
    }
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[\\%_]/g, "\\$&");
      params.push(`%${escaped}%`);
      const idx = params.length;
      conditions.push(
        `(pcp.plot_code ILIKE $${idx} ESCAPE '\\' OR h.name ILIKE $${idx} ESCAPE '\\' OR h.code ILIKE $${idx} ESCAPE '\\' OR v.name ILIKE $${idx} ESCAPE '\\')`,
      );
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const allPlans = await this.loadPlanRows(whereSql, params);
    const plans = allPlans.filter((p) => isStaffInPlanScope(user, p));
    const declarations = await this.loadDeclarationsByPlanIds(plans.map((p) => p.id));
    const today = todayVn();

    const summaries = plans.map((plan) =>
      this.buildAdminPlanSummary(plan, declarations.get(plan.id) ?? [], today),
    );

    const kpi = {
      totalPlans: summaries.length,
      onTrack: summaries.filter((s) => s.overallHealth === "on_track" || s.overallHealth === "due_now").length,
      dueNow: summaries.filter((s) => s.overallHealth === "due_now").length,
      overdue: summaries.filter((s) => s.overallHealth === "overdue" || s.overallHealth === "overdue_critical").length,
      deviated: summaries.filter((s) => s.deviationCount > 0).length,
      completed: summaries.filter((s) => s.overallHealth === "completed").length,
    };

    const filtered = summaries.filter((item) => {
      if (!query.state || query.state === "all") return true;
      if (query.state === "overdue") {
        return item.overallHealth === "overdue" || item.overallHealth === "overdue_critical";
      }
      if (query.state === "deviated") {
        return item.deviationCount > 0;
      }
      return item.overallHealth === query.state;
    });

    return {
      season: PROTOCOL_SEASON,
      today,
      kpi,
      data: filtered,
    };
  }

  /** Quản trị viên xem chi tiết toàn bộ 27 mốc + ảnh hiện trường + ảnh hóa đơn của 1 thửa vườn. */
  async adminGetPlanDetail(id: number, user: AuthUser) {
    const [plan] = await this.loadPlanRows("WHERE pcp.id = $1", [id]);
    if (!plan) throw notFound("Không tìm thấy kế hoạch chăm sóc của thửa đất này.");
    if (!isStaffInPlanScope(user, plan)) {
      throw forbidden("Kế hoạch chăm sóc này không thuộc phạm vi quản lý của tài khoản.");
    }

    const declarations = await this.loadDeclarationsByPlanIds([plan.id]);
    return this.buildDetailedPlanTimeline(plan, declarations.get(plan.id) ?? [], todayVn());
  }

  /** Quét tự động toàn bộ lộ trình đang hoạt động trong phạm vi quản lý để phát nhắc lịch & cảnh báo quá hạn. */
  async scanAndNotifyAllPlans(user?: AuthUser): Promise<{
    scanned: number;
    dueNotifications: number;
    overdueWarnings: number;
    criticalViolations: number;
  }> {
    if (user && !isStaffInCuneCoopScope(user, true)) {
      return { scanned: 0, dueNotifications: 0, overdueWarnings: 0, criticalViolations: 0 };
    }
    if (!user || (isStaffInCuneCoopScope(user, false) && can(user.role, "journal", "create"))) {
      await this.ensureAllHouseholdPlans();
    }
    const allPlans = await this.loadPlanRows("WHERE pcp.status = 'active'", []);
    const scopedPlans = user ? allPlans.filter((p) => isStaffInPlanScope(user, p)) : allPlans;
    return this.evaluateAndDispatchAlerts(scopedPlans);
  }

  async scanAndNotifyPlansForHousehold(householdId: number) {
    const plans = await this.loadPlanRows(
      "WHERE pcp.household_id = $1 AND pcp.status = 'active'",
      [householdId],
    );
    return this.evaluateAndDispatchAlerts(plans);
  }

  /** Nhắc việc nhanh trên trang chủ Cổng hộ dân (`GET /portal/overview`) cho các mốc đến lịch hoặc trễ hạn. */
  async getHouseholdActiveReminders(householdId: number): Promise<
    Array<{
      kind: "protocol";
      title: string;
      detail: string;
      tab: string;
      date: string | null;
    }>
  > {
    const plans = await this.loadPlanRows(
      "WHERE pcp.household_id = $1 AND pcp.status = 'active'",
      [householdId],
    );
    const today = todayVn();
    const out: Array<{
      kind: "protocol";
      title: string;
      detail: string;
      tab: string;
      date: string | null;
    }> = [];

    for (const plan of plans) {
      if (plan.current_milestone_code === "completed") continue;
      const spec = getSequentialMilestone(plan.current_milestone_code);
      if (!spec) continue;

      const scheduledOn = addIsoDays(plan.cycle_start_on, spec.cycleDayStart);
      const dueOn = addIsoDays(plan.cycle_start_on, spec.cycleDayEnd);
      const leadDays = Math.max(1, Number(plan.reminder_lead_days ?? 1));

      if (today > dueOn) {
        const daysLate = diffIsoDays(today, dueOn);
        out.push({
          kind: "protocol",
          title: `Trễ ${daysLate} ngày: ${spec.stageName} (${spec.dayLabel})`,
          detail: `Thửa ${plan.plot_code} - ${spec.treeState}`,
          tab: "diary",
          date: dueOn,
        });
      } else if (today >= addIsoDays(scheduledOn, -leadDays)) {
        const earlyNote =
          leadDays > 1 ? ` - Nhắc sớm trước ${leadDays} ngày để khai báo đúng hạn` : "";
        out.push({
          kind: "protocol",
          title: `Mốc chăm sóc: ${spec.stageName} (${spec.dayLabel})`,
          detail: `Thửa ${plan.plot_code} - Hạn ${formatIsoVn(dueOn)}${earlyNote}`,
          tab: "diary",
          date: scheduledOn,
        });
      }
    }

    return out;
  }

  private async evaluateAndDispatchAlerts(plans: PlanRow[]) {
    const today = todayVn();
    let dueNotifications = 0;
    let overdueWarnings = 0;
    let criticalViolations = 0;

    for (const plan of plans) {
      if (plan.current_milestone_code === "completed") continue;
      const spec = getSequentialMilestone(plan.current_milestone_code);
      if (!spec) continue;

      const scheduledOn = addIsoDays(plan.cycle_start_on, spec.cycleDayStart);
      const dueOn = addIsoDays(plan.cycle_start_on, spec.cycleDayEnd);
      const stageLabel = `Giai đoạn ${spec.stageOrder} ${spec.stageName} - ${spec.dayLabel}`;
      const portalLink = `${PORTAL_PROTOCOL_LINK}&plotCode=${encodeURIComponent(plan.plot_code)}`;

      // Trường hợp 1: Quá hạn kéo dài (>= 5 ngày sau hạn chót) -> Cảnh báo khẩn & ghi nhận vi phạm cho cả Admin + Hộ dân
      if (today >= addIsoDays(dueOn, 5)) {
        const daysLate = diffIsoDays(today, dueOn);
        const logged = await this.tryRecordAlertLog(plan.id, spec.code, "overdue_critical");
        if (logged) {
          const vRes = await this.db.query<{ id: number }>(
            `INSERT INTO violations
               (severity, title, household_id, household_label, detected_on, plot_code, description, status)
             VALUES ('warning', $1, $2, $3, $4::date, $5, $6, 'open')
             RETURNING id`,
            [
              `Quá hạn khai báo quy trình chăm sóc (${spec.stageName} - ${spec.dayLabel})`,
              plan.household_id,
              `${plan.household_name} (${plan.household_code})`,
              today,
              plan.plot_code,
              `Thửa ${plan.plot_code} đã quá hạn ${daysLate} ngày chưa khai báo mốc "${stageLabel}" (${spec.treeState}). Cần thực hiện: ${spec.actionSummary}`,
            ],
          );
          const violationId = vRes.rows[0]?.id ?? null;
          if (violationId) {
            await this.db.query(
              "UPDATE care_protocol_alert_logs SET violation_id = $2 WHERE id = $1",
              [logged, violationId],
            );
          }

          await Promise.all([
            this.notifications.notifyHousehold(plan.household_id, {
              kind: "violation",
              title: `Quá hạn ${daysLate} ngày chưa khai báo chăm sóc Thửa ${plan.plot_code}`,
              body: `Mốc ${stageLabel} (${spec.treeState}) đã quá hạn từ ${formatIsoVn(dueOn)}. Vui lòng vào khai báo, chụp ảnh hiện trường và hóa đơn vật tư ngay.`,
              link: portalLink,
            }),
            this.notifications.notifyOversightForHousehold(plan.household_id, {
              kind: "violation",
              title: `Cảnh báo chậm tiến độ: Hộ ${plan.household_name} - Thửa ${plan.plot_code}`,
              body: `Chưa khai báo mốc ${stageLabel} (trễ ${daysLate} ngày so với hạn ${formatIsoVn(dueOn)}).`,
              link: violationId ? `${ADMIN_LINKS.journal}&violationId=${violationId}` : ADMIN_PROTOCOL_LINK,
            }),
          ]);
          criticalViolations += 1;
        }
        continue;
      }

      // Trường hợp 2: Mới quá hạn (1-4 ngày sau hạn chót) -> Nhắc cảnh báo sớm tới cả Hộ dân & Quản trị viên
      if (today > dueOn) {
        const daysLate = diffIsoDays(today, dueOn);
        const logged = await this.tryRecordAlertLog(plan.id, spec.code, "overdue_warning");
        if (logged) {
          await Promise.all([
            this.notifications.notifyHousehold(plan.household_id, {
              kind: "protocol",
              title: `Trễ hạn ${daysLate} ngày mốc chăm sóc Thửa ${plan.plot_code}`,
              body: `Mốc ${stageLabel} (${spec.treeState}) có hạn ngày ${formatIsoVn(dueOn)}: ${spec.actionSummary} Vui lòng cập nhật nhật ký và ảnh hóa đơn.`,
              link: portalLink,
            }),
            this.notifications.notifyOversightForHousehold(plan.household_id, {
              kind: "protocol",
              title: `Hộ ${plan.household_name} trễ ${daysLate} ngày mốc chăm sóc Thửa ${plan.plot_code}`,
              body: `Chưa ghi nhận khai báo mốc ${stageLabel} (hạn ${formatIsoVn(dueOn)}).`,
              link: ADMIN_PROTOCOL_LINK,
            }),
          ]);
          overdueWarnings += 1;
        }
        continue;
      }

      // Trường hợp 3: Đến cửa sổ thực hiện (tự động mở rộng trước leadDays ngày nếu lần trước hộ khai báo muộn)
      const leadDays = Math.max(1, Number(plan.reminder_lead_days ?? 1));
      if (today >= addIsoDays(scheduledOn, -leadDays) && today <= dueOn) {
        const logged = await this.tryRecordAlertLog(plan.id, spec.code, "due_soon");
        if (logged) {
          const earlyPrompt =
            (plan.last_late_declaration_days ?? 0) > 0
              ? ` Đợt trước hộ khai báo chậm ${plan.last_late_declaration_days} ngày, hệ thống chủ động nhắc sớm trước ${leadDays} ngày để bạn chụp ảnh và khai báo ngay trong ngày làm vườn.`
              : " Thực hiện xong bạn chỉ cần bấm vào để khai báo và chụp ảnh.";
          await this.notifications.notifyHousehold(plan.household_id, {
            kind: "protocol",
            title: `Đến lịch chăm sóc Thửa ${plan.plot_code}: ${spec.stageName} (${spec.dayLabel})`,
            body: `Trạng thái cây chuẩn "${spec.treeState}" (hạn ${formatIsoVn(dueOn)}): ${spec.actionSummary}${earlyPrompt}`,
            link: portalLink,
          });
          dueNotifications += 1;
        }
        // Nhắc bổ sung ngay trong ngày hạn chót nếu hộ có tiền sử khai báo muộn mà vẫn chưa gửi
        if ((plan.last_late_declaration_days ?? 0) > 0 && today === dueOn) {
          const promptLogged = await this.tryRecordAlertLog(plan.id, spec.code, "due_day_prompt");
          if (promptLogged) {
            await this.notifications.notifyHousehold(plan.household_id, {
              kind: "protocol",
              title: `Nhắc khai báo đúng hạn hôm nay cho Thửa ${plan.plot_code}`,
              body: `Hôm nay (${formatIsoVn(dueOn)}) là ngày chốt mốc ${stageLabel}. Vui lòng chụp ảnh hiện trường và gửi khai báo ngay trong ngày làm vườn.`,
              link: portalLink,
            });
            dueNotifications += 1;
          }
        }
      }
    }

    return {
      scanned: plans.length,
      dueNotifications,
      overdueWarnings,
      criticalViolations,
    };
  }

  private async tryRecordAlertLog(
    planId: number,
    milestoneCode: string,
    alertType: "due_soon" | "due_day_prompt" | "overdue_warning" | "overdue_critical" | "next_stage",
  ): Promise<number | null> {
    const res = await this.db.query<{ id: number }>(
      `INSERT INTO care_protocol_alert_logs (plan_id, milestone_code, alert_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (plan_id, milestone_code, alert_type) DO NOTHING
       RETURNING id`,
      [planId, milestoneCode, alertType],
    );
    return res.rows[0]?.id ?? null;
  }

  private async assertStaffCanAccessHousehold(user: AuthUser, householdId: number): Promise<void> {
    const { rows } = await this.db.query<{
      id: number;
      village_id: number;
      village_name: string;
    }>(
      `SELECT h.id, h.village_id, v.name AS village_name
       FROM households h
       JOIN villages v ON v.id = h.village_id
       WHERE h.id = $1`,
      [householdId],
    );
    if (rows.length === 0) {
      throw badRequest("Hộ nông dân không tồn tại.");
    }
    if (!isStaffInPlanScope(user, rows[0])) {
      throw forbidden("Hộ nông dân này không thuộc địa bàn hoặc phạm vi quản lý của tài khoản.");
    }
  }

  private async loadPlanRows(whereSql: string, params: unknown[]): Promise<PlanRow[]> {
    const { rows } = await this.db.query<PlanRow>(
      `SELECT pcp.id, pcp.household_id, h.code AS household_code, h.name AS household_name, h.phone AS household_phone,
              h.village_id, v.name AS village_name,
              pcp.plot_code, pcp.season, pcp.cycle_start_on, pcp.start_milestone_seq,
              pcp.current_milestone_code,
              COALESCE(pcp.reminder_lead_days, 1)::int AS reminder_lead_days,
              COALESCE(pcp.last_late_declaration_days, 0)::int AS last_late_declaration_days,
              pcp.status, pcp.note, pcp.updated_at
       FROM plot_care_plans pcp
       JOIN households h ON h.id = pcp.household_id
       JOIN villages v ON v.id = h.village_id
       ${whereSql}
       ORDER BY pcp.plot_code ASC, pcp.id ASC`,
      params,
    );
    return rows;
  }

  private async loadDeclarationsByPlanIds(planIds: number[]): Promise<Map<number, DeclarationRow[]>> {
    const map = new Map<number, DeclarationRow[]>();
    if (planIds.length === 0) return map;

    const { rows } = await this.db.query<DeclarationRow>(
      `SELECT d.id, d.plan_id, d.household_id, d.plot_code, d.stage_code, d.milestone_code, d.is_senpro,
              d.scheduled_on, d.due_on, d.performed_on,
              COALESCE(d.declared_at, d.created_at) AS declared_at,
              COALESCE(d.declared_on, (d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS declared_on,
              GREATEST(
                COALESCE(d.late_declaration_days, 0),
                ((COALESCE(d.declared_at, d.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - d.performed_on)
              )::int AS late_declaration_days,
              COALESCE(d.late_reason, j.late_reason) AS late_reason,
              d.expected_tree_state, d.actual_tree_state,
              d.followed_standard, d.selected_products, d.actual_dosage, d.extra_inputs, d.supplier_name,
              d.pesticide_id, p.name AS pesticide_name, d.pesticide_dose,
              ${attachmentUrlSql("d.field_photo_id")} AS field_photo_url,
              ${attachmentUrlsSql("d.field_photo_ids", "d.field_photo_id")} AS field_photo_urls,
              ${attachmentUrlSql("d.invoice_photo_id")} AS invoice_photo_url,
              ${attachmentUrlsSql("d.invoice_photo_ids", "d.invoice_photo_id")} AS invoice_photo_urls,
              d.latitude::float8 AS latitude, d.longitude::float8 AS longitude,
              d.gps_verified, d.gps_distance_m::float8 AS gps_distance_m,
              d.journal_entry_id, j.record_hash AS journal_record_hash,
              d.spray_record_id, d.compliance_status, d.compliance_issues, d.farmer_note, d.created_at
       FROM care_milestone_declarations d
       LEFT JOIN pesticides p ON p.id = d.pesticide_id
       LEFT JOIN journal_entries j ON j.id = d.journal_entry_id
       WHERE d.plan_id = ANY($1::bigint[])
       ORDER BY d.performed_on DESC, d.id DESC`,
      [planIds],
    );

    for (const row of rows) {
      const list = map.get(row.plan_id) ?? [];
      list.push(row);
      map.set(row.plan_id, list);
    }
    return map;
  }

  private buildDetailedPlanTimeline(plan: PlanRow, declarations: DeclarationRow[], today: string) {
    const latestByMilestone = new Map<string, DeclarationRow>();
    const senProDeclarations: DeclarationRow[] = [];

    for (const decl of declarations) {
      if (decl.is_senpro) {
        senProDeclarations.push(decl);
      } else if (!latestByMilestone.has(decl.milestone_code)) {
        latestByMilestone.set(decl.milestone_code, decl);
      }
    }

    const currentSpec =
      plan.current_milestone_code !== "completed"
        ? getSequentialMilestone(plan.current_milestone_code)
        : undefined;
    const nextSpec = currentSpec ? getNextSequentialMilestone(currentSpec.code) : null;

    const milestones = SEQUENTIAL_MILESTONES_2026_2027.map((spec) => {
      const scheduledOn = addIsoDays(plan.cycle_start_on, spec.cycleDayStart);
      const dueOn = addIsoDays(plan.cycle_start_on, spec.cycleDayEnd);
      const decl = latestByMilestone.get(spec.code) ?? null;

      let state: MilestoneTimelineState = "upcoming";
      let daysOverdue = 0;
      let daysUntilScheduled = diffIsoDays(scheduledOn, today);

      if (decl) {
        state = "completed";
      } else if (spec.seq < plan.start_milestone_seq) {
        state = "skipped_prior";
      } else if (plan.status === "completed" || plan.current_milestone_code === "completed") {
        state = "completed";
      } else if (currentSpec && spec.code === currentSpec.code) {
        if (today >= addIsoDays(dueOn, 5)) {
          state = "overdue_critical";
          daysOverdue = diffIsoDays(today, dueOn);
        } else if (today > dueOn) {
          state = "overdue";
          daysOverdue = diffIsoDays(today, dueOn);
        } else if (today >= addIsoDays(scheduledOn, -1)) {
          state = "due_now";
        } else {
          state = "upcoming_current";
        }
      } else if (nextSpec && spec.code === nextSpec.code) {
        state = "upcoming_next";
      }

      return {
        ...spec,
        scheduledOn,
        dueOn,
        state,
        daysOverdue,
        daysUntilScheduled: Math.max(0, daysUntilScheduled),
        declaration: decl ? camelRows([decl as unknown as Record<string, unknown>])[0] : null,
      };
    });

    const applicableMilestones = milestones.filter((m) => m.state !== "skipped_prior");
    const completedCount = applicableMilestones.filter((m) => m.state === "completed").length;
    const progressPct =
      applicableMilestones.length > 0
        ? Math.round((completedCount / applicableMilestones.length) * 100)
        : 100;

    const activeItem =
      milestones.find(
        (m) =>
          m.state === "overdue_critical" ||
          m.state === "overdue" ||
          m.state === "due_now" ||
          m.state === "upcoming_current",
      ) ?? null;
    const nextItem = milestones.find((m) => m.state === "upcoming_next") ?? null;

    const deviationCount = declarations.filter((d) => d.compliance_status !== "compliant").length;
    const lateDeclarationCount = declarations.filter((d) => Number(d.late_declaration_days ?? 0) > 0).length;
    const overallHealth: "completed" | "overdue_critical" | "overdue" | "due_now" | "on_track" =
      plan.status === "completed" || !activeItem
        ? "completed"
        : activeItem.state === "overdue_critical"
          ? "overdue_critical"
          : activeItem.state === "overdue"
            ? "overdue"
            : activeItem.state === "due_now"
              ? "due_now"
              : "on_track";

    return {
      id: plan.id,
      householdId: plan.household_id,
      householdCode: plan.household_code,
      householdName: plan.household_name,
      householdPhone: plan.household_phone,
      villageName: plan.village_name,
      plotCode: plan.plot_code,
      season: plan.season,
      cycleStartOn: plan.cycle_start_on,
      startMilestoneSeq: plan.start_milestone_seq,
      currentMilestoneCode: plan.current_milestone_code,
      reminderLeadDays: Math.max(1, Number(plan.reminder_lead_days ?? 1)),
      lastLateDeclarationDays: Math.max(0, Number(plan.last_late_declaration_days ?? 0)),
      status: plan.status,
      note: plan.note,
      updatedAt: plan.updated_at,
      overallHealth,
      completedCount,
      totalApplicableCount: applicableMilestones.length,
      progressPct,
      deviationCount,
      lateDeclarationCount,
      activeMilestone: activeItem,
      nextMilestone: nextItem,
      milestones,
      senProDeclarations: camelRows(senProDeclarations as unknown as Record<string, unknown>[]),
    };
  }

  private buildAdminPlanSummary(plan: PlanRow, declarations: DeclarationRow[], today: string) {
    const full = this.buildDetailedPlanTimeline(plan, declarations, today);
    const latestDecl = declarations[0]
      ? camelRows([declarations[0] as unknown as Record<string, unknown>])[0]
      : null;

    return {
      id: full.id,
      householdId: full.householdId,
      householdCode: full.householdCode,
      householdName: full.householdName,
      householdPhone: full.householdPhone,
      villageName: full.villageName,
      plotCode: full.plotCode,
      season: full.season,
      cycleStartOn: full.cycleStartOn,
      status: full.status,
      overallHealth: full.overallHealth,
      completedCount: full.completedCount,
      totalApplicableCount: full.totalApplicableCount,
      progressPct: full.progressPct,
      deviationCount: full.deviationCount,
      lateDeclarationCount: full.lateDeclarationCount,
      reminderLeadDays: full.reminderLeadDays,
      lastLateDeclarationDays: full.lastLateDeclarationDays,
      totalDeclarations: declarations.length,
      activeMilestone: full.activeMilestone
        ? {
            code: full.activeMilestone.code,
            stageOrder: full.activeMilestone.stageOrder,
            stageName: full.activeMilestone.stageName,
            dayLabel: full.activeMilestone.dayLabel,
            treeState: full.activeMilestone.treeState,
            scheduledOn: full.activeMilestone.scheduledOn,
            dueOn: full.activeMilestone.dueOn,
            state: full.activeMilestone.state,
            daysOverdue: full.activeMilestone.daysOverdue,
            actionSummary: full.activeMilestone.actionSummary,
          }
        : null,
      nextMilestone: full.nextMilestone
        ? {
            code: full.nextMilestone.code,
            stageOrder: full.nextMilestone.stageOrder,
            stageName: full.nextMilestone.stageName,
            dayLabel: full.nextMilestone.dayLabel,
            scheduledOn: full.nextMilestone.scheduledOn,
          }
        : null,
      latestDeclaration: latestDecl,
      updatedAt: full.updatedAt,
    };
  }
}
