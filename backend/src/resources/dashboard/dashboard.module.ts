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
    const hhAnd = villageId !== null ? "AND h.village_id = $1" : "";
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
        ? `GREATEST((SELECT count(*)::int FROM plots), (SELECT COALESCE(sum(h.plot_count), 0)::int FROM households h))`
        : `(SELECT COALESCE(sum(h.plot_count), 0)::int FROM households h ${hhWhere})`;

    const countsQuery = this.db.query(
      `SELECT
         (SELECT count(*)::int FROM households h ${hhWhere}) AS households,
         ${plotsCountExpr} AS plots,
         (SELECT COALESCE(sum(h.area_ha), 0)::float8 FROM households h ${hhWhere}) AS area_ha,
         (SELECT count(*)::int FROM households h WHERE h.status = 'qualified' ${hhAnd}) AS qualified_households,
         (SELECT count(*)::int FROM violations v WHERE v.status = 'open' ${violWhere}) AS open_violations,
         (SELECT count(*)::int FROM approvals a WHERE a.status = 'pending' ${apprWhere}) AS pending_approvals,
         (SELECT count(*)::int FROM users u WHERE u.status = 'pending' AND u.role = 'farmer' ${regWhere}) AS pending_registrations,
         (SELECT count(*)::int FROM harvest_declarations hd JOIN households h ON h.id = hd.household_id WHERE hd.status = 'submitted' ${hhAnd}) AS pending_declarations,
         (SELECT count(*)::int FROM lab_tests lt JOIN households h ON h.id = lt.household_id ${hhWhere}) AS lab_tests,
         (SELECT count(*)::int FROM lab_tests lt JOIN households h ON h.id = lt.household_id WHERE lt.result = 'pass' ${hhAnd}) AS lab_tests_passed,
         (SELECT COALESCE(sum(weight_tons), 0)::float8 FROM harvest_lots) AS harvest_tons,
         (SELECT count(*)::int FROM harvest_lots) AS harvest_lots,
         (SELECT count(*)::int FROM training_courses) AS training_courses,
         (SELECT count(*)::int FROM journal_entries je JOIN households h ON h.id = je.household_id WHERE je.entry_on >= ${TODAY_VN_SQL} - 30 ${hhAnd}) AS journal_last_30_days`,
      params,
    );
    const [countsRes, statusRes, villagesRes, trendRes, violationsRes, approvalsRes, scheduleRes] = await Promise.all([
      countsQuery,
      this.db.query(
        `SELECT h.status, count(*)::int AS count
         FROM households h ${hhWhere}
         GROUP BY h.status
         ORDER BY h.status`,
        params,
      ),
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
      this.db.query(
        `SELECT v.id, v.severity, v.title, v.household_label, v.detected_on, v.status
         FROM violations v
         WHERE 1=1 ${violWhere}
         ORDER BY v.detected_on DESC, v.id DESC
         LIMIT 5`,
        params,
      ),
      this.db.query(
        `SELECT a.id, a.code, a.applicant_name, a.request_type, a.submitted_on, a.priority
         FROM approvals a
         WHERE a.status = 'pending' ${apprWhere}
         ORDER BY a.submitted_on DESC, a.id DESC
         LIMIT 5`,
        params,
      ),
      this.db.query(
        `SELECT id, scheduled_on, title, officer, kind, plot_count
         FROM inspection_schedule
         WHERE scheduled_on >= ${TODAY_VN_SQL}
         ORDER BY scheduled_on ASC, id ASC
         LIMIT 5`,
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
    }>(countsRes.rows[0]);

    const { harvestLots, ...counts } = rawCounts;

    return {
      counts,
      householdStatus: camelRows(statusRes.rows),
      villages: camelRows(villagesRes.rows),
      journalTrend: camelRows(trendRes.rows),
      labTests: {
        total: counts.labTests,
        pass: counts.labTestsPassed,
        fail: Math.max(0, counts.labTests - counts.labTestsPassed),
      },
      recentViolations: camelRows(violationsRes.rows),
      pendingApprovals: camelRows(approvalsRes.rows),
      upcomingSchedule: camelRows(scheduleRes.rows),
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
