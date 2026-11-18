-- 030_htx_leadership_and_support_roles.sql
-- Bổ sung 3 vai trò điều hành và hỗ trợ kỹ thuật vào hệ thống:
--   1. htx_head            : Trưởng HTX (Ông Trần Đăng Sáu - 0982576648)
--   2. htx_deputy          : Phó HTX (Ông Đặng Văn Thêm - 0394564316)
--   3. support_specialist  : Chuyên viên hỗ trợ hệ thống (Đặng Xuân Thắng - 0868060594)

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (
    role IN (
      'admin',
      'htx_head',
      'htx_deputy',
      'support_specialist',
      'htx_officer',
      'inspector',
      'village_officer',
      'enterprise',
      'farmer'
    )
  );

ALTER TABLE spray_records DROP CONSTRAINT IF EXISTS spray_records_recorded_by_role_check;
ALTER TABLE spray_records
  ADD CONSTRAINT spray_records_recorded_by_role_check
  CHECK (
    recorded_by_role IS NULL
    OR recorded_by_role IN (
      'admin',
      'htx_head',
      'htx_deputy',
      'support_specialist',
      'htx_officer',
      'inspector',
      'village_officer',
      'enterprise',
      'farmer'
    )
  );

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_updated_by_role_check;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_updated_by_role_check
  CHECK (
    updated_by_role IS NULL
    OR updated_by_role IN (
      'admin',
      'htx_head',
      'htx_deputy',
      'support_specialist',
      'htx_officer',
      'inspector',
      'village_officer',
      'enterprise',
      'farmer'
    )
  );

ALTER TABLE spray_records DROP CONSTRAINT IF EXISTS spray_records_updated_by_role_check;
ALTER TABLE spray_records
  ADD CONSTRAINT spray_records_updated_by_role_check
  CHECK (
    updated_by_role IS NULL
    OR updated_by_role IN (
      'admin',
      'htx_head',
      'htx_deputy',
      'support_specialist',
      'htx_officer',
      'inspector',
      'village_officer',
      'enterprise',
      'farmer'
    )
  );

-- Chỉ cập nhật/cấp tài khoản trên CSDL thực tế đã nạp dữ liệu HTX (tránh chèn sớm vào CSDL kiểm thử rỗng trước bước seed).
DO $$
DECLARE
  v_head_id BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM users WHERE username IN ('0982576648', '0394564316')
  ) THEN
    -- 1. Ông Trần Đăng Sáu -> Trưởng HTX (htx_head)
    UPDATE users
    SET role = 'htx_head',
        household_id = NULL,
        coop_code = COALESCE(NULLIF(btrim(coop_code), ''), 'HTX-CUNE'),
        status = 'active',
        token_version = token_version + 1,
        updated_at = now()
    WHERE username = '0982576648'
      AND status <> 'pending'
    RETURNING id INTO v_head_id;

    -- 2. Ông Đặng Văn Thêm -> Phó HTX (htx_deputy), giữ nguyên hồ sơ hộ canh tác trong bảng households
    UPDATE users
    SET role = 'htx_deputy',
        household_id = NULL,
        coop_code = COALESCE(NULLIF(btrim(coop_code), ''), 'HTX-CUNE'),
        status = 'active',
        token_version = token_version + 1,
        updated_at = now()
    WHERE username = '0394564316'
      AND status <> 'pending';

    -- 3. Ông Đặng Xuân Thắng -> Chuyên viên hỗ trợ hệ thống (support_specialist) nếu tài khoản đã được tạo
    UPDATE users
    SET role = 'support_specialist',
        household_id = NULL,
        coop_code = COALESCE(NULLIF(btrim(coop_code), ''), 'HTX-CUNE'),
        status = 'active',
        token_version = token_version + 1,
        updated_at = now()
    WHERE username = '0868060594'
      AND status <> 'pending';

    -- Thu hồi phiên cũ của tài khoản vừa chuyển đổi vai trò để nhận token phân quyền mới khi truy cập
    UPDATE refresh_tokens
    SET revoked_at = now()
    WHERE revoked_at IS NULL
      AND user_id IN (
        SELECT id FROM users WHERE username IN ('0982576648', '0394564316', '0868060594')
      );

    INSERT INTO audit_logs (user_id, user_name, ip, action, object, detail)
    VALUES (
      v_head_id,
      'Quản trị hệ thống',
      '127.0.0.1',
      'Phân quyền ban điều hành và hỗ trợ',
      'HTX-CUNE',
      'Cập nhật Trần Đăng Sáu (0982576648) -> Trưởng HTX, Đặng Văn Thêm (0394564316) -> Phó HTX, Đặng Xuân Thắng (0868060594) -> Chuyên viên hỗ trợ hệ thống'
    );
  END IF;
END $$;

