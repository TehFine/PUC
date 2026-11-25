import { Controller, Get, Injectable, Module } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { can, isAdminPrivilegedRole, isCoopStaffRole } from "../../auth/permissions";
import {
  CUNE_ADMIN_LOCATION,
  EAKHAL_ADMIN_LOCATION,
  isStaffInCuneCoopScope,
  matchesJurisdiction,
  villageScope,
} from "../../common/crud/village-scope";
import { camelRow, camelRows } from "../../common/sql/rows";
import { hasPublicTable } from "../../common/sql/schema-cache";
import { DatabaseService } from "../../database/database.service";
import { INSPECTION_ROLES } from "../../portal/common/admin-links";
import { TODAY_VN_SQL } from "../shared/state";

@Injectable()
export class DashboardService {
  /** Bảng plots (PostGIS) có hay không gần như không đổi khi đang chạy: chỉ kiểm tra 1 lần rồi lưu lại. */
  private plotsTableExists: Promise<boolean> | null = null;

  constructor(private readonly db: DatabaseService) {}

  private hasPlotsTable(): Promise<boolean> {
    if (!this.plotsTableExists) {
      this.plotsTableExists = this.db
        .query<{ reg: string | null }>("SELECT to_regclass('public.plots') AS reg")
        .then((res) => res.rows[0]?.reg !== null)
        .catch((error: unknown) => {
          this.plotsTableExists = null; // lỗi tạm thời: lần sau kiểm tra lại
          throw error;
        });
    }
    return this.plotsTableExists;
  }

  async summary(user: AuthUser) {
    // Khóa bộ đệm phải chứa đủ mọi chiều phạm vi dữ liệu để hai tài khoản khác phạm vi không dùng chung số liệu.
    const scopeKey = [
      "dashboard:summary",
      user.role,
      `v=${user.villageId ?? "all"}`,
      `e=${user.enterpriseId ?? "none"}`,
      `c=${(user.coopCode || "HTX-CUNE").trim().toUpperCase()}`,
      `ac=${encodeURIComponent((user.assignedCommune ?? "").trim())}`,
      `ar=${encodeURIComponent((user.assignedRegion ?? "").trim())}`,
    ].join(":");
    if (this.db.cache) {
      return this.db.cache.getOrLoad(scopeKey, 15_000, ["dashboard"], () => this.computeSummary(user));
    }
    return this.computeSummary(user);
  }

  private async computeSummary(user: AuthUser) {
    const canReadHouseholds = can(user.role, "households", "read");
    const canReadApprovals = can(user.role, "approvals", "read");
    const canReadViolations = can(user.role, "violations", "read");
    const canReadRegistrations = can(user.role, "registrations", "read");
    const canReadHarvest = can(user.role, "harvest", "read");
    const canReadJournal = can(user.role, "journal", "read");
    const canReadSpray = can(user.role, "spray", "read");
    const canReadLabTests = can(user.role, "testing", "read");
    const canReadTraining = can(user.role, "training", "read");
    const canReadSchedule = can(user.role, "schedule", "read");
    const canReadDeclarations = can(user.role, "harvest-declarations", "read");
    const canReadDeletionRequests = can(user.role, "deletion-requests", "read");
    const canReadTraceRequests = can(user.role, "trace-requests", "read");
    // Lịch đột xuất chỉ hiển thị cho vai trò lập và thực hiện kiểm tra.
    const canSeeSuddenSchedule = INSPECTION_ROLES.includes(user.role);
    const isEnterprise = user.role === "enterprise";
    const isCoopStaff = isCoopStaffRole(user.role);
    const inCoopScope = isStaffInCuneCoopScope(user, true);

    const countsParams: unknown[] = [];
    const hhScope = villageScope("h.village_id")(user, countsParams);
    const isVillageScoped = hhScope !== null;
    const hhWhere = hhScope ? `WHERE ${hhScope}` : "";
    const bindVillage = (col: string) => villageScope(col)(user, countsParams) ?? "true";

    const violWhere = isVillageScoped ? "AND v.household_id IN (SELECT id FROM hh)" : "";
    const apprWhere = isVillageScoped ? "AND a.household_id IN (SELECT id FROM hh)" : "";
    const bindParam = (value: unknown) => {
      countsParams.push(value);
      return `$${countsParams.length}`;
    };
    let harvestLotScope = "";
    if (isEnterprise) {
      // Doanh nghiệp chỉ thấy sản lượng và số lô của chính mình; chưa gắn doanh nghiệp thì không thấy gì.
      harvestLotScope = user.enterpriseId ? `WHERE hl.enterprise_id = ${bindParam(user.enterpriseId)}` : "WHERE 1 = 0";
    } else if (!inCoopScope) {
      harvestLotScope = "WHERE 1 = 0";
    } else if (isVillageScoped) {
      harvestLotScope = `WHERE upper(COALESCE(hl.coop_code, 'HTX-CUNE')) = 'HTX-CUNE' AND EXISTS (SELECT 1 FROM harvest_contributions hc JOIN hh ON hh.id = hc.household_id WHERE hc.lot_id = hl.id)`;
    } else if (isCoopStaff) {
      harvestLotScope = `WHERE upper(COALESCE(hl.coop_code, 'HTX-CUNE')) = ${bindParam((user.coopCode || "HTX-CUNE").trim().toUpperCase())}`;
    } else {
      harvestLotScope = "WHERE upper(COALESCE(hl.coop_code, 'HTX-CUNE')) = 'HTX-CUNE'";
    }
    const isAdmin = isAdminPrivilegedRole(user.role);

    const [hasPlots, hasDelReqTable, hasTraceReqTable] = await Promise.all([
      this.hasPlotsTable(),
      canReadDeletionRequests && inCoopScope
        ? hasPublicTable(this.db, "member_deletion_requests")
        : Promise.resolve(false),
      canReadTraceRequests && inCoopScope
        ? hasPublicTable(this.db, "trace_access_requests")
        : Promise.resolve(false),
    ]);

    const householdsCountExpr = !canReadHouseholds
      ? "0"
      : !isVillageScoped
        ? `(
             (SELECT count(*)::int FROM hh) +
             (
               SELECT coalesce(sum(v.household_count), 0)::int
               FROM villages v
               WHERE NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v.id)
             )
           )`
        : `(
             (SELECT count(*)::int FROM hh) +
             (
               SELECT coalesce(sum(v.household_count), 0)::int
               FROM villages v
               WHERE ${bindVillage("v.id")}
                 AND NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v.id)
             )
           )`;

    const plotsCountExpr = !canReadHouseholds
      ? "0"
      : hasPlots
        ? !isVillageScoped
          ? `(
               (
                 SELECT COALESCE(sum(
                   CASE WHEN COALESCE(hp.p_cnt, 0) > 0 THEN hp.p_cnt ELSE hh.plot_count END
                 ), 0)::int
                 FROM hh
                 LEFT JOIN (
                   SELECT household_id, count(*)::int AS p_cnt
                   FROM plots
                   WHERE household_id IS NOT NULL
                   GROUP BY household_id
                 ) hp ON hp.household_id = hh.id
               ) +
               (SELECT count(*)::int FROM plots WHERE household_id IS NULL) +
               (
                 SELECT COALESCE(sum(v.plot_count), 0)::int
                 FROM villages v
                 WHERE NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v.id)
                   AND NOT EXISTS (
                     SELECT 1 FROM plots p0
                     WHERE p0.household_id IS NULL AND lower(btrim(p0.village)) = lower(btrim(v.name))
                   )
               )
             )`
          : (() => {
              const v0Cond = bindVillage("v0.id");
              return `(
               (
                 SELECT COALESCE(sum(
                   CASE WHEN COALESCE(hp.p_cnt, 0) > 0 THEN hp.p_cnt ELSE hh.plot_count END
                 ), 0)::int
                 FROM hh
                 LEFT JOIN (
                   SELECT household_id, count(*)::int AS p_cnt
                   FROM plots
                   WHERE household_id IS NOT NULL
                   GROUP BY household_id
                 ) hp ON hp.household_id = hh.id
               ) +
               (
                 SELECT count(*)::int
                 FROM plots p0
                 JOIN villages v0 ON ${v0Cond}
                 WHERE p0.household_id IS NULL AND lower(btrim(p0.village)) = lower(btrim(v0.name))
               ) +
               (
                 SELECT COALESCE(sum(v0.plot_count), 0)::int
                 FROM villages v0
                 WHERE ${v0Cond}
                   AND NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v0.id)
                   AND NOT EXISTS (
                     SELECT 1 FROM plots p0
                     WHERE p0.household_id IS NULL AND lower(btrim(p0.village)) = lower(btrim(v0.name))
                   )
               )
             )`;
            })()
        : !isVillageScoped
          ? `(
               (SELECT COALESCE(sum(hh.plot_count), 0)::int FROM hh) +
               (
                 SELECT COALESCE(sum(v.plot_count), 0)::int
                 FROM villages v
                 WHERE NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v.id)
               )
             )`
          : `(
               (SELECT COALESCE(sum(hh.plot_count), 0)::int FROM hh) +
               (
                 SELECT COALESCE(sum(v.plot_count), 0)::int
                 FROM villages v
                 WHERE ${bindVillage("v.id")}
                   AND NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v.id)
               )
             )`;

    const areaHaExpr = !canReadHouseholds
      ? "0::float8"
      : hasPlots
        ? !isVillageScoped
          ? `ROUND(
               (
                 (
                   SELECT COALESCE(sum(
                     CASE WHEN COALESCE(hp.p_cnt, 0) > 0 THEN hp.p_area ELSE hh.area_ha END
                   ), 0)::numeric
                   FROM hh
                   LEFT JOIN (
                     SELECT household_id, count(*)::int AS p_cnt, COALESCE(sum(area_ha), 0)::numeric AS p_area
                     FROM plots
                     WHERE household_id IS NOT NULL
                     GROUP BY household_id
                   ) hp ON hp.household_id = hh.id
                 ) +
                 (SELECT COALESCE(sum(area_ha), 0)::numeric FROM plots WHERE household_id IS NULL) +
                 (
                   SELECT COALESCE(sum(v.area_ha), 0)::numeric
                   FROM villages v
                   WHERE NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v.id)
                     AND NOT EXISTS (
                       SELECT 1 FROM plots p0
                       WHERE p0.household_id IS NULL AND lower(btrim(p0.village)) = lower(btrim(v.name))
                     )
                 )
               )::numeric,
               2
             )::float8`
          : (() => {
              const v0Cond = bindVillage("v0.id");
              return `ROUND(
               (
                 (
                   SELECT COALESCE(sum(
                     CASE WHEN COALESCE(hp.p_cnt, 0) > 0 THEN hp.p_area ELSE hh.area_ha END
                   ), 0)::numeric
                   FROM hh
                   LEFT JOIN (
                     SELECT household_id, count(*)::int AS p_cnt, COALESCE(sum(area_ha), 0)::numeric AS p_area
                     FROM plots
                     WHERE household_id IS NOT NULL
                     GROUP BY household_id
                   ) hp ON hp.household_id = hh.id
                 ) +
                 (
                   SELECT COALESCE(sum(p0.area_ha), 0)::numeric
                   FROM plots p0
                   JOIN villages v0 ON ${v0Cond}
                   WHERE p0.household_id IS NULL AND lower(btrim(p0.village)) = lower(btrim(v0.name))
                 ) +
                 (
                   SELECT COALESCE(sum(v0.area_ha), 0)::numeric
                   FROM villages v0
                   WHERE ${v0Cond}
                     AND NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v0.id)
                     AND NOT EXISTS (
                       SELECT 1 FROM plots p0
                       WHERE p0.household_id IS NULL AND lower(btrim(p0.village)) = lower(btrim(v0.name))
                     )
                 )
               )::numeric,
               2
             )::float8`;
            })()
        : !isVillageScoped
          ? `ROUND(
               (
                 (SELECT COALESCE(sum(hh.area_ha), 0)::numeric FROM hh) +
                 (
                   SELECT COALESCE(sum(v.area_ha), 0)::numeric
                   FROM villages v
                   WHERE NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v.id)
                 )
               )::numeric,
               2
             )::float8`
          : `ROUND(
               (
                 (SELECT COALESCE(sum(hh.area_ha), 0)::numeric FROM hh) +
                 (
                   SELECT COALESCE(sum(v.area_ha), 0)::numeric
                   FROM villages v
                   WHERE ${bindVillage("v.id")}
                     AND NOT EXISTS (SELECT 1 FROM households h0 WHERE h0.village_id = v.id)
                 )
               )::numeric,
               2
             )::float8`;

    const openViolationsExpr = canReadViolations
      ? `(SELECT count(*)::int FROM violations v WHERE v.status = 'open' ${violWhere})`
      : "0";
    const pendingApprovalsExpr = canReadApprovals
      ? `(SELECT count(*)::int FROM approvals a WHERE a.status = 'pending' ${apprWhere})`
      : "0";
    const pendingRegistrationsExpr = canReadRegistrations && inCoopScope
      ? (() => {
          const regUserScope = isVillageScoped ? `AND ${bindVillage("u.village_id")}` : "";
          return `(
           (SELECT count(*)::int FROM users u WHERE u.status = 'pending' AND u.role = 'farmer' ${regUserScope}) +
           (
             SELECT count(*)::int
             FROM password_reset_requests r
             JOIN users u ON u.id = r.user_id
             WHERE r.status = 'pending'
               AND r.expires_at > now()
               AND (${isAdmin ? "true" : "(u.role = 'farmer' AND u.status = 'active')"})
               ${regUserScope}
           )
         )`;
        })()
      : "0";
    // Doanh nghiệp: chỉ phiếu đã xác thực của các hộ từng cung ứng vào lô hàng của chính mình.
    const labScope = !canReadLabTests
      ? null
      : isEnterprise
        ? user.enterpriseId
          ? `FROM lab_tests lt
             WHERE lt.record_status = 'verified'
               AND EXISTS (
                 SELECT 1 FROM harvest_contributions hc
                 JOIN harvest_lots hl ON hl.id = hc.lot_id
                 WHERE hc.household_id = lt.household_id AND hl.enterprise_id = ${bindParam(user.enterpriseId)}
               )`
          : "FROM lab_tests lt WHERE 1 = 0"
        : "FROM lab_tests lt JOIN hh ON hh.id = lt.household_id WHERE true";
    const labTestsExpr = labScope ? `(SELECT count(*)::int ${labScope})` : "0";
    const labTestsPassedExpr = labScope ? `(SELECT count(*)::int ${labScope} AND lt.result = 'pass')` : "0";
    const harvestTonsExpr = canReadHarvest
      ? `(SELECT COALESCE(sum(hl.weight_tons), 0)::float8 FROM harvest_lots hl ${harvestLotScope})`
      : "0::float8";
    const harvestLotsExpr = canReadHarvest
      ? `(SELECT count(*)::int FROM harvest_lots hl ${harvestLotScope})`
      : "0";
    const journalLast30Expr =
      canReadJournal || canReadSpray
        ? `(
             ${canReadJournal ? `(SELECT count(*)::int FROM journal_entries je JOIN hh ON hh.id = je.household_id WHERE je.entry_on >= ${TODAY_VN_SQL} - 29)` : "0"} +
             ${canReadSpray ? `(SELECT count(*)::int FROM spray_records sr JOIN hh ON hh.id = sr.household_id WHERE sr.sprayed_on >= ${TODAY_VN_SQL} - 29)` : "0"}
           )`
        : "0";

    const countsQuery = this.db.query(
      `WITH hh AS (
         SELECT h.id, h.status, h.plot_count, h.area_ha
         FROM households h
         ${hhWhere}
       )
       SELECT
         ${householdsCountExpr} AS households,
         ${plotsCountExpr} AS plots,
         ${areaHaExpr} AS area_ha,
         ${canReadHouseholds ? "(SELECT count(*)::int FROM hh WHERE hh.status = 'qualified')" : "0"} AS qualified_households,
         ${openViolationsExpr} AS open_violations,
         ${pendingApprovalsExpr} AS pending_approvals,
         ${pendingRegistrationsExpr} AS pending_registrations,
         ${canReadDeclarations ? "(SELECT count(*)::int FROM harvest_declarations hd JOIN hh ON hh.id = hd.household_id WHERE hd.status = 'submitted')" : "0"} AS pending_declarations,
         ${hasDelReqTable ? "(SELECT count(*)::int FROM member_deletion_requests WHERE status = 'pending')" : "0"} AS pending_deletions,
         ${
           hasTraceReqTable
             ? (() => {
                 const commune = user.assignedCommune?.trim() || "";
                 if (!commune) {
                   return "(SELECT count(*)::int FROM trace_access_requests r WHERE r.status = 'pending')";
                 }
                 const inCune = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
                 const inEaKhal = matchesJurisdiction(commune, [EAKHAL_ADMIN_LOCATION]);
                 if (!inCune && !inEaKhal) return "0";
                 const eaKhalExpr = `(COALESCE(r.puc_code, '') ~* '^66-PUC-SR0001-' OR r.scanned_code ~* '^(?:66-PUC-SR0001-|EK\\d)')`;
                 const cond = inEaKhal && !inCune ? `AND ${eaKhalExpr}` : inCune && !inEaKhal ? `AND NOT ${eaKhalExpr}` : "";
                 return `(SELECT count(*)::int FROM trace_access_requests r WHERE r.status = 'pending' ${cond})`;
               })()
             : "0"
         } AS pending_trace_requests,
         ${labTestsExpr} AS lab_tests,
         ${labTestsPassedExpr} AS lab_tests_passed,
         ${harvestTonsExpr} AS harvest_tons,
         ${harvestLotsExpr} AS harvest_lots,
         ${canReadTraining && (isEnterprise || inCoopScope) ? "(SELECT count(*)::int FROM training_courses)" : "0"} AS training_courses,
         ${journalLast30Expr} AS "journalLast30Days",
         ${
           canReadHouseholds
             ? `COALESCE(
                  (
                    SELECT json_agg(json_build_object('status', s.status, 'count', s.count) ORDER BY s.status)
                    FROM (SELECT hh.status, count(*)::int AS count FROM hh GROUP BY hh.status) s
                  ),
                  '[]'::json
                )`
             : "'[]'::json"
         } AS household_status`,
      countsParams,
    );

    // Phân bổ theo thôn (số hộ, thửa, diện tích) chỉ dành cho vai trò được xem danh sách hộ.
    const villagesParams: unknown[] = [];
    const villagesWhereCond = canReadHouseholds ? villageScope("v.id")(user, villagesParams) : "false";
    const villagesWhere = villagesWhereCond ? `WHERE ${villagesWhereCond}` : "";

    const buildActivityHhWhere = (params: unknown[]) => {
      if (isEnterprise) {
        if (!user.enterpriseId) return "WHERE 1 = 0";
        params.push(user.enterpriseId);
        return `WHERE EXISTS (
          SELECT 1 FROM harvest_contributions hc
          JOIN harvest_lots hl ON hl.id = hc.lot_id
          WHERE hc.household_id = h.id AND hl.enterprise_id = $${params.length}
        )`;
      }
      const cond = villageScope("h.village_id")(user, params);
      return cond ? `WHERE ${cond}` : "";
    };

    const trendParams: unknown[] = [];
    const trendHhWhere = canReadJournal || canReadSpray ? buildActivityHhWhere(trendParams) : "";

    const dailyParams: unknown[] = [];
    const dailyHhWhere = canReadJournal || canReadSpray ? buildActivityHhWhere(dailyParams) : "";

    const listsParams: unknown[] = [];
    const listsHhCond =
      canReadViolations || canReadApprovals ? villageScope("h.village_id")(user, listsParams) : null;
    const listsViolWhere = listsHhCond ? `AND v.household_id IN (SELECT h.id FROM households h WHERE ${listsHhCond})` : "";
    const listsApprWhere = listsHhCond ? `AND a.household_id IN (SELECT h.id FROM households h WHERE ${listsHhCond})` : "";

    const [countsRes, villagesRes, trendRes, dailyRes, listsRes] = await Promise.all([
      countsQuery,
      this.db.query(
        hasPlots
          ? `WITH hp AS (
               SELECT household_id,
                      COUNT(id)::int AS p_cnt,
                      COALESCE(SUM(area_ha), 0)::numeric AS p_area
               FROM plots
               WHERE household_id IS NOT NULL
               GROUP BY household_id
             ),
             up AS (
               SELECT v0.id AS village_id,
                      COUNT(p.id)::int AS p_cnt,
                      COALESCE(SUM(p.area_ha), 0)::numeric AS p_area
               FROM villages v0
               JOIN plots p ON p.household_id IS NULL AND lower(btrim(p.village)) = lower(btrim(v0.name))
               GROUP BY v0.id
             )
             SELECT v.id, v.name,
                    CASE WHEN count(h.id) > 0 THEN count(h.id)::int ELSE v.household_count END AS households,
                    count(h.id) FILTER (WHERE h.status = 'qualified')::int AS qualified,
                    CASE
                      WHEN count(h.id) > 0 OR COALESCE(MAX(up.p_cnt), 0) > 0
                        THEN (
                          COALESCE(sum(CASE WHEN COALESCE(hp.p_cnt, 0) > 0 THEN hp.p_cnt ELSE h.plot_count END), 0) +
                          COALESCE(MAX(up.p_cnt), 0)
                        )::int
                      ELSE v.plot_count
                    END AS plots,
                    CASE
                      WHEN count(h.id) > 0 OR COALESCE(MAX(up.p_cnt), 0) > 0
                        THEN ROUND(
                          (
                            COALESCE(sum(CASE WHEN COALESCE(hp.p_cnt, 0) > 0 THEN hp.p_area ELSE h.area_ha END), 0) +
                            COALESCE(MAX(up.p_area), 0)
                          )::numeric,
                          2
                        )::float8
                      ELSE v.area_ha::float8
                    END AS area_ha
             FROM villages v
             LEFT JOIN households h ON h.village_id = v.id
             LEFT JOIN hp ON hp.household_id = h.id
             LEFT JOIN up ON up.village_id = v.id
             ${villagesWhere}
             GROUP BY v.id, v.name, v.household_count, v.plot_count, v.area_ha
             ORDER BY v.id`
          : `SELECT v.id, v.name,
                    CASE WHEN count(h.id) > 0 THEN count(h.id)::int ELSE v.household_count END AS households,
                    count(h.id) FILTER (WHERE h.status = 'qualified')::int AS qualified,
                    CASE WHEN count(h.id) > 0 THEN COALESCE(sum(h.plot_count), 0)::int ELSE v.plot_count END AS plots,
                    CASE WHEN count(h.id) > 0 THEN COALESCE(sum(h.area_ha), 0)::float8 ELSE v.area_ha::float8 END AS area_ha
             FROM villages v
             LEFT JOIN households h ON h.village_id = v.id
             ${villagesWhere}
             GROUP BY v.id, v.name, v.household_count, v.plot_count, v.area_ha
             ORDER BY v.id`,
        villagesParams,
      ),
      this.db.query(
        canReadJournal || canReadSpray
          ? `WITH scoped_hh AS (
               SELECT h.id
               FROM households h
               ${trendHhWhere}
             )
             SELECT to_char(m.month_start, 'YYYY-MM') AS month,
                    (${canReadJournal ? "COALESCE(j.cnt, 0)" : "0"} + ${canReadSpray ? "COALESCE(s.cnt, 0)" : "0"})::int AS count
             FROM generate_series(
               date_trunc('month', ${TODAY_VN_SQL}) - interval '5 months',
               date_trunc('month', ${TODAY_VN_SQL}),
               interval '1 month'
             ) AS m(month_start)
             LEFT JOIN (
               SELECT date_trunc('month', je.entry_on) AS m_start, count(*)::int AS cnt
               FROM journal_entries je
               JOIN scoped_hh ON scoped_hh.id = je.household_id
               WHERE je.entry_on >= date_trunc('month', ${TODAY_VN_SQL}) - interval '5 months'
               GROUP BY 1
             ) j ON j.m_start = m.month_start
             LEFT JOIN (
               SELECT date_trunc('month', sr.sprayed_on) AS m_start, count(*)::int AS cnt
               FROM spray_records sr
               JOIN scoped_hh ON scoped_hh.id = sr.household_id
               WHERE sr.sprayed_on >= date_trunc('month', ${TODAY_VN_SQL}) - interval '5 months'
               GROUP BY 1
             ) s ON s.m_start = m.month_start
             ORDER BY m.month_start ASC`
          : `SELECT to_char(m.month_start, 'YYYY-MM') AS month,
                    0 AS count
             FROM generate_series(
               date_trunc('month', ${TODAY_VN_SQL}) - interval '5 months',
               date_trunc('month', ${TODAY_VN_SQL}),
               interval '1 month'
             ) AS m(month_start)
             ORDER BY m.month_start ASC`,
        trendParams,
      ),
      this.db.query(
        canReadJournal || canReadSpray
          ? `WITH scoped_hh AS (
               SELECT h.id
               FROM households h
               ${dailyHhWhere}
             ),
             raw_events AS (
               ${
                 canReadJournal && canReadSpray
                   ? `SELECT je.entry_on AS day_on, je.household_id, 1::int AS is_journal, 0::int AS is_spray
                      FROM journal_entries je
                      JOIN scoped_hh ON scoped_hh.id = je.household_id
                      WHERE je.entry_on >= ${TODAY_VN_SQL} - 29 AND je.entry_on <= ${TODAY_VN_SQL}
                      UNION ALL
                      SELECT sr.sprayed_on AS day_on, sr.household_id, 0::int AS is_journal, 1::int AS is_spray
                      FROM spray_records sr
                      JOIN scoped_hh ON scoped_hh.id = sr.household_id
                      WHERE sr.sprayed_on >= ${TODAY_VN_SQL} - 29 AND sr.sprayed_on <= ${TODAY_VN_SQL}`
                   : canReadJournal
                     ? `SELECT je.entry_on AS day_on, je.household_id, 1::int AS is_journal, 0::int AS is_spray
                        FROM journal_entries je
                        JOIN scoped_hh ON scoped_hh.id = je.household_id
                        WHERE je.entry_on >= ${TODAY_VN_SQL} - 29 AND je.entry_on <= ${TODAY_VN_SQL}`
                     : `SELECT sr.sprayed_on AS day_on, sr.household_id, 0::int AS is_journal, 1::int AS is_spray
                        FROM spray_records sr
                        JOIN scoped_hh ON scoped_hh.id = sr.household_id
                        WHERE sr.sprayed_on >= ${TODAY_VN_SQL} - 29 AND sr.sprayed_on <= ${TODAY_VN_SQL}`
               }
             ),
             agg AS (
               SELECT day_on,
                      SUM(is_journal)::int AS j_cnt,
                      SUM(is_spray)::int AS s_cnt,
                      COUNT(DISTINCT household_id)::int AS hh_cnt
               FROM raw_events
               GROUP BY day_on
             )
             SELECT to_char(d.day_start, 'YYYY-MM-DD') AS date,
                    to_char(d.day_start, 'DD/MM') AS label,
                    (COALESCE(agg.j_cnt, 0) + COALESCE(agg.s_cnt, 0))::int AS count,
                    COALESCE(agg.j_cnt, 0)::int AS journal_count,
                    COALESCE(agg.s_cnt, 0)::int AS spray_count,
                    COALESCE(agg.hh_cnt, 0)::int AS household_count
             FROM generate_series(
               ${TODAY_VN_SQL} - 29,
               ${TODAY_VN_SQL},
               interval '1 day'
             ) AS d(day_start)
             LEFT JOIN agg ON agg.day_on = d.day_start::date
             ORDER BY d.day_start ASC`
          : `SELECT to_char(d.day_start, 'YYYY-MM-DD') AS date,
                    to_char(d.day_start, 'DD/MM') AS label,
                    0 AS count,
                    0 AS journal_count,
                    0 AS spray_count,
                    0 AS household_count
             FROM generate_series(
               ${TODAY_VN_SQL} - 29,
               ${TODAY_VN_SQL},
               interval '1 day'
             ) AS d(day_start)
             ORDER BY d.day_start ASC`,
        dailyParams,
      ),
      this.db.query<{
        recent_violations: Record<string, unknown>[];
        pending_approvals: Record<string, unknown>[];
        upcoming_schedule: Record<string, unknown>[];
      }>(
        `SELECT
           ${
             canReadViolations
               ? `COALESCE(
                    (
                      SELECT json_agg(
                        json_build_object(
                          'id', v.id,
                          'severity', v.severity,
                          'title', v.title,
                          'householdLabel', v.household_label,
                          'detectedOn', to_char(v.detected_on, 'YYYY-MM-DD'),
                          'status', v.status
                        )
                      )
                      FROM (
                        SELECT v.id, v.severity, v.title, v.household_label, v.detected_on, v.status
                        FROM violations v
                        WHERE v.status = 'open' ${listsViolWhere}
                        ORDER BY v.detected_on DESC, v.id DESC
                        LIMIT 5
                      ) v
                    ),
                    '[]'::json
                  )`
               : "'[]'::json"
           } AS recent_violations,
           ${
             canReadApprovals
               ? `COALESCE(
                    (
                      SELECT json_agg(
                        json_build_object(
                          'id', a.id,
                          'code', a.code,
                          'applicantName', a.applicant_name,
                          'requestType', a.request_type,
                          'submittedOn', to_char(a.submitted_on, 'YYYY-MM-DD'),
                          'priority', a.priority
                        )
                      )
                      FROM (
                        SELECT a.id, a.code, a.applicant_name, a.request_type, a.submitted_on, a.priority
                        FROM approvals a
                        WHERE a.status = 'pending' ${listsApprWhere}
                        ORDER BY a.submitted_on DESC, a.id DESC
                        LIMIT 5
                      ) a
                    ),
                    '[]'::json
                  )`
               : "'[]'::json"
           } AS pending_approvals,
           ${
             canReadSchedule && inCoopScope
               ? `COALESCE(
                    (
                      SELECT json_agg(
                        json_build_object(
                          'id', s.id,
                          'scheduledOn', to_char(s.scheduled_on, 'YYYY-MM-DD'),
                          'title', s.title,
                          'officer', s.officer,
                          'kind', s.kind,
                          'plotCount', s.plot_count
                        )
                      )
                      FROM (
                        SELECT id, scheduled_on, title, officer, kind, plot_count
                        FROM inspection_schedule
                        WHERE scheduled_on >= ${TODAY_VN_SQL}
                          ${canSeeSuddenSchedule ? "" : "AND kind <> 'sudden'"}
                        ORDER BY scheduled_on ASC, id ASC
                        LIMIT 5
                      ) s
                    ),
                    '[]'::json
                  )`
               : "'[]'::json"
           } AS upcoming_schedule`,
        listsParams,
      ),
    ]);

    const rawCounts = camelRow<{
      households: number;
      plots: number;
      areaHa: number;
      qualifiedHouseholds: number;
      openViolations: number;
      pendingApprovals: number;
      pendingRegistrations: number;
      pendingDeclarations: number;
      pendingDeletions: number;
      pendingTraceRequests: number;
      labTests: number;
      labTestsPassed: number;
      harvestTons: number;
      harvestLots: number;
      trainingCourses: number;
      journalLast30Days: number;
      householdStatus: { status: string; count: number }[];
    }>(countsRes.rows[0]);

    const { harvestLots, householdStatus, ...counts } = rawCounts;
    const listsRow = listsRes.rows[0];

    return {
      counts,
      householdStatus,
      villages: camelRows(villagesRes.rows),
      journalTrend: camelRows(trendRes.rows),
      dailyActivity: camelRows(dailyRes.rows),
      labTests: {
        total: counts.labTests,
        pass: counts.labTestsPassed,
        fail: Math.max(0, counts.labTests - counts.labTestsPassed),
      },
      recentViolations: listsRow?.recent_violations ?? [],
      pendingApprovals: listsRow?.pending_approvals ?? [],
      upcomingSchedule: listsRow?.upcoming_schedule ?? [],
      harvest: {
        lots: harvestLots,
        tons: counts.harvestTons,
      },
    };
  }
}

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  @Authorize("dashboard", "read")
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
