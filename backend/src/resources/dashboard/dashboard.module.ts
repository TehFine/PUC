import { Controller, Get, Injectable, Module } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { camelRow, camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
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
    const isVillageScoped = user.role === "village_officer";
    const villageId = isVillageScoped ? (user.villageId ?? -1) : null;
    const params = villageId !== null ? [villageId] : [];
    const hhWhere = villageId !== null ? "WHERE h.village_id = $1" : "";
    const violWhere =
      villageId !== null
        ? "AND v.household_id IN (SELECT id FROM households WHERE village_id = $1)"
        : "";
    const apprWhere =
      villageId !== null
        ? "AND a.household_id IN (SELECT id FROM households WHERE village_id = $1)"
        : "";
    const regWhere = villageId !== null ? "AND u.village_id = $1" : "";

    const hasPlots = await this.hasPlotsTable();

    const plotsCountExpr =
      hasPlots && villageId === null
        ? `GREATEST((SELECT count(*)::int FROM plots), (SELECT COALESCE(sum(hh.plot_count), 0)::int FROM hh))`
        : `(SELECT COALESCE(sum(hh.plot_count), 0)::int FROM hh)`;

    const countsQuery = this.db.query(
      `WITH hh AS (
         SELECT h.id, h.status, h.plot_count, h.area_ha
         FROM households h
         ${hhWhere}
       )
       SELECT
         (SELECT count(*)::int FROM hh) AS households,
         ${plotsCountExpr} AS plots,
         (SELECT COALESCE(sum(hh.area_ha), 0)::float8 FROM hh) AS area_ha,
         (SELECT count(*)::int FROM hh WHERE hh.status = 'qualified') AS qualified_households,
         (SELECT count(*)::int FROM violations v WHERE v.status = 'open' ${violWhere}) AS open_violations,
         (SELECT count(*)::int FROM approvals a WHERE a.status = 'pending' ${apprWhere}) AS pending_approvals,
         (
           (SELECT count(*)::int FROM users u WHERE u.status = 'pending' AND u.role = 'farmer' ${regWhere}) +
           (SELECT count(*)::int FROM password_reset_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' ${regWhere})
         ) AS pending_registrations,
         (SELECT count(*)::int FROM harvest_declarations hd JOIN hh ON hh.id = hd.household_id WHERE hd.status = 'submitted') AS pending_declarations,
         (SELECT count(*)::int FROM lab_tests lt JOIN hh ON hh.id = lt.household_id) AS lab_tests,
         (SELECT count(*)::int FROM lab_tests lt JOIN hh ON hh.id = lt.household_id WHERE lt.result = 'pass') AS lab_tests_passed,
         (SELECT COALESCE(sum(weight_tons), 0)::float8 FROM harvest_lots) AS harvest_tons,
         (SELECT count(*)::int FROM harvest_lots) AS harvest_lots,
         (SELECT count(*)::int FROM training_courses) AS training_courses,
         (SELECT count(*)::int FROM journal_entries je JOIN hh ON hh.id = je.household_id WHERE je.entry_on >= ${TODAY_VN_SQL} - 30) AS journal_last_30_days,
         COALESCE(
           (
             SELECT json_agg(json_build_object('status', s.status, 'count', s.count) ORDER BY s.status)
             FROM (SELECT hh.status, count(*)::int AS count FROM hh GROUP BY hh.status) s
           ),
           '[]'::json
         ) AS household_status`,
      params,
    );

    const [countsRes, villagesRes, trendRes, listsRes] = await Promise.all([
      countsQuery,
      this.db.query(
        `SELECT v.id, v.name,
                count(h.id)::int AS households,
                count(h.id) FILTER (WHERE h.status = 'qualified')::int AS qualified,
                COALESCE(sum(h.plot_count), 0)::int AS plots,
                COALESCE(sum(h.area_ha), 0)::float8 AS area_ha
         FROM villages v
         LEFT JOIN households h ON h.village_id = v.id
         ${villageId !== null ? "WHERE v.id = $1" : ""}
         GROUP BY v.id, v.name
         ORDER BY v.id`,
        params,
      ),
      this.db.query(
        `SELECT to_char(m.month_start, 'YYYY-MM') AS month,
                count(j.id)::int AS count
         FROM generate_series(
           date_trunc('month', ${TODAY_VN_SQL}) - interval '5 months',
           date_trunc('month', ${TODAY_VN_SQL}),
           interval '1 month'
         ) AS m(month_start)
         LEFT JOIN (
           SELECT je.id, je.entry_on
           FROM journal_entries je
           JOIN households h ON h.id = je.household_id
           ${hhWhere}
         ) j ON date_trunc('month', j.entry_on) = m.month_start
         GROUP BY m.month_start
         ORDER BY m.month_start ASC`,
        params,
      ),
      this.db.query<{
        recent_violations: Record<string, unknown>[];
        pending_approvals: Record<string, unknown>[];
        upcoming_schedule: Record<string, unknown>[];
      }>(
        `SELECT
           COALESCE(
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
                 WHERE 1=1 ${violWhere}
                 ORDER BY v.detected_on DESC, v.id DESC
                 LIMIT 5
               ) v
             ),
             '[]'::json
           ) AS recent_violations,
           COALESCE(
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
                 WHERE a.status = 'pending' ${apprWhere}
                 ORDER BY a.submitted_on DESC, a.id DESC
                 LIMIT 5
               ) a
             ),
             '[]'::json
           ) AS pending_approvals,
           COALESCE(
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
                 ORDER BY scheduled_on ASC, id ASC
                 LIMIT 5
               ) s
             ),
             '[]'::json
           ) AS upcoming_schedule`,
        params,
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
