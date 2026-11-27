-- 046_partner_inquiries.sql
-- Lưu trữ thông tin liên hệ hợp tác, thu mua hoặc công tác từ đối tác, doanh nghiệp và cơ quan gửi từ chân trang giới thiệu.

CREATE TABLE IF NOT EXISTS partner_inquiries (
  id BIGSERIAL PRIMARY KEY,
  sender_email VARCHAR(160) NOT NULL,
  organization VARCHAR(160),
  message VARCHAR(1000) NOT NULL,
  ip_address VARCHAR(64),
  user_agent VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_inquiries_created_at
  ON partner_inquiries (created_at DESC);

