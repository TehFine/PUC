-- 019_security_hardening.sql:
-- Gia cố bảo mật toàn diện lược đồ CSDL:
-- 1. Token ngẫu nhiên không tuần tự cho tệp đính kèm (attachments.public_token).
-- 2. Chống phát lại mã TOTP 2 lớp (users.two_factor_last_used_step) & định danh không phân biệt hoa-thường.
-- 3. Khóa yêu cầu cấp lại mật khẩu chờ duyệt (password_reset_requests): bỏ bắt buộc new_password_hash & chỉ 1 pending/user.
-- 4. Gắn thôn chuẩn hóa cho biên bản kiểm tra (inspection_minutes.village_id) thay thế ILIKE tên thôn.
-- 5. Khóa ngoại ON DELETE RESTRICT cho các bảng bằng chứng kiểm nghiệm, nhật ký, tem & thu hoạch chống xóa lan truyền.
-- 6. Ràng buộc diện tích dương (plots.area_ha > 0), chuẩn hóa mã không phân biệt hoa-thường.
-- 7. Gia cố chuỗi băm SHA-256: khóa tư vấn giao dịch (pg_advisory_xact_lock), thoát ký tự '|' và chống giả mạo thời gian khi sửa.

-- ============================================================================
-- 1. Token công khai ngẫu nhiên cho attachments (chống dò quét ID tuần tự)
-- ============================================================================
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS public_token TEXT;

UPDATE attachments
SET public_token = puc_random_qr_token(20)
WHERE public_token IS NULL OR btrim(public_token) = '';

ALTER TABLE attachments
  ALTER COLUMN public_token SET DEFAULT puc_random_qr_token(20);

ALTER TABLE attachments
  ALTER COLUMN public_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attachments_public_token_idx
  ON attachments (public_token);

-- Cập nhật các đường dẫn công khai cũ lưu cứng dạng '/api/public/files/<id>' sang '/api/public/files/<public_token>'
UPDATE news_articles na
SET image_url = '/api/public/files/' || a.public_token
FROM attachments a
WHERE na.image_url = '/api/public/files/' || a.id::text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pesticides' AND column_name = 'image_url'
  ) THEN
    EXECUTE $sql$
      UPDATE pesticides t
      SET image_url = '/api/public/files/' || a.public_token
      FROM attachments a
      WHERE t.image_url = '/api/public/files/' || a.id::text
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fertilizers' AND column_name = 'image_url'
  ) THEN
    EXECUTE $sql$
      UPDATE fertilizers t
      SET image_url = '/api/public/files/' || a.public_token
      FROM attachments a
      WHERE t.image_url = '/api/public/files/' || a.id::text
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'varieties' AND column_name = 'image_url'
  ) THEN
    EXECUTE $sql$
      UPDATE varieties t
      SET image_url = '/api/public/files/' || a.public_token
      FROM attachments a
      WHERE t.image_url = '/api/public/files/' || a.id::text
    $sql$;
  END IF;
END $$;

-- ============================================================================
-- 2. Chống phát lại TOTP 2FA & chuẩn hóa định danh tài khoản không phân biệt hoa-thường
-- ============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_last_used_step BIGINT;

UPDATE users
SET username = btrim(username)
WHERE username <> btrim(username);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
  ON users (lower(username));

-- ============================================================================
-- 3. Gia cố bảng yêu cầu cấp lại mật khẩu (password_reset_requests)
-- ============================================================================
ALTER TABLE password_reset_requests
  ALTER COLUMN new_password_hash DROP NOT NULL;

UPDATE password_reset_requests
SET status = 'rejected',
    reviewed_at = COALESCE(reviewed_at, now())
WHERE status = 'pending'
  AND id NOT IN (
    SELECT MAX(id)
    FROM password_reset_requests
    WHERE status = 'pending'
    GROUP BY user_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_requests_pending_user_idx
  ON password_reset_requests (user_id)
  WHERE status = 'pending';

-- ============================================================================
-- 4. Khóa thôn chuẩn hóa cho biên bản kiểm tra (inspection_minutes.village_id)
-- ============================================================================
ALTER TABLE inspection_minutes
  ADD COLUMN IF NOT EXISTS village_id BIGINT REFERENCES villages(id) ON DELETE SET NULL;

UPDATE inspection_minutes im
SET village_id = h.village_id
FROM households h
WHERE im.household_id = h.id
  AND im.village_id IS NULL;

UPDATE inspection_minutes im
SET village_id = v.id
FROM villages v
WHERE im.village_id IS NULL
  AND (
    lower(btrim(im.location)) = lower(btrim(v.name))
    OR im.location ILIKE v.name || ',%'
    OR im.location ILIKE v.name || ' -%'
    OR im.location ILIKE '%- ' || v.name
  );

CREATE INDEX IF NOT EXISTS inspection_minutes_village_idx
  ON inspection_minutes (village_id);

-- ============================================================================
-- 5. Chỉ mục duy nhất không phân biệt hoa-thường & ràng buộc hình học PostGIS
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS farmer_stamps_serial_upper_unique
  ON farmer_stamps (upper(serial_code));

CREATE UNIQUE INDEX IF NOT EXISTS harvest_lots_code_upper_unique
  ON harvest_lots (upper(code));

UPDATE harvest_lots
SET qr_code = NULL
WHERE qr_code IS NOT NULL AND btrim(qr_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS harvest_lots_qr_code_upper_unique
  ON harvest_lots (upper(btrim(qr_code)))
  WHERE qr_code IS NOT NULL AND btrim(qr_code) <> '';

-- Khử trùng lặp nếu cùng hộ có 2 bản ghi plot_care_plans chỉ khác hoa-thường
DELETE FROM plot_care_plans a
USING plot_care_plans b
WHERE a.id > b.id
  AND a.household_id = b.household_id
  AND a.season = b.season
  AND upper(btrim(a.plot_code)) = upper(btrim(b.plot_code));

UPDATE plot_care_plans
SET plot_code = upper(btrim(plot_code))
WHERE plot_code <> upper(btrim(plot_code));

CREATE UNIQUE INDEX IF NOT EXISTS plot_care_plans_hh_plot_upper_season_idx
  ON plot_care_plans (household_id, upper(plot_code), season);

DO $$
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE plots
      SET area_ha = GREATEST(0.01, ROUND((ST_Area(ST_MakeValid(geom)::geography) / 10000.0)::numeric, 4))
      WHERE area_ha IS NULL OR area_ha <= 0
    $sql$;

    EXECUTE 'ALTER TABLE plots DROP CONSTRAINT IF EXISTS plots_area_ha_positive_check';
    EXECUTE 'ALTER TABLE plots ADD CONSTRAINT plots_area_ha_positive_check CHECK (area_ha > 0)';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS plots_code_upper_unique ON plots (upper(code))';
  END IF;
END $$;

-- ============================================================================
-- 6. Đổi khóa ngoại từ ON DELETE CASCADE sang ON DELETE RESTRICT trên bảng bằng chứng
-- ============================================================================
DO $$
DECLARE
  v_tbl TEXT;
  v_con RECORD;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'journal_entries',
    'spray_records',
    'lab_tests',
    'farmer_stamp_allocations',
    'farmer_stamps',
    'harvest_contributions',
    'harvest_declarations',
    'plot_season_quotas',
    'care_milestone_declarations'
  ] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      FOR v_con IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = ('public.' || v_tbl)::regclass
          AND c.confrelid = 'public.households'::regclass
          AND c.contype = 'f'
          AND a.attname = 'household_id'
          AND c.confdeltype <> 'r'
      LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', v_tbl, v_con.conname);
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT',
          v_tbl,
          v_tbl || '_household_id_fkey'
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 7. Gia cố chuỗi băm bất biến SHA-256 (thoát '|', khóa tuần tự giao dịch, chống giả thời gian sửa)
-- ============================================================================
CREATE OR REPLACE FUNCTION puc_escape_ledger_part(p_val TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(btrim(COALESCE(p_val, '')), '|', '%7C');
$$;

CREATE OR REPLACE FUNCTION puc_rechain_journal_household(p_household_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_prev TEXT := NULL;
  v_hash TEXT;
  v_payload TEXT;
BEGIN
  IF p_household_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('puc_journal_chain'), p_household_id::int);
  PERFORM set_config('puc.rechaining', 'on', true);
  FOR r IN
    SELECT id, household_id, entry_on, plot_code, activity, recorder, is_late_entry, server_recorded_at, prev_hash, record_hash
    FROM journal_entries
    WHERE household_id = p_household_id
    ORDER BY id ASC
  LOOP
    v_payload := concat_ws(
      '|',
      'JOURNAL-V1',
      COALESCE(v_prev, 'GENESIS'),
      COALESCE(r.household_id::text, '0'),
      to_char(r.entry_on, 'YYYY-MM-DD'),
      upper(puc_escape_ledger_part(r.plot_code)),
      puc_escape_ledger_part(r.activity),
      puc_escape_ledger_part(r.recorder),
      CASE WHEN r.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
      floor(extract(epoch from r.server_recorded_at))::bigint::text
    );
    v_hash := puc_compute_ledger_hash(v_payload);
    IF r.prev_hash IS DISTINCT FROM v_prev OR r.record_hash IS DISTINCT FROM v_hash THEN
      UPDATE journal_entries
      SET prev_hash = v_prev,
          record_hash = v_hash
      WHERE id = r.id;
    END IF;
    v_prev := v_hash;
  END LOOP;
  PERFORM set_config('puc.rechaining', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION puc_rechain_spray_household(p_household_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_prev TEXT := NULL;
  v_hash TEXT;
  v_payload TEXT;
BEGIN
  IF p_household_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('puc_spray_chain'), p_household_id::int);
  PERFORM set_config('puc.rechaining', 'on', true);
  FOR r IN
    SELECT id, household_id, sprayed_on, plot_code, pesticide_id, dose, isolation_days, mrl_status, is_late_entry, server_recorded_at, prev_hash, record_hash
    FROM spray_records
    WHERE household_id = p_household_id
    ORDER BY id ASC
  LOOP
    v_payload := concat_ws(
      '|',
      'SPRAY-V1',
      COALESCE(v_prev, 'GENESIS'),
      COALESCE(r.household_id::text, '0'),
      to_char(r.sprayed_on, 'YYYY-MM-DD'),
      upper(puc_escape_ledger_part(r.plot_code)),
      COALESCE(r.pesticide_id::text, '0'),
      puc_escape_ledger_part(r.dose),
      COALESCE(r.isolation_days::text, '0'),
      puc_escape_ledger_part(r.mrl_status),
      CASE WHEN r.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
      floor(extract(epoch from r.server_recorded_at))::bigint::text
    );
    v_hash := puc_compute_ledger_hash(v_payload);
    IF r.prev_hash IS DISTINCT FROM v_prev OR r.record_hash IS DISTINCT FROM v_hash THEN
      UPDATE spray_records
      SET prev_hash = v_prev,
          record_hash = v_hash
      WHERE id = r.id;
    END IF;
    v_prev := v_hash;
  END LOOP;
  PERFORM set_config('puc.rechaining', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION puc_rechain_minutes_all()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_prev TEXT := NULL;
  v_hash TEXT;
  v_payload TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('puc_minute_chain'), 1);
  PERFORM set_config('puc.rechaining', 'on', true);
  FOR r IN
    SELECT id, code, held_on, officer, result, is_late_entry, server_recorded_at, prev_hash, record_hash
    FROM inspection_minutes
    ORDER BY id ASC
  LOOP
    v_payload := concat_ws(
      '|',
      'MINUTE-V1',
      COALESCE(v_prev, 'GENESIS'),
      upper(puc_escape_ledger_part(r.code)),
      to_char(r.held_on, 'YYYY-MM-DD'),
      puc_escape_ledger_part(r.officer),
      puc_escape_ledger_part(r.result),
      CASE WHEN r.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
      floor(extract(epoch from r.server_recorded_at))::bigint::text
    );
    v_hash := puc_compute_ledger_hash(v_payload);
    IF r.prev_hash IS DISTINCT FROM v_prev OR r.record_hash IS DISTINCT FROM v_hash THEN
      UPDATE inspection_minutes
      SET prev_hash = v_prev,
          record_hash = v_hash
      WHERE id = r.id;
    END IF;
    v_prev := v_hash;
  END LOOP;
  PERFORM set_config('puc.rechaining', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION puc_journal_seal_before_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_seeding BOOLEAN := COALESCE(current_setting('puc.seeding', true), '') = 'on';
  v_is_rechaining BOOLEAN := COALESCE(current_setting('puc.rechaining', true), '') = 'on';
  v_ref_ts TIMESTAMPTZ;
  v_days_diff INT;
  v_prev TEXT;
  v_payload TEXT;
BEGIN
  IF v_is_rechaining THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('puc_journal_chain'), COALESCE(NEW.household_id, 0)::int);
    IF v_is_seeding THEN
      NEW.server_recorded_at := date_trunc(
        'second',
        COALESCE(
          NEW.server_recorded_at,
          ((to_char(NEW.entry_on, 'YYYY-MM-DD') || ' 16:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )
      );
    ELSE
      NEW.server_recorded_at := date_trunc('second', clock_timestamp());
    END IF;
  ELSE
    IF NOT v_is_seeding AND (
      OLD.entry_on IS DISTINCT FROM NEW.entry_on
      OR upper(btrim(COALESCE(OLD.plot_code, ''))) IS DISTINCT FROM upper(btrim(COALESCE(NEW.plot_code, '')))
      OR btrim(COALESCE(OLD.activity, '')) IS DISTINCT FROM btrim(COALESCE(NEW.activity, ''))
    ) THEN
      NEW.server_recorded_at := date_trunc('second', clock_timestamp());
    ELSE
      NEW.server_recorded_at := OLD.server_recorded_at;
    END IF;
  END IF;

  v_ref_ts := ((to_char(NEW.entry_on, 'YYYY-MM-DD') || ' 12:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  NEW.entry_delay_hours := GREATEST(
    0,
    ROUND((EXTRACT(EPOCH FROM (NEW.server_recorded_at - v_ref_ts)) / 3600.0)::numeric, 1)
  );
  v_days_diff := ((NEW.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - NEW.entry_on);
  NEW.is_late_entry := (v_days_diff > 2);
  IF NEW.is_late_entry AND (NEW.late_reason IS NULL OR btrim(NEW.late_reason) = '') THEN
    NEW.late_reason := 'Khai báo bổ sung sau thời điểm thực hiện';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT record_hash INTO v_prev
    FROM journal_entries
    WHERE household_id = NEW.household_id
    ORDER BY id DESC
    LIMIT 1;
    NEW.prev_hash := v_prev;
  END IF;

  v_payload := concat_ws(
    '|',
    'JOURNAL-V1',
    COALESCE(NEW.prev_hash, 'GENESIS'),
    COALESCE(NEW.household_id::text, '0'),
    to_char(NEW.entry_on, 'YYYY-MM-DD'),
    upper(puc_escape_ledger_part(NEW.plot_code)),
    puc_escape_ledger_part(NEW.activity),
    puc_escape_ledger_part(NEW.recorder),
    CASE WHEN NEW.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
    floor(extract(epoch from NEW.server_recorded_at))::bigint::text
  );
  NEW.record_hash := puc_compute_ledger_hash(v_payload);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION puc_spray_seal_before_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_seeding BOOLEAN := COALESCE(current_setting('puc.seeding', true), '') = 'on';
  v_is_rechaining BOOLEAN := COALESCE(current_setting('puc.rechaining', true), '') = 'on';
  v_ref_ts TIMESTAMPTZ;
  v_days_diff INT;
  v_prev TEXT;
  v_payload TEXT;
BEGIN
  IF v_is_rechaining THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('puc_spray_chain'), COALESCE(NEW.household_id, 0)::int);
    IF v_is_seeding THEN
      NEW.server_recorded_at := date_trunc(
        'second',
        COALESCE(
          NEW.server_recorded_at,
          ((to_char(NEW.sprayed_on, 'YYYY-MM-DD') || ' 15:30:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )
      );
    ELSE
      NEW.server_recorded_at := date_trunc('second', clock_timestamp());
    END IF;
  ELSE
    IF NOT v_is_seeding AND (
      OLD.sprayed_on IS DISTINCT FROM NEW.sprayed_on
      OR upper(btrim(COALESCE(OLD.plot_code, ''))) IS DISTINCT FROM upper(btrim(COALESCE(NEW.plot_code, '')))
      OR OLD.pesticide_id IS DISTINCT FROM NEW.pesticide_id
      OR btrim(COALESCE(OLD.dose, '')) IS DISTINCT FROM btrim(COALESCE(NEW.dose, ''))
      OR OLD.isolation_days IS DISTINCT FROM NEW.isolation_days
      OR btrim(COALESCE(OLD.mrl_status, '')) IS DISTINCT FROM btrim(COALESCE(NEW.mrl_status, ''))
    ) THEN
      NEW.server_recorded_at := date_trunc('second', clock_timestamp());
    ELSE
      NEW.server_recorded_at := OLD.server_recorded_at;
    END IF;
  END IF;

  v_ref_ts := ((to_char(NEW.sprayed_on, 'YYYY-MM-DD') || ' 12:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  NEW.entry_delay_hours := GREATEST(
    0,
    ROUND((EXTRACT(EPOCH FROM (NEW.server_recorded_at - v_ref_ts)) / 3600.0)::numeric, 1)
  );
  v_days_diff := ((NEW.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - NEW.sprayed_on);
  NEW.is_late_entry := (v_days_diff > 2);
  IF NEW.is_late_entry AND (NEW.late_reason IS NULL OR btrim(NEW.late_reason) = '') THEN
    NEW.late_reason := 'Khai báo bổ sung sau thời điểm thực hiện';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT record_hash INTO v_prev
    FROM spray_records
    WHERE household_id = NEW.household_id
    ORDER BY id DESC
    LIMIT 1;
    NEW.prev_hash := v_prev;
  END IF;

  v_payload := concat_ws(
    '|',
    'SPRAY-V1',
    COALESCE(NEW.prev_hash, 'GENESIS'),
    COALESCE(NEW.household_id::text, '0'),
    to_char(NEW.sprayed_on, 'YYYY-MM-DD'),
    upper(puc_escape_ledger_part(NEW.plot_code)),
    COALESCE(NEW.pesticide_id::text, '0'),
    puc_escape_ledger_part(NEW.dose),
    COALESCE(NEW.isolation_days::text, '0'),
    puc_escape_ledger_part(NEW.mrl_status),
    CASE WHEN NEW.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
    floor(extract(epoch from NEW.server_recorded_at))::bigint::text
  );
  NEW.record_hash := puc_compute_ledger_hash(v_payload);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION puc_minute_seal_before_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_seeding BOOLEAN := COALESCE(current_setting('puc.seeding', true), '') = 'on';
  v_is_rechaining BOOLEAN := COALESCE(current_setting('puc.rechaining', true), '') = 'on';
  v_ref_ts TIMESTAMPTZ;
  v_days_diff INT;
  v_prev TEXT;
  v_payload TEXT;
BEGIN
  IF v_is_rechaining THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('puc_minute_chain'), 1);
    IF v_is_seeding THEN
      NEW.server_recorded_at := date_trunc(
        'second',
        COALESCE(
          NEW.server_recorded_at,
          ((to_char(NEW.held_on, 'YYYY-MM-DD') || ' 17:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )
      );
    ELSE
      NEW.server_recorded_at := date_trunc('second', clock_timestamp());
    END IF;
  ELSE
    IF NOT v_is_seeding AND (
      OLD.held_on IS DISTINCT FROM NEW.held_on
      OR upper(btrim(COALESCE(OLD.code, ''))) IS DISTINCT FROM upper(btrim(COALESCE(NEW.code, '')))
      OR btrim(COALESCE(OLD.officer, '')) IS DISTINCT FROM btrim(COALESCE(NEW.officer, ''))
      OR btrim(COALESCE(OLD.result, '')) IS DISTINCT FROM btrim(COALESCE(NEW.result, ''))
    ) THEN
      NEW.server_recorded_at := date_trunc('second', clock_timestamp());
    ELSE
      NEW.server_recorded_at := OLD.server_recorded_at;
    END IF;
  END IF;

  v_ref_ts := ((to_char(NEW.held_on, 'YYYY-MM-DD') || ' 12:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  NEW.entry_delay_hours := GREATEST(
    0,
    ROUND((EXTRACT(EPOCH FROM (NEW.server_recorded_at - v_ref_ts)) / 3600.0)::numeric, 1)
  );
  v_days_diff := ((NEW.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - NEW.held_on);
  NEW.is_late_entry := (v_days_diff > 2);
  IF NEW.is_late_entry AND (NEW.late_reason IS NULL OR btrim(NEW.late_reason) = '') THEN
    NEW.late_reason := 'Biên bản ghi nhận bổ sung sau ngày kiểm tra';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT record_hash INTO v_prev
    FROM inspection_minutes
    ORDER BY id DESC
    LIMIT 1;
    NEW.prev_hash := v_prev;
  END IF;

  v_payload := concat_ws(
    '|',
    'MINUTE-V1',
    COALESCE(NEW.prev_hash, 'GENESIS'),
    upper(puc_escape_ledger_part(NEW.code)),
    to_char(NEW.held_on, 'YYYY-MM-DD'),
    puc_escape_ledger_part(NEW.officer),
    puc_escape_ledger_part(NEW.result),
    CASE WHEN NEW.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
    floor(extract(epoch from NEW.server_recorded_at))::bigint::text
  );
  NEW.record_hash := puc_compute_ledger_hash(v_payload);
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r_hh RECORD;
BEGIN
  FOR r_hh IN SELECT DISTINCT household_id FROM journal_entries WHERE household_id IS NOT NULL LOOP
    PERFORM puc_rechain_journal_household(r_hh.household_id);
  END LOOP;

  FOR r_hh IN SELECT DISTINCT household_id FROM spray_records WHERE household_id IS NOT NULL LOOP
    PERFORM puc_rechain_spray_household(r_hh.household_id);
  END LOOP;

  PERFORM puc_rechain_minutes_all();
END $$;

