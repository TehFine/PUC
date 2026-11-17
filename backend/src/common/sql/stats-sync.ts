import type { QueryResult, QueryResultRow } from "pg";

export interface SqlQueryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export interface SystemScaleOverviewRow extends QueryResultRow {
  households: number;
  qualified_households: number;
  villages: number;
  plots: number;
  area_ha: number;
}

export async function hasPlotsTable(db: SqlQueryable): Promise<boolean> {
  const res = await db.query<{ reg: string | null }>("SELECT to_regclass('public.plots') AS reg");
  return res.rows[0]?.reg !== null;
}

/**
 * Tìm `household_id` cho thửa đất vừa vẽ/nhập:
 * - Ưu tiên `householdId` tường minh nếu hợp lệ.
 * - Nếu chưa có, khớp tự động khi `ownerName` trùng duy nhất với một hộ (ưu tiên cùng thôn trước).
 */
export async function resolvePlotHouseholdId(
  db: SqlQueryable,
  input: {
    householdId?: number | null;
    ownerName?: string | null;
    villageName?: string | null;
  },
): Promise<number | null> {
  const explicitId =
    typeof input.householdId === "number" && Number.isInteger(input.householdId) && input.householdId > 0
      ? input.householdId
      : null;

  if (explicitId !== null) {
    const found = await db.query<{ id: number | string }>("SELECT id FROM households WHERE id = $1 LIMIT 1", [
      explicitId,
    ]);
    return found.rows[0] ? Number(found.rows[0].id) : null;
  }

  const owner = typeof input.ownerName === "string" ? input.ownerName.trim() : "";
  if (!owner) return null;

  const village = typeof input.villageName === "string" ? input.villageName.trim() : "";
  if (village) {
    const byVillage = await db.query<{ id: number | string }>(
      `SELECT h.id
       FROM households h
       JOIN villages v ON v.id = h.village_id
       WHERE lower(btrim(h.name)) = lower(btrim($1))
         AND lower(btrim(v.name)) = lower(btrim($2))
       LIMIT 2`,
      [owner, village],
    );
    return byVillage.rows.length === 1 ? Number(byVillage.rows[0].id) : null;
  }

  const globalMatch = await db.query<{ id: number | string }>(
    `SELECT h.id
     FROM households h
     WHERE lower(btrim(h.name)) = lower(btrim($1))
     LIMIT 2`,
    [owner],
  );
  if (globalMatch.rows.length === 1) {
    return Number(globalMatch.rows[0].id);
  }

  return null;
}

/**
 * Đồng bộ xuyên suốt số thửa & diện tích từ `plots` -> `households` -> `villages`
 * để mọi thay đổi trên bản đồ số, danh sách nông hộ hoặc danh mục thôn luôn nhất quán trên toàn hệ thống.
 */
export async function syncHouseholdAndVillageStats(
  db: SqlQueryable,
  options?: {
    householdIds?: number[];
    forceZeroVillageIds?: number[];
    hasPlots?: boolean;
  },
): Promise<void> {
  const hasPlots = options?.hasPlots ?? (await hasPlotsTable(db));

  const hhIds = Array.from(
    new Set((options?.householdIds ?? []).filter((id) => Number.isInteger(id) && id > 0)),
  );
  if (hasPlots && hhIds.length > 0) {
    await db.query(
      `UPDATE households h
       SET plot_count = s.cnt,
           area_ha = ROUND(s.total_area::numeric, 2),
           updated_at = now()
       FROM (
         SELECT household_id,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(area_ha), 0)::numeric AS total_area
         FROM plots
         WHERE household_id = ANY($1::bigint[])
         GROUP BY household_id
       ) s
       WHERE h.id = s.household_id`,
      [hhIds],
    );
  }

  const forceZeroIds = Array.from(
    new Set((options?.forceZeroVillageIds ?? []).filter((id) => Number.isInteger(id) && id > 0)),
  );

  if (hasPlots) {
    await db.query(
      `WITH hh_by_v AS (
         SELECT village_id,
                COUNT(*)::int AS hh_cnt,
                COALESCE(SUM(plot_count), 0)::int AS hh_plots,
                COALESCE(SUM(area_ha), 0)::numeric AS hh_area
         FROM households
         GROUP BY village_id
       ),
       unlinked_plots_by_v AS (
         SELECT v.id AS village_id,
                COUNT(p.id)::int AS p_cnt,
                COALESCE(SUM(p.area_ha), 0)::numeric AS p_area
         FROM villages v
         JOIN plots p ON p.household_id IS NULL AND lower(btrim(p.village)) = lower(btrim(v.name))
         GROUP BY v.id
       )
       UPDATE villages v
       SET household_count = COALESCE(h.hh_cnt, 0),
           plot_count = COALESCE(h.hh_plots, 0) + COALESCE(up.p_cnt, 0),
           area_ha = ROUND((COALESCE(h.hh_area, 0) + COALESCE(up.p_area, 0))::numeric, 2),
           updated_at = now()
       FROM (
         SELECT v2.id
         FROM villages v2
         LEFT JOIN hh_by_v h2 ON h2.village_id = v2.id
         LEFT JOIN unlinked_plots_by_v up2 ON up2.village_id = v2.id
         WHERE COALESCE(h2.hh_cnt, 0) > 0
            OR COALESCE(up2.p_cnt, 0) > 0
            OR v2.id = ANY($1::bigint[])
       ) active_v
       LEFT JOIN hh_by_v h ON h.village_id = active_v.id
       LEFT JOIN unlinked_plots_by_v up ON up.village_id = active_v.id
       WHERE v.id = active_v.id
         AND (
           v.household_count IS DISTINCT FROM COALESCE(h.hh_cnt, 0)
           OR v.plot_count IS DISTINCT FROM (COALESCE(h.hh_plots, 0) + COALESCE(up.p_cnt, 0))
           OR v.area_ha IS DISTINCT FROM ROUND((COALESCE(h.hh_area, 0) + COALESCE(up.p_area, 0))::numeric, 2)
         )`,
      [forceZeroIds],
    );
    return;
  }

  await db.query(
    `WITH hh_by_v AS (
       SELECT village_id,
              COUNT(*)::int AS hh_cnt,
              COALESCE(SUM(plot_count), 0)::int AS hh_plots,
              COALESCE(SUM(area_ha), 0)::numeric AS hh_area
       FROM households
       GROUP BY village_id
     )
     UPDATE villages v
     SET household_count = COALESCE(h.hh_cnt, 0),
         plot_count = COALESCE(h.hh_plots, 0),
         area_ha = ROUND(COALESCE(h.hh_area, 0)::numeric, 2),
         updated_at = now()
     FROM (
       SELECT v2.id
       FROM villages v2
       LEFT JOIN hh_by_v h2 ON h2.village_id = v2.id
       WHERE COALESCE(h2.hh_cnt, 0) > 0
          OR v2.id = ANY($1::bigint[])
     ) active_v
     LEFT JOIN hh_by_v h ON h.village_id = active_v.id
     WHERE v.id = active_v.id
       AND (
         v.household_count IS DISTINCT FROM COALESCE(h.hh_cnt, 0)
         OR v.plot_count IS DISTINCT FROM COALESCE(h.hh_plots, 0)
         OR v.area_ha IS DISTINCT FROM ROUND(COALESCE(h.hh_area, 0)::numeric, 2)
       )`,
    [forceZeroIds],
  );
}

/**
 * Tính toán các chỉ số quy mô toàn vùng (dùng chung cho Trang giới thiệu & Tổng quan quản trị):
 * - Kết hợp dữ liệu thực tế của `households` + các thửa bản đồ `plots` chưa gắn hộ + thôn mới tạo chưa nhập chi tiết hộ.
 */
export async function querySystemScaleOverview(
  db: SqlQueryable,
  hasPlotsOverride?: boolean,
): Promise<SystemScaleOverviewRow> {
  const hasPlots = hasPlotsOverride ?? (await hasPlotsTable(db));

  if (hasPlots) {
    const { rows } = await db.query<SystemScaleOverviewRow>(
      `SELECT
         (
           (SELECT count(*)::int FROM households) +
           (
             SELECT coalesce(sum(v.household_count), 0)::int
             FROM villages v
             WHERE NOT EXISTS (SELECT 1 FROM households h WHERE h.village_id = v.id)
           )
         ) AS households,
         (SELECT count(*)::int FROM households WHERE status = 'qualified') AS qualified_households,
         (SELECT count(*)::int FROM villages) AS villages,
         (
           (SELECT coalesce(sum(plot_count), 0)::int FROM households) +
           (SELECT count(*)::int FROM plots WHERE household_id IS NULL) +
           (
             SELECT coalesce(sum(v.plot_count), 0)::int
             FROM villages v
             WHERE NOT EXISTS (SELECT 1 FROM households h WHERE h.village_id = v.id)
               AND NOT EXISTS (
                 SELECT 1 FROM plots p
                 WHERE p.household_id IS NULL AND lower(btrim(p.village)) = lower(btrim(v.name))
               )
           )
         ) AS plots,
         ROUND(
           (
             (SELECT coalesce(sum(area_ha), 0)::numeric FROM households) +
             (SELECT coalesce(sum(area_ha), 0)::numeric FROM plots WHERE household_id IS NULL) +
             (
               SELECT coalesce(sum(v.area_ha), 0)::numeric
               FROM villages v
               WHERE NOT EXISTS (SELECT 1 FROM households h WHERE h.village_id = v.id)
                 AND NOT EXISTS (
                   SELECT 1 FROM plots p
                   WHERE p.household_id IS NULL AND lower(btrim(p.village)) = lower(btrim(v.name))
                 )
             )
           )::numeric,
           2
         )::float8 AS area_ha`,
    );
    return rows[0];
  }

  const { rows } = await db.query<SystemScaleOverviewRow>(
    `SELECT
       (
         (SELECT count(*)::int FROM households) +
         (
           SELECT coalesce(sum(v.household_count), 0)::int
           FROM villages v
           WHERE NOT EXISTS (SELECT 1 FROM households h WHERE h.village_id = v.id)
         )
       ) AS households,
       (SELECT count(*)::int FROM households WHERE status = 'qualified') AS qualified_households,
       (SELECT count(*)::int FROM villages) AS villages,
       (
         (SELECT coalesce(sum(plot_count), 0)::int FROM households) +
         (
           SELECT coalesce(sum(v.plot_count), 0)::int
           FROM villages v
           WHERE NOT EXISTS (SELECT 1 FROM households h WHERE h.village_id = v.id)
         )
       ) AS plots,
       ROUND(
         (
           (SELECT coalesce(sum(area_ha), 0)::numeric FROM households) +
           (
             SELECT coalesce(sum(v.area_ha), 0)::numeric
             FROM villages v
             WHERE NOT EXISTS (SELECT 1 FROM households h WHERE h.village_id = v.id)
           )
         )::numeric,
         2
       )::float8 AS area_ha`,
  );
  return rows[0];
}
