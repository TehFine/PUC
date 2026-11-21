-- 033_sanitize_audit_log_details.sql
-- Làm sạch các dòng nhật ký lịch sử có chứa danh sách tên cột nội bộ (Trường: ...),
-- chuỗi JSON bộ lọc thô hoặc tên bảng tiếng Anh để không lộ lược đồ CSDL.

UPDATE audit_logs
SET detail = 'Đã cập nhật thông tin hồ sơ'
WHERE detail ~* '^Trường\s*:';

UPDATE audit_logs
SET detail = 'Đã áp dụng bộ lọc thời gian và phạm vi quản lý'
WHERE detail ~ '^\s*\{.*\}\s*$'
   OR detail ~* 'bộ lọc:\s*\{.*\}\s*$';

UPDATE audit_logs
SET detail = 'Đã lưu tệp minh chứng'
WHERE detail ~* '^[a-z0-9.+-]+/[a-z0-9.+-]+\s*\(\d+\s*bytes\)$';

UPDATE audit_logs
SET object = CASE object
  WHEN 'Báo cáo households' THEN 'Báo cáo hộ nông dân'
  WHEN 'Báo cáo journal' THEN 'Báo cáo nhật ký canh tác'
  WHEN 'Báo cáo spray' THEN 'Báo cáo nhật ký phun thuốc'
  WHEN 'Báo cáo lab-tests' THEN 'Báo cáo kiểm nghiệm'
  WHEN 'Báo cáo violations' THEN 'Báo cáo vi phạm'
  WHEN 'Báo cáo harvest' THEN 'Báo cáo thu hoạch'
  WHEN 'Báo cáo training-registrations' THEN 'Báo cáo tập huấn'
  ELSE object
END
WHERE object IN (
  'Báo cáo households',
  'Báo cáo journal',
  'Báo cáo spray',
  'Báo cáo lab-tests',
  'Báo cáo violations',
  'Báo cáo harvest',
  'Báo cáo training-registrations'
);

UPDATE audit_logs
SET object = regexp_replace(object, '^Tệp #(\d+)\s*\([a-z_-]+\)$', 'Tệp đính kèm #\1', 'i')
WHERE object ~* '^Tệp #\d+\s*\([a-z_-]+\)$';

