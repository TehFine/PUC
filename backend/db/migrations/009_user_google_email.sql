-- 009_user_google_email.sql: bổ sung cột email liên kết Google cho bảng users

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
  ON users (lower(email))
  WHERE email IS NOT NULL;

-- Gán email Google mặc định cho các tài khoản hiện có chưa có email để sẵn sàng đối chiếu đăng nhập Google
UPDATE users
SET email = CASE
  WHEN role = 'admin' THEN 'trandangsau.htxcune@gmail.com'
  WHEN username ~ '^0[0-9]{9}$' THEN 'nongho.' || username || '@gmail.com'
  ELSE lower(regexp_replace(username, '[^a-zA-Z0-9._-]', '', 'g')) || '.htxcune@gmail.com'
END
WHERE email IS NULL;

