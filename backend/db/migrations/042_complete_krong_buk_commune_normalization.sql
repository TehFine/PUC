-- 042_complete_krong_buk_commune_normalization.sql:
-- Hoàn thiện chuẩn hóa địa danh hành chính sau sáp nhập trên toàn bộ các bảng dữ liệu thực tế chuyển từ Supabase:
-- - Xã Cư Né cũ / Huyện Krông Búk cũ -> "Xã Krông Búk" (Tỉnh Đắk Lắk)
-- - "Xã Ea Khăl, Huyện Krông Búk" -> "Xã Ea Khăl" (không nhân đôi thành "Xã Ea Khăl, Xã Krông Búk")
-- - "Thôn ..., Cư Né" / "Buôn ..., Cư Né" / cột xã ghi ngắn "Cư Né" -> "Xã Krông Búk"
-- - Bảo toàn tuyệt đối 100% tên riêng pháp nhân của Hợp tác xã ("Hợp tác xã ... Cư Né", "HTX ... Cư Né")
--   và không làm thay đổi chuỗi băm niêm phong nhật ký hay sinh bản ghi giả trong immutable_change_logs.

CREATE OR REPLACE FUNCTION puc_normalize_krong_buk_text(p_val TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_res TEXT;
BEGIN
  IF p_val IS NULL OR btrim(p_val) = '' THEN
    RETURN p_val;
  END IF;

  v_res := p_val;

  -- Bảo toàn danh xưng pháp nhân "Hợp tác xã ..." không bị nhận nhầm là cấp hành chính "xã ..."
  v_res := replace(v_res, 'HỢP TÁC XÃ', '__PUC_HTX_UPPER__');
  v_res := replace(v_res, 'Hợp Tác Xã', '__PUC_HTX_TITLE2__');
  v_res := replace(v_res, 'Hợp tác xã', '__PUC_HTX_TITLE__');
  v_res := replace(v_res, 'hợp tác xã', '__PUC_HTX_LOWER__');

  -- 0. Giữ đúng xã lân cận "Xã Ea Khăl" khi đi kèm "Huyện Krông Búk" cũ (hoặc nếu từng bị đổi thành "Xã Ea Khăl, Xã Krông Búk")
  v_res := regexp_replace(
    v_res,
    '(XÃ\s+EA\s+KH(?:Ă|A)L)\s*(?:[-–,])\s*(?:HUYỆN\s+|XÃ\s+)?KR(?:Ô|O)NG\s+B(?:Ú|U)K',
    '\1',
    'g'
  );
  v_res := regexp_replace(
    v_res,
    '((?:Xã|xã)\s+Ea\s+Kh(?:ă|a)l)\s*(?:[-–,])\s*(?:Huyện\s+|huyện\s+|Xã\s+|xã\s+)?Kr(?:ô|o)ng\s+B(?:ú|u)k',
    '\1',
    'g'
  );

  -- 1. Gộp cụm "Xã Cư Né, Huyện Krông Búk" / "Xã Cư Né - Huyện Krông Búk" / "Xã Cư Né, Krông Búk"
  v_res := regexp_replace(
    v_res,
    'XÃ\s+CƯ\s+NÉ\s*(?:[-–,]|VÀ)\s*(?:HUYỆN\s+)?KR(?:Ô|O)NG\s+B(?:Ú|U)K',
    'XÃ KRÔNG BÚK',
    'g'
  );
  v_res := regexp_replace(
    v_res,
    'Xã\s+Cư\s+Né\s*(?:[-–,]|và)\s*(?:Huyện\s+|huyện\s+)?Kr(?:ô|o)ng\s+B(?:ú|u)k',
    'Xã Krông Búk',
    'g'
  );
  v_res := regexp_replace(
    v_res,
    'xã\s+Cư\s+Né\s*(?:[-–,]|và)\s*(?:huyện\s+|Huyện\s+)?Kr(?:ô|o)ng\s+B(?:ú|u)k',
    'xã Krông Búk',
    'g'
  );
  v_res := regexp_replace(
    v_res,
    'xã\s+cư\s+né\s*(?:[-–,]|và)\s*(?:huyện\s+)?kr(?:ô|o)ng\s+b(?:ú|u)k',
    'xã Krông Búk',
    'gi'
  );

  -- 2. Địa chỉ thôn/buôn ghi tắt "Thôn ..., Cư Né" hoặc ", Cư Né, Krông Búk" / ", Cư Né, Đắk Lắk" (không có chữ Xã phía trước)
  v_res := regexp_replace(
    v_res,
    '((?:Thôn|thôn|Buôn|buôn)\s+[^,;()\n]{1,40}?\s*[-–,]\s*)Cư\s+Né(?:\s*[-–,]\s*(?:Huyện\s+|huyện\s+|Xã\s+|xã\s+)?Kr(?:ô|o)ng\s+B(?:ú|u)k)?',
    '\1Xã Krông Búk',
    'g'
  );
  v_res := regexp_replace(
    v_res,
    '(,\s*)Cư\s+Né(\s*,\s*(?:Huyện\s+|huyện\s+|Xã\s+|xã\s+)?Kr(?:ô|o)ng\s+B(?:ú|u)k)',
    '\1Xã Krông Búk',
    'g'
  );
  v_res := regexp_replace(
    v_res,
    '(,\s*)Cư\s+Né(\s*,\s*(?:Tỉnh\s+|tỉnh\s+)?Đắk\s+Lắk)',
    '\1Xã Krông Búk\2',
    'g'
  );

  -- 3. Thay thế độc lập "Xã Cư Né" và "Huyện Krông Búk" sang "Xã Krông Búk"
  v_res := regexp_replace(v_res, 'XÃ\s+CƯ\s+NÉ', 'XÃ KRÔNG BÚK', 'g');
  v_res := regexp_replace(v_res, 'Xã\s+Cư\s+Né', 'Xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'xã\s+Cư\s+Né', 'xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'xã\s+cư\s+né', 'xã Krông Búk', 'gi');

  v_res := regexp_replace(v_res, 'HUYỆN\s+KR(?:Ô|O)NG\s+B(?:Ú|U)K', 'XÃ KRÔNG BÚK', 'g');
  v_res := regexp_replace(v_res, 'Huyện\s+Kr(?:ô|o)ng\s+B(?:ú|u)k', 'Xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'huyện\s+Kr(?:ô|o)ng\s+B(?:ú|u)k', 'xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'Xã\s+Krong\s+Buk', 'Xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'xã\s+Krong\s+Buk', 'xã Krông Búk', 'g');

  -- 4. Khử trùng lặp nếu chuỗi gốc có cả hai thành phần rời nhau
  v_res := regexp_replace(
    v_res,
    '(Xã\s+Krông\s+Búk)(?:\s*[-–,]\s*(?:Xã\s+)?Krông\s+Búk)+',
    '\1',
    'gi'
  );

  -- Khôi phục danh xưng pháp nhân Hợp tác xã
  v_res := replace(v_res, '__PUC_HTX_UPPER__', 'HỢP TÁC XÃ');
  v_res := replace(v_res, '__PUC_HTX_TITLE2__', 'Hợp Tác Xã');
  v_res := replace(v_res, '__PUC_HTX_TITLE__', 'Hợp tác xã');
  v_res := replace(v_res, '__PUC_HTX_LOWER__', 'hợp tác xã');

  RETURN v_res;
END;
$$;

DO $$
BEGIN
  -- Tạm tắt ghi vết chỉnh sửa tự động để không tạo dòng giả trong immutable_change_logs và không đổi chuỗi băm niêm phong
  PERFORM set_config('puc.seeding', 'on', true);
  PERFORM set_config('puc.rechaining', 'on', true);

  -- 1. Vùng trồng định danh (growing_zones)
  IF to_regclass('public.growing_zones') IS NOT NULL THEN
    ALTER TABLE growing_zones ALTER COLUMN commune SET DEFAULT 'Xã Krông Búk';
    ALTER TABLE growing_zones ALTER COLUMN district SET DEFAULT '';

    UPDATE growing_zones
    SET commune = CASE
          WHEN btrim(COALESCE(commune, '')) ~* '^(?:xã\s+)?cư\s*né$'
            OR btrim(COALESCE(commune, '')) ~* '^(?:huyện\s+|xã\s+)?kr(?:ô|o)ng\s+b(?:ú|u)k$'
            OR btrim(COALESCE(commune, '')) = ''
          THEN 'Xã Krông Búk'
          ELSE puc_normalize_krong_buk_text(commune)
        END,
        district = '',
        name = puc_normalize_krong_buk_text(name)
    WHERE commune IS DISTINCT FROM (
            CASE
              WHEN btrim(COALESCE(commune, '')) ~* '^(?:xã\s+)?cư\s*né$'
                OR btrim(COALESCE(commune, '')) ~* '^(?:huyện\s+|xã\s+)?kr(?:ô|o)ng\s+b(?:ú|u)k$'
                OR btrim(COALESCE(commune, '')) = ''
              THEN 'Xã Krông Búk'
              ELSE puc_normalize_krong_buk_text(commune)
            END
          )
       OR COALESCE(district, '') <> ''
       OR name IS DISTINCT FROM puc_normalize_krong_buk_text(name);
  END IF;

  -- 2. Cấu hình bảo chứng chính quyền & địa chỉ pháp nhân HTX trên hồ sơ A4 (commune_endorsement_config)
  IF to_regclass('public.commune_endorsement_config') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'commune_endorsement_config' AND column_name = 'coop_address'
    ) THEN
      ALTER TABLE commune_endorsement_config ALTER COLUMN coop_address SET DEFAULT 'Xã Krông Búk, Tỉnh Đắk Lắk';
      UPDATE commune_endorsement_config
      SET commune_authority = puc_normalize_krong_buk_text(commune_authority),
          inspection_unit = puc_normalize_krong_buk_text(inspection_unit),
          coop_address = CASE
            WHEN btrim(COALESCE(coop_address, '')) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk, Tỉnh Đắk Lắk'
            ELSE puc_normalize_krong_buk_text(coop_address)
          END
      WHERE commune_authority IS DISTINCT FROM puc_normalize_krong_buk_text(commune_authority)
         OR inspection_unit IS DISTINCT FROM puc_normalize_krong_buk_text(inspection_unit)
         OR coop_address IS DISTINCT FROM (
              CASE
                WHEN btrim(COALESCE(coop_address, '')) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk, Tỉnh Đắk Lắk'
                ELSE puc_normalize_krong_buk_text(coop_address)
              END
            );
    END IF;
  END IF;

  -- 3. Thôn/buôn (villages) và địa bàn xã của thôn (commune_location)
  IF to_regclass('public.villages') IS NOT NULL THEN
    UPDATE villages v
    SET name = puc_normalize_krong_buk_text(v.name)
    WHERE v.name IS DISTINCT FROM puc_normalize_krong_buk_text(v.name)
      AND NOT EXISTS (
        SELECT 1 FROM villages v2
        WHERE lower(v2.name) = lower(puc_normalize_krong_buk_text(v.name))
          AND v2.id <> v.id
      );

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'villages' AND column_name = 'commune_location'
    ) THEN
      UPDATE villages
      SET commune_location = CASE
        WHEN name ~* '(ea\s*kh(a|ă)l|ea\s*k''?s(o|ô))' THEN 'Xã Ea Khăl, Tỉnh Đắk Lắk'
        ELSE 'Xã Krông Búk, Tỉnh Đắk Lắk'
      END
      WHERE commune_location IS NULL
         OR commune_location ~* 'cư\s*né'
         OR commune_location ~ 'tỉnh\s+Đắk\s+Lắk'
         OR commune_location ~* 'Xã\s+Ea\s+Kh(?:ă|a)l\s*,\s*Xã\s+Krông\s+Búk';
    END IF;
  END IF;

  -- 4. Thửa đất (plots) & Biển QR thửa đất (plot_signboard_tokens) & Hạn ngạch đầu vụ (plot_season_quotas)
  IF to_regclass('public.plots') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'plots' AND column_name = 'village'
    ) THEN
      UPDATE plots
      SET village = CASE
        WHEN btrim(village) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
        ELSE puc_normalize_krong_buk_text(village)
      END
      WHERE village IS NOT NULL
        AND village IS DISTINCT FROM (
          CASE
            WHEN btrim(village) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
            ELSE puc_normalize_krong_buk_text(village)
          END
        );
    END IF;
  END IF;

  IF to_regclass('public.plot_signboard_tokens') IS NOT NULL THEN
    UPDATE plot_signboard_tokens
    SET village_name = CASE
      WHEN btrim(village_name) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
      ELSE puc_normalize_krong_buk_text(village_name)
    END
    WHERE village_name IS NOT NULL
      AND village_name IS DISTINCT FROM (
        CASE
          WHEN btrim(village_name) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
          ELSE puc_normalize_krong_buk_text(village_name)
        END
      );
  END IF;

  IF to_regclass('public.plot_season_quotas') IS NOT NULL THEN
    UPDATE plot_season_quotas
    SET assessed_by = puc_normalize_krong_buk_text(assessed_by)
    WHERE assessed_by IS DISTINCT FROM puc_normalize_krong_buk_text(assessed_by);
  END IF;

  -- 5. Lô hàng (harvest_lots), Sự kiện chuỗi cung ứng (supply_chain_events) và Doanh nghiệp (enterprises)
  IF to_regclass('public.harvest_lots') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'harvest_lots' AND column_name = 'packhouse_address'
    ) THEN
      UPDATE harvest_lots
      SET packhouse_address = puc_normalize_krong_buk_text(packhouse_address)
      WHERE packhouse_address IS NOT NULL
        AND packhouse_address IS DISTINCT FROM puc_normalize_krong_buk_text(packhouse_address);
    END IF;
  END IF;

  IF to_regclass('public.supply_chain_events') IS NOT NULL THEN
    UPDATE supply_chain_events
    SET location_name = puc_normalize_krong_buk_text(location_name),
        summary = puc_normalize_krong_buk_text(summary)
    WHERE location_name IS DISTINCT FROM puc_normalize_krong_buk_text(location_name)
       OR summary IS DISTINCT FROM puc_normalize_krong_buk_text(summary);
  END IF;

  IF to_regclass('public.enterprises') IS NOT NULL THEN
    UPDATE enterprises
    SET address = puc_normalize_krong_buk_text(address)
    WHERE address IS NOT NULL
      AND address IS DISTINCT FROM puc_normalize_krong_buk_text(address);
  END IF;

  -- 6. Lịch kiểm tra, Biên bản kiểm tra, Thẻ đoàn thẩm định, Khóa tập huấn, Tin tức và Phân quyền xã của cán bộ
  IF to_regclass('public.inspection_schedule') IS NOT NULL THEN
    UPDATE inspection_schedule
    SET title = puc_normalize_krong_buk_text(title)
    WHERE title IS DISTINCT FROM puc_normalize_krong_buk_text(title);
  END IF;

  IF to_regclass('public.inspection_minutes') IS NOT NULL THEN
    UPDATE inspection_minutes
    SET location = CASE
      WHEN btrim(location) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
      ELSE puc_normalize_krong_buk_text(location)
    END
    WHERE location IS DISTINCT FROM (
      CASE
        WHEN btrim(location) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
        ELSE puc_normalize_krong_buk_text(location)
      END
    );
  END IF;

  IF to_regclass('public.field_audit_passes') IS NOT NULL THEN
    UPDATE field_audit_passes
    SET issued_by_name = puc_normalize_krong_buk_text(issued_by_name),
        note = puc_normalize_krong_buk_text(note)
    WHERE issued_by_name IS DISTINCT FROM puc_normalize_krong_buk_text(issued_by_name)
       OR note IS DISTINCT FROM puc_normalize_krong_buk_text(note);
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'assigned_commune'
    ) THEN
      UPDATE users
      SET assigned_commune = CASE
            WHEN btrim(COALESCE(assigned_commune, '')) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
            ELSE puc_normalize_krong_buk_text(assigned_commune)
          END,
          assigned_region = puc_normalize_krong_buk_text(assigned_region)
      WHERE assigned_commune IS DISTINCT FROM (
              CASE
                WHEN btrim(COALESCE(assigned_commune, '')) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
                ELSE puc_normalize_krong_buk_text(assigned_commune)
              END
            )
         OR assigned_region IS DISTINCT FROM puc_normalize_krong_buk_text(assigned_region);
    END IF;
  END IF;

  IF to_regclass('public.training_courses') IS NOT NULL THEN
    UPDATE training_courses
    SET title = puc_normalize_krong_buk_text(title),
        location = CASE
          WHEN btrim(COALESCE(location, '')) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
          ELSE puc_normalize_krong_buk_text(location)
        END,
        description = puc_normalize_krong_buk_text(description)
    WHERE title IS DISTINCT FROM puc_normalize_krong_buk_text(title)
       OR location IS DISTINCT FROM (
            CASE
              WHEN btrim(COALESCE(location, '')) ~* '^(?:xã\s+)?cư\s*né$' THEN 'Xã Krông Búk'
              ELSE puc_normalize_krong_buk_text(location)
            END
          )
       OR description IS DISTINCT FROM puc_normalize_krong_buk_text(description);
  END IF;

  IF to_regclass('public.news_articles') IS NOT NULL THEN
    UPDATE news_articles
    SET title = puc_normalize_krong_buk_text(title),
        excerpt = puc_normalize_krong_buk_text(excerpt),
        content = puc_normalize_krong_buk_text(content::text)::jsonb
    WHERE title IS DISTINCT FROM puc_normalize_krong_buk_text(title)
       OR excerpt IS DISTINCT FROM puc_normalize_krong_buk_text(excerpt)
       OR content::text IS DISTINCT FROM puc_normalize_krong_buk_text(content::text);
  END IF;
END $$;

