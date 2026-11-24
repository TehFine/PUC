-- 038_nd37_gacc_events_and_immutable_audit.sql:
-- 1. Chuẩn Điều 23 khoản 7 Nghị định 37/2026/NĐ-CP: nhãn hiệu thương mại, hạn sử dụng, điều kiện bảo quản,
--    ảnh sản phẩm lô hàng (harvest_lots) và thông tin pháp nhân đầy đủ của đơn vị sản xuất HTX (commune_endorsement_config).
-- 2. Mã phê duyệt Hải quan Trung Quốc (GACC) và ngày phê duyệt MARD/GACC cho vùng trồng (growing_zones) & cơ sở đóng gói (enterprises).
-- 3. Phân biệt rõ "Nông hộ tự khai báo" (self_declared) với "HTX đã xác minh" (verified) trên journal_entries & spray_records,
--    tự động thu hồi trạng thái xác minh nếu nội dung bản ghi bị sửa đổi sau đó.
-- 4. Bảng Sự kiện theo dõi trọng yếu supply_chain_events (TCVN 12850 / GS1 EPCIS) gắn mã sự kiện độc lập có thể tra cứu.
-- 5. Bảng Nhật ký thay đổi bất biến immutable_change_logs lưu giá trị cũ / mới (JSONB), chuỗi băm SHA-256 và khóa cứng UPDATE/DELETE/TRUNCATE.

-- ============================================================================
-- 1. Mở rộng harvest_lots & commune_endorsement_config theo Điều 23 khoản 7 NĐ 37/2026/NĐ-CP
-- ============================================================================
ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS expiry_on DATE,
  ADD COLUMN IF NOT EXISTS storage_condition TEXT,
  ADD COLUMN IF NOT EXISTS product_image_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS harvest_lots_product_image_idx
  ON harvest_lots (product_image_id)
  WHERE product_image_id IS NOT NULL;

ALTER TABLE commune_endorsement_config
  ADD COLUMN IF NOT EXISTS coop_legal_name TEXT NOT NULL DEFAULT 'Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né',
  ADD COLUMN IF NOT EXISTS coop_tax_code TEXT,
  ADD COLUMN IF NOT EXISTS coop_address TEXT NOT NULL DEFAULT 'Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk';

-- ============================================================================
-- 2. Mã đăng ký GACC (Hải quan Trung Quốc) cho Vùng trồng (PUC) & Cơ sở đóng gói (PHC)
-- ============================================================================
ALTER TABLE growing_zones
  ADD COLUMN IF NOT EXISTS gacc_code TEXT,
  ADD COLUMN IF NOT EXISTS mard_approved_on DATE,
  ADD COLUMN IF NOT EXISTS gacc_approved_on DATE;

ALTER TABLE enterprises
  ADD COLUMN IF NOT EXISTS gacc_code TEXT,
  ADD COLUMN IF NOT EXISTS mard_approved_on DATE,
  ADD COLUMN IF NOT EXISTS gacc_approved_on DATE;

-- ============================================================================
-- 3. Trạng thái xác minh "Tự khai báo" vs "HTX đã xác minh" trên nhật ký canh tác & phun thuốc
-- ============================================================================
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'self_declared'
    CHECK (verification_status IN ('self_declared', 'verified')),
  ADD COLUMN IF NOT EXISTS verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by_name TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS journal_entries_verification_idx
  ON journal_entries (household_id, verification_status);

ALTER TABLE spray_records
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'self_declared'
    CHECK (verification_status IN ('self_declared', 'verified')),
  ADD COLUMN IF NOT EXISTS verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by_name TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS spray_records_verification_idx
  ON spray_records (household_id, verification_status);

-- Tự động đưa trạng thái về 'self_declared' nếu nội dung nghiệp vụ của bản ghi đã xác minh bị chỉnh sửa
CREATE OR REPLACE FUNCTION puc_journal_reset_verify_on_edit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('puc.rechaining', true), '') = 'on'
     OR COALESCE(current_setting('puc.verifying_diary', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.verification_status = 'verified' AND (
    OLD.entry_on IS DISTINCT FROM NEW.entry_on
    OR OLD.plot_code IS DISTINCT FROM NEW.plot_code
    OR OLD.activity IS DISTINCT FROM NEW.activity
    OR OLD.detail IS DISTINCT FROM NEW.detail
    OR OLD.photo_id IS DISTINCT FROM NEW.photo_id
    OR OLD.photo_ids IS DISTINCT FROM NEW.photo_ids
  ) THEN
    NEW.verification_status := 'self_declared';
    NEW.verified_by_user_id := NULL;
    NEW.verified_by_name := NULL;
    NEW.verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_reset_verify_before ON journal_entries;
CREATE TRIGGER journal_entries_reset_verify_before
BEFORE UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION puc_journal_reset_verify_on_edit_fn();

CREATE OR REPLACE FUNCTION puc_spray_reset_verify_on_edit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(current_setting('puc.rechaining', true), '') = 'on'
     OR COALESCE(current_setting('puc.verifying_diary', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.verification_status = 'verified' AND (
    OLD.sprayed_on IS DISTINCT FROM NEW.sprayed_on
    OR OLD.plot_code IS DISTINCT FROM NEW.plot_code
    OR OLD.pesticide_id IS DISTINCT FROM NEW.pesticide_id
    OR OLD.dose IS DISTINCT FROM NEW.dose
    OR OLD.area_ha IS DISTINCT FROM NEW.area_ha
    OR OLD.isolation_days IS DISTINCT FROM NEW.isolation_days
    OR OLD.photo_id IS DISTINCT FROM NEW.photo_id
    OR OLD.photo_ids IS DISTINCT FROM NEW.photo_ids
  ) THEN
    NEW.verification_status := 'self_declared';
    NEW.verified_by_user_id := NULL;
    NEW.verified_by_name := NULL;
    NEW.verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spray_records_reset_verify_before ON spray_records;
CREATE TRIGGER spray_records_reset_verify_before
BEFORE UPDATE ON spray_records
FOR EACH ROW EXECUTE FUNCTION puc_spray_reset_verify_on_edit_fn();

-- ============================================================================
-- 4. Bảng Sự kiện theo dõi trọng yếu supply_chain_events (TCVN 12850 / GS1 EPCIS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS supply_chain_events (
  id BIGSERIAL PRIMARY KEY,
  event_code TEXT NOT NULL UNIQUE,
  lot_id BIGINT NOT NULL REFERENCES harvest_lots(id) ON DELETE CASCADE,
  step_order SMALLINT NOT NULL CHECK (step_order BETWEEN 1 AND 10),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('farm_inspection', 'harvest', 'packing', 'lab_testing', 'export_release', 'revocation')
  ),
  occurred_on DATE,
  location_code TEXT,
  location_name TEXT,
  actor_unit TEXT NOT NULL,
  recorded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  recorded_by_name TEXT,
  summary TEXT NOT NULL,
  evidence_ref TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (
    status IN ('completed', 'current', 'upcoming', 'warning')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supply_chain_events_lot_type_key UNIQUE (lot_id, event_type)
);

CREATE INDEX IF NOT EXISTS supply_chain_events_lot_idx
  ON supply_chain_events (lot_id, step_order ASC);

CREATE INDEX IF NOT EXISTS supply_chain_events_code_upper_idx
  ON supply_chain_events (upper(event_code));

DROP TRIGGER IF EXISTS supply_chain_events_set_updated_at ON supply_chain_events;
CREATE TRIGGER supply_chain_events_set_updated_at
BEFORE UPDATE ON supply_chain_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 5. Bảng Nhật ký kiểm toán thay đổi bất biến immutable_change_logs (lưu old_data / new_data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS immutable_change_logs (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  table_name TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('UPDATE', 'DELETE')),
  household_id BIGINT,
  lot_id BIGINT,
  plot_code TEXT,
  actor_user_id BIGINT,
  actor_name TEXT,
  actor_role TEXT,
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  old_data JSONB NOT NULL,
  new_data JSONB,
  prev_hash TEXT,
  entry_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS immutable_change_logs_lot_idx
  ON immutable_change_logs (lot_id, occurred_at DESC, id DESC)
  WHERE lot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS immutable_change_logs_household_idx
  ON immutable_change_logs (household_id, occurred_at DESC, id DESC)
  WHERE household_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS immutable_change_logs_plot_idx
  ON immutable_change_logs (upper(plot_code), occurred_at DESC, id DESC)
  WHERE plot_code IS NOT NULL AND plot_code <> '';

-- Chặn tuyệt đối mọi thao tác UPDATE, DELETE, TRUNCATE trên bảng nhật ký bất biến
CREATE OR REPLACE FUNCTION puc_forbid_immutable_log_mutation_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký kiểm toán bất biến (immutable_change_logs) không cho phép sửa hoặc xóa.';
END;
$$;

DROP TRIGGER IF EXISTS immutable_change_logs_forbid_row_mod ON immutable_change_logs;
CREATE TRIGGER immutable_change_logs_forbid_row_mod
BEFORE UPDATE OR DELETE ON immutable_change_logs
FOR EACH ROW EXECUTE FUNCTION puc_forbid_immutable_log_mutation_fn();

DROP TRIGGER IF EXISTS immutable_change_logs_forbid_truncate ON immutable_change_logs;
CREATE TRIGGER immutable_change_logs_forbid_truncate
BEFORE TRUNCATE ON immutable_change_logs
FOR EACH STATEMENT EXECUTE FUNCTION puc_forbid_immutable_log_mutation_fn();

-- Trigger tự động ghi vết bất biến (old_data -> new_data) cho các bảng truy xuất cốt lõi
CREATE OR REPLACE FUNCTION puc_capture_immutable_change_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_excluded CONSTANT TEXT[] := ARRAY[
    'qr_token',
    'buyer',
    'coop_code',
    'prev_hash',
    'record_hash',
    'created_at',
    'updated_at',
    'server_recorded_at',
    'entry_delay_hours',
    'edit_count',
    'updated_by_user_id',
    'updated_by_name',
    'updated_by_role',
    'verified_by_user_id',
    'created_by_user_id',
    'household_count',
    'photo_id',
    'photo_ids',
    'scan_attachment_id',
    'product_image_id',
    'external_verify_url'
  ];
  v_old_raw JSONB;
  v_new_raw JSONB;
  v_old_clean JSONB;
  v_new_clean JSONB;
  v_changed TEXT[] := ARRAY[]::TEXT[];
  v_record_id BIGINT := 0;
  v_household_id BIGINT := NULL;
  v_lot_id BIGINT := NULL;
  v_plot_code TEXT := NULL;
  v_actor_id_txt TEXT;
  v_actor_id BIGINT := NULL;
  v_actor_name TEXT := NULL;
  v_actor_role TEXT := NULL;
  v_prev_hash TEXT := NULL;
  v_entry_hash TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF COALESCE(current_setting('puc.rechaining', true), '') = 'on'
     OR COALESCE(current_setting('puc.seeding', true), '') = 'on' THEN
    RETURN NULL;
  END IF;

  v_old_raw := to_jsonb(OLD);
  v_old_clean := v_old_raw - v_excluded;

  IF TG_OP = 'UPDATE' THEN
    v_new_raw := to_jsonb(NEW);
    v_new_clean := v_new_raw - v_excluded;

    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::TEXT[])
    INTO v_changed
    FROM (
      SELECT key AS k FROM jsonb_object_keys(v_old_clean) AS key
      UNION
      SELECT key AS k FROM jsonb_object_keys(v_new_clean) AS key
    ) keys
    WHERE (v_old_clean -> k) IS DISTINCT FROM (v_new_clean -> k);

    IF COALESCE(cardinality(v_changed), 0) = 0 THEN
      RETURN NULL;
    END IF;
  ELSE
    v_new_raw := NULL;
    v_new_clean := NULL;
    SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::TEXT[])
    INTO v_changed
    FROM jsonb_object_keys(v_old_clean) AS key;
  END IF;

  v_record_id := COALESCE(
    NULLIF(COALESCE(v_new_raw ->> 'id', v_old_raw ->> 'id'), '')::BIGINT,
    0
  );

  IF TG_TABLE_NAME = 'harvest_lots' THEN
    v_lot_id := v_record_id;
  ELSIF TG_TABLE_NAME = 'harvest_contributions' THEN
    v_lot_id := NULLIF(COALESCE(v_new_raw ->> 'lot_id', v_old_raw ->> 'lot_id'), '')::BIGINT;
    v_household_id := NULLIF(COALESCE(v_new_raw ->> 'household_id', v_old_raw ->> 'household_id'), '')::BIGINT;
    v_plot_code := NULLIF(btrim(COALESCE(v_new_raw ->> 'plot_code', v_old_raw ->> 'plot_code', '')), '');
  ELSE
    v_household_id := NULLIF(COALESCE(v_new_raw ->> 'household_id', v_old_raw ->> 'household_id'), '')::BIGINT;
    v_plot_code := NULLIF(btrim(COALESCE(v_new_raw ->> 'plot_code', v_old_raw ->> 'plot_code', '')), '');
  END IF;

  v_actor_id_txt := NULLIF(btrim(COALESCE(current_setting('puc.actor_user_id', true), '')), '');
  IF v_actor_id_txt ~ '^[0-9]+$' THEN
    v_actor_id := v_actor_id_txt::BIGINT;
  ELSIF v_new_raw IS NOT NULL THEN
    IF (v_new_raw ->> 'updated_by_user_id') ~ '^[0-9]+$' THEN
      v_actor_id := (v_new_raw ->> 'updated_by_user_id')::BIGINT;
    ELSIF (v_new_raw ->> 'verified_by_user_id') ~ '^[0-9]+$' THEN
      v_actor_id := (v_new_raw ->> 'verified_by_user_id')::BIGINT;
    END IF;
  END IF;

  v_actor_name := COALESCE(
    NULLIF(btrim(COALESCE(current_setting('puc.actor_name', true), '')), ''),
    CASE WHEN v_new_raw IS NOT NULL THEN NULLIF(btrim(COALESCE(v_new_raw ->> 'updated_by_name', '')), '') ELSE NULL END,
    CASE WHEN v_new_raw IS NOT NULL THEN NULLIF(btrim(COALESCE(v_new_raw ->> 'verified_by_name', '')), '') ELSE NULL END,
    'Hệ thống quản trị HTX'
  );

  v_actor_role := COALESCE(
    NULLIF(btrim(COALESCE(current_setting('puc.actor_role', true), '')), ''),
    CASE WHEN v_new_raw IS NOT NULL THEN NULLIF(btrim(COALESCE(v_new_raw ->> 'updated_by_role', '')), '') ELSE NULL END
  );

  PERFORM pg_advisory_xact_lock(3803801);
  SELECT entry_hash INTO v_prev_hash
  FROM immutable_change_logs
  ORDER BY id DESC
  LIMIT 1;

  v_entry_hash := encode(
    sha256(
      convert_to(
        concat_ws(
          '|',
          'IMMUTABLE-LOG-V1',
          COALESCE(v_prev_hash, 'GENESIS'),
          TG_TABLE_NAME,
          v_record_id::TEXT,
          TG_OP,
          COALESCE(v_actor_name, ''),
          array_to_string(v_changed, ','),
          v_old_clean::TEXT,
          COALESCE(v_new_clean::TEXT, 'DELETED'),
          floor(extract(epoch from v_now))::BIGINT::TEXT
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  INSERT INTO immutable_change_logs (
    occurred_at,
    table_name,
    record_id,
    operation,
    household_id,
    lot_id,
    plot_code,
    actor_user_id,
    actor_name,
    actor_role,
    changed_fields,
    old_data,
    new_data,
    prev_hash,
    entry_hash
  ) VALUES (
    v_now,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_household_id,
    v_lot_id,
    v_plot_code,
    v_actor_id,
    v_actor_name,
    v_actor_role,
    v_changed,
    v_old_clean,
    v_new_clean,
    v_prev_hash,
    v_entry_hash
  );

  RETURN NULL;
END;
$$;

DO $$
DECLARE
  v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'harvest_lots',
    'harvest_contributions',
    'journal_entries',
    'spray_records',
    'lab_tests',
    'plot_season_quotas'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', v_tbl || '_immutable_audit_after', v_tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION puc_capture_immutable_change_fn()',
      v_tbl || '_immutable_audit_after',
      v_tbl
    );
  END LOOP;
END $$;

