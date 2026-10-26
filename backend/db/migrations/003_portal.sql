-- 003_portal.sql: liên kết tài khoản nông dân với hộ + dữ liệu theo từng hộ cho cổng hộ dân

ALTER TABLE users
  ADD COLUMN household_id BIGINT REFERENCES households(id) ON DELETE SET NULL;
-- Mỗi hộ chỉ có một tài khoản đăng nhập.
CREATE UNIQUE INDEX users_household_unique ON users (household_id) WHERE household_id IS NOT NULL;

-- Tài khoản nông dân hiện có: liên kết với hộ trùng số điện thoại (tên đăng nhập = số điện thoại).
UPDATE users u
SET household_id = h.id
FROM households h
WHERE u.role = 'farmer' AND u.household_id IS NULL AND u.username = h.phone;

-- Vi phạm và hồ sơ gắn với hộ (cột nhãn văn bản cũ vẫn giữ để hiển thị).
ALTER TABLE violations
  ADD COLUMN household_id BIGINT REFERENCES households(id) ON DELETE SET NULL;
CREATE INDEX violations_household_idx ON violations (household_id);

ALTER TABLE approvals
  ADD COLUMN household_id BIGINT REFERENCES households(id) ON DELETE SET NULL;
CREATE INDEX approvals_household_idx ON approvals (household_id);

-- Sản lượng mỗi hộ đóng góp vào từng lô thu hoạch.
CREATE TABLE harvest_contributions (
  id BIGSERIAL PRIMARY KEY,
  lot_id BIGINT NOT NULL REFERENCES harvest_lots(id) ON DELETE CASCADE,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  weight_kg NUMERIC(10, 1) NOT NULL CHECK (weight_kg >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lot_id, household_id)
);
CREATE INDEX harvest_contributions_household_idx ON harvest_contributions (household_id);
