// Nội dung tĩnh của trang giới thiệu. Số liệu động (số hộ, diện tích, danh mục thuốc/giống, lịch tập huấn)
// lấy từ /api/public/* nên luôn khớp với dữ liệu thật của hệ thống.

export const NAV_LINKS = [
  { href: "#he-thong", label: "Hệ thống" },
  { href: "#ma-vung", label: "Mã vùng trồng" },
  { href: "#quy-trinh", label: "Quy trình chăm sóc" },
  { href: "#tieu-chuan", label: "Tiêu chuẩn xuất khẩu" },
  { href: "#tra-cuu", label: "Tra cứu" },
  { href: "#hoi-dap", label: "Hỏi đáp" },
];

export const ROLES = [
  { name: "Quản trị viên", text: "Cấp tài khoản, quyết định ai được xem và làm gì, theo dõi lại mọi thao tác trong hệ thống." },
  { name: "Cán bộ HTX", text: "Duyệt hồ sơ, quản lý danh sách hộ và thửa đất, danh mục thuốc, giống và các lô thu hoạch." },
  { name: "Kiểm tra viên", text: "Đến vườn kiểm tra và lập biên bản, ghi kết quả kiểm nghiệm mẫu, báo cho hộ khi có vi phạm." },
  { name: "Cán bộ Thôn", text: "Theo dõi các hộ trong thôn mình phụ trách và giúp bà con ghi nhật ký." },
  { name: "Hộ dân", text: "Xem thửa đất, ghi nhật ký, nhận nhắc nhở và gửi hồ sơ ngay trên điện thoại." },
];

export const CODE_PARTS = [
  { part: "KB", label: "Krông Búk", note: "Xã / HTX" },
  { part: "VT", label: "Vùng trồng", note: "Loại mã: vùng trồng" },
  { part: "001", label: "Thôn", note: "Khu vực canh tác" },
  { part: "H001", label: "Hộ", note: "Số thứ tự hộ" },
];

export const CODE_STEPS = [
  { title: "Hộ gửi hồ sơ", text: "Hộ đăng ký vùng trồng qua cổng hộ dân hoặc nhờ cán bộ thôn hỗ trợ, kèm giấy tờ đất." },
  { title: "Xác nhận và đo đất", text: "Cán bộ so với hồ sơ đất đai, đi đo hoặc vẽ ranh giới thửa đất trên bản đồ và tính diện tích." },
  { title: "Kiểm tra tại vườn", text: "Kiểm tra viên đến tận vườn xem giống, tuổi cây, cách chăm sóc và lập biên bản." },
  { title: "Duyệt & cấp mã", text: "Cán bộ HTX duyệt hồ sơ. Thửa đạt yêu cầu sẽ được cấp mã vùng trồng và hiện trên bản đồ." },
  { title: "Canh tác có ghi chép", text: "Hộ ghi nhật ký bón phân, phun thuốc; hệ thống tự kiểm tra thuốc có được phép dùng không và đã đủ ngày cách ly chưa." },
  { title: "Kiểm nghiệm & tem QR", text: "Lấy mẫu đem đi kiểm nghiệm, dán tem QR lên từng lô hàng để biết trái sầu riêng đến từ vườn nào." },
];

export interface Stage {
  id: string;
  label: string;
  title: string;
  tag: string;
  items: string[];
  log: string;
}

export const STAGES: Stage[] = [
  {
    id: "dat",
    label: "Đất & thiết kế vườn",
    title: "Chuẩn bị đất và thiết kế vườn",
    tag: "Trước khi trồng",
    items: [
      "Chọn đất thoát nước tốt, tầng canh tác dày; tránh vùng trũng, dễ úng.",
      "Lấy mẫu đất đem kiểm tra độ chua (pH khoảng 5,5–6,5), lượng chất hữu cơ và kim loại nặng như Cadimi.",
      "Lên luống, làm mương thoát nước, trồng cây chắn gió cho vườn.",
      "Vẽ ranh giới thửa đất trên bản đồ của hệ thống để được cấp mã vùng trồng.",
    ],
    log: "Kết quả phân tích đất, ngày lên luống, bản vẽ ranh thửa.",
  },
  {
    id: "giong",
    label: "Giống & trồng",
    title: "Chọn giống và trồng mới",
    tag: "Khởi đầu vụ",
    items: [
      "Dùng cây giống ghép từ vườn ươm có nguồn gốc rõ ràng, giữ hóa đơn hoặc giấy chứng nhận.",
      "Chọn giống phù hợp thị trường và điều kiện đất (xem danh mục giống ở phần Tra cứu).",
      "Trồng với khoảng cách đủ thoáng, che bóng cho cây con giai đoạn đầu.",
      "Ghi giống và năm trồng cho từng thửa để sau này biết rõ nguồn gốc.",
    ],
    log: "Tên giống, năm trồng, nơi mua cây giống.",
  },
  {
    id: "phan",
    label: "Bón phân",
    title: "Bón phân đúng cách",
    tag: "Quanh năm",
    items: [
      "Bón theo giai đoạn: phục hồi sau thu hoạch, trước ra hoa, nuôi trái.",
      "Ưu tiên phân hữu cơ đã ủ hoai; chỉ dùng phân có nguồn gốc và thành phần rõ ràng.",
      "Chọn nguồn phân rõ ràng để Cadimi (kim loại nặng) không tích tụ trong đất và trong trái.",
      "Giữ bao bì, hóa đơn của từng đợt bón.",
    ],
    log: "Loại phân, liều lượng, ngày bón, nơi mua.",
  },
  {
    id: "nuoc",
    label: "Tưới & ra hoa",
    title: "Tưới nước và xử lý ra hoa",
    tag: "Trước và trong vụ hoa",
    items: [
      "Giữ ẩm đều, không để úng, đặc biệt trong mùa mưa (nguy cơ thối rễ, chảy mủ).",
      "Điều chỉnh lượng nước trước khi cây ra hoa theo hướng dẫn của cán bộ kỹ thuật.",
      "Không tự ý dùng chất kích thích không rõ nguồn gốc; hỏi cán bộ kỹ thuật khi cần.",
      "Theo dõi đậu trái và ghi ngày xử lý ra hoa để dự kiến ngày thu hoạch.",
    ],
    log: "Ngày tưới lớn, ngày xử lý ra hoa, ngày đậu trái.",
  },
  {
    id: "sau-benh",
    label: "Sâu bệnh & thuốc",
    title: "Phòng trừ sâu bệnh và dùng thuốc bảo vệ thực vật",
    tag: "Mức rủi ro cao nhất",
    items: [
      "Phòng bệnh từ gốc: dọn vườn sạch, tỉa cành cho thoáng, thăm vườn thường xuyên để phát hiện sớm.",
      "Chỉ dùng thuốc trong danh mục được phép; mua ở đại lý có giấy phép và giữ hóa đơn.",
      "Nguyên tắc 4 đúng: đúng thuốc, đúng liều lượng, đúng lúc, đúng cách.",
      "Chờ đủ số ngày cách ly (từ lần phun cuối đến khi được thu hoạch) của từng loại thuốc.",
      "Không dùng thuốc bị cấm dù chỉ một lần: lô hàng có thể bị trả về, ảnh hưởng cả vùng.",
    ],
    log: "Tên thuốc, liều lượng, diện tích phun, ngày phun, đại lý. Hệ thống sẽ tự báo nếu thuốc bị cấm hoặc chưa đủ ngày cách ly.",
  },
  {
    id: "thu-hoach",
    label: "Thu hoạch",
    title: "Thu hoạch đúng cách",
    tag: "Mùa thu hoạch",
    items: [
      "Thu đúng độ chín theo giống và số ngày tuổi trái; không thu non.",
      "Tuyệt đối không dùng hóa chất làm chín hoặc tạo màu cơm, kể cả Vàng O (thuốc nhuộm công nghiệp bị cấm).",
      "Kiểm tra thời gian cách ly đã đủ trước khi cắt trái.",
      "Dụng cụ, sàn tập kết sạch; ghi mã thửa hoặc mã lô lên thùng ngay khi thu.",
    ],
    log: "Ngày thu, thửa thu, sản lượng, người thu.",
  },
  {
    id: "sau-thu",
    label: "Sau thu hoạch",
    title: "Sau thu hoạch và chuẩn bị xuất khẩu",
    tag: "Trước khi xuất",
    items: [
      "Phân loại và đóng gói tại cơ sở có mã số đóng gói được cấp.",
      "Đem mẫu đi kiểm nghiệm xem còn sót thuốc, Cadimi hay Vàng O không trước khi xuất, theo yêu cầu của nước nhập khẩu.",
      "Dán tem QR lên từng lô để quét là biết lô hàng đến từ vườn nào.",
      "Lưu đầy đủ hồ sơ: nhật ký canh tác, kết quả kiểm nghiệm, chứng từ mua vật tư.",
    ],
    log: "Mã lô, kết quả kiểm nghiệm, đơn vị mua, thị trường.",
  },
];

export const STANDARDS = [
  {
    tag: "Điều kiện bắt buộc",
    title: "Mã vùng trồng và mã nơi đóng gói",
    text: "Muốn bán sầu riêng tươi sang Trung Quốc theo đường chính thức (chính ngạch), vườn và nơi đóng gói đều phải có mã số riêng và được đăng ký với Hải quan Trung Quốc (GACC), theo thỏa thuận hai nước ký năm 2022. Không có mã, hàng không được qua cửa khẩu.",
  },
  {
    tag: "Cách làm vườn đúng chuẩn",
    title: "VietGAP / GlobalGAP",
    text: "VietGAP là bộ quy tắc làm nông nghiệp sạch, an toàn của Việt Nam; GlobalGAP là bộ quy tắc quốc tế, thường được các nhà nhập khẩu châu Âu và siêu thị lớn yêu cầu. Cả hai đều bắt buộc ghi chép nhật ký đầy đủ.",
  },
  {
    tag: "Thuốc bảo vệ thực vật",
    title: "Mức thuốc còn sót tối đa (MRL)",
    text: "Mỗi nước nhập khẩu quy định mức tối đa (MRL) thuốc còn sót lại trên trái cho từng loại thuốc. Muốn dưới mức cho phép, chỉ có cách dùng đúng thuốc, đúng liều và chờ đủ ngày cách ly.",
  },
  {
    tag: "Kim loại nặng",
    title: "Cadimi (Cd)",
    text: "Cadimi là kim loại nặng, có thể thấm từ đất và phân bón vào trái, gây hại cho người ăn. Nước nhập khẩu đang kiểm tra ngày càng chặt, nên hãy kiểm tra đất và chỉ dùng phân rõ nguồn gốc, rõ thành phần.",
  },
  {
    tag: "Chất cấm",
    title: "Vàng O (Auramine O)",
    text: "Vàng O là thuốc nhuộm công nghiệp, cấm dùng trong thực phẩm, từng bị lạm dụng để tạo màu vàng cho cơm sầu riêng. Nếu bị phát hiện, cả lô hàng bị chặn và uy tín cả vùng bị ảnh hưởng. Tuyệt đối không dùng.",
  },
];

export const EXPORT_CHECKLIST = [
  "Vườn đã có mã vùng trồng, nơi đóng gói đã có mã số.",
  "Nhật ký canh tác và phun thuốc được ghi đầy đủ, liên tục suốt vụ.",
  "Không sử dụng thuốc bị cấm; mọi lần phun đều đã chờ đủ ngày cách ly.",
  "Kết quả kiểm nghiệm mẫu đạt yêu cầu về thuốc còn sót, Cadimi và Vàng O.",
  "Thu hoạch đúng độ chín, không dùng hóa chất làm chín hay tạo màu.",
  "Mỗi lô hàng có mã lô và tem QR để biết hàng đến từ vườn nào.",
  "Giữ hóa đơn phân bón, thuốc bảo vệ thực vật và cây giống để xuất trình khi cần.",
];

export interface SeasonBar {
  label: string;
  start: number; // tháng bắt đầu (1–12)
  end: number; // tháng kết thúc (1–12)
  tone: "flower" | "grow" | "harvest" | "recover" | "rain";
}

export const SEASON: SeasonBar[] = [
  { label: "Ra hoa", start: 12, end: 12, tone: "flower" },
  { label: "Ra hoa, đậu trái", start: 1, end: 3, tone: "flower" },
  { label: "Nuôi trái", start: 3, end: 7, tone: "grow" },
  { label: "Thu hoạch (chính vụ)", start: 5, end: 8, tone: "harvest" },
  { label: "Phục hồi cây, bón phân", start: 8, end: 11, tone: "recover" },
  { label: "Mùa mưa: phòng nấm, chống úng", start: 5, end: 10, tone: "rain" },
];

export const FAQ = [
  {
    q: "Mã vùng trồng là gì và vì sao vườn của tôi cần có?",
    a: "Mã vùng trồng giống như “số căn cước” của khu vườn: gắn với ranh giới đất, chủ vườn, giống cây và nhật ký chăm sóc. Nước nhập khẩu muốn biết mỗi lô sầu riêng đến từ vườn nào; không có mã thì khó xuất khẩu chính ngạch (đường chính thức).",
  },
  {
    q: "Tôi muốn đăng ký mã vùng trồng thì làm thế nào?",
    a: "Bấm Đăng ký ở góc trên, điền họ tên, số điện thoại và mật khẩu. Cán bộ HTX sẽ kiểm tra và xác nhận tài khoản đó đúng là của hộ bạn. Sau đó bạn đăng nhập bằng số điện thoại và gửi hồ sơ vùng trồng ngay trong mục Hồ sơ. Cán bộ sẽ đến đo đất, xem vườn rồi mới duyệt cấp mã.",
  },
  {
    q: "Tôi không rành công nghệ, ghi nhật ký có khó không?",
    a: "Rất đơn giản: chọn ngày, thửa, công việc rồi bấm lưu. Giao diện hộ dân thiết kế cho điện thoại. Nếu cần, cán bộ thôn có thể hỗ trợ ghi giúp và hộ vẫn xem lại được.",
  },
  {
    q: "Nếu lỡ dùng thuốc bị cấm thì sao?",
    a: "Hãy ghi lại trung thực và báo ngay cán bộ HTX. Hệ thống sẽ đánh dấu lại để cán bộ hướng dẫn bạn chờ thêm ngày cách ly hoặc xử lý lô thu hoạch. Che giấu sẽ gây rủi ro lớn hơn nhiều cho cả vườn và cả vùng.",
  },
  {
    q: "Dữ liệu cá nhân của hộ có bị công khai không?",
    a: "Không. Trang này chỉ hiện số liệu chung và các danh mục dùng chung. Thông tin của từng hộ chỉ chính hộ đó và cán bộ phụ trách mới xem được; mọi lần chỉnh sửa đều được ghi lại để biết ai đã làm gì.",
  },
  {
    q: "Những quy định xuất khẩu trên trang này có luôn đúng không?",
    a: "Nội dung mang tính hướng dẫn chung để hộ dân hiểu quy trình. Quy định của từng thị trường thay đổi theo thời gian, vì vậy hãy luôn hỏi lại hướng dẫn mới nhất của cơ quan bảo vệ thực vật và đơn vị nhập khẩu.",
  },
];
