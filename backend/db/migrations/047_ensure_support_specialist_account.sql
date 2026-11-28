-- 047_ensure_support_specialist_account.sql
-- Đảm bảo tài khoản Chuyên viên hỗ trợ kỹ thuật Đặng Xuân Thắng (0868060594) tồn tại, hoạt động và cập nhật mã băm mật khẩu mới trên CSDL thực tế.

DO $$
DECLARE
  v_user_id BIGINT;
  v_pw_hash CONSTANT TEXT := '$2b$12$Ed8fcCV/WnLtX7RBPKA9pu7Yk0teI.If0lXqVgFjFWtvexKZf9viq';
BEGIN
  IF EXISTS (
    SELECT 1 FROM users WHERE username IN ('0982576648', '0394564316')
  ) THEN
    UPDATE users
    SET full_name = 'Đặng Xuân Thắng',
        username = '0868060594',
        password_hash = v_pw_hash,
        role = 'support_specialist',
        status = 'active',
        household_id = NULL,
        coop_code = COALESCE(NULLIF(btrim(coop_code), ''), 'HTX-CUNE'),
        failed_login_count = 0,
        locked_until = NULL,
        two_factor_enabled = false,
        two_factor_secret = NULL,
        two_factor_pending_secret = NULL,
        two_factor_backup_codes = '[]'::jsonb,
        two_factor_failed_count = 0,
        token_version = token_version + 1,
        credential_reset_at = now(),
        updated_at = now()
    WHERE lower(btrim(username)) = '0868060594'
    RETURNING id INTO v_user_id;

    IF v_user_id IS NULL THEN
      INSERT INTO users (
        full_name,
        username,
        password_hash,
        role,
        status,
        coop_code,
        failed_login_count,
        locked_until,
        two_factor_enabled,
        two_factor_backup_codes,
        credential_reset_at
      )
      VALUES (
        'Đặng Xuân Thắng',
        '0868060594',
        v_pw_hash,
        'support_specialist',
        'active',
        'HTX-CUNE',
        0,
        NULL,
        false,
        '[]'::jsonb,
        now()
      )
      RETURNING id INTO v_user_id;
    END IF;

    UPDATE refresh_tokens
    SET revoked_at = now()
    WHERE user_id = v_user_id
      AND revoked_at IS NULL;

    INSERT INTO audit_logs (user_id, user_name, ip, action, object, detail)
    VALUES (
      v_user_id,
      'Quản trị hệ thống',
      '127.0.0.1',
      'Cập nhật thông tin xác thực',
      '0868060594',
      'Khởi tạo và đặt lại mật khẩu tài khoản Chuyên viên hỗ trợ hệ thống Đặng Xuân Thắng (0868060594)'
    );
  END IF;
END $$;

