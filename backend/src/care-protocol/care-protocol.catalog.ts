/**
 * Danh mục chuẩn hóa 100% từ tài liệu: "Quy trình sầu riêng 2026-2027_1.xlsx"
 * Gồm 8 giai đoạn tuần tự (26 mốc ngày chi tiết) và Phụ lục điều tiết đọt SenPro (3 trạng thái đọt).
 */

export interface ProtocolProductSpec {
  id: string;
  name: string;
  dosage: string;
}

export interface SequentialMilestoneSpec {
  seq: number;
  code: string;
  stageCode: string;
  stageOrder: string;
  stageName: string;
  stageDurationLabel: string;
  dayLabel: string;
  treeState: string;
  treeStateOptions: string[];
  /** Ngày bắt đầu mốc tính từ ngày khởi đầu chu kỳ (Ngày 0 của Giai đoạn Chuẩn bị 30 ngày). */
  cycleDayStart: number;
  /** Hạn hoàn thành mốc tính từ ngày khởi đầu chu kỳ. */
  cycleDayEnd: number;
  actionSummary: string;
  standardDosageSummary: string;
  defaultJournalActivity: string;
  requiresInvoicePhoto: boolean;
  products: ProtocolProductSpec[];
  forbiddenTerms: string[];
  notes: string;
}

export interface SenProRuleSpec {
  code: string;
  shootState: string;
  requiredRatio: string;
  effectLabel: string;
  actionSummary: string;
}

export interface ComplianceIssue {
  code:
    | "forbidden_substance"
    | "banned_pesticide"
    | "restricted_pesticide"
    | "wrong_senpro_ratio"
    | "non_standard_dosage"
    | "missing_standard_products"
    | "abnormal_tree_state"
    | "overdue_execution";
  severity: "warning" | "violation";
  message: string;
}

const FRUITING_FORBIDDEN = [
  "kcl",
  "kali đỏ",
  "kali do",
  "clorua",
  "vàng o",
  "vang o",
  "auramine",
  "chlorpyrifos",
  "carbaryl",
];

const GENERAL_FORBIDDEN = ["vàng o", "vang o", "auramine", "chlorpyrifos", "carbaryl", "paclobutrazol"];

export const SENPRO_RULES_2026_2027: readonly SenProRuleSpec[] = [
  {
    code: "senpro-mui-giao",
    shootState: "Mũi giáo",
    requiredRatio: "1/400",
    effectLabel: "Già lá 7-10 ngày (chặn đọt 7-10 ngày)",
    actionSummary: "Phun SenPro tỷ lệ 1/400 khi đọt ở trạng thái Mũi giáo để già lá nhanh trong 7-10 ngày.",
  },
  {
    code: "senpro-hat-gao",
    shootState: "Hạt gạo",
    requiredRatio: "1/800",
    effectLabel: "Già lá 7-10 ngày (chặn đọt 7-10 ngày)",
    actionSummary: "Phun SenPro tỷ lệ 1/800 khi đọt mới nhú Hạt gạo để hãm đọt êm, già lá trong 7-10 ngày.",
  },
  {
    code: "senpro-duoi-tom",
    shootState: "Đuôi tôm",
    requiredRatio: "1/300",
    effectLabel: "Rụng trong 3 ngày",
    actionSummary: "Phun SenPro tỷ lệ 1/300 khi đọt Đuôi tôm bung mạnh trùng lúc nuôi bông/trái non (rụng đọt trong 3 ngày).",
  },
];

export const SEQUENTIAL_MILESTONES_2026_2027: readonly SequentialMilestoneSpec[] = [
  // ─── GIAI ĐOẠN 01: CHUẨN BỊ (30 NGÀY: Ngày chu kỳ 0 -> 30) ───
  {
    seq: 1,
    code: "cb-rua-vuon",
    stageCode: "chuan-bi",
    stageOrder: "01",
    stageName: "Chuẩn bị vườn",
    stageDurationLabel: "30 ngày",
    dayLabel: "Trước 30 đến trước 15 ngày phục hồi",
    treeState: "Lá già",
    treeStateOptions: ["Lá già ổn định", "Cây suy yếu sau thu hoạch", "Có cành khô, nấm hồng"],
    cycleDayStart: 0,
    cycleDayEnd: 15,
    actionSummary: "Rửa vườn, cắt cỏ, xới đất thông thoáng quanh tán cây.",
    standardDosageSummary: "Cắt tỉa cành bệnh, cắt cỏ và xới nhẹ mặt đất quanh rãnh tán",
    defaultJournalActivity: "Vệ sinh & rửa vườn",
    requiresInvoicePhoto: false,
    products: [
      { id: "cb-ve-sinh", name: "Rửa vườn, cắt cỏ, xới đất", dosage: "Thực hiện toàn bộ thửa vườn" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Không xới đất quá sâu làm đứt rễ cái; tỉa cành thông thoáng vào ngày nắng ráo.",
  },
  {
    seq: 2,
    code: "cb-bon-voi-huu-co",
    stageCode: "chuan-bi",
    stageOrder: "01",
    stageName: "Chuẩn bị vườn",
    stageDurationLabel: "30 ngày",
    dayLabel: "Trước 15 ngày đến Ngày 0 phục hồi",
    treeState: "Lá già",
    treeStateOptions: ["Lá già ổn định", "Đất chua pH thấp", "Rễ yếu cần phục hồi kỹ"],
    cycleDayStart: 15,
    cycleDayEnd: 30,
    actionSummary: "Bón vôi nâng pH, bổ sung phân hữu cơ, Trichoderma, vi sinh (VS), Soil Harmony.",
    standardDosageSummary: "Vôi nông nghiệp nâng pH, phân hữu cơ hoai mục, Trichoderma, vi sinh và Soil Harmony",
    defaultJournalActivity: "Bón phân hữu cơ & cải tạo đất",
    requiresInvoicePhoto: true,
    products: [
      { id: "cb-voi", name: "Vôi nông nghiệp", dosage: "Rải đều nâng pH đất đầu vụ" },
      { id: "cb-huu-co", name: "Phân hữu cơ chuẩn", dosage: "Bón theo tuổi cây quanh chiếu tán" },
      { id: "cb-tricho", name: "Trichoderma và vi sinh (VS)", dosage: "Cấy đối kháng nấm hại vùng rễ" },
      { id: "cb-harmony", name: "Soil Harmony", dosage: "Cải tạo cấu trúc nền đất" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Bón vôi cách đợt đưa vi sinh Trichoderma để bảo vệ mật độ vi sinh có lợi.",
  },

  // ─── GIAI ĐOẠN 02: CƠI ĐỌT 1 (45 NGÀY: Ngày chu kỳ 30 -> 75) ───
  {
    seq: 3,
    code: "cd1-ngay-0",
    stageCode: "coi-dot-1",
    stageOrder: "02",
    stageName: "Cơi đọt 1",
    stageDurationLabel: "45 ngày",
    dayLabel: "Ngày 0 (Cơi đọt 1)",
    treeState: "Lá già",
    treeStateOptions: ["Lá già sẵn sàng kích rễ", "Cây ra rễ tơ chậm", "Lá vàng nhẹ"],
    cycleDayStart: 30,
    cycleDayEnd: 34,
    actionSummary: "Đổ 25-30L cho 1 gốc dung dịch Amino X (1:1000) kết hợp Magic One (1:1000).",
    standardDosageSummary: "25-30L/gốc: Amino X (1:1000) kết hợp Magic One (1:1000)",
    defaultJournalActivity: "Tưới dưỡng rễ kích cơi đọt",
    requiresInvoicePhoto: true,
    products: [
      { id: "cd1-aminox-0", name: "Amino X", dosage: "Pha tỷ lệ 1:1000, đổ 25-30L/gốc" },
      { id: "cd1-magicone-0", name: "Magic One", dosage: "Pha tỷ lệ 1:1000, đổ 25-30L/gốc" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Tưới ẩm đất nhẹ trước khi đổ gốc để dung dịch thấm đều tầng rễ cám.",
  },
  {
    seq: 4,
    code: "cd1-ngay-7",
    stageCode: "coi-dot-1",
    stageOrder: "02",
    stageName: "Cơi đọt 1",
    stageDurationLabel: "45 ngày",
    dayLabel: "Ngày 7 (Cơi đọt 1)",
    treeState: "Nứt hạt gạo",
    treeStateOptions: ["Nứt hạt gạo đồng đều", "Mầm đọt ra lọt sọt", "Xuất hiện rầy nhảy chích hút"],
    cycleDayStart: 37,
    cycleDayEnd: 41,
    actionSummary: "Bón NPK gốc (2:2:1) khoảng 1 kg/gốc. Trên tán phun Grapo (1:400).",
    standardDosageSummary: "Gốc: NPK 2:2:1 (1 kg/gốc) | Tán lá: Grapo (1:400)",
    defaultJournalActivity: "Bón NPK gốc & phun kéo đọt",
    requiresInvoicePhoto: true,
    products: [
      { id: "cd1-npk-7", name: "NPK gốc tỷ lệ 2:2:1", dosage: "Khoảng 1 kg/gốc" },
      { id: "cd1-grapo-7", name: "Grapo", dosage: "Phun trên tán tỷ lệ 1:400" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Theo dõi sát rầy nhảy ở giai đoạn nứt hạt gạo và tưới tan đều hạt NPK.",
  },
  {
    seq: 5,
    code: "cd1-ngay-20",
    stageCode: "coi-dot-1",
    stageOrder: "02",
    stageName: "Cơi đọt 1",
    stageDurationLabel: "45 ngày",
    dayLabel: "Ngày 20 (Cơi đọt 1)",
    treeState: "Lá đuôi tôm",
    treeStateOptions: ["Lá đuôi tôm mở khỏe", "Lá mỏng nhạt màu", "Có rầy nhảy hoặc cháy bìa lá"],
    cycleDayStart: 50,
    cycleDayEnd: 55,
    actionSummary: "Đổ 25-30L/gốc Amino X (1:1000) kết hợp Magic One (1:1000). Trên tán phun Grapo kết hợp Amino Ca+ (1:800).",
    standardDosageSummary: "Gốc: 25-30L Amino X (1:1000) và Magic One (1:1000) | Tán: Grapo và Amino Ca+ (1:800)",
    defaultJournalActivity: "Dưỡng cơi lá & đổ gốc",
    requiresInvoicePhoto: true,
    products: [
      { id: "cd1-aminox-20", name: "Amino X", dosage: "Đổ gốc 25-30L/gốc (tỷ lệ 1:1000)" },
      { id: "cd1-magicone-20", name: "Magic One", dosage: "Đổ gốc 25-30L/gốc (tỷ lệ 1:1000)" },
      { id: "cd1-grapo-20", name: "Grapo", dosage: "Phun tán tỷ lệ 1:800" },
      { id: "cd1-aminoca-20", name: "Amino Ca+", dosage: "Phun tán tỷ lệ 1:800" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Giúp cơi lá 1 mở bản to, dày khỏe để chuẩn bị chuyển sang cơi đọt 2.",
  },

  // ─── GIAI ĐOẠN 03: CƠI ĐỌT 2 (60 NGÀY: Ngày chu kỳ 75 -> 135) ───
  {
    seq: 6,
    code: "cd2-ngay-0",
    stageCode: "coi-dot-2",
    stageOrder: "03",
    stageName: "Cơi đọt 2",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 0 (Cơi đọt 2)",
    treeState: "Lá già (hoặc lá lụa cơi 1 nếu đi cơi chuyền)",
    treeStateOptions: ["Lá già cơi 1", "Lá lụa cơi 1 (đi cơi chuyền)", "Lá cơi 1 chưa đều"],
    cycleDayStart: 75,
    cycleDayEnd: 80,
    actionSummary: "Đổ 25-30L/gốc Amino X (1:1000) kết hợp Magic One (1:1000). Cải tạo pH, bổ sung hữu cơ, mở khóa Lân.",
    standardDosageSummary: "25-30L/gốc Amino X (1:1000) và Magic One (1:1000), bổ sung hữu cơ cải tạo pH mở khóa Lân",
    defaultJournalActivity: "Tưới dưỡng rễ & cải tạo pH cơi 2",
    requiresInvoicePhoto: true,
    products: [
      { id: "cd2-aminox-0", name: "Amino X", dosage: "Đổ 25-30L/gốc (tỷ lệ 1:1000)" },
      { id: "cd2-magicone-0", name: "Magic One", dosage: "Đổ 25-30L/gốc (tỷ lệ 1:1000)" },
      { id: "cd2-huu-co-0", name: "Hữu cơ cải tạo pH (Mở khóa Lân)", dosage: "Bón quanh tán nâng pH giải phóng Lân" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Kiểm tra lại độ pH đất để cây hấp thu tối đa Lân dự trữ cho giai đoạn tạo mầm sau đó.",
  },
  {
    seq: 7,
    code: "cd2-ngay-7",
    stageCode: "coi-dot-2",
    stageOrder: "03",
    stageName: "Cơi đọt 2",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 7 (Cơi đọt 2)",
    treeState: "Nứt hạt gạo",
    treeStateOptions: ["Nứt hạt gạo đồng đều", "Đọt nhú chậm", "Có rầy nhảy / bọ trĩ"],
    cycleDayStart: 82,
    cycleDayEnd: 86,
    actionSummary: "Bón NPK gốc (2:2:1) khoảng 1 kg/gốc. Trên tán phun Grapo (1:400).",
    standardDosageSummary: "Gốc: NPK 2:2:1 (1 kg/gốc) | Tán lá: Grapo (1:400)",
    defaultJournalActivity: "Bón NPK gốc & phun kéo cơi 2",
    requiresInvoicePhoto: true,
    products: [
      { id: "cd2-npk-7", name: "NPK gốc tỷ lệ 2:2:1", dosage: "Khoảng 1 kg/gốc" },
      { id: "cd2-grapo-7", name: "Grapo", dosage: "Phun trên tán tỷ lệ 1:400" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Bảo vệ tuyệt đối cơi lá 2 không bị rầy đánh rụng vì đây là bộ lá nuôi bông nuôi trái chính.",
  },
  {
    seq: 8,
    code: "cd2-ngay-20",
    stageCode: "coi-dot-2",
    stageOrder: "03",
    stageName: "Cơi đọt 2",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 20 (Cơi đọt 2 - Trước xiết nước 40-45 ngày)",
    treeState: "Lá đuôi tôm",
    treeStateOptions: ["Lá đuôi tôm khỏe", "Lá mở chậm", "Cần tăng cường Lân dự trữ"],
    cycleDayStart: 95,
    cycleDayEnd: 100,
    actionSummary: "Trên tán phun Grapo kết hợp Amino Ca+ (1:800). Bón lân nung chảy Văn Điển (3-5 kg cho cây năm thứ 8) trước xiết nước 40-45 ngày.",
    standardDosageSummary: "Tán: Grapo và Amino Ca+ (1:800) | Gốc: 3-5 kg Lân nung chảy Văn Điển/gốc",
    defaultJournalActivity: "Bón lân dự trữ & phun dưỡng lá",
    requiresInvoicePhoto: true,
    products: [
      { id: "cd2-grapo-20", name: "Grapo", dosage: "Phun trên tán tỷ lệ 1:800" },
      { id: "cd2-aminoca-20", name: "Amino Ca+", dosage: "Phun trên tán tỷ lệ 1:800" },
      { id: "cd2-lan-20", name: "Lân nung chảy Văn Điển", dosage: "3-5 kg/gốc (cây năm thứ 8)" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Dùng lân nung chảy hợp quy để dự trữ Lân làm bông và kiểm soát an toàn chỉ tiêu Cadimi.",
  },
  {
    seq: 9,
    code: "cd2-ngay-45-60",
    stageCode: "coi-dot-2",
    stageOrder: "03",
    stageName: "Cơi đọt 2",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 45-60 (Cơi đọt 2)",
    treeState: "Lá lụa",
    treeStateOptions: ["Lá lụa đồng đều", "Một số cây còn phóng đọt non", "Lá mỏng cần dày hóa nhanh"],
    cycleDayStart: 120,
    cycleDayEnd: 135,
    actionSummary: "Phun Brixup (1:400) kết hợp MKP (bổ sung Bo, Mg) làm già đồng loạt bộ lá.",
    standardDosageSummary: "Brixup (1:400) kết hợp MKP, bổ sung Bo và Mg",
    defaultJournalActivity: "Phun già hóa đồng bộ lá lụa",
    requiresInvoicePhoto: true,
    products: [
      { id: "cd2-brixup-45", name: "Brixup", dosage: "Phun tỷ lệ 1:400" },
      { id: "cd2-mkp-45", name: "MKP (kèm Bo, Mg)", dosage: "Phối hợp chuyển lá lụa sang lá già" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Bộ lá phải chuyển già hoàn toàn mới đủ điều kiện bước vào giai đoạn xiết nước tạo mầm.",
  },

  // ─── GIAI ĐOẠN 04: TẠO MẦM (15-30 NGÀY: Ngày chu kỳ 135 -> 155) ───
  {
    seq: 10,
    code: "tm-ngay-0-15",
    stageCode: "tao-mam",
    stageOrder: "04",
    stageName: "Tạo mầm hoa",
    stageDurationLabel: "15-30 ngày",
    dayLabel: "Ngày 0-15 (Tạo mầm)",
    treeState: "Già lá",
    treeStateOptions: ["Già lá hoàn toàn (đủ chuẩn xiết nước)", "Lá còn lụa chưa già hết", "Mưa trái vụ ẩm đất"],
    cycleDayStart: 135,
    cycleDayEnd: 155,
    actionSummary: "Tiến hành xiết nước. Phun Tạo mầm (10:60:10 hoặc MKP) 2-3 lần, lần cuối kết hợp Combi (phun Magic hoặc Brixup nếu cần). Tăng lân hữu hiệu (200-500g MKP, MAP) qua lá, thân, mặt dưới cành.",
    standardDosageSummary: "Xiết nước chủ động; phun 10:60:10 hoặc MKP (200-500g) 2-3 lần, lần cuối kèm Combi",
    defaultJournalActivity: "Xiết nước & phun tạo mầm hoa",
    requiresInvoicePhoto: true,
    products: [
      { id: "tm-106010", name: "Tạo mầm 10:60:10 hoặc MKP / MAP", dosage: "200-500g, phun 2-3 lần vào lá và dạ cành" },
      { id: "tm-combi", name: "Combi vi lượng (lần cuối)", dosage: "Kết hợp ở cữ phun tạo mầm cuối" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Tuyệt đối không dùng Paclobutrazol cấm xuất khẩu; chỉ xiết nước khi bộ lá đã già hoàn toàn.",
  },

  // ─── GIAI ĐOẠN 05: NUÔI BÔNG (50-60 NGÀY: Ngày chu kỳ 155 -> 210) ───
  {
    seq: 11,
    code: "nb-ngay-0-7",
    stageCode: "nuoi-bong",
    stageOrder: "05",
    stageName: "Nuôi bông",
    stageDurationLabel: "50-60 ngày",
    dayLabel: "Ngày 0-7 (Nuôi bông)",
    treeState: "Mắt cua 1 cm",
    treeStateOptions: ["Mắt cua 1 cm sáng đều", "Mắt cua đen / nghẹn bông", "Mắt cua ra rải rác"],
    cycleDayStart: 155,
    cycleDayEnd: 162,
    actionSummary: "Nhấp nước giữ ẩm nhẹ lại từ từ. Phun Bloom (1:400) kết hợp 500g KNO3.",
    standardDosageSummary: "Nhấp nước nhẹ; phun Bloom (1:400) kết hợp 500g KNO3",
    defaultJournalActivity: "Nhấp nước & phun rước mắt cua",
    requiresInvoicePhoto: true,
    products: [
      { id: "nb-bloom-0", name: "Bloom", dosage: "Pha tỷ lệ 1:400" },
      { id: "nb-kno3-0", name: "KNO3", dosage: "500g phối hợp kéo sáng mắt cua" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Nhấp nước từng lượng nhỏ tăng dần (20-30% lượng bình thường), tránh tưới đẫm đột ngột gây sốc rụng mắt cua.",
  },
  {
    seq: 12,
    code: "nb-ngay-7-15",
    stageCode: "nuoi-bong",
    stageOrder: "05",
    stageName: "Nuôi bông",
    stageDurationLabel: "50-60 ngày",
    dayLabel: "Ngày 7-15 (Nuôi bông)",
    treeState: "Bông 3 cm (Nứt hạt gạo)",
    treeStateOptions: ["Bông 3 cm kèm đọt nứt hạt gạo chuẩn", "Bông 3 cm nhưng không nhú đọt", "Đọt phóng quá mạnh lấn bông"],
    cycleDayStart: 162,
    cycleDayEnd: 170,
    actionSummary: "Đổ gốc Magic One kết hợp Amino X (1:1000). Ngày 10: Bón NPK 2:1:1 (1 kg/gốc). Trên tán phun Grapo kết hợp Amino Ca+ (1:800).",
    standardDosageSummary: "Gốc: Magic One và Amino X (1:1000), Ngày 10 bón NPK 2:1:1 (1 kg/gốc) | Tán: Grapo và Amino Ca+ (1:800)",
    defaultJournalActivity: "Nuôi bông 3cm & kéo cơi đọt theo bông",
    requiresInvoicePhoto: true,
    products: [
      { id: "nb-magicone-7", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:1000" },
      { id: "nb-aminox-7", name: "Amino X", dosage: "Đổ gốc tỷ lệ 1:1000" },
      { id: "nb-npk-10", name: "NPK 2:1:1 (Ngày 10)", dosage: "1 kg/gốc" },
      { id: "nb-grapo-7", name: "Grapo", dosage: "Phun tán tỷ lệ 1:800" },
      { id: "nb-aminoca-7", name: "Amino Ca+", dosage: "Phun tán tỷ lệ 1:800" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Kéo cơi đọt đi song song với bông để kịp già lá trước khi hoa xả nhụy.",
  },
  {
    seq: 13,
    code: "nb-ngay-15",
    stageCode: "nuoi-bong",
    stageOrder: "05",
    stageName: "Nuôi bông",
    stageDurationLabel: "50-60 ngày",
    dayLabel: "Ngày 15 (Nuôi bông)",
    treeState: "Bông 7 cm",
    treeStateOptions: ["Bông 7 cm mập khỏe", "Bông ốm dài cuống", "Có rệp sáp / sâu ăn bông"],
    cycleDayStart: 170,
    cycleDayEnd: 175,
    actionSummary: "Phun dưỡng chùm bông Bloom kết hợp Amino Ca+ (1:400).",
    standardDosageSummary: "Phun Bloom kết hợp Amino Ca+ (tỷ lệ 1:400)",
    defaultJournalActivity: "Phun dưỡng bông 7cm",
    requiresInvoicePhoto: true,
    products: [
      { id: "nb-bloom-15", name: "Bloom", dosage: "Pha tỷ lệ 1:400" },
      { id: "nb-aminoca-15", name: "Amino Ca+", dosage: "Pha tỷ lệ 1:400" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Kết hợp tỉa thưa bớt bông đầu cành và bông dị dạng để tập trung dinh dưỡng.",
  },
  {
    seq: 14,
    code: "nb-ngay-30",
    stageCode: "nuoi-bong",
    stageOrder: "05",
    stageName: "Nuôi bông",
    stageDurationLabel: "50-60 ngày",
    dayLabel: "Ngày 30 (Nuôi bông)",
    treeState: "Bông 12 cm",
    treeStateOptions: ["Bông 12 cm khỏe đều", "Cuống bông yếu dễ rụng", "Đọt non bung trễ cần điều tiết"],
    cycleDayStart: 185,
    cycleDayEnd: 190,
    actionSummary: "Phun Bloom kết hợp Amino Ca+ (1:400), chú ý bổ sung Kali Bo dưỡng cuống và hạt phấn.",
    standardDosageSummary: "Bloom và Amino Ca+ (1:400), bổ sung Kali Bo",
    defaultJournalActivity: "Phun dưỡng bông 12cm & Kali Bo",
    requiresInvoicePhoto: true,
    products: [
      { id: "nb-bloom-30", name: "Bloom", dosage: "Pha tỷ lệ 1:400" },
      { id: "nb-aminoca-30", name: "Amino Ca+", dosage: "Pha tỷ lệ 1:400" },
      { id: "nb-kalibo-30", name: "Kali Bo", dosage: "Bổ sung làm dẻo cuống và khỏe hạt phấn" },
    ],
    forbiddenTerms: GENERAL_FORBIDDEN,
    notes: "Nếu đọt non ngoài tán bung trễ chưa kịp lụa, cần kiểm tra để xử lý SenPro đúng trạng thái.",
  },
  {
    seq: 15,
    code: "nb-ngay-40-60",
    stageCode: "nuoi-bong",
    stageOrder: "05",
    stageName: "Nuôi bông",
    stageDurationLabel: "50-60 ngày",
    dayLabel: "Ngày 40-60 (Trước xả nhụy)",
    treeState: "Bông 15-20 cm (Lá lụa, già)",
    treeStateOptions: ["Bông 15-20 cm, lá đã lụa/già chuẩn", "Đọt non vẫn đang phóng (nguy cơ rụng)", "Sắp xả nhụy rộ"],
    cycleDayStart: 195,
    cycleDayEnd: 210,
    actionSummary: "Ngày 40: Đổ gốc Magic One (1:400) kết hợp 1 kg K2SO4. Phun 500 ml Brixup kết hợp 500g Kali Bo cho 200L nước.",
    standardDosageSummary: "Gốc: Magic One (1:400) và 1 kg K2SO4 | Tán: 500 ml Brixup và 500g Kali Bo / 200L nước",
    defaultJournalActivity: "Dưỡng bông trước xả nhụy",
    requiresInvoicePhoto: true,
    products: [
      { id: "nb-magicone-40", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "nb-k2so4-40", name: "K2SO4 (Kali Sunfat)", dosage: "1 kg/gốc" },
      { id: "nb-brixup-40", name: "Brixup", dosage: "500 ml cho 200L nước" },
      { id: "nb-kalibo-40", name: "Kali Bo", dosage: "500g cho 200L nước" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Ghi nhớ ngày xả nhụy rộ để hệ thống tính chính xác tuổi trái từ Ngày 0 đến Ngày 120.",
  },

  // ─── GIAI ĐOẠN 06: NUÔI TRÁI (60 NGÀY ĐẦU: Ngày chu kỳ 210 -> 270 | Tuổi trái Ngày 0 -> 60) ───
  {
    seq: 16,
    code: "nt-ngay-0-7",
    stageCode: "nuoi-trai",
    stageOrder: "06",
    stageName: "Nuôi trái",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 0-7 tuổi trái",
    treeState: "Đuôi chuột",
    treeStateOptions: ["Đuôi chuột chạy trái khỏe", "Rụng sinh lý nhiều sau xả nhụy", "Cây nhú mũi giáo cạnh tranh"],
    cycleDayStart: 210,
    cycleDayEnd: 217,
    actionSummary: "Phun Bloom kết hợp Amino Ca+ (1:400). Đổ gốc Magic One (1:400) kết hợp 1 kg K2SO4 và 500g MgSO4.",
    standardDosageSummary: "Tán: Bloom và Amino Ca+ (1:400) | Gốc: Magic One (1:400), 1 kg K2SO4, 500g MgSO4",
    defaultJournalActivity: "Giữ trái non giai đoạn đuôi chuột",
    requiresInvoicePhoto: true,
    products: [
      { id: "nt-bloom-0", name: "Bloom", dosage: "Phun tỷ lệ 1:400" },
      { id: "nt-aminoca-0", name: "Amino Ca+", dosage: "Phun tỷ lệ 1:400" },
      { id: "nt-magicone-0", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "nt-k2so4-0", name: "K2SO4 (Kali Sunfat)", dosage: "1 kg/gốc" },
      { id: "nt-mgso4-0", name: "MgSO4 (Magie Sunfat)", dosage: "500g/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Tuyệt đối không dùng Kali đỏ (KCl); giữ ẩm ổn định tránh sốc nước gây rụng đuôi chuột.",
  },
  {
    seq: 17,
    code: "nt-ngay-7-15",
    stageCode: "nuoi-trai",
    stageOrder: "06",
    stageName: "Nuôi trái",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 7-15 tuổi trái",
    treeState: "Trái trứng cút",
    treeStateOptions: ["Trái trứng cút xanh gai đều", "Trái méo / rụng sinh lý", "Cây phóng đọt non"],
    cycleDayStart: 217,
    cycleDayEnd: 225,
    actionSummary: "Phun 500 ml Brixup kết hợp 500g Kali Bo dưỡng cuống chống rụng trái non.",
    standardDosageSummary: "Phun 500 ml Brixup kết hợp 500g Kali Bo (cho phuy 200L)",
    defaultJournalActivity: "Dưỡng trái non giai đoạn trứng cút",
    requiresInvoicePhoto: true,
    products: [
      { id: "nt-brixup-7", name: "Brixup", dosage: "500 ml / 200L nước" },
      { id: "nt-kalibo-7", name: "Kali Bo", dosage: "500g / 200L nước" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Tỉa sơ bộ các trái đèo, trái cong vẹo ở chùm dày.",
  },
  {
    seq: 18,
    code: "nt-ngay-15-21",
    stageCode: "nuoi-trai",
    stageOrder: "06",
    stageName: "Nuôi trái",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 15-21 tuổi trái",
    treeState: "Trái trứng gà (Đợt 1)",
    treeStateOptions: ["Trái trứng gà tròn đều", "Trái gai nhím / méo hộc", "Rụng trái non do mưa hoặc đọt"],
    cycleDayStart: 225,
    cycleDayEnd: 231,
    actionSummary: "Phun Bloom kết hợp Amino Ca+ (1:400). Đổ gốc Magic One (1:400) kết hợp 1 kg Ca(NO3)2.",
    standardDosageSummary: "Tán: Bloom và Amino Ca+ (1:400) | Gốc: Magic One (1:400) và 1 kg Ca(NO3)2",
    defaultJournalActivity: "Dưỡng trái giai đoạn trứng gà đợt 1",
    requiresInvoicePhoto: true,
    products: [
      { id: "nt-bloom-15", name: "Bloom", dosage: "Phun tỷ lệ 1:400" },
      { id: "nt-aminoca-15", name: "Amino Ca+", dosage: "Phun tỷ lệ 1:400" },
      { id: "nt-magicone-15", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "nt-cano3-15", name: "Ca(NO3)2 (Canxi Nitrat)", dosage: "1 kg/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Canxi Nitrat giúp cứng vách tế bào vỏ và định hình khung hộc tròn đều.",
  },
  {
    seq: 19,
    code: "nt-ngay-21-28",
    stageCode: "nuoi-trai",
    stageOrder: "06",
    stageName: "Nuôi trái",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 21-28 tuổi trái",
    treeState: "Trái trứng gà (Đợt 2)",
    treeStateOptions: ["Trái trứng gà lớn nhanh, xanh gai", "Có rệp sáp tấn công cuống trái", "Đọt non nhú mạnh"],
    cycleDayStart: 231,
    cycleDayEnd: 238,
    actionSummary: "Phun 500 ml Brixup kết hợp 500g Kali Bo. Đổ gốc Magic One (1:400) kết hợp 1 kg Ca(NO3)2.",
    standardDosageSummary: "Tán: 500 ml Brixup và 500g Kali Bo | Gốc: Magic One (1:400) và 1 kg Ca(NO3)2",
    defaultJournalActivity: "Dưỡng trái giai đoạn trứng gà đợt 2",
    requiresInvoicePhoto: true,
    products: [
      { id: "nt-brixup-21", name: "Brixup", dosage: "500 ml / 200L nước" },
      { id: "nt-kalibo-21", name: "Kali Bo", dosage: "500g / 200L nước" },
      { id: "nt-magicone-21", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "nt-cano3-21", name: "Ca(NO3)2 (Canxi Nitrat)", dosage: "1 kg/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Tiến hành tỉa trái đợt 2, giữ lại những trái cân đối phân bố đều trên cành cấp 1.",
  },
  {
    seq: 20,
    code: "nt-ngay-37",
    stageCode: "nuoi-trai",
    stageOrder: "06",
    stageName: "Nuôi trái",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 37 tuổi trái",
    treeState: "Trái to hơn trứng gà",
    treeStateOptions: ["Trái to hơn trứng gà đồng đều", "Trái chậm lớn", "Xuất hiện sâu đục trái / rệp sáp"],
    cycleDayStart: 247,
    cycleDayEnd: 251,
    actionSummary: "Phun dưỡng trái Bloom kết hợp Amino Ca+ (1:400).",
    standardDosageSummary: "Phun Bloom kết hợp Amino Ca+ (tỷ lệ 1:400)",
    defaultJournalActivity: "Phun dưỡng trái Ngày 37",
    requiresInvoicePhoto: true,
    products: [
      { id: "nt-bloom-37", name: "Bloom", dosage: "Phun tỷ lệ 1:400" },
      { id: "nt-aminoca-37", name: "Amino Ca+", dosage: "Phun tỷ lệ 1:400" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Hạn chế nứt gai và bể đầu gai khi trái bắt đầu bung khung mạnh.",
  },
  {
    seq: 21,
    code: "nt-ngay-45",
    stageCode: "nuoi-trai",
    stageOrder: "06",
    stageName: "Nuôi trái",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 45 tuổi trái",
    treeState: "Trái bằng nắm tay",
    treeStateOptions: ["Trái bằng nắm tay tròn hộc", "Trái lệch tâm / méo hộc", "Lá ngoài tán hơi vàng"],
    cycleDayStart: 255,
    cycleDayEnd: 259,
    actionSummary: "Phun 500 ml Brixup kết hợp 500g Kali Bo. Đổ gốc Magic One (1:400) kết hợp 1 kg K2SO4 và 500g MgSO4.",
    standardDosageSummary: "Tán: 500 ml Brixup và 500g Kali Bo | Gốc: Magic One (1:400), 1 kg K2SO4, 500g MgSO4",
    defaultJournalActivity: "Dưỡng trái Ngày 45 (trái bằng nắm tay)",
    requiresInvoicePhoto: true,
    products: [
      { id: "nt-brixup-45", name: "Brixup", dosage: "500 ml / 200L nước" },
      { id: "nt-kalibo-45", name: "Kali Bo", dosage: "500g / 200L nước" },
      { id: "nt-magicone-45", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "nt-k2so4-45", name: "K2SO4 (Kali Sunfat)", dosage: "1 kg/gốc" },
      { id: "nt-mgso4-45", name: "MgSO4 (Magie Sunfat)", dosage: "500g/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Tỉa chốt số lượng trái cuối cùng trên cây phù hợp với sức tải của bộ lá.",
  },
  {
    seq: 22,
    code: "nt-ngay-60",
    stageCode: "nuoi-trai",
    stageOrder: "06",
    stageName: "Nuôi trái",
    stageDurationLabel: "60 ngày",
    dayLabel: "Ngày 60 tuổi trái",
    treeState: "Trái bằng cái chén",
    treeStateOptions: ["Trái bằng cái chén đồng đều", "Vỏ dày cần cân đối dinh dưỡng", "Có nấm trái mùa mưa"],
    cycleDayStart: 270,
    cycleDayEnd: 274,
    actionSummary: "Phun 500 ml Brixup kết hợp 500g Kali Bo. Đổ gốc Magic One (1:400) kết hợp 1 kg Ca(NO3)2.",
    standardDosageSummary: "Tán: 500 ml Brixup và 500g Kali Bo | Gốc: Magic One (1:400) và 1 kg Ca(NO3)2",
    defaultJournalActivity: "Dưỡng trái Ngày 60 (trái bằng cái chén)",
    requiresInvoicePhoto: true,
    products: [
      { id: "nt-brixup-60", name: "Brixup", dosage: "500 ml / 200L nước" },
      { id: "nt-kalibo-60", name: "Kali Bo", dosage: "500g / 200L nước" },
      { id: "nt-magicone-60", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "nt-cano3-60", name: "Ca(NO3)2 (Canxi Nitrat)", dosage: "1 kg/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Hoàn tất 60 ngày định hình khung trái, chuẩn bị bước sang thúc trọng lượng hộc cơm.",
  },

  // ─── GIAI ĐOẠN 07: NUÔI TRÁI - KÉO CƠI THEO BÔNG (30 NGÀY: Ngày chu kỳ 275 -> 305 | Tuổi trái Ngày 65 -> 90) ───
  {
    seq: 23,
    code: "ntkc-ngay-65",
    stageCode: "nuoi-trai-keo-coi",
    stageOrder: "07",
    stageName: "Nuôi trái - Kéo cơi theo bông",
    stageDurationLabel: "30 ngày",
    dayLabel: "Ngày 65 tuổi trái",
    treeState: "Trái bằng cái chén",
    treeStateOptions: ["Trái bằng cái chén, bộ lá khỏe", "Bộ lá yếu (dùng NPK 3 số cân đối)", "Cành mang quả nặng cần neo dây"],
    cycleDayStart: 275,
    cycleDayEnd: 279,
    actionSummary: "Bón gốc NPK 12:11:18 (500g/gốc); nếu bộ lá yếu có thể dùng NPK 3 số cân đối gốc Sunfat.",
    standardDosageSummary: "Bón gốc NPK 12:11:18 (500g/gốc) không chứa Clo",
    defaultJournalActivity: "Bón thúc trọng lượng trái Ngày 65",
    requiresInvoicePhoto: true,
    products: [
      { id: "ntkc-npk-65", name: "NPK 12:11:18 (hoặc NPK 3 số gốc Sunfat)", dosage: "500g/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Chỉ dùng NPK gốc Sunfat không chứa Clo; neo chằng cành mang trái chống gãy tét.",
  },
  {
    seq: 24,
    code: "ntkc-ngay-80",
    stageCode: "nuoi-trai-keo-coi",
    stageOrder: "07",
    stageName: "Nuôi trái - Kéo cơi theo bông",
    stageDurationLabel: "30 ngày",
    dayLabel: "Ngày 80 tuổi trái",
    treeState: "Trái khoảng 2-3 kg",
    treeStateOptions: ["Trái 2-3 kg nở hộc đều", "Trái dưới 2 kg chậm lớn", "Có dấu hiệu thối hông trái"],
    cycleDayStart: 290,
    cycleDayEnd: 294,
    actionSummary: "Phun Brixup (1:400) kết hợp 500g Kali Bo. Bón gốc NPK 12:11:18 (500g/gốc).",
    standardDosageSummary: "Tán: Brixup (1:400) và 500g Kali Bo | Gốc: NPK 12:11:18 (500g/gốc)",
    defaultJournalActivity: "Bón thúc & phun dưỡng trái Ngày 80",
    requiresInvoicePhoto: true,
    products: [
      { id: "ntkc-brixup-80", name: "Brixup", dosage: "Phun tỷ lệ 1:400" },
      { id: "ntkc-kalibo-80", name: "Kali Bo", dosage: "500g / 200L nước" },
      { id: "ntkc-npk-80", name: "NPK 12:11:18", dosage: "500g/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Kiểm soát chặt thời gian cách ly PHI nếu có phun phòng nấm Phytophthora mùa mưa.",
  },
  {
    seq: 25,
    code: "ntkc-ngay-90",
    stageCode: "nuoi-trai-keo-coi",
    stageOrder: "07",
    stageName: "Nuôi trái - Kéo cơi theo bông",
    stageDurationLabel: "30 ngày",
    dayLabel: "Ngày 90 tuổi trái",
    treeState: "Trái 2,5-3,5 kg",
    treeStateOptions: ["Trái đạt 2,5-3,5 kg chuẩn", "Trái lớn quá nhanh dễ nứt vỏ", "Bộ lá xanh dày ổn định"],
    cycleDayStart: 300,
    cycleDayEnd: 304,
    actionSummary: "Đổ gốc Magic One (1:400) kết hợp 1 kg K2SO4 và 500g MgSO4.",
    standardDosageSummary: "Đổ gốc Magic One (1:400), 1 kg K2SO4 và 500g MgSO4",
    defaultJournalActivity: "Đổ gốc chuyển hóa tinh bột Ngày 90",
    requiresInvoicePhoto: true,
    products: [
      { id: "ntkc-magicone-90", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "ntkc-k2so4-90", name: "K2SO4 (Kali Sunfat)", dosage: "1 kg/gốc" },
      { id: "ntkc-mgso4-90", name: "MgSO4 (Magie Sunfat)", dosage: "500g/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Ngưng hoàn toàn đạm cao từ sau Ngày 90 để trái không bị sượng cơm.",
  },

  // ─── GIAI ĐOẠN 08: LÀM CƠM (45 NGÀY CUỐI: Ngày chu kỳ 315 -> 335 | Tuổi trái Ngày 105 -> 120) ───
  {
    seq: 26,
    code: "lc-ngay-105",
    stageCode: "lam-com",
    stageOrder: "08",
    stageName: "Làm cơm",
    stageDurationLabel: "45 ngày",
    dayLabel: "Ngày 105 tuổi trái",
    treeState: "Trái 3-4 kg",
    treeStateOptions: ["Trái 3-4 kg đang vô cơm tốt", "Mưa nhiều dư ẩm đất", "Cần kiểm tra thời gian cách ly PHI"],
    cycleDayStart: 315,
    cycleDayEnd: 319,
    actionSummary: "Phun 500 ml Brixup kết hợp 500g Kali Bo. Đổ gốc Magic One (1:400) kết hợp 1 kg K2SO4.",
    standardDosageSummary: "Tán: 500 ml Brixup và 500g Kali Bo | Gốc: Magic One (1:400) và 1 kg K2SO4",
    defaultJournalActivity: "Làm cơm đợt 1 (Ngày 105)",
    requiresInvoicePhoto: true,
    products: [
      { id: "lc-brixup-105", name: "Brixup", dosage: "500 ml / 200L nước" },
      { id: "lc-kalibo-105", name: "Kali Bo", dosage: "500g / 200L nước" },
      { id: "lc-magicone-105", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "lc-k2so4-105", name: "K2SO4 (Kali Sunfat)", dosage: "1 kg/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Tuyệt đối ngưng các hoạt chất BVTV có thời gian cách ly dài để đảm bảo MRL bằng 0.",
  },
  {
    seq: 27,
    code: "lc-ngay-120",
    stageCode: "lam-com",
    stageOrder: "08",
    stageName: "Làm cơm",
    stageDurationLabel: "45 ngày",
    dayLabel: "Ngày 120 tuổi trái (Chốt làm cơm)",
    treeState: "Trái 3-4 kg",
    treeStateOptions: ["Trái 3-4 kg cơm vàng ráo, sẵn sàng lấy mẫu", "Trái chín trễ hơn dự kiến", "Mưa dầm cần rút rãnh nước"],
    cycleDayStart: 330,
    cycleDayEnd: 335,
    actionSummary: "Phun 500 ml Brixup kết hợp 500g Kali Bo. Đổ gốc Magic One (1:400) kết hợp 1 kg K2SO4. Khóa sổ chờ lấy mẫu kiểm nghiệm thu hoạch.",
    standardDosageSummary: "Tán: 500 ml Brixup và 500g Kali Bo | Gốc: Magic One (1:400) và 1 kg K2SO4",
    defaultJournalActivity: "Làm cơm đợt cuối (Ngày 120)",
    requiresInvoicePhoto: true,
    products: [
      { id: "lc-brixup-120", name: "Brixup", dosage: "500 ml / 200L nước" },
      { id: "lc-kalibo-120", name: "Kali Bo", dosage: "500g / 200L nước" },
      { id: "lc-magicone-120", name: "Magic One", dosage: "Đổ gốc tỷ lệ 1:400" },
      { id: "lc-k2so4-120", name: "K2SO4 (Kali Sunfat)", dosage: "1 kg/gốc" },
    ],
    forbiddenTerms: FRUITING_FORBIDDEN,
    notes: "Giảm nước tưới hợp lý trước thu hoạch; đăng ký HTX lấy mẫu kiểm nghiệm Cadimi và dư lượng.",
  },
];

export const TOTAL_SEQUENTIAL_MILESTONES = SEQUENTIAL_MILESTONES_2026_2027.length;

export function addIsoDays(isoDate: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function diffIsoDays(laterIso: string, earlierIso: string): number {
  const a = new Date(`${laterIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${earlierIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function formatIsoVn(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function getSequentialMilestone(code: string): SequentialMilestoneSpec | undefined {
  return SEQUENTIAL_MILESTONES_2026_2027.find((m) => m.code === code);
}

export function getSenProRule(code: string): SenProRuleSpec | undefined {
  return SENPRO_RULES_2026_2027.find((r) => r.code === code);
}

export function getNextSequentialMilestone(currentCode: string): SequentialMilestoneSpec | null {
  const idx = SEQUENTIAL_MILESTONES_2026_2027.findIndex((m) => m.code === currentCode);
  if (idx < 0 || idx + 1 >= SEQUENTIAL_MILESTONES_2026_2027.length) return null;
  return SEQUENTIAL_MILESTONES_2026_2027[idx + 1];
}

const ABNORMAL_STATE_PATTERNS = [
  "suy yếu",
  "nấm",
  "chua",
  "chậm",
  "vàng",
  "lọt sọt",
  "rầy",
  "bọ trĩ",
  "cháy",
  "chưa đều",
  "mỏng",
  "còn lụa",
  "chưa già",
  "mưa",
  "nghẹn",
  "rải rác",
  "không nhú",
  "quá mạnh",
  "ốm",
  "sâu",
  "rệp",
  "dễ rụng",
  "bung trễ",
  "nguy cơ rụng",
  "rụng sinh lý",
  "cạnh tranh",
  "méo",
  "gai nhím",
  "phóng đọt",
  "nhú mạnh",
  "lệch tâm",
  "thối",
  "nứt vỏ",
  "dư ẩm",
];

export function evaluateDeclarationCompliance(params: {
  milestone?: SequentialMilestoneSpec;
  senProRule?: SenProRuleSpec;
  performedOn: string;
  dueOn: string | null;
  actualTreeState: string;
  followedStandard: boolean;
  selectedProducts: string[];
  actualDosage: string;
  extraInputs?: string | null;
  pesticideStatus?: "allowed" | "restricted" | "banned" | null;
  pesticideName?: string | null;
}): {
  complianceStatus: "compliant" | "warning" | "violation";
  issues: ComplianceIssue[];
} {
  const issues: ComplianceIssue[] = [];
  const combinedInputText = `${params.actualDosage} ${params.extraInputs ?? ""} ${params.selectedProducts.join(" ")}`.toLowerCase();

  // 1. Kiểm tra thuốc BVTV cấm / hạn chế
  if (params.pesticideStatus === "banned") {
    issues.push({
      code: "banned_pesticide",
      severity: "violation",
      message: `Sử dụng thuốc BVTV nằm trong danh mục cấm (${params.pesticideName ?? "hoạt chất cấm"}).`,
    });
  } else if (params.pesticideStatus === "restricted") {
    issues.push({
      code: "restricted_pesticide",
      severity: "warning",
      message: `Có kết hợp hoạt chất hạn chế (${params.pesticideName ?? "cần giám sát PHI"}).`,
    });
  }

  // 2. Kiểm tra vật tư cấm theo giai đoạn (KCl / Kali đỏ gây sượng cơm, Paclobutrazol, Vàng O...)
  const forbiddenList = params.milestone ? params.milestone.forbiddenTerms : FRUITING_FORBIDDEN;
  const hitForbidden = forbiddenList.find((term) => combinedInputText.includes(term));
  if (hitForbidden) {
    issues.push({
      code: "forbidden_substance",
      severity: "violation",
      message: `Phát hiện vật tư không được phép trong quy trình 2026-2027 ("${hitForbidden}"). Tuyệt đối không dùng Kali đỏ (KCl), Paclobutrazol hoặc chất cấm.`,
    });
  }

  // 3. Kiểm tra riêng tỷ lệ pha SenPro theo trạng thái đọt (Excel dòng 31-33)
  if (params.senProRule) {
    const normalizedDosage = params.actualDosage.replace(/\s+/g, "").replace(":", "/");
    if (!normalizedDosage.includes(params.senProRule.requiredRatio)) {
      issues.push({
        code: "wrong_senpro_ratio",
        severity: "violation",
        message: `Sai tỷ lệ pha SenPro cho đọt ${params.senProRule.shootState}: quy trình bắt buộc ${params.senProRule.requiredRatio}, nhưng khai báo "${params.actualDosage}".`,
      });
    }
  }

  // 4. Kiểm tra khai báo sai lệch phác đồ chuẩn hoặc bỏ sót vật tư cốt lõi
  if (!params.followedStandard) {
    issues.push({
      code: "non_standard_dosage",
      severity: "violation",
      message: "Hộ khai báo thực hiện khác định lượng / vật tư chuẩn của tài liệu 2026-2027.",
    });
  } else if (params.milestone && params.milestone.products.length > 0) {
    const selectedSet = new Set(params.selectedProducts.map((s) => s.trim().toLowerCase()));
    const missing = params.milestone.products.filter(
      (p) => !selectedSet.has(p.id.toLowerCase()) && !selectedSet.has(p.name.toLowerCase()),
    );
    if (missing.length > 0) {
      issues.push({
        code: "missing_standard_products",
        severity: "violation",
        message: `Chưa thực hiện đủ vật tư bắt buộc của mốc này (thiếu: ${missing.map((m) => m.name).join(", ")}).`,
      });
    }
  }

  // 5. Kiểm tra trạng thái sinh trưởng bất thường tại vườn cần cán bộ hỗ trợ
  if (!params.senProRule) {
    const lowerState = params.actualTreeState.toLowerCase();
    if (ABNORMAL_STATE_PATTERNS.some((pat) => lowerState.includes(pat))) {
      const isCriticalPhenology =
        params.milestone?.stageCode === "tao-mam" &&
        (lowerState.includes("còn lụa") || lowerState.includes("chưa già"));
      issues.push({
        code: "abnormal_tree_state",
        severity: isCriticalPhenology ? "violation" : "warning",
        message: isCriticalPhenology
          ? `Xiết nước tạo mầm khi lá chưa già hoàn toàn ("${params.actualTreeState}") có nguy cơ suy cây rụng lá.`
          : `Trạng thái vườn ghi nhận dấu hiệu cần lưu ý kỹ thuật: "${params.actualTreeState}".`,
      });
    }
  }

  // 6. Kiểm tra trễ hạn so với khung ngày dự kiến của quy trình
  if (params.dueOn && params.performedOn > params.dueOn) {
    const lateDays = diffIsoDays(params.performedOn, params.dueOn);
    issues.push({
      code: "overdue_execution",
      severity: lateDays >= 5 ? "violation" : "warning",
      message: `Thực hiện trễ ${lateDays} ngày so với hạn mốc quy trình (${formatIsoVn(params.dueOn)}).`,
    });
  }

  const hasViolation = issues.some((i) => i.severity === "violation");
  const hasWarning = issues.some((i) => i.severity === "warning");
  return {
    complianceStatus: hasViolation ? "violation" : hasWarning ? "warning" : "compliant",
    issues,
  };
}

