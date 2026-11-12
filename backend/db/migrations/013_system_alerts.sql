-- 013_system_alerts.sql: bảng lưu thông báo khẩn / cảnh báo sự cố & bảo trì toàn hệ thống.

CREATE TABLE IF NOT EXISTS system_alerts (
  id BIGSERIAL PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('critical', 'warning')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'farmer', 'staff')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_alerts_active_idx ON system_alerts (active, created_at DESC);

