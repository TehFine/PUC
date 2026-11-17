-- 028_owasp_r2_hardening.sql
-- Gia cố bảo mật vòng 2 theo chuẩn OWASP Top 10:2021 và OWASP API Security Top 10:2023:
-- 1. Quản lý vòng đời phiên refresh_tokens: lưu thời điểm khởi tạo họ phiên (family_started_at), lý do thu hồi (revoked_reason)
--    và cờ xử lý tái sử dụng (reuse_handled) để giới hạn tuổi thọ tuyệt đối của phiên và chống tấn công từ chối dịch vụ (DoS)
--    bằng cách phát lại lặp đi lặp lại một refresh token đã đăng xuất.
-- 2. Ràng buộc trần thời gian cách ly PHI (isolation_days <= 365) trên spray_records và pesticides để chống tràn kiểu DATE (22008).
-- 3. Chỉ mục duy nhất cho khai báo mốc quy trình tuần tự (care_milestone_declarations) chống ghi trùng do cạnh tranh đồng thời.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS reuse_handled BOOLEAN NOT NULL DEFAULT false;

UPDATE refresh_tokens
SET family_started_at = created_at
WHERE family_started_at IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN family_started_at SET DEFAULT now(),
  ALTER COLUMN family_started_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_revoked_reason_check'
  ) THEN
    ALTER TABLE refresh_tokens
      ADD CONSTRAINT refresh_tokens_revoked_reason_check
      CHECK (
        revoked_reason IS NULL
        OR revoked_reason IN ('logout', 'rotated', 'security')
      );
  END IF;
END $$;

DO $$
BEGIN
  PERFORM set_config('puc.rechaining', 'on', true);

  UPDATE spray_records
  SET isolation_days = LEAST(365, GREATEST(0, isolation_days))
  WHERE isolation_days < 0 OR isolation_days > 365;

  PERFORM set_config('puc.rechaining', 'off', true);
END $$;

UPDATE pesticides
SET isolation_days = LEAST(365, GREATEST(0, isolation_days))
WHERE isolation_days < 0 OR isolation_days > 365;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spray_records_isolation_days_max_check'
  ) THEN
    ALTER TABLE spray_records
      ADD CONSTRAINT spray_records_isolation_days_max_check
      CHECK (isolation_days >= 0 AND isolation_days <= 365);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pesticides_isolation_days_max_check'
  ) THEN
    ALTER TABLE pesticides
      ADD CONSTRAINT pesticides_isolation_days_max_check
      CHECK (isolation_days >= 0 AND isolation_days <= 365);
  END IF;
END $$;

DELETE FROM care_milestone_declarations a
USING care_milestone_declarations b
WHERE a.is_senpro = false
  AND b.is_senpro = false
  AND a.plan_id = b.plan_id
  AND a.milestone_code = b.milestone_code
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS care_milestone_decl_plan_seq_uniq
  ON care_milestone_declarations (plan_id, milestone_code)
  WHERE is_senpro = false;

