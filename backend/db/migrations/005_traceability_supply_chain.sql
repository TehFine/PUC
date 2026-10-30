-- 005_traceability_supply_chain.sql: Doanh nghiệp liên kết, hợp đồng thu mua, sơ chế PHC, vận chuyển và tem truy xuất quả/thùng

-- 1. Bảng doanh nghiệp đối tác liên kết thu mua & cơ sở đóng gói (PHC)
CREATE TABLE IF NOT EXISTS enterprises (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tax_code TEXT,
  representative TEXT,
  phone TEXT,
  address TEXT,
  packhouse_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Bảng hợp đồng liên kết thu mua bao tiêu sản phẩm giữa HTX và Doanh nghiệp
CREATE TABLE IF NOT EXISTS contracts (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  enterprise_id BIGINT NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  signed_on DATE NOT NULL,
  valid_until DATE NOT NULL,
  target_tons NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (target_tons >= 0),
  price_guarantee TEXT,
  market TEXT NOT NULL DEFAULT 'Trung Quốc',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contracts_enterprise_idx ON contracts(enterprise_id);

-- 3. Mở rộng thông tin Sơ chế đóng gói & Vận chuyển cho lô thu hoạch (harvest_lots)
ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS enterprise_id BIGINT REFERENCES enterprises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_id BIGINT REFERENCES contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS packhouse_code TEXT DEFAULT 'VN-DLPH-0089',
  ADD COLUMN IF NOT EXISTS grade_a_pct NUMERIC(5, 1) DEFAULT 70.0,
  ADD COLUMN IF NOT EXISTS grade_b_pct NUMERIC(5, 1) DEFAULT 22.0,
  ADD COLUMN IF NOT EXISTS grade_c_pct NUMERIC(5, 1) DEFAULT 8.0,
  ADD COLUMN IF NOT EXISTS avg_brix NUMERIC(4, 1) DEFAULT 32.5,
  ADD COLUMN IF NOT EXISTS treatment_method TEXT DEFAULT 'Rửa sục khí Ozone, sấy ráo khí động học, xử lý nấm sinh học',
  ADD COLUMN IF NOT EXISTS transporter TEXT DEFAULT 'Công ty Vận tải Lạnh Á Châu',
  ADD COLUMN IF NOT EXISTS vehicle_plate TEXT DEFAULT '47C-289.45',
  ADD COLUMN IF NOT EXISTS temperature_c NUMERIC(4, 1) DEFAULT 13.5,
  ADD COLUMN IF NOT EXISTS departed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMPTZ;

-- 4. Bảng tem truy xuất định danh từng quả hoặc thùng sản phẩm (CheckVN Fruit & Box Serial Item)
CREATE TABLE IF NOT EXISTS harvest_items (
  id BIGSERIAL PRIMARY KEY,
  lot_id BIGINT NOT NULL REFERENCES harvest_lots(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('fruit', 'box')),
  serial_code TEXT NOT NULL UNIQUE,
  weight_kg NUMERIC(6, 2),
  grade TEXT CHECK (grade IN ('A', 'B', 'C')),
  printed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'distributed', 'recalled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS harvest_items_lot_idx ON harvest_items(lot_id);
CREATE INDEX IF NOT EXISTS harvest_items_serial_idx ON harvest_items(serial_code);

-- Triggers cập nhật updated_at
DROP TRIGGER IF EXISTS enterprises_set_updated_at ON enterprises;
CREATE TRIGGER enterprises_set_updated_at
BEFORE UPDATE ON enterprises
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS contracts_set_updated_at ON contracts;
CREATE TRIGGER contracts_set_updated_at
BEFORE UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
