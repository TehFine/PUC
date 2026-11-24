-- 040_trace_device_request_guard.sql
-- Gắn định danh thiết bị cho yêu cầu cấp quyền xem hồ sơ QR và bảng theo dõi cảnh báo / tạm khóa thiết bị 5 phút khi cố tình gửi lặp

ALTER TABLE trace_access_requests
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_trace_access_requests_device_status
  ON trace_access_requests (device_fingerprint, status)
  WHERE device_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS trace_device_guards (
  device_key TEXT PRIMARY KEY,
  strike_count INT NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  last_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trace_device_guards_blocked
  ON trace_device_guards (blocked_until)
  WHERE blocked_until IS NOT NULL;

