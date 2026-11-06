"use client";

import { useMemo, useState } from "react";
import { Clock, MapPin, Pencil, Plus, Search, Users } from "lucide-react";
import { RadialPngIcon } from "@/components/portal/RadialIcons";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import ConfirmAction from "@/components/admin/catalog/ConfirmAction";
import FertilizerFormModal from "@/components/admin/catalog/FertilizerFormModal";
import { formatVn } from "@/components/admin/catalog/form-utils";
import { FERTILIZER_CATEGORY, FERTILIZER_STATUS, PESTICIDE_STATUS, VARIETY_CATEGORY, VARIETY_STATUS } from "@/components/admin/catalog/labels";
import PesticideFormModal from "@/components/admin/catalog/PesticideFormModal";
import VarietyFormModal from "@/components/admin/catalog/VarietyFormModal";
import VillageFormModal from "@/components/admin/catalog/VillageFormModal";
import BlockState from "@/components/admin/shared/BlockState";
import {
  enrichVariety,
  FertilizerDetailModal,
  getFertilizerImage,
  getPesticideImage,
  getVarietyImage,
  PesticideDetailModal,
  VarietyDetailModal,
} from "@/components/portal/LearnTab";
import "@/components/portal/portal.css";
import { EmptyState, Sheet } from "@/components/portal/ui";
import { Modal } from "@/components/ui/Modal";
import { useApiList } from "@/hooks/use-api";
import type { FertilizerDto, PesticideDto, VarietyDto } from "@/types/api";
import type { FertilizerRecord, PesticideRecord, VarietyRecord, VillageRecord } from "@/types/catalog";

type Tab = "pesticide" | "fertilizer" | "variety" | "village" | "standards";

interface StandardDoc {
  title: string;
  desc: string;
  tags: string[];
  details: string[];
}

const STANDARDS: StandardDoc[] = [
  {
    title: "VietGAP – Rau quả tươi",
    desc: "TCVN 11892-1:2017 – Quy trình thực hành nông nghiệp tốt cho rau quả tươi tại Việt Nam. Áp dụng bắt buộc với tất cả hộ xuất khẩu.",
    tags: ["Bắt buộc", "Bộ NN&PTNT", "Cập nhật 2023"],
    details: [
      "Đánh giá điều kiện đất, nguồn nước tưới và vị trí vùng sản xuất không bị ô nhiễm kim loại nặng (Cd, Pb, As).",
      "Ghi chép nhật ký canh tác, sử dụng phân bón và thuốc BVTV đầy đủ theo từng thửa.",
      "Đảm bảo thời gian cách ly thuốc BVTV tối thiểu trước khi thu hoạch và vệ sinh nhà sơ chế.",
    ],
  },
  {
    title: "GACC – General Administration of Customs China",
    desc: "Yêu cầu của Tổng cục Hải quan Trung Quốc về kiểm dịch, truy xuất nguồn gốc, mã vùng trồng đăng ký GACC. Có hiệu lực từ 01/01/2024.",
    tags: ["Xuất khẩu TQ", "Bắt buộc", "Mã GACC"],
    details: [
      "Mỗi lô xuất khẩu phải gắn mã vùng trồng (PUC) và mã cơ sở đóng gói (PHC) đã được GACC phê duyệt.",
      "Giám sát sinh vật gây hại kiểm dịch thực vật (rệp sáp, ruồi đục quả) và lưu hồ sơ tối thiểu 2 năm.",
      "Kiểm nghiệm 100% lô hàng về dư lượng Cadimi (≤ 0.05 mg/kg) và Vàng O (âm tính).",
    ],
  },
  {
    title: "GlobalGAP – Tiêu chuẩn nông nghiệp toàn cầu",
    desc: "Tiêu chuẩn tư nhân quốc tế về an toàn thực phẩm, truy xuất nguồn gốc và bền vững. Ưu tiên cho thị trường EU, Nhật Bản.",
    tags: ["Tự nguyện", "EU/Nhật", "Đang triển khai"],
    details: [
      "Quản lý dịch hại tổng hợp (IPM), ưu tiên chế phẩm sinh học và bảo tồn thiên địch.",
      "An toàn lao động, phúc lợi người lao động và bảo vệ môi trường sinh thái nông hộ.",
    ],
  },
  {
    title: "Kiểm dịch thực vật – BVTV",
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
    image: f.imageUrl ?? undefined,
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
    image: v.imageUrl ?? undefined,
    marketPotential: v.marketPotential ?? undefined,
    morphology: v.morphology ?? undefined,
    farmingTechniques: v.farmingTechniques ?? undefined,
  });
}

export default function Catalog() {
  const [tab, setTab] = useState<Tab>("pesticide");

  // 1. Thuốc BVTV
  const [pestQ, setPestQ] = useState("");
  const [pestStatus, setPestStatus] = useState<"all" | "allowed" | "restricted" | "banned">("all");
  const pesticides = useApiList<PesticideRecord>("pesticides", {});
  const [selectedPesticide, setSelectedPesticide] = useState<PesticideDto | null>(null);
  const [editingPesticide, setEditingPesticide] = useState<PesticideRecord | "new" | null>(null);
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
    const q = pestQ.trim().toLowerCase();
    return pesticides.rows.filter((item) => {
      const matchesQ =
        !q || `${item.name} ${item.activeIngredient} ${item.manufacturer ?? ""}`.toLowerCase().includes(q);
      const matchesSt = pestStatus === "all" || item.status === pestStatus;
      return matchesQ && matchesSt;
    });
  }, [pesticides.rows, pestQ, pestStatus]);

  // 2. Phân bón
  const [fertQ, setFertQ] = useState("");
  const [fertCategory, setFertCategory] = useState<"all" | "organic" | "npk" | "foliar" | "microbial" | "restricted">("all");
  const fertilizers = useApiList<FertilizerRecord>("fertilizers", {});
  const [selectedFertilizer, setSelectedFertilizer] = useState<FertilizerDto | null>(null);
  const [editingFertilizer, setEditingFertilizer] = useState<FertilizerRecord | "new" | null>(null);
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
    const q = fertQ.trim().toLowerCase();
    return fertilizers.rows.filter((item) => {
      const matchesQ =
        !q ||
        `${item.name} ${item.formula ?? ""} ${item.manufacturer ?? ""} ${item.applicationMethod ?? ""}`
          .toLowerCase()
          .includes(q);
      const matchesCat = fertCategory === "all" || item.category === fertCategory;
      return matchesQ && matchesCat;
    });
  }, [fertilizers.rows, fertQ, fertCategory]);

  // 3. Giống sầu riêng
  const [varQ, setVarQ] = useState("");
  const [varCategory, setVarCategory] = useState<"all" | "export" | "native" | "premium" | "new">("all");
  const varieties = useApiList<VarietyRecord>("varieties", {});
  const [selectedVariety, setSelectedVariety] = useState<VarietyDto | null>(null);
  const [editingVariety, setEditingVariety] = useState<VarietyRecord | "new" | null>(null);
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
    const q = varQ.trim().toLowerCase();
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
  }, [varieties.rows, varQ, varCategory]);

  // 4. Thôn / Tổ
  const [vilQ, setVilQ] = useState("");
  const villages = useApiList<VillageRecord>("villages", {});
  const [editingVillage, setEditingVillage] = useState<VillageRecord | "new" | null>(null);
  const [deletingVillage, setDeletingVillage] = useState<VillageRecord | null>(null);

  const shownVillages = useMemo(() => {
    const q = vilQ.trim().toLowerCase();
    return villages.rows.filter(
      (v) => !q || `${v.name} ${v.leader ?? ""}`.toLowerCase().includes(q),
    );
  }, [villages.rows, vilQ]);

  // 5. Tiêu chuẩn
  const [viewingStandard, setViewingStandard] = useState<StandardDoc | null>(null);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Danh Mục Hệ Thống</h1>
        </div>
      </div>

      <div className="tab-bar">
        {[
          { id: "pesticide", label: `Thuốc BVTV (${pesticides.total})` },
          { id: "fertilizer", label: `Phân bón (${fertilizers.total})` },
          { id: "variety", label: `Giống sầu riêng (${varieties.total})` },
          { id: "village", label: `Thôn / Tổ (${villages.total})` },
          { id: "standards", label: "Tiêu chuẩn" },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`tab-btn ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id as Tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── 1. THUỐC BVTV (Thiết kế theo Cổng người dùng) ─── */}
      {tab === "pesticide" && (
        <div className="pt-pest-wrap">
          <div className="admin-catalog-top">
            <div className="pt-pest-search-box" style={{ flex: 1 }}>
              <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
              <input
                className="pt-pest-search-input"
                type="search"
                placeholder="Tìm theo tên thuốc, hoạt chất hoặc hãng…"
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
              <Plus size={16} strokeWidth={2.4} />
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
            empty={false}
            onRetry={pesticides.refresh}
          />

          <div className="pt-pest-list admin-catalog-grid">
            {shownPesticides.map((p) => {
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
                    <img src={imgSrc} alt={p.name} className="pt-pest-card-img" loading="lazy" />
                  </div>

                  <div className="pt-pest-card-content">
                    <div className="pt-pest-card-top-row">
                      <h3 className="pt-pest-card-name">{p.name}</h3>
                      <span className={`pt-pest-mini-status ${statusClass}`}>{st.label}</span>
                    </div>

                    <p className="pt-pest-card-sub">
                      Hoạt chất: <strong>{p.activeIngredient}</strong>
                      {p.concentration ? ` (${p.concentration})` : ""}
                      {p.manufacturer ? ` · ${p.manufacturer}` : ""}
                    </p>

                    <div className="admin-catalog-card-foot">
                      <div className="pt-pest-card-metric">
                        <Clock size={12} className="pt-pest-card-metric-icon" aria-hidden="true" />
                        <span>
                          Cách ly:{" "}
                          <strong>{p.isolationDays != null ? `${p.isolationDays} ngày` : "Không áp dụng"}</strong>
                        </span>
                        {p.mrlMgKg !== null && (
                          <>
                            <span style={{ margin: "0 4px", color: "#cbd5e1" }}>•</span>
                            <span>
                              MRL: <strong>{formatVn(p.mrlMgKg, 3)} mg/kg</strong>
                            </span>
                          </>
                        )}
                      </div>

                      <div className="admin-catalog-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingPesticide(p)}
                        >
                          <Pencil size={12} />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingPesticide(p)}
                        >
                          <RadialPngIcon src="/trash.png" size={12} />
                          <span>Xóa</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!pesticides.loading && !pesticides.error && shownPesticides.length === 0 && (
            <EmptyState icon="search">Không tìm thấy thuốc BVTV phù hợp với tiêu chí lọc.</EmptyState>
          )}
        </div>
      )}

      {/* ─── 2. PHÂN BÓN (Thiết kế theo Cổng người dùng) ─── */}
      {tab === "fertilizer" && (
        <div className="pt-pest-wrap">
          <div className="admin-catalog-top">
            <div className="pt-pest-search-box" style={{ flex: 1 }}>
              <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
              <input
                className="pt-pest-search-input"
                type="search"
                placeholder="Tìm theo tên phân bón, thành phần dinh dưỡng hoặc hãng…"
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
              <Plus size={16} strokeWidth={2.4} />
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
              Cải tạo đất &amp; Rễ <span className="pt-pest-filter-count">{fertCounts.microbial}</span>
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
            empty={false}
            onRetry={fertilizers.refresh}
          />

          <div className="pt-pest-list admin-catalog-grid">
            {shownFertilizers.map((f) => {
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
                    <img src={imgSrc} alt={f.name} className="pt-pest-card-img" loading="lazy" />
                  </div>

                  <div className="pt-pest-card-content">
                    <div className="pt-pest-card-top-row">
                      <h3 className="pt-pest-card-name">{f.name}</h3>
                      <span
                        className={`pt-pest-mini-status ${
                          isEncouraged
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
                      <strong>{catLabel}</strong> · {f.formula}
                      {f.manufacturer ? ` · ${f.manufacturer}` : ""}
                    </p>

                    <div className="admin-catalog-card-foot">
                      <div className="pt-pest-card-metric">
                        <Clock size={12} className="pt-pest-card-metric-icon" aria-hidden="true" />
                        <span>
                          Định mức: <strong>{f.dosage}</strong>
                        </span>
                        <span style={{ margin: "0 4px", color: "#cbd5e1" }}>•</span>
                        <span>
                          Cách bón: <strong>{f.applicationMethod}</strong>
                        </span>
                      </div>

                      <div className="admin-catalog-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingFertilizer(f)}
                        >
                          <Pencil size={12} />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingFertilizer(f)}
                        >
                          <RadialPngIcon src="/trash.png" size={12} />
                          <span>Xóa</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!fertilizers.loading && !fertilizers.error && shownFertilizers.length === 0 && (
            <EmptyState icon="search">Không tìm thấy phân bón phù hợp với tiêu chí lọc.</EmptyState>
          )}
        </div>
      )}

      {/* ─── 3. GIỐNG SẦU RIÊNG (Thiết kế theo Cổng người dùng) ─── */}
      {tab === "variety" && (
        <div className="pt-pest-wrap">
          <div className="admin-catalog-top">
            <div className="pt-pest-search-box" style={{ flex: 1 }}>
              <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
              <input
                className="pt-pest-search-input"
                type="search"
                placeholder="Tìm theo tên giống sầu riêng, xuất xứ hoặc đặc tính cơm…"
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
              <Plus size={16} strokeWidth={2.4} />
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
            empty={false}
            onRetry={varieties.refresh}
          />

          <div className="pt-pest-list admin-catalog-grid">
            {shownVarieties.map((v) => {
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
                    <img src={imgSrc} alt={v.name} className="pt-pest-card-img" loading="lazy" />
                  </div>

                  <div className="pt-pest-card-content">
                    <div className="pt-pest-card-top-row">
                      <h3 className="pt-pest-card-name">{v.name}</h3>
                      <span className="pt-pest-mini-status pt-pest-status-allowed">{st.label}</span>
                    </div>

                    <p className="pt-pest-card-sub">
                      <strong>{catLabel}</strong> · Xuất xứ: <strong>{dto.origin || "Việt Nam"}</strong>
                      {dto.weightRange ? ` · ${dto.weightRange}` : ""}
                    </p>

                    <div className="admin-catalog-card-foot">
                      <div className="pt-pest-card-metric">
                        <Clock size={12} className="pt-pest-card-metric-icon" aria-hidden="true" />
                        <span>
                          Thu hoạch: <strong>{dto.harvestYears || "105 – 120 ngày"}</strong>
                        </span>
                        {dto.yieldPerHa && (
                          <>
                            <span style={{ margin: "0 4px", color: "#cbd5e1" }}>•</span>
                            <span>
                              Năng suất: <strong>{dto.yieldPerHa}</strong>
                            </span>
                          </>
                        )}
                      </div>

                      <div className="admin-catalog-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingVariety(v)}
                        >
                          <Pencil size={12} />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingVariety(v)}
                        >
                          <RadialPngIcon src="/trash.png" size={12} />
                          <span>Xóa</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!varieties.loading && !varieties.error && shownVarieties.length === 0 && (
            <EmptyState icon="search">Không tìm thấy giống sầu riêng phù hợp với tiêu chí lọc.</EmptyState>
          )}
        </div>
      )}

      {/* ─── 4. THÔN / TỔ (Thẻ trực quan đồng bộ) ─── */}
      {tab === "village" && (
        <div className="pt-pest-wrap">
          <div className="admin-catalog-top">
            <div className="pt-pest-search-box" style={{ flex: 1 }}>
              <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
              <input
                className="pt-pest-search-input"
                type="search"
                placeholder="Tìm theo tên thôn, trưởng thôn…"
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
              <Plus size={16} strokeWidth={2.4} />
              <span>Thêm thôn / tổ</span>
            </button>
          </div>

          <BlockState
            loading={villages.loading}
            error={villages.error}
            empty={false}
            onRetry={villages.refresh}
          />

          <div className="pt-pest-list admin-catalog-grid">
            {shownVillages.map((v) => (
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
                <div
                  className="pt-pest-card-img-wrap"
                  style={{
                    width: 64,
                    height: 64,
                    background: "#eef6f0",
                    color: "#14532d",
                    borderRadius: 16,
                  }}
                >
                  <MapPin size={26} strokeWidth={2.1} />
                </div>

                <div className="pt-pest-card-content">
                  <div className="pt-pest-card-top-row">
                    <h3 className="pt-pest-card-name">{v.name}</h3>
                    <span className="pt-pest-mini-status pt-pest-status-allowed">
                      {formatVn(Number(v.areaHa), 1)} ha
                    </span>
                  </div>

                  <p className="pt-pest-card-sub">
                    Trưởng thôn: <strong>{v.leader || "Chưa cập nhật"}</strong>
                  </p>

                  <div className="admin-catalog-card-foot">
                    <div className="pt-pest-card-metric">
                      <Users size={12} className="pt-pest-card-metric-icon" aria-hidden="true" />
                      <span>
                        <strong>{v.householdCount}</strong> hộ đăng ký
                      </span>
                      <span style={{ margin: "0 4px", color: "#cbd5e1" }}>•</span>
                      <span>
                        <strong>{v.plotCount}</strong> thửa đất
                      </span>
                    </div>

                    <div className="admin-catalog-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setEditingVillage(v)}
                      >
                        <Pencil size={12} />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeletingVillage(v)}
                      >
                        <RadialPngIcon src="/trash.png" size={12} />
                        <span>Xóa</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {!villages.loading && !villages.error && shownVillages.length === 0 && (
            <EmptyState icon="search">Không tìm thấy thôn / tổ phù hợp.</EmptyState>
          )}
        </div>
      )}

      {/* ─── 5. TIÊU CHUẨN ─── */}
      {tab === "standards" && (
        <div className="standards-list">
          {STANDARDS.map((s) => (
            <div key={s.title} className="standard-item">
              <div style={{ flex: 1 }}>
                <div className="std-item-title">{s.title}</div>
                <div className="std-item-desc">{s.desc}</div>
                <div className="std-item-tags">
                  {s.tags.map((t) => (
                    <span key={t} className="std-item-tag">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" style={{ flexShrink: 0 }} onClick={() => setViewingStandard(s)}>
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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {viewingStandard.tags.map((tag) => (
              <span key={tag} className="std-item-tag">
                {tag}
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
    </>
  );
}
