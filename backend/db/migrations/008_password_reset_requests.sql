-- 008_password_reset_requests.sql: yêu cầu cấp lại mật khẩu chờ cán bộ HTX / quản trị viên duyệt

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  full_name TEXT NOT NULL,
  new_password_hash TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  request_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_requests_pending_idx
  ON password_reset_requests (created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS password_reset_requests_user_idx
  ON password_reset_requests (user_id);

DROP TRIGGER IF EXISTS password_reset_requests_set_updated_at ON password_reset_requests;
CREATE TRIGGER password_reset_requests_set_updated_at
  BEFORE UPDATE ON password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

