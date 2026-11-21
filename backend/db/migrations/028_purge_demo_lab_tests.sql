-- Gỡ bỏ dữ liệu kiểm nghiệm mẫu (không có bản scan gốc, dùng URL đối chiếu giả lập từ seed)
-- và bỏ giá trị mặc định VILAS giả định trên cột lab_accreditation_code.

ALTER TABLE lab_tests
  ALTER COLUMN lab_accreditation_code SET DEFAULT '';

DELETE FROM lab_tests
WHERE scan_attachment_id IS NULL
  AND (
    external_verify_url LIKE 'https://kiemnghiem.quatest3.com.vn/tra-cuu?code=%'
    OR code LIKE 'MK-2024-%'
    OR code = 'KN-2026-SB05'
  );

