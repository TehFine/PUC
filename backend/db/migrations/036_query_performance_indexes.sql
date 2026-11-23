-- 036_query_performance_indexes.sql
-- Bổ sung các chỉ mục biểu thức còn thiếu trên các bảng truy vấn tần suất cao (quét mã QR truy xuất, kiểm nghiệm thửa/lô, tem hộ dân, bảng tên thửa).

CREATE INDEX IF NOT EXISTS harvest_items_serial_upper_idx
  ON harvest_items (upper(serial_code));

CREATE INDEX IF NOT EXISTS lab_tests_plot_code_upper_idx
  ON lab_tests (upper(btrim(plot_code)), sampled_on DESC, id DESC);

CREATE INDEX IF NOT EXISTS farmer_stamps_alloc_status_idx
  ON farmer_stamps (allocation_id, status);

CREATE INDEX IF NOT EXISTS plot_signboard_tokens_code_upper_idx
  ON plot_signboard_tokens (upper(plot_code));
