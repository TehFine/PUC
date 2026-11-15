-- 015_traceability_hardening_and_china_ready.sql:
-- 4a. Liên kết Lô ↔ Thửa nguồn (harvest_contributions.plot_code) phục vụ truy vết sự cố hai chiều.
-- 4b. Mã QR chống giả bằng token ngẫu nhiên Base62 (qr_token) & theo dõi quốc gia quét (country_code).
-- 4c. Đăng ký trạng thái thời gian thực cho Mã vùng trồng (growing_zones) & Cơ sở đóng gói (enterprises).
-- 4f. Cờ trạng thái kiểm chứng (record_status) cho phiếu kiểm nghiệm (chỉ hiển thị bản đã duyệt ra công khai).

-- 1. Hàm sinh token ngẫu nhiên 14 ký tự Base62 dùng CSPRNG nhân PostgreSQL (không cần extension ngoài)
CREATE OR REPLACE FUNCTION puc_random_qr_token(p_len INT DEFAULT 14)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  v_raw TEXT;
  v_out TEXT := '';
  v_idx INT;
  i INT;
BEGIN
  v_raw := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  FOR i IN 1..GREATEST(8, LEAST(p_len, 30)) LOOP
    v_idx := (('x' || substr(v_raw, ((i - 1) * 2) + 1, 2))::bit(8)::int % 62) + 1;
    v_out := v_out || substr(v_alphabet, v_idx, 1);
  END LOOP;
  RETURN v_out;
END;
$$;

-- 2. (4a) Quan hệ Lô ↔ Thửa nguồn trên bảng harvest_contributions
ALTER TABLE harvest_contributions
  ADD COLUMN IF NOT EXISTS plot_code TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    UPDATE harvest_contributions hc
    SET plot_code = sub.code
    FROM (
      SELECT DISTINCT ON (p.household_id) p.household_id, p.code
      FROM plots p
      WHERE p.household_id IS NOT NULL AND p.code IS NOT NULL AND btrim(p.code) <> ''
      ORDER BY p.household_id, (p.status = 'approved') DESC, p.id ASC
    ) sub
    WHERE hc.household_id = sub.household_id
      AND (hc.plot_code IS NULL OR hc.plot_code = '');
  END IF;

  -- Dự phòng nếu môi trường không có PostGIS plots: lấy mã thửa từ nhật ký phun/canh tác hoặc kiểm nghiệm
  UPDATE harvest_contributions hc
  SET plot_code = sub.plot_code
  FROM (
    SELECT DISTINCT ON (lt.household_id) lt.household_id, lt.plot_code
    FROM lab_tests lt
    WHERE lt.plot_code IS NOT NULL AND btrim(lt.plot_code) <> ''
    ORDER BY lt.household_id, lt.sampled_on DESC, lt.id DESC
  ) sub
  WHERE hc.household_id = sub.household_id
    AND (hc.plot_code IS NULL OR hc.plot_code = '');
END $$;

ALTER TABLE harvest_contributions
  DROP CONSTRAINT IF EXISTS harvest_contributions_lot_id_household_id_key;

ALTER TABLE harvest_contributions
  DROP CONSTRAINT IF EXISTS harvest_contributions_lot_hh_plot_key;

ALTER TABLE harvest_contributions
  ADD CONSTRAINT harvest_contributions_lot_hh_plot_key
  UNIQUE (lot_id, household_id, plot_code);

CREATE INDEX IF NOT EXISTS harvest_contributions_plot_upper_idx
  ON harvest_contributions (upper(plot_code))
  WHERE plot_code <> '';

-- 3. (4b) Token QR ngẫu nhiên chống đoán tuần tự cho Lô (harvest_lots), Thùng/Quả (harvest_items) & Tem nông hộ (farmer_stamps)
ALTER TABLE harvest_lots ADD COLUMN IF NOT EXISTS qr_token TEXT;
UPDATE harvest_lots SET qr_token = puc_random_qr_token(14) WHERE qr_token IS NULL;
ALTER TABLE harvest_lots ALTER COLUMN qr_token SET DEFAULT puc_random_qr_token(14);
ALTER TABLE harvest_lots ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS harvest_lots_qr_token_idx ON harvest_lots (qr_token);

ALTER TABLE harvest_items ADD COLUMN IF NOT EXISTS qr_token TEXT;
UPDATE harvest_items SET qr_token = puc_random_qr_token(14) WHERE qr_token IS NULL;
ALTER TABLE harvest_items ALTER COLUMN qr_token SET DEFAULT puc_random_qr_token(14);
ALTER TABLE harvest_items ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS harvest_items_qr_token_idx ON harvest_items (qr_token);

ALTER TABLE farmer_stamps ADD COLUMN IF NOT EXISTS qr_token TEXT;
UPDATE farmer_stamps SET qr_token = puc_random_qr_token(14) WHERE qr_token IS NULL;
ALTER TABLE farmer_stamps ALTER COLUMN qr_token SET DEFAULT puc_random_qr_token(14);
ALTER TABLE farmer_stamps ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS farmer_stamps_qr_token_idx ON farmer_stamps (qr_token);

-- Theo dõi mã quốc gia (ISO-2) trong trace_scan_logs để cảnh báo một mã bị quét từ nhiều quốc gia
ALTER TABLE trace_scan_logs
  ADD COLUMN IF NOT EXISTS country_code TEXT;

CREATE INDEX IF NOT EXISTS trace_scan_logs_country_idx
  ON trace_scan_logs (upper(scanned_code), country_code)
  WHERE country_code IS NOT NULL;

-- 4. (4c) Trạng thái thời gian thực cho Mã vùng trồng (PUC) và Mã cơ sở đóng gói (PHC)
ALTER TABLE enterprises DROP CONSTRAINT IF EXISTS enterprises_status_check;
ALTER TABLE enterprises
  ADD CONSTRAINT enterprises_status_check
  CHECK (status IN ('active', 'suspended', 'revoked', 'inactive'));

CREATE TABLE IF NOT EXISTS growing_zones (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commune TEXT NOT NULL DEFAULT 'Xã Cư Né',
  district TEXT NOT NULL DEFAULT 'Huyện Krông Búk',
  province TEXT NOT NULL DEFAULT 'Tỉnh Đắk Lắk',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'pending')),
  status_note TEXT,
  valid_until DATE NOT NULL DEFAULT '2027-12-31',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS growing_zones_set_updated_at ON growing_zones;
CREATE TRIGGER growing_zones_set_updated_at
BEFORE UPDATE ON growing_zones
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO growing_zones (code, name, commune, district, province, status, valid_until)
VALUES (
  'VN-DLOR-0086',
  'Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né',
  'Xã Cư Né',
  'Huyện Krông Búk',
  'Tỉnh Đắk Lắk',
  'active',
  '2027-12-31'
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    INSERT INTO growing_zones (code, name, commune, district, province, status, valid_until)
    SELECT DISTINCT
      btrim(p.zone_code),
      CASE
        WHEN p.zone_code ~* '^66-PUC-SR0001-' THEN 'Vùng trồng sầu riêng liên kết Xã Ea Khăl'
        ELSE 'Vùng trồng sầu riêng liên kết HTX Nông nghiệp Cư Né'
      END,
      CASE WHEN p.zone_code ~* '^66-PUC-SR0001-' THEN 'Xã Ea Khăl' ELSE 'Xã Cư Né' END,
      CASE WHEN p.zone_code ~* '^66-PUC-SR0001-' THEN 'Huyện Ea H''Leo' ELSE 'Huyện Krông Búk' END,
      'Tỉnh Đắk Lắk',
      'active',
      '2027-12-31'::date
    FROM plots p
    WHERE p.zone_code IS NOT NULL AND btrim(p.zone_code) <> ''
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;

-- 5. (4f) Cờ kiểm chứng trên bảng lab_tests (chỉ hiển thị bản 'verified' ra trang công khai, ẩn bản nháp 'draft')
ALTER TABLE lab_tests
  ADD COLUMN IF NOT EXISTS record_status TEXT NOT NULL DEFAULT 'verified'
  CHECK (record_status IN ('draft', 'verified'));
