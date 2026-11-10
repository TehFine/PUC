-- 010_performance_indexes.sql: Chỉ mục tối ưu tốc độ truy vấn cho Dashboard, Portal hộ dân, Thông báo và GIS

-- Kiểm nghiệm phòng lab theo hộ và ngày lấy mẫu mới nhất (Portal & Truy xuất nguồn gốc)
CREATE INDEX IF NOT EXISTS lab_tests_household_sampled_idx
  ON lab_tests (household_id, sampled_on DESC, id DESC);

-- Danh sách vi phạm mới nhất theo trạng thái và theo hộ (Dashboard & Portal)
CREATE INDEX IF NOT EXISTS violations_status_detected_idx
  ON violations (status, detected_on DESC, id DESC);

CREATE INDEX IF NOT EXISTS violations_hh_status_detected_idx
  ON violations (household_id, status, detected_on DESC);

-- Hồ sơ chờ duyệt mới nhất (Dashboard & Quản trị)
CREATE INDEX IF NOT EXISTS approvals_status_submitted_idx
  ON approvals (status, submitted_on DESC, id DESC);

-- Lịch kiểm tra sắp tới theo ngày (Dashboard & Portal)
CREATE INDEX IF NOT EXISTS inspection_schedule_date_idx
  ON inspection_schedule (scheduled_on ASC, id ASC);

-- Nhật ký canh tác & phun thuốc theo hộ sắp xếp giảm dần theo ngày
CREATE INDEX IF NOT EXISTS journal_hh_entry_on_idx
  ON journal_entries (household_id, entry_on DESC, id DESC);

CREATE INDEX IF NOT EXISTS spray_hh_sprayed_on_idx
  ON spray_records (household_id, sprayed_on DESC, id DESC);

-- Đánh dấu đã đọc thông báo theo liên kết và người dùng
CREATE INDEX IF NOT EXISTS notifications_user_link_idx
  ON notifications (user_id, link)
  WHERE read_at IS NULL;

-- Khai báo thu hoạch theo hộ và trạng thái duyệt
CREATE INDEX IF NOT EXISTS harvest_decl_hh_status_idx
  ON harvest_declarations (household_id, status, harvested_on DESC);

-- Chỉ mục cho bảng không gian khi CSDL đã bật PostGIS
DO $$
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS plots_village_idx ON plots (village);
  END IF;

  IF to_regclass('public.plot_measurements') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS plot_measurements_code_created_idx
      ON plot_measurements (plot_code, created_at DESC);
  END IF;
END $$;

