-- 002_plots.sql: dữ liệu bản đồ (yêu cầu PostGIS)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE plots (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  sheet_no TEXT,
  parcel_no TEXT,
  owner_name TEXT,
  village TEXT,
  zone_code TEXT,
  variety TEXT,
  planted_year INTEGER,
  area_ha NUMERIC(10, 4) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'declared'
    CHECK (source IN ('declared', 'measured', 'cadastral', 'demo')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('approved', 'improve', 'violation', 'pending')),
  source_ref TEXT,
  geom geometry(Polygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX plots_geom_idx ON plots USING GIST (geom);
CREATE INDEX plots_zone_idx ON plots (zone_code);
CREATE INDEX plots_source_idx ON plots (source);

CREATE TABLE plot_measurements (
  id BIGSERIAL PRIMARY KEY,
  plot_id BIGINT NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
  plot_code TEXT NOT NULL,
  measured_by TEXT,
  area_ha NUMERIC(10, 4) NOT NULL DEFAULT 0,
  note TEXT,
  geom geometry(Polygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX plot_measurements_geom_idx ON plot_measurements USING GIST (geom);
CREATE INDEX plot_measurements_plot_idx ON plot_measurements (plot_id);

CREATE TRIGGER plots_set_updated_at
BEFORE UPDATE ON plots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
