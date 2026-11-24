-- 039_update_commune_krong_buk_admin_merger.sql:
-- Cập nhật địa danh hành chính theo quy hoạch sáp nhập mới:
-- "Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk" -> "Xã Krông Búk, Tỉnh Đắk Lắk"
-- Giữ nguyên tên pháp nhân riêng của Hợp tác xã ("Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né" / "HTX Cư Né").

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

  -- 2. Thay thế độc lập "Xã Cư Né" và "Huyện Krông Búk" sang "Xã Krông Búk"
  v_res := regexp_replace(v_res, 'XÃ\s+CƯ\s+NÉ', 'XÃ KRÔNG BÚK', 'g');
  v_res := regexp_replace(v_res, 'Xã\s+Cư\s+Né', 'Xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'xã\s+Cư\s+Né', 'xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'xã\s+cư\s+né', 'xã Krông Búk', 'gi');

  v_res := regexp_replace(v_res, 'HUYỆN\s+KR(?:Ô|O)NG\s+B(?:Ú|U)K', 'XÃ KRÔNG BÚK', 'g');
  v_res := regexp_replace(v_res, 'Huyện\s+Kr(?:ô|o)ng\s+B(?:ú|u)k', 'Xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'huyện\s+Kr(?:ô|o)ng\s+B(?:ú|u)k', 'xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'Xã\s+Krong\s+Buk', 'Xã Krông Búk', 'g');
  v_res := regexp_replace(v_res, 'xã\s+Krong\s+Buk', 'xã Krông Búk', 'g');

  -- 3. Khử trùng lặp nếu chuỗi gốc có cả hai thành phần rời nhau
  v_res := regexp_replace(
    v_res,
    '(Xã\s+Krông\s+Búk)(?:\s*[-–,]\s*Xã\s+Krông\s+Búk)+',
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
  -- 1. Vùng trồng định danh (growing_zones)
  IF to_regclass('public.growing_zones') IS NOT NULL THEN
    ALTER TABLE growing_zones ALTER COLUMN commune SET DEFAULT 'Xã Krông Búk';
    ALTER TABLE growing_zones ALTER COLUMN district SET DEFAULT '';

    UPDATE growing_zones
    SET commune = 'Xã Krông Búk',
        district = ''
    WHERE (commune ~* '^xã\s+cư\s+né$' OR district ~* 'kr(?:ô|o)ng\s+b(?:ú|u)k')
      AND (commune IS DISTINCT FROM 'Xã Krông Búk' OR district IS DISTINCT FROM '');
  END IF;

  -- 2. Cấu hình bảo chứng chính quyền & địa chỉ pháp nhân HTX trên tờ A4 QR (commune_endorsement_config)
  IF to_regclass('public.commune_endorsement_config') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'commune_endorsement_config' AND column_name = 'coop_address'
    ) THEN
      ALTER TABLE commune_endorsement_config ALTER COLUMN coop_address SET DEFAULT 'Xã Krông Búk, Tỉnh Đắk Lắk';
      UPDATE commune_endorsement_config
      SET commune_authority = puc_normalize_krong_buk_text(commune_authority),
          inspection_unit = puc_normalize_krong_buk_text(inspection_unit),
          coop_address = puc_normalize_krong_buk_text(coop_address)
      WHERE commune_authority IS DISTINCT FROM puc_normalize_krong_buk_text(commune_authority)
         OR inspection_unit IS DISTINCT FROM puc_normalize_krong_buk_text(inspection_unit)
         OR coop_address IS DISTINCT FROM puc_normalize_krong_buk_text(coop_address);
    ELSE
      UPDATE commune_endorsement_config
      SET commune_authority = puc_normalize_krong_buk_text(commune_authority),
          inspection_unit = puc_normalize_krong_buk_text(inspection_unit)
      WHERE commune_authority IS DISTINCT FROM puc_normalize_krong_buk_text(commune_authority)
         OR inspection_unit IS DISTINCT FROM puc_normalize_krong_buk_text(inspection_unit);
    END IF;
  END IF;

  -- 3. Hạn ngạch sản lượng trần đầu vụ (plot_season_quotas)
  IF to_regclass('public.plot_season_quotas') IS NOT NULL THEN
    ALTER TABLE plot_season_quotas ALTER COLUMN assessed_by SET DEFAULT 'Tổ Giám sát Kỹ thuật UBND Xã Krông Búk';
    UPDATE plot_season_quotas
    SET assessed_by = puc_normalize_krong_buk_text(assessed_by)
    WHERE assessed_by IS DISTINCT FROM puc_normalize_krong_buk_text(assessed_by);
  END IF;

  -- 4. Địa chỉ cơ sở đóng gói trên lô hàng (harvest_lots) và doanh nghiệp (enterprises)
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

  IF to_regclass('public.enterprises') IS NOT NULL THEN
    UPDATE enterprises
    SET address = puc_normalize_krong_buk_text(address)
    WHERE address IS NOT NULL
      AND address IS DISTINCT FROM puc_normalize_krong_buk_text(address);
  END IF;

  -- 5. Thẻ đoàn thẩm định thực địa (field_audit_passes) & Biển QR thửa đất (plot_signboard_tokens)
  IF to_regclass('public.field_audit_passes') IS NOT NULL THEN
    UPDATE field_audit_passes
    SET issued_by_name = puc_normalize_krong_buk_text(issued_by_name),
        note = puc_normalize_krong_buk_text(note)
    WHERE issued_by_name IS DISTINCT FROM puc_normalize_krong_buk_text(issued_by_name)
       OR note IS DISTINCT FROM puc_normalize_krong_buk_text(note);
  END IF;

  IF to_regclass('public.plot_signboard_tokens') IS NOT NULL THEN
    UPDATE plot_signboard_tokens
    SET village_name = puc_normalize_krong_buk_text(village_name)
    WHERE village_name IS NOT NULL
      AND village_name IS DISTINCT FROM puc_normalize_krong_buk_text(village_name);
  END IF;

  IF to_regclass('public.plots') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'plots' AND column_name = 'village'
    ) THEN
      UPDATE plots
      SET village = puc_normalize_krong_buk_text(village)
      WHERE village IS NOT NULL
        AND village IS DISTINCT FROM puc_normalize_krong_buk_text(village);
    END IF;
  END IF;

  -- 6. Thôn/xã, phân quyền địa bàn tài khoản, khóa tập huấn và bản tin công khai
  IF to_regclass('public.villages') IS NOT NULL THEN
    UPDATE villages v
    SET name = puc_normalize_krong_buk_text(v.name)
    WHERE v.name IS DISTINCT FROM puc_normalize_krong_buk_text(v.name)
      AND NOT EXISTS (
        SELECT 1 FROM villages v2
        WHERE lower(v2.name) = lower(puc_normalize_krong_buk_text(v.name))
          AND v2.id <> v.id
      );
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'assigned_commune'
    ) THEN
      UPDATE users
      SET assigned_commune = puc_normalize_krong_buk_text(assigned_commune),
          assigned_region = puc_normalize_krong_buk_text(assigned_region)
      WHERE assigned_commune IS DISTINCT FROM puc_normalize_krong_buk_text(assigned_commune)
         OR assigned_region IS DISTINCT FROM puc_normalize_krong_buk_text(assigned_region);
    END IF;
  END IF;

  IF to_regclass('public.training_courses') IS NOT NULL THEN
    UPDATE training_courses
    SET location = puc_normalize_krong_buk_text(location)
    WHERE location IS NOT NULL
      AND location IS DISTINCT FROM puc_normalize_krong_buk_text(location);
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
