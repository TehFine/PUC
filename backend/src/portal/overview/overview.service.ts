import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { notFound } from "../../common/errors/app.exception";
import { camelRow, camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { householdIdOf, PORTAL_TABS, TODAY_VN_SQL } from "../common/portal-context";

export interface PortalReminder {
  kind: "journal" | "violation" | "isolation" | "schedule" | "training" | "harvest";
  title: string;
  detail: string;
  tab: string;
  date: string | null;
}

/** Tổng quan của hộ: thông tin hộ, số liệu nhanh, kết quả kiểm nghiệm gần nhất và nhắc việc. */
@Injectable()
export class OverviewService {
  constructor(private readonly db: DatabaseService) {}

  async overview(user: AuthUser) {
    const id = householdIdOf(user);
    const household = (
      await this.db.query(
        `SELECT h.id, h.code, h.name, h.phone, h.plot_count, h.area_ha, h.status,
                v.name AS village_name, v.leader AS village_leader
         FROM households h JOIN villages v ON v.id = h.village_id WHERE h.id = $1`,
        [id],
      )
    ).rows[0];
    if (!household) throw notFound("Không tìm thấy hộ của tài khoản này.");

    const [statsRes, lastTestRes, reminders] = await Promise.all([
      this.db.query(
        `SELECT
           (SELECT count(*)::int FROM violations WHERE household_id = $1 AND status = 'open') AS open_violations,
           (SELECT count(*)::int FROM approvals WHERE household_id = $1 AND status = 'pending') AS pending_approvals,
           (SELECT max(entry_on) FROM journal_entries WHERE household_id = $1) AS last_journal_on,
           (SELECT count(*)::int FROM journal_entries
              WHERE household_id = $1 AND entry_on >= (${TODAY_VN_SQL} - 30)) AS "journalLast30Days",
           (SELECT coalesce(sum(weight_kg), 0)::float8 FROM harvest_contributions WHERE household_id = $1) AS harvest_total_kg,
           (SELECT count(*)::int FROM notifications WHERE user_id = $2 AND read_at IS NULL) AS unread_notifications`,
        [id, user.id],
      ),
      this.db.query(
        `SELECT code, plot_code, sampled_on, result FROM lab_tests
         WHERE household_id = $1 ORDER BY sampled_on DESC, id DESC LIMIT 1`,
        [id],
      ),
      this.reminders(id),
    ]);

    const stats = statsRes.rows[0];
    const lastTest = lastTestRes.rows[0];

    return {
      household: camelRow(household),
      stats: camelRow(stats),
      lastTest: lastTest ? camelRow(lastTest) : null,
      reminders,
    };
  }

  /**
   * Nhắc việc tính hoàn toàn bằng SQL:
   * chưa ghi nhật ký 7 ngày, vi phạm đang mở, đang trong thời gian cách ly thuốc,
   * lịch kiểm tra trong 7 ngày tới, lớp tập huấn đã đăng ký trong 7 ngày tới, khai báo thu hái bị từ chối (30 ngày gần đây).
   */
  private async reminders(householdId: number): Promise<PortalReminder[]> {
    const { rows } = await this.db.query(
      `WITH today AS (SELECT ${TODAY_VN_SQL} AS d)
       SELECT * FROM (
         SELECT 1 AS priority, 'journal' AS kind, 'Chưa ghi nhật ký 7 ngày' AS title,
                CASE
                  WHEN j.last_on IS NULL THEN
                    'Chưa có bản ghi' || coalesce(' · Thửa ' || dv.plot_code, '')
                  ELSE
                    'Gần nhất: ' || to_char(j.last_on, 'DD/MM/YYYY') ||
                    coalesce(' · Thửa ' || dv.plot_code, '')
                END AS detail,
                '${PORTAL_TABS.diary}' AS tab, coalesce(j.last_on, dv.detected_on) AS date
         FROM (SELECT max(entry_on) AS last_on FROM journal_entries WHERE household_id = $1) j
         CROSS JOIN today
         LEFT JOIN LATERAL (
           SELECT v.plot_code, v.detected_on, v.farmer_response_at
           FROM violations v
           WHERE v.household_id = $1
             AND v.status = 'open'
             AND v.title ILIKE '%nhật ký%'
           ORDER BY v.detected_on DESC, v.id DESC
           LIMIT 1
         ) dv ON true
         WHERE j.last_on IS NULL
            OR j.last_on < today.d - 7
            OR (dv.detected_on IS NOT NULL AND dv.farmer_response_at IS NULL)

         UNION ALL
         SELECT 0, 'violation', v.title,
                coalesce('Thửa ' || v.plot_code || ' · ', '') ||
                  CASE WHEN v.farmer_response_at IS NULL THEN 'Cần khắc phục' ELSE 'Chờ xác nhận' END,
                '${PORTAL_TABS.diary}', v.detected_on
         FROM violations v
         WHERE v.household_id = $1
           AND v.status = 'open'
           AND v.title NOT ILIKE '%nhật ký%'

         UNION ALL
         SELECT 2, 'isolation', 'Cách ly thuốc: ' || p.name,
                'Ngưng thu hái đến ' || to_char(s.sprayed_on + s.isolation_days, 'DD/MM/YYYY') ||
                  coalesce(' · Thửa ' || s.plot_code, ''),
                '${PORTAL_TABS.diary}', s.sprayed_on + s.isolation_days
         FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id, today
         WHERE s.household_id = $1 AND s.isolation_days > 0 AND s.sprayed_on <= today.d
           AND s.sprayed_on + s.isolation_days >= today.d

         UNION ALL
         SELECT 3, 'schedule', i.title,
                to_char(i.scheduled_on, 'DD/MM/YYYY') || ' · CB ' || i.officer,
                '${PORTAL_TABS.inspection}', i.scheduled_on
         FROM inspection_schedule i, today
         WHERE i.scheduled_on BETWEEN today.d AND today.d + 7

         UNION ALL
         SELECT 4, 'training', c.title,
                to_char(c.held_on, 'DD/MM/YYYY') ||
                  coalesce(' · ' || to_char(c.starts_at, 'HH24:MI'), '') || coalesce(' · ' || c.location, ''),
                '${PORTAL_TABS.learn}', c.held_on
         FROM training_registrations r JOIN training_courses c ON c.id = r.course_id, today
         WHERE r.household_id = $1 AND r.status = 'registered' AND NOT c.completed
           AND c.held_on BETWEEN today.d AND today.d + 7

         UNION ALL
         SELECT 5, 'harvest', 'Từ chối khai báo thu hái',
                'Thửa ' || d.plot_code || ' · ' || to_char(d.harvested_on, 'DD/MM/YYYY'),
                '${PORTAL_TABS.stamps}', (d.reviewed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
         FROM harvest_declarations d, today
         WHERE d.household_id = $1 AND d.status = 'rejected'
           AND (d.reviewed_at IS NULL OR d.reviewed_at >= now() - interval '30 days')
       ) r
       ORDER BY priority, date NULLS FIRST
       LIMIT 20`,
      [householdId],
    );
    return camelRows<PortalReminder & { priority?: number }>(rows).map(({ priority: _priority, ...reminder }) => reminder);
  }
}
