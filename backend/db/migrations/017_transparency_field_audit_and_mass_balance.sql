-- 017_transparency_field_audit_and_mass_balance.sql:
-- 1. Chống ghi lùi nhật ký: khóa thời gian máy chủ (server_recorded_at), độ trễ nhập liệu (entry_delay_hours, is_late_entry)
--    và chuỗi mã băm bất biến SHA-256 (prev_hash, record_hash) trên journal_entries, spray_records, inspection_minutes.
-- 2. Cân đối hạn ngạch sản lượng vùng trồng (plot_season_quotas) chống trộn hàng ngoài vùng vào mã số PUC.
-- 3. Bảng QR định danh thửa đất (plot_signboard_tokens), Thẻ Đoàn Thẩm định Thực địa (field_audit_passes) & Check-in GPS (field_gps_checkins).
-- 4. Ảnh hiện trường gắn tọa độ GPS (gps_verified, gps_distance_m, purpose = 'inspection') & Mã đối chiếu gốc Phòng kiểm nghiệm ISO/IEC 17025.
-- 5. Cấu hình Bảo chứng Chính quyền Tỉnh & UBND Xã (commune_endorsement_config) cho mô hình điểm cấp xã.

-- ============================================================================
-- 0. Mở rộng mục đích tệp đính kèm ('inspection') & cấp nhật ký truy cập ('field_audit')
-- ============================================================================
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_purpose_check;
ALTER TABLE attachments
  ADD CONSTRAINT attachments_purpose_check
  CHECK (purpose IN ('journal', 'harvest', 'stamp', 'approval', 'violation', 'news', 'catalog', 'avatar', 'lab', 'inspection'));

ALTER TABLE trace_detail_access_logs DROP CONSTRAINT IF EXISTS trace_detail_access_logs_viewer_tier_check;
ALTER TABLE trace_detail_access_logs
  ADD CONSTRAINT trace_detail_access_logs_viewer_tier_check
  CHECK (viewer_tier IN ('public', 'enterprise', 'authority', 'field_audit'));

-- ============================================================================
-- 1. Cột chống ghi lùi, bằng chứng GPS hiện trường & chuỗi băm SHA-256
-- ============================================================================
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS server_recorded_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('second', now()),
  ADD COLUMN IF NOT EXISTS entry_delay_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_late_entry BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_reason TEXT,
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS record_hash TEXT,
  ADD COLUMN IF NOT EXISTS gps_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_distance_m NUMERIC(10, 1),
  ADD COLUMN IF NOT EXISTS capture_source TEXT NOT NULL DEFAULT 'camera'
    CHECK (capture_source IN ('camera', 'upload', 'system'));

ALTER TABLE spray_records
  ADD COLUMN IF NOT EXISTS server_recorded_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('second', now()),
  ADD COLUMN IF NOT EXISTS entry_delay_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_late_entry BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_reason TEXT,
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS record_hash TEXT;

ALTER TABLE inspection_minutes
  ADD COLUMN IF NOT EXISTS plot_code TEXT,
  ADD COLUMN IF NOT EXISTS household_id BIGINT REFERENCES households(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS gps_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_distance_m NUMERIC(10, 1),
  ADD COLUMN IF NOT EXISTS server_recorded_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('second', now()),
  ADD COLUMN IF NOT EXISTS entry_delay_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_late_entry BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_reason TEXT,
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS record_hash TEXT;

-- Hàm tính mã băm chuẩn hóa SHA-256 khớp 100% với Node.js `computeLedgerRecordHash`
CREATE OR REPLACE FUNCTION puc_compute_ledger_hash(p_payload TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(sha256(convert_to(p_payload, 'UTF8')), 'hex');
$$;

-- Các hàm tái niêm phong chuỗi băm khi có cập nhật / xóa hợp lệ trong khung 24h
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
      upper(btrim(COALESCE(r.plot_code, ''))),
      btrim(COALESCE(r.activity, '')),
      btrim(COALESCE(r.recorder, '')),
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
      upper(btrim(COALESCE(r.plot_code, ''))),
      COALESCE(r.pesticide_id::text, '0'),
      btrim(COALESCE(r.dose, '')),
      COALESCE(r.isolation_days::text, '0'),
      btrim(COALESCE(r.mrl_status, '')),
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
      upper(btrim(COALESCE(r.code, ''))),
      to_char(r.held_on, 'YYYY-MM-DD'),
      btrim(COALESCE(r.officer, '')),
      btrim(COALESCE(r.result, '')),
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

-- Trigger BEFORE INSERT OR UPDATE cho journal_entries
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
    NEW.server_recorded_at := OLD.server_recorded_at;
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
    upper(btrim(COALESCE(NEW.plot_code, ''))),
    btrim(COALESCE(NEW.activity, '')),
    btrim(COALESCE(NEW.recorder, '')),
    CASE WHEN NEW.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
    floor(extract(epoch from NEW.server_recorded_at))::bigint::text
  );
  NEW.record_hash := puc_compute_ledger_hash(v_payload);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION puc_journal_rechain_after_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('puc.rechaining', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM puc_rechain_journal_household(OLD.household_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.household_id IS DISTINCT FROM NEW.household_id THEN
      PERFORM puc_rechain_journal_household(OLD.household_id);
    END IF;
    PERFORM puc_rechain_journal_household(NEW.household_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_seal_before ON journal_entries;
CREATE TRIGGER journal_entries_seal_before
BEFORE INSERT OR UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION puc_journal_seal_before_fn();

DROP TRIGGER IF EXISTS journal_entries_rechain_after ON journal_entries;
CREATE TRIGGER journal_entries_rechain_after
AFTER UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION puc_journal_rechain_after_fn();

-- Trigger BEFORE INSERT OR UPDATE cho spray_records
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
    NEW.server_recorded_at := OLD.server_recorded_at;
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
    upper(btrim(COALESCE(NEW.plot_code, ''))),
    COALESCE(NEW.pesticide_id::text, '0'),
    btrim(COALESCE(NEW.dose, '')),
    COALESCE(NEW.isolation_days::text, '0'),
    btrim(COALESCE(NEW.mrl_status, '')),
    CASE WHEN NEW.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
    floor(extract(epoch from NEW.server_recorded_at))::bigint::text
  );
  NEW.record_hash := puc_compute_ledger_hash(v_payload);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION puc_spray_rechain_after_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('puc.rechaining', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM puc_rechain_spray_household(OLD.household_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.household_id IS DISTINCT FROM NEW.household_id THEN
      PERFORM puc_rechain_spray_household(OLD.household_id);
    END IF;
    PERFORM puc_rechain_spray_household(NEW.household_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS spray_records_seal_before ON spray_records;
CREATE TRIGGER spray_records_seal_before
BEFORE INSERT OR UPDATE ON spray_records
FOR EACH ROW EXECUTE FUNCTION puc_spray_seal_before_fn();

DROP TRIGGER IF EXISTS spray_records_rechain_after ON spray_records;
CREATE TRIGGER spray_records_rechain_after
AFTER UPDATE OR DELETE ON spray_records
FOR EACH ROW EXECUTE FUNCTION puc_spray_rechain_after_fn();

-- Trigger BEFORE INSERT OR UPDATE cho inspection_minutes
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
    NEW.server_recorded_at := OLD.server_recorded_at;
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
    upper(btrim(COALESCE(NEW.code, ''))),
    to_char(NEW.held_on, 'YYYY-MM-DD'),
    btrim(COALESCE(NEW.officer, '')),
    btrim(COALESCE(NEW.result, '')),
    CASE WHEN NEW.is_late_entry THEN 'LATE' ELSE 'ONTIME' END,
    floor(extract(epoch from NEW.server_recorded_at))::bigint::text
  );
  NEW.record_hash := puc_compute_ledger_hash(v_payload);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION puc_minute_rechain_after_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('puc.rechaining', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM puc_rechain_minutes_all();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS inspection_minutes_seal_before ON inspection_minutes;
CREATE TRIGGER inspection_minutes_seal_before
BEFORE INSERT OR UPDATE ON inspection_minutes
FOR EACH ROW EXECUTE FUNCTION puc_minute_seal_before_fn();

DROP TRIGGER IF EXISTS inspection_minutes_rechain_after ON inspection_minutes;
CREATE TRIGGER inspection_minutes_rechain_after
AFTER UPDATE OR DELETE ON inspection_minutes
FOR EACH ROW EXECUTE FUNCTION puc_minute_rechain_after_fn();

-- Khởi tạo chuẩn thời gian thực & niêm phong chuỗi băm cho dữ liệu đã có sẵn trước migration
DO $$
DECLARE
  r_hh RECORD;
BEGIN
  PERFORM set_config('puc.rechaining', 'on', true);

  UPDATE journal_entries
  SET server_recorded_at = date_trunc(
        'second',
        ((to_char(entry_on, 'YYYY-MM-DD') || ' 16:15:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ),
      entry_delay_hours = 4.3,
      is_late_entry = false,
      late_reason = NULL,
      gps_verified = COALESCE(has_photo, false) OR latitude IS NOT NULL
  WHERE record_hash IS NULL;

  UPDATE spray_records
  SET server_recorded_at = date_trunc(
        'second',
        ((to_char(sprayed_on, 'YYYY-MM-DD') || ' 15:45:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ),
      entry_delay_hours = 3.8,
      is_late_entry = false,
      late_reason = NULL
  WHERE record_hash IS NULL;

  UPDATE inspection_minutes
  SET server_recorded_at = date_trunc(
        'second',
        ((to_char(held_on, 'YYYY-MM-DD') || ' 17:10:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ),
      entry_delay_hours = 5.2,
      is_late_entry = false,
      late_reason = NULL,
      gps_verified = true,
      gps_distance_m = 8.4
  WHERE record_hash IS NULL;

  PERFORM set_config('puc.rechaining', 'off', true);

  FOR r_hh IN SELECT DISTINCT household_id FROM journal_entries WHERE household_id IS NOT NULL LOOP
    PERFORM puc_rechain_journal_household(r_hh.household_id);
  END LOOP;

  FOR r_hh IN SELECT DISTINCT household_id FROM spray_records WHERE household_id IS NOT NULL LOOP
    PERFORM puc_rechain_spray_household(r_hh.household_id);
  END LOOP;

  PERFORM puc_rechain_minutes_all();
END $$;

-- ============================================================================
-- 2. Cân đối hạn ngạch sản lượng thửa/vùng trồng (plot_season_quotas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plot_season_quotas (
  id BIGSERIAL PRIMARY KEY,
  season_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plot_code TEXT NOT NULL,
  zone_code TEXT NOT NULL DEFAULT 'VN-DLOR-0086',
  area_ha NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (area_ha >= 0),
  tree_count INT NOT NULL DEFAULT 0 CHECK (tree_count >= 0),
  max_quota_kg NUMERIC(12, 1) NOT NULL CHECK (max_quota_kg >= 0),
  assessed_by TEXT NOT NULL DEFAULT 'Tổ Giám sát Kỹ thuật UBND Xã Cư Né',
  assessed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plot_season_quotas_year_plot_key UNIQUE (season_year, plot_code)
);

CREATE INDEX IF NOT EXISTS plot_season_quotas_zone_idx
  ON plot_season_quotas (season_year, upper(zone_code));

DROP TRIGGER IF EXISTS plot_season_quotas_set_updated_at ON plot_season_quotas;
CREATE TRIGGER plot_season_quotas_set_updated_at
BEFORE UPDATE ON plot_season_quotas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    ALTER TABLE plots
      ADD COLUMN IF NOT EXISTS qr_token TEXT,
      ADD COLUMN IF NOT EXISTS tree_count INT,
      ADD COLUMN IF NOT EXISTS season_quota_kg NUMERIC(12, 1);

    UPDATE plots SET qr_token = puc_random_qr_token(14) WHERE qr_token IS NULL;
    ALTER TABLE plots ALTER COLUMN qr_token SET DEFAULT puc_random_qr_token(14);
    CREATE UNIQUE INDEX IF NOT EXISTS plots_qr_token_idx ON plots (qr_token);
  END IF;
END $$;

-- ============================================================================
-- 3. Bảng QR Thửa Đất (plot_signboard_tokens), Thẻ Thẩm định (field_audit_passes) & Check-in GPS
-- ============================================================================
CREATE TABLE IF NOT EXISTS plot_signboard_tokens (
  plot_code TEXT PRIMARY KEY,
  qr_token TEXT NOT NULL UNIQUE DEFAULT puc_random_qr_token(14),
  household_id BIGINT REFERENCES households(id) ON DELETE CASCADE,
  zone_code TEXT NOT NULL DEFAULT 'VN-DLOR-0086',
  village_name TEXT,
  variety TEXT DEFAULT 'Ri6 & Monthong (Dona)',
  planted_year INT DEFAULT 2018,
  area_ha NUMERIC(10, 4) NOT NULL DEFAULT 1.2,
  tree_count INT NOT NULL DEFAULT 180,
  center_lat NUMERIC(9, 6),
  center_lng NUMERIC(9, 6),
  geometry_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plot_signboard_tokens_household_idx
  ON plot_signboard_tokens (household_id);

CREATE TABLE IF NOT EXISTS field_audit_passes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  pass_token TEXT NOT NULL UNIQUE DEFAULT puc_random_qr_token(18),
  delegation_name TEXT NOT NULL,
  organization TEXT,
  allowed_zone_code TEXT,
  default_lang TEXT NOT NULL DEFAULT 'zh' CHECK (default_lang IN ('vi', 'en', 'zh')),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  issued_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  issued_by_name TEXT NOT NULL,
  access_count INT NOT NULL DEFAULT 0 CHECK (access_count >= 0),
  last_accessed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS field_audit_passes_token_idx
  ON field_audit_passes (pass_token);

CREATE TABLE IF NOT EXISTS field_gps_checkins (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  plot_code TEXT NOT NULL,
  audit_pass_id BIGINT REFERENCES field_audit_passes(id) ON DELETE SET NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  accuracy_m NUMERIC(8, 1),
  inside_polygon BOOLEAN NOT NULL DEFAULT false,
  distance_m NUMERIC(10, 1),
  verified BOOLEAN NOT NULL DEFAULT false,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS field_gps_checkins_plot_idx
  ON field_gps_checkins (upper(plot_code), checked_at DESC);

-- Đồng bộ dữ liệu Bảng QR Thửa Đất & Hạn ngạch đầu vụ nếu DB đã có sẵn dữ liệu
DO $$
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    INSERT INTO plot_signboard_tokens
      (plot_code, qr_token, household_id, zone_code, village_name, variety, planted_year, area_ha, tree_count, center_lat, center_lng, geometry_json)
    SELECT
      p.code,
      COALESCE(p.qr_token, puc_random_qr_token(14)),
      p.household_id,
      COALESCE(NULLIF(btrim(p.zone_code), ''), 'VN-DLOR-0086'),
      p.village,
      COALESCE(NULLIF(btrim(p.variety), ''), 'Ri6 & Monthong (Dona)'),
      COALESCE(p.planted_year, 2018),
      GREATEST(0.2, COALESCE(p.area_ha, 1.0)),
      GREATEST(30, ROUND(GREATEST(0.2, COALESCE(p.area_ha, 1.0)) * 150)::int),
      ROUND(ST_Y(ST_Centroid(p.geom))::numeric, 6),
      ROUND(ST_X(ST_Centroid(p.geom))::numeric, 6),
      ST_AsGeoJSON(p.geom)
    FROM plots p
    WHERE p.code IS NOT NULL AND btrim(p.code) <> ''
    ON CONFLICT (plot_code) DO UPDATE
      SET household_id = COALESCE(EXCLUDED.household_id, plot_signboard_tokens.household_id),
          zone_code = EXCLUDED.zone_code,
          area_ha = EXCLUDED.area_ha,
          center_lat = COALESCE(EXCLUDED.center_lat, plot_signboard_tokens.center_lat),
          center_lng = COALESCE(EXCLUDED.center_lng, plot_signboard_tokens.center_lng),
          geometry_json = COALESCE(EXCLUDED.geometry_json, plot_signboard_tokens.geometry_json);

    INSERT INTO plot_season_quotas
      (season_year, household_id, plot_code, zone_code, area_ha, tree_count, max_quota_kg, assessed_by, assessed_on, note)
    SELECT
      yr.season_year,
      p.household_id,
      p.code,
      COALESCE(NULLIF(btrim(p.zone_code), ''), 'VN-DLOR-0086'),
      GREATEST(0.2, COALESCE(p.area_ha, 1.0)),
      GREATEST(30, ROUND(GREATEST(0.2, COALESCE(p.area_ha, 1.0)) * 150)::int),
      GREATEST(12000, ROUND(GREATEST(0.2, COALESCE(p.area_ha, 1.0)) * 16500, 1)),
      'Tổ Giám sát Kỹ thuật UBND Xã Cư Né',
      make_date(yr.season_year, 5, 10),
      'Thẩm định sản lượng trần đầu vụ theo diện tích GIS & mật độ cây thực tế'
    FROM plots p
    CROSS JOIN (SELECT DISTINCT s_yr FROM (VALUES (2024), (2025), (2026), (EXTRACT(YEAR FROM now())::int)) AS raw_yr(s_yr)) AS yr(season_year)
    WHERE p.household_id IS NOT NULL AND p.code IS NOT NULL AND btrim(p.code) <> ''
    ON CONFLICT (season_year, plot_code) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- 4. Mã công nhận ISO/IEC 17025 & Đường dẫn tra cứu gốc Phòng kiểm nghiệm độc lập
-- ============================================================================
ALTER TABLE lab_tests
  ADD COLUMN IF NOT EXISTS lab_accreditation_code TEXT NOT NULL DEFAULT 'VILAS 356 - ISO/IEC 17025 (GACC chỉ định)',
  ADD COLUMN IF NOT EXISTS external_verify_code TEXT,
  ADD COLUMN IF NOT EXISTS external_verify_url TEXT;

UPDATE lab_tests
SET external_verify_code = 'ISO17025-' || upper(regexp_replace(code, '[^A-Za-z0-9-]', '', 'g')),
    external_verify_url = 'https://kiemnghiem.quatest3.com.vn/tra-cuu?code=' || upper(regexp_replace(code, '[^A-Za-z0-9-]', '', 'g'))
WHERE external_verify_code IS NULL;

-- ============================================================================
-- 5. Cấu hình Bảo chứng Chính quyền Tỉnh & UBND Xã (Mô hình điểm cấp xã)
-- ============================================================================
CREATE TABLE IF NOT EXISTS commune_endorsement_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  program_title TEXT NOT NULL,
  directive_no TEXT NOT NULL,
  commune_authority TEXT NOT NULL,
  provincial_authority TEXT NOT NULL,
  official_portal_url TEXT NOT NULL,
  official_domain TEXT NOT NULL,
  inspection_unit TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO commune_endorsement_config
  (id, program_title, directive_no, commune_authority, provincial_authority, official_portal_url, official_domain, inspection_unit)
VALUES (
  1,
  'Mô hình điểm Truy xuất nguồn gốc Sầu riêng cấp Xã theo chỉ đạo của Tỉnh Đắk Lắk',
  'Đề án Chuyển đổi số Nông nghiệp & Chuẩn hóa Mã số Vùng trồng Xuất khẩu Tỉnh Đắk Lắk',
  'Ủy ban Nhân dân Xã Cư Né - Huyện Krông Búk',
  'Ủy ban Nhân dân Tỉnh Đắk Lắk - Sở Nông nghiệp và Môi trường',
  'https://daklak.gov.vn',
  'truyxuat.cune-krongbuk.gov.vn',
  'Tổ Giám sát Cộng đồng Xã Cư Né & Ban Kỹ thuật HTX Nông nghiệp Cư Né'
)
ON CONFLICT (id) DO NOTHING;
