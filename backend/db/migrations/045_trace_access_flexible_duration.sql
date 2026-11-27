-- 045_trace_access_flexible_duration.sql
-- Mở rộng cột duration_hours trên bảng trace_access_requests sang NUMERIC(6, 2)
-- để hỗ trợ các mốc thời hạn linh hoạt từ 15 phút (0.25 giờ), 30 phút (0.5 giờ), 1 tiếng, 2 tiếng... đến 14 ngày (336 giờ).

DO $$
DECLARE
  v_con RECORD;
BEGIN
  IF to_regclass('public.trace_access_requests') IS NOT NULL THEN
    FOR v_con IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.trace_access_requests'::regclass
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%duration_hours%'
    LOOP
      EXECUTE format('ALTER TABLE public.trace_access_requests DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;

    ALTER TABLE public.trace_access_requests
      ALTER COLUMN duration_hours TYPE NUMERIC(6, 2)
      USING duration_hours::numeric(6, 2);

    ALTER TABLE public.trace_access_requests
      ALTER COLUMN duration_hours SET DEFAULT 24;

    ALTER TABLE public.trace_access_requests
      ADD CONSTRAINT trace_access_requests_duration_hours_check
      CHECK (duration_hours >= 0.25 AND duration_hours <= 336);
  END IF;
END $$;

