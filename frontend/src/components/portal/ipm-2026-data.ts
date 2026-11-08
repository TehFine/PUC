/**
 * Dữ liệu chuẩn hóa từ "TÀI LIỆU TẬP HUẤN KỸ THUẬT QUẢN LÝ DỊCH HẠI TỔNG HỢP (IPM)
 * CÂY SẦU RIÊNG THEO TIÊU CHUẨN VIETGAP" — Viện Khoa học Nông nghiệp Việt Nam (VAAS)
 * & Viện Bảo vệ Thực vật (PPRI), Hà Nội, 2026.
 */

export interface IpmPrinciple {
  no: number;
  title: string;
  desc: string;
}

export interface CareProcessStep {
  phase: string;
  timing: string;
  title: string;
  actions: string[];
}

export interface DiseaseOrPestItem {
  id: string;
  kind: "disease" | "pest";
  name: string;
  scientificName: string;
  affectedParts: string;
  prevalenceCode: "++++" | "+++" | "++" | "+";
  prevalenceLabel: string;
  peakSeason: string;
  summary: string;
  symptoms: string[];
  culturalAndBioControl: string[];
  chemicalControl: string[];
  recommendedProducts: string[];
}

export const IPM_2026_PRINCIPLES: IpmPrinciple[] = [
  {
    no: 1,
    title: "Trồng cây khỏe",
    desc: "Chọn cây giống tốt, sạch bệnh từ cơ sở uy tín; bón phân hữu cơ – vi sinh cân đối và chăm sóc hợp lý giúp cây sinh trưởng khỏe, chống chịu sâu bệnh và bù đắp tổn thất.",
  },
  {
    no: 2,
    title: "Bảo vệ thiên địch tự nhiên",
    desc: "Bảo tồn quần thể bọ mắt vàng, bọ rùa, nhện bắt mồi, ong ký sinh sâu non bằng cách hạn chế tối đa thuốc hóa học, ưu tiên thuốc sinh học, để cỏ có kiểm soát và trồng cây họ đậu.",
  },
  {
    no: 3,
    title: "Thăm đồng thường xuyên",
    desc: "Quan sát định kỳ giai đoạn ra lộc (tháng 6–9), ra hoa – đậu quả (tháng 3–8), mùa mưa (tháng 5–11) và cuối mùa mưa (tháng 11–2) để phát hiện sớm ổ dịch và tác động đúng ngưỡng kinh tế.",
  },
  {
    no: 4,
    title: "Nông dân trở thành chuyên gia",
    desc: "Nông dân nắm vững triệu chứng 10 bệnh hại, 21 loài sâu hại trên sầu riêng Tây Nguyên và vận dụng linh hoạt 5 biện pháp IPM (Kiểm dịch, Cơ giới, Canh tác, Sinh học, Hóa học 4 đúng).",
  },
];

export const CARE_PROCESS_2026: CareProcessStep[] = [
  {
    phase: "Bước 1",
    timing: "Trước khi trồng & Kiến thiết",
    title: "Chọn giống sạch bệnh & Thiết kế thoát nước",
    actions: [
      "Chọn cây giống phát triển đồng đều, không có triệu chứng ủ rũ, vàng lá, rụng lá và sạch sinh vật gây hại trên bầu giá thể.",
      "Chọn đất thoát nước tốt hoặc xẻ rãnh thoát nước sâu trong vườn trước khi trồng để ngăn ngừa nấm Phytophthora và Phytopythium.",
    ],
  },
  {
    phase: "Bước 2",
    timing: "Tháng 4 – Đầu tháng 5 (Trước mùa mưa)",
    title: "Ủ bón phân chuồng vi sinh đối kháng & Vệ sinh hố giao tán",
    actions: [
      "Đào hố ở vị trí phần giao tán giữa 4 cây trước mùa mưa để thu gom tàn dư, lá rụng trong vườn; thường xuyên làm cỏ giúp mặt đất thông thoáng.",
      "Ủ trộn 3 kg chế phẩm vi sinh đối kháng (Trichoderma spp., Bacillus spp., Streptomyces spp. ≥ 10⁸ bào tử/g) với 1 tấn phân chuồng hoai mục trước khi bón 7–10 ngày ở độ ẩm 50–60% (bóp chặt tay thấy nước rỉ qua kẽ tay), phủ kín bạt.",
      "Bón vào đất vùng rễ theo hình chiếu tán cây hoặc giữa 2 hàng giao tán rồi phủ lớp đất mặt lên trên. Kết hợp 50–100 kg phân hữu cơ + 100–150 g nấm rễ Arbuscular mycorrhizae/cây/năm.",
    ],
  },
  {
    phase: "Bước 3",
    timing: "Tháng 9 – Tháng 10 (Sau thu hoạch)",
    title: "Kỹ thuật cắt tỉa tạo tán thông thoáng",
    actions: [
      "Tiến hành cắt tỉa vào những ngày nắng, trời không mưa ngay sau vụ thu hoạch.",
      "Cắt bỏ và tiêu hủy những cành bị khô, lá vàng, cành có hiện tượng rụng lá và cây chết để loại bỏ nguồn bệnh.",
      "Cắt tỉa cành mọc vượt, cành bị che bóng và tỉa gọn tán cây trồng xen (cà phê, bơ...) tạo độ thông thoáng trong vườn.",
    ],
  },
  {
    phase: "Bước 4",
    timing: "Tháng 11 – Tháng 2 năm sau",
    title: "Phòng trừ bệnh héo ngọn & Tỉa hoa nhiễm rệp sáp",
    actions: [
      "Cuối mùa mưa (tháng 11): Phun phòng bệnh héo ngọn bằng chế phẩm vi sinh (Trichoderma spp., Bacillus spp., Streptomyces spp. ≥ 10⁸ bào tử/g) pha tỷ lệ 1:1000 phun ướt đều mặt lá vào chiều mát.",
      "Tháng 1 – Tháng 2 (ra hoa rộ): Tỉa bỏ bớt những chùm hoa mọc dày và những chùm hoa có rệp sáp bột hai tua dài.",
    ],
  },
  {
    phase: "Bước 5",
    timing: "Tháng 3 – Tháng 8 (Ra hoa & Nuôi quả)",
    title: "Quản lý sâu đục quả, rệp sáp & Vệ sinh quả bệnh",
    actions: [
      "Theo dõi sát giai đoạn ra hoa và đậu quả để phòng trừ sớm ổ rệp sáp bột hai tua dài và sâu đục quả.",
      "Cắt bỏ và tiêu hủy ngay những quả sầu riêng bị nhiễm bệnh (thối đen, thối nâu) hoặc bị biến dạng do côn trùng chích hút.",
      "Khi phải dùng thuốc hóa học, tuân thủ nghiêm nguyên tắc 4 đúng, kết hợp dầu khoáng để giảm lượng thuốc hóa học và luân phiên hoạt chất.",
    ],
  },
];

export const DISEASES_AND_PESTS_2026: DiseaseOrPestItem[] = [
  // ======================== 10 BỆNH HẠI CHÍNH ========================
  {
    id: "benh-xi-mu",
    kind: "disease",
    name: "Bệnh xì mủ sầu riêng",
    scientificName: "Phytophthora palmivora (nhóm nấm trứng Oomycetes)",
    affectedParts: "Thân, cành chính, cổ rễ",
    prevalenceCode: "++++",
    prevalenceLabel: "Rất phổ biến (> 50%)",
    peakSeason: "Quanh năm, nặng nhất mùa mưa (tháng 5 – tháng 11)",
    summary:
      "Một trong hai bệnh nguy hiểm và phổ biến nhất tại Đắk Lắk, Đắk Nông, gây thối vỏ thân, chảy nhựa và chết cành hoặc chết toàn cây.",
    symptoms: [
      "Dọc trên thân và cành chính xuất hiện các vết nứt có chảy nhựa (mủ), phần mạch dẫn bên dưới hóa nâu và thâm đen.",
      "Khi bệnh nặng, phần vỏ cây bị thối mục dẫn tới các cành lớn bị khô héo hoặc toàn bộ cây bị chết.",
      "Nguồn bệnh lan truyền qua nước tưới, nước mưa, đất nhiễm bệnh bám trên chân người, dụng cụ canh tác, phương tiện và động vật.",
    ],
    culturalAndBioControl: [
      "Thiết kế rãnh thoát nước tốt; cắt tỉa tạo tán thông thoáng sau thu hoạch (tháng 9–10); đào hố giao tán giữa 4 cây thu gom tàn dư trước mùa mưa.",
      "Ủ trộn 3 kg chế phẩm vi sinh đối kháng (Trichoderma spp., Bacillus spp., Streptomyces spp. ≥ 10⁸ bào tử/g) với 1 tấn phân chuồng hoai mục ở độ ẩm 50–60% trước khi bón 7–10 ngày.",
      "Bón vào vùng rễ theo hình chiếu tán cây trước mùa mưa (tháng 4 – đầu tháng 5) cho cả vườn chưa bị bệnh và vườn đang có cây bị bệnh.",
    ],
    chemicalControl: [
      "Cây mới chớm bệnh: Cạo sạch lớp vỏ ngoài ở vị trí xì mủ (cây nặng phải loại bỏ toàn bộ mô bệnh đã chết, thối mục).",
      "Quét thuốc có hoạt chất Metalaxyl-M 40g/kg + Mancozeb 640g/kg hoặc Dimethomorph 90g/kg + Mancozeb 600g/kg (Acrobat MZ 90/600 WP) lên bề mặt đã cạo.",
      "Kết hợp tiêm thuốc hoạt chất Phosphorous acid (Agri-Fos 400SL) vào thân cây (chỉ tiêm cây có đường kính thân ≥ 15 cm, tiêm 2 lần cách nhau 15 ngày vào ngày khô ráo).",
      "Vườn có tỷ lệ bệnh > 30%: Tiêm Phosphorous acid (Agri-Fos 400SL) vào thân đối với cả cây bị bệnh và cây chưa bị bệnh.",
    ],
    recommendedProducts: [
      "Chế phẩm Vi sinh Trichoderma – Bacillus – Streptomyces",
      "Agri-Fos 400SL",
      "Acrobat MZ 90/600 WP",
      "Ridomil Gold 68WG",
    ],
  },
  {
    id: "benh-heo-ngon",
    kind: "disease",
    name: "Bệnh héo ngọn (Chết ngược cành)",
    scientificName: "Diaporthe durionigena (tác nhân chính), Lasiodiplodia theobromae, Colletotrichum spp.",
    affectedParts: "Cành non, ngọn cành, thân chính",
    prevalenceCode: "++++",
    prevalenceLabel: "Rất phổ biến (> 50%)",
    peakSeason: "Cuối mùa mưa sang mùa khô (tháng 11 đến hết tháng 2 năm sau)",
    summary:
      "Bệnh nguy hiểm hàng đầu trên sầu riêng Tây Nguyên do loài nấm túi mới Diaporthe durionigena (Viện BVTV công bố quốc tế) gây rụng lá và khô chết cành từ đỉnh ngọn xuống.",
    symptoms: [
      "Giai đoạn đầu, các lá trên đầu ngọn rụng trước (lá còn xanh hoặc chuyển màu vàng nhạt).",
      "Mạch dẫn và toàn bộ lớp vỏ của cành, nhánh thâm đen và khô dần theo hướng từ trên đỉnh ngọn xuống.",
      "Trong điều kiện độ ẩm cao và nhiệt độ ban ngày mát mẻ kéo dài, bệnh lan xuống phần thân chính và làm chết cây.",
    ],
    culturalAndBioControl: [
      "Cắt bỏ và tiêu hủy những cành bị khô, rụng lá vào ngày nắng ráo để loại bỏ nguồn bào tử nấm.",
      "Phun phòng vào cuối mùa mưa (khoảng tháng 11) bằng thuốc BVTV sinh học chứa nấm Trichoderma spp., vi khuẩn Bacillus spp., xạ khuẩn Streptomyces spp. (≥ 10⁸ bào tử/g(ml)).",
      "Pha chế phẩm sinh học với nước sạch tỷ lệ 1:1000, phun ướt đều mặt lá vào chiều mát khi trời khô ráo.",
    ],
    chemicalControl: [
      "Theo dõi vườn từ tháng 11 đến hết tháng 2 năm sau; khi thấy hiện tượng rụng lá và khô đầu cành với tỷ lệ bệnh ≥ 5%, tiến hành phun thuốc hóa học.",
      "Sử dụng hoạt chất Hexaconazole ≥ 85% (Anvil 5SC / Huivil) hoặc Dimethomorph 90g/kg + Mancozeb 600g/kg (Acrobat MZ 90/600 WP), phun ướt đều mặt lá vào sáng sớm hoặc chiều mát.",
      "Cây bị bệnh nặng: Cắt bỏ cành bệnh kết hợp phun thuốc hóa học như trên 2 lần liên tiếp cách nhau 7 – 10 ngày.",
    ],
    recommendedProducts: [
      "Chế phẩm Vi sinh Trichoderma – Bacillus – Streptomyces",
      "Acrobat MZ 90/600 WP",
      "Anvil 5SC (Huivil)",
    ],
  },
  {
    id: "benh-dom-la",
    kind: "disease",
    name: "Bệnh đốm lá sầu riêng",
    scientificName: "Phomopsis durionis",
    affectedParts: "Lá",
    prevalenceCode: "+++",
    prevalenceLabel: "Phổ biến (26 – 50%)",
    peakSeason: "Các đợt ra cơi đọt và mùa mưa ẩm",
    summary:
      "Gây các vết đốm hoại tử trên phiến lá làm giảm diện tích quang hợp, suy yếu cơi đọt và ảnh hưởng trực tiếp đến khả năng nuôi hoa, nuôi quả.",
    symptoms: [
      "Xuất hiện các đốm nhỏ màu nâu hoặc nâu xám có quầng vàng xung quanh trên phiến lá.",
      "Vết bệnh liên kết lại thành mảng cháy lớn làm lá khô giòn và rụng sớm.",
    ],
    culturalAndBioControl: [
      "Bón phân hữu cơ truyền thống (phân chuồng bò, gà, rơm cỏ khô ủ hoai mục 50–100 kg/cây/năm) kết hợp nấm rễ Arbuscular mycorrhizae (100–150 g/cây/năm) hoặc Trichoderma, Streptomyces để tăng sức đề kháng.",
      "Tỉa cành tạo tán thông thoáng sau thu hoạch.",
    ],
    chemicalControl: [
      "Phun 3 lần (cách nhau 7 – 10 ngày) luân phiên các hoạt chất: Propineb, Metiram complex, Mancozeb + Metalaxyl-M, Trifloxystrobin + Tebuconazole.",
      "Lần 1: Propineb / Metiram complex / Mancozeb + Metalaxyl-M / Trifloxystrobin + Tebuconazole.",
      "Lần 2: Phun luân phiên thuốc trừ bệnh trên; nếu cây đang ra đọt non thì phun trừ thêm nhóm côn trùng chích hút Nitenpyram (Acnipyram/Nitensuper) + Buprofezin (Applaud/Butyl).",
      "Lần 3: Hexaconazole (Anvil/Huivil) hoặc Trifloxystrobin + Tebuconazole (Nativo 750WG).",
    ],
    recommendedProducts: [
      "Antracol 70WP",
      "Ridomil Gold 68WG",
      "Nativo 750WG",
      "Anvil 5SC (Huivil)",
      "Acnipyram / Nitensuper + Applaud / Butyl",
    ],
  },
  {
    id: "benh-than-thu",
    kind: "disease",
    name: "Bệnh thán thư lá sầu riêng",
    scientificName: "Colletotrichum siamense",
    affectedParts: "Lá (đặc biệt lá non)",
    prevalenceCode: "+++",
    prevalenceLabel: "Phổ biến (26 – 50%)",
    peakSeason: "Thời kỳ cây ra lá non, ẩm độ cao",
    summary:
      "Bệnh gây hại nặng thời kỳ ra lá non, bào tử nấm phát tán mạnh nhờ gió, nước mưa và côn trùng làm cháy mép lá, biến dạng và rụng lá non.",
    symptoms: [
      "Vết bệnh thường bắt đầu ở mép lá, đặc biệt là phần đuôi (chóp) lá sau đó lan rộng vào trong phiến lá.",
      "Tạo những vết bệnh lớn màu nâu đen trên lá non với các vòng đồng tâm làm lá biến dạng, khô cháy và rụng.",
      "Đôi khi bệnh xuất hiện ngay giữa phiến lá với các đốm lớn màu nâu sẫm.",
    ],
    culturalAndBioControl: [
      "Bón 50–100 kg phân hữu cơ ủ hoai mục/cây/năm kết hợp 100–150 g nấm rễ Arbuscular mycorrhizae hoặc Trichoderma, Streptomyces.",
      "Thu gom lá bệnh rụng xuống hố giao tán trước mùa mưa.",
    ],
    chemicalControl: [
      "Áp dụng phác đồ phun 3 lần (cách nhau 7–10 ngày) luân phiên Propineb (Antracol 70WP), Metiram complex, Mancozeb + Metalaxyl-M (Ridomil Gold 68WG), Trifloxystrobin + Tebuconazole (Nativo 750WG) và lần 3 dùng Hexaconazole (Anvil 5SC).",
      "Giai đoạn ra đọt non kết hợp phòng trừ rầy nhảy, bọ trĩ bằng Nitenpyram + Buprofezin để tránh vết thương cơ giới cho nấm xâm nhập.",
    ],
    recommendedProducts: [
      "Nativo 750WG",
      "Antracol 70WP",
      "Ridomil Gold 68WG",
      "Anvil 5SC (Huivil)",
    ],
  },
  {
    id: "benh-thoi-nau-qua",
    kind: "disease",
    name: "Bệnh thối quả (Thối nâu quả)",
    scientificName: "Phytophthora palmivora",
    affectedParts: "Quả (mọi giai đoạn phát triển)",
    prevalenceCode: "+++",
    prevalenceLabel: "Phổ biến (26 – 50%)",
    peakSeason: "Giai đoạn nuôi quả đến thu hoạch trùng mùa mưa",
    summary:
      "Do nấm Phytophthora palmivora xâm nhiễm ở bất kỳ vị trí nào trên vỏ quả, lan sâu vào thịt quả và hạt gây thối nhũn có mùi chua.",
    symptoms: [
      "Ban đầu xuất hiện các đốm nhỏ màu xám nâu trên vỏ quả, sau lan rộng nhanh trên bề mặt vỏ và ăn sâu vào phần cơm và hạt.",
      "Khi vết bệnh lan rộng, phần vỏ và thịt quả mềm nhũn, có lớp tơ nấm trắng ngà khi ẩm và mùi thối nhũn đặc trưng.",
    ],
    culturalAndBioControl: [
      "Tỉa bớt quả mọc chùm dày, kê tách giữa các quả để không đọng nước mưa ở kẽ quả.",
      "Cắt bỏ và tiêu hủy ngay những quả bị nhiễm bệnh khỏi vườn; bón phân chuồng ủ Trichoderma – Bacillus – Streptomyces định kỳ.",
    ],
    chemicalControl: [
      "Phun phòng khi thời tiết mưa ẩm kéo dài bằng Dimethomorph + Mancozeb (Acrobat MZ 90/600 WP) hoặc Metalaxyl-M + Mancozeb (Ridomil Gold 68WG).",
      "Tuân thủ nghiêm ngặt thời gian cách ly tối thiểu 14 ngày trước khi thu hoạch.",
    ],
    recommendedProducts: [
      "Acrobat MZ 90/600 WP",
      "Ridomil Gold 68WG",
      "Agri-Fos 400SL",
    ],
  },
  {
    id: "benh-dom-rong",
    kind: "disease",
    name: "Bệnh đốm rong (Tảo đỏ)",
    scientificName: "Cephaleuros virescens",
    affectedParts: "Lá già, cành",
    prevalenceCode: "+++",
    prevalenceLabel: "Phổ biến (26 – 50%)",
    peakSeason: "Mùa mưa ẩm, vườn rậm rạp thiếu ánh sáng",
    summary:
      "Xuất hiện phổ biến ở các vườn mật độ dày, ít cắt tỉa thông thoáng, làm giảm khả năng quang hợp của bộ lá già và làm suy kiệt cành mang quả.",
    symptoms: [
      "Trên mặt lá xuất hiện các đốm tròn hơi nổi gồ, có lớp lông nhung mịn màu xanh xám hoặc nâu đỏ như rỉ sắt.",
      "Khi tảo già chuyển màu nâu xám, làm mô lá bên dưới bị hoại tử và khô rụng.",
    ],
    culturalAndBioControl: [
      "Cắt tỉa cành vượt, cành tăm bên trong tán và tỉa cây trồng xen sau thu hoạch (tháng 9–10) để ánh nắng chiếu lọt vào tán cây.",
      "Chăm sóc bón phân cân đối giúp bộ lá khỏe.",
    ],
    chemicalControl: [
      "Phun rửa vườn sau thu hoạch theo nguyên tắc 4 đúng bằng các thuốc gốc đồng hoặc thuốc trừ nấm phổ rộng trong danh mục cho phép.",
    ],
    recommendedProducts: [
      "Antracol 70WP",
      "Ridomil Gold 68WG",
    ],
  },
  {
    id: "benh-tan-rui",
    kind: "disease",
    name: "Bệnh tàn rụi (Cháy lá chết ngọn)",
    scientificName: "Phytophthora palmivora",
    affectedParts: "Lá, cành mang lá",
    prevalenceCode: "++",
    prevalenceLabel: "Ít phổ biến (11 – 25%)",
    peakSeason: "Giai đoạn mưa nhiều, độ ẩm cao kéo dài",
    summary:
      "Cùng tác nhân Phytophthora palmivora gây bệnh xì mủ, tấn công đồng thời vào phiến lá và cành mang lá làm lá khô cháy hàng loạt trên cây.",
    symptoms: [
      "Vị trí phát sinh bệnh thường ở tầng lá dưới cùng sau đó lan nhanh ra toàn bộ tán lá nếu mưa ẩm kéo dài.",
      "Vết bệnh trên lá có màu thâm nâu đến xám đen như bị luộc nước sôi, lan rộng toàn bộ phiến lá khiến lá rụng hoặc chết khô dính trên cành.",
    ],
    culturalAndBioControl: [
      "Vệ sinh thu gom lá bệnh rụng xuống hố giao tán; tỉa cành thấp sát mặt đất để hạn chế nước mưa bắn mầm bệnh từ đất lên tầng lá dưới.",
      "Bón phân chuồng ủ chế phẩm Trichoderma – Bacillus – Streptomyces trước mùa mưa.",
    ],
    chemicalControl: [
      "Phun phòng trừ khi mưa dầm bằng Acrobat MZ 90/600 WP hoặc Ridomil Gold 68WG kết hợp cắt bỏ cành lá bị tàn rụi nặng.",
    ],
    recommendedProducts: [
      "Acrobat MZ 90/600 WP",
      "Ridomil Gold 68WG",
    ],
  },
  {
    id: "benh-thoi-den-qua",
    kind: "disease",
    name: "Bệnh thối đen quả",
    scientificName: "Lasiodiplodia theobromae",
    affectedParts: "Quả",
    prevalenceCode: "++",
    prevalenceLabel: "Ít phổ biến (11 – 25%)",
    peakSeason: "Giai đoạn quả non đến quả già trước thu hoạch",
    summary:
      "Gây các mảng đốm đen cứng trên vỏ quả, làm quả nhỏ bị cong biến dạng và quả lớn bị khô mục nát.",
    symptoms: [
      "Triệu chứng điển hình trên quả là các mảng đốm đen, phần mô bệnh cứng kể cả khi vết bệnh đã lan rộng và xâm nhập vào thịt quả.",
      "Nếu xâm nhiễm ở giai đoạn quả nhỏ sẽ làm quả bị cong và biến dạng; giai đoạn cuối làm quả khô và mục nát.",
    ],
    culturalAndBioControl: [
      "Cắt bỏ và tiêu hủy kịp thời những quả bị nhiễm bệnh thối đen hoặc bị sâu đục quả tạo vết thương.",
      "Tạo độ thông thoáng quanh chùm quả.",
    ],
    chemicalControl: [
      "Phòng trừ kết hợp với quản lý sâu đục quả và phun thuốc trừ nấm phổ rộng (Hexaconazole, Trifloxystrobin + Tebuconazole) đảm bảo thời gian cách ly.",
    ],
    recommendedProducts: [
      "Nativo 750WG",
      "Anvil 5SC (Huivil)",
    ],
  },
  {
    id: "benh-vang-la-thoi-re",
    kind: "disease",
    name: "Bệnh vàng lá thối rễ",
    scientificName: "Phytopythium vexans (mới ghi nhận tại VN), Phytophthora palmivora, Fusarium sp.",
    affectedParts: "Rễ tơ, rễ cọc, cổ rễ",
    prevalenceCode: "++",
    prevalenceLabel: "Ít phổ biến (11 – 25%)",
    peakSeason: "Vườn ươm, giai đoạn kiến thiết cơ bản và sau mùa mưa ngập úng",
    summary:
      "Do tổ hợp nấm đất Phytopythium vexans (Viện BVTV ghi nhận lần đầu tiên tại Việt Nam trên tạp chí New Disease Reports), Phytophthora palmivora và Fusarium sp. gây thối mục hệ rễ.",
    symptoms: [
      "Trên cây non: Do lượng rễ ít, nấm tấn công gây thối toàn bộ rễ làm cây chết khô nhanh chóng.",
      "Trên cây trưởng thành: Cây còi cọc, lá chuyển màu vàng, khi trời nắng nóng lá bị héo rũ; bệnh nặng rễ thối mục đen, lá rụng trơ cành và cây chết.",
    ],
    culturalAndBioControl: [
      "Thiết kế mặt bằng thoát nước tốt, không để đọng nước vùng gốc.",
      "Bón phân chuồng hoai mục ủ chế phẩm vi sinh đối kháng (Trichoderma spp., Bacillus spp., Streptomyces spp. tỷ lệ 3 kg/tấn) kết hợp nấm rễ Arbuscular mycorrhizae.",
    ],
    chemicalControl: [
      "Xử lý vùng rễ chớm bệnh kết hợp tiêm thân Phosphorous acid (Agri-Fos 400SL) và tưới hoạt chất Metalaxyl-M + Mancozeb theo khuyến cáo.",
    ],
    recommendedProducts: [
      "Chế phẩm Vi sinh Trichoderma – Bacillus – Streptomyces",
      "Agri-Fos 400SL",
      "Ridomil Gold 68WG",
    ],
  },
  {
    id: "benh-nam-hong",
    kind: "disease",
    name: "Bệnh nấm hồng hại cành",
    scientificName: "Corticium salmonicolor",
    affectedParts: "Thân, cành (chạc ba phân cành)",
    prevalenceCode: "++",
    prevalenceLabel: "Ít phổ biến (11 – 25%)",
    peakSeason: "Mùa mưa ẩm độ cao, vườn rậm rạp",
    summary:
      "Nấm tạo lớp phấn màu hồng phấn bám quanh vỏ cành làm tắc mạch dẫn, khiến cành phía trên khô héo và chết.",
    symptoms: [
      "Ban đầu là lớp tơ mỏng màu trắng đục ở chạc cành, sau chuyển sang màu hồng phấn đặc trưng bao quanh vỏ cành.",
      "Lá trên cành bệnh vàng và rụng, cành khô chết tại chỗ.",
    ],
    culturalAndBioControl: [
      "Cắt bỏ cành bị nấm hồng nặng đem tiêu hủy; tỉa tán thông thoáng sau thu hoạch.",
    ],
    chemicalControl: [
      "Phun hoặc quét hoạt chất Hexaconazole (Anvil 5SC / Huivil) lên vùng cành chớm xuất hiện vết bệnh.",
    ],
    recommendedProducts: [
      "Anvil 5SC (Huivil)",
    ],
  },

  // ======================== SÂU HẠI TRỌNG ĐIỂM (TRONG 21 LOÀI) ========================
  {
    id: "ray-nhay",
    kind: "pest",
    name: "Rầy nhảy hại sầu riêng",
    scientificName: "Allocaridara malayensis",
    affectedParts: "Búp non, lá non",
    prevalenceCode: "+++",
    prevalenceLabel: "Rất phổ biến (> 50%)",
    peakSeason: "Mùa nắng & giai đoạn cây nảy lộc non (tháng 6 – tháng 9)",
    summary:
      "Đối tượng sâu hại quan trọng hàng đầu trên bộ lá non sầu riêng; chích hút làm lá quăn queo, khô rụng hàng loạt và tiết mật ngọt gây nấm bồ hóng.",
    symptoms: [
      "Thành trùng và ấu trùng sống tập trung ở mặt dưới lá non, chích hút nhựa làm lá có các chấm màu nâu, biến dạng, không xòe được và quăn queo.",
      "Khi hại nặng, lá non rụng hàng loạt trơ đầu cành, ảnh hưởng nghiêm trọng đến sự phát triển, phân hóa mầm hoa và đậu quả.",
      "Mật ngọt do rầy tiết ra tạo điều kiện cho nấm bồ hóng phát triển phủ đen mặt lá.",
    ],
    culturalAndBioControl: [
      "Điều khiển cây ra đọt non đồng loạt để dễ bảo vệ; bảo tồn thiên địch (bọ mắt vàng, bọ rùa, nhện bắt mồi).",
      "Sử dụng thuốc BVTV sinh học: Abamectin 9g/kg + Bacillus thuringiensis var. kurstaki 11g/kg (ABT 2WP) hoặc nấm xanh – nấm trắng Beauveria bassiana 1×10⁹ + Metarhizium anisopliae 0,5×10⁹ bào tử/g (Trắng xanh WP).",
    ],
    chemicalControl: [
      "Kết hợp thuốc hóa học với dầu khoáng (SK Enspray 99EC) để tăng hiệu quả bám dính và giảm lượng thuốc hóa học.",
      "Luân phiên các hoạt chất: Acetamiprid 20% + Buprofezin 20% (Penalty 40WP), Spirotetramat ≥ 96% (Movento 150OD), Dinotefuran ≥ 89% (Sida 20WP), hoặc Nitenpyram + Buprofezin (Acnipyram + Applaud).",
      "Các công thức phối trộn luân phiên khuyến cáo: Movento 150OD + Bitadin WP; Sida 20WP + Trắng xanh WP; Confidor 200SL + Dầu khoáng SK Enspray 99EC; Ascend 20SP + Trắng xanh WP.",
    ],
    recommendedProducts: [
      "ABT 2WP (Sinh học Bt + Abamectin)",
      "Trắng xanh WP (Nấm xanh – Nấm trắng)",
      "Movento 150OD",
      "Penalty 40WP",
      "Sida 20WP",
      "Confidor 200SL + Dầu khoáng SK Enspray 99EC",
      "Ascend 20SP",
    ],
  },
  {
    id: "rep-sap-bot-hai-tua-dai",
    kind: "pest",
    name: "Rệp sáp bột hai tua dài & Rệp sáp mềm",
    scientificName: "Ferrisia virgata (+++), Pseudococcus sp. (++)",
    affectedParts: "Quả non, cuống quả, rãnh gai, chùm hoa, cành",
    prevalenceCode: "+++",
    prevalenceLabel: "Rất phổ biến (> 50%)",
    peakSeason: "Mùa khô, giai đoạn ra hoa và đậu quả (tháng 3 – tháng 8)",
    summary:
      "Đối tượng kiểm dịch thực vật bắt buộc khi xuất khẩu (GACC) và gây hại nghiêm trọng giai đoạn cây mang quả, làm quả non biến dạng, rụng và đen vỏ quả do nấm bồ hóng.",
    symptoms: [
      "Rệp trưởng thành và rệp non bám vào cuống quả non hoặc các rãnh giữa các gai quả để hút dịch nhựa.",
      "Giai đoạn quả non: Mật độ rệp cao làm quả bị biến dạng, teo tóp và rụng. Giai đoạn quả lớn: Quả phát triển kém, sương mật tiết ra làm nấm bồ hóng phủ đen vỏ quả, mất giá trị thương phẩm xuất khẩu.",
    ],
    culturalAndBioControl: [
      "Tháng 1 – Tháng 2 (ra hoa rộ): Tỉa bỏ bớt những chùm hoa mọc dày và những chùm hoa có ổ rệp sáp bột hai tua dài.",
      "Phun chế phẩm sinh học ABT 2WP (Abamectin + Bt kurstaki) hoặc Trắng xanh WP (Beauveria bassiana + Metarhizium anisopliae) ngay khi mới xuất hiện ổ rệp.",
    ],
    chemicalControl: [
      "Phòng trừ sớm khi mới thấy xuất hiện ổ rệp từ tháng 3 đến tháng 8; kết hợp dầu khoáng để phá lớp sáp bảo vệ của rệp.",
      "Sử dụng luân phiên: Acetamiprid 20% + Buprofezin 20% (Penalty 40WP), Spirotetramat ≥ 96% (Movento 150OD), Dinotefuran ≥ 89% (Sida 20WP).",
      "Phối trộn luân phiên: Movento 150OD + Bitadin WP; Sida 20WP + Trắng xanh WP; Confidor 200SL + Dầu khoáng SK Enspray 99EC; Ascend 20SP + Trắng xanh WP.",
    ],
    recommendedProducts: [
      "ABT 2WP (Sinh học Bt + Abamectin)",
      "Trắng xanh WP (Nấm xanh – Nấm trắng)",
      "Movento 150OD",
      "Penalty 40WP",
      "Sida 20WP",
      "Confidor 200SL + Dầu khoáng SK Enspray 99EC",
    ],
  },
  {
    id: "sau-duc-qua",
    kind: "pest",
    name: "Sâu đục quả sầu riêng",
    scientificName: "Conogethes punctiferalis",
    affectedParts: "Quả non đến quả lớn",
    prevalenceCode: "++",
    prevalenceLabel: "Phổ biến (26 – 50%)",
    peakSeason: "Giai đoạn đậu quả đến thu hoạch (tháng 3 – tháng 8)",
    summary:
      "Đối tượng sâu hại chính trực tiếp trên quả sầu riêng; sâu non đục lỗ xuyên qua vỏ ăn phần thịt quanh hạt làm quả bị thối, rụng và tạo vết thương cho nấm Phytophthora xâm nhập.",
    symptoms: [
      "Sâu trưởng thành đẻ trứng trên vỏ quả (thường ở kẽ tiếp giáp giữa 2 quả trong chùm).",
      "Sâu non mới nở đục lỗ xâm nhập vào vỏ quả, đùn phân nâu đen ra ngoài miệng lỗ đục, sau đó ăn sâu vào phần thịt quanh hạt làm quả thối và rụng.",
    ],
    culturalAndBioControl: [
      "Tỉa quả để các quả trong chùm không chạm sát nhau; cắt bỏ và tiêu hủy quả đã bị sâu đục nặng.",
      "Sử dụng thuốc BVTV sinh học: ABT 2WP (Abamectin + Bt kurstaki), Trắng xanh WP (Beauveria + Metarhizium), hoặc Bitadin WP (Bt kurstaki 16.000 IU + Granulosis virus 10⁸ PIB).",
    ],
    chemicalControl: [
      "Theo dõi sát giai đoạn quả non để phun sớm khi sâu non vừa nở chưa đục sâu vào vỏ.",
      "Sử dụng luân phiên các hoạt chất: Spirotetramat ≥ 96% (Movento 150OD), Dinotefuran ≥ 89% (Sida 20WP), Acetamiprid 20% + Buprofezin 20% (Penalty 40WP), hoặc Emamectin benzoate.",
    ],
    recommendedProducts: [
      "Bitadin WP (Sinh học Bt + Granulosis virus)",
      "ABT 2WP (Sinh học Bt + Abamectin)",
      "Trắng xanh WP (Nấm xanh – Nấm trắng)",
      "Movento 150OD",
      "Penalty 40WP",
      "Sida 20WP",
      "Emamectin 1.9EC",
    ],
  },
  {
    id: "nhen-do",
    kind: "pest",
    name: "Nhện đỏ hại sầu riêng",
    scientificName: "Tetranychus sp. / Eutetranychus sp.",
    affectedParts: "Lá bánh tẻ, lá già, lá non vừa mở",
    prevalenceCode: "++",
    prevalenceLabel: "Phổ biến (26 – 50%)",
    peakSeason: "Thời kỳ khô ráo, nắng nóng ít mưa",
    summary:
      "Phát triển cực nhanh trong điều kiện nóng ẩm với vòng đời rất ngắn; cạp biểu bì mặt lá gây hiện tượng 'lá bạc' làm lá rụng sớm và cây suy kiệt.",
    symptoms: [
      "Ẩn mình ở mặt dưới lá và chỗ khuất, dùng miệng cạp biểu bì mặt lá tạo thành những chấm trắng li ti và tiết độc tố.",
      "Khi bị nhẹ lá có màu vàng xỉn như bám bụi; khi bị nặng toàn bộ lá chuyển màu trắng bạc ('lá bạc'), dễ rụng khi có gió, cây còi cọc.",
    ],
    culturalAndBioControl: [
      "Tưới phun mưa giữ ẩm tán cây trong mùa khô; bảo tồn thiên địch nhện bắt mồi và bọ rùa.",
      "Phun chế phẩm sinh học ABT 2WP, Trắng xanh WP hoặc Bitadin WP.",
    ],
    chemicalControl: [
      "Kết hợp dầu khoáng SK Enspray 99EC hoặc phun Abamectin 1.8EC ướt kỹ mặt dưới lá vào sáng sớm hoặc chiều mát; không phun quá 2 lần liên tiếp cùng một hoạt chất để tránh kháng thuốc.",
    ],
    recommendedProducts: [
      "ABT 2WP (Sinh học Bt + Abamectin)",
      "Abamectin 1.8EC",
      "Confidor 200SL + Dầu khoáng SK Enspray 99EC",
    ],
  },
  {
    id: "sau-duc-than-mot-bo-tri",
    kind: "pest",
    name: "Nhóm Sâu đục thân, Mọt đục cành, Bọ trĩ & Sâu ăn bông",
    scientificName: "Batocera rufomaculata, Xyleborus similis, Scirtothrips dorsalis, Euproctis subnota",
    affectedParts: "Thân, cành, chùm hoa, quả non",
    prevalenceCode: "+",
    prevalenceLabel: "Tần suất bắt gặp 5 – 25% (trong 21 loài sâu hại)",
    peakSeason: "Giai đoạn ra hoa (bọ trĩ, sâu róm) & mùa khô (sâu đục thân, mọt đục cành)",
    summary:
      "Nhóm sâu hại thứ yếu nhưng cần giám sát thường xuyên: Bọ trĩ và sâu róm tấn công hoa/quả non; sâu đục thân và mọt đục cành làm suy yếu mạch gỗ dẫn đến gãy cành, chết cây.",
    symptoms: [
      "Sâu đục thân (Batocera rufomaculata) và Mọt đục cành (Xyleborus similis, X. fornicatus): Đục lỗ nhỏ trên thân, cành lớn kèm mạt cưa đùn ra ngoài và chảy nhựa.",
      "Bọ trĩ (Scirtothrips dorsalis): Chích hút cánh hoa, nhụy hoa và quả non làm rụng hoa, vỏ quả non bị sẹo da lu.",
      "Sâu róm sầu riêng (Euproctis subnota), Sâu róm đường chỉ đỏ (E. scintillans), Sâu khoang (Spodoptera litura): Ăn khuyết chùm hoa, quả non và lá.",
    ],
    culturalAndBioControl: [
      "Thăm vườn thường xuyên để bắt diệt sâu đục thân cơ giới, cắt bỏ cành khô bị mọt đục.",
      "Phun chế phẩm sinh học Bitadin WP (Bt kurstaki + Granulosis virus) hoặc ABT 2WP để diệt sâu róm, sâu ăn bông và bọ trĩ.",
    ],
    chemicalControl: [
      "Phòng trừ bọ trĩ và côn trùng chích hút trước khi hoa nở rộ bằng Imidacloprid, Acetamiprid + Buprofezin hoặc Spirotetramat (tránh phun lúc hoa đang xả nhụy để bảo vệ ong thụ phấn).",
    ],
    recommendedProducts: [
      "Bitadin WP (Sinh học Bt + Granulosis virus)",
      "ABT 2WP (Sinh học Bt + Abamectin)",
      "Penalty 40WP",
      "Movento 150OD",
    ],
  },
];

