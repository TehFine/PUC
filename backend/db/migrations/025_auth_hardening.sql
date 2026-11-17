-- 025_auth_hardening.sql
-- Gia cố xác thực (SEC-08, SEC-13, SEC-17, SEC-19):
-- 1. Bộ đếm nhập sai OTP cấp người dùng (không bị xóa khi qua bước mật khẩu) để khóa dò mã 2 lớp qua nhiều phiên song song.
-- 2. Tách khóa thử lại khôi phục mật khẩu bằng CCCD khỏi khóa đăng nhập chính users.locked_until.
-- 3. Gỡ email chưa xác minh khỏi các đăng ký tự khai chờ duyệt (tạo trước bản vá), tránh mở đăng nhập Google cho email lạ khi duyệt.
-- 4. Lưu dấu vân tay SHA-256 của nội dung yêu cầu cho X-Idempotency-Key.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_failed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cccd_reset_failed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cccd_reset_locked_until TIMESTAMPTZ;

UPDATE users
SET email = NULL
WHERE status = 'pending'
  AND role = 'farmer'
  AND email IS NOT NULL;

-- Mỗi tài khoản chỉ giữ một thử thách OTP còn hiệu lực: vô hiệu các thử thách cũ đang mở song song.
UPDATE auth_otp_challenges c
SET consumed_at = now()
WHERE c.consumed_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM auth_otp_challenges newer
    WHERE newer.user_id = c.user_id
      AND newer.consumed_at IS NULL
      AND newer.id > c.id
  );

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idem_key VARCHAR(80) NOT NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(200) NOT NULL,
  status_code INTEGER NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idem_key)
);

ALTER TABLE api_idempotency_keys
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64);
