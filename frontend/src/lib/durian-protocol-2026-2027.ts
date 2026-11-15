/**
 * Tài liệu chuẩn: QUY TRÌNH CHĂM SÓC SẦU RIÊNG NIÊN VỤ 2026–2027
 * Áp dụng thống nhất cho các hộ thành viên tham gia HTX Nông nghiệp Cư Né
 * để bảo chứng chất lượng xuất khẩu chính ngạch và cam kết thu mua đúng giá, giá cao.
 */

export type ProtocolGroup = "recovery" | "flowering" | "fruiting" | "senpro";

export interface ProtocolMilestone {
  /** Trạng thái sinh trưởng của lá, đọt, bông hoặc trái */
  treeState: string;
  /** Mốc thời gian dự kiến trong giai đoạn */
  targetDay: string;
  /** Định lượng sản phẩm & thao tác kỹ thuật trên vườn */
  action: string;
}

export interface DurianProtocolStage {
  id: string;
  order: string;
  group: ProtocolGroup;
  name: string;
  duration: string;
  cardSubtitle: string;
  imageSrc: string;
  imageAlt: string;
  drawerObjectPosition: string;
  summary: string;
  milestones: ProtocolMilestone[];
  keyRules: string[];
  diaryRequirement: string;
}

export interface SenProRule {
  ratio: string;
  shootState: string;
  effect: string;
  note: string;
}

export const HTX_PRICE_GUARANTEE_POLICY = {
  badge: "Tiêu chuẩn bắt buộc HTX Cư Né - Niên vụ 2026-2027",
  headline: "Tuân thủ quy trình chuẩn 2026-2027 để bảo chứng thu mua đúng giá, giá cao",
  desktopNote:
    "Áp dụng thống nhất cho nông hộ tham gia HTX Nông nghiệp Cư Né với 3 điều kiện nghiệm thu bắt buộc:",
  mobileNote:
    "Tuân thủ đúng phác đồ, ngày cách ly và nhật ký 8 giai đoạn để HTX cam kết thu mua đúng giá, giá cao.",
  keyPoints: [
    {
      order: "01",
      label: "Đúng phác đồ kỹ thuật",
      text: "Bón dinh dưỡng, điều tiết cơi đọt và ngưng thuốc đủ ngày cách ly.",
    },
    {
      order: "02",
      label: "Đủ nhật ký điện tử",
      text: "Ghi chép trung thực từng đợt chăm sóc theo 8 giai đoạn chuẩn của HTX.",
    },
    {
      order: "03",
      label: "Cam kết thu mua giá cao",
      text: "Trái đạt chuẩn xuất khẩu được HTX nghiệm thu và thu mua đúng giá.",
    },
  ],
  pillars: [
    {
      title: "Đồng nhất mẫu mã & Lên cơm chuẩn",
      desc: "Phác đồ 100% Kali Sunfat (K₂SO₄), Amino Ca+, Brixup và Kali Bo theo đúng tuổi trái giúp trái đạt 3–4 kg, cơm vàng ráo, độ ngọt Brix cao, không sượng nước.",
    },
    {
      title: "Đạt chuẩn kiểm nghiệm xuất khẩu",
      desc: "Nâng pH đất, bổ sung hữu cơ vi sinh (Trichoderma, Soil Harmony) và tuân thủ ngày cách ly giúp kiểm soát chặt Cadimi (Cd ≤ 0,05 mg/kg) và dư lượng MRL.",
    },
    {
      title: "Cam kết thu mua đúng giá, giá cao",
      desc: "Nhật ký canh tác khớp với 8 giai đoạn chuẩn 2026–2027 là cơ sở pháp lý để HTX Cư Né định danh lô xuất khẩu chính ngạch và ưu tiên thu mua giá cao ổn định.",
    },
  ],
} as const;

export const SENPRO_SHOOT_PROTOCOL: readonly SenProRule[] = [
  {
    ratio: "1/400",
    shootState: "Mũi giáo",
    effect: "Già lá 7–10 ngày (chặn đọt 7–10 ngày)",
    note: "Phun sương đều ngoài tán lá non khi mũi giáo vừa phóng để chuyển nhanh sang lá lụa, giữ dinh dưỡng nuôi bông/trái.",
  },
  {
    ratio: "1/800",
    shootState: "Hạt gạo",
    effect: "Già lá 7–10 ngày (chặn đọt 7–10 ngày)",
    note: "Áp dụng liều nhẹ khi mầm đọt mới nhú hạt gạo giúp hãm tốc độ bung đọt êm, không gây sốc sinh lý cây.",
  },
  {
    ratio: "1/300",
    shootState: "Đuôi tôm",
    effect: "Rụng trong 3 ngày",
    note: "Xử lý dứt điểm khi đọt đuôi tôm bung mạnh trùng lúc xả nhụy hoặc trái non nhạy cảm nhằm ngăn rụng bông, rụng trái hàng loạt.",
  },
];

export const DURIAN_PROTOCOL_2026_2027: readonly DurianProtocolStage[] = [
  {
    id: "chuan-bi",
    order: "01",
    group: "recovery",
    name: "Chuẩn bị vườn",
    duration: "30 ngày",
    cardSubtitle: "30 ngày - Rửa vườn, vôi, hữu cơ & vi sinh",
    imageSrc: "/stages/stage-01-dat.jpg",
    imageAlt:
      "Vệ sinh vườn sầu riêng sau thu hoạch, kiểm tra độ pH đất đỏ bazan và xử lý vôi, hữu cơ vi sinh phục hồi nền đất",
    drawerObjectPosition: "center 58%",
    summary:
      "Giai đoạn nền tảng kéo dài 30 ngày trước khi bước vào phục hồi cơi đọt: làm sạch mầm bệnh tồn lưu sau vụ trước, mở thoáng tầng đất mặt và tái tạo hệ vi sinh đối kháng vùng rễ.",
    milestones: [
      {
        treeState: "Lá già",
        targetDay: "Trước 30 ngày đến trước 15 ngày bắt đầu phục hồi",
        action: "Rửa vườn, cắt cỏ, xới đất thông thoáng quanh hình chiếu tán cây.",
      },
      {
        treeState: "Lá già",
        targetDay: "Trước 15 ngày đến ngày 0 bắt đầu phục hồi",
        action: "Bón vôi nâng pH đất, bổ sung phân hữu cơ, Trichoderma, vi sinh (VS), Soil Harmony…",
      },
    ],
    keyRules: [
      "Cắt tỉa cành khô, cành sâu bệnh vào ngày nắng ráo trước khi phun rửa vườn.",
      "Không xới đất quá sâu làm đứt rễ cái; giữ khoảng cách an toàn khi bón vôi trước khi đưa vi sinh Trichoderma vào đất.",
    ],
    diaryRequirement:
      "Ghi ngày rửa vườn, lượng vôi – phân hữu cơ – chế phẩm Trichoderma / Soil Harmony đã bón và chỉ số pH đất đầu vụ.",
  },
  {
    id: "coi-dot-1",
    order: "02",
    group: "recovery",
    name: "Cơi đọt 1",
    duration: "45 ngày",
    cardSubtitle: "45 ngày - Kích rễ tơ & kéo cơi lá đầu vụ",
    imageSrc: "/stages/stage-02-giong.jpg",
    imageAlt:
      "Cơi đọt non sầu riêng phóng đồng đều trên nền đất đỏ bazan được tưới dưỡng rễ và giữ ẩm tiêu chuẩn",
    drawerObjectPosition: "center 56%",
    summary:
      "Tái thiết bộ rễ tơ khỏe mạnh bằng nhóm Amino sinh học kết hợp NPK cân đối (2:2:1) và dưỡng lá Grapo - Amino Ca+ giúp cơi đọt 1 ra đồng loạt, bản lá dày khỏe.",
    milestones: [
      {
        treeState: "Lá già",
        targetDay: "Ngày 0",
        action: "Đổ gốc 25–30 lít/gốc hỗn hợp Amino X (1:1000) - Magic One (1:1000).",
      },
      {
        treeState: "Nứt hạt gạo",
        targetDay: "Ngày 7",
        action: "Bón NPK gốc (tỷ lệ 2:2:1) khoảng 1 kg/gốc. Trên tán phun Grapo (1:400).",
      },
      {
        treeState: "Lá đuôi tôm",
        targetDay: "Ngày 20",
        action:
          "Đổ gốc 25–30 lít/gốc Amino X (1:1000) - Magic One (1:1000). Trên tán phun Grapo - Amino Ca+ (1:800).",
      },
    ],
    keyRules: [
      "Theo dõi sát rầy nhảy và bọ trĩ ở giai đoạn nứt hạt gạo – đuôi tôm để bảo vệ trọn vẹn diện tích lá quang hợp.",
      "Tưới đủ ẩm sau khi rải NPK 2:2:1 để hạt phân tan đều, tránh cháy đầu rễ tơ mới nhú.",
    ],
    diaryRequirement:
      "Ghi ngày đổ gốc Amino X - Magic One, lượng NPK 2:2:1 từng thửa và các đợt phun dưỡng lá / quản lý rầy nhảy.",
  },
  {
    id: "coi-dot-2",
    order: "03",
    group: "recovery",
    name: "Cơi đọt 2",
    duration: "60 ngày",
    cardSubtitle: "60 ngày - Mở khóa Lân & tích lũy lá lụa",
    imageSrc: "/stages/stage-03-phan.jpg",
    imageAlt:
      "Nhà vườn bón bổ sung hữu cơ và lân nung chảy Văn Điển quanh rãnh chiếu mép tán chuẩn bị trước giai đoạn làm bông",
    drawerObjectPosition: "center 68%",
    summary:
      "Hoàn thiện bộ khung lá sung sức trước khi làm bông: cải tạo pH mở khóa Lân trong đất, dự trữ Lân nung chảy Văn Điển và già hóa đồng bộ lá lụa bằng Brixup - MKP.",
    milestones: [
      {
        treeState: "Lá già (Lá lụa cơi 1 nếu đi cơi chuyền)",
        targetDay: "Ngày 0",
        action:
          "Đổ gốc 25–30 lít/gốc Amino X (1:1000) - Magic One (1:1000). Cải tạo pH, bổ sung hữu cơ – Mở khóa Lân.",
      },
      {
        treeState: "Nứt hạt gạo",
        targetDay: "Ngày 7",
        action: "Bón NPK gốc (tỷ lệ 2:2:1) khoảng 1 kg/gốc. Trên tán phun Grapo (1:400).",
      },
      {
        treeState: "Lá đuôi tôm",
        targetDay: "Ngày 20",
        action:
          "Trên tán phun Grapo - Amino Ca+ (1:800). Tăng cường Lân dự trữ: Bón lân nung chảy (3–5 kg lân Văn Điển cho cây năm thứ 8) giai đoạn 40–45 ngày trước xiết nước.",
      },
      {
        treeState: "Lá lụa",
        targetDay: "Ngày 45–60",
        action: "Phun Brixup (1:400) - MKP (bổ sung Bo, Mg) giúp lá nhanh thuần thục, dày xanh.",
      },
    ],
    keyRules: [
      "Đảm bảo đủ 2–3 cơi đọt khỏe, lá chuyển lụa – già đồng đều trước khi chuyển sang xiết nước tạo mầm.",
      "Sử dụng lân nung chảy Văn Điển có nguồn gốc hợp quy để an toàn tuyệt đối chỉ tiêu Cadimi trong đất.",
    ],
    diaryRequirement:
      "Ghi rõ khối lượng lân Văn Điển (3–5 kg/gốc), hóa đơn vật tư và ngày phun Brixup - MKP chuyển già lá.",
  },
  {
    id: "tao-mam",
    order: "04",
    group: "flowering",
    name: "Tạo mầm hoa",
    duration: "15–30 ngày",
    cardSubtitle: "15–30 ngày - Xiết nước & phân hóa mầm hoa",
    imageSrc: "/landing/real-seasonal-care-orchard.jpg",
    imageAlt:
      "Cán bộ kỹ thuật HTX và nhà vườn kiểm tra mầm mắt cua dưới dạ cành lớn trong giai đoạn xiết nước ủ hoa",
    drawerObjectPosition: "center 40%",
    summary:
      "Kết hợp xiết nước chủ động với bổ sung Lân – Kali hữu hiệu cao qua lá, thân và mặt dưới cành lớn để kích thích phân hóa mầm hoa tập trung, không dùng hóa chất trôi nổi.",
    milestones: [
      {
        treeState: "Già lá hoàn toàn",
        targetDay: "Ngày 0–15",
        action:
          "Phun Tạo mầm (10:60:10 hoặc MKP) từ 2 đến 3 lần; lần cuối kết hợp Combi (phun Magic hoặc Brixup nếu cần). Tiến hành xiết nước. Tăng dòng Lân hữu hiệu (200–500g MKP, MAP nếu cần) và bổ sung Lân qua lá, thân, cành trong giai đoạn đang xiết nước ủ hoa.",
      },
    ],
    keyRules: [
      "Chỉ tiến hành xiết nước khi bộ lá ngoài tán đã già hoàn toàn, tránh cây suy kiệt rụng lá già.",
      "Phun kỹ mặt dưới các cành mang quả cấp 1, cấp 2 nơi tập trung mầm mắt cua.",
    ],
    diaryRequirement:
      "Ghi ngày bắt đầu xiết nước, số lần phun tạo mầm (10:60:10 / MKP - Combi) và ngày nhú mắt cua đầu tiên.",
  },
  {
    id: "nuoi-bong",
    order: "05",
    group: "flowering",
    name: "Nuôi bông",
    duration: "50–60 ngày",
    cardSubtitle: "50–60 ngày - Mắt cua 1 cm đến trước xả nhụy",
    imageSrc: "/stages/stage-04-nuoc.jpg",
    imageAlt:
      "Chùm nụ mắt cua và bông sầu riêng phát triển mập khỏe dưới cành gỗ lớn cùng hệ thống tưới nhấp nước giữ ẩm",
    drawerObjectPosition: "center 46%",
    summary:
      "Điều tiết nước tưới nhấp dần và nuôi dưỡng chùm bông qua 5 mốc kích thước (1 cm → 20 cm), đồng thời kéo và làm già cơi lá đi kèm trước khi hoa xả nhụy.",
    milestones: [
      {
        treeState: "Mắt cua 1 cm",
        targetDay: "Ngày 0–7",
        action: "Nhấp nước giữ ẩm nhẹ lại từ từ. Phun Bloom (1:400) - 500g KNO₃.",
      },
      {
        treeState: "Bông 3 cm (Đọt nứt hạt gạo)",
        targetDay: "Ngày 7–15",
        action:
          "Đổ gốc Magic One - Amino X (1:1000). Ngày 10: Bón gốc NPK 2:1:1 (1 kg/gốc). Trên tán phun Grapo - Amino Ca+ (1:800).",
      },
      {
        treeState: "Bông 7 cm",
        targetDay: "Ngày 15",
        action: "Phun dưỡng bông Bloom - Amino Ca+ (1:400).",
      },
      {
        treeState: "Bông 12 cm",
        targetDay: "Ngày 30",
        action: "Phun Bloom - Amino Ca+ (1:400) (chú ý bổ sung Kali Bo dưỡng cuống và hạt phấn).",
      },
      {
        treeState: "Bông 15–20 cm (Lá lụa, già)",
        targetDay: "Ngày 40–60",
        action:
          "Ngày 40: Đổ gốc Magic One (1:400) - 1 kg K₂SO₄. Phun 500 ml Brixup - 500g Kali Bo cho 200 lít nước.",
      },
    ],
    keyRules: [
      "Tỉa thưa bớt bông đầu cành, bông dị dạng và bông nhiễm rệp sáp khi bông dài 5–10 cm.",
      "Đảm bảo bộ lá đi kèm chuyển lụa – già hoàn toàn ở mốc bông 15–20 cm; nếu đọt bung trễ phải xử lý điều tiết theo phác đồ SenPro.",
    ],
    diaryRequirement:
      "Ghi lịch nhấp nước, đợt bón NPK 2:1:1, K₂SO₄ và ngày xả nhụy rộ để hệ thống tính chuẩn tuổi trái thu hoạch.",
  },
  {
    id: "nuoi-trai",
    order: "06",
    group: "fruiting",
    name: "Nuôi trái",
    duration: "60 ngày",
    cardSubtitle: "60 ngày - Từ đuôi chuột đến trái bằng cái chén",
    imageSrc: "/landing/cune-diary-phi-check.jpg",
    imageAlt:
      "Nhà vườn Cư Né kiểm tra trái non sầu riêng và cập nhật nhật ký chăm bón trên điện thoại theo đúng mốc tuổi trái",
    drawerObjectPosition: "center 46%",
    summary:
      "Giai đoạn quyết định tỷ lệ đậu trái và khung hộc tròn đều trong 60 ngày đầu sau xả nhụy: luân phiên Canxi Nitrat Ca(NO₃)₂, Kali Sunfat K₂SO₄, Magie MgSO₄ với Bloom, Brixup và Kali Bo.",
    milestones: [
      {
        treeState: "Đuôi chuột",
        targetDay: "Ngày 0–7",
        action:
          "Phun Bloom - Amino Ca+ (1:400). Đổ gốc Magic One (1:400) - 1 kg K₂SO₄ - 500g MgSO₄.",
      },
      {
        treeState: "Trái trứng cút",
        targetDay: "Ngày 7–15",
        action: "Phun 500 ml Brixup - 500g Kali Bo.",
      },
      {
        treeState: "Trái trứng gà (Đợt 1)",
        targetDay: "Ngày 15–21",
        action: "Phun Bloom - Amino Ca+ (1:400). Đổ gốc Magic One (1:400) - 1 kg Ca(NO₃)₂.",
      },
      {
        treeState: "Trái trứng gà (Đợt 2)",
        targetDay: "Ngày 21–28",
        action: "Phun 500 ml Brixup - 500g Kali Bo. Đổ gốc Magic One (1:400) - 1 kg Ca(NO₃)₂.",
      },
      {
        treeState: "Trái to hơn trứng gà",
        targetDay: "Ngày 37",
        action: "Phun Bloom - Amino Ca+ (1:400).",
      },
      {
        treeState: "Trái bằng nắm tay",
        targetDay: "Ngày 45",
        action:
          "Phun 500 ml Brixup - 500g Kali Bo. Đổ gốc Magic One (1:400) - 1 kg K₂SO₄ - 500g MgSO₄.",
      },
      {
        treeState: "Trái bằng cái chén",
        targetDay: "Ngày 60",
        action: "Phun 500 ml Brixup - 500g Kali Bo. Đổ gốc Magic One (1:400) - 1 kg Ca(NO₃)₂.",
      },
    ],
    keyRules: [
      "Tỉa trái làm 2–3 đợt (loại bỏ trái méo, gai nhím, sâu bệnh), giữ số trái cân đối theo sức cây và tuổi cây.",
      "Tuyệt đối không để cây phóng đọt non tự do gây rụng sinh lý hàng loạt giai đoạn trứng cút – trứng gà.",
    ],
    diaryRequirement:
      "Ghi đầy đủ từng đợt đổ gốc Ca(NO₃)₂ / K₂SO₄ / MgSO₄ và các lần phun phòng sâu đục quả, rệp sáp theo danh mục cho phép.",
  },
  {
    id: "nuoi-trai-keo-coi",
    order: "07",
    group: "fruiting",
    name: "Nuôi trái – Kéo cơi theo bông",
    duration: "30 ngày",
    cardSubtitle: "Ngày 65–90 - Thúc trọng lượng trái 2–3,5 kg",
    imageSrc: "/landing/cune-orchard-village.jpg",
    imageAlt:
      "Chùm trái sầu riêng 2 đến 3,5 kg phát triển đồng đều dưới tán lá xanh khỏe tại vùng trồng HTX Cư Né",
    drawerObjectPosition: "center 56%",
    summary:
      "Giai đoạn trái tăng tốc trọng lượng từ cái chén lên 2,5–3,5 kg (Ngày 65–90): sử dụng NPK 12:11:18 không chứa Clo kết hợp K₂SO₄ và MgSO₄ giúp lớn hộc, nở gai đều và giữ bộ lá xanh bền.",
    milestones: [
      {
        treeState: "Trái bằng cái chén",
        targetDay: "Ngày 65",
        action: "Bón gốc NPK 12:11:18 (500g/gốc); trường hợp bộ lá yếu có thể dùng NPK 3 số cân đối.",
      },
      {
        treeState: "Trái khoảng 2–3 kg",
        targetDay: "Ngày 80",
        action: "Phun Brixup (1:400) - 500g Kali Bo. Bón gốc NPK 12:11:18 (500g/gốc).",
      },
      {
        treeState: "Trái 2,5–3,5 kg",
        targetDay: "Ngày 90",
        action: "Đổ gốc Magic One (1:400) - 1 kg K₂SO₄ - 500g MgSO₄.",
      },
    ],
    keyRules: [
      "Chỉ sử dụng NPK 12:11:18 gốc Sunfat (không chứa Clo); tuyệt đối cấm Kali đỏ (KCl) làm sượng nước và nhạt cơm.",
      "Neo chằng cành mang quả chắc chắn để tránh tét cành trong mùa mưa gió Tây Nguyên.",
    ],
    diaryRequirement:
      "Ghi đợt bón NPK 12:11:18 (Ngày 65, Ngày 80), đợt đổ gốc Ngày 90 và kiểm tra thời gian cách ly (PHI) của mọi thuốc BVTV.",
  },
  {
    id: "lam-com",
    order: "08",
    group: "fruiting",
    name: "Làm cơm",
    duration: "45 ngày",
    cardSubtitle: "Ngày 105–120 - Cơm vàng ráo, ngọt đậm 3–4 kg",
    imageSrc: "/stages/stage-06-thu-hoach.jpg",
    imageAlt:
      "Trái sầu riêng 3–4 kg đạt độ chín chuẩn, cơm vàng ráo dẻo béo sẵn sàng kiểm nghiệm và thu hoạch xuất khẩu giá cao",
    drawerObjectPosition: "center 54%",
    summary:
      "Giai đoạn hoàn thiện phẩm chất thương phẩm quyết định giá bán (Ngày 105–120): tập trung Kali Sunfat K₂SO₄, Magic One, Brixup và Kali Bo giúp chuyển hóa tinh bột thành đường, lên màu cơm vàng ráo tự nhiên.",
    milestones: [
      {
        treeState: "Trái 3–4 kg",
        targetDay: "Ngày 105",
        action: "Phun 500 ml Brixup - 500g Kali Bo. Đổ gốc Magic One (1:400) - 1 kg K₂SO₄.",
      },
      {
        treeState: "Trái 3–4 kg",
        targetDay: "Ngày 120",
        action: "Phun 500 ml Brixup - 500g Kali Bo. Đổ gốc Magic One (1:400) - 1 kg K₂SO₄.",
      },
    ],
    keyRules: [
      "Ngừng hoàn toàn mọi loại thuốc BVTV hóa học tối thiểu theo đúng số ngày cách ly (PHI) trước ngày dự kiến cắt trái.",
      "Giảm nước tưới hợp lý trước thu hoạch để ráo cơm; tuyệt đối không cắt non và nghiêm cấm mọi hóa chất tạo màu (Vàng O).",
    ],
    diaryRequirement:
      "Chốt nhật ký trước thu hoạch, đăng ký lấy mẫu kiểm nghiệm Cadimi & dư lượng để HTX nghiệm thu và thu mua giá cao.",
  },
  {
    id: "senpro",
    order: "09",
    group: "senpro",
    name: "Quản lý đọt SenPro",
    duration: "Theo trạng thái đọt",
    cardSubtitle: "Mũi giáo 1/400 - Hạt gạo 1/800 - Đuôi tôm 1/300",
    imageSrc: "/stages/stage-05-sau-benh.jpg",
    imageAlt:
      "Kỹ thuật viên và nhà vườn kiểm tra trạng thái mầm đọt mũi giáo, hạt gạo và đuôi tôm để điều tiết đọt non đúng tỷ lệ",
    drawerObjectPosition: "center 48%",
    summary:
      "Phác đồ kỹ thuật chuyên biệt điều tiết và già hóa đọt non bằng SenPro khi cây phóng đọt trùng giai đoạn nuôi bông hoặc nuôi trái non, giúp chống cạnh tranh dinh dưỡng gây rụng trái và sượng cơm.",
    milestones: SENPRO_SHOOT_PROTOCOL.map((r) => ({
      treeState: `Đọt ${r.shootState}`,
      targetDay: `Tỷ lệ pha ${r.ratio}`,
      action: `${r.effect}. ${r.note}`,
    })),
    keyRules: [
      "Xác định đúng trạng thái đọt ngoài thực địa (Hạt gạo / Mũi giáo / Đuôi tôm) trước khi pha đúng tỷ lệ khuyến cáo.",
      "Chỉ phun sương phủ lớp đọt non bên ngoài tán vào lúc trời mát, tránh phun trực tiếp nồng độ cao vào chùm hoa đang nở.",
    ],
    diaryRequirement:
      "Ghi rõ ngày xử lý SenPro, trạng thái đọt thực tế và tỷ lệ pha (1/800, 1/400 hoặc 1/300) vào nhật ký thửa vườn.",
  },
];

