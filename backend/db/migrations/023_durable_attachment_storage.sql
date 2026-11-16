-- 023_durable_attachment_storage.sql:
-- Lưu bản sao nhị phân của tệp đính kèm trong PostgreSQL TOAST (attachments.file_data)
-- để hình ảnh hiện trường, hóa đơn vật tư, biên bản kiểm tra và phiếu kiểm nghiệm
-- không bị mất khi dịch vụ đám mây (như Render Free Tier) khởi động lại xóa ổ đĩa tạm,
-- đồng thời đồng bộ tức thì tệp đính kèm giữa máy chủ triển khai và máy cục bộ dùng chung CSDL.

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS file_data BYTEA;

