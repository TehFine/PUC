-- 021_late_declaration_tracking.sql:
-- Ghi nhận đồng thời ngày thực hiện người dùng chọn và thời điểm khai báo thực tế trên máy chủ,
-- tính chính xác số ngày khai báo chậm (late_declaration_days) và tự động điều chỉnh cửa sổ nhắc sớm (reminder_lead_days) cho lần sau.

ALTER TABLE care_milestone_declarations
  ADD COLUMN IF NOT EXISTS declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS declared_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  ADD COLUMN IF NOT EXISTS late_declaration_days INTEGER NOT NULL DEFAULT 0 CHECK (late_declaration_days >= 0),
  ADD COLUMN IF NOT EXISTS late_reason TEXT;

UPDATE care_milestone_declarations
SET declared_at = created_at,
    declared_on = (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    late_declaration_days = GREATEST(0, ((created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - performed_on))
WHERE late_declaration_days = 0
  AND ((created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date > performed_on);

ALTER TABLE plot_care_plans
  ADD COLUMN IF NOT EXISTS reminder_lead_days INTEGER NOT NULL DEFAULT 1 CHECK (reminder_lead_days BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS last_late_declaration_days INTEGER NOT NULL DEFAULT 0 CHECK (last_late_declaration_days >= 0);

ALTER TABLE care_protocol_alert_logs DROP CONSTRAINT IF EXISTS care_protocol_alert_logs_alert_type_check;
ALTER TABLE care_protocol_alert_logs
  ADD CONSTRAINT care_protocol_alert_logs_alert_type_check
  CHECK (alert_type IN ('due_soon', 'due_day_prompt', 'overdue_warning', 'overdue_critical', 'next_stage'));

