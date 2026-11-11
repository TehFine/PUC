-- 012_household_avatar.sql: ảnh đại diện hồ sơ nông hộ phục vụ Cổng hộ dân và màn hình Truy xuất nguồn gốc công khai

-- 1. Mở rộng mục đích tệp đính kèm cho ảnh đại diện hộ ('avatar')
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_purpose_check;
ALTER TABLE attachments
  ADD CONSTRAINT attachments_purpose_check
  CHECK (purpose IN ('journal', 'harvest', 'stamp', 'approval', 'violation', 'news', 'catalog', 'avatar'));

-- 2. Liên kết ảnh đại diện trực tiếp vào bảng nông hộ
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS avatar_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL;

