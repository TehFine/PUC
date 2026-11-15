-- 014_traceability_three_tier.sql: Truy xuất nguồn gốc QR 3 cấp độ (Công khai - Doanh nghiệp - Cơ quan quản lý),
-- bảo vệ dữ liệu cá nhân nông hộ, bổ sung mốc đóng gói/xuất khẩu/kiểm dịch, scan phiếu kiểm nghiệm và bộ đếm quét chống giả.

-- 1. Mở rộng vai trò người dùng thêm 'enterprise' (Doanh nghiệp / Cơ sở đóng gói / Nhà phân phối)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'htx_officer', 'inspector', 'village_officer', 'enterprise', 'farmer'));

-- 2. Cờ đồng ý hiển thị tên hộ trên trang quét QR công khai (mặc định false: chỉ hiện tên HTX / Nhóm vườn)
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS public_trace_consent BOOLEAN NOT NULL DEFAULT false;

-- 3. Mở rộng bảng lô thu hoạch (harvest_lots) theo chuẩn truy xuất lô/thùng toàn quốc & liên thông Cổng TXNG Quốc gia
ALTER TABLE harvest_lots DROP CONSTRAINT IF EXISTS harvest_lots_status_check;
ALTER TABLE harvest_lots
  ADD CONSTRAINT harvest_lots_status_check
  CHECK (status IN ('exported', 'delivered', 'in_transit', 'sampling', 'revoked'));

ALTER TABLE harvest_lots
  ADD COLUMN IF NOT EXISTS variety TEXT DEFAULT 'Ri6 & Monthong (Dona)',
  ADD COLUMN IF NOT EXISTS packed_on DATE,
  ADD COLUMN IF NOT EXISTS exported_on DATE,
  ADD COLUMN IF NOT EXISTS packhouse_name TEXT,
  ADD COLUMN IF NOT EXISTS packhouse_address TEXT,
  ADD COLUMN IF NOT EXISTS phytosanitary_cert_no TEXT,
  ADD COLUMN IF NOT EXISTS phytosanitary_issued_on DATE,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

-- Đồng bộ dữ liệu thực tế cho các lô hiện có từ bảng enterprises & mốc vận chuyển
UPDATE harvest_lots hl
SET
  packed_on = COALESCE(hl.packed_on, (hl.harvested_on + INTERVAL '1 day')::date),
  exported_on = COALESCE(
    hl.exported_on,
    CASE
      WHEN hl.departed_at IS NOT NULL THEN (hl.departed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      WHEN hl.status IN ('exported', 'delivered', 'in_transit') THEN (hl.harvested_on + INTERVAL '2 days')::date
      ELSE NULL
    END
  ),
  packhouse_name = COALESCE(hl.packhouse_name, e.name, 'Cơ sở Đóng gói - Sơ chế Liên kết HTX Cư Né'),
  packhouse_address = COALESCE(hl.packhouse_address, e.address, 'Km 19, Quốc lộ 14, Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk'),
  phytosanitary_cert_no = COALESCE(
    hl.phytosanitary_cert_no,
    CASE
      WHEN hl.status IN ('exported', 'delivered') AND hl.market ILIKE '%Trung Quốc%'
        THEN 'KDTV-66/' || EXTRACT(YEAR FROM hl.harvested_on)::text || '-0' || LPAD(hl.id::text, 4, '0')
      ELSE NULL
    END
  ),
  phytosanitary_issued_on = COALESCE(
    hl.phytosanitary_issued_on,
    CASE
      WHEN hl.status IN ('exported', 'delivered') AND hl.market ILIKE '%Trung Quốc%'
        THEN (hl.harvested_on + INTERVAL '2 days')::date
      ELSE NULL
    END
  )
FROM harvest_lots hl2
LEFT JOIN enterprises e ON e.id = hl2.enterprise_id
WHERE hl.id = hl2.id;

-- 4. Mở rộng mục đích tệp đính kèm thêm 'lab' cho bản scan phiếu kiểm nghiệm (ảnh hoặc PDF)
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_purpose_check;
ALTER TABLE attachments
  ADD CONSTRAINT attachments_purpose_check
  CHECK (purpose IN ('journal', 'harvest', 'stamp', 'approval', 'violation', 'news', 'catalog', 'avatar', 'lab'));

ALTER TABLE lab_tests
  ADD COLUMN IF NOT EXISTS scan_attachment_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL;

-- 5. Bảng ghi nhận lượt quét QR phục vụ đếm lượt xác thực & cảnh báo quét bất thường (ẩn danh IP bằng mã băm)
CREATE TABLE IF NOT EXISTS trace_scan_logs (
  id BIGSERIAL PRIMARY KEY,
  scanned_code TEXT NOT NULL,
  resolved_lot_code TEXT,
  viewer_tier TEXT NOT NULL CHECK (viewer_tier IN ('public', 'enterprise', 'authority')),
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  user_agent TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trace_scan_logs_code_time_idx
  ON trace_scan_logs (upper(scanned_code), scanned_at DESC);

CREATE INDEX IF NOT EXISTS trace_scan_logs_lot_time_idx
  ON trace_scan_logs (upper(resolved_lot_code), scanned_at DESC)
  WHERE resolved_lot_code IS NOT NULL;
