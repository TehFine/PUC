-- 027_attachment_sha256_dedup.sql
-- Chống tải trùng lặp tệp nhị phân (BYTEA + ổ đĩa) khi điện thoại nông hộ ở ngoài rẫy sóng 2G/3G chập chờn
-- bị đứt kết nối ngay sau khi máy chủ đã nhận xong ảnh nhưng phản hồi chưa kịp về máy.

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS sha256_hex TEXT;

CREATE INDEX IF NOT EXISTS idx_attachments_owner_purpose_sha256
  ON attachments (owner_user_id, purpose, sha256_hex)
  WHERE sha256_hex IS NOT NULL;

