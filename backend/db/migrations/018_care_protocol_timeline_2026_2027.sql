-- 018_care_protocol_timeline_2026_2027.sql:
-- Lộ trình chăm sóc sầu riêng chuẩn niên vụ 2026-2027 (theo tài liệu Quy trình sầu riêng 2026-2027_1.xlsx):
-- 1. Mở rộng loại thông báo ('protocol') cho nhắc lịch giai đoạn, cảnh báo trễ hạn / sai phác đồ và thông báo giai đoạn tiếp theo.
-- 2. Bảng kế hoạch chăm sóc theo từng thửa vườn (plot_care_plans).
-- 3. Bảng khai báo thực hiện từng mốc ngày & điều tiết đọt SenPro (care_milestone_declarations) có gắn ảnh hiện trường + ảnh hóa đơn vật tư.
-- 4. Bảng nhật ký chống gửi trùng cảnh báo tự động (care_protocol_alert_logs).

-- ============================================================================
-- 1. Mở rộng loại thông báo 'protocol'
-- ============================================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('approval', 'violation', 'harvest', 'training', 'schedule', 'lab', 'system', 'protocol'));

-- ============================================================================
-- 2. Bảng kế hoạch & con trỏ tiến độ quy trình chăm sóc 2026-2027 theo thửa
-- ============================================================================
CREATE TABLE IF NOT EXISTS plot_care_plans (
  id BIGSERIAL PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plot_code TEXT NOT NULL,
  season TEXT NOT NULL DEFAULT '2026-2027',
  cycle_start_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  start_milestone_seq INTEGER NOT NULL DEFAULT 1 CHECK (start_milestone_seq BETWEEN 1 AND 30),
  current_milestone_code TEXT NOT NULL DEFAULT 'cb-rua-vuon',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, plot_code, season)
);
CREATE INDEX IF NOT EXISTS plot_care_plans_household_idx ON plot_care_plans (household_id);
CREATE INDEX IF NOT EXISTS plot_care_plans_status_idx ON plot_care_plans (status, current_milestone_code);

DROP TRIGGER IF EXISTS plot_care_plans_set_updated_at ON plot_care_plans;
CREATE TRIGGER plot_care_plans_set_updated_at
BEFORE UPDATE ON plot_care_plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. Bảng khai báo thực hiện từng mốc quy trình & phụ lục SenPro
-- ============================================================================
CREATE TABLE IF NOT EXISTS care_milestone_declarations (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plot_care_plans(id) ON DELETE CASCADE,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plot_code TEXT NOT NULL,
  stage_code TEXT NOT NULL,
  milestone_code TEXT NOT NULL,
  is_senpro BOOLEAN NOT NULL DEFAULT false,
  scheduled_on DATE,
  due_on DATE,
  performed_on DATE NOT NULL,
  expected_tree_state TEXT NOT NULL,
  actual_tree_state TEXT NOT NULL,
  followed_standard BOOLEAN NOT NULL DEFAULT true,
  selected_products JSONB NOT NULL DEFAULT '[]'::jsonb,
  actual_dosage TEXT NOT NULL,
  extra_inputs TEXT,
  supplier_name TEXT,
  pesticide_id BIGINT REFERENCES pesticides(id) ON DELETE SET NULL,
  pesticide_dose TEXT,
  field_photo_id BIGINT NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
  invoice_photo_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL,
  latitude NUMERIC(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  gps_verified BOOLEAN NOT NULL DEFAULT false,
  gps_distance_m NUMERIC(10, 1),
  journal_entry_id BIGINT REFERENCES journal_entries(id) ON DELETE SET NULL,
  spray_record_id BIGINT REFERENCES spray_records(id) ON DELETE SET NULL,
  compliance_status TEXT NOT NULL CHECK (compliance_status IN ('compliant', 'warning', 'violation')),
  compliance_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  farmer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_decl_plan_idx ON care_milestone_declarations (plan_id, performed_on DESC);
CREATE INDEX IF NOT EXISTS care_decl_household_idx ON care_milestone_declarations (household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS care_decl_compliance_idx ON care_milestone_declarations (compliance_status);

-- ============================================================================
-- 4. Bảng theo dõi cảnh báo tự động theo mốc (chống gửi lặp thông báo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS care_protocol_alert_logs (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plot_care_plans(id) ON DELETE CASCADE,
  milestone_code TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('due_soon', 'overdue_warning', 'overdue_critical', 'next_stage')),
  violation_id BIGINT REFERENCES violations(id) ON DELETE SET NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, milestone_code, alert_type)
);
CREATE INDEX IF NOT EXISTS care_alert_logs_plan_idx ON care_protocol_alert_logs (plan_id);

-- ============================================================================
-- 5. Khởi tạo sẵn lộ trình 2026-2027 cho các thửa vườn hiện có trong CSDL
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    INSERT INTO plot_care_plans (household_id, plot_code, season, cycle_start_on, start_milestone_seq, current_milestone_code)
    SELECT p.household_id, p.code, '2026-2027',
           ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 2),
           1,
           'cb-rua-vuon'
    FROM plots p
    WHERE p.household_id IS NOT NULL
    ON CONFLICT (household_id, plot_code, season) DO NOTHING;
  ELSIF to_regclass('public.plot_signboard_tokens') IS NOT NULL THEN
    INSERT INTO plot_care_plans (household_id, plot_code, season, cycle_start_on, start_milestone_seq, current_milestone_code)
    SELECT pst.household_id, pst.plot_code, '2026-2027',
           ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 2),
           1,
           'cb-rua-vuon'
    FROM plot_signboard_tokens pst
    WHERE pst.household_id IS NOT NULL
    ON CONFLICT (household_id, plot_code, season) DO NOTHING;
  END IF;
END $$;
