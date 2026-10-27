export interface NewsArticle {
  id: string;
  category: "visit" | "training" | "protection" | "farming";
  categoryLabel: string;
  tagTone: "blue" | "green" | "yellow" | "peach";
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  author: string;
  image: string;
  imageAlt: string;
  featured?: boolean;
  content: {
    lead: string;
    sections: {
      heading: string;
      paragraphs: string[];
      bulletPoints?: string[];
    }[];
    takeaway?: string;
  };
}

export const NEWS_CATEGORIES = [
  { id: "all", label: "Tất cả bản tin" },
  { id: "visit", label: "Lãnh đạo & Thăm vườn" },
  { id: "training", label: "Tập huấn nhà nông" },
  { id: "protection", label: "Thuốc & Sâu bệnh" },
  { id: "farming", label: "Quy trình chăm bón" },
] as const;

export const NEWS_ARTICLES: NewsArticle[] = [
  {
    id: "doan-chi-cuc-tham-vuon",
    category: "visit",
    categoryLabel: "Lãnh đạo & Thăm vườn",
    tagTone: "blue",
    featured: true,
    title: "Đoàn công tác Chi cục Trồng trọt & BVTV Đắk Lắk về thăm, đánh giá vùng trồng Krông Búk",
    excerpt:
      "Sáng ngày 26/10, đoàn kiểm tra liên ngành đã trực tiếp về khảo sát thực địa tại Thôn 1 và Thôn 2. Đoàn đánh giá cao nỗ lực ghi nhật ký điện tử và việc bà con tuân thủ nghiêm ngặt danh mục hoạt chất an toàn.",
    date: "26/10/2026",
    readTime: "4 phút đọc",
    author: "Ban Kỹ thuật & Truyền thông HTX",
    image: "/landing/news-field-visit.jpg",
    imageAlt: "Đoàn cán bộ và ban giám đốc HTX cùng bà con kiểm tra cây sầu riêng tại vườn Krông Búk",
    content: {
      lead: "Đoàn công tác Chi cục Trồng trọt & Bảo vệ Thực vật tỉnh Đắk Lắk phối hợp cùng Phòng Nông nghiệp huyện Krông Búk đã có chuyến thăm và làm việc tại các vườn sầu riêng thành viên HTX Nông nghiệp Krông Búk.",
      sections: [
        {
          heading: "Kiểm tra thực địa và đánh giá vùng trồng xuất khẩu",
          paragraphs: [
            "Đoàn đã trực tiếp kiểm tra hệ thống ranh giới thửa đất, hệ thống tưới tiết kiệm và kiểm tra chéo nhật ký canh tác ghi chép trên ứng dụng di động của 15 hộ dân tiêu biểu thuộc mã vùng trồng KB-VT-001.",
            "Trưởng đoàn công tác nhấn mạnh: 'Việc bà con nông dân Krông Búk chủ động cập nhật từng đợt bón phân, dọn cỏ và tuân thủ thời gian cách ly thuốc BVTV là điểm sáng lớn, giúp bảo vệ uy tín thương hiệu sầu riêng Đắk Lắk trên thị trường quốc tế.'",
          ],
          bulletPoints: [
            "100% diện tích kiểm tra đạt chuẩn độ che phủ tán và vệ sinh vườn sạch sẽ.",
            "Không phát hiện dấu vết các loại hóa chất cấm hay kích thích chín ép trôi nổi.",
            "Hệ thống định vị ranh giới vườn trên bản đồ số khớp 100% với giấy tờ thực tế.",
          ],
        },
        {
          heading: "Định hướng chỉ đạo trong vụ mùa mới",
          paragraphs: [
            "Đại diện đoàn công tác yêu cầu Ban quản trị HTX tiếp tục giám sát chặt chẽ giai đoạn làm bông và đón hoa sắp tới. Tiếp tục đẩy mạnh kiểm nghiệm mẫu đất, mẫu nước định kỳ tại Trung tâm kiểm nghiệm được Bộ chỉ định.",
            "Lãnh đạo địa phương cũng cam kết sẽ ưu tiên hỗ trợ nguồn vốn vay ưu đãi và tiếp tục mở các lớp tập huấn kỹ thuật chuyển giao công nghệ cao cho bà con thành viên.",
          ],
        },
      ],
      takeaway:
        "Bà con thuộc vùng trồng cần duy trì nhật ký đều đặn ít nhất 1 lần/tuần. Khi có cán bộ đến lấy mẫu kiểm tra ngẫu nhiên, cần phối hợp cung cấp đầy đủ thông tin để giữ vững chứng nhận mã vùng xuất khẩu.",
    },
  },
  {
    id: "tap-huan-tia-canh-lam-bong",
    category: "training",
    categoryLabel: "Tập huấn nhà nông",
    tagTone: "green",
    title: "Lịch tập huấn thực địa: Hướng dẫn tỉa cành, làm bông và thụ phấn bổ sung vụ 2026–2027",
    excerpt:
      "Chương trình tập huấn cầm tay chỉ việc tại vườn mẫu Thôn 3, do thạc sĩ nông nghiệp hướng dẫn trực tiếp về kỹ thuật tỉa chồi vượt, xiết nước tạo mầm và thụ phấn ban đêm giúp trái tròn đều.",
    date: "24/10/2026",
    readTime: "3 phút đọc",
    author: "Tổ Khuyến nông HTX",
    image: "/landing/news-training.jpg",
    imageAlt: "Kỹ sư nông nghiệp hướng dẫn bà con nông dân thao tác tỉa cành sầu riêng tại vườn",
    content: {
      lead: "Nhằm chuẩn bị tốt nhất cho giai đoạn phân hóa mầm hoa và tạo vụ sầu riêng năng suất cao, HTX Krông Búk tổ chức chuỗi tập huấn thực địa định kỳ hàng tháng cho toàn thể bà con nông dân.",
      sections: [
        {
          heading: "Nội dung trọng tâm của khóa tập huấn",
          paragraphs: [
            "Tại buổi học, bà con được hướng dẫn các thao tác chuẩn xác nhất trên cây thật, tránh tình trạng tỉa sai làm mất cành mang trái cấp 1:",
          ],
          bulletPoints: [
            "Kỹ thuật tỉa cành tăm, cành sâu bệnh và cành vượt bên trong tán để tạo độ thông thoáng tuyệt đối.",
            "Xác định đúng thời điểm 'xiết nước' (cắt nước) tạo sốc nhiệt nhẹ kích thích mầm hoa nhú mắt cua đồng loạt.",
            "Kỹ thuật thụ phấn bổ sung bằng chổi quét tơ mềm vào khung giờ 18h30 - 20h30 để cơm vàng dày đều các hộc.",
          ],
        },
        {
          heading: "Thời gian và địa điểm tổ chức",
          paragraphs: [
            "Buổi 1: Thứ Năm ngày 05/11/2026 tại Vườn mẫu ông Y Blô Niê (Thôn 3, xã Krông Búk).",
            "Buổi 2: Thứ Bảy ngày 07/11/2026 tại Nhà sinh hoạt cộng đồng Buôn Cư Mblim.",
            "Tất cả tài liệu hướng dẫn và kéo tỉa chuyên dụng sẽ được HTX cấp phát miễn phí cho bà con tham gia.",
          ],
        },
      ],
      takeaway:
        "Bà con có thể đăng ký trực tiếp trên Cổng hộ dân hoặc báo cho Cán bộ thôn phụ trách để Ban tổ chức chuẩn bị chu đáo phần tài liệu và dụng cụ thực hành.",
    },
  },
  {
    id: "canh-bao-sau-benh-mua-mua",
    category: "protection",
    categoryLabel: "Thuốc & Sâu bệnh",
    tagTone: "yellow",
    title: "Cảnh báo bệnh nứt thân xì mủ mùa mưa: Danh mục hoạt chất sinh học an toàn được cấp phép",
    excerpt:
      "Độ ẩm cao là điều kiện nấm Phytophthora phát triển mạnh gây thối rễ, xì mủ thân. Khuyến cáo bà con chỉ sử dụng các dòng thuốc sinh học trong danh mục cho phép và tuyệt đối giữ thời gian cách ly.",
    date: "21/10/2026",
    readTime: "5 phút đọc",
    author: "Tổ Bảo vệ Thực vật HTX",
    image: "/landing/news-protection.jpg",
    imageAlt: "Bà con kiểm tra kỹ lưỡng mặt dưới của lá sầu riêng để phát hiện sớm mầm nấm bệnh",
    content: {
      lead: "Mùa mưa kéo dài tại vùng đất đỏ Tây Nguyên tiềm ẩn nguy cơ bùng phát nấm Phytophthora palmivora gây thối rễ và xì mủ gốc trên các vườn sầu riêng từ 4 năm tuổi trở lên.",
      sections: [
        {
          heading: "Biện pháp phòng ngừa canh tác tự nhiên",
          paragraphs: [
            "Trước khi can thiệp bằng thuốc, biện pháp canh tác bền vững là yếu tố quyết định:",
            "Vườn phải được xẻ rãnh thoát nước sâu 40-50cm giữa các hàng, tuyệt đối không để đọng vũng quanh cổ rễ. Dọn sạch tàn dư lá bệnh rụng xuống gốc, quét vôi hoặc chế phẩm đồng đỏ quanh thân cây từ mặt đất lên 1 mét.",
          ],
        },
        {
          heading: "Các hoạt chất sinh học được khuyến khích sử dụng",
          paragraphs: [
            "HTX khuyến cáo bà con chỉ dùng các hoạt chất có trong danh mục xuất khẩu đã được kiểm duyệt trong phần Tra cứu của hệ thống:",
          ],
          bulletPoints: [
            "Chế phẩm nấm đối kháng Trichoderma spp. tưới định kỳ quanh vùng rễ non.",
            "Phosphonate (lân 2 chiều) tiêm thân hoặc quét vết bệnh đã cạo sạch vỏ ngoài.",
            "Metalaxyl-M hoặc Mancozeb chính hãng với thời gian cách ly tối thiểu 14 ngày (tuyệt đối ngừng dùng trước thu hoạch 45 ngày).",
          ],
        },
      ],
      takeaway:
        "Nghiêm cấm tuyệt đối việc sử dụng hóa chất kích kháng trôi nổi không rõ nguồn gốc. Khi phát hiện cây chớm vàng lá, xì mủ, cần chụp ảnh báo ngay cho cán bộ kiểm tra của HTX.",
    },
  },
  {
    id: "quy-trinh-bon-phan-can-doi",
    category: "farming",
    categoryLabel: "Quy trình chăm bón",
    tagTone: "peach",
    title: "Quy trình bón phân hữu cơ vi sinh kết hợp tưới nhỏ giọt: Đất tơi xốp, cây bền lực",
    excerpt:
      "Chia sẻ kinh nghiệm thực tế từ các nhà vườn đạt năng suất 25 tấn/ha: Cách ủ phân chuồng hoai mục với vi sinh bản địa và điều tiết dinh dưỡng vi lượng Bo, Kẽm, Magie chống rụng hoa.",
    date: "18/10/2026",
    readTime: "4 phút đọc",
    author: "KS. Nguyễn Thành Long",
    image: "/landing/durian-tree.jpg",
    imageAlt: "Cây sầu riêng trĩu quả xanh mướt trên nền đất đỏ giàu dinh dưỡng hữu cơ",
    content: {
      lead: "Một trong những bí quyết để sầu riêng Krông Búk đạt tỷ lệ trái loại 1 trên 85% chính là kỹ thuật bón phân hữu cơ cân đối, kết hợp nuôi dưỡng hệ vi sinh vật đất khỏe mạnh.",
      sections: [
        {
          heading: "Công thức bón phân theo chu kỳ phát triển",
          paragraphs: [
            "Cây sầu riêng là loài cây ăn quả 'khó tính', đòi hỏi chế độ dinh dưỡng phân tầng rõ rệt tùy theo từng giai đoạn sinh trưởng:",
          ],
          bulletPoints: [
            "Giai đoạn phục hồi sau thu hoạch: Ưu tiên 20-30kg phân chuồng hoai mục + chế phẩm vi sinh/cây, kết hợp NPK tỷ lệ 20-20-15 để tái tạo bộ rễ mới.",
            "Giai đoạn đón hoa và nhú mắt cua: Giảm đạm, tăng lân hữu hiệu (DAP hoặc Lân nung chảy) để mầm hoa mập mạp, sáng màu.",
            "Giai đoạn nuôi trái non: Bổ sung định kỳ Canxi-Bo và Kali hữu cơ dạng phun sương nhẹ vào chiều mát để cuống trái dẻo dai, chống sốc rụng trái non.",
          ],
        },
        {
          heading: "Lưu ý quan trọng khi phối hợp phân bón",
          paragraphs: [
            "Không bón phân chuồng tươi chưa qua xử lý vì dễ mang theo nguồn nấm tuyến trùng gây hại rễ tơ.",
            "Tất cả các đợt bón phân đều phải ghi chép tên phân, liều lượng (kg/cây) và ngày bón vào Cổng hộ dân để phục vụ truy xuất tem QR sau này.",
          ],
        },
      ],
      takeaway:
        "Nuôi đất khỏe thì cây mới bền. Bón nhiều phân hóa học có thể kích cây nhanh nhưng đất sẽ chua và chai cứng, làm giảm tuổi thọ vườn sau 7-8 năm khai thác.",
    },
  },
];
