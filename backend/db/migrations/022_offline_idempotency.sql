-- 022_offline_idempotency.sql
-- Bảng lưu khóa chống ghi trùng (Idempotency Key) phục vụ đồng bộ tự động từ vùng mạng yếu / ngoại tuyến.

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idem_key VARCHAR(80) NOT NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(200) NOT NULL,
  status_code INTEGER NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idem_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_created_at
  ON api_idempotency_keys (created_at);

