-- 011_security_hardening.sql: củng cố bảo mật phiên đăng nhập, yêu cầu đặt lại mật khẩu và dọn email giả định chưa xác minh

-- 1. Phiên bản token (token_version) để thu hồi tức thì JWT hiện hành khi đổi mật khẩu, đăng xuất hoặc khóa tài khoản
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- 2. Hạn hiệu lực 24h cho yêu cầu cấp lại mật khẩu chờ cán bộ duyệt
ALTER TABLE password_reset_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours');

-- 3. Gỡ bỏ các địa chỉ @gmail.com tự sinh chưa xác minh chủ sở hữu từ migration 009 / cấp tài khoản tự động
UPDATE users
SET email = NULL
WHERE email IS NOT NULL
  AND (
    lower(email) ~ '^nongho\.[0-9]+@gmail\.com$'
    OR lower(email) LIKE '%.htxcune@gmail.com'
  );

-- 4. Chỉ ràng buộc duy nhất email trên các tài khoản đã kích hoạt/khóa để tài khoản pending chưa duyệt không thể chiếm chỗ email thật
DROP INDEX IF EXISTS users_email_lower_idx;
CREATE UNIQUE INDEX users_email_lower_idx
  ON users (lower(email))
  WHERE email IS NOT NULL AND status <> 'pending';

