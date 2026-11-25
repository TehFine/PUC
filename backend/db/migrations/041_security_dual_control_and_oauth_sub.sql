-- 041_security_dual_control_and_oauth_sub.sql
-- Lưu vết người tạo/đặt lại thông tin xác thực để bảo vệ chốt phê duyệt chéo Phó HTX, cố định địa bàn xã của thôn và định danh bất biến Google OAuth sub

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_by BIGINT,
  ADD COLUMN IF NOT EXISTS credential_reset_by BIGINT,
  ADD COLUMN IF NOT EXISTS credential_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

ALTER TABLE villages
  ADD COLUMN IF NOT EXISTS commune_location TEXT;

UPDATE villages
SET commune_location = CASE
  WHEN name ~* '(ea\s*kh(a|ă)l|ea\s*k''?s(o|ô))' THEN 'Xã Ea Khăl, tỉnh Đắk Lắk'
  ELSE 'Xã Krông Búk, tỉnh Đắk Lắk'
END
WHERE commune_location IS NULL;
