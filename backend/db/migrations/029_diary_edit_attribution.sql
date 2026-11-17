-- 029_diary_edit_attribution.sql
-- Ghi nhận rõ người chỉnh sửa, vai trò, thời điểm và số lần chỉnh sửa trên nhật ký canh tác (journal_entries)
-- và nhật ký phun thuốc (spray_records). Giữ nguyên chuỗi băm SHA-256 đã niêm phong khi cập nhật bù lịch sử từ audit_logs.

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_role TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_updated_by_role_check'
  ) THEN
    ALTER TABLE journal_entries
      ADD CONSTRAINT journal_entries_updated_by_role_check
      CHECK (
        updated_by_role IS NULL
        OR updated_by_role IN ('admin', 'htx_officer', 'inspector', 'village_officer', 'enterprise', 'farmer')
      );
  END IF;
END $$;

ALTER TABLE spray_records
  ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_role TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spray_records_updated_by_role_check'
  ) THEN
    ALTER TABLE spray_records
      ADD CONSTRAINT spray_records_updated_by_role_check
      CHECK (
        updated_by_role IS NULL
        OR updated_by_role IN ('admin', 'htx_officer', 'inspector', 'village_officer', 'enterprise', 'farmer')
      );
  END IF;
END $$;

-- Cập nhật bù thông tin người sửa gần nhất và tổng số lần sửa từ audit_logs (không làm đổi mã băm đã niêm phong).
DO $$
BEGIN
  PERFORM set_config('puc.rechaining', 'on', true);

  UPDATE journal_entries j
  SET updated_by_user_id = s.user_id,
      updated_by_name = COALESCE(u.full_name, s.user_name),
      updated_by_role = u.role,
      updated_at = s.occurred_at,
      edit_count = s.cnt
  FROM (
    SELECT DISTINCT ON (object)
           object,
           user_id,
           user_name,
           occurred_at,
           count(*) OVER (PARTITION BY object)::int AS cnt
    FROM audit_logs
    WHERE action IN ('Cập nhật', 'Chỉnh sửa nhật ký')
      AND object LIKE 'Nhật ký canh tác #%'
    ORDER BY object, occurred_at DESC
  ) s
  LEFT JOIN users u ON u.id = s.user_id
  WHERE j.updated_at IS NULL
    AND s.object = 'Nhật ký canh tác #' || j.id::text;

  UPDATE spray_records sp
  SET updated_by_user_id = s.user_id,
      updated_by_name = COALESCE(u.full_name, s.user_name),
      updated_by_role = u.role,
      updated_at = s.occurred_at,
      edit_count = s.cnt
  FROM (
    SELECT DISTINCT ON (object)
           object,
           user_id,
           user_name,
           occurred_at,
           count(*) OVER (PARTITION BY object)::int AS cnt
    FROM audit_logs
    WHERE action IN ('Cập nhật', 'Chỉnh sửa nhật ký phun thuốc')
      AND object LIKE 'Nhật ký phun thuốc #%'
    ORDER BY object, occurred_at DESC
  ) s
  LEFT JOIN users u ON u.id = s.user_id
  WHERE sp.updated_at IS NULL
    AND s.object = 'Nhật ký phun thuốc #' || sp.id::text;

  PERFORM set_config('puc.rechaining', 'off', true);
END $$;
