-- 032_system_alert_info_severity.sql: mở rộng mức độ thông báo hệ thống thêm 'info' (thông báo Ban quản trị / cập nhật hệ thống).

ALTER TABLE system_alerts DROP CONSTRAINT IF EXISTS system_alerts_severity_check;
ALTER TABLE system_alerts
  ADD CONSTRAINT system_alerts_severity_check
  CHECK (severity IN ('critical', 'warning', 'info'));

