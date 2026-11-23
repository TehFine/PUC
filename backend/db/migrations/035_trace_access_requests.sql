-- 035_trace_access_requests.sql
-- Yêu cầu cấp quyền xem hồ sơ truy xuất & đánh giá đột xuất từ hiện trường (Đoàn công tác / Thanh tra / Đối tác chưa báo trước)
CREATE TABLE IF NOT EXISTS trace_access_requests (
  id BIGSERIAL PRIMARY KEY,
  request_code TEXT NOT NULL UNIQUE,
  request_secret_hash TEXT NOT NULL,
  requester_user_id BIGINT REFERENCES users(id) ON DELETE
  SET NULL,
    requester_username TEXT,
    requester_role TEXT,
    requester_name TEXT NOT NULL,
    organization TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    purpose TEXT NOT NULL,
    scanned_code TEXT NOT NULL,
    target_kind TEXT NOT NULL DEFAULT 'lot' CHECK (target_kind IN ('lot', 'box', 'fruit', 'plot')),
    resolved_lot_code TEXT,
    puc_code TEXT,
    requested_tier TEXT NOT NULL DEFAULT 'enterprise' CHECK (requested_tier IN ('enterprise', 'authority')),
    granted_tier TEXT CHECK (granted_tier IN ('enterprise', 'authority')),
    scope_mode TEXT NOT NULL DEFAULT 'zone' CHECK (scope_mode IN ('record', 'zone', 'coop')),
    duration_hours INT NOT NULL DEFAULT 24 CHECK (
      duration_hours BETWEEN 1 AND 336
    ),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
      status IN ('pending', 'approved', 'rejected', 'revoked')
    ),
    granted_pass_token TEXT UNIQUE,
    expires_at TIMESTAMPTZ,
    reviewed_by BIGINT REFERENCES users(id) ON DELETE
  SET NULL,
    reviewed_by_name TEXT,
    reviewed_by_role TEXT,
    review_note TEXT,
    reviewed_at TIMESTAMPTZ,
    ip TEXT,
    user_agent TEXT,
    access_count INT NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trace_access_requests_status_created ON trace_access_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_access_requests_user_status ON trace_access_requests (requester_user_id, status)
WHERE requester_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trace_access_requests_token ON trace_access_requests (granted_pass_token)
WHERE granted_pass_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trace_access_requests_scanned ON trace_access_requests (upper(scanned_code), status);