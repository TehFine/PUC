// Dữ liệu mẫu dạng hiển thị (chuỗi tiếng Việt). seed.ts chuyển sang kiểu dữ liệu chuẩn trước khi ghi DB.

export const households = [
  { id: 1, name: "Nguyễn Văn An", cccd: "260123456789", phone: "0905123456", village: "Thôn 1", plots: 3, area: 2.4, code: "KB-VT-001-H001", status: "Đủ chuẩn XK", statusType: "green" },
  { id: 2, name: "Trần Thị Bình", cccd: "260234567890", phone: "0912234567", village: "Thôn 2", plots: 2, area: 1.8, code: "KB-VT-002-H012", status: "Đủ chuẩn XK", statusType: "green" },
  { id: 3, name: "Lê Văn Cường", cccd: "260345678901", phone: "0978345678", village: "Thôn 3", plots: 4, area: 3.2, code: "KB-VT-003-H023", status: "Cần cải thiện", statusType: "gold" },
  { id: 4, name: "Phạm Thị Dung", cccd: "260456789012", phone: "0964456789", village: "Thôn 1", plots: 2, area: 1.5, code: "KB-VT-001-H034", status: "Chờ duyệt", statusType: "blue" },
  { id: 5, name: "Hoàng Văn Em", cccd: "260567890123", phone: "0935567890", village: "Thôn 4", plots: 5, area: 4.1, code: "KB-VT-004-H045", status: "Đủ chuẩn XK", statusType: "green" },
  { id: 6, name: "Võ Thị Phương", cccd: "260678901234", phone: "0901678901", village: "Thôn 2", plots: 1, area: 0.9, code: "KB-VT-002-H056", status: "Vi phạm", statusType: "red" },
  { id: 7, name: "Đặng Văn Giang", cccd: "260789012345", phone: "0918789012", village: "Thôn 5", plots: 3, area: 2.7, code: "KB-VT-005-H067", status: "Cần cải thiện", statusType: "gold" },
  { id: 8, name: "Bùi Thị Hoa", cccd: "260890123456", phone: "0945890123", village: "Thôn 3", plots: 2, area: 1.6, code: "KB-VT-003-H078", status: "Đủ chuẩn XK", statusType: "green" },
  { id: 9, name: "Ngô Văn Ích", cccd: "260901234567", phone: "0962901234", village: "Thôn 6", plots: 4, area: 3.5, code: "KB-VT-006-H089", status: "Chờ duyệt", statusType: "blue" },
  { id: 10, name: "Lý Thị Kim", cccd: "260012345678", phone: "0973012345", village: "Thôn 4", plots: 3, area: 2.1, code: "KB-VT-004-H090", status: "Đủ chuẩn XK", statusType: "green" },
];

export const pendingApprovals = [
  { id: "KB-2024-0249", name: "Võ Thị Phương", type: "Nhập mới", date: "24/10/2024", docs: 4, priority: "Cao", priorityType: "red" },
  { id: "KB-2024-0250", name: "Đặng Văn Giang", type: "Cập nhật thửa", date: "23/10/2024", docs: 3, priority: "TB", priorityType: "gold" },
  { id: "KB-2024-0251", name: "Bùi Thị Hoa", type: "Gia hạn mã vùng", date: "23/10/2024", docs: 5, priority: "TB", priorityType: "gold" },
  { id: "KB-2024-0252", name: "Ngô Văn Ích", type: "Nhập mới", date: "22/10/2024", docs: 4, priority: "Thấp", priorityType: "blue" },
  { id: "KB-2024-0253", name: "Lý Thị Kim", type: "Bổ sung tài liệu", date: "21/10/2024", docs: 2, priority: "Thấp", priorityType: "blue" },
  { id: "KB-2024-0254", name: "Trần Văn Long", type: "Nhập mới", date: "20/10/2024", docs: 4, priority: "Cao", priorityType: "red" },
  { id: "KB-2024-0255", name: "Nguyễn Thị Mai", type: "Cập nhật thông tin", date: "19/10/2024", docs: 3, priority: "Thấp", priorityType: "blue" },
];

export const scheduleItems = [
  { date: "28/10/2024", title: "Kiểm tra thực địa Thôn 1", officer: "KS. Nguyễn Hùng", plots: 12, type: "Định kỳ" },
  { date: "30/10/2024", title: "Lấy mẫu kiểm nghiệm Thôn 3", officer: "KS. Trần Lan", plots: 8, type: "Đột xuất" },
  { date: "02/11/2024", title: "Phúc tra hộ vi phạm Thôn 5", officer: "GĐ. Lê Quân", plots: 3, type: "Phúc tra" },
  { date: "05/11/2024", title: "Kiểm tra thực địa Thôn 4", officer: "KS. Phạm Tuấn", plots: 15, type: "Định kỳ" },
];

export const minutesData = [
  { no: "BB-2024-031", date: "15/10/2024", location: "Thôn 2 – 24 thửa", officer: "KS. Nguyễn Hùng", result: "Đạt", resultType: "green" },
  { no: "BB-2024-030", date: "08/10/2024", location: "Thôn 5 – Vi phạm thuốc", officer: "GĐ. Lê Quân", result: "Không đạt", resultType: "red" },
  { no: "BB-2024-029", date: "01/10/2024", location: "Thôn 1 – Định kỳ Q3", officer: "KS. Trần Lan", result: "Đạt", resultType: "green" },
  { no: "BB-2024-028", date: "20/09/2024", location: "Thôn 3 – Đột xuất", officer: "KS. Phạm Tuấn", result: "Cần cải thiện", resultType: "gold" },
];

export const journalData = [
  { date: "25/10/2024", household: "Nguyễn Văn An", plotCode: "TH1-001", activity: "Phun thuốc", detail: "Buprofezin 400SC – 0.5 lít/ha", recorder: "Chủ hộ", hasPhoto: true },
  { date: "25/10/2024", household: "Trần Thị Bình", plotCode: "TH2-001", activity: "Bón phân", detail: "NPK 16-16-8 – 200kg/ha", recorder: "Chủ hộ", hasPhoto: false },
  { date: "24/10/2024", household: "Hoàng Văn Em", plotCode: "TH4-001", activity: "Cắt cỏ", detail: "Cắt thủ công, chu kỳ 45 ngày", recorder: "Cán bộ HTX", hasPhoto: true },
  { date: "24/10/2024", household: "Bùi Thị Hoa", plotCode: "TH3-001", activity: "Tưới nước", detail: "Nước giếng khoan – 800 lít/cây", recorder: "Chủ hộ", hasPhoto: false },
  { date: "23/10/2024", household: "Lý Thị Kim", plotCode: "TH4-002", activity: "Phun thuốc", detail: "Abamectin 1.8EC – 0.3 lít/ha", recorder: "Chủ hộ", hasPhoto: true },
];

export const violations = [
  { type: "critical", title: "Sử dụng thuốc bị cấm – Carbaryl 80%", household: "Nguyễn Văn A – Thôn 3", date: "25/10/2024", plot: "TH3-008", desc: "Phát hiện trong nhật ký phun thuốc ngày 23/10/2024. Carbaryl không nằm trong danh mục được phép sử dụng trên sầu riêng xuất khẩu sang Trung Quốc." },
  { type: "critical", title: "Tồn dư Chlorpyrifos vượt ngưỡng MRL", household: "Lê Văn C – Thôn 3", date: "24/10/2024", plot: "TH3-012", desc: "Kết quả kiểm nghiệm mẫu ngày 20/10: Chlorpyrifos = 0.08 mg/kg, vượt ngưỡng GACC (0.05 mg/kg). Cần cách ly thêm 14 ngày." },
  { type: "warning", title: "Không cập nhật nhật ký canh tác 15+ ngày", household: "Trần Thị B – Thôn 5", date: "25/10/2024", plot: "TH5-003", desc: "Hộ chưa ghi nhật ký kể từ ngày 10/10/2024. Theo quy định HTX, tần suất ghi nhật ký tối thiểu là 7 ngày/lần." },
];

export const sprayData = [
  { date: "23/10/2024", household: "Nguyễn Văn An", pesticide: "Buprofezin 400SC", source: "ĐL An Khang – Buôn Ma Thuột", dose: "0.5 lít/ha", area: "0.82 ha", isolation: "14 ngày", mrl: "Đạt", mrlType: "green" },
  { date: "22/10/2024", household: "Trần Thị Bình", pesticide: "Abamectin 1.8EC", source: "ĐL Nông Tín – Krong Buk", dose: "0.3 lít/ha", area: "1.2 ha", isolation: "7 ngày", mrl: "Đạt", mrlType: "green" },
  { date: "20/10/2024", household: "Lê Văn Cường", pesticide: "Chlorpyrifos 40EC", source: "ĐL Minh Phát – Buôn Hồ", dose: "1.0 lít/ha", area: "0.76 ha", isolation: "21 ngày", mrl: "Vượt ngưỡng", mrlType: "red" },
  { date: "19/10/2024", household: "Hoàng Văn Em", pesticide: "Imidacloprid 70WG", source: "ĐL An Khang – Buôn Ma Thuột", dose: "0.2 kg/ha", area: "1.5 ha", isolation: "14 ngày", mrl: "Đạt", mrlType: "green" },
];

export const testingData = [
  { code: "MK-2024-089", household: "Nguyễn Văn An – TH1-001", sampleDate: "15/10/2024", cd: "0.02", yellowO: "Âm tính", residue: "0.03", chlorpyrifos: "KPH", result: "Đạt", resultType: "green", lab: "Vinacontrol" },
  { code: "MK-2024-090", household: "Trần Thị Bình – TH2-001", sampleDate: "15/10/2024", cd: "0.04", yellowO: "Âm tính", residue: "0.05", chlorpyrifos: "KPH", result: "Đạt", resultType: "green", lab: "Quatest 3" },
  { code: "MK-2024-091", household: "Lê Văn Cường – TH3-001", sampleDate: "20/10/2024", cd: "0.03", yellowO: "Âm tính", residue: "0.12", chlorpyrifos: "0.08", result: "Không đạt", resultType: "red", lab: "Vinacontrol" },
  { code: "MK-2024-092", household: "Hoàng Văn Em – TH4-001", sampleDate: "20/10/2024", cd: "0.01", yellowO: "Âm tính", residue: "0.02", chlorpyrifos: "KPH", result: "Đạt", resultType: "green", lab: "Quatest 3" },
  { code: "MK-2024-093", household: "Đặng Văn Giang – TH5-001", sampleDate: "22/10/2024", cd: "0.05", yellowO: "Dương tính", residue: "0.08", chlorpyrifos: "KPH", result: "Không đạt", resultType: "red", lab: "TTKTCL Đắk Lắk" },
];

export const harvestData = [
  { code: "LH-2024-038", date: "20/10/2024", weight: "8.200", households: 12, buyer: "Cty TNHH Vĩnh Phát", market: "Trung Quốc", qr: "QR-038", status: "Đã xuất", statusType: "green" },
  { code: "LH-2024-037", date: "15/10/2024", weight: "6.500", households: 8, buyer: "Cty CP Xuất Nhập Khẩu Rồng Đỏ", market: "Trung Quốc", qr: "QR-037", status: "Đã xuất", statusType: "green" },
  { code: "LH-2024-036", date: "10/10/2024", weight: "5.800", households: 10, buyer: "Cty TNHH Nông Sản Tây Nguyên", market: "Nội địa", qr: "QR-036", status: "Đã giao", statusType: "green" },
  { code: "LH-2024-035", date: "05/10/2024", weight: "9.100", households: 15, buyer: "Cty CP Xuất Nhập Khẩu Rồng Đỏ", market: "Trung Quốc", qr: "QR-035", status: "Đang vận chuyển", statusType: "gold" },
  { code: "LH-2024-039", date: "25/10/2024", weight: "4.300", households: 7, buyer: "Cty TNHH Vĩnh Phát", market: "Trung Quốc", qr: "QR-039", status: "Đang lấy mẫu", statusType: "blue" },
];

export const trainingCourses = [
  { title: "VietGAP Cơ Bản", date: "15/11/2024", location: "UBND xã Krong Buk", trainer: "KS. Nguyễn Minh Tuấn", enrolled: 45, capacity: 60, completed: false, progress: 75 },
  { title: "Tiêu Chuẩn GACC – Xuất Khẩu Trung Quốc", date: "22/11/2024", location: "Hội trường HTX", trainer: "Chuyên gia từ BVTV", enrolled: 38, capacity: 50, completed: false, progress: 76 },
  { title: "Nhận Diện & Phòng Trừ Sâu Bệnh", date: "01/12/2024", location: "Thực địa Thôn 3", trainer: "KS. Trần Thị Lan Anh", enrolled: 52, capacity: 60, completed: false, progress: 87 },
  { title: "Hướng Dẫn Dùng Phần Mềm Quản Lý", date: "10/12/2024", location: "Hội trường HTX", trainer: "Kỹ sư hệ thống", enrolled: 30, capacity: 80, completed: false, progress: 37 },
  { title: "Kỹ Thuật Tưới Tiêu Tiết Kiệm", date: "Đã hoàn thành", location: "Thực địa Thôn 1", trainer: "KS. Phạm Đức Toàn", enrolled: 48, capacity: 50, completed: true, progress: 96 },
  { title: "Canh Tác Hữu Cơ Sầu Riêng", date: "Đã hoàn thành", location: "Hội trường HTX", trainer: "Chuyên gia Hữu cơ", enrolled: 35, capacity: 50, completed: true, progress: 70 },
];

export const pesticides = [
  { name: "Buprofezin 400SC", activeIngredient: "Buprofezin", concentration: "400 g/l", manufacturer: "Map Pacific", mrl: "0.05 mg/kg", isolation: "14 ngày", status: "Được phép", statusType: "green" },
  { name: "Abamectin 1.8EC", activeIngredient: "Abamectin", concentration: "1.8%", manufacturer: "Syngenta", mrl: "0.01 mg/kg", isolation: "7 ngày", status: "Được phép", statusType: "green" },
  { name: "Imidacloprid 70WG", activeIngredient: "Imidacloprid", concentration: "70%", manufacturer: "Bayer", mrl: "0.05 mg/kg", isolation: "14 ngày", status: "Được phép", statusType: "green" },
  { name: "Carbaryl 80WP", activeIngredient: "Carbaryl", concentration: "80%", manufacturer: "Various", mrl: "—", isolation: "—", status: "Bị cấm (GACC)", statusType: "red" },
  { name: "Chlorpyrifos 40EC", activeIngredient: "Chlorpyrifos", concentration: "40%", manufacturer: "Dow AgroSciences", mrl: "0.05 mg/kg", isolation: "21 ngày", status: "Hạn chế", statusType: "gold" },
  { name: "Emamectin 1.9EC", activeIngredient: "Emamectin benzoate", concentration: "1.9%", manufacturer: "Rotam", mrl: "0.02 mg/kg", isolation: "10 ngày", status: "Được phép", statusType: "green" },
];

export const varieties = [
  { name: "Ri 6", origin: "Bình Phước – Việt Nam", weight: "2–4 kg/trái", year: "8–10 năm", desc: "Phổ biến nhất Tây Nguyên, múi vàng đậm, thịt dày, ngọt béo" },
  { name: "Musang King", origin: "Malaysia", weight: "1.5–3 kg/trái", year: "6–8 năm", desc: "Múi vàng sáng, vị đậm, đắng nhẹ, giá trị xuất khẩu cao nhất" },
  { name: "Monthong", origin: "Thái Lan", weight: "3–5 kg/trái", year: "7–9 năm", desc: "Vỏ dày, dễ vận chuyển, múi trắng kem, ít mùi, phù hợp TQ" },
  { name: "Dona (Ri 7)", origin: "Tiền Giang – Việt Nam", weight: "2–4 kg/trái", year: "7–10 năm", desc: "Mới được cấp mã số vùng trồng, đang mở rộng tại Đắk Lắk" },
];

export const villages = [
  { name: "Thôn 1", leader: "Nguyễn Văn Phú", households: 42, plots: 48, area: "76 ha" },
  { name: "Thôn 2", leader: "Trần Minh Đức", households: 55, plots: 61, area: "94 ha" },
  { name: "Thôn 3", leader: "Lê Thị Thu Hà", households: 48, plots: 52, area: "81 ha" },
  { name: "Thôn 4", leader: "Phạm Văn Bình", households: 38, plots: 43, area: "68 ha" },
  { name: "Thôn 5", leader: "Hoàng Đức Toàn", households: 51, plots: 57, area: "89 ha" },
  { name: "Thôn 6", leader: "Võ Thị Kim Loan", households: 46, plots: 51, area: "79 ha" },
];

export const accounts = [
  { name: "Nguyễn Khoa", username: "0901234567", role: "Quản trị viên", status: "Hoạt động", statusType: "green", lastLogin: "25/10/2024 16:45" },
  { name: "Trần Thị Lan", username: "0912345678", role: "Cán bộ HTX", status: "Hoạt động", statusType: "green", lastLogin: "25/10/2024 14:20" },
  { name: "Lê Văn Kiểm", username: "0923456789", role: "Kiểm tra viên", status: "Hoạt động", statusType: "green", lastLogin: "24/10/2024 09:15" },
  { name: "Phạm Văn Ba (TH1)", username: "0934567890", role: "Cán bộ Thôn", status: "Hoạt động", statusType: "green", lastLogin: "25/10/2024 11:30" },
  { name: "Nguyễn Thị Cúc (TH2)", username: "0945678901", role: "Cán bộ Thôn", status: "Hoạt động", statusType: "green", lastLogin: "23/10/2024 15:00" },
  { name: "Võ Văn Đức (NĐ)", username: "0956789012", role: "Nông dân", status: "Khóa", statusType: "red", lastLogin: "10/10/2024 08:20" },
];

export const auditLog = [
  { time: "25/10/2024 16:45", user: "Nguyễn Khoa", ip: "192.168.1.10", action: "Duyệt hồ sơ", object: "KB-2024-0248", detail: "Phê duyệt đăng ký hộ mới" },
  { time: "25/10/2024 15:30", user: "Trần Thị Lan", ip: "192.168.1.15", action: "Cập nhật", object: "TH3-012 – Lê Văn Cường", detail: "Cập nhật thông tin thửa đất" },
  { time: "25/10/2024 14:12", user: "Lê Văn Kiểm", ip: "192.168.1.22", action: "Tạo mới", object: "BB-2024-031", detail: "Tạo biên bản kiểm tra thực địa Thôn 2" },
  { time: "25/10/2024 11:05", user: "Phạm Văn Ba", ip: "192.168.1.18", action: "Ghi nhật ký", object: "TH1-001 – Nguyễn Văn An", detail: "Ghi hoạt động phun thuốc" },
  { time: "24/10/2024 17:20", user: "Nguyễn Khoa", ip: "192.168.1.10", action: "Xuất báo cáo", object: "BC-VietGAP-Q3-2024", detail: "Xuất báo cáo VietGAP Q3/2024 (Excel)" },
  { time: "24/10/2024 09:30", user: "Lê Văn Kiểm", ip: "192.168.1.22", action: "Cảnh báo", object: "Nguyễn Văn A – TH3-008", detail: "Tạo cảnh báo vi phạm thuốc Carbaryl" },
];
