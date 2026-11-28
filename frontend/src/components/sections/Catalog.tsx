"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Search } from "@/components/ui/PublicIcon";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import ConfirmAction from "@/components/admin/catalog/ConfirmAction";
import { formatVn } from "@/components/admin/catalog/form-utils";
import { FERTILIZER_CATEGORY, FERTILIZER_STATUS, PESTICIDE_STATUS, VARIETY_CATEGORY, VARIETY_STATUS } from "@/components/admin/catalog/labels";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import BlockState from "@/components/admin/shared/BlockState";
import { ProgressiveListFooter, useProgressiveCount } from "@/components/portal/shared/controls";
import { lazyChunk } from "@/lib/lazy-chunk";
import { useAutoCenterDock } from "@/lib/dock-scroll";
import {
  acknowledgeAdminScope,
  useAdminNotificationBadges,
  useAutoAcknowledgeAdminScope,
} from "@/lib/notification-badges";

const FertilizerFormModal = dynamic(() => lazyChunk(() => import("@/components/admin/catalog/FertilizerFormModal")), { ssr: false });
const PesticideFormModal = dynamic(() => lazyChunk(() => import("@/components/admin/catalog/PesticideFormModal")), { ssr: false });
const VarietyFormModal = dynamic(() => lazyChunk(() => import("@/components/admin/catalog/VarietyFormModal")), { ssr: false });
const VillageFormModal = dynamic(() => lazyChunk(() => import("@/components/admin/catalog/VillageFormModal")), { ssr: false });
import {
  CareProtocol2026List,
  DiseaseAndIpmList,
  enrichVariety,
  FertilizerDetailModal,
  getFertilizerImage,
  getPesticideImage,
  getVarietyImage,
  PesticideDetailModal,
  VarietyDetailModal,
} from "@/components/portal/LearnTab";
import "@/components/portal/portal.css";
import { Sheet } from "@/components/portal/ui";
import { Modal } from "@/components/ui/Modal";
import { useApiList } from "@/hooks/use-api";
import {
  ADMIN_LAST_URL_KEY,
  readInitialUrlSubTab,
  usePersistedEditableSelection,
  usePersistedRecordSelection,
  usePersistedState,
  useUrlSubTab,
} from "@/lib/back-navigation";
import type { FertilizerDto, PesticideDto, VarietyDto } from "@/types/api";
import type { FertilizerRecord, PesticideRecord, VarietyRecord, VillageRecord } from "@/types/catalog";
import { isSafeMediaUrl } from "@/utils/url-safety";

type Tab = "protocol" | "pesticide" | "fertilizer" | "variety" | "diseases" | "village" | "standards";

interface StandardDoc {
  title: string;
  desc: string;
  tags: string[];
  details: string[];
}

const STANDARDS: StandardDoc[] = [
  {
    title: "Quy trình Chăm sóc Sầu riêng chuẩn HTX Cư Né niên vụ 2026-2027",
    desc: "Tài liệu kỹ thuật chuẩn gồm 8 giai đoạn sinh trưởng (Chuẩn bị vườn, Cơi đọt 1, Cơi đọt 2, Tạo mầm, Nuôi bông, Nuôi trái, Kéo cơi theo bông, Làm cơm) và phác đồ điều tiết đọt SenPro. Chỉ khi nông hộ tuân thủ đúng quy trình này và ghi nhật ký đầy đủ, HTX mới đảm bảo sản phẩm được thu mua đúng giá, giá cao.",
    tags: ["Bắt buộc", "Chuẩn 2026-2027", "Bảo chứng thu mua giá cao"],
    details: [
      "Giai đoạn Chuẩn bị (30 ngày) và Cơi đọt 1-2 (45-60 ngày): Rửa vườn, bón vôi, hữu cơ, Trichoderma, Soil Harmony; đổ gốc 25-30L Amino X kết hợp Magic One (1:1000), bón NPK 2:2:1 (1 kg/gốc), phun Grapo kết hợp Amino Ca; dự trữ 3-5 kg lân nung chảy Văn Điển và già hóa lá lụa bằng Brixup (1:400) kết hợp MKP (Bo, Mg).",
      "Giai đoạn Tạo mầm (15-30 ngày) và Nuôi bông (50-60 ngày): Xiết nước kết hợp phun 10:60:10 / MKP cùng Combi; nhấp nước khi mắt cua 1 cm, phun Bloom (1:400) cùng 500g KNO₃; bông 3 cm bón NPK 2:1:1 (1 kg/gốc); bông 7-12 cm phun Bloom kết hợp Amino Ca; bông 15-20 cm đổ gốc Magic One cùng 1 kg K₂SO₄ và phun 500 ml Brixup cùng 500g Kali Bo / 200L nước.",
      "Giai đoạn Nuôi trái (Ngày 0-60) và Kéo cơi theo bông (Ngày 65-90): Luân phiên đổ gốc Magic One (1:400) cùng 1 kg K₂SO₄ và 500g MgSO₄ với Ca(NO₃)₂ (1 kg), kết hợp phun Bloom cùng Amino Ca và Brixup cùng Kali Bo theo các mốc đuôi chuột, trứng cút, trứng gà, nắm tay, cái chén; Ngày 65 và Ngày 80 bón NPK 12:11:18 gốc Sunfat (500g/gốc).",
      "Giai đoạn Làm cơm (Ngày 105 và Ngày 120, trái 3-4 kg): Phun 500 ml Brixup cùng 500g Kali Bo và đổ gốc Magic One (1:400) cùng 1 kg K₂SO₄ giúp cơm vàng ráo tự nhiên, nặng ký.",
      "Phác đồ điều tiết đọt non bằng SenPro: Đọt Mũi giáo pha 1/400 (già lá/chặn đọt 7-10 ngày); Đọt Hạt gạo pha 1/800 (già lá/chặn đọt 7-10 ngày); Đọt Đuôi tôm pha 1/300 (rụng đọt trong 3 ngày). Bắt buộc ghi nhật ký đầy đủ để HTX đối chiếu nghiệm thu giá cao.",
    ],
  },
  {
    title: "Quy trình Quản lý dịch hại tổng hợp (IPM) Cây Sầu riêng theo VietGAP 2026",
    desc: "Tài liệu kỹ thuật của Viện Khoa học Nông nghiệp Việt Nam (VAAS) và Viện Bảo vệ Thực vật (PPRI) năm 2026 áp dụng cho vùng trồng sầu riêng Đắk Lắk, Đắk Nông gắn với liên kết tiêu thụ chuỗi.",
    tags: ["Bắt buộc", "Viện BVTV 2026", "VietGAP và IPM"],
    details: [
      "Thực hiện 4 nguyên tắc IPM: Trồng cây khỏe, bảo vệ thiên địch (bọ mắt vàng, bọ rùa, nhện, ong ký sinh), thăm đồng thường xuyên và nông dân trở thành chuyên gia.",
      "Quản lý trọng điểm 10 bệnh hại (đặc biệt bệnh xì mủ Phytophthora palmivora và bệnh héo ngọn Diaporthe durionigena) và 21 loài sâu hại (đặc biệt rệp sáp bột hai tua dài Ferrisia virgata, rầy nhảy Allocaridara malayensis, sâu đục quả Conogethes punctiferalis).",
      "Biện pháp sinh học: Ủ trộn 3 kg chế phẩm vi sinh đối kháng (Trichoderma spp., Bacillus spp., Streptomyces spp. từ 10⁸ bào tử/g) với 1 tấn phân chuồng hoai mục ở độ ẩm 50-60% trước khi bón 7-10 ngày vào tháng 4 đến đầu tháng 5; phun phòng héo ngọn tỷ lệ 1:1000 vào cuối mùa mưa (tháng 11).",
      "Biện pháp canh tác: Cắt tỉa tạo tán thông thoáng sau thu hoạch (tháng 9-10) vào ngày nắng ráo; tỉa chùm hoa dày và nhiễm rệp sáp (tháng 1-2); đào hố giao tán giữa 4 cây thu gom tàn dư trước mùa mưa.",
      "Biện pháp hóa học 4 đúng: Tiêm thân Phosphorous acid (Agri-Fos 400SL) cho cây đường kính từ 15 cm kết hợp cạo quét Metalaxyl-M cùng Mancozeb hoặc Acrobat MZ 90/600 WP trị xì mủ; phối hợp dầu khoáng và luân phiên chế phẩm sinh học (ABT 2WP, Trắng xanh WP, Bitadin WP) với thuốc hóa học (Movento 150OD, Penalty 40WP, Sida 20WP).",
    ],
  },
  {
    title: "VietGAP - Rau quả tươi",
    desc: "TCVN 11892-1:2017 - Quy trình thực hành nông nghiệp tốt cho rau quả tươi tại Việt Nam. Áp dụng bắt buộc với tất cả hộ xuất khẩu.",
    tags: ["Bắt buộc", "Bộ NN và PTNT", "Cập nhật 2023"],
    details: [
      "Đánh giá điều kiện đất, nguồn nước tưới và vị trí vùng sản xuất không bị ô nhiễm kim loại nặng (Cd, Pb, As).",
      "Ghi chép nhật ký canh tác, sử dụng phân bón và thuốc BVTV đầy đủ theo từng thửa.",
      "Đảm bảo thời gian cách ly thuốc BVTV tối thiểu trước khi thu hoạch và vệ sinh nhà sơ chế.",
    ],
  },
  {
    title: "GACC - Tổng cục Hải quan Trung Quốc",
    desc: "Yêu cầu của Tổng cục Hải quan Trung Quốc về kiểm dịch, truy xuất nguồn gốc, mã vùng trồng đăng ký GACC. Có hiệu lực từ 01/01/2024.",
    tags: ["Xuất khẩu TQ", "Bắt buộc", "Mã GACC"],
    details: [
      "Mỗi lô xuất khẩu phải gắn mã vùng trồng (PUC) và mã cơ sở đóng gói (PHC) đã được GACC phê duyệt.",
      "Giám sát sinh vật gây hại kiểm dịch thực vật (rệp sáp, ruồi đục quả) và lưu hồ sơ tối thiểu 2 năm.",
      "Kiểm nghiệm 100% lô hàng về dư lượng Cadimi (tối đa 0.05 mg/kg) và Vàng O (âm tính).",
    ],
  },
  {
    title: "GlobalGAP - Tiêu chuẩn nông nghiệp toàn cầu",
    desc: "Tiêu chuẩn tư nhân quốc tế về an toàn thực phẩm, truy xuất nguồn gốc và bền vững. Ưu tiên cho thị trường EU, Nhật Bản.",
    tags: ["Tự nguyện", "EU/Nhật", "Đang triển khai"],
    details: [
      "Quản lý dịch hại tổng hợp (IPM), ưu tiên chế phẩm sinh học và bảo tồn thiên địch.",
      "An toàn lao động, phúc lợi người lao động và bảo vệ môi trường sinh thái nông hộ.",
    ],
  },
  {
    title: "Kiểm dịch thực vật - BVTV",
    desc: "Quy trình kiểm dịch theo Thông tư 34/2018/TT-BNNPTNT. Kiểm tra vùng trồng, mã cơ sở đóng gói trước khi xuất khẩu.",
    tags: ["Bắt buộc", "BVTV", "Tỉnh Đắk Lắk"],
    details: [
      "Lấy mẫu kiểm dịch thực vật đại diện cho từng lô hàng trước khi cấp giấy chứng nhận Phytosanitary.",
      "Đảm bảo không có đối tượng kiểm dịch thực vật sống trên quả và bao bì đóng gói.",
    ],
  },
  {
    title: "Danh mục thuốc BVTV được phép",
    desc: "Danh mục thuốc BVTV được phép sử dụng tại Việt Nam theo Thông tư 10/2024/TT-BNNPTNT. Cập nhật hàng năm.",
    tags: ["Bắt buộc", "Thông tư 10/2024", "BVTV"],
    details: [
      "Chỉ sử dụng các hoạt chất nằm trong danh mục được phép trên cây sầu riêng.",
      "Tuyệt đối nghiêm cấm các hoạt chất đã bị loại bỏ như Chlorpyrifos Ethyl, Fipronil, Carbendazim.",
    ],
  },
];

function getStandardTagClass(tag: string): string {
  if (tag === "Bắt buộc") return "std-item-tag is-mandatory";
  if (tag === "Tự nguyện") return "std-item-tag is-voluntary";
  if (
    tag.includes("2026") ||
    tag.includes("VietGAP") ||
    tag.includes("GACC") ||
    tag.includes("giá cao")
  ) {
    return "std-item-tag is-highlight";
  }
  return "std-item-tag";
}

function toFertilizerDto(f: FertilizerRecord): FertilizerDto {
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    formula: f.formula,
    manufacturer: f.manufacturer,
    dosage: f.dosage,
    applicationMethod: f.applicationMethod,
    status: f.status,
    timing: f.timing,
    image: isSafeMediaUrl(f.imageUrl) ? f.imageUrl : undefined,
    description: f.description ?? undefined,
  };
}

function toVarietyDto(v: VarietyRecord): VarietyDto {
  return enrichVariety({
    id: v.id,
    name: v.name,
    origin: v.origin,
    weightRange: v.weightRange,
    harvestYears: v.harvestYears,
    description: v.description,
    category: v.category ?? undefined,
    status: v.status ?? undefined,
    fleshColor: v.fleshColor ?? undefined,
    seedRate: v.seedRate ?? undefined,
    brix: v.brix ?? undefined,
    yieldPerHa: v.yieldPerHa ?? undefined,
    image: isSafeMediaUrl(v.imageUrl) ? v.imageUrl : undefined,
    marketPotential: v.marketPotential ?? undefined,
    morphology: v.morphology ?? undefined,
    farmingTechniques: v.farmingTechniques ?? undefined,
  });
}

const isCatalogTab = (raw: string): raw is Tab =>
  raw === "protocol" ||
  raw === "pesticide" ||
  raw === "fertilizer" ||
  raw === "variety" ||
  raw === "diseases" ||
  raw === "village" ||
  raw === "standards";

export default function Catalog() {
  const [tab, setTab] = useState<Tab>(() =>
    readInitialUrlSubTab("sub", "pesticide", isCatalogTab, ADMIN_LAST_URL_KEY),
  );
  const selectTab = useUrlSubTab<Tab>(
    "sub",
    tab,
    setTab,
    "pesticide",
    isCatalogTab,
  );

  // 1. Thuốc BVTV
  const [pestQ, setPestQ] = useState("");
  const debouncedPestQ = useDebounced(pestQ, 120);
  const [pestStatus, setPestStatus] = usePersistedState<"all" | "allowed" | "restricted" | "banned">(
    "admin:catalog:pest-status",
    "all",
  );
  const pesticides = useApiList<PesticideRecord>("pesticides", {});
  const [selectedPesticide, setSelectedPesticide] = usePersistedRecordSelection<PesticideDto>(
    "admin:catalog:pest-view",
    pesticides.rows,
    (r) => r.id,
    pesticides.loading,
  );
  const [editingPesticide, setEditingPesticide] = usePersistedEditableSelection(
    "admin:catalog:pest-edit",
    pesticides.rows,
    (r) => r.id,
    pesticides.loading,
  );
  const [deletingPesticide, setDeletingPesticide] = useState<PesticideRecord | null>(null);

  const pestCounts = useMemo(
    () => ({
      all: pesticides.rows.length,
      allowed: pesticides.rows.filter((d) => d.status === "allowed").length,
      restricted: pesticides.rows.filter((d) => d.status === "restricted").length,
      banned: pesticides.rows.filter((d) => d.status === "banned").length,
    }),
    [pesticides.rows],
  );

  const shownPesticides = useMemo(() => {
    const q = debouncedPestQ.trim().toLowerCase();
    return pesticides.rows.filter((item) => {
      const matchesQ =
        !q || `${item.name} ${item.activeIngredient} ${item.manufacturer ?? ""}`.toLowerCase().includes(q);
      const matchesSt = pestStatus === "all" || item.status === pestStatus;
      return matchesQ && matchesSt;
    });
  }, [pesticides.rows, debouncedPestQ, pestStatus]);

  // 2. Phân bón
  const [fertQ, setFertQ] = useState("");
  const debouncedFertQ = useDebounced(fertQ, 120);
  const [fertCategory, setFertCategory] = usePersistedState<"all" | "organic" | "npk" | "foliar" | "microbial" | "restricted">(
    "admin:catalog:fert-cat",
    "all",
  );
  const fertilizers = useApiList<FertilizerRecord>("fertilizers", {});
  const fertilizerDtos = useMemo(() => fertilizers.rows.map(toFertilizerDto), [fertilizers.rows]);
  const [selectedFertilizer, setSelectedFertilizer] = usePersistedRecordSelection<FertilizerDto>(
    "admin:catalog:fert-view",
    fertilizerDtos,
    (r) => r.id,
    fertilizers.loading,
  );
  const [editingFertilizer, setEditingFertilizer] = usePersistedEditableSelection(
    "admin:catalog:fert-edit",
    fertilizers.rows,
    (r) => r.id,
    fertilizers.loading,
  );
  const [deletingFertilizer, setDeletingFertilizer] = useState<FertilizerRecord | null>(null);

  const fertCounts = useMemo(
    () => ({
      all: fertilizers.rows.length,
      organic: fertilizers.rows.filter((d) => d.category === "organic").length,
      npk: fertilizers.rows.filter((d) => d.category === "npk").length,
      foliar: fertilizers.rows.filter((d) => d.category === "foliar").length,
      microbial: fertilizers.rows.filter((d) => d.category === "microbial").length,
      restricted: fertilizers.rows.filter((d) => d.category === "restricted").length,
    }),
    [fertilizers.rows],
  );

  const shownFertilizers = useMemo(() => {
    const q = debouncedFertQ.trim().toLowerCase();
    return fertilizers.rows.filter((item) => {
      const matchesQ =
        !q ||
        `${item.name} ${item.formula ?? ""} ${item.manufacturer ?? ""} ${item.applicationMethod ?? ""}`
          .toLowerCase()
          .includes(q);
      const matchesCat = fertCategory === "all" || item.category === fertCategory;
      return matchesQ && matchesCat;
    });
  }, [fertilizers.rows, debouncedFertQ, fertCategory]);

  // 3. Giống sầu riêng
  const [varQ, setVarQ] = useState("");
  const debouncedVarQ = useDebounced(varQ, 120);
  const [varCategory, setVarCategory] = usePersistedState<"all" | "export" | "native" | "premium" | "new">(
    "admin:catalog:var-cat",
    "all",
  );
  const varieties = useApiList<VarietyRecord>("varieties", {});
  const varietyDtos = useMemo(() => varieties.rows.map(toVarietyDto), [varieties.rows]);
  const [selectedVariety, setSelectedVariety] = usePersistedRecordSelection<VarietyDto>(
    "admin:catalog:var-view",
    varietyDtos,
    (r) => r.id,
    varieties.loading,
  );
  const [editingVariety, setEditingVariety] = usePersistedEditableSelection(
    "admin:catalog:var-edit",
    varieties.rows,
    (r) => r.id,
    varieties.loading,
  );
  const [deletingVariety, setDeletingVariety] = useState<VarietyRecord | null>(null);

  const varCounts = useMemo(
    () => ({
      all: varieties.rows.length,
      export: varieties.rows.filter((d) => (d.category ?? "export") === "export").length,
      native: varieties.rows.filter((d) => d.category === "native").length,
      premium: varieties.rows.filter((d) => d.category === "premium").length,
      new: varieties.rows.filter((d) => d.category === "new").length,
    }),
    [varieties.rows],
  );

  const shownVarieties = useMemo(() => {
    const q = debouncedVarQ.trim().toLowerCase();
    return varieties.rows.filter((item) => {
      const matchesQ =
        !q ||
        `${item.name} ${item.origin ?? ""} ${item.fleshColor ?? ""} ${item.description ?? ""}`
          .toLowerCase()
          .includes(q);
      const cat = item.category ?? "export";
      const matchesCat = varCategory === "all" || cat === varCategory;
      return matchesQ && matchesCat;
    });
  }, [varieties.rows, debouncedVarQ, varCategory]);

  // 4. Thôn / Tổ
  const [vilQ, setVilQ] = useState("");
  const debouncedVilQ = useDebounced(vilQ, 120);
  const villages = useApiList<VillageRecord>("villages", {});
  const [editingVillage, setEditingVillage] = usePersistedEditableSelection(
    "admin:catalog:vil-edit",
    villages.rows,
    (r) => r.id,
    villages.loading,
  );
  const [deletingVillage, setDeletingVillage] = useState<VillageRecord | null>(null);

  const shownVillages = useMemo(() => {
    const q = debouncedVilQ.trim().toLowerCase();
    return villages.rows.filter(
      (v) => !q || `${v.name} ${v.leader ?? ""}`.toLowerCase().includes(q),
    );
  }, [villages.rows, debouncedVilQ]);

  // 5. Tiêu chuẩn
  const [viewingStandard, setViewingStandard] = usePersistedRecordSelection(
    "admin:catalog:standard-view",
    STANDARDS,
    (r) => r.title,
  );

  const pestProgressive = useProgressiveCount(shownPesticides.length, 16, 16, `${debouncedPestQ}|${pestStatus}`);
  const visiblePesticides = shownPesticides.slice(0, pestProgressive.visibleCount);

  const fertProgressive = useProgressiveCount(shownFertilizers.length, 16, 16, `${debouncedFertQ}|${fertCategory}`);
  const visibleFertilizers = shownFertilizers.slice(0, fertProgressive.visibleCount);

  const varProgressive = useProgressiveCount(shownVarieties.length, 16, 16, `${debouncedVarQ}|${varCategory}`);
  const visibleVarieties = shownVarieties.slice(0, varProgressive.visibleCount);
  const catalogTabBarRef = useAutoCenterDock<HTMLDivElement>(tab);
  const { getSubBadge } = useAdminNotificationBadges();
  useAutoAcknowledgeAdminScope("catalog", tab);

  return (
    <div id="section-catalog" className="admin-catalog-section">
      <div ref={catalogTabBarRef} className="tab-bar" role="tablist" aria-label="Danh mục hệ thống">
        {[
          { id: "protocol", label: "Quy trình 2026-2027" },
          { id: "pesticide", label: "Thuốc BVTV" },
          { id: "fertilizer", label: "Phân bón" },
          { id: "variety", label: "Giống cây" },
          { id: "diseases", label: "Sâu bệnh và IPM" },
          { id: "village", label: "Thôn / Tổ" },
          { id: "standards", label: "Tiêu chuẩn" },
        ].map(({ id, label }) => {
          const badge = getSubBadge("catalog", id);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tab-btn ${tab === id ? "active" : ""}`}
              onClick={() => {
                acknowledgeAdminScope("catalog", id);
                selectTab(id as Tab);
              }}
            >
              <span>{label}</span>
              {badge > 0 ? <span className="tab-badge">{badge > 99 ? "99+" : badge}</span> : null}
            </button>
          );
        })}
      </div>

      {/* 0. QUY TRÌNH CHĂM SÓC SẦU RIÊNG CHUẨN 2026-2027 */}
      {tab === "protocol" && <CareProtocol2026List />}

      {/* 1. THUỐC BVTV */}
      {tab === "pesticide" && (
        <div className="pt-pest-wrap">
          <div className="admin-catalog-top">
            <div className="pt-pest-search-box">
              <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
              <input
                className="pt-pest-search-input"
                type="search"
                placeholder="Tìm theo tên thuốc, hoạt chất hoặc hãng..."
                value={pestQ}
                onChange={(e) => setPestQ(e.target.value)}
                aria-label="Tìm kiếm thuốc bảo vệ thực vật"
              />
              {pestQ && (
                <button
                  type="button"
                  className="pt-pest-search-clear"
                  onClick={() => setPestQ("")}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <CloseCircleIcon size={20} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditingPesticide("new")}
            >
              <span>Thêm thuốc</span>
            </button>
          </div>

          <div className="pt-pest-filter-bar" role="tablist" aria-label="Lọc theo trạng thái thuốc">
            <button
              type="button"
              className={`pt-pest-filter-chip ${pestStatus === "all" ? "is-active" : ""}`}
              onClick={() => setPestStatus("all")}
            >
              Tất cả <span className="pt-pest-filter-count">{pestCounts.all}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-allowed ${pestStatus === "allowed" ? "is-active" : ""}`}
              onClick={() => setPestStatus("allowed")}
            >
              Được phép <span className="pt-pest-filter-count">{pestCounts.allowed}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-restricted ${pestStatus === "restricted" ? "is-active" : ""}`}
              onClick={() => setPestStatus("restricted")}
            >
              Hạn chế <span className="pt-pest-filter-count">{pestCounts.restricted}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-banned ${pestStatus === "banned" ? "is-active" : ""}`}
              onClick={() => setPestStatus("banned")}
            >
              Bị cấm <span className="pt-pest-filter-count">{pestCounts.banned}</span>
            </button>
          </div>

          <BlockState
            loading={pesticides.loading}
            error={pesticides.error}
            empty={shownPesticides.length === 0}
            emptyText="Không tìm thấy thuốc BVTV phù hợp với tiêu chí lọc."
            variant="pesticide"
            onRetry={pesticides.refresh}
          />

          {shownPesticides.length > 0 && (
            <>
              <div className="pt-pest-list admin-catalog-grid">
                {visiblePesticides.map((p) => {
                  const imgSrc = getPesticideImage(p);
                  const st = PESTICIDE_STATUS[p.status] ?? PESTICIDE_STATUS.allowed;
                  const statusClass =
                    p.status === "allowed"
                      ? "pt-pest-status-allowed"
                      : p.status === "banned"
                        ? "pt-pest-status-banned"
                        : "pt-pest-status-restricted";

                  return (
                    <article
                      key={p.id}
                      className={`pt-pest-card pt-pest-card-${p.status}`}
                      onClick={() => setSelectedPesticide(p)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedPesticide(p);
                        }
                      }}
                      title="Bấm để xem chi tiết thuốc BVTV"
                    >
                      <div className="pt-pest-card-img-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgSrc} alt={p.name} className="pt-pest-card-img" loading="lazy" decoding="async" />
                      </div>

                      <div className="pt-pest-card-content">
                        <div className="pt-pest-card-top-row">
                          <h3 className="pt-pest-card-name">{p.name}</h3>
                          <span className={`pt-pest-mini-status ${statusClass}`}>{st.label}</span>
                        </div>

                        <p className="pt-pest-card-sub">
                          Hoạt chất: <strong>{p.activeIngredient}</strong>
                          {p.concentration ? ` (${p.concentration})` : ""}
                          {p.manufacturer ? `, ${p.manufacturer}` : ""}
                        </p>

                        <div className="admin-catalog-card-foot">
                          <div className="pt-pest-card-metric">
                            <span className="admin-catalog-metric-item">
                              Cách ly:{" "}
                              <strong>{p.isolationDays != null ? `${p.isolationDays} ngày` : "Không áp dụng"}</strong>
                            </span>
                            {p.mrlMgKg !== null && (
                              <span className="admin-catalog-metric-item">
                                MRL: <strong>{formatVn(p.mrlMgKg, 3)} mg/kg</strong>
                              </span>
                            )}
                          </div>

                          <div className="admin-catalog-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditingPesticide(p)}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeletingPesticide(p)}
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <ProgressiveListFooter
                hasMore={pestProgressive.hasMore}
                remainingCount={pestProgressive.remainingCount}
                sentinelRef={pestProgressive.sentinelRef}
                onShowMore={pestProgressive.showMore}
                unitLabel="thuốc"
              />
            </>
          )}
        </div>
      )}

      {/* 2. PHÂN BÓN */}
      {tab === "fertilizer" && (
        <div className="pt-pest-wrap">
          <div className="admin-catalog-top">
            <div className="pt-pest-search-box">
              <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
              <input
                className="pt-pest-search-input"
                type="search"
                placeholder="Tìm theo tên phân bón, thành phần dinh dưỡng hoặc hãng..."
                value={fertQ}
                onChange={(e) => setFertQ(e.target.value)}
                aria-label="Tìm kiếm phân bón"
              />
              {fertQ && (
                <button
                  type="button"
                  className="pt-pest-search-clear"
                  onClick={() => setFertQ("")}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <CloseCircleIcon size={20} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditingFertilizer("new")}
            >
              <span>Thêm phân bón</span>
            </button>
          </div>

          <div className="pt-pest-filter-bar" role="tablist" aria-label="Lọc theo phân loại phân bón">
            <button
              type="button"
              className={`pt-pest-filter-chip ${fertCategory === "all" ? "is-active" : ""}`}
              onClick={() => setFertCategory("all")}
            >
              Tất cả <span className="pt-pest-filter-count">{fertCounts.all}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-organic ${fertCategory === "organic" ? "is-active" : ""}`}
              onClick={() => setFertCategory("organic")}
            >
              Hữu cơ vi sinh <span className="pt-pest-filter-count">{fertCounts.organic}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-npk ${fertCategory === "npk" ? "is-active" : ""}`}
              onClick={() => setFertCategory("npk")}
            >
              NPK đa lượng <span className="pt-pest-filter-count">{fertCounts.npk}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-foliar ${fertCategory === "foliar" ? "is-active" : ""}`}
              onClick={() => setFertCategory("foliar")}
            >
              Trung vi lượng <span className="pt-pest-filter-count">{fertCounts.foliar}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-organic ${fertCategory === "microbial" ? "is-active" : ""}`}
              onClick={() => setFertCategory("microbial")}
            >
              Cải tạo đất và rễ <span className="pt-pest-filter-count">{fertCounts.microbial}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-warning ${fertCategory === "restricted" ? "is-active" : ""}`}
              onClick={() => setFertCategory("restricted")}
            >
              Kiểm soát Clo <span className="pt-pest-filter-count">{fertCounts.restricted}</span>
            </button>
          </div>

          <BlockState
            loading={fertilizers.loading}
            error={fertilizers.error}
            empty={shownFertilizers.length === 0}
            emptyText="Không tìm thấy phân bón phù hợp với tiêu chí lọc."
            variant="fertilizer"
            onRetry={fertilizers.refresh}
          />

          {shownFertilizers.length > 0 && (
            <>
              <div className="pt-pest-list admin-catalog-grid">
                {visibleFertilizers.map((f) => {
                  const dto = toFertilizerDto(f);
                  const imgSrc = getFertilizerImage(dto);
                  const isEncouraged = f.status === "encouraged";
                  const isWarning = f.status === "warning";
                  const catLabel = FERTILIZER_CATEGORY[f.category] ?? f.category;
                  const st = FERTILIZER_STATUS[f.status] ?? FERTILIZER_STATUS.allowed;

                  return (
                    <article
                      key={f.id}
                      className={`pt-pest-card pt-pest-card-${f.status}`}
                      onClick={() => setSelectedFertilizer(dto)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedFertilizer(dto);
                        }
                      }}
                      title="Bấm để xem chi tiết phân bón"
                    >
                      <div className="pt-pest-card-img-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgSrc} alt={f.name} className="pt-pest-card-img" loading="lazy" decoding="async" />
                      </div>

                      <div className="pt-pest-card-content">
                        <div className="pt-pest-card-top-row">
                          <h3 className="pt-pest-card-name">{f.name}</h3>
                          <span
                            className={`pt-pest-mini-status ${isEncouraged
                              ? "pt-pest-status-allowed"
                              : isWarning
                                ? "pt-pest-status-banned"
                                : "pt-pest-status-restricted"
                              }`}
                          >
                            {st.label}
                          </span>
                        </div>

                        <p className="pt-pest-card-sub">
                          <strong>{catLabel}</strong>, {f.formula}
                          {f.manufacturer ? `, ${f.manufacturer}` : ""}
                        </p>

                        <div className="admin-catalog-card-foot">
                          <div className="pt-pest-card-metric">
                            <span className="admin-catalog-metric-item">
                              Định mức: <strong>{f.dosage}</strong>
                            </span>
                            <span className="admin-catalog-metric-item">
                              Cách bón: <strong>{f.applicationMethod}</strong>
                            </span>
                          </div>

                          <div className="admin-catalog-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditingFertilizer(f)}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeletingFertilizer(f)}
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <ProgressiveListFooter
                hasMore={fertProgressive.hasMore}
                remainingCount={fertProgressive.remainingCount}
                sentinelRef={fertProgressive.sentinelRef}
                onShowMore={fertProgressive.showMore}
                unitLabel="phân bón"
              />
            </>
          )}
        </div>
      )}

      {/* 3. GIỐNG SẦU RIÊNG */}
      {tab === "variety" && (
        <div className="pt-pest-wrap">
          <div className="admin-catalog-top">
            <div className="pt-pest-search-box">
              <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
              <input
                className="pt-pest-search-input"
                type="search"
                placeholder="Tìm theo tên giống sầu riêng, xuất xứ hoặc đặc tính cơm..."
                value={varQ}
                onChange={(e) => setVarQ(e.target.value)}
                aria-label="Tìm kiếm giống sầu riêng"
              />
              {varQ && (
                <button
                  type="button"
                  className="pt-pest-search-clear"
                  onClick={() => setVarQ("")}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <CloseCircleIcon size={20} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditingVariety("new")}
            >
              <span>Thêm giống cây</span>
            </button>
          </div>

          <div className="pt-pest-filter-bar" role="tablist" aria-label="Lọc theo phân loại giống sầu riêng">
            <button
              type="button"
              className={`pt-pest-filter-chip ${varCategory === "all" ? "is-active" : ""}`}
              onClick={() => setVarCategory("all")}
            >
              Tất cả <span className="pt-pest-filter-count">{varCounts.all}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-export ${varCategory === "export" ? "is-active" : ""}`}
              onClick={() => setVarCategory("export")}
            >
              Xuất khẩu chủ lực <span className="pt-pest-filter-count">{varCounts.export}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-native ${varCategory === "native" ? "is-active" : ""}`}
              onClick={() => setVarCategory("native")}
            >
              Bản địa chất lượng <span className="pt-pest-filter-count">{varCounts.native}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-premium ${varCategory === "premium" ? "is-active" : ""}`}
              onClick={() => setVarCategory("premium")}
            >
              Nhập khẩu cao cấp <span className="pt-pest-filter-count">{varCounts.premium}</span>
            </button>
            <button
              type="button"
              className={`pt-pest-filter-chip is-new ${varCategory === "new" ? "is-active" : ""}`}
              onClick={() => setVarCategory("new")}
            >
              Giống mới tiềm năng <span className="pt-pest-filter-count">{varCounts.new}</span>
            </button>
          </div>

          <BlockState
            loading={varieties.loading}
            error={varieties.error}
            empty={shownVarieties.length === 0}
            emptyText="Không tìm thấy giống sầu riêng phù hợp với tiêu chí lọc."
            variant="seedling"
            onRetry={varieties.refresh}
          />

          {shownVarieties.length > 0 && (
            <>
              <div className="pt-pest-list admin-catalog-grid">
                {visibleVarieties.map((v) => {
                  const dto = toVarietyDto(v);
                  const imgSrc = getVarietyImage(dto);
                  const catLabel = v.category ? VARIETY_CATEGORY[v.category] : "Xuất khẩu chủ lực";
                  const st = v.status ? VARIETY_STATUS[v.status] : VARIETY_STATUS.allowed;

                  return (
                    <article
                      key={v.id}
                      className="pt-pest-card pt-pest-card-allowed"
                      onClick={() => setSelectedVariety(dto)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedVariety(dto);
                        }
                      }}
                      title="Bấm để xem chi tiết giống sầu riêng"
                    >
                      <div className="pt-pest-card-img-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgSrc} alt={v.name} className="pt-pest-card-img" loading="lazy" decoding="async" />
                      </div>

                      <div className="pt-pest-card-content">
                        <div className="pt-pest-card-top-row">
                          <h3 className="pt-pest-card-name">{v.name}</h3>
                          <span className="pt-pest-mini-status pt-pest-status-allowed">{st.label}</span>
                        </div>

                        <p className="pt-pest-card-sub">
                          <strong>{catLabel}</strong>, xuất xứ: <strong>{dto.origin || "Việt Nam"}</strong>
                          {dto.weightRange ? `, ${dto.weightRange}` : ""}
                        </p>

                        <div className="admin-catalog-card-foot">
                          <div className="pt-pest-card-metric">
                            <span className="admin-catalog-metric-item">
                              Thu hoạch: <strong>{dto.harvestYears || "105 - 120 ngày"}</strong>
                            </span>
                            {dto.yieldPerHa && (
                              <span className="admin-catalog-metric-item">
                                Năng suất: <strong>{dto.yieldPerHa}</strong>
                              </span>
                            )}
                          </div>

                          <div className="admin-catalog-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditingVariety(v)}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeletingVariety(v)}
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <ProgressiveListFooter
                hasMore={varProgressive.hasMore}
                remainingCount={varProgressive.remainingCount}
                sentinelRef={varProgressive.sentinelRef}
                onShowMore={varProgressive.showMore}
                unitLabel="giống"
              />
            </>
          )}
        </div>
      )}

      {/* 3b. SÂU BỆNH HẠI VÀ QUY TRÌNH IPM 2026 */}
      {tab === "diseases" && <DiseaseAndIpmList />}

      {/* 4. THÔN / TỔ */}
      {tab === "village" && (
        <div className="pt-pest-wrap">
          <div className="admin-catalog-top">
            <div className="pt-pest-search-box">
              <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
              <input
                className="pt-pest-search-input"
                type="search"
                placeholder="Tìm theo tên thôn, trưởng thôn..."
                value={vilQ}
                onChange={(e) => setVilQ(e.target.value)}
                aria-label="Tìm kiếm thôn tổ"
              />
              {vilQ && (
                <button
                  type="button"
                  className="pt-pest-search-clear"
                  onClick={() => setVilQ("")}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <CloseCircleIcon size={20} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditingVillage("new")}
            >
              <span>Thêm thôn / tổ</span>
            </button>
          </div>

          <BlockState
            loading={villages.loading}
            error={villages.error}
            empty={shownVillages.length === 0}
            emptyText="Không tìm thấy thôn / tổ phù hợp."
            variant="villageMap"
            onRetry={villages.refresh}
          />

          {shownVillages.length > 0 && (
            <div className="pt-pest-list admin-catalog-grid">
              {shownVillages.map((v, idx) => (
                <article
                  key={v.id}
                  className="pt-pest-card pt-pest-card-allowed"
                  onClick={() => setEditingVillage(v)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditingVillage(v);
                    }
                  }}
                >
                  <div className="admin-catalog-index-box" aria-hidden="true">
                    {String(idx + 1).padStart(2, "0")}
                  </div>

                  <div className="pt-pest-card-content">
                    <div className="pt-pest-card-top-row">
                      <h3 className="pt-pest-card-name">{v.name}</h3>
                      <span className="pt-pest-mini-status admin-catalog-neutral-tag">
                        {formatVn(Number(v.areaHa), 1)} ha
                      </span>
                    </div>

                    <p className="pt-pest-card-sub">
                      Trưởng thôn: <strong>{v.leader || "Chưa cập nhật"}</strong>
                    </p>

                    <div className="admin-catalog-card-foot">
                      <div className="pt-pest-card-metric">
                        <span className="admin-catalog-metric-item">
                          <strong>{v.householdCount}</strong> hộ đăng ký
                        </span>
                        <span className="admin-catalog-metric-item">
                          <strong>{v.plotCount}</strong> thửa đất
                        </span>
                      </div>

                      <div className="admin-catalog-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingVillage(v)}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingVillage(v)}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. TIÊU CHUẨN */}
      {tab === "standards" && (
        <div className="standards-list">
          {STANDARDS.map((s, idx) => (
            <div key={s.title} className="standard-item">
              <div className="admin-catalog-index-box" aria-hidden="true">
                {String(idx + 1).padStart(2, "0")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="std-item-title">{s.title}</div>
                <div className="std-item-desc">{s.desc}</div>
                <div className="std-item-tags">
                  {s.tags.map((t, tagIdx) => (
                    <span key={t} className={getStandardTagClass(t)}>
                      {t}
                      {tagIdx < s.tags.length - 1 ? "," : ""}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ flexShrink: 0 }}
                onClick={() => setViewingStandard(s)}
              >
                Xem tài liệu
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sheet Chi tiết Thuốc BVTV / Phân bón / Giống sầu riêng (giống Cổng người dùng) */}
      {selectedPesticide && (
        <Sheet title="Chi tiết thuốc BVTV" onClose={() => setSelectedPesticide(null)}>
          <PesticideDetailModal item={selectedPesticide} onClose={() => setSelectedPesticide(null)} />
        </Sheet>
      )}
      {selectedFertilizer && (
        <Sheet title="Chi tiết phân bón" onClose={() => setSelectedFertilizer(null)}>
          <FertilizerDetailModal item={selectedFertilizer} onClose={() => setSelectedFertilizer(null)} />
        </Sheet>
      )}
      {selectedVariety && (
        <Sheet title="Chi tiết giống sầu riêng" onClose={() => setSelectedVariety(null)}>
          <VarietyDetailModal item={selectedVariety} onClose={() => setSelectedVariety(null)} />
        </Sheet>
      )}

      {/* Modals Thêm/Sửa/Xóa Thuốc BVTV */}
      {editingPesticide && (
        <PesticideFormModal
          initial={editingPesticide === "new" ? null : editingPesticide}
          onClose={() => setEditingPesticide(null)}
          onSaved={() => {
            setEditingPesticide(null);
            void pesticides.refresh();
          }}
        />
      )}
      {deletingPesticide && (
        <ConfirmAction
          title="Xóa thuốc BVTV"
          message={
            <>
              Bạn có chắc chắn muốn xóa thuốc <strong>{deletingPesticide.name}</strong> khỏi danh mục?
            </>
          }
          path={`/pesticides/${deletingPesticide.id}`}
          successMessage="Đã xóa thuốc BVTV."
          onClose={() => setDeletingPesticide(null)}
          onDone={() => {
            setDeletingPesticide(null);
            void pesticides.refresh();
          }}
        />
      )}

      {/* Modals Thêm/Sửa/Xóa Phân bón */}
      {editingFertilizer && (
        <FertilizerFormModal
          initial={editingFertilizer === "new" ? null : editingFertilizer}
          onClose={() => setEditingFertilizer(null)}
          onSaved={() => {
            setEditingFertilizer(null);
            void fertilizers.refresh();
          }}
        />
      )}
      {deletingFertilizer && (
        <ConfirmAction
          title="Xóa phân bón"
          message={
            <>
              Bạn có chắc chắn muốn xóa phân bón <strong>{deletingFertilizer.name}</strong> khỏi danh mục?
            </>
          }
          path={`/fertilizers/${deletingFertilizer.id}`}
          successMessage="Đã xóa phân bón."
          onClose={() => setDeletingFertilizer(null)}
          onDone={() => {
            setDeletingFertilizer(null);
            void fertilizers.refresh();
          }}
        />
      )}

      {/* Modals Thêm/Sửa/Xóa Giống sầu riêng */}
      {editingVariety && (
        <VarietyFormModal
          initial={editingVariety === "new" ? null : editingVariety}
          onClose={() => setEditingVariety(null)}
          onSaved={() => {
            setEditingVariety(null);
            void varieties.refresh();
          }}
        />
      )}
      {deletingVariety && (
        <ConfirmAction
          title="Xóa giống sầu riêng"
          message={
            <>
              Bạn có chắc chắn muốn xóa giống <strong>{deletingVariety.name}</strong> khỏi danh mục?
            </>
          }
          path={`/varieties/${deletingVariety.id}`}
          successMessage="Đã xóa giống sầu riêng."
          onClose={() => setDeletingVariety(null)}
          onDone={() => {
            setDeletingVariety(null);
            void varieties.refresh();
          }}
        />
      )}

      {/* Modals Thêm/Sửa/Xóa Thôn / Tổ */}
      {editingVillage && (
        <VillageFormModal
          initial={editingVillage === "new" ? null : editingVillage}
          onClose={() => setEditingVillage(null)}
          onSaved={() => {
            setEditingVillage(null);
            void villages.refresh();
          }}
        />
      )}
      {deletingVillage && (
        <ConfirmAction
          title="Xóa thôn / tổ"
          message={
            <>
              Bạn có chắc chắn muốn xóa <strong>{deletingVillage.name}</strong>?
            </>
          }
          path={`/villages/${deletingVillage.id}`}
          successMessage="Đã xóa thôn / tổ."
          onClose={() => setDeletingVillage(null)}
          onDone={() => {
            setDeletingVillage(null);
            void villages.refresh();
          }}
        />
      )}

      {/* Modal Xem tiêu chuẩn */}
      {viewingStandard && (
        <Modal
          title={viewingStandard.title}
          onClose={() => setViewingStandard(null)}
          width={560}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setViewingStandard(null)}>
              Đóng
            </button>
          }
        >
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 0 }}>{viewingStandard.desc}</p>
          <div className="std-item-tags" style={{ marginTop: 0, marginBottom: 14 }}>
            {viewingStandard.tags.map((tag, tagIdx) => (
              <span key={tag} className={getStandardTagClass(tag)}>
                {tag}
                {tagIdx < viewingStandard.tags.length - 1 ? "," : ""}
              </span>
            ))}
          </div>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Yêu cầu trọng tâm áp dụng tại vùng trồng:</h4>
          <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.65, fontSize: 13.5 }}>
            {viewingStandard.details.map((item, idx) => (
              <li key={idx} style={{ marginBottom: 6 }}>
                {item}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
