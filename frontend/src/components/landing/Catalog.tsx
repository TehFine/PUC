"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { lockRootScroll } from "@/lib/scroll-lock";
import { STAGES } from "./data";
import {
  usePublic,
  type PublicCatalog,
  type PublicFertilizer,
  type PublicPesticide,
  type PublicVariety,
} from "./use-public";

type GuidanceTab = "allowed" | "banned" | "fertilizers" | "advisory" | "varieties";

interface CatalogCardItem {
  id: string;
  title: string;
  subtitle: string;
  imageSrc: string;
  imageAlt?: string;
  drawerObjectPosition?: string;
  imageFit: "studio-jpg" | "studio-png" | "photo";
  categoryLabel: string;
  eyebrow: string;
  fullTitle: string;
  lead: string;
  specs: Array<{ label: string; value: string }>;
  guidelinesTitle: string;
  guidelines: string[];
  callout?: {
    label: string;
    text: string;
  };
}

const TAB_CONFIG: Array<{
  id: GuidanceTab;
  label: string;
  heading: string;
}> = [
  {
    id: "allowed",
    label: "Được phép",
    heading: "Danh mục thuốc BVTV được phép",
  },
  {
    id: "banned",
    label: "Chất cấm",
    heading: "Chất cấm & kiểm soát nghiêm ngặt",
  },
  {
    id: "fertilizers",
    label: "Phân bón",
    heading: "Phân bón & chế phẩm vi sinh",
  },
  {
    id: "advisory",
    label: "Mùa vụ",
    heading: "Quy trình chăm sóc 07 giai đoạn",
  },
  {
    id: "varieties",
    label: "Giống cây",
    heading: "Giống sầu riêng chủ lực",
  },
];

/* ─── Dữ liệu dự phòng đồng bộ cơ sở dữ liệu khi mạng chậm / ngoại tuyến ─── */
const FALLBACK_PESTICIDES: PublicPesticide[] = [
  {
    name: "ABT 2WP (Sinh học Bt + Abamectin)",
    activeIngredient: "Abamectin 9g/kg + Bacillus thuringiensis 11g/kg",
    concentration: "9 g/kg + 11 g/kg",
    manufacturer: "Viện Bảo vệ thực vật",
    mrlMgKg: 0.01,
    isolationDays: 5,
    status: "allowed",
  },
  {
    name: "Chế phẩm Vi sinh Trichoderma – Bacillus",
    activeIngredient: "Trichoderma spp. + Bacillus spp. + Streptomyces spp.",
    concentration: "≥ 10⁸ bào tử/g",
    manufacturer: "Viện Khoa học Nông nghiệp VN (VAAS)",
    mrlMgKg: null,
    isolationDays: 0,
    status: "allowed",
  },
  {
    name: "Agri-Fos 400SL",
    activeIngredient: "Phosphorous acid",
    concentration: "400 g/l",
    manufacturer: "Agrichem",
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
    name: "Movento 150OD",
    activeIngredient: "Spirotetramat ≥ 96%",
    concentration: "150 g/l",
    manufacturer: "Bayer CropScience",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Dầu khoáng SK Enspray 99EC",
    activeIngredient: "Petroleum spray oil + Imidacloprid",
    concentration: "99% EC",
    manufacturer: "SK Energy / Bayer",
    mrlMgKg: 0.05,
    isolationDays: 14,
    status: "allowed",
  },
  {
    name: "Trắng xanh WP (Nấm xanh – Nấm trắng)",
    activeIngredient: "Beauveria bassiana + Metarhizium anisopliae",
    concentration: "1,5×10⁹ bào tử/g",
    manufacturer: "Viện Bảo vệ thực vật (PPRI)",
    mrlMgKg: null,
    isolationDays: 3,
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
    name: "Anvil 5SC",
    activeIngredient: "Hexaconazole ≥ 85%",
    concentration: "50 g/l",
    manufacturer: "Syngenta",
    mrlMgKg: 0.05,
    isolationDays: 14,
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
    name: "Antracol 70WP",
    activeIngredient: "Propineb (Metiram complex)",
    concentration: "700 g/kg",
    manufacturer: "Bayer CropScience",
    mrlMgKg: 0.1,
    isolationDays: 10,
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
    manufacturer: "Danh mục cấm BVTV",
    mrlMgKg: null,
    isolationDays: null,
    status: "banned",
  },
];

const FALLBACK_FERTILIZERS: PublicFertilizer[] = [
  {
    name: "Phân chuồng hoai mục ủ Vi sinh đối kháng",
    category: "organic",
    formula: "Phân chuồng hoai mục + Trichoderma, Bacillus, Streptomyces (≥ 10⁸ bào tử/g)",
    manufacturer: "Quy trình Viện Bảo vệ Thực vật (PPRI)",
    dosage: "Ủ trộn 3 kg chế phẩm vi sinh / 1 tấn phân chuồng trước khi bón 7–10 ngày",
    applicationMethod: "Bón vùng rễ theo hình chiếu tán cây và phủ đất mặt giữ ẩm",
    timing: "Trước mùa mưa (tháng 4 – đầu tháng 5)",
    status: "encouraged",
    imageUrl: "/fertilizers/organic.png",
    description:
      "Quản lý nấm bệnh trong đất, đặc biệt là xì mủ thân (Phytophthora palmivora) và vàng lá thối rễ trên vườn sầu riêng.",
  },
  {
    name: "Hữu cơ kết hợp Nấm rễ Mycorrhizae",
    category: "microbial",
    formula: "Hữu cơ ủ hoai + Arbuscular mycorrhizae + Trichoderma, Streptomyces",
    manufacturer: "Viện Khoa học Nông nghiệp VN (VAAS)",
    dosage: "50 – 100 kg hữu cơ/cây/năm + 100 – 150 g nấm rễ Mycorrhizae/cây",
    applicationMethod: "Bón quanh vùng rễ tơ theo mép tán kết hợp lấp đất giữ ẩm",
    timing: "Sau thu hoạch & đầu mùa mưa",
    status: "encouraged",
    imageUrl: "/pesticides/cat-microbial-jar.jpg",
    description:
      "Mở rộng hệ lông hút cộng sinh, phục hồi bộ rễ tơ và nâng sức đề kháng tự nhiên chống đốm lá, thán thư.",
  },
  {
    name: "NPK 12-12-17+TE Gốc Sunfat",
    category: "npk",
    formula: "Đạm 12% · Lân 12% · Kali Sunfat (K₂SO₄) 17% · Vi lượng Bo, Mg, Zn",
    manufacturer: "Bio-Agri Systems",
    dosage: "0.8 – 1.5 kg/cây/đợt nuôi trái",
    applicationMethod: "Rải đều quanh hình chiếu tán và tưới đẫm nước",
    timing: "Giai đoạn nuôi trái non & thúc trái lớn",
    status: "allowed",
    imageUrl: "/fertilizers/npk.png",
    description:
      "Dinh dưỡng khoáng cân đối 100% gốc Kali Sunfat không chứa Clo, giúp cơm vàng ráo, dày múi và đạt chuẩn xuất khẩu GACC.",
  },
  {
    name: "Phân bón lá Canxi Bo Amino Kẽm",
    category: "foliar",
    formula: "Canxi (CaO) 12% · Bo hữu hiệu 35.000 ppm · Kẽm 15.000 ppm · Amino 10%",
    manufacturer: "Agri-Green Nutrition",
    dosage: "Pha 750 ml cho 400 – 600 lít nước",
    applicationMethod: "Phun ướt đều 2 mặt lá và chùm hoa / trái non",
    timing: "Nhú mắt cua, trước xả nhụy & trái non 3–7 tuần",
    status: "allowed",
    imageUrl: "/fertilizers/foliar.png",
    description:
      "Tăng sức sống hạt phấn, hạn chế rụng hoa và trái non sinh lý, chống nứt gai và giữ cuống dẻo dai.",
  },
  {
    name: "Axit Humic Đậm Đặc & Trichoderma",
    category: "microbial",
    formula: "Axit Humic 85% · Axit Fulvic 10% · Kali 10% · Trichoderma 2×10⁹ CFU/g",
    manufacturer: "Duri-Root Bio Sciences",
    dosage: "1 kg pha 500 – 800 lít nước tưới gốc",
    applicationMethod: "Tưới vùng rễ tơ hoặc hòa qua hệ thống tưới nhỏ giọt",
    timing: "Kích rễ đầu vụ & phục hồi sau thu hoạch",
    status: "encouraged",
    imageUrl: "/fertilizers/humic.png",
    description:
      "Kích thích ra rễ tơ mạnh, giải độc phèn hữu cơ, cải thiện độ tơi xốp đất bazan và ức chế nấm gây thối rễ.",
  },
  {
    name: "Hữu cơ Vi sinh Đất Mẹ 70% OM",
    category: "organic",
    formula: "Chất hữu cơ 70% · Axit Humic 12% · Trichoderma 1×10⁶ CFU/g",
    manufacturer: "Nông Nghiệp Xanh Đất Mẹ",
    dosage: "5 – 10 kg/gốc/lần tùy tuổi cây",
    applicationMethod: "Bón gốc theo rãnh chiếu mép tán lá",
    timing: "Sau thu hoạch & dưỡng cơi đọt",
    status: "encouraged",
    imageUrl: "/pesticides/cat-bio-wp.jpg",
    description:
      "Cung cấp nền hữu cơ bền vững cho đất đỏ Krông Búk, kiểm soát an toàn kim loại nặng Cadimi từ nguồn đầu vào.",
  },
];

const FALLBACK_VARIETIES: PublicVariety[] = [
  {
    name: "Monthong",
    origin: "Thái Lan",
    weightRange: "2.5 – 5.0 kg/trái",
    harvestYears: "115 – 125 ngày từ xả nhụy",
    description:
      "Giống sầu riêng chủ lực xuất khẩu chính ngạch GACC. Trái thon dài cân đối, vỏ mỏng vàng đồng, cơm dày vàng ngà khô ráo, tỷ lệ hạt lép trên 85%.",
    fleshColor: "Vàng ngà kem sáng",
    brix: "32 – 35%",
    yieldPerHa: "18 – 25 tấn/ha",
    imageUrl: "/varieties/monthong.png",
  },
  {
    name: "Ri 6",
    origin: "Việt Nam",
    weightRange: "2.0 – 3.8 kg/trái",
    harvestYears: "95 – 105 ngày từ xả nhụy",
    description:
      "Giống sầu riêng bản địa nổi tiếng thích nghi tốt trên đất đỏ bazan Cư Né. Quả thuôn tròn 5 hộc rõ, cơm vàng ươm dẻo béo, hương thơm đậm đặc trưng.",
    fleshColor: "Vàng ươm đậm",
    brix: "34 – 38%",
    yieldPerHa: "16 – 22 tấn/ha",
    imageUrl: "/varieties/ri6.png",
  },
  {
    name: "Musang King",
    origin: "Malaysia",
    weightRange: "1.5 – 3.0 kg/trái",
    harvestYears: "105 – 115 ngày từ xả nhụy",
    description:
      "Phân khúc sầu riêng cao cấp với đáy quả hình sao 5 cánh đặc trưng. Cơm màu vàng nghệ đậm, mịn không xơ, hạt dẹt nhỏ và hậu vị béo đắng nhẹ tinh tế.",
    fleshColor: "Vàng nghệ đậm",
    brix: "38 – 42%",
    yieldPerHa: "14 – 18 tấn/ha",
    imageUrl: "/varieties/musangking.png",
  },
  {
    name: "Black Thorn (Gai Đen)",
    origin: "Malaysia",
    weightRange: "1.8 – 2.8 kg/trái",
    harvestYears: "110 – 120 ngày từ xả nhụy",
    description:
      "Giống sầu riêng đặc sản giá trị cao đang khảo nghiệm tại vùng trồng Đắk Lắk. Quả tròn đều, đầu gai sẫm màu, cơm vàng cam mịn dẻo, độ ngọt rất cao.",
    fleshColor: "Vàng cam rực",
    brix: "36 – 40%",
    yieldPerHa: "12 – 16 tấn/ha",
    imageUrl: "/varieties/blackthorn.png",
  },
];

const STAGE_PHOTOS: Record<
  string,
  { src: string; alt: string; drawerPos: string }
> = {
  dat: {
    src: "/stages/stage-01-dat.jpg",
    alt: "Kỹ thuật viên lấy mẫu kiểm tra độ pH đất đỏ bazan trên khu vườn đã lên mô cao và đào mương thoát nước trước khi trồng",
    drawerPos: "center 58%",
  },
  giong: {
    src: "/stages/stage-02-giong.jpg",
    alt: "Cây giống sầu riêng ghép khỏe mạnh trồng trên mô đất đỏ bazan có cọc tre cố định, lưới che nắng và tủ rơm giữ ẩm gốc",
    drawerPos: "center 56%",
  },
  phan: {
    src: "/stages/stage-03-phan.jpg",
    alt: "Nhà vườn bón phân hữu cơ ủ hoai vi sinh theo rãnh tròn chiếu mép tán quanh gốc sầu riêng",
    drawerPos: "center 68%",
  },
  nuoc: {
    src: "/stages/stage-04-nuoc.jpg",
    alt: "Chùm nụ mắt cua và hoa sầu riêng bung nở dưới cành gỗ lớn cùng hệ thống béc tưới giữ ẩm đều dưới gốc",
    drawerPos: "center 46%",
  },
  "sau-benh": {
    src: "/stages/stage-05-sau-benh.jpg",
    alt: "Cán bộ kỹ thuật dùng kính lúp kiểm tra mặt dưới lá và nhà vườn tỉa cành tạo độ thông thoáng phòng trừ sâu bệnh IPM",
    drawerPos: "center 48%",
  },
  "thu-hoach": {
    src: "/stages/stage-06-thu-hoach.jpg",
    alt: "Thu hoạch sầu riêng đúng độ chín bằng kéo sạch và xếp trái vào sọt nhựa lót xốp trên bạt sạch gắn phiếu mã lô tại vườn",
    drawerPos: "center 54%",
  },
  "sau-thu": {
    src: "/stages/stage-07-sau-thu.jpg",
    alt: "Phân loại sầu riêng tại cơ sở đóng gói đạt chuẩn, gắn tem mã QR truy xuất lên cuống trái và đóng thùng xuất khẩu",
    drawerPos: "center 46%",
  },
};

const STUDIO_POOL: Array<{ src: string; fit: "studio-jpg" | "studio-png" }> = [
  { src: "/pesticides/cat-bio-wp.jpg", fit: "studio-jpg" },
  { src: "/pesticides/cat-microbial-jar.jpg", fit: "studio-jpg" },
  { src: "/pesticides/cat-phosphonate-sl.jpg", fit: "studio-jpg" },
  { src: "/pesticides/cat-fungicide-wg.jpg", fit: "studio-jpg" },
  { src: "/pesticides/cat-systemic-od.jpg", fit: "studio-jpg" },
  { src: "/pesticides/cat-mineral-oil.jpg", fit: "studio-jpg" },
  { src: "/pesticides/green.png", fit: "studio-png" },
  { src: "/pesticides/blue.png", fit: "studio-png" },
];

function pickAllowedVisual(
  item: PublicPesticide,
  index: number,
  prevSrc: string,
): { src: string; fit: "studio-jpg" | "studio-png" } {
  const hay = `${item.name} ${item.activeIngredient}`.toLowerCase();
  let candidate: { src: string; fit: "studio-jpg" | "studio-png" };

  if (item.status === "restricted") {
    candidate = { src: "/pesticides/amber.png", fit: "studio-png" };
  } else if (hay.includes("trichoderma") || hay.includes("streptomyces") || hay.includes("vi sinh")) {
    candidate = { src: "/pesticides/cat-microbial-jar.jpg", fit: "studio-jpg" };
  } else if (hay.includes("agri-fos") || hay.includes("phosphorous") || hay.includes("400sl")) {
    candidate = { src: "/pesticides/cat-phosphonate-sl.jpg", fit: "studio-jpg" };
  } else if (hay.includes("enspray") || hay.includes("dầu khoáng") || hay.includes("99ec")) {
    candidate = { src: "/pesticides/cat-mineral-oil.jpg", fit: "studio-jpg" };
  } else if (hay.includes("movento") || hay.includes("150od") || hay.includes("spirotetramat")) {
    candidate = { src: "/pesticides/cat-systemic-od.jpg", fit: "studio-jpg" };
  } else if (hay.includes("sinh học") || hay.includes("beauveria") || hay.includes("kurstaki")) {
    candidate =
      index % 2 === 0
        ? { src: "/pesticides/cat-bio-wp.jpg", fit: "studio-jpg" }
        : { src: "/pesticides/green.png", fit: "studio-png" };
  } else if (hay.includes("wg") || hay.includes("mancozeb") || hay.includes("propineb")) {
    candidate = { src: "/pesticides/cat-fungicide-wg.jpg", fit: "studio-jpg" };
  } else if (hay.includes("sc") || hay.includes("hexaconazole")) {
    candidate = { src: "/pesticides/blue.png", fit: "studio-png" };
  } else {
    candidate = STUDIO_POOL[index % STUDIO_POOL.length];
  }

  if (candidate.src === prevSrc) {
    const alt = STUDIO_POOL[(index + 1) % STUDIO_POOL.length];
    if (alt.src !== prevSrc) return alt;
  }
  return candidate;
}

function shouldSkipImageOpt(src: string): boolean {
  return src.startsWith("/api/") || /^https?:\/\//i.test(src);
}

function isInstantScrollPreferred(): boolean {
  return (
    typeof window !== "undefined" &&
    (document.documentElement.dataset.perf === "lite" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

function shortenTitle(raw: string): string {
  return raw
    .replace(/\s*\(Sinh học[^)]*\)/i, " Sinh học")
    .replace(/\s*\(Nấm xanh[^)]*\)/i, "")
    .replace(/\s*—\s*Cảnh báo cấm/i, "")
    .trim();
}

export default function Catalog() {
  const { data } = usePublic<PublicCatalog>("catalog");
  const [tab, setTab] = useState<GuidanceTab>("allowed");
  const [drawerIndex, setDrawerIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const tabbarRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const progressThumbRef = useRef<HTMLSpanElement | null>(null);
  const scrollRafRef = useRef(0);
  const dragRef = useRef({
    down: false,
    startX: 0,
    startScroll: 0,
    moved: false,
  });

  const handleSelectTab = useCallback((nextTab: GuidanceTab, btn?: HTMLButtonElement | null) => {
    setTab(nextTab);
    setDrawerIndex(null);
    if (stripRef.current) {
      stripRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
    const bar = tabbarRef.current;
    if (!bar || !btn || bar.scrollWidth <= bar.clientWidth) return;
    const targetLeft = btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      if (hash === "#quy-trinh") {
        setTab("advisory");
        setDrawerIndex(null);
      } else if (hash === "#tieu-chuan") {
        setTab("banned");
        setDrawerIndex(null);
      }
    };
    syncFromHash();

    const handleSwitch = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const detail = custom.detail;
      setDrawerIndex(null);
      if (detail === "pesticides" || detail === "allowed") setTab("allowed");
      else if (detail === "banned") setTab("banned");
      else if (detail === "fertilizers") setTab("fertilizers");
      else if (detail === "advisory" || detail === "stages") setTab("advisory");
      else if (detail === "varieties" || detail === "training") setTab("varieties");
    };

    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("lp:catalog-tab", handleSwitch);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("lp:catalog-tab", handleSwitch);
    };
  }, []);

  /* ─── Chuyển đổi dữ liệu từng chuyên mục sang thẻ hình vuông đồng nhất ─── */
  const allTabItems = useMemo<Record<GuidanceTab, CatalogCardItem[]>>(() => {
    const rawPesticides =
      data?.pesticides && data.pesticides.length > 0 ? data.pesticides : FALLBACK_PESTICIDES;
    const rawFertilizers =
      data?.fertilizers && data.fertilizers.length > 0 ? data.fertilizers : FALLBACK_FERTILIZERS;
    const rawVarieties =
      data?.varieties && data.varieties.length > 0 ? data.varieties : FALLBACK_VARIETIES;

    // 1. Được phép & Hạn chế
    const allowedList: CatalogCardItem[] = [];
    let prevAllowedSrc = "";
    rawPesticides
      .filter((p) => p.status !== "banned")
      .forEach((p, idx) => {
        const vis = pickAllowedVisual(p, idx, prevAllowedSrc);
        prevAllowedSrc = vis.src;
        const isoText =
          p.isolationDays === 0
            ? "Không cần cách ly"
            : p.isolationDays
              ? `Cách ly ${p.isolationDays} ngày`
              : "Theo nhãn hướng dẫn";
        const isRestricted = p.status === "restricted";

        allowedList.push({
          id: `allow-${p.name}-${idx}`,
          title: shortenTitle(p.name),
          subtitle: `${isoText} · ${p.activeIngredient}`,
          imageSrc: vis.src,
          imageFit: vis.fit,
          categoryLabel: "Thuốc BVTV được phép",
          eyebrow: isRestricted
            ? "Danh mục kiểm soát hạn chế · Bắt buộc hỏi kỹ thuật viên trước khi phun"
            : "Danh mục được phép sử dụng trên sầu riêng xuất khẩu",
          fullTitle: p.name,
          lead: `Hoạt chất chính: ${p.activeIngredient}. Chỉ sử dụng đúng liều khuyến cáo khi dịch hại tới ngưỡng phòng trừ và ghi đầy đủ vào nhật ký điện tử của thửa vườn.`,
          specs: [
            {
              label: "Tình trạng pháp lý",
              value: isRestricted ? "Hạn chế sử dụng" : "Được phép sử dụng",
            },
            {
              label: "Thời gian cách ly (PHI)",
              value:
                p.isolationDays === 0
                  ? "0 ngày (Sinh học an toàn)"
                  : p.isolationDays
                    ? `Tối thiểu ${p.isolationDays} ngày trước thu hoạch`
                    : "Theo hướng dẫn trên bao bì",
            },
            {
              label: "Giới hạn dư lượng (MRL)",
              value: p.mrlMgKg ? `≤ ${p.mrlMgKg} mg/kg` : "Miễn trừ dư lượng sinh học",
            },
            {
              label: "Hàm lượng / Đơn vị",
              value: [p.concentration, p.manufacturer].filter(Boolean).join(" · ") || "Chuẩn đăng ký BVTV",
            },
          ],
          guidelinesTitle: "Nguyên tắc 4 đúng khi phun tại vườn",
          guidelines: [
            "Mua vật tư tại đại lý có giấy phép, giữ lại hóa đơn và vỏ bao bì đúng nơi quy định.",
            "Không tự ý tăng nồng độ hoặc phối trộn nhiều hoạt chất hóa học cùng lúc gây nóng bông, rụng trái.",
            p.isolationDays
              ? `Ngừng phun hoàn toàn tối thiểu ${p.isolationDays} ngày trước ngày dự kiến cắt trái để đảm bảo dưới ngưỡng MRL.`
              : "Ưu tiên phun vào sáng sớm hoặc chiều mát để bảo vệ hệ vi sinh vật có ích trong vườn.",
          ],
          callout: {
            label: "Ghi chép nhật ký bắt buộc",
            text: "Ghi rõ tên thương phẩm, ngày phun, liều pha và mã thửa trên ứng dụng HTX để hệ thống tự động tính ngày cách ly an toàn.",
          },
        });
      });

    // 2. Chất cấm & Kiểm soát nghiêm ngặt
    const bannedList: CatalogCardItem[] = [
      {
        id: "ban-auramine-o",
        title: "Vàng O (Auramine O)",
        subtitle: "Cấm tuyệt đối · Thuốc nhuộm công nghiệp",
        imageSrc: "/pesticides/cat-banned-auramine.jpg",
        imageFit: "studio-jpg",
        categoryLabel: "Chất cấm tuyệt đối",
        eyebrow: "Kiểm tra 100% lô hàng xuất khẩu tại cửa khẩu GACC",
        fullTitle: "Vàng O (Auramine O — Hóa chất nhuộm công nghiệp)",
        lead: "Auramine O là hóa chất nhuộm màu công nghiệp có nguy cơ gây ung thư cao, tuyệt đối nghiêm cấm trong nông nghiệp và chế biến thực phẩm.",
        specs: [
          { label: "Mức kiểm soát", value: "Cấm tuyệt đối (Không dung thứ — 0.00 mg/kg)" },
          { label: "Nhóm hóa chất", value: "Thuốc nhuộm công nghiệp tạo màu vàng" },
          { label: "Phạm vi kiểm nghiệm", value: "Vỏ trái, cuống trái, cơm sầu riêng và sàn đóng gói" },
          { label: "Chế tài vi phạm", value: "Trả hàng ngay lập tức & đình chỉ mã số vùng trồng / CSĐG" },
        ],
        guidelinesTitle: "Quy định bắt buộc đối với nhà vườn & cơ sở thu mua",
        guidelines: [
          "Tuyệt đối không ngâm, nhúng, phun hoặc quét bất kỳ dung dịch tạo màu nào lên vỏ và cuống sầu riêng.",
          "Dụng cụ cắt, rổ nhựa, bạt lót và nguồn nước rửa tại vườn phải sạch hoàn toàn, không nhiễm chéo hóa chất.",
          "Lấy mẫu kiểm nghiệm độc lập chỉ tiêu Vàng O cho từng lô trước khi niêm phong tem truy xuất QR.",
        ],
        callout: {
          label: "Cảnh báo an toàn vùng trồng",
          text: "Chỉ một lô phát hiện tồn dư Vàng O sẽ làm ảnh hưởng trực tiếp tới uy tín và hiệu lực xuất khẩu của toàn bộ HTX Cư Né.",
        },
      },
      {
        id: "ban-cadmium",
        title: "Cadimi (Cd)",
        subtitle: "MRL ≤ 0.05 mg/kg · Kim loại nặng đất & phân",
        imageSrc: "/pesticides/cat-banned-cadmium.jpg",
        imageFit: "studio-jpg",
        categoryLabel: "Kim loại nặng kiểm soát",
        eyebrow: "Chỉ tiêu an toàn thực phẩm bắt buộc theo Nghị định thư xuất khẩu",
        fullTitle: "Cadimi (Cd) — Kim loại nặng tồn dư trong đất & phân bón",
        lead: "Cadimi có thể tích lũy từ nền đất chua hoặc phân lân / phân NPK kém chất lượng, hấp thu qua rễ và tồn dư trực tiếp trong múi sầu riêng.",
        specs: [
          { label: "Ngưỡng tối đa cho phép", value: "≤ 0.05 mg/kg trọng lượng tươi" },
          { label: "Nguồn phát sinh chính", value: "Đất pH thấp (< 5.0) & phân khoáng trôi nổi" },
          { label: "Tần suất lấy mẫu", value: "Định kỳ đầu vụ (đất/nước) & trước thu hoạch (trái)" },
          { label: "Biện pháp khắc phục", value: "Nâng pH đất 5.5–6.5, tăng hữu cơ vi sinh ủ hoai" },
        ],
        guidelinesTitle: "Quy trình kiểm soát Cadimi tại HTX Cư Né",
        guidelines: [
          "Kiểm tra độ pH đất hàng năm; khi đất chua dưới 5.5 thì Cadimi tự do dễ tan và cây hút mạnh hơn.",
          "Chỉ sử dụng phân bón có chứng nhận hợp quy và kết quả kiểm nghiệm hàm lượng Cadimi đạt chuẩn.",
          "Tăng cường phân chuồng ủ hoai cùng nấm rễ Mycorrhizae và Humic để cố định kim loại nặng trong keo đất.",
        ],
        callout: {
          label: "Lưu trữ chứng từ vật tư",
          text: "Bà con giữ đầy đủ hóa đơn và bao bì phân bón từng đợt để đối chiếu truy nguyên nguồn gốc khi đoàn kiểm tra yêu cầu.",
        },
      },
      {
        id: "ban-kcl",
        title: "Phân Kali Clorua (KCl)",
        subtitle: "Cấm trên sầu riêng · Hàm lượng Clo > 45%",
        imageSrc: "/fertilizers/npk.png",
        imageFit: "studio-png",
        categoryLabel: "Vật tư cấm dùng trên sầu riêng",
        eyebrow: "Quy chuẩn canh tác VietGAP & xuất khẩu sầu riêng",
        fullTitle: "Kali Clorua (KCl / Kali đỏ / Muối ớt) — Nghiêm cấm cho sầu riêng",
        lead: "Cây sầu riêng cực kỳ mẫn cảm với ion Clo (Cl⁻). Bón phân chứa Clo làm cháy chóp lá, suy kiệt rễ tơ và gây sượng nước, nhão cơm nghiêm trọng.",
        specs: [
          { label: "Mức kiểm soát", value: "Cấm sử dụng ở mọi giai đoạn sinh trưởng" },
          { label: "Thành phần gây hại", value: "Hàm lượng Clo (Cl⁻) cao trên 45%" },
          { label: "Tác hại lên trái", value: "Sượng múi, nhạt vị, cơm nhão, rụng trái non" },
          { label: "Vật tư thay thế", value: "Kali Sunfat (K₂SO₄ — Kali trắng) không chứa Clo" },
        ],
        guidelinesTitle: "Hướng dẫn nhận biết và thay thế an toàn",
        guidelines: [
          "Kiểm tra kỹ thành phần trên bao NPK: chỉ chọn loại ghi rõ 'K₂SO₄ / Kali Sunfat / Chlorine-free (< 2% Cl)'.",
          "Tuyệt đối không mua Kali đỏ (muối ớt) rời để rải gốc ở giai đoạn làm bông hoặc nuôi trái.",
        ],
      },
    ];

    const dbBanned = rawPesticides.filter((p) => p.status === "banned");
    const extraBannedActives: Array<{
      name: string;
      active: string;
      img: string;
      fit: "studio-jpg" | "studio-png";
      note: string;
    }> = [
      {
        name: "Chlorpyrifos Ethyl & Fipronil",
        active: "Nhóm Lân hữu cơ & Phenylpyrazole",
        img: "/pesticides/red.png",
        fit: "studio-png",
        note: "Hoạt chất đã loại bỏ hoàn toàn khỏi danh mục thuốc BVTV được phép sử dụng tại Việt Nam theo Thông tư 10/2024/TT-BNNPTNT; lưu tồn rất lâu trong đất và vỏ trái.",
      },
      {
        name: "Carbendazim & Benomyl",
        active: "Nhóm Benzimidazole trừ nấm",
        img: "/pesticides/cat-fungicide-wg.jpg",
        fit: "studio-jpg",
        note: "Hoạt chất trừ nấm bị cấm sử dụng; tuyệt đối không dùng để quét vết bệnh xì mủ hay nhúng cuống bảo quản sau thu hoạch.",
      },
      {
        name: "Paraquat & Glyphosate",
        active: "Thuốc trừ cỏ hóa học cháy / lưu dẫn",
        img: "/pesticides/amber.png",
        fit: "studio-png",
        note: "Nghiêm cấm phun trừ cỏ hóa học trong vườn sầu riêng mã vùng trồng; thay thế bằng phát cỏ cơ giới giữ thảm thực vật tự nhiên.",
      },
    ];

    dbBanned.forEach((p, idx) => {
      bannedList.push({
        id: `ban-db-${p.name}-${idx}`,
        title: shortenTitle(p.name),
        subtitle: `Cấm sử dụng · Hoạt chất ${p.activeIngredient}`,
        imageSrc: idx % 2 === 0 ? "/pesticides/red.png" : "/pesticides/cat-systemic-od.jpg",
        imageFit: idx % 2 === 0 ? "studio-png" : "studio-jpg",
        categoryLabel: "Hoạt chất BVTV bị cấm",
        eyebrow: "Danh mục cấm sử dụng theo quy định Bảo vệ Thực vật",
        fullTitle: `${p.name} (${p.activeIngredient})`,
        lead: "Hoạt chất nằm trong danh mục cấm sử dụng trên cây ăn quả xuất khẩu. Không mua, không tàng trữ trong kho vườn và không phun ở bất kỳ thời điểm nào.",
        specs: [
          { label: "Tình trạng pháp lý", value: "Cấm sử dụng hoàn toàn" },
          { label: "Hoạt chất", value: p.activeIngredient },
          { label: "Hàm lượng", value: p.concentration || "Mọi dạng thành phẩm" },
          { label: "Rủi ro kiểm dịch", value: "Tồn dư vượt ngưỡng MRL dẫn tới hủy lô xuất khẩu" },
        ],
        guidelinesTitle: "Quy định xử lý tại kho vật tư hộ thành viên",
        guidelines: [
          "Rà soát toàn bộ kho chứa vật tư nông nghiệp tại vườn, loại bỏ ngay các chai/gói cũ chứa hoạt chất cấm.",
          "Liên hệ Ban Kỹ thuật HTX Cư Né để được tư vấn chế phẩm sinh học hoặc hoạt chất được phép thay thế.",
        ],
      });
    });

    extraBannedActives.forEach((item, idx) => {
      bannedList.push({
        id: `ban-extra-${idx}`,
        title: item.name,
        subtitle: `Cấm sử dụng · ${item.active}`,
        imageSrc: item.img,
        imageFit: item.fit,
        categoryLabel: "Hoạt chất BVTV bị cấm",
        eyebrow: "Kiểm soát nghiêm ngặt theo Thông tư 10/2024/TT-BNNPTNT",
        fullTitle: item.name,
        lead: item.note,
        specs: [
          { label: "Mức kiểm soát", value: "Cấm mua bán, tồn trữ và sử dụng" },
          { label: "Nhóm hoạt chất", value: item.active },
          { label: "Đối chiếu kiểm nghiệm", value: "Phân tích đa dư lượng GC-MS/MS & LC-MS/MS" },
          { label: "Giải pháp thay thế", value: "Dùng nấm đối kháng, dầu khoáng hoặc thuốc sinh học" },
        ],
        guidelinesTitle: "Tuân thủ an toàn vùng trồng",
        guidelines: [
          "Tuyệt đối không phun dưới tán, không quét thân và không tồn trữ vỏ bao bì hoạt chất cấm trong khuôn viên vườn.",
          "Nếu phát hiện lỡ sử dụng, chủ hộ báo ngay cho Cán bộ kỹ thuật HTX để khoanh vùng và xử lý riêng, tránh ảnh hưởng cả vùng.",
        ],
      });
    });

    // 3. Phân bón & Chế phẩm vi sinh
    const fertFallbacks = [
      "/fertilizers/organic.png",
      "/pesticides/cat-microbial-jar.jpg",
      "/fertilizers/humic.png",
      "/fertilizers/npk.png",
      "/fertilizers/foliar.png",
      "/pesticides/cat-bio-wp.jpg",
    ];
    const fertilizerList: CatalogCardItem[] = rawFertilizers
      .filter((f) => f.category !== "restricted" && f.status !== "warning")
      .map((f, idx) => {
        const rawImg = f.imageUrl || fertFallbacks[idx % fertFallbacks.length];
        // Đảm bảo hai thẻ kế nhau có hình đại diện phong phú
        const prevImg = idx > 0 ? fertFallbacks[(idx - 1) % fertFallbacks.length] : "";
        const imgSrc = rawImg === prevImg ? fertFallbacks[idx % fertFallbacks.length] : rawImg;
        const isJpg = /\.(jpe?g|webp)$/i.test(imgSrc) || imgSrc.startsWith("/api/");

        return {
          id: `fert-${f.name}-${idx}`,
          title: shortenTitle(f.name),
          subtitle: `${f.timing || "Quanh năm"} · ${f.status === "encouraged" ? "Khuyến khích" : "Được phép"}`,
          imageSrc: imgSrc,
          imageFit: isJpg ? "studio-jpg" : "studio-png",
          categoryLabel: "Phân bón & Vi sinh",
          eyebrow:
            f.status === "encouraged"
              ? "Khuyến khích ưu tiên theo quy trình canh tác bền vững"
              : "Được phép sử dụng · Không chứa Clo & kiểm soát Cadimi",
          fullTitle: f.name,
          lead:
            f.description ||
            "Phân bón và chế phẩm sinh học đạt chuẩn canh tác sầu riêng xuất khẩu tại vùng trồng HTX Cư Né.",
          specs: [
            { label: "Thành phần / Công thức", value: f.formula || "Theo tiêu chuẩn nhà sản xuất" },
            { label: "Liều lượng khuyến cáo", value: f.dosage || "Theo tuổi cây và tán lá" },
            { label: "Thời điểm áp dụng", value: f.timing || "Theo chu kỳ sinh trưởng" },
            { label: "Đơn vị / Quy trình", value: f.manufacturer || "HTX Cư Né khuyến nghị" },
          ],
          guidelinesTitle: "Phương pháp bón hiệu quả tại vườn",
          guidelines: [
            f.applicationMethod || "Bón đều quanh hình chiếu mép tán cây nơi tập trung nhiều rễ tơ hút dinh dưỡng.",
            "Kết hợp tưới đủ ẩm ngay sau khi bón để dinh dưỡng hòa tan và vi sinh vật có ích phát triển ổn định.",
            "Lưu hóa đơn mua phân bón và ghi đợt bón vào nhật ký điện tử của thửa đất.",
          ],
        };
      });

    // 4. Quy trình mùa vụ 07 giai đoạn
    const advisoryList: CatalogCardItem[] = STAGES.map((stage, idx) => {
      const stepNum = String(idx + 1).padStart(2, "0");
      const stagePhoto = STAGE_PHOTOS[stage.id] ?? STAGE_PHOTOS.dat;
      return {
        id: `stage-${stage.id}`,
        title: `${stepNum}. ${stage.label}`,
        subtitle: `${stage.tag} · Ghi nhật ký chuẩn mã vùng`,
        imageSrc: stagePhoto.src,
        imageAlt: stagePhoto.alt,
        drawerObjectPosition: stagePhoto.drawerPos,
        imageFit: "photo",
        categoryLabel: `Giai đoạn ${stepNum} / ${String(STAGES.length).padStart(2, "0")}`,
        eyebrow: `Thời điểm áp dụng: ${stage.tag}`,
        fullTitle: `${stepNum}. ${stage.title}`,
        lead: stage.items[0] ?? "",
        specs: [
          { label: "Thứ tự quy trình", value: `Giai đoạn ${stepNum} — ${stage.label}` },
          { label: "Thời điểm trong vụ", value: stage.tag },
          { label: "Mức độ giám sát", value: stage.id === "sau-benh" ? "Rủi ro dư lượng cao nhất" : "Giám sát định kỳ theo thửa" },
          { label: "Đối tượng thực hiện", value: "Chủ hộ canh tác & Cán bộ kỹ thuật thôn" },
        ],
        guidelinesTitle: "Khuyến cáo thực hành tại vườn",
        guidelines: stage.items,
        callout: {
          label: "Nội dung bắt buộc ghi vào nhật ký canh tác",
          text: stage.log,
        },
      };
    });

    // 5. Giống sầu riêng chủ lực
    const varFallbacks = [
      "/varieties/monthong.png",
      "/varieties/ri6.png",
      "/varieties/musangking.png",
      "/varieties/blackthorn.png",
    ];
    const varietyList: CatalogCardItem[] = rawVarieties.map((v, idx) => {
      const lower = v.name.toLowerCase();
      let imgSrc = v.imageUrl || varFallbacks[idx % varFallbacks.length];
      if (!v.imageUrl) {
        if (lower.includes("ri 6") || lower.includes("ri6")) imgSrc = "/varieties/ri6.png";
        else if (lower.includes("monthong") || lower.includes("dona")) imgSrc = "/varieties/monthong.png";
        else if (lower.includes("musang")) imgSrc = "/varieties/musangking.png";
        else if (lower.includes("thorn") || lower.includes("gai đen")) imgSrc = "/varieties/blackthorn.png";
      }

      return {
        id: `var-${v.name}-${idx}`,
        title: `Sầu riêng ${v.name}`,
        subtitle: [v.origin, v.weightRange].filter(Boolean).join(" · ") || "Giống khuyến khích canh tác",
        imageSrc: imgSrc,
        imageFit: "studio-png",
        categoryLabel: "Giống sầu riêng",
        eyebrow: v.origin ? `Nguồn gốc giống: ${v.origin}` : "Giống cây ăn quả chủ lực vùng Cư Né",
        fullTitle: `Giống sầu riêng ${v.name}`,
        lead:
          v.description ||
          "Giống sầu riêng sinh trưởng khỏe trên vùng đất đỏ bazan Krông Búk, đáp ứng tiêu chuẩn truy xuất nguồn gốc và xuất khẩu chính ngạch.",
        specs: [
          { label: "Nguồn gốc", value: v.origin || "Tuyển chọn đầu dòng" },
          { label: "Trọng lượng thương phẩm", value: v.weightRange || "2.0 – 4.0 kg/trái" },
          { label: "Thời gian thu hoạch", value: v.harvestYears || "100 – 120 ngày sau xả nhụy" },
          {
            label: "Màu cơm & Độ ngọt Brix",
            value: [v.fleshColor, v.brix ? `Brix ${v.brix}` : null].filter(Boolean).join(" · ") || "Cơm vàng ráo, hạt lép cao",
          },
        ],
        guidelinesTitle: "Yêu cầu quản lý giống tại mã vùng trồng",
        guidelines: [
          "Sử dụng cây giống ghép khỏe mạnh từ vườn ươm được cấp phép, lưu giữ giấy chứng nhận nguồn gốc lô giống.",
          "Khai báo chính xác cơ cấu giống, năm trồng và số lượng cây của từng thửa trên bản đồ số HTX Cư Né.",
          "Thu hoạch đúng tuổi trái từng giống; tuyệt đối không cắt non làm giảm độ đường và chất lượng xuất khẩu.",
        ],
      };
    });

    return {
      allowed: allowedList,
      banned: bannedList,
      fertilizers: fertilizerList,
      advisory: advisoryList,
      varieties: varietyList,
    };
  }, [data]);

  const currentItems = allTabItems[tab] ?? [];

  const activeTabMeta = TAB_CONFIG.find((t) => t.id === tab) ?? TAB_CONFIG[0];
  const activeDrawerItem = drawerIndex !== null ? currentItems[drawerIndex] ?? null : null;

  /* ─── Thanh tiến trình ngang mượt mà bằng GPU (0 re-render khi cuộn) ─── */
  const syncProgress = useCallback(() => {
    scrollRafRef.current = 0;
    const strip = stripRef.current;
    const track = progressTrackRef.current;
    const thumb = progressThumbRef.current;
    if (!strip) return;

    const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const left = strip.scrollLeft;
    const nextPrev = left > 6;
    const nextNext = maxScroll > 6 && left < maxScroll - 6;

    setCanPrev((p) => (p === nextPrev ? p : nextPrev));
    setCanNext((p) => (p === nextNext ? p : nextNext));

    if (!track || !thumb) return;
    const trackWidth = track.clientWidth;
    if (trackWidth <= 0) return;

    if (maxScroll <= 4 || strip.scrollWidth <= 0) {
      thumb.style.width = `${trackWidth}px`;
      thumb.style.transform = "translate3d(0px, 0, 0)";
      return;
    }

    const visibleRatio = Math.min(1, Math.max(0.16, strip.clientWidth / strip.scrollWidth));
    const thumbWidth = Math.max(44, Math.round(trackWidth * visibleRatio));
    const travel = Math.max(0, trackWidth - thumbWidth);
    const progress = Math.min(1, Math.max(0, left / maxScroll));
    const offsetX = progress * travel;

    thumb.style.width = `${thumbWidth}px`;
    thumb.style.transform = `translate3d(${offsetX.toFixed(1)}px, 0, 0)`;
  }, []);

  const handleStripScroll = useCallback(() => {
    if (scrollRafRef.current === 0) {
      scrollRafRef.current = window.requestAnimationFrame(syncProgress);
    }
  }, [syncProgress]);

  useEffect(() => {
    const strip = stripRef.current;
    const track = progressTrackRef.current;
    if (!strip) return;

    let raf = window.requestAnimationFrame(syncProgress);
    const schedule = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(syncProgress);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(strip);
      if (track) ro.observe(track);
    }
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [syncProgress, tab, currentItems.length]);

  const scrollByCards = useCallback((direction: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) return;
    const firstCard = strip.querySelector<HTMLElement>(".sw-cat-card");
    const secondCard = strip.querySelectorAll<HTMLElement>(".sw-cat-card")[1];
    const singleStep =
      firstCard && secondCard
        ? Math.max(220, secondCard.offsetLeft - firstCard.offsetLeft)
        : Math.max(260, strip.clientWidth * 0.75);
    const cardsPerViewport = strip.clientWidth >= 960 ? 2 : 1;
    const delta = singleStep * cardsPerViewport * direction;

    strip.scrollBy({
      left: delta,
      behavior: isInstantScrollPreferred() ? "auto" : "smooth",
    });
  }, []);

  const handleSeekTrack = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    const track = progressTrackRef.current;
    if (!strip || !track) return;
    const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth);
    if (maxScroll <= 4) return;

    const rect = track.getBoundingClientRect();
    const clickRatio = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));

    strip.scrollTo({
      left: clickRatio * maxScroll,
      behavior: isInstantScrollPreferred() ? "auto" : "smooth",
    });
  }, []);

  /* ─── Kéo chuột mượt trên máy tính cho dải sản phẩm ─── */
  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !stripRef.current) return;
    dragRef.current = {
      down: true,
      startX: e.pageX,
      startScroll: stripRef.current.scrollLeft,
      moved: false,
    };
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.down || !stripRef.current) return;
    const dx = e.pageX - dragRef.current.startX;
    if (!dragRef.current.moved && Math.abs(dx) > 6) {
      dragRef.current.moved = true;
      setIsDragging(true);
    }
    if (dragRef.current.moved) {
      e.preventDefault();
      stripRef.current.scrollLeft = dragRef.current.startScroll - dx;
    }
  };

  const stopDragging = () => {
    if (!dragRef.current.down) return;
    dragRef.current.down = false;
    setIsDragging(false);
  };

  /* ─── Điều khiển ngăn chi tiết trượt phải ─── */
  const closeDrawer = useCallback(() => setDrawerIndex(null), []);
  const prevDrawer = useCallback(() => {
    setDrawerIndex((cur) => {
      if (cur === null || currentItems.length === 0) return null;
      return (cur - 1 + currentItems.length) % currentItems.length;
    });
  }, [currentItems.length]);
  const nextDrawer = useCallback(() => {
    setDrawerIndex((cur) => {
      if (cur === null || currentItems.length === 0) return null;
      return (cur + 1) % currentItems.length;
    });
  }, [currentItems.length]);

  useEffect(() => {
    if (drawerIndex === null) return;
    const unlock = lockRootScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
      if (e.key === "ArrowRight") nextDrawer();
      if (e.key === "ArrowLeft") prevDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerIndex, closeDrawer, nextDrawer, prevDrawer]);

  return (
    <section id="tra-cuu" className="sw-section" aria-labelledby="tracuu-title">
      {/* Điểm neo tương thích với các liên kết điều hướng nhanh */}
      <span id="quy-trinh" className="sw-anchor-alias" aria-hidden="true" />
      <span id="tieu-chuan" className="sw-anchor-alias" aria-hidden="true" />

      {/* Tiêu đề mục đặt chính giữa đồng bộ toàn hệ thống */}
      <header className="sw-grid sw-sec-head">
        <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />

        <div className="sw-cell sw-col-2-3 sw-head-main">
          <span className="sw-sec-index">05 / Khuyến cáo</span>
          <h2 id="tracuu-title" className="sw-sec-title">
            Thuốc BVTV &amp; Khuyến cáo
          </h2>
        </div>

        <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
      </header>

      {/* Thanh chuyển đổi chuyên mục đồng bộ toàn hệ thống */}
      <div ref={tabbarRef} className="sw-catalog-tabbar">
        <div
          className="sw-simple-tabs"
          role="tablist"
          aria-label="Chuyển đổi danh mục vật tư và khuyến cáo"
        >
          {TAB_CONFIG.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`sw-tab-pill ${active ? "is-active" : ""}`}
                onClick={(e) => handleSelectTab(item.id, e.currentTarget)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Không gian trưng bày thẻ vuông cuộn ngang tối giản (không dùng ô tìm kiếm) */}
      <div className="sw-cat-showcase">
        <div className="sw-cat-headbar">
          <div className="sw-cat-head-left">
            <h3 className="sw-cat-heading">{activeTabMeta.heading}</h3>
          </div>
        </div>

        <div
          ref={stripRef}
          className={`sw-cat-strip ${isDragging ? "is-dragging" : ""}`}
          onScroll={handleStripScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
        >
          {currentItems.map((item, idx) => (
            <article
              key={item.id}
              className="sw-cat-card"
              role="button"
              tabIndex={0}
              aria-label={`Xem chi tiết ${item.title}`}
              onClick={() => {
                if (dragRef.current.moved) {
                  dragRef.current.moved = false;
                  return;
                }
                setDrawerIndex(idx);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDrawerIndex(idx);
                }
              }}
            >
              <div className={`sw-cat-stage is-${item.imageFit}`}>
                <Image
                  src={item.imageSrc}
                  alt={item.imageAlt ?? item.title}
                  fill
                  draggable={false}
                  unoptimized={shouldSkipImageOpt(item.imageSrc)}
                  sizes="(max-width: 768px) 85vw, (max-width: 960px) 46vw, 31vw"
                  className="sw-cat-img"
                />
              </div>

              <div className="sw-cat-caption">
                <h4 className="sw-cat-title">{item.title}</h4>
                <p className="sw-cat-sub">{item.subtitle}</p>
              </div>
            </article>
          ))}
        </div>

        {/* Thanh tiến trình mảnh toàn dải + nút Trước / Tiếp đồng bộ hệ thống */}
        <div className="sw-cat-foot">
          <div
            ref={progressTrackRef}
            className="sw-cat-progress-track"
            onClick={handleSeekTrack}
            title="Nhấn vào thanh để chuyển nhanh vị trí danh sách"
            aria-hidden="true"
          >
            <span ref={progressThumbRef} className="sw-cat-progress-thumb" />
          </div>

          <div className="sw-training-scroll-btns" aria-label="Điều hướng danh mục">
            <button
              type="button"
              className="eh-step-btn"
              disabled={!canPrev}
              onClick={() => scrollByCards(-1)}
            >
              Trước
            </button>
            <button
              type="button"
              className="eh-step-btn"
              disabled={!canNext}
              onClick={() => scrollByCards(1)}
            >
              Tiếp
            </button>
          </div>
        </div>
      </div>

      {/* Ngăn trượt bên phải hiển thị đầy đủ thông số kỹ thuật, cách ly & quy định */}
      {activeDrawerItem && (
        <div
          className="sw-side-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="catalog-drawer-title"
          onClick={closeDrawer}
        >
          <aside className="sw-side-drawer" onClick={(e) => e.stopPropagation()}>
            <header className="sw-side-head">
              <div className="sw-modal-meta">
                <span>{activeDrawerItem.categoryLabel}</span>
                <span>·</span>
                <span>
                  {String((drawerIndex ?? 0) + 1).padStart(2, "0")} /{" "}
                  {String(currentItems.length).padStart(2, "0")}
                </span>
              </div>
              <button
                type="button"
                className="sw-side-close"
                aria-label="Đóng chi tiết danh mục"
                onClick={closeDrawer}
              >
                <span>Đóng</span>
                <span className="sw-side-close-x" aria-hidden="true">
                  ×
                </span>
              </button>
            </header>

            <div className="sw-side-scroll">
              <div
                className={`sw-side-photo-stage sw-cat-drawer-stage is-${activeDrawerItem.imageFit}`}
              >
                <Image
                  src={activeDrawerItem.imageSrc}
                  alt={activeDrawerItem.imageAlt ?? activeDrawerItem.fullTitle}
                  width={720}
                  height={720}
                  unoptimized={shouldSkipImageOpt(activeDrawerItem.imageSrc)}
                  style={
                    activeDrawerItem.drawerObjectPosition
                      ? { objectPosition: activeDrawerItem.drawerObjectPosition }
                      : undefined
                  }
                  className="sw-side-photo-full sw-cat-drawer-img"
                  priority
                />
              </div>

              <div className="sw-side-content">
                <span className="sw-micro">{activeDrawerItem.eyebrow}</span>
                <h3 id="catalog-drawer-title" className="sw-side-title">
                  {activeDrawerItem.fullTitle}
                </h3>
                <p className="sw-side-lead">{activeDrawerItem.lead}</p>

                <dl className="sw-detail-dl">
                  {activeDrawerItem.specs.map((spec) => (
                    <div key={spec.label}>
                      <dt>{spec.label}</dt>
                      <dd>{spec.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="sw-side-section">
                  <h4>{activeDrawerItem.guidelinesTitle}</h4>
                  <ul className="sw-clean-list">
                    {activeDrawerItem.guidelines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>

                {activeDrawerItem.callout && (
                  <div className="sw-side-callout">
                    <span className="sw-micro">{activeDrawerItem.callout.label}</span>
                    <p>{activeDrawerItem.callout.text}</p>
                  </div>
                )}
              </div>
            </div>

            <footer className="sw-side-foot">
              <button type="button" className="eh-step-btn" onClick={prevDrawer}>
                <span>Mục trước</span>
              </button>
              <button type="button" className="eh-step-btn" onClick={nextDrawer}>
                <span>Tiếp</span>
              </button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  );
}
