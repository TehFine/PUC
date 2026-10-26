-- 004_registration.sql: hộ dân tự đăng ký tài khoản, chờ cán bộ HTX duyệt và gắn với hộ

ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'locked', 'pending'));

-- Ghi chú người đăng ký nhập khi tự đăng ký (ví dụ mã hộ, tên chủ vườn) để cán bộ đối chiếu.
ALTER TABLE users ADD COLUMN register_note TEXT;

CREATE INDEX users_pending_idx ON users (created_at) WHERE status = 'pending';
