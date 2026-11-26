-- 043_data_accuracy_and_scope_sync.sql:
-- 1. Chuẩn hóa đồng nhất cột villages.commune_location sau sáp nhập ("Xã Ea Khăl, Tỉnh Đắk Lắk" / "Xã Krông Búk, Tỉnh Đắk Lắk").
-- 2. Gỡ bỏ giá trị DEFAULT giả lập trên bảng harvest_lots (packhouse_code 'VN-DLPH-0089', variety 'Ri6 & Monthong (Dona)')
--    để lô mới không tự điền thông tin giả khi chưa khai báo thực tế (không xóa dữ liệu lịch sử hiện có).
-- 3. Đồng bộ lại plot_count / area_ha của households (với các hộ đã có thửa trên bảng plots) và bảng villages
--    để số liệu hiển thị trên Tổng quan, Quản trị và Cổng Nông hộ khớp tuyệt đối với cơ sở dữ liệu.

DO $$
BEGIN
  PERFORM set_config('puc.seeding', 'on', true);
  PERFORM set_config('puc.rechaining', 'on', true);

  -- 1. Chuẩn hóa địa bàn xã trên danh mục thôn
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'villages'
      AND column_name = 'commune_location'
  ) THEN
    UPDATE villages
    SET commune_location = CASE
      WHEN name ~* '(ea\s*kh[aă]l|ea\s*k''?s[oô])'
        OR COALESCE(commune_location, '') ~* '(ea\s*kh[aă]l|ea\s*h''?leo)'
        THEN 'Xã Ea Khăl, Tỉnh Đắk Lắk'
      ELSE 'Xã Krông Búk, Tỉnh Đắk Lắk'
    END
    WHERE commune_location IS DISTINCT FROM (
      CASE
        WHEN name ~* '(ea\s*kh[aă]l|ea\s*k''?s[oô])'
          OR COALESCE(commune_location, '') ~* '(ea\s*kh[aă]l|ea\s*h''?leo)'
          THEN 'Xã Ea Khăl, Tỉnh Đắk Lắk'
        ELSE 'Xã Krông Búk, Tỉnh Đắk Lắk'
      END
    );
  END IF;

  -- 2. Gỡ DEFAULT giả định trên bảng harvest_lots (chỉ áp dụng cho các bản ghi tạo mới về sau)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'harvest_lots'
      AND column_name = 'packhouse_code'
  ) THEN
    ALTER TABLE harvest_lots ALTER COLUMN packhouse_code DROP DEFAULT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'harvest_lots'
      AND column_name = 'variety'
  ) THEN
    ALTER TABLE harvest_lots ALTER COLUMN variety DROP DEFAULT;
  END IF;

  -- 3. Đồng bộ số thửa và diện tích thực tế từ bảng plots -> households -> villages
  IF to_regclass('public.plots') IS NOT NULL THEN
    UPDATE households h
    SET plot_count = s.cnt,
        area_ha = ROUND(s.total_area::numeric, 2),
        updated_at = now()
    FROM (
      SELECT household_id,
             COUNT(*)::int AS cnt,
             COALESCE(SUM(area_ha), 0)::numeric AS total_area
      FROM plots
      WHERE household_id IS NOT NULL
      GROUP BY household_id
    ) s
    WHERE h.id = s.household_id
      AND (
        h.plot_count IS DISTINCT FROM s.cnt
        OR h.area_ha IS DISTINCT FROM ROUND(s.total_area::numeric, 2)
      );

    WITH hh_by_v AS (
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
    ) active_v
    LEFT JOIN hh_by_v h ON h.village_id = active_v.id
    LEFT JOIN unlinked_plots_by_v up ON up.village_id = active_v.id
    WHERE v.id = active_v.id
      AND (
        v.household_count IS DISTINCT FROM COALESCE(h.hh_cnt, 0)
        OR v.plot_count IS DISTINCT FROM (COALESCE(h.hh_plots, 0) + COALESCE(up.p_cnt, 0))
        OR v.area_ha IS DISTINCT FROM ROUND((COALESCE(h.hh_area, 0) + COALESCE(up.p_area, 0))::numeric, 2)
      );
  ELSE
    WITH hh_by_v AS (
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
    ) active_v
    LEFT JOIN hh_by_v h ON h.village_id = active_v.id
    WHERE v.id = active_v.id
      AND (
        v.household_count IS DISTINCT FROM COALESCE(h.hh_cnt, 0)
        OR v.plot_count IS DISTINCT FROM COALESCE(h.hh_plots, 0)
        OR v.area_ha IS DISTINCT FROM ROUND(COALESCE(h.hh_area, 0)::numeric, 2)
      );
  END IF;
END $$;

