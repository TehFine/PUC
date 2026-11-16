-- 020_multi_photo_evidence.sql:
-- Mở rộng lưu trữ nhiều ảnh hiện trường (và video ngắn) cho:
-- 1. Khai báo mốc quy trình chăm sóc 2026-2027 & SenPro (care_milestone_declarations.field_photo_ids, invoice_photo_ids)
-- 2. Nhật ký canh tác (journal_entries.photo_ids)
-- 3. Phản hồi khắc phục cảnh báo/vi phạm của hộ dân (violations.farmer_response_photo_ids)
-- 4. Biên bản kiểm tra thực địa của cán bộ (inspection_minutes.photo_ids)
-- Giữ nguyên cột đơn cũ (photo_id, field_photo_id, invoice_photo_id, farmer_response_photo_id) chứa tệp chính đầu tiên
-- để tương thích ngược 100% với các truy vấn báo cáo, sổ cái băm SHA-256 và trang truy xuất QR.

ALTER TABLE care_milestone_declarations
  ADD COLUMN IF NOT EXISTS field_photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[],
  ADD COLUMN IF NOT EXISTS invoice_photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[];

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[];

ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS farmer_response_photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[];

ALTER TABLE inspection_minutes
  ADD COLUMN IF NOT EXISTS photo_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[];

