-- 024_spray_photo_evidence.sql:
-- Bổ sung ảnh/video hiện trường và ghi chú trên bảng nhật ký phun thuốc (spray_records)
-- phục vụ việc hợp nhất luồng ghi nhật ký canh tác và phun thuốc BVTV cho nông hộ.

ALTER TABLE spray_records
  ADD COLUMN IF NOT EXISTS photo_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[],
  ADD COLUMN IF NOT EXISTS note TEXT;

