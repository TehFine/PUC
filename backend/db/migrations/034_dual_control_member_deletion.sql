-- 034_dual_control_member_deletion.sql
-- Cơ chế kiểm soát chéo 2 lớp (Dual-Control): Quản trị viên / Trưởng HTX muốn xóa tài khoản hoặc hộ thành viên
-- phải gửi yêu cầu và chỉ được thực thi sau khi Phó HTX (htx_deputy) phê duyệt.

CREATE TABLE IF NOT EXISTS member_deletion_requests (
  id                BIGSERIAL PRIMARY KEY,
  target_type       TEXT NOT NULL CHECK (target_type IN ('account', 'household')),
  target_id         BIGINT NOT NULL,
  target_name       TEXT NOT NULL,
  target_code       TEXT NOT NULL,
  target_role       TEXT,
  reason            TEXT,
  requested_by      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_name TEXT NOT NULL,
  requested_by_role TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_name  TEXT,
  review_note       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_deletion_requests_pending_target
  ON member_deletion_requests (target_type, target_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_member_deletion_requests_status_created
  ON member_deletion_requests (status, created_at DESC);

