-- 006_farmer_stamps_and_harvest.sql: Cấp phát tem nông hộ theo CCCD, định mức sản lượng, kích hoạt tem quả & nhật ký thu hái tại vườn

-- 1. Bảng đợt cấp phát tem cho nông hộ (Nguyên tắc 1 & 2)
CREATE TABLE IF NOT EXISTS farmer_stamp_allocations (
  id BIGSERIAL PRIMARY KEY,
  allocation_code TEXT NOT NULL UNIQUE,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plot_id BIGINT REFERENCES plots(id) ON DELETE SET NULL,
  allocated_on DATE NOT NULL DEFAULT CURRENT_DATE,
  season TEXT NOT NULL DEFAULT 'Vụ 2024',
  max_quota_stamps INTEGER NOT NULL CHECK (max_quota_stamps >= 0),
  quantity_allocated INTEGER NOT NULL CHECK (quantity_allocated > 0),
  from_serial TEXT NOT NULL,
  to_serial TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stamp_alloc_household_idx ON farmer_stamp_allocations(household_id);

-- 2. Bảng chi tiết từng tem của nông hộ (Nguyên tắc 3 & 4)
CREATE TABLE IF NOT EXISTS farmer_stamps (
  id BIGSERIAL PRIMARY KEY,
  allocation_id BIGINT NOT NULL REFERENCES farmer_stamp_allocations(id) ON DELETE CASCADE,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plot_code TEXT,
  serial_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'allocated' CHECK (status IN ('allocated', 'activated', 'revoked')),
  activated_at TIMESTAMPTZ,
  fruit_weight_kg NUMERIC(6, 2),
  grade TEXT CHECK (grade IN ('A', 'B', 'C')),
  photo_url TEXT,
  harvest_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS farmer_stamps_household_idx ON farmer_stamps(household_id);
CREATE INDEX IF NOT EXISTS farmer_stamps_serial_idx ON farmer_stamps(serial_code);
CREATE INDEX IF NOT EXISTS farmer_stamps_status_idx ON farmer_stamps(status);

-- 3. Bảng nhật ký thu hái tại vườn của nông hộ (Hình 1 - Bước 3)
CREATE TABLE IF NOT EXISTS harvest_declarations (
  id BIGSERIAL PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plot_code TEXT NOT NULL,
  harvested_on DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(10, 1) NOT NULL CHECK (weight_kg >= 0),
  grade_a_kg NUMERIC(10, 1) DEFAULT 0,
  grade_b_kg NUMERIC(10, 1) DEFAULT 0,
  quality_rating TEXT DEFAULT 'Loại 1',
  photo_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS harvest_decl_household_idx ON harvest_declarations(household_id);
CREATE INDEX IF NOT EXISTS harvest_decl_date_idx ON harvest_declarations(harvested_on DESC);

-- Triggers set_updated_at
DROP TRIGGER IF EXISTS farmer_stamp_alloc_set_updated_at ON farmer_stamp_allocations;
CREATE TRIGGER farmer_stamp_alloc_set_updated_at BEFORE UPDATE ON farmer_stamp_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS farmer_stamps_set_updated_at ON farmer_stamps;
CREATE TRIGGER farmer_stamps_set_updated_at BEFORE UPDATE ON farmer_stamps FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS harvest_decl_set_updated_at ON harvest_declarations;
CREATE TRIGGER harvest_decl_set_updated_at BEFORE UPDATE ON harvest_declarations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
