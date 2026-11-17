-- 026_scope_and_ledger_integrity.sql
-- 1. Ghi nhận người tạo bản ghi phun thuốc (spray_records.recorded_by_role, created_by_user_id) để cổng hộ dân
--    chỉ cho hộ tự xóa bản ghi do chính hộ nhập, không xóa được bản ghi do cán bộ ghi nhận.
-- 2. Chỉ mục hỗ trợ kiểm tra phạm vi doanh nghiệp (lô hàng, tệp gắn phiếu kiểm nghiệm và khai báo thu hoạch).
-- Không sửa mrl_status của bản ghi cũ để giữ nguyên chuỗi băm đã niêm phong; quy tắc thuốc hạn chế = 'exceeded'
-- áp dụng cho bản ghi mới ở cả trang quản trị lẫn cổng hộ dân.
-- Toàn bộ câu lệnh dùng IF NOT EXISTS và cập nhật bù tương thích ngược với dữ liệu đã có.

ALTER TABLE spray_records
  ADD COLUMN IF NOT EXISTS recorded_by_role TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spray_records_recorded_by_role_check'
  ) THEN
    ALTER TABLE spray_records
      ADD CONSTRAINT spray_records_recorded_by_role_check
      CHECK (
        recorded_by_role IS NULL
        OR recorded_by_role IN ('admin', 'htx_officer', 'inspector', 'village_officer', 'enterprise', 'farmer')
      );
  END IF;
END $$;

-- Cập nhật bù người tạo từ nhật ký thao tác: bản ghi hộ tự nhập trên cổng hộ dân và bản ghi cán bộ tạo trên trang quản trị.
-- Bật puc.rechaining để trigger niêm phong không tính lại chuỗi băm khi chỉ bổ sung siêu dữ liệu người tạo.
DO $$
BEGIN
  PERFORM set_config('puc.rechaining', 'on', true);

  UPDATE spray_records s
  SET recorded_by_role = 'farmer',
      created_by_user_id = COALESCE(s.created_by_user_id, a.user_id)
  FROM (
    SELECT DISTINCT ON (object) object, user_id
    FROM audit_logs
    WHERE action = 'Hộ ghi nhật ký phun thuốc' AND object LIKE 'Nhật ký phun thuốc #%'
    ORDER BY object, occurred_at ASC
  ) a
  WHERE s.recorded_by_role IS NULL
    AND a.object = 'Nhật ký phun thuốc #' || s.id::text;

  UPDATE spray_records s
  SET recorded_by_role = u.role,
      created_by_user_id = COALESCE(s.created_by_user_id, a.user_id)
  FROM (
    SELECT DISTINCT ON (object) object, user_id
    FROM audit_logs
    WHERE action = 'Tạo mới' AND object LIKE 'Nhật ký phun thuốc #%'
    ORDER BY object, occurred_at ASC
  ) a
  JOIN users u ON u.id = a.user_id
  WHERE s.recorded_by_role IS NULL
    AND a.object = 'Nhật ký phun thuốc #' || s.id::text;

  PERFORM set_config('puc.rechaining', 'off', true);
END $$;

CREATE INDEX IF NOT EXISTS spray_records_household_role_idx
  ON spray_records (household_id, recorded_by_role);

-- Chỉ mục tra cứu phạm vi doanh nghiệp: lô theo doanh nghiệp, đóng góp theo hộ và tệp gắn phiếu kiểm nghiệm / khai báo thu hoạch.
CREATE INDEX IF NOT EXISTS harvest_lots_enterprise_idx ON harvest_lots (enterprise_id);
CREATE INDEX IF NOT EXISTS lab_tests_scan_attachment_idx ON lab_tests (scan_attachment_id) WHERE scan_attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS harvest_decl_photo_idx ON harvest_declarations (photo_id) WHERE photo_id IS NOT NULL;
