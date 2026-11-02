-- 007_user_features.sql: tệp đính kèm, thông báo, đăng ký tập huấn, bản tin, phân bón,
-- phản hồi vi phạm, duyệt khai báo thu hoạch và các cột bổ sung để các chức năng trên giao diện hoạt động thật.

-- 1. Tệp tải lên (ảnh nhật ký, ảnh thu hoạch, hồ sơ, ảnh bản tin...). Nội dung tệp lưu trên đĩa (UPLOAD_DIR).
CREATE TABLE attachments (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  household_id BIGINT REFERENCES households(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('journal', 'harvest', 'stamp', 'approval', 'violation', 'news', 'catalog')),
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attachments_household_idx ON attachments (household_id);
CREATE INDEX attachments_owner_idx ON attachments (owner_user_id);

-- 2. Nhật ký canh tác: ảnh thực địa và tọa độ GPS (thay cho việc nối chuỗi vào detail).
ALTER TABLE journal_entries
  ADD COLUMN photo_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL,
  ADD COLUMN latitude NUMERIC(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude NUMERIC(9, 6) CHECK (longitude BETWEEN -180 AND 180);

-- 3. Nhật ký phun thuốc gắn với thửa.
ALTER TABLE spray_records ADD COLUMN plot_code TEXT;

-- 4. Hồ sơ gửi HTX: nội dung, thửa liên quan, ý kiến duyệt; hộ được hủy khi còn chờ duyệt.
ALTER TABLE approvals
  ADD COLUMN note TEXT,
  ADD COLUMN plot_code TEXT,
  ADD COLUMN review_note TEXT;
ALTER TABLE approvals DROP CONSTRAINT approvals_status_check;
ALTER TABLE approvals
  ADD CONSTRAINT approvals_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

CREATE TABLE approval_attachments (
  approval_id BIGINT NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  attachment_id BIGINT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  PRIMARY KEY (approval_id, attachment_id)
);

-- 5. Vi phạm: hộ báo đã khắc phục (kèm ảnh), cán bộ xác nhận đóng vi phạm.
ALTER TABLE violations
  ADD COLUMN farmer_response TEXT,
  ADD COLUMN farmer_response_at TIMESTAMPTZ,
  ADD COLUMN farmer_response_photo_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL,
  ADD COLUMN resolved_on DATE,
  ADD COLUMN resolution_notes TEXT,
  ADD COLUMN resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- 6. Khai báo thu hoạch: ảnh, trạng thái duyệt của cán bộ HTX.
ALTER TABLE harvest_declarations
  ADD COLUMN photo_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'rejected')),
  ADD COLUMN reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_note TEXT;
CREATE INDEX harvest_decl_status_idx ON harvest_declarations (status);

-- 7. Tem quả: ảnh lúc kích hoạt.
ALTER TABLE farmer_stamps ADD COLUMN photo_id BIGINT REFERENCES attachments(id) ON DELETE SET NULL;

-- 8. Tập huấn: giờ học, mô tả và danh sách hộ đăng ký.
ALTER TABLE training_courses
  ADD COLUMN starts_at TIME,
  ADD COLUMN ends_at TIME,
  ADD COLUMN description TEXT;

CREATE TABLE training_registrations (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'absent', 'cancelled')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, household_id)
);
CREATE INDEX training_registrations_household_idx ON training_registrations (household_id);

-- 9. Thông báo trong ứng dụng (gửi tới một tài khoản).
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('approval', 'violation', 'harvest', 'training', 'schedule', 'lab', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- 10. Bản tin (thay cho localStorage trên trình duyệt quản trị).
CREATE TABLE news_articles (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category TEXT NOT NULL CHECK (category IN ('visit', 'training', 'protection', 'farming')),
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  -- { lead, sections: [{ heading, paragraphs[], bulletPoints[] }], takeaway }
  content JSONB NOT NULL,
  author TEXT NOT NULL,
  image_url TEXT,
  image_alt TEXT,
  read_time TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_on DATE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX news_published_idx ON news_articles (published_on DESC) WHERE status = 'published';

-- 11. Danh mục phân bón (thay cho dữ liệu tĩnh trên giao diện).
CREATE TABLE fertilizers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('organic', 'npk', 'foliar', 'microbial', 'restricted')),
  formula TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  dosage TEXT NOT NULL,
  application_method TEXT NOT NULL,
  timing TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'allowed' CHECK (status IN ('encouraged', 'allowed', 'warning')),
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Giống: các trường nông học hiển thị trên danh mục.
ALTER TABLE varieties
  ADD COLUMN category TEXT CHECK (category IN ('export', 'native', 'premium', 'new')),
  ADD COLUMN status TEXT NOT NULL DEFAULT 'allowed' CHECK (status IN ('allowed', 'encouraged', 'trial')),
  ADD COLUMN flesh_color TEXT,
  ADD COLUMN seed_rate TEXT,
  ADD COLUMN brix TEXT,
  ADD COLUMN yield_per_ha TEXT,
  ADD COLUMN image_url TEXT,
  ADD COLUMN market_potential TEXT,
  ADD COLUMN morphology JSONB,
  ADD COLUMN farming_techniques JSONB;

-- 13. Thửa đất gắn với hộ bằng khóa (thay cho so khớp theo tên chủ thửa). Chỉ khi có bảng plots (PostGIS).
DO $$
BEGIN
  IF to_regclass('public.plots') IS NOT NULL THEN
    ALTER TABLE plots ADD COLUMN IF NOT EXISTS household_id BIGINT REFERENCES households(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS plots_household_idx ON plots (household_id);
    -- Gắn tự động khi tên chủ thửa khớp đúng một hộ.
    UPDATE plots p SET household_id = h.id
    FROM households h
    WHERE p.household_id IS NULL
      AND lower(p.owner_name) = lower(h.name)
      AND (SELECT count(*) FROM households h2 WHERE lower(h2.name) = lower(h.name)) = 1;
  END IF;
END $$;

-- 14. Tra cứu tem không phân biệt hoa thường dùng được chỉ mục.
DROP INDEX IF EXISTS farmer_stamps_serial_idx;
CREATE INDEX farmer_stamps_serial_upper_idx ON farmer_stamps (upper(serial_code));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['training_registrations', 'news_articles', 'fertilizers'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
