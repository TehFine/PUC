-- 001_core.sql: người dùng, phiên đăng nhập, nhật ký và dữ liệu nghiệp vụ

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE villages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  leader TEXT,
  household_count INTEGER NOT NULL DEFAULT 0 CHECK (household_count >= 0),
  plot_count INTEGER NOT NULL DEFAULT 0 CHECK (plot_count >= 0),
  area_ha NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (area_ha >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN ('admin', 'htx_officer', 'inspector', 'village_officer', 'farmer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
  village_id BIGINT REFERENCES villages(id) ON DELETE SET NULL,
  last_login_at TIMESTAMPTZ,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  ip TEXT,
  action TEXT NOT NULL,
  object TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX audit_logs_occurred_idx ON audit_logs (occurred_at DESC);

CREATE TABLE households (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cccd TEXT NOT NULL UNIQUE CHECK (cccd ~ '^[0-9]{12}$'),
  phone TEXT NOT NULL,
  village_id BIGINT NOT NULL REFERENCES villages(id) ON DELETE RESTRICT,
  plot_count INTEGER NOT NULL DEFAULT 0 CHECK (plot_count >= 0),
  area_ha NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (area_ha >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('qualified', 'improve', 'pending', 'violation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX households_village_idx ON households (village_id);

CREATE TABLE pesticides (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active_ingredient TEXT NOT NULL,
  concentration TEXT,
  manufacturer TEXT,
  mrl_mg_kg NUMERIC(8, 3) CHECK (mrl_mg_kg >= 0),
  isolation_days INTEGER CHECK (isolation_days >= 0),
  status TEXT NOT NULL CHECK (status IN ('allowed', 'banned', 'restricted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE varieties (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  origin TEXT,
  weight_range TEXT,
  harvest_years TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  applicant_name TEXT NOT NULL,
  request_type TEXT NOT NULL,
  submitted_on DATE NOT NULL,
  docs_count INTEGER NOT NULL DEFAULT 0 CHECK (docs_count >= 0),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX approvals_status_idx ON approvals (status);

CREATE TABLE inspection_schedule (
  id BIGSERIAL PRIMARY KEY,
  scheduled_on DATE NOT NULL,
  title TEXT NOT NULL,
  officer TEXT NOT NULL,
  plot_count INTEGER NOT NULL DEFAULT 0 CHECK (plot_count >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('periodic', 'sudden', 'recheck')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inspection_minutes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  held_on DATE NOT NULL,
  location TEXT NOT NULL,
  officer TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'improve')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journal_entries (
  id BIGSERIAL PRIMARY KEY,
  entry_on DATE NOT NULL,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plot_code TEXT NOT NULL,
  activity TEXT NOT NULL,
  detail TEXT,
  recorder TEXT NOT NULL,
  has_photo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journal_household_idx ON journal_entries (household_id);
CREATE INDEX journal_entry_on_idx ON journal_entries (entry_on DESC);

CREATE TABLE violations (
  id BIGSERIAL PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning')),
  title TEXT NOT NULL,
  household_label TEXT NOT NULL,
  detected_on DATE NOT NULL,
  plot_code TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE spray_records (
  id BIGSERIAL PRIMARY KEY,
  sprayed_on DATE NOT NULL,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  pesticide_id BIGINT NOT NULL REFERENCES pesticides(id) ON DELETE RESTRICT,
  source TEXT,
  dose TEXT NOT NULL,
  area_ha NUMERIC(8, 2) NOT NULL CHECK (area_ha >= 0),
  isolation_days INTEGER NOT NULL DEFAULT 0 CHECK (isolation_days >= 0),
  mrl_status TEXT NOT NULL CHECK (mrl_status IN ('pass', 'exceeded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX spray_household_idx ON spray_records (household_id);

CREATE TABLE lab_tests (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plot_code TEXT NOT NULL,
  sampled_on DATE NOT NULL,
  cd_mg_kg NUMERIC(8, 3) NOT NULL CHECK (cd_mg_kg >= 0),
  yellow_o_positive BOOLEAN NOT NULL DEFAULT false,
  residue_mg_kg NUMERIC(8, 3) NOT NULL CHECK (residue_mg_kg >= 0),
  chlorpyrifos_mg_kg NUMERIC(8, 3) CHECK (chlorpyrifos_mg_kg >= 0), -- NULL = không phát hiện (KPH)
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail')),
  lab TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE harvest_lots (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  harvested_on DATE NOT NULL,
  weight_tons NUMERIC(10, 3) NOT NULL CHECK (weight_tons >= 0),
  household_count INTEGER NOT NULL DEFAULT 0 CHECK (household_count >= 0),
  buyer TEXT NOT NULL,
  market TEXT NOT NULL,
  qr_code TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('exported', 'delivered', 'in_transit', 'sampling')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE training_courses (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  held_on DATE,
  location TEXT,
  trainer TEXT,
  enrolled INTEGER NOT NULL DEFAULT 0 CHECK (enrolled >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (enrolled <= capacity)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'villages', 'users', 'households', 'pesticides', 'varieties', 'approvals',
    'inspection_schedule', 'inspection_minutes', 'journal_entries', 'violations',
    'spray_records', 'lab_tests', 'harvest_lots', 'training_courses'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
