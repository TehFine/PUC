INSERT INTO plots (
  code, sheet_no, parcel_no, owner_name, village, zone_code, variety,
  planted_year, area_ha, source, status, geom
)
VALUES
  ('KB-VT-001', '12', '45', 'Nguyễn Văn An', 'Thôn 1', 'KB-VT-001', 'Musang King', 2018, 0.82, 'declared', 'approved',
   ST_SetSRID(ST_MakeEnvelope(108.1470, 12.7220, 108.14792, 12.7229), 4326)),
  ('KB-VT-001B', '12', '46', 'Nguyễn Văn An', 'Thôn 1', 'KB-VT-001', 'Musang King', 2019, 0.95, 'measured', 'approved',
   ST_SetSRID(ST_MakeEnvelope(108.1481, 12.7221, 108.14906, 12.72302), 4326)),
  ('KB-VT-002', '15', '23', 'Trần Thị Bình', 'Thôn 2', 'KB-VT-002', 'Black Thorn', 2017, 1.20, 'cadastral', 'approved',
   ST_SetSRID(ST_MakeEnvelope(108.1500, 12.7235, 108.15109, 12.72447), 4326)),
  ('KB-VT-003', '18', '67', 'Lê Văn Cường', 'Thôn 3', 'KB-VT-003', 'Monthong', 2020, 0.76, 'declared', 'improve',
   ST_SetSRID(ST_MakeEnvelope(108.1520, 12.7250, 108.15283, 12.72581), 4326)),
  ('KB-VT-003B', '18', '68', 'Lê Văn Cường', 'Thôn 3', 'KB-VT-003', 'Monthong', 2021, 0.31, 'measured', 'pending',
   ST_SetSRID(ST_MakeEnvelope(108.15245, 12.72515, 108.15284, 12.72553), 4326)),
  ('KB-VT-004', '21', '12', 'Hoàng Văn Em', 'Thôn 4', 'KB-VT-004', 'Musang King', 2016, 1.50, 'cadastral', 'approved',
   ST_SetSRID(ST_MakeEnvelope(108.1540, 12.7265, 108.15518, 12.72756), 4326)),
  ('KB-VT-005', '24', '89', 'Đặng Văn Giang', 'Thôn 5', 'KB-VT-005', 'Ri6', 2022, 0.65, 'declared', 'violation',
   ST_SetSRID(ST_MakeEnvelope(108.1550, 12.7275, 108.15577, 12.72822), 4326)),
  ('KB-VT-006', '27', '34', 'Bùi Thị Hoa', 'Thôn 6', 'KB-VT-006', 'Black Thorn', 2019, 1.10, 'cadastral', 'improve',
   ST_SetSRID(ST_MakeEnvelope(108.1480, 12.7200, 108.14901, 12.72095), 4326)),
  ('KB-VT-006B', '27', '35', 'Ngô Văn Ích', 'Thôn 6', 'KB-VT-006', 'Ri6', 2020, 0.88, 'measured', 'pending',
   ST_SetSRID(ST_MakeEnvelope(108.1491, 12.7201, 108.14996, 12.72096), 4326))
ON CONFLICT (code) DO NOTHING;
