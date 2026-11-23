// Nội dung tĩnh của trang giới thiệu. Số liệu động (số hộ, diện tích, danh mục thuốc/giống, lịch tập huấn)
// lấy từ /api/public/* nên luôn khớp với dữ liệu thật của hệ thống.

export const NAV_LINKS = [
  { href: "#he-thong", label: "Hệ thống" },
  { href: "#ma-vung", label: "Vùng trồng" },
  { href: "#tap-huan", label: "Tập huấn" },
  { href: "#tin-tuc", label: "Tin tức" },
  { href: "#tra-cuu", label: "Khuyến cáo" },
  { href: "#hoi-dap", label: "Hỏi đáp" },
];

export const FAQ = [
  {
    q: "Mã vùng trồng là gì và vì sao vườn của tôi cần có?",
    a: "Mã vùng trồng giống như “số căn cước” của khu vườn: gắn với ranh giới đất, chủ vườn, giống cây và nhật ký chăm sóc. Nước nhập khẩu muốn biết mỗi lô sầu riêng đến từ vườn nào; không có mã thì khó xuất khẩu chính ngạch (đường chính thức).",
    shortA:
      "Là “số căn cước” định danh thửa vườn, chủ hộ và nhật ký canh tác, điều kiện bắt buộc để xuất khẩu chính ngạch.",
  },
  {
    q: "Tôi muốn đăng ký mã vùng trồng thì làm thế nào?",
    a: "Bấm Đăng ký ở góc trên để xem hướng dẫn lập hồ sơ với Trưởng thôn hoặc cán bộ kỹ thuật HTX. Sau khi đối chiếu đất đai và đo vẽ GPS tại vườn, HTX sẽ bàn giao tài khoản theo số điện thoại để hộ bắt đầu áp dụng quy trình chăm sóc chuẩn và ghi nhật ký mùa vụ.",
    shortA:
      "Liên hệ Trưởng thôn hoặc cán bộ HTX lập hồ sơ đo đạc GPS thửa vườn để được cấp mã và bàn giao tài khoản thành viên.",
  },
  {
    q: "Làm thế nào để sầu riêng của hộ tham gia HTX được đảm bảo thu mua đúng giá, giá cao?",
    a: "Hộ thành viên cần học và tuân thủ nghiêm ngặt Quy trình chăm sóc sầu riêng chuẩn niên vụ 2026-2027 của HTX Cư Né (từ khâu Chuẩn bị vườn, Cơi đọt 1-2, Tạo mầm, Nuôi bông, Nuôi trái, Kéo cơi, Làm cơm đến điều tiết đọt SenPro), kết hợp ghi nhật ký đầy đủ và tôn trọng thời gian cách ly. Chỉ khi tuân thủ đúng quy trình chuẩn này, trái mới đồng đều 3-4 kg, lên cơm vàng ráo, đạt kiểm nghiệm Cadimi và MRL để HTX bảo chứng bao tiêu đúng giá, giá cao.",
    shortA:
      "Tuân thủ đúng Quy trình chăm sóc chuẩn 2026-2027 của HTX và ghi nhật ký đầy đủ để trái đạt chuẩn xuất khẩu, được HTX đảm bảo thu mua đúng giá, giá cao.",
  },
  {
    q: "Tôi không rành công nghệ, ghi nhật ký có khó không?",
    a: "Rất đơn giản: chọn ngày, thửa, công việc rồi bấm lưu. Giao diện hộ dân thiết kế cho điện thoại. Nếu cần, cán bộ thôn có thể hỗ trợ ghi giúp và hộ vẫn xem lại được.",
    shortA:
      "Chỉ cần chọn ngày, thửa vườn, công việc rồi bấm lưu ngay trên điện thoại; cán bộ thôn luôn sẵn sàng hỗ trợ.",
  },
  {
    q: "Nếu lỡ dùng thuốc bị cấm thì sao?",
    a: "Hãy ghi lại trung thực và báo ngay cán bộ HTX. Hệ thống sẽ đánh dấu lại để cán bộ hướng dẫn bạn chờ thêm ngày cách ly hoặc xử lý lô thu hoạch. Che giấu sẽ gây rủi ro lớn hơn nhiều cho cả vườn và cả vùng.",
    shortA:
      "Báo ngay cho cán bộ HTX để được hướng dẫn chờ cách ly hoặc xử lý riêng lô hàng, tránh ảnh hưởng cả vùng trồng.",
  },
  {
    q: "Dữ liệu cá nhân của hộ có bị công khai không?",
    a: "Không. Trang này chỉ hiện số liệu chung và các danh mục dùng chung. Thông tin của từng hộ chỉ chính hộ đó và cán bộ phụ trách mới xem được; mọi lần chỉnh sửa đều được ghi lại để biết ai đã làm gì.",
    shortA:
      "Không. Thông tin riêng của từng hộ được bảo mật, chỉ chủ hộ và cán bộ phụ trách mới có quyền truy cập.",
  },
  {
    q: "Hàng xuất đi nước ngoài có kiểm tra được từ vườn nào không?",
    a: "Có. Mỗi lô thu hoạch gắn với thửa đất và hộ trồng, có tem QR. Ai quét tem cũng xem được nguồn gốc vùng trồng, ngày thu hoạch và kết quả kiểm nghiệm, mà vẫn không lộ thông tin riêng tư của hộ.",
    shortA:
      "Có. Quét tem QR trên lô hàng sẽ hiện rõ vùng trồng, ngày thu hoạch và kết quả kiểm nghiệm mà không lộ thông tin riêng của hộ.",
  },
];
