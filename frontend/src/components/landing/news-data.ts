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
      lead: "Đoàn công tác Chi cục Trồng trọt & Bảo vệ Thực vật tỉnh Đắk Lắk phối hợp cùng Phòng Nông nghiệp huyện Krông Búk đã có chuyến thăm và làm việc tại các vườn sầu riêng thành viên HTX Nông nghiệp Cư Né.",
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
      lead: "Nhằm chuẩn bị tốt nhất cho giai đoạn phân hóa mầm hoa và tạo vụ sầu riêng năng suất cao, HTX Cư Né tổ chức chuỗi tập huấn thực địa định kỳ hàng tháng cho toàn thể bà con nông dân.",
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
    title: "Quản lý tổng hợp (IPM) bệnh xì mủ, héo ngọn và sâu hại sầu riêng theo tiêu chuẩn VietGAP 2026",
    excerpt:
      "Hướng dẫn mới nhất của Viện Bảo vệ Thực vật (2026) về nhận diện 10 bệnh hại, 21 loài sâu hại tại Đắk Lắk và phác đồ kết hợp chế phẩm sinh học với thuốc hóa học theo nguyên tắc 4 đúng.",
    date: "21/10/2026",
    readTime: "6 phút đọc",
    author: "Tổ Bảo vệ Thực vật HTX Cư Né",
    image: "/landing/news-protection.jpg",
    imageAlt: "Bà con kiểm tra kỹ lưỡng mặt dưới của lá sầu riêng để phát hiện sớm mầm nấm bệnh",
    content: {
      lead: "Theo tài liệu kỹ thuật Quản lý dịch hại tổng hợp (IPM) cây sầu riêng năm 2026 của Viện Khoa học Nông nghiệp Việt Nam – Viện Bảo vệ Thực vật, tại vùng trồng Đắk Lắk có 10 bệnh hại và 21 loài sâu hại thường xuyên xuất hiện, trong đó bệnh xì mủ (Phytophthora palmivora) và bệnh héo ngọn (Diaporthe durionigena) là hai bệnh nguy hiểm nhất.",
      sections: [
        {
          heading: "1. Phác đồ quản lý bệnh héo ngọn và bệnh xì mủ",
          paragraphs: [
            "Đối với bệnh héo ngọn (phát triển mạnh từ tháng 11 đến tháng 2 năm sau): Cuối mùa mưa (tháng 11), phun phòng bằng chế phẩm vi sinh đối kháng (Trichoderma spp., Bacillus spp., Streptomyces spp. ≥ 10⁸ bào tử/g) pha tỷ lệ 1:1000 vào chiều mát. Khi tỷ lệ bệnh ≥ 5%, cắt bỏ cành bệnh kết hợp phun Hexaconazole ≥ 85% hoặc Dimethomorph 90g/kg + Mancozeb 600g/kg (Acrobat MZ 90/600 WP) 2 lần cách nhau 7–10 ngày.",
            "Đối với bệnh xì mủ (mùa mưa tháng 5–11): Ủ 3 kg chế phẩm vi sinh (Trichoderma, Bacillus, Streptomyces) với 1 tấn phân chuồng hoai mục (độ ẩm 50–60%) trước 7–10 ngày để bón vùng rễ vào tháng 4 – đầu tháng 5. Với cây chớm bệnh, cạo sạch vỏ bệnh rồi quét Metalaxyl-M + Mancozeb hoặc Acrobat MZ 90/600 WP, kết hợp tiêm Phosphorous acid (Agri-Fos 400SL) cho cây có đường kính thân ≥ 15 cm (2 lần cách nhau 15 ngày vào ngày khô ráo).",
          ],
        },
        {
          heading: "2. Quản lý rệp sáp bột hai tua dài, rầy nhảy và sâu đục quả",
          paragraphs: [
            "Giai đoạn cây ra lộc non (tháng 6–9) và ra hoa đậu quả (tháng 3–8), ưu tiên bảo tồn thiên địch (bọ mắt vàng, bọ rùa, nhện bắt mồi, ong ký sinh) và phun luân phiên chế phẩm sinh học với hóa học:",
          ],
          bulletPoints: [
            "Thuốc sinh học: ABT 2WP (Abamectin + Bt kurstaki), Trắng xanh WP (Beauveria bassiana + Metarhizium anisopliae), Bitadin WP (Bt kurstaki + Granulosis virus).",
            "Luân phiên & phối trộn: Movento 150OD (Spirotetramat) + Bitadin WP; Sida 20WP (Dinotefuran) + Trắng xanh WP; Confidor 200SL (Imidacloprid) + Dầu khoáng SK Enspray 99EC; Ascend 20SP (Acetamiprid) + Trắng xanh WP; hoặc Penalty 40WP (Acetamiprid + Buprofezin).",
            "Bệnh đốm lá & thán thư: Phun 3 lần cách nhau 7–10 ngày luân phiên Propineb, Metiram complex, Mancozeb + Metalaxyl-M, Trifloxystrobin + Tebuconazole và Hexaconazole (lần 2 khi ra đọt non cộng thêm Nitenpyram + Buprofezin).",
          ],
        },
      ],
      takeaway:
        "Chỉ sử dụng thuốc BVTV khi dịch hại chạm ngưỡng kinh tế và tuân thủ nghiêm nguyên tắc 4 đúng. Tuyệt đối không dùng các hoạt chất cấm theo quy định VietGAP và Nghị định thư GACC.",
    },
  },
  {
    id: "quy-trinh-bon-phan-can-doi",
    category: "farming",
    categoryLabel: "Quy trình chăm bón",
    tagTone: "peach",
    title: "Quy trình ủ phân chuồng vi sinh đối kháng, cắt tỉa và vệ sinh vườn sầu riêng chuẩn VietGAP 2026",
    excerpt:
      "Hướng dẫn chi tiết kỹ thuật ủ phân chuồng hoai mục ở độ ẩm 50–60% với nấm đối kháng Trichoderma – Bacillus – Streptomyces, kết hợp nấm rễ Mycorrhizae và lịch cắt tỉa tạo tán theo tháng.",
    date: "18/10/2026",
    readTime: "5 phút đọc",
    author: "KS. Nguyễn Thành Long – HTX Cư Né",
    image: "/landing/durian-tree.jpg",
    imageAlt: "Cây sầu riêng trĩu quả xanh mướt trên nền đất đỏ giàu dinh dưỡng hữu cơ",
    content: {
      lead: "Áp dụng 4 nguyên tắc IPM (Trồng cây khỏe – Bảo vệ thiên địch – Thăm đồng thường xuyên – Nông dân trở thành chuyên gia), quy trình chăm sóc vườn sầu riêng năm 2026 tại HTX Cư Né đặt trọng tâm vào cải tạo đất sinh học và vệ sinh đồng ruộng.",
      sections: [
        {
          heading: "Phương pháp ủ phân chuồng hoai mục với vi sinh vật đối kháng",
          paragraphs: [
            "Để phòng ngừa hiệu quả nấm Phytophthora palmivora và Phytopythium vexans gây xì mủ, vàng lá thối rễ, bà con thực hiện ủ trộn chế phẩm sinh học trước khi bón:",
          ],
          bulletPoints: [
            "Tỷ lệ ủ trộn: Dùng 3 kg chế phẩm vi sinh đối kháng (Trichoderma spp., Bacillus spp., Streptomyces spp. mật độ ≥ 10⁸ bào tử/g) trộn đều với 1 tấn phân chuồng hoai mục trước khi bón 7 – 10 ngày.",
            "Kiểm soát độ ẩm 50% – 60%: Bóp chặt nắm phân trong tay thấy nước rỉ qua kẽ tay là đạt yêu cầu (nước chảy thành dòng là quá ẩm, xòe tay vỡ rời là quá khô), sau đó phủ kín đống ủ bằng bạt.",
            "Thời điểm & cách bón: Bón vào đất vùng rễ theo hình chiếu tán cây hoặc giữa 2 hàng khi cây đã giao tán rồi phủ lớp đất mặt lên trên vào thời điểm trước mùa mưa (tháng 4 đến đầu tháng 5). Kết hợp 50–100 kg phân hữu cơ + 100–150 g nấm rễ Arbuscular mycorrhizae/cây/năm để phòng đốm lá, thán thư.",
          ],
        },
        {
          heading: "Lịch cắt tỉa và vệ sinh vườn theo mùa vụ",
          paragraphs: [
            "Tháng 9 – Tháng 10 (sau thu hoạch): Cắt bỏ và tiêu hủy cành khô, lá vàng, cành vượt, cành che bóng và tỉa tán cây trồng xen (cà phê, bơ) vào những ngày nắng ráo để vườn thông thoáng.",
            "Tháng 1 – Tháng 2 (ra hoa rộ): Tỉa bỏ bớt chùm hoa mọc dày và những chùm hoa có rệp sáp bột hai tua dài; đào hố ở vị trí giao tán giữa 4 cây trước mùa mưa để thu gom tàn dư, lá rụng và tiêu hủy quả nhiễm bệnh thối nâu, thối đen.",
          ],
        },
      ],
      takeaway:
        "Mọi đợt bón phân, cắt tỉa và phun phòng sinh học cần được bà con cập nhật đầy đủ kèm ảnh chụp thực địa lên Cổng Nông hộ HTX Cư Né để đồng bộ hồ sơ truy xuất nguồn gốc.",
    },
  },
];
