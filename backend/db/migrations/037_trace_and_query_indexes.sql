-- 037_trace_and_query_indexes.sql
-- Bổ sung chỉ mục tổ hợp và chỉ mục biểu thức đồng bộ cho truy xuất QR, kiểm nghiệm, nhật ký, biên bản và phạm vi quản lý.

DO $$
BEGIN
  IF to_regclass('public.lab_tests') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS lab_tests_sampled_on_idx
      ON lab_tests (sampled_on DESC, id DESC);
    CREATE INDEX IF NOT EXISTS lab_tests_hh_sampled_on_idx
      ON lab_tests (household_id, sampled_on DESC, id DESC);
  END IF;

  IF to_regclass('public.plot_season_quotas') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS plot_season_quotas_year_plot_upper_idx
      ON plot_season_quotas (season_year, upper(btrim(plot_code)));
    CREATE INDEX IF NOT EXISTS plot_season_quotas_hh_year_idx
      ON plot_season_quotas (household_id, season_year);
  END IF;

  IF to_regclass('public.harvest_contributions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS harvest_contributions_plot_btrim_upper_idx
      ON harvest_contributions (upper(btrim(plot_code)), lot_id)
      WHERE plot_code IS NOT NULL AND btrim(plot_code) <> '';
  END IF;

  IF to_regclass('public.harvest_lots') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS harvest_lots_coop_harvested_idx
      ON harvest_lots (upper(COALESCE(coop_code, 'HTX-CUNE')), harvested_on DESC, id DESC);
    CREATE INDEX IF NOT EXISTS harvest_lots_ent_harvested_idx
      ON harvest_lots (enterprise_id, harvested_on DESC, id DESC)
      WHERE enterprise_id IS NOT NULL;
  END IF;

  IF to_regclass('public.spray_records') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS spray_records_sprayed_on_idx
      ON spray_records (sprayed_on DESC, id DESC);
    CREATE INDEX IF NOT EXISTS spray_records_hh_id_asc_idx
      ON spray_records (household_id, id ASC);
    CREATE INDEX IF NOT EXISTS spray_records_plot_upper_idx
      ON spray_records (upper(btrim(plot_code)))
      WHERE plot_code IS NOT NULL AND btrim(plot_code) <> '';
  END IF;

  IF to_regclass('public.journal_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS journal_entries_hh_id_asc_idx
      ON journal_entries (household_id, id ASC);
    CREATE INDEX IF NOT EXISTS journal_entries_plot_upper_idx
      ON journal_entries (upper(btrim(plot_code)))
      WHERE plot_code IS NOT NULL AND btrim(plot_code) <> '';
  END IF;

  IF to_regclass('public.inspection_minutes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS inspection_minutes_held_on_idx
      ON inspection_minutes (held_on DESC, id DESC);
    CREATE INDEX IF NOT EXISTS inspection_minutes_hh_held_idx
      ON inspection_minutes (household_id, held_on DESC, id DESC)
      WHERE household_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS inspection_minutes_plot_upper_held_idx
      ON inspection_minutes (upper(btrim(plot_code)), held_on DESC, id DESC)
      WHERE plot_code IS NOT NULL AND btrim(plot_code) <> '';
  END IF;

  IF to_regclass('public.trace_detail_access_logs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS trace_detail_access_logs_viewed_idx
      ON trace_detail_access_logs (viewed_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS trace_detail_access_logs_lot_only_idx
      ON trace_detail_access_logs (upper(lot_code), viewed_at DESC)
      WHERE lot_code IS NOT NULL;
  END IF;

  IF to_regclass('public.trace_access_requests') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS trace_access_requests_req_code_upper_idx
      ON trace_access_requests (upper(request_code));
    CREATE INDEX IF NOT EXISTS trace_access_requests_status_expires_idx
      ON trace_access_requests (status, expires_at);
  END IF;

  IF to_regclass('public.growing_zones') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS growing_zones_code_upper_idx
      ON growing_zones (upper(code));
  END IF;

  IF to_regclass('public.enterprises') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS enterprises_packhouse_upper_idx
      ON enterprises (upper(btrim(packhouse_code)))
      WHERE packhouse_code IS NOT NULL AND btrim(packhouse_code) <> '';
  END IF;

  IF to_regclass('public.households') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS households_phone_idx
      ON households (phone);
    CREATE INDEX IF NOT EXISTS households_village_status_idx
      ON households (village_id, status);
  END IF;

  IF to_regclass('public.plot_signboard_tokens') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS plot_signboard_tokens_zone_upper_idx
      ON plot_signboard_tokens (upper(btrim(zone_code)))
      WHERE zone_code IS NOT NULL;
  END IF;

  IF to_regclass('public.plots') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS plots_zone_upper_idx
      ON plots (upper(btrim(zone_code)))
      WHERE zone_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS plots_unlinked_village_lower_idx
      ON plots (lower(btrim(village)))
      WHERE household_id IS NULL;
  END IF;
END $$;

