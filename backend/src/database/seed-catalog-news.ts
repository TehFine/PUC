import type { Pool } from "pg";

interface PesticideSeed {
  name: string;
  activeIngredient: string;
  concentration: string;
  manufacturer: string;
  mrlMgKg: number | null;
  isolationDays: number | null;
  status: "allowed" | "restricted" | "banned";
}

const PESTICIDES_2026: PesticideSeed[] = [
  {
    name: "ABT 2WP (Sinh học Bt + Abamectin)",
    activeIngredient: "Abamectin 9g/kg + Bacillus thuringiensis var. kurstaki 11g/kg",
    concentration: "9 g/kg + 11 g/kg",
    manufacturer: "Viện Bảo vệ thực vật / Sinh học VN",
    mrlMgKg: 0.01,
    isolationDays: 5,
    status: "allowed",
  },
  {
    name: "Trắng xanh WP (Nấm xanh – Nấm trắng)",
    activeIngredient: "Beauveria bassiana 1×10⁹ bào tử/g + Metarhizium anisopliae 0,5×10⁹ bào tử/g",
    concentration: "1,5×10⁹ bào tử/g",
    manufacturer: "Viện Bảo vệ thực vật (PPRI)",
    mrlMgKg: null,
    isolationDays: 3,
    status: "allowed",
  },
  {
    name: "Bitadin WP (Sinh học Bt + Granulosis virus)",
    activeIngredient: "Bacillus thuringiensis var. kurstaki 16.000 IU + Granulosis virus 10⁸ PIB",
    concentration: "16.000 IU + 10⁸ PIB",
    manufacturer: "Viện Bảo vệ thực vật (PPRI)",
    mrlMgKg: null,
    isolationDays: 3,
    status: "allowed",
  },
  {
    name: "Chế phẩm Vi sinh Trichoderma – Bacillus – Streptomyces",
    activeIngredient: "Trichoderma spp. + Bacillus spp. + Streptomyces spp.",
    concentration: "≥ 10⁸ bào tử/g(ml)",
    manufacturer: "Viện Khoa học Nông nghiệp Việt Nam (VAAS)",
    mrlMgKg: null,
    isolationDays: 0,
    status: "allowed",
  },
  {
    name: "Acrobat MZ 90/600 WP",
    activeIngredient: "Dimethomorph 90g/kg + Mancozeb 600g/kg",
    concentration: "90 g/kg + 600 g/kg",
    manufacturer: "BASF",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Agri-Fos 400SL",
    activeIngredient: "Phosphorous acid",
    concentration: "400 g/l",
    manufacturer: "Agrichem (Úc)",
    mrlMgKg: 2.0,
    isolationDays: 7,
    status: "allowed",
  },
  {
    name: "Ridomil Gold 68WG",
    activeIngredient: "Metalaxyl-M 40g/kg + Mancozeb 640g/kg",
    concentration: "40 g/kg + 640 g/kg",
    manufacturer: "Syngenta",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Anvil 5SC (Huivil)",
    activeIngredient: "Hexaconazole ≥ 85%",
    concentration: "50 g/l",
    manufacturer: "Syngenta",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Nativo 750WG",
    activeIngredient: "Trifloxystrobin + Tebuconazole",
    concentration: "750 g/kg",
    manufacturer: "Bayer CropScience",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Antracol 70WP",
    activeIngredient: "Propineb (Metiram complex)",
    concentration: "700 g/kg",
    manufacturer: "Bayer CropScience",
    mrlMgKg: 0.1,
    isolationDays: 10,
    status: "allowed",
  },
  {
    name: "Movento 150OD",
    activeIngredient: "Spirotetramat ≥ 96%",
    concentration: "150 g/l",
    manufacturer: "Bayer CropScience",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Penalty 40WP",
    activeIngredient: "Acetamiprid 20% + Buprofezin 20%",
    concentration: "20% + 20% (400 g/kg)",
    manufacturer: "Nihon Nohyaku / Map Pacific",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Sida 20WP",
    activeIngredient: "Dinotefuran ≥ 89%",
    concentration: "200 g/kg",
    manufacturer: "Mitsui Chemicals / BVTV",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Confidor 200SL + Dầu khoáng SK Enspray 99EC",
    activeIngredient: "Imidacloprid ≥ 96% + Petroleum spray oil",
    concentration: "200 g/l + 99% EC",
    manufacturer: "Bayer / SK Energy",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Ascend 20SP",
    activeIngredient: "Acetamiprid ≥ 97%",
    concentration: "200 g/kg",
    manufacturer: "Nisso / BVTV",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Acnipyram / Nitensuper + Applaud / Butyl",
    activeIngredient: "Nitenpyram + Buprofezin",
    concentration: "500 g/kg",
    manufacturer: "Nihon Nohyaku / BVTV",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Buprofezin 400SC",
    activeIngredient: "Buprofezin",
    concentration: "400 g/l",
    manufacturer: "Map Pacific",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Abamectin 1.8EC",
    activeIngredient: "Abamectin",
    concentration: "1.8%",
    manufacturer: "Syngenta",
    mrlMgKg: 0.01,
    isolationDays: 7,
    status: "allowed",
  },
  {
    name: "Imidacloprid 70WG",
    activeIngredient: "Imidacloprid",
    concentration: "70%",
    manufacturer: "Bayer",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Emamectin 1.9EC",
    activeIngredient: "Emamectin benzoate",
    concentration: "1.9%",
    manufacturer: "Rotam",
    mrlMgKg: 0.02,
    isolationDays: 10,
    status: "allowed",
  },
  {
    name: "Chlorpyrifos 40EC",
    activeIngredient: "Chlorpyrifos",
    concentration: "40%",
    manufacturer: "Dow AgroSciences",
    mrlMgKg: 0.05,
    isolationDays: 21,
    status: "restricted",
  },
  {
    name: "Carbaryl 80WP",
    activeIngredient: "Carbaryl",
    concentration: "80%",
    manufacturer: "Various",
    mrlMgKg: null,
    isolationDays: null,
    status: "banned",
  },
];

interface FertilizerSeed {
  name: string;
  category: "organic" | "npk" | "foliar" | "microbial" | "restricted";
  formula: string;
  manufacturer: string;
  dosage: string;
  applicationMethod: string;
  timing: string;
  status: "encouraged" | "allowed" | "warning";
  imageUrl: string;
  description: string;
}

const FERTILIZERS: FertilizerSeed[] = [
  {
    name: "Phân chuồng hoai mục ủ Vi sinh đối kháng (Trichoderma – Bacillus – Streptomyces)",
    category: "organic",
    formula: "Phân chuồng hoai mục (độ ẩm 50–60%) + Trichoderma spp., Bacillus spp., Streptomyces spp. (≥ 10⁸ bào tử/g)",
    manufacturer: "Quy trình Viện Bảo vệ Thực vật (PPRI 2026)",
    dosage: "Ủ trộn 3 kg chế phẩm vi sinh / 1 tấn phân chuồng hoai mục trước khi bón 7 – 10 ngày",
    applicationMethod: "Bón vào đất vùng rễ theo hình chiếu tán cây hoặc giữa 2 hàng giao tán rồi phủ đất mặt",
    timing: "Trước mùa mưa (tháng 4 đến đầu tháng 5 hàng năm)",
    status: "encouraged",
    imageUrl: "/fertilizers/organic.png",
    description:
      "Quản lý các bệnh hại trong đất, đặc biệt là bệnh xì mủ (Phytophthora palmivora) và vàng lá thối rễ (Phytopythium vexans); áp dụng cho cả vườn chưa có và đang có triệu chứng bệnh.",
  },
  {
    name: "Phân hữu cơ truyền thống kết hợp Nấm rễ Arbuscular Mycorrhizae",
    category: "microbial",
    formula: "Phân chuồng, bò, gà, rơm cỏ khô ủ hoai + Nấm rễ Arbuscular mycorrhizae + Trichoderma, Streptomyces",
    manufacturer: "Quy trình Viện Khoa học Nông nghiệp VN (VAAS 2026)",
    dosage: "50 – 100 kg phân hữu cơ/cây/năm + 100 – 150 g nấm rễ Mycorrhizae/cây/năm",
    applicationMethod: "Bón quanh vùng rễ tơ theo hình chiếu tán cây kết hợp lấp đất giữ ẩm",
    timing: "Sau thu hoạch & đầu mùa mưa",
    status: "encouraged",
    imageUrl: "/fertilizers/humic.png",
    description:
      "Diệt mầm bệnh trong đất, mở rộng hệ thống lông hút cộng sinh và tăng sức đề kháng tự nhiên giúp cây chống chịu bệnh đốm lá (Phomopsis durionis) và thán thư (Colletotrichum siamense).",
  },
  {
    name: "Hữu cơ Vi sinh Đất Mẹ 70% OM",
    category: "organic",
    formula: "Chất hữu cơ: 70% · Axit Humic: 12% · Nấm Trichoderma: 1×10⁶ CFU/g",
    manufacturer: "Công ty CP Nông Nghiệp Xanh Đất Mẹ",
    dosage: "5 – 10 kg/gốc/lần (Tùy tuổi cây)",
    applicationMethod: "Bón gốc theo mép tán lá",
    timing: "Sau thu hoạch & đầu mùa mưa",
    status: "encouraged",
    imageUrl: "/fertilizers/organic.png",
    description:
      "Phân bón hữu cơ vi sinh cao cấp chuyên dùng cho sầu riêng, cung cấp dinh dưỡng thiết yếu và tăng cường hệ vi sinh đất.",
  },
  {
    name: "NPK 12-12-17+TE Gốc Sunfat (Bio-Agri)",
    category: "npk",
    formula: "Đạm (N): 12% · Lân (P₂O₅): 12% · Kali Sunfat (K₂SO₄): 17% · TE (Bo, Mg, Zn)",
    manufacturer: "Bio-Agri Systems International",
    dosage: "0.8 – 1.5 kg/cây/đợt nuôi trái",
    applicationMethod: "Rải đều quanh tán & tưới đẫm nước",
    timing: "Giai đoạn nuôi trái non & thúc trái lớn",
    status: "allowed",
    imageUrl: "/fertilizers/npk.png",
    description:
      "Dinh dưỡng khoáng cân đối 100% gốc Kali Sunfat không chứa Clo, giúp cơm vàng óng, dày cơm và đạt chuẩn xuất khẩu GACC.",
  },
  {
    name: "Phân bón lá Canxi Bo Sữa Bo Amino Kẽm",
    category: "foliar",
    formula: "Canxi (CaO): 12% · Bo hữu hiệu: 35.000 ppm · Kẽm (Zn): 15.000 ppm · Amino Acid: 10%",
    manufacturer: "Agri-Green Nutrition Ltd.",
    dosage: "Pha 750ml cho 400 – 600 lít nước",
    applicationMethod: "Phun ướt đều 2 mặt lá & chùm hoa/trái",
    timing: "Nhú mắt cua, trước xả nhụy & trái non 3-7 tuần",
    status: "allowed",
    imageUrl: "/fertilizers/foliar.png",
    description:
      "Đặc trị rụng hoa, tăng tỷ lệ đậu trái, chống nứt gai, dai cuống và hỗ trợ trái lớn nhanh đồng đều.",
  },
  {
    name: "Gói Axit Humic Đậm Đặc & Trichoderma (Duri-Root)",
    category: "microbial",
    formula: "Axit Humic: 85% · Axit Fulvic: 10% · Kali hữu hiệu: 10% · Trichoderma: 2×10⁹ CFU/g",
    manufacturer: "Duri-Root Bio Sciences",
    dosage: "1 kg pha 500 – 800 lít nước tưới gốc",
    applicationMethod: "Tưới vùng rễ tơ hoặc hòa qua hệ thống nhỏ giọt",
    timing: "Kích rễ đầu vụ & phục hồi sau đợt bệnh",
    status: "encouraged",
    imageUrl: "/fertilizers/humic.png",
    description:
      "Kích rễ phát triển cực mạnh, cải thiện độ phì nhiêu của đất và đối kháng nấm bệnh Phytophthora gây xì mủ.",
  },
  {
    name: "NPK 20-20-15+TE Đầu Trâu Chuyên Đọt",
    category: "npk",
    formula: "Đạm (N): 20% · Lân (P₂O₅): 20% · Kali (K₂O): 15% · Vi lượng Bo, Kẽm, Đồng",
    manufacturer: "Công ty CP Phân bón Bình Điền",
    dosage: "0.5 – 1.0 kg/cây/đợt cơi đọt",
    applicationMethod: "Bón gốc khi đất ẩm sau cơn mưa",
    timing: "Giai đoạn bung cơi đọt & cơi lá mới",
    status: "allowed",
    imageUrl: "/fertilizers/npk.png",
    description:
      "Cung cấp đạm và lân cao giúp cơi đọt bung mập khỏe, phiến lá dày bóng, tăng diện tích quang hợp nuôi cây sung mãn.",
  },
  {
    name: "Kali Clorua (KCl / Muối Ớt Đỏ) — Cảnh báo cấm",
    category: "restricted",
    formula: "Kali (K₂O): 60% · Hàm lượng Clo (Cl⁻): > 45%",
    manufacturer: "Nhập khẩu Belarus / Canada",
    dosage: "0 kg/cây (Tuyệt đối không dùng cho sầu riêng)",
    applicationMethod: "CẤM SỬ DỤNG CHO CÂY SẦU RIÊNG",
    timing: "Nghiêm cấm tuyệt đối ở mọi thời điểm",
    status: "warning",
    imageUrl: "/fertilizers/npk.png",
    description:
      "Hàm lượng Clo cực cao gây sượng múi, nhão cơm, cháy chóp lá và tích tụ muối hại đất; bị cấm trong tiêu chuẩn VietGAP sầu riêng.",
  },
];

interface VarietySeed {
  name: string;
  origin: string;
  weightRange: string;
  harvestYears: string;
  description: string;
  category: "export" | "native" | "premium" | "new";
  status: "allowed" | "encouraged" | "trial";
  fleshColor: string;
  seedRate: string;
  brix: string;
  yieldPerHa: string;
  imageUrl: string;
  marketPotential: string;
  morphology: string[];
  farmingTechniques: {
    density: string;
    pollination: string;
    thinning: string;
    specialNotes: string;
  };
}

const VARIETIES_EXTENDED: VarietySeed[] = [
  {
    name: "Monthong",
    origin: "Thái Lan",
    weightRange: "2.5 – 5.0 kg/trái",
    harvestYears: "115 – 125 ngày (Từ xả nhụy)",
    description:
      "Giống sầu riêng xuất khẩu số 1 sang thị trường Trung Quốc theo Nghị định thư GACC. Trái thon dài, vỏ mỏng vàng đồng, cơm dày vàng ngà, hạt lép trên 85%.",
    category: "export",
    status: "allowed",
    fleshColor: "Vàng ngà (kem sáng)",
    seedRate: "Hạt lép > 85%",
    brix: "32 – 35%",
    yieldPerHa: "18 – 25 tấn/ha",
    imageUrl: "/varieties/monthong.png",
    marketPotential: "Thị trường xuất khẩu chính ngạch ưa chuộng nhất, chiếm 75% kim ngạch sầu riêng Việt Nam",
    morphology: [
      "Quả hình bầu dục hoặc quả lê thon dài, cuống to và cứng cáp",
      "Gai nhọn, dày, mật độ gai phân bố đồng đều từ cuống đến đáy",
      "Vỏ quả mỏng 1.0 – 1.2 cm, chuyển từ xanh sang vàng đồng khi chín",
      "Tỷ lệ cơm đạt 32 – 35% trọng lượng trái, thịt ráo không dính tay",
    ],
    farmingTechniques: {
      density: "8m × 8m hoặc 9m × 9m (120 – 150 cây/ha)",
      pollination: "Bắt buộc thụ phấn nhân tạo bổ sung lúc 18h00 – 20h30 để quả tròn đều 5 hộc",
      thinning: "Tỉa hoa làm 3 đợt, tỉa trái làm 2 đợt; cây 6–8 năm giữ 60–80 quả đều đẹp nhất",
      specialNotes: "Cần bón đủ Canxi-Bo định kỳ, cấm dùng phân Kali đỏ (KCl)",
    },
  },
  {
    name: "Ri 6",
    origin: "Bình Phước – Việt Nam",
    weightRange: "2.0 – 3.8 kg/trái",
    harvestYears: "95 – 105 ngày (Từ xả nhụy)",
    description:
      "Giống sầu riêng bản địa xuất sắc. Quả thuôn tròn đều, cơm vàng óng ánh như tơ, hạt lép 75 – 80%, vị ngọt đậm đà béo thơm đặc trưng.",
    category: "native",
    status: "allowed",
    fleshColor: "Vàng ươm đậm (mỡ gà óng ả)",
    seedRate: "Hạt lép 75 – 80%",
    brix: "34 – 38%",
    yieldPerHa: "16 – 22 tấn/ha",
    imageUrl: "/varieties/ri6.png",
    marketPotential: "Tiêu thụ nội địa cực mạnh và xuất khẩu quả tươi rất được ưa chuộng",
    morphology: [
      "Quả dáng thuôn tròn cân đối, rãnh múi phân định rõ ràng 5 hộc",
      "Gai to, thưa, nở phẳng khi trái đẫy đà chuẩn bị chín",
      "Cơm vàng đậm bóng mịn, dẻo quánh, hạt lép nhiều, khô ráo",
    ],
    farmingTechniques: {
      density: "8m × 8m (150 cây/ha), cây phát triển tán dù phân cành thấp",
      pollination: "Thụ phấn nhân tạo giúp đậu đều 5 hộc, hạn chế rụng sinh lý",
      thinning: "Tỉa bớt cành tăm, giữ chùm hoa ở vị trí 1/3 cành tính từ thân chính ra",
      specialNotes: "Dễ bị sượng nước nếu thừa đạm lúc quả lớn; tuyệt đối không dùng phân Kali đỏ (KCl)",
    },
  },
  {
    name: "Musang King",
    origin: "Malaysia",
    weightRange: "1.5 – 3.0 kg/trái",
    harvestYears: "105 – 115 ngày (Từ xả nhụy)",
    description:
      "Được mệnh danh là 'Vua của các loại sầu riêng' với giá trị kinh tế thương phẩm cao nhất thế giới. Cơm màu vàng nghệ rực rỡ, hậu vị đắng nhẹ tinh tế.",
    category: "premium",
    status: "encouraged",
    fleshColor: "Vàng nghệ đậm (đặc trưng)",
    seedRate: "Hạt lép dẹp 90 – 95%",
    brix: "38 – 42%",
    yieldPerHa: "14 – 18 tấn/ha",
    imageUrl: "/varieties/musangking.png",
    marketPotential: "Phân khúc siêu cao cấp, giá bán cao gấp 2 – 3 lần sầu riêng thông thường",
    morphology: [
      "Đáy quả có biểu tượng ngôi sao 5 cánh màu nâu phẳng rõ rệt",
      "Gai hình kim tự tháp dẹt, tương đối phẳng và cách xa nhau",
      "Hạt cực nhỏ, dẹt như lá bài; tỷ lệ cơm sử dụng đạt trên 90%",
    ],
    farmingTechniques: {
      density: "9m × 9m (120 cây/ha); cây ưa độ ẩm nhưng cực kỳ kỵ úng nước",
      pollination: "Bắt buộc thụ phấn chéo bằng phấn hoa Ri6 hoặc Monthong để tăng tỷ lệ đậu trái",
      thinning: "Chỉ giữ quả dạng cân đối, loại bỏ sớm các quả có rãnh méo",
      specialNotes: "Thích hợp thu hoạch khi trái chín ở độ già trên 90%",
    },
  },
  {
    name: "Dona (Ri 7)",
    origin: "Tiền Giang – Việt Nam",
    weightRange: "2.5 – 4.5 kg/trái",
    harvestYears: "110 – 120 ngày (Từ xả nhụy)",
    description: "Mới được cấp mã số vùng trồng, sinh trưởng khỏe trên đất đỏ bazan Đắk Lắk, cơm ráo dày múi.",
    category: "export",
    status: "allowed",
    fleshColor: "Vàng sáng",
    seedRate: "Hạt lép > 85%",
    brix: "32 – 35%",
    yieldPerHa: "18 – 24 tấn/ha",
    imageUrl: "/varieties/monthong.png",
    marketPotential: "Giống xuất khẩu chủ lực tại Tây Nguyên",
    morphology: [
      "Quả thon dài cân đối, vỏ mỏng dễ tách hộc",
      "Cơm vàng sáng, khô ráo, bảo quản lạnh dài ngày không xuống màu",
    ],
    farmingTechniques: {
      density: "8m × 8m (150 cây/ha)",
      pollination: "Thụ phấn bổ sung ban đêm giúp trái tròn đều",
      thinning: "Tuyển giữ 50 – 70 trái/cây trưởng thành",
      specialNotes: "Bón cân đối Kali Sunfat và Canxi-Bo giai đoạn nuôi trái",
    },
  },
  {
    name: "Black Thorn (D200 - Gai Đen)",
    origin: "Malaysia (Vùng Penang)",
    weightRange: "1.8 – 3.5 kg/trái",
    harvestYears: "100 – 110 ngày (Từ xả nhụy)",
    description:
      "Giống sầu riêng quý hiếm đỉnh cao đang được nhân rộng tại Việt Nam. Điểm nhận diện là chóp gai có màu nâu đen và đáy lõm tròn, cơm màu đỏ cam bắt mắt.",
    category: "new",
    status: "encouraged",
    fleshColor: "Cam đỏ đậm (hồng điều bắt mắt)",
    seedRate: "Hạt lép 80 – 85%",
    brix: "36 – 40%",
    yieldPerHa: "15 – 20 tấn/ha",
    imageUrl: "/varieties/blackthorn.png",
    marketPotential: "Xu hướng tiêu dùng cao cấp mới, được thị trường Trung Quốc và Singapore săn đón",
    morphology: [
      "Quả hình tròn đều như trái banh, đầu các chóp gai có màu sẫm đen",
      "Đáy quả có một điểm lõm tròn màu đen đặc trưng (Black Thorn)",
      "Múi thịt dày, màu sắc từ cam nhạt đến cam đỏ sậm óng ả",
    ],
    farmingTechniques: {
      density: "8m × 8m hoặc 8m × 9m; sinh trưởng khỏe, cành tán vươn rộng",
      pollination: "Cần kết hợp thụ phấn chéo để quả tròn đều và múi phân bố 5 hộc đầy",
      thinning: "Tỉa chồi vượt thường xuyên, tạo tán thông thoáng hạn chế nấm Phytophthora",
      specialNotes: "Vỏ mỏng nên cần bón bổ sung Kali Sunfat và Silic hữu cơ trước thu hoạch 30 ngày",
    },
  },
];

const NEWS_SEED = [
  {
    slug: "doan-chi-cuc-tham-vuon",
    category: "visit",
    title: "Đoàn công tác Chi cục Trồng trọt & BVTV Đắk Lắk về thăm, đánh giá vùng trồng Krông Búk",
    excerpt:
      "Sáng ngày 26/10, đoàn kiểm tra liên ngành đã trực tiếp về khảo sát thực địa tại Thôn 1 và Thôn 2. Đoàn đánh giá cao nỗ lực ghi nhật ký điện tử và việc bà con tuân thủ nghiêm ngặt danh mục hoạt chất an toàn.",
    publishedOn: "2026-10-26",
    readTime: "4 phút đọc",
    author: "Ban Kỹ thuật & Truyền thông HTX",
    imageUrl: "/landing/news-field-visit.jpg",
    imageAlt: "Đoàn cán bộ và ban giám đốc HTX cùng bà con kiểm tra cây sầu riêng tại vườn Krông Búk",
    featured: true,
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
    slug: "tap-huan-tia-canh-lam-bong",
    category: "training",
    title: "Lịch tập huấn thực địa: Hướng dẫn tỉa cành, làm bông và thụ phấn bổ sung vụ 2026–2027",
    excerpt:
      "Chương trình tập huấn cầm tay chỉ việc tại vườn mẫu Thôn 3, do thạc sĩ nông nghiệp hướng dẫn trực tiếp về kỹ thuật tỉa chồi vượt, xiết nước tạo mầm và thụ phấn ban đêm giúp trái tròn đều.",
    publishedOn: "2026-10-24",
    readTime: "3 phút đọc",
    author: "Tổ Khuyến nông HTX",
    imageUrl: "/landing/news-training.jpg",
    imageAlt: "Kỹ sư nông nghiệp hướng dẫn bà con nông dân thao tác tỉa cành sầu riêng tại vườn",
    featured: false,
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
    slug: "canh-bao-sau-benh-mua-mua",
    category: "protection",
    title: "Quản lý tổng hợp (IPM) bệnh xì mủ, héo ngọn và sâu hại sầu riêng theo tiêu chuẩn VietGAP 2026",
    excerpt:
      "Hướng dẫn mới nhất của Viện Bảo vệ Thực vật (2026) về nhận diện 10 bệnh hại, 21 loài sâu hại tại Đắk Lắk và phác đồ kết hợp chế phẩm sinh học với thuốc hóa học theo nguyên tắc 4 đúng.",
    publishedOn: "2026-10-21",
    readTime: "6 phút đọc",
    author: "Tổ Bảo vệ Thực vật HTX Cư Né",
    imageUrl: "/landing/news-protection.jpg",
    imageAlt: "Bà con kiểm tra kỹ lưỡng mặt dưới của lá sầu riêng để phát hiện sớm mầm nấm bệnh",
    featured: false,
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
    slug: "quy-trinh-bon-phan-can-doi",
    category: "farming",
    title: "Quy trình ủ phân chuồng vi sinh đối kháng, cắt tỉa và vệ sinh vườn sầu riêng chuẩn VietGAP 2026",
    excerpt:
      "Hướng dẫn chi tiết kỹ thuật ủ phân chuồng hoai mục ở độ ẩm 50–60% với nấm đối kháng Trichoderma – Bacillus – Streptomyces, kết hợp nấm rễ Mycorrhizae và lịch cắt tỉa tạo tán theo tháng.",
    publishedOn: "2026-10-18",
    readTime: "5 phút đọc",
    author: "KS. Nguyễn Thành Long – HTX Cư Né",
    imageUrl: "/landing/durian-tree.jpg",
    imageAlt: "Cây sầu riêng trĩu quả xanh mướt trên nền đất đỏ giàu dinh dưỡng hữu cơ",
    featured: false,
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

export async function seedCatalogAndNews(pool: Pool, options?: { log?: (msg: string) => void }): Promise<void> {
  const log = options?.log ?? (() => undefined);

  for (const p of PESTICIDES_2026) {
    await pool.query(
      `INSERT INTO pesticides
         (name, active_ingredient, concentration, manufacturer, mrl_mg_kg, isolation_days, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         active_ingredient = EXCLUDED.active_ingredient,
         concentration = EXCLUDED.concentration,
         manufacturer = EXCLUDED.manufacturer,
         mrl_mg_kg = EXCLUDED.mrl_mg_kg,
         isolation_days = EXCLUDED.isolation_days,
         status = EXCLUDED.status`,
      [
        p.name,
        p.activeIngredient,
        p.concentration,
        p.manufacturer,
        p.mrlMgKg,
        p.isolationDays,
        p.status,
      ],
    );
  }

  for (const f of FERTILIZERS) {
    await pool.query(
      `INSERT INTO fertilizers
         (name, category, formula, manufacturer, dosage, application_method, timing, status, image_url, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (name) DO UPDATE SET
         category = EXCLUDED.category,
         formula = EXCLUDED.formula,
         manufacturer = EXCLUDED.manufacturer,
         dosage = EXCLUDED.dosage,
         application_method = EXCLUDED.application_method,
         timing = EXCLUDED.timing,
         status = EXCLUDED.status,
         image_url = EXCLUDED.image_url,
         description = EXCLUDED.description`,
      [
        f.name,
        f.category,
        f.formula,
        f.manufacturer,
        f.dosage,
        f.applicationMethod,
        f.timing,
        f.status,
        f.imageUrl,
        f.description,
      ],
    );
  }

  for (const v of VARIETIES_EXTENDED) {
    await pool.query(
      `INSERT INTO varieties
         (name, origin, weight_range, harvest_years, description, category, status,
          flesh_color, seed_rate, brix, yield_per_ha, image_url, market_potential,
          morphology, farming_techniques)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
       ON CONFLICT (name) DO UPDATE SET
         category = COALESCE(varieties.category, EXCLUDED.category),
         status = COALESCE(varieties.status, EXCLUDED.status),
         flesh_color = COALESCE(varieties.flesh_color, EXCLUDED.flesh_color),
         seed_rate = COALESCE(varieties.seed_rate, EXCLUDED.seed_rate),
         brix = COALESCE(varieties.brix, EXCLUDED.brix),
         yield_per_ha = COALESCE(varieties.yield_per_ha, EXCLUDED.yield_per_ha),
         image_url = COALESCE(varieties.image_url, EXCLUDED.image_url),
         market_potential = COALESCE(varieties.market_potential, EXCLUDED.market_potential),
         morphology = COALESCE(varieties.morphology, EXCLUDED.morphology),
         farming_techniques = COALESCE(varieties.farming_techniques, EXCLUDED.farming_techniques)`,
      [
        v.name,
        v.origin,
        v.weightRange,
        v.harvestYears,
        v.description,
        v.category,
        v.status,
        v.fleshColor,
        v.seedRate,
        v.brix,
        v.yieldPerHa,
        v.imageUrl,
        v.marketPotential,
        JSON.stringify(v.morphology),
        JSON.stringify(v.farmingTechniques),
      ],
    );
  }

  for (const n of NEWS_SEED) {
    await pool.query(
      `INSERT INTO news_articles
         (slug, category, title, excerpt, content, author, image_url, image_alt,
          read_time, featured, status, published_on)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, 'published', $11)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         excerpt = EXCLUDED.excerpt,
         content = EXCLUDED.content,
         author = EXCLUDED.author,
         read_time = EXCLUDED.read_time`,
      [
        n.slug,
        n.category,
        n.title,
        n.excerpt,
        JSON.stringify(n.content),
        n.author,
        n.imageUrl,
        n.imageAlt,
        n.readTime,
        n.featured,
        n.publishedOn,
      ],
    );
  }

  log("✔ Đã nạp dữ liệu thuốc BVTV 2026, phân bón, giống mở rộng và bản tin mẫu.");
}
