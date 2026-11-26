-- 044_offline_field_evidence_trust_tiers.sql:
-- Bổ sung hạ tầng chống gian lận nhật ký ngoại tuyến ngoài rẫy không có 4G/WiFi:
-- 1. Mở rộng capture_source ('in_app_camera', 'camera', 'upload', 'system') trên cả journal_entries và spray_records.
-- 2. Lưu đầy đủ sai số vệ tinh (gps_accuracy_m), mốc giờ chụp thiết bị (client_captured_at), cờ hàng đợi ngoại tuyến (offline_queued),
--    bằng chứng quét biển QR vật lý tại thửa vườn (signboard_qr_verified), tọa độ GPS cho bản ghi phun thuốc (spray_records),
--    cùng phân tầng độ tin cậy 3 mức (trust_level: 1 cao / 2 hợp lệ / 3 cần xác minh) và danh sách cờ bằng chứng (trust_flags).
-- 3. Không làm thay đổi công thức băm sổ cái SHA-256 (JOURNAL-V1 / SPRAY-V1) hay sinh bản ghi giả trong immutable_change_logs.

DO $$
BEGIN
  PERFORM set_config('puc.seeding', 'on', true);
  PERFORM set_config('puc.rechaining', 'on', true);

  -- 1. Bảng nhật ký canh tác journal_entries
  ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_capture_source_check;

  ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS gps_accuracy_m NUMERIC(8, 1)
      CHECK (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0),
    ADD COLUMN IF NOT EXISTS client_captured_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS offline_queued BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS signboard_qr_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS trust_level SMALLINT NOT NULL DEFAULT 2
      CHECK (trust_level IN (1, 2, 3)),
    ADD COLUMN IF NOT EXISTS trust_flags TEXT[] NOT NULL DEFAULT '{}'::text[];

  ALTER TABLE journal_entries
    ADD CONSTRAINT journal_entries_capture_source_check
    CHECK (capture_source IN ('in_app_camera', 'camera', 'upload', 'system'));

  -- 2. Bảng nhật ký phun thuốc BVTV spray_records (đồng bộ đầy đủ lớp định vị và độ tin cậy)
  ALTER TABLE spray_records DROP CONSTRAINT IF EXISTS spray_records_capture_source_check;

  ALTER TABLE spray_records
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6)
      CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6)
      CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    ADD COLUMN IF NOT EXISTS gps_accuracy_m NUMERIC(8, 1)
      CHECK (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0),
    ADD COLUMN IF NOT EXISTS gps_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS gps_distance_m NUMERIC(10, 1),
    ADD COLUMN IF NOT EXISTS capture_source TEXT NOT NULL DEFAULT 'camera',
    ADD COLUMN IF NOT EXISTS client_captured_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS offline_queued BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS signboard_qr_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS trust_level SMALLINT NOT NULL DEFAULT 2
      CHECK (trust_level IN (1, 2, 3)),
    ADD COLUMN IF NOT EXISTS trust_flags TEXT[] NOT NULL DEFAULT '{}'::text[];

  ALTER TABLE spray_records
    ADD CONSTRAINT spray_records_capture_source_check
    CHECK (capture_source IN ('in_app_camera', 'camera', 'upload', 'system'));

  -- 3. Chuẩn hóa mức độ tin cậy ban đầu cho các bản ghi lịch sử chưa có cờ
  UPDATE journal_entries
  SET trust_level = CASE
        WHEN COALESCE(verification_status, 'self_declared') = 'verified' THEN 1
        WHEN COALESCE(entry_delay_hours, 0) > 72 THEN 3
        WHEN COALESCE(gps_verified, false) = true AND COALESCE(is_late_entry, false) = false THEN 1
        ELSE 2
      END,
      trust_flags = ARRAY_REMOVE(
        ARRAY[
          CASE WHEN COALESCE(verification_status, 'self_declared') = 'verified' THEN 'staff_verified' END,
          CASE WHEN COALESCE(gps_verified, false) = true THEN 'inside_plot' END,
          CASE WHEN COALESCE(is_late_entry, false) = true THEN 'late_sync' END
        ]::text[],
        NULL
      )
  WHERE cardinality(trust_flags) = 0;

  UPDATE spray_records
  SET trust_level = CASE
        WHEN COALESCE(verification_status, 'self_declared') = 'verified' THEN 1
        WHEN COALESCE(recorded_by_role, 'farmer') <> 'farmer' THEN 1
        WHEN COALESCE(entry_delay_hours, 0) > 72 THEN 3
        WHEN COALESCE(gps_verified, false) = true AND COALESCE(is_late_entry, false) = false THEN 1
        ELSE 2
      END,
      trust_flags = ARRAY_REMOVE(
        ARRAY[
          CASE WHEN COALESCE(verification_status, 'self_declared') = 'verified' THEN 'staff_verified' END,
          CASE WHEN COALESCE(gps_verified, false) = true THEN 'inside_plot' END,
          CASE WHEN COALESCE(is_late_entry, false) = true THEN 'late_sync' END
        ]::text[],
        NULL
      )
  WHERE cardinality(trust_flags) = 0;
END $$;

CREATE INDEX IF NOT EXISTS journal_entries_trust_level_idx
  ON journal_entries (household_id, trust_level);

CREATE INDEX IF NOT EXISTS spray_records_trust_level_idx
  ON spray_records (household_id, trust_level);

