-- 016_scoped_trace_access_and_2fa.sql:
-- 1. Phạm vi truy xuất theo tài khoản (ABAC/Scope): doanh nghiệp sở hữu cơ sở đóng gói (enterprise_id),
--    xã phân công cho cán bộ xã (assigned_commune), địa bàn phân công cho Chi cục/Thanh tra (assigned_region),
--    và mã HTX quản lý (coop_code).
-- 2. Xác thực 2 lớp (TOTP RFC 6238 + mã dự phòng băm SHA-256) và bảng thử thách OTP bước 2 (auth_otp_challenges).
-- 3. Nhật ký minh bạch mọi lượt xem chi tiết lô hàng (trace_detail_access_logs) phục vụ hậu kiểm.

-- 1. Mở rộng phạm vi quản lý & bảo mật 2 lớp trên bảng users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS enterprise_id BIGINT REFERENCES enterprises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_commune TEXT,
  ADD COLUMN IF NOT EXISTS assigned_region TEXT,
  ADD COLUMN IF NOT EXISTS coop_code TEXT NOT NULL DEFAULT 'HTX-CUNE',
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_pending_secret TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS users_enterprise_idx
  ON users (enterprise_id)
  WHERE enterprise_id IS NOT NULL;

-- Gán địa bàn mặc định cấp tỉnh cho tài khoản Thanh tra/Chi cục hiện có chưa cấu hình vùng
UPDATE users
SET assigned_region = 'Tỉnh Đắk Lắk'
WHERE role = 'inspector' AND assigned_region IS NULL;

-- 2. Mã HTX quản lý trên bảng harvest_lots để kiểm tra phạm vi Quản trị / Cán bộ HTX
ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS coop_code TEXT NOT NULL DEFAULT 'HTX-CUNE';

CREATE INDEX IF NOT EXISTS harvest_lots_coop_code_idx
  ON harvest_lots (coop_code);

-- Theo dõi thời điểm hoạt động gần nhất của phiên đăng nhập phục vụ quản lý đăng xuất từ xa
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Bảng thử thách OTP bước 2 khi đăng nhập tài khoản bật xác thực 2 lớp (TTL 5 phút, tối đa 5 lần thử)
CREATE TABLE IF NOT EXISTS auth_otp_challenges (
  id BIGSERIAL PRIMARY KEY,
  challenge_token_hash TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_method TEXT NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password', 'google')),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at TIMESTAMPTZ,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_otp_challenges_user_idx
  ON auth_otp_challenges (user_id, created_at DESC);

-- 4. Nhật ký minh bạch mọi lượt truy cập dữ liệu chi tiết QR (ghi rõ ai, vai trò, lô nào, lúc nào, kết quả phạm vi)
CREATE TABLE IF NOT EXISTS trace_detail_access_logs (
  id BIGSERIAL PRIMARY KEY,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  full_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  viewer_tier TEXT NOT NULL CHECK (viewer_tier IN ('public', 'enterprise', 'authority')),
  scanned_code TEXT NOT NULL,
  lot_code TEXT,
  scope_granted BOOLEAN NOT NULL DEFAULT true,
  scope_reason TEXT,
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS trace_detail_access_logs_lot_idx
  ON trace_detail_access_logs (upper(COALESCE(lot_code, scanned_code)), viewed_at DESC);

CREATE INDEX IF NOT EXISTS trace_detail_access_logs_user_idx
  ON trace_detail_access_logs (user_id, viewed_at DESC);

