"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { WatermarkStamp } from "@/components/ui/WatermarkStamp";
import { safeDecodeURIComponent } from "@/utils/url-safety";
import type { PlotStatus, PortalPlot } from "@/types/portal";
import {
  ArrowLeft,
  Search,
  Share2,
  Printer,
  Check,
  CheckCircle2,
  Tag,
  Package,
  QrCode,
  Clock,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import "./trace.css";

const PlotMapModal = dynamic(() => import("@/components/portal/PlotMapModal"), {
  ssr: false,
});

interface TraceDiaryEntry {
  kind?: "spray" | "journal";
  entryOn: string;
  plotCode: string;
  activity: string;
  detail: string | null;
  recorder: string;
  householdName?: string;
  mrlStatus?: string | null;
  isolationDays?: number | null;
}

interface TraceOpenViolation {
  severity: "critical" | "warning";
  title: string;
  detectedOn: string;
  plotCode?: string | null;
  description?: string | null;
}

interface TraceCompliance {
  plotStatus: string;
  householdStatus?: string | null;
  hasZoneCode: boolean;
  hasGisBoundary: boolean;
  gisSource?: "declared" | "measured" | "cadastral" | "demo" | string | null;
  diaryCount: number;
  lastDiaryOn?: string | null;
  activeIsolationUntil?: string | null;
  hasMrlViolation: boolean;
  openViolationsCount: number;
  openViolations?: TraceOpenViolation[];
  latestLabResult?: string | null;
  latestLabCode?: string | null;
}

interface TraceData {
  verifiedAt?: string;
  stampType?: "farmer_fruit" | "plot_signboard" | "lot" | "item";
  isFarmerStamp?: boolean;
  isPlotSignboard?: boolean;
  compliance?: TraceCompliance | null;
  farmerStamp?: {
    id?: number;
    allocationId?: number;
    householdId?: number;
    plotCode: string | null;
    serialCode: string;
    status: "allocated" | "activated" | "revoked";
    activatedAt: string | null;
    fruitWeightKg: number | null;
    grade: "A" | "B" | "C" | null;
    harvestDate: string | null;
    householdName: string;
    householdCode: string;
    householdPhone?: string;
    householdStatus?: string | null;
    avatarUrl?: string | null;
    villageName: string;
    variety?: string | null;
    areaHa?: number | null;
    plantedYear?: number | null;
    sheetNo?: string | null;
    parcelNo?: string | null;
    plotSource?: "declared" | "measured" | "cadastral" | "demo" | null;
    plotStatus?: string | null;
    geometryJson?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  plot?: {
    id?: number;
    code: string;
    sheetNo?: string | null;
    parcelNo?: string | null;
    source?: "declared" | "measured" | "cadastral" | "demo" | null;
    ownerName?: string;
    village?: string | null;
    zoneCode?: string | null;
    variety?: string | null;
    plantedYear?: number | null;
    areaHa?: number;
    gisAreaHa?: number | null;
    status?: string;
    updatedAt?: string | null;
    householdCode?: string | null;
    householdStatus?: string | null;
    avatarUrl?: string | null;
    geometryJson?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  lot?: {
    id?: number;
    code: string;
    qrCode: string;
    harvestedOn: string;
    weightTons: number;
    householdCount: number;
    buyer: string;
    market: string;
    status: string;
    packhouseCode?: string;
  } | null;
  item?: {
    id?: number;
    lotId?: number;
    itemType: "fruit" | "box";
    serialCode: string;
    weightKg: number;
    grade: string;
    printedAt: string;
  } | null;
  supplyChain?: {
    packhouse: {
      code: string;
      name: string;
      taxCode: string;
      treatmentMethod: string;
      gradeAPct: number | null;
      gradeBPct: number | null;
      gradeCPct: number | null;
      avgBrix: number | null;
    };
    transport: {
      transporter: string;
      vehiclePlate: string;
      temperatureC: number | null;
      departedAt: string;
      estimatedArrival: string;
    };
    contract?: {
      code: string;
      title: string;
    };
  };
  puc: {
    code: string;
    name: string;
    crop: string;
    variety: string;
    location: string;
    standard: string;
    validUntil: string;
  };
  households?: {
    householdName: string;
    householdCode: string;
    village: string;
    avatarUrl?: string | null;
    weightKg: number | null;
    contributedKg?: number | null;
    lotCount?: number;
    areaHa?: number | null;
  }[];
  labTests: {
    code: string;
    householdName?: string;
    plotCode: string;
    sampledOn: string;
    cdMgKg: number;
    yellowOPositive: boolean;
    residueMgKg: number;
    chlorpyrifosMgKg: number | null;
    result: string;
    lab: string;
  }[];
  diaries: TraceDiaryEntry[];
  certifications: {
    title: string;
    code?: string;
    standard?: string;
    status: string;
    authority: string;
  }[];
}

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    });
  } catch {
    return dateStr;
  }
};

/** Ảnh chân dung đại diện nông hộ (hỗ trợ fallback minh họa trang nhã khi chủ hộ chưa tải ảnh lên). */
function HouseholdPortrait({
  avatarUrl,
  name,
  className = "tr-puc-portrait-frame",
}: {
  avatarUrl?: string | null;
  name: string;
  className?: string;
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const validUrl = avatarUrl && avatarUrl !== brokenUrl ? avatarUrl : null;

  return (
    <div className={className}>
      {validUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={validUrl}
          alt={`Ảnh đại diện hộ ${name}`}
          className="tr-puc-portrait-img"
          loading="lazy"
          onError={() => setBrokenUrl(validUrl)}
        />
      ) : (
        <svg
          viewBox="0 0 120 128"
          className="tr-puc-portrait-placeholder"
          role="img"
          aria-label={`Chân dung mặc định chủ hộ ${name}`}
        >
          <defs>
            <linearGradient id="trOrchardSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d9eadc" />
              <stop offset="58%" stopColor="#bdd9c3" />
              <stop offset="100%" stopColor="#8eb897" />
            </linearGradient>
            <linearGradient id="trShirtGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>
          <rect width="120" height="128" fill="url(#trOrchardSky)" />
          {/* Tán lá vườn sầu riêng mờ phía sau */}
          <circle cx="20" cy="30" r="26" fill="#4f855c" opacity="0.28" />
          <circle cx="102" cy="26" r="28" fill="#3f744d" opacity="0.26" />
          <circle cx="14" cy="72" r="22" fill="#3d6f4a" opacity="0.22" />
          <circle cx="106" cy="74" r="24" fill="#4f855c" opacity="0.24" />
          {/* Vai & áo sơ mi lịch sự */}
          <path
            d="M14 128 C16 99, 35 88, 60 88 C85 88, 104 99, 106 128 Z"
            fill="url(#trShirtGrad)"
          />
          <path d="M46 88 L60 106 L74 88 L67 84 L60 95 L53 84 Z" fill="#ffffff" opacity="0.92" />
          {/* Cổ & khuôn mặt */}
          <rect x="52" y="70" width="16" height="18" rx="6" fill="#d9a17c" />
          <ellipse cx="60" cy="52" rx="20" ry="23" fill="#e5b28f" />
          {/* Mái tóc gọn gàng */}
          <path
            d="M40 49 C40 31, 50 25, 61 25 C72 25, 80 32, 80 49 C77 40, 70 36, 60 36 C49 36, 43 40, 40 49 Z"
            fill="#2b333c"
          />
          {/* Nét mặt điềm đạm */}
          <circle cx="53" cy="52" r="1.8" fill="#2b333c" />
          <circle cx="67" cy="52" r="1.8" fill="#2b333c" />
          <path
            d="M54.5 63.5 Q60 66.8 65.5 63.5"
            fill="none"
            stroke="#8c583a"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

/** Phân loại biểu tượng tròn cho từng dòng Nhật ký canh tác chứng minh. */
function classifyDiaryVisual(entry: TraceDiaryEntry): {
  tone: "spray" | "fertilizer" | "prune" | "water" | "care";
  icon: React.ReactNode;
} {
  const act = (entry.activity || "").toLowerCase();
  if (entry.kind === "spray" || /phun|thuốc|bvtv|trừ sâu|trừ nấm|phòng bệnh|diệt khuẩn/.test(act)) {
    return {
      tone: "spray",
      icon: (
        /* Bình phun thuốc BVTV kèm tia sương */
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true">
          <path
            d="M9 6h4v2.2l2.3 2.3c.45.45.7 1.06.7 1.7V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6.8c0-.64.25-1.25.7-1.7L9 8.2V6Z"
            fill="#ffffff"
          />
          <path
            d="M8 4h6M11 4v2M14 5h3.2M18.5 3.6l1.3-.7M19 5.2h1.6M18.5 6.8l1.3.7"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M9.2 14.2h3.6M11 12.4v3.6" stroke="#1f8a4c" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ),
    };
  }

  if (/bón|phân|hữu cơ|npk|vi sinh|humic|vôi|dinh dưỡng/.test(act)) {
    return {
      tone: "fertilizer",
      icon: (
        /* Bao phân bón hữu cơ có hình mầm lá */
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true">
          <path
            d="M8.4 4.5h7.2l-1.1 2.4c2.1 1.3 3 3.4 3 6.3v5.1a2.2 2.2 0 0 1-2.2 2.2H8.7a2.2 2.2 0 0 1-2.2-2.2v-5.1c0-2.9.9-5 3-6.3L8.4 4.5Z"
            fill="#ffffff"
          />
          <path
            d="M12 16.6c2.2-.3 3.3-1.8 3.2-4-2.2.1-3.4 1.3-3.2 4Zm0 0c-.2-2.1-1.3-3.1-2.9-3.2.1 1.9 1.1 3 2.9 3.2Z"
            fill="#7c4d25"
          />
        </svg>
      ),
    };
  }

  if (/cắt cỏ|làm cỏ|dọn vườn|vệ sinh|tỉa|cành|tạo tán|rong cành/.test(act)) {
    return {
      tone: "prune",
      icon: (
        /* Kéo cắt tỉa cành & dọn vườn */
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
          <circle cx="6.5" cy="7" r="2.6" stroke="#ffffff" strokeWidth="2" />
          <circle cx="6.5" cy="17" r="2.6" stroke="#ffffff" strokeWidth="2" />
          <path
            d="M8.8 8.6L19 17.8M8.8 15.4L19 6.2"
            stroke="#ffffff"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      ),
    };
  }

  if (/tưới|nước|giữ ẩm/.test(act)) {
    return {
      tone: "water",
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
          <path
            d="M12 3.8C12 3.8 6.5 10.1 6.5 14.3a5.5 5.5 0 0 0 11 0C17.5 10.1 12 3.8 12 3.8Z"
            fill="#ffffff"
          />
        </svg>
      ),
    };
  }

  return {
    tone: "care",
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="M18.5 5.5C11.5 5.5 6.5 9.6 6.5 16.5c6.9 0 11-4.8 12-11Z"
          fill="#ffffff"
        />
        <path d="M6.5 17.5L13.5 10.5" stroke="#15803d" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  };
}

/** Tô điểm nhẹ nhàng cụm (AN TOÀN), (ĐANG CÁCH LY...) hoặc (VƯỢT NGƯỠNG) trong dòng chi tiết nhật ký. */
function renderDiaryDetailText(detail: string) {
  const parts = detail.split(/(\(AN TOÀN\)|\(VƯỢT NGƯỠNG\)|\(ĐANG CÁCH LY ĐẾN [^)]+\))/g);
  return parts.map((part, i) => {
    if (part === "(AN TOÀN)") {
      return (
        <strong key={i} className="tr-proof-safe-tag">
          {part}
        </strong>
      );
    }
    if (part === "(VƯỢT NGƯỠNG)") {
      return (
        <strong key={i} className="tr-proof-warn-tag">
          {part}
        </strong>
      );
    }
    if (part.startsWith("(ĐANG CÁCH LY")) {
      return (
        <strong key={i} className="tr-proof-pending-tag">
          {part}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

type PillarTone = "verified" | "warn" | "danger" | "neutral";

/** Thẻ 3 trụ cột xác thực minh bạch tại vườn: Mã vùng PUC · Canh tác VietGAP · Nghị định thư GACC. */
function CertificationSealsCard({
  hasZoneCode,
  plotStatus,
  diaryCount,
  activeIsolationUntil,
  hasViolationOrMrl,
  latestLabResult,
  effectiveStatus,
}: {
  hasZoneCode: boolean;
  plotStatus: string;
  diaryCount: number;
  activeIsolationUntil?: string | null;
  hasViolationOrMrl: boolean;
  latestLabResult?: string | null;
  effectiveStatus: "approved" | "isolation" | "pending" | "improve" | "violation";
}) {
  // 1. Trụ cột Mã vùng trồng PUC
  const pucPillar: { badge: string; tone: PillarTone } = !hasZoneCode
    ? { badge: "Chưa cấp mã", tone: "neutral" }
    : plotStatus === "violation"
      ? { badge: "Tạm dừng mã", tone: "danger" }
      : plotStatus === "pending"
        ? { badge: "Đang thẩm định", tone: "warn" }
        : plotStatus === "improve"
          ? { badge: "Cần bổ sung", tone: "warn" }
          : { badge: "Đã cấp mã", tone: "verified" };

  // 2. Trụ cột Thực hành canh tác VietGAP (dựa trên nhật ký, PHI, vi phạm thực tế)
  const vietgapPillar: { badge: string; tone: PillarTone } = hasViolationOrMrl
    ? { badge: "Có vi phạm", tone: "danger" }
    : activeIsolationUntil
      ? { badge: "Đang cách ly", tone: "warn" }
      : diaryCount > 0
        ? plotStatus === "approved"
          ? { badge: "Có nhật ký", tone: "verified" }
          : { badge: "Đang theo dõi", tone: "warn" }
        : { badge: "Chưa ghi chép", tone: "neutral" };

  // 3. Trụ cột Nghị định thư GACC & Kiểm nghiệm ATTP
  const gaccPillar: { badge: string; tone: PillarTone } =
    latestLabResult === "fail"
      ? { badge: "Mẫu không đạt", tone: "danger" }
      : effectiveStatus === "violation"
        ? { badge: "Tạm dừng XK", tone: "danger" }
        : effectiveStatus === "isolation"
          ? { badge: "Chờ hết PHI", tone: "warn" }
          : latestLabResult === "pass" && effectiveStatus === "approved"
            ? { badge: "Đạt kiểm nghiệm", tone: "verified" }
            : effectiveStatus === "approved"
              ? { badge: "Chờ mẫu KN", tone: "neutral" }
              : { badge: "Đang thẩm định", tone: "warn" };

  return (
    <section className="tr-puc-certs-card" aria-label="Đối chiếu tiêu chuẩn vùng trồng">
      <div className="tr-puc-certs-grid">
        {/* 1. Huy hiệu Mã vùng trồng PUC */}
        <div className="tr-cert-item">
          <div className="tr-cert-emblem" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="52" height="52">
              <circle cx="32" cy="32" r="30" fill="#f2fbf5" stroke="#15803d" strokeWidth="2.4" />
              <circle cx="32" cy="32" r="24.5" fill="#ffffff" stroke="#86efac" strokeWidth="1.2" />
              <path
                d="M32 12 L46 17.5 V29.5 C46 39 39.8 46.2 32 50 C24.2 46.2 18 39 18 29.5 V17.5 Z"
                fill="#166534"
              />
              <text
                x="32"
                y="34"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11"
                fontWeight="900"
                letterSpacing="0.5"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                PUC
              </text>
            </svg>
          </div>
          <span className="tr-cert-label">Mã vùng PUC</span>
          <span className={`tr-cert-pill is-${pucPillar.tone}`}>{pucPillar.badge}</span>
        </div>

        {/* 2. Huy hiệu VietGAP */}
        <div className="tr-cert-item">
          <div className="tr-cert-emblem" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="52" height="52">
              <circle cx="32" cy="32" r="30" fill="#ffffff" stroke="#1f8a4c" strokeWidth="2.6" />
              <path d="M6 36 C16 32, 48 32, 58 36 A28 28 0 0 1 6 36 Z" fill="#1f8a4c" />
              <path
                d="M22 44 C26 39, 33 38, 38 43 C33 47, 26 47, 22 44 Z"
                fill="#bbf7d0"
              />
              <path
                d="M33 47 C36 42, 42 41, 46 44 C43 48, 37 49, 33 47 Z"
                fill="#86efac"
              />
              <text
                x="32"
                y="27"
                textAnchor="middle"
                fill="#166534"
                fontSize="11.2"
                fontWeight="900"
                letterSpacing="-0.2"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                VietGAP
              </text>
            </svg>
          </div>
          <span className="tr-cert-label">VietGAP</span>
          <span className={`tr-cert-pill is-${vietgapPillar.tone}`}>{vietgapPillar.badge}</span>
        </div>

        {/* 3. Huy hiệu GACC (Trung Quốc) */}
        <div className="tr-cert-item">
          <div className="tr-cert-emblem" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="52" height="52">
              <circle cx="32" cy="32" r="30" fill="#f8fafc" stroke="#3b5f75" strokeWidth="2.2" />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="#648396"
                strokeWidth="1"
                strokeDasharray="2.2 1.8"
              />
              <circle cx="32" cy="32" r="21" fill="#2c5368" />
              <text
                x="32"
                y="35.5"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11.5"
                fontWeight="900"
                letterSpacing="0.5"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                GACC
              </text>
            </svg>
          </div>
          <span className="tr-cert-label">Nghị định thư GACC</span>
          <span className={`tr-cert-pill is-${gaccPillar.tone}`}>{gaccPillar.badge}</span>
        </div>
      </div>
    </section>
  );
}

/** Khối Nhật ký canh tác chứng minh (Timeline dọc có icon tròn phân màu theo nghiệp vụ). */
function ProvenDiarySection({
  diaries,
  totalCount,
  title = "NHẬT KÝ CANH TÁC CHỨNG MINH",
  subtitle,
  emptyMessage = "Hộ nông dân chưa ghi nhận nhật ký canh tác hoặc đợt phun thuốc nào trên lô đất này.",
  className = "",
}: {
  diaries: TraceDiaryEntry[];
  totalCount?: number;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  className?: string;
}) {
  const count = totalCount ?? diaries.length;
  return (
    <section className={`tr-card tr-puc-journal-card ${className}`.trim()}>
      <div className="tr-puc-journal-head">
        <h2 className="tr-puc-journal-title">{title}</h2>
        {count > 0 && <span className="tr-count-badge">{count} bản ghi</span>}
      </div>
      {subtitle && <p className="tr-card-sub">{subtitle}</p>}

      {diaries.length === 0 ? (
        <div className="tr-farmer-empty">{emptyMessage}</div>
      ) : (
        <div className="tr-proof-timeline" role="list">
          {diaries.map((d, idx) => {
            const visual = classifyDiaryVisual(d);
            const isLast = idx === diaries.length - 1;
            return (
              <div key={idx} className="tr-proof-item" role="listitem">
                <div className="tr-proof-track" aria-hidden="true">
                  <div className={`tr-proof-icon-circle is-${visual.tone}`}>{visual.icon}</div>
                  {!isLast && <div className={`tr-proof-stem is-${visual.tone}`} />}
                </div>
                <div className="tr-proof-body">
                  <strong className="tr-proof-heading">
                    <span className="tr-proof-date">{formatDate(d.entryOn)}</span>
                    <span className="tr-proof-sep">–</span>
                    <span>{d.activity}</span>
                  </strong>
                  {d.detail && <p className="tr-proof-detail">{renderDiaryDetailText(d.detail)}</p>}
                  {(d.recorder || d.plotCode) && (
                    <div className="tr-proof-meta">
                      {d.recorder && <span>Người ghi: {d.recorder}</span>}
                      {d.recorder && d.plotCode && <span aria-hidden="true">·</span>}
                      {d.plotCode && <span>Lô: {d.plotCode}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function TraceView() {
  const params = useParams();
  const code = typeof params.code === "string" ? safeDecodeURIComponent(params.code) : "";
  const router = useRouter();
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchCode, setSearchCode] = useState(code);
  const [copied, setCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [gisModalPlot, setGisModalPlot] = useState<{
    plot: PortalPlot;
    householdName: string;
  } | null>(null);

  const [prevCode, setPrevCode] = useState(code);
  if (prevCode !== code) {
    setPrevCode(code);
    setLoading(true);
    setError(null);
    setSearchCode(code);
    setGisModalPlot(null);
  }

  useEffect(() => {
    if (!code) return;
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = `${origin}/trace/${encodeURIComponent(code)}`;

    QRCode.toDataURL(targetUrl, {
      margin: 0,
      width: 320,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setQrSrc(url);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    if (!code) return;
    let active = true;

    fetch(`/api/public/trace/${encodeURIComponent(code)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? `Không tìm thấy thông tin lô hàng, thửa đất hoặc mã tem "${code}". Quý khách vui lòng kiểm tra lại mã QR.`
              : "Có lỗi xảy ra khi truy vấn dữ liệu từ máy chủ. Quý khách vui lòng thử lại sau.",
          );
        }
        return res.json();
      })
      .then((payload: TraceData) => {
        if (active) setData(payload);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [code]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchCode.trim()) {
      router.push(`/trace/${encodeURIComponent(searchCode.trim())}`);
    }
  };

  const handleShare = () => {
    if (typeof window !== "undefined") {
      void navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    const prevTitle = document.title;
    const safeCode = (code || "PUC").replace(/[^a-zA-Z0-9_-]+/g, "-");
    document.title = `Ho-so-truy-xuat-${safeCode}`;
    const restore = () => {
      document.title = prevTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
    setTimeout(restore, 1500);
  };

  const totalLotKg = data?.lot?.weightTons
    ? data.lot.weightTons * 1000
    : (data?.farmerStamp?.fruitWeightKg ?? 0);

  const isPlotTransparencyView = Boolean(
    data?.isPlotSignboard || (data?.plot && !data?.farmerStamp && !data?.lot),
  );

  const openPlotGisModal = () => {
    if (!data?.plot) return;
    const rawStatus = data.plot.status;
    const validStatus: PlotStatus =
      rawStatus === "approved" ||
      rawStatus === "improve" ||
      rawStatus === "violation" ||
      rawStatus === "pending"
        ? rawStatus
        : "approved";

    setGisModalPlot({
      householdName: data.plot.ownerName || "Hộ xã viên HTX Cư Né",
      plot: {
        id: data.plot.id,
        code: data.plot.code,
        sheet: data.plot.sheetNo ?? null,
        parcel: data.plot.parcelNo ?? null,
        village: data.plot.village ?? null,
        zoneCode: data.plot.zoneCode || (data.puc.code !== "Chưa cấp mã PUC" ? data.puc.code : null),
        variety: data.plot.variety ?? null,
        plantedYear: data.plot.plantedYear ?? null,
        areaHa: Number(data.plot.areaHa ?? data.plot.gisAreaHa ?? 0),
        source: data.plot.source ?? "cadastral",
        status: validStatus,
        lat: data.plot.lat ?? null,
        lng: data.plot.lng ?? null,
        geometryJson: data.plot.geometryJson ?? null,
      },
    });
  };

  const openStampGisModal = () => {
    if (!data?.farmerStamp) return;
    const fs = data.farmerStamp;
    const rawStatus = fs.plotStatus;
    const validStatus: PlotStatus =
      rawStatus === "approved" ||
      rawStatus === "improve" ||
      rawStatus === "violation" ||
      rawStatus === "pending"
        ? rawStatus
        : "approved";

    setGisModalPlot({
      householdName: fs.householdName,
      plot: {
        code: fs.plotCode || "LÔ VƯỜN",
        sheet: fs.sheetNo ?? null,
        parcel: fs.parcelNo ?? null,
        village: fs.villageName ?? null,
        zoneCode: data.puc.code,
        variety: fs.variety ?? null,
        plantedYear: fs.plantedYear ?? null,
        areaHa: Number(fs.areaHa ?? 0),
        source: fs.plotSource ?? "cadastral",
        status: validStatus,
        lat: fs.lat ?? null,
        lng: fs.lng ?? null,
        geometryJson: fs.geometryJson ?? null,
      },
    });
  };

  return (
    <div className="tr-root">
      <main className={`tr-wrap tr-main ${isPlotTransparencyView ? "is-plot-narrow" : ""}`}>
        {loading ? (
          <SkeletonCards count={3} label="Đang nạp hồ sơ minh bạch vùng trồng & truy xuất…" />
        ) : error ? (
          <div className="tr-card tr-error-card">
            <h2 className="tr-error-title">Chưa tìm thấy thông tin</h2>
            <p className="tr-error-desc">{error}</p>
            <form onSubmit={handleSearch} className="tr-search-form">
              <input
                className="tr-search-input"
                placeholder="Nhập mã lô đất, mã lô hàng hoặc mã tem (VD: EK10-01)..."
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
              />
              <button type="submit" className="tr-search-btn">
                <Search size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>Tìm kiếm</span>
              </button>
            </form>
            <div className="tr-error-actions">
              <Link href="/" className="tr-home-btn">
                <ArrowLeft size={17} strokeWidth={2.3} aria-hidden="true" />
                <span>Trang chủ</span>
              </Link>
            </div>
          </div>
        ) : data && isPlotTransparencyView && data.plot ? (
          /* ═══════════════════════════════════════════════════════════════════════════
             GIAO DIỆN TRUY XUẤT TÍNH MINH BẠCH MÃ VÙNG TRỒNG CỦA TỪNG HỘ DÂN (TẠI THỬA ĐẤT)
             Phục vụ cán bộ kiểm tra, đoàn đánh giá GACC và doanh nghiệp xuất khẩu quét tại vườn
             ═══════════════════════════════════════════════════════════════════════════ */
          (() => {
            const plot = data.plot;
            const compliance = data.compliance ?? null;
            const ownerName = plot.ownerName || "Chưa cập nhật chủ hộ";
            const avatarUrl = plot.avatarUrl || data.households?.[0]?.avatarUrl || null;
            const hasGisBoundary = Boolean(
              plot.geometryJson ||
                (plot.lat !== null && plot.lat !== undefined && plot.lng !== null && plot.lng !== undefined),
            );
            const realZoneCode =
              plot.zoneCode && plot.zoneCode !== "Chưa cấp mã PUC"
                ? plot.zoneCode
                : data.puc.code && data.puc.code !== "Chưa cấp mã PUC"
                  ? data.puc.code
                  : null;
            const hasZoneCode = Boolean(compliance?.hasZoneCode ?? realZoneCode);
            const openViolations = compliance?.openViolations ?? [];
            const openViolationsCount = compliance?.openViolationsCount ?? openViolations.length;
            const activeIsolationUntil = compliance?.activeIsolationUntil ?? null;
            const hasMrlViolation = Boolean(
              compliance?.hasMrlViolation ||
                data.diaries.some((d) => d.mrlStatus && d.mrlStatus !== "pass"),
            );
            const latestLab = data.labTests[0] ?? null;
            const hasLabFailure = Boolean(
              latestLab &&
                (latestLab.result !== "pass" ||
                  Number(latestLab.cdMgKg) > 0.05 ||
                  latestLab.yellowOPositive ||
                  (latestLab.chlorpyrifosMgKg ?? 0) > 0.01),
            );
            const latestLabEffectiveResult = latestLab
              ? hasLabFailure
                ? "fail"
                : "pass"
              : null;

            const effectiveStatus: "approved" | "isolation" | "pending" | "improve" | "violation" =
              plot.status === "violation" ||
              plot.householdStatus === "violation" ||
              openViolationsCount > 0 ||
              hasMrlViolation ||
              hasLabFailure
                ? "violation"
                : activeIsolationUntil
                  ? "isolation"
                  : plot.status === "improve" || plot.householdStatus === "improve"
                    ? "improve"
                    : plot.status === "pending" || plot.householdStatus === "pending" || !hasZoneCode
                      ? "pending"
                      : "approved";

            const statusBadgeText =
              effectiveStatus === "violation"
                ? hasLabFailure
                  ? "MẪU KIỂM NGHIỆM CHƯA ĐẠT"
                  : openViolationsCount > 0 || hasMrlViolation
                    ? "ĐANG CÓ CẢNH BÁO KỸ THUẬT"
                    : "TẠM DỪNG MÃ XUẤT KHẨU"
                : effectiveStatus === "isolation"
                  ? `ĐANG CÁCH LY PHI (ĐẾN ${formatDate(activeIsolationUntil)})`
                  : effectiveStatus === "improve"
                    ? "CẦN KHẮC PHỤC KỸ THUẬT"
                    : effectiveStatus === "pending"
                      ? "ĐANG THẨM ĐỊNH HỒ SƠ PUC"
                      : "ĐỦ ĐIỀU KIỆN XUẤT KHẨU";

            const watermarkMeta =
              effectiveStatus === "violation"
                ? { center: "CẢNH BÁO", bottom: "GIÁM SÁT VÙNG TRỒNG" }
                : effectiveStatus === "isolation"
                  ? { center: "ĐANG CÁCH LY", bottom: "KIỂM SOÁT PHI" }
                  : effectiveStatus === "pending" || effectiveStatus === "improve"
                    ? { center: "CHỜ THẨM ĐỊNH", bottom: "HỒ SƠ VÙNG TRỒNG" }
                    : { center: "ĐÃ ĐỊNH DANH", bottom: "MÃ VÙNG TRỒNG PUC" };

            const locationDisplay = data.puc.location || plot.village || "Chưa cập nhật vị trí";

            const areaHaNum = Number(plot.areaHa || plot.gisAreaHa || 0);
            const areaDisplay =
              areaHaNum > 0
                ? `${areaHaNum.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha`
                : "Chưa cập nhật";

            const varietyMeta = plot.variety
              ? `${plot.variety}${plot.plantedYear ? ` · trồng ${plot.plantedYear}` : ""}`
              : plot.plantedYear
                ? `Trồng năm ${plot.plantedYear}`
                : null;

            const sheetParcelDisplay =
              plot.sheetNo || plot.parcelNo
                ? `Tờ ${plot.sheetNo || "—"} / Thửa ${plot.parcelNo || "—"}`
                : "Chưa cập nhật";

            const coordsDisplay =
              plot.lat !== null &&
              plot.lat !== undefined &&
              plot.lng !== null &&
              plot.lng !== undefined
                ? `${Number(plot.lat).toFixed(4)}°B, ${Number(plot.lng).toFixed(4)}°Đ`
                : null;

            const totalDiaryCount = compliance?.diaryCount ?? data.diaries.length;

            const rawStandard = (data.puc.standard || "").trim();
            const conciseStandard =
              rawStandard.includes("VietGAP") && rawStandard.includes("GACC")
                ? "VietGAP · Nghị định thư GACC"
                : rawStandard || "VietGAP";

            const householdsList = data.households ?? [];
            const realContribHousehold = householdsList.find(
              (h) => (h.contributedKg ?? h.weightKg ?? 0) > 0 && (h.lotCount ?? 0) > 0,
            );

            return (
              <>
                {/* ─── Hồ Sơ Minh Bạch Mã Vùng Trồng Thống Nhất Khung Căn Chỉnh ─── */}
                <div className="tr-puc-dossier">
                  {/* 1. Banner Xanh Rừng (Mobile căn trục giữa · Laptop dàn ngang 2 bên) */}
                  <section className={`tr-puc-banner is-${effectiveStatus}`}>
                    <div className="tr-puc-banner-inner">
                      <div className="tr-puc-crest" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/logo.png"
                          alt="Biểu trưng HTX Sầu Riêng Cư Né"
                          className="tr-puc-crest-img"
                        />
                      </div>

                      <div className="tr-puc-banner-body">
                        <div className="tr-puc-banner-heading">
                          <h1 className="tr-puc-banner-title">TRUY XUẤT NGUỒN GỐC</h1>
                          <p className="tr-puc-banner-sub">
                            Hồ sơ định danh mã số vùng trồng PUC &amp; giám sát canh tác thực địa – {data.puc.name}
                          </p>
                        </div>

                        <div className={`tr-puc-status-pill is-${effectiveStatus}`}>
                          {effectiveStatus === "approved" ? (
                            <svg
                              viewBox="0 0 24 24"
                              width="17"
                              height="17"
                              fill="none"
                              className="tr-puc-status-seal"
                              aria-hidden="true"
                            >
                              <path
                                d="M12 1.8l2.4 1.6 2.9-.3 1.2 2.6 2.6 1.2-.3 2.9 1.6 2.4-1.6 2.4.3 2.9-2.6 1.2-1.2 2.6-2.9-.3-2.4 1.6-2.4-1.6-2.9.3-1.2-2.6-2.6-1.2.3-2.9L1.6 12l1.6-2.4-.3-2.9 2.6-1.2 1.2-2.6 2.9.3L12 1.8Z"
                                fill="currentColor"
                              />
                              <path
                                d="M8.3 12.2l2.4 2.4 5.1-5.2"
                                stroke="#ffffff"
                                strokeWidth="2.3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : effectiveStatus === "violation" ? (
                            <ShieldAlert size={16} strokeWidth={2.4} className="tr-puc-status-seal" aria-hidden="true" />
                          ) : effectiveStatus === "improve" ? (
                            <AlertTriangle size={16} strokeWidth={2.4} className="tr-puc-status-seal" aria-hidden="true" />
                          ) : (
                            <Clock size={16} strokeWidth={2.4} className="tr-puc-status-seal" aria-hidden="true" />
                          )}
                          <span>{statusBadgeText}</span>
                        </div>
                      </div>

                      <div className="tr-puc-crest-spacer" aria-hidden="true" />
                    </div>
                  </section>

                  {/* Phần thân hồ sơ: Điện thoại xếp dọc 1 cột · Laptop chia 2 cột cân xứng */}
                  <div className="tr-puc-dossier-body">
                    <div className="tr-puc-col-left">
                      <div className="tr-puc-col-left-sticky">
                        {/* 2. Thẻ Hồ Sơ Chủ Hộ & Thông Số Thửa Đất */}
                        <section className="tr-puc-hero-card" aria-label="Thông tin chủ hộ và thửa đất canh tác">
                          <div className="tr-puc-hero-watermark" aria-hidden="true">
                            <WatermarkStamp
                              topText="HTX SẦU RIÊNG CƯ NÉ"
                              centerText={watermarkMeta.center}
                              bottomText={watermarkMeta.bottom}
                            />
                          </div>

                          <div className="tr-puc-hero-grid">
                            {/* Cột trái: Ảnh đại diện hộ + Tên chủ hộ */}
                            <div className="tr-puc-owner-col">
                              <HouseholdPortrait avatarUrl={avatarUrl} name={ownerName} />
                              <div className="tr-puc-owner-caption">
                                <span className="tr-puc-owner-lbl">Chủ hộ</span>
                                <strong className="tr-puc-owner-name">{ownerName}</strong>
                              </div>
                            </div>

                            {/* Cột phải: Bảng thông số định danh căn cột thẳng hàng */}
                            <dl className="tr-puc-specs-col">
                              <div className="tr-puc-spec-row">
                                <dt className="tr-puc-spec-lbl">Mã vùng trồng</dt>
                                <dd className="tr-puc-spec-val is-num">
                                  {realZoneCode || <span className="tr-puc-muted">Chưa cấp mã</span>}
                                </dd>
                              </div>

                              <div className="tr-puc-spec-row">
                                <dt className="tr-puc-spec-lbl">Mã lô vườn</dt>
                                <dd className="tr-puc-spec-val tr-puc-plot-inline">
                                  <span className="tr-puc-plot-chip">{plot.code}</span>
                                </dd>
                              </div>

                              <div className="tr-puc-spec-row">
                                <dt className="tr-puc-spec-lbl">Vị trí</dt>
                                <dd className="tr-puc-spec-val">{locationDisplay}</dd>
                              </div>

                              <div className="tr-puc-spec-row">
                                <dt className="tr-puc-spec-lbl">Diện tích</dt>
                                <dd className="tr-puc-spec-val is-num">
                                  <span>{areaDisplay}</span>
                                  {varietyMeta && <span className="tr-puc-spec-note"> · {varietyMeta}</span>}
                                </dd>
                              </div>

                              <div className="tr-puc-spec-row">
                                <dt className="tr-puc-spec-lbl">Địa chính</dt>
                                <dd className="tr-puc-spec-val is-num">{sheetParcelDisplay}</dd>
                              </div>
                            </dl>
                          </div>

                          {/* Thanh hành động GIS trải đều chân thẻ, cân đối 2 cột trên */}
                          {hasGisBoundary ? (
                            <button
                              type="button"
                              className="tr-puc-gis-btn"
                              onClick={openPlotGisModal}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="17"
                                height="17"
                                fill="none"
                                aria-hidden="true"
                                className="tr-puc-gis-pin"
                              >
                                <path
                                  d="M12 2.2C7.86 2.2 4.5 5.56 4.5 9.7c0 5.38 6.42 11.45 6.7 11.7a1.2 1.2 0 0 0 1.6 0c.28-.25 6.7-6.32 6.7-11.7 0-4.14-3.36-7.5-7.5-7.5Zm0 10.3a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z"
                                  fill="currentColor"
                                />
                              </svg>
                              <span>Xem trên bản đồ</span>
                            </button>
                          ) : (
                            <div className="tr-puc-gis-empty">Chưa cập nhật tọa độ ranh giới GIS trên hệ thống</div>
                          )}
                        </section>

                        {/* Thẻ Đơn vị quản lý vùng trồng & Mã QR truy xuất (Cân đối trên cả Mobile & Laptop) */}
                        <section
                          className="tr-puc-legal-card"
                          aria-label="Đơn vị quản lý vùng trồng và mã QR truy xuất"
                        >
                          <div className="tr-puc-legal-head">
                            <div className="tr-puc-legal-heading">
                              <span className="tr-puc-legal-kicker">ĐƠN VỊ QUẢN LÝ MÃ VÙNG</span>
                              <strong className="tr-puc-legal-org">{data.puc.name}</strong>
                            </div>

                            <div className="tr-puc-legal-qr-box">
                              {qrSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={qrSrc}
                                  alt={`Mã QR truy xuất lô ${plot.code}`}
                                  className="tr-asset-qr-img"
                                />
                              ) : (
                                <div className="tr-asset-qr-loading" aria-hidden="true">
                                  <QrCode size={24} strokeWidth={1.8} />
                                </div>
                              )}
                            </div>
                          </div>

                          <dl className="tr-puc-specs-col tr-puc-legal-specs">
                            <div className="tr-puc-spec-row">
                              <dt className="tr-puc-spec-lbl">Quy chuẩn</dt>
                              <dd className="tr-puc-spec-val">{conciseStandard}</dd>
                            </div>

                            <div className="tr-puc-spec-row">
                              <dt className="tr-puc-spec-lbl">Tọa độ GIS</dt>
                              <dd className="tr-puc-spec-val is-num">
                                {coordsDisplay || (hasGisBoundary ? "Đã có ranh giới GIS" : "Chưa cập nhật")}
                              </dd>
                            </div>
                          </dl>
                        </section>
                      </div>
                    </div>

                    <div className="tr-puc-col-right">
                      {/* 3. Thẻ 3 Trụ Cột Xác Thực Đối Xứng (PUC · VietGAP · GACC) */}
                      <CertificationSealsCard
                        hasZoneCode={hasZoneCode}
                        plotStatus={String(plot.status || "pending")}
                        diaryCount={totalDiaryCount}
                        activeIsolationUntil={activeIsolationUntil}
                        hasViolationOrMrl={openViolationsCount > 0 || hasMrlViolation}
                        latestLabResult={latestLabEffectiveResult}
                        effectiveStatus={effectiveStatus}
                      />

                      {/* 4. Thông báo minh bạch khi lô đất đang cách ly PHI hoặc có vi phạm mở */}
                      {(activeIsolationUntil || openViolations.length > 0 || hasMrlViolation) && (
                        <section
                          className={`tr-puc-alert-card ${
                            openViolations.length > 0 || hasMrlViolation ? "is-danger" : "is-warn"
                          }`}
                          aria-label="Cảnh báo giám sát kỹ thuật tại vườn"
                        >
                          <div className="tr-puc-alert-head">
                            {openViolations.length > 0 || hasMrlViolation ? (
                              <ShieldAlert size={18} strokeWidth={2.3} aria-hidden="true" />
                            ) : (
                              <Clock size={18} strokeWidth={2.3} aria-hidden="true" />
                            )}
                            <strong>
                              {openViolations.length > 0 || hasMrlViolation
                                ? "Cảnh báo tuân thủ kỹ thuật đang mở"
                                : "Lô vườn đang trong thời gian cách ly thuốc BVTV (PHI)"}
                            </strong>
                          </div>
                          {activeIsolationUntil && (
                            <p className="tr-puc-alert-desc">
                              Chưa thu hái xuất khẩu cho tới khi hoàn tất thời gian cách ly vào ngày{" "}
                              <strong>{formatDate(activeIsolationUntil)}</strong>.
                            </p>
                          )}
                          {hasMrlViolation && (
                            <p className="tr-puc-alert-desc">
                              Hệ thống ghi nhận đợt phun thuốc có nguy cơ vượt ngưỡng dư lượng MRL cần kiểm tra lại trước khi thu hoạch.
                            </p>
                          )}
                          {openViolations.map((v, idx) => (
                            <p key={idx} className="tr-puc-alert-desc">
                              • <strong>{formatDate(v.detectedOn)}:</strong> {v.title}
                              {v.description ? ` — ${v.description}` : ""}
                            </p>
                          ))}
                        </section>
                      )}

                      {/* 5. Nhật Ký Canh Tác Chứng Minh */}
                      <ProvenDiarySection diaries={data.diaries} totalCount={totalDiaryCount} />

                      {/* 6. Phiếu kiểm nghiệm an toàn thực phẩm tại vườn (hiển thị minh bạch cả đạt & vượt ngưỡng) */}
                      {latestLab && (
                        <section className="tr-card">
                          <div className="tr-card-header">
                            <h2 className="tr-card-title">Phiếu kiểm nghiệm an toàn thực phẩm</h2>
                            <span className={hasLabFailure ? "tr-badge-red" : "tr-badge-green"}>
                              {hasLabFailure ? "Không đạt chuẩn" : "Đạt chuẩn"}
                            </span>
                          </div>
                          <p className="tr-card-sub">
                            Phiếu kiểm nghiệm <strong>{latestLab.code}</strong> ({formatDate(latestLab.sampledOn)}) tại{" "}
                            {latestLab.lab}.
                          </p>
                          <div className="tr-safety-list">
                            <div className="tr-safety-item">
                              <div className="tr-safety-info">
                                <strong className="tr-safety-name">Kim loại nặng Cadimi (Cd)</strong>
                                <span className="tr-safety-detail">
                                  Kết quả: {latestLab.cdMgKg} mg/kg (Ngưỡng tối đa: 0.05 mg/kg)
                                </span>
                              </div>
                              <span className={Number(latestLab.cdMgKg) <= 0.05 ? "tr-pass-pill" : "tr-fail-pill"}>
                                {Number(latestLab.cdMgKg) <= 0.05 ? "ĐẠT CHUẨN" : "VƯỢT NGƯỠNG"}
                              </span>
                            </div>

                            <div className="tr-safety-item">
                              <div className="tr-safety-info">
                                <strong className="tr-safety-name">Chất nhuộm Vàng O (Auramine O)</strong>
                                <span className="tr-safety-detail">
                                  Kết quả: {latestLab.yellowOPositive ? "Dương tính" : "Âm tính (Không phát hiện)"}
                                </span>
                              </div>
                              <span className={latestLab.yellowOPositive ? "tr-fail-pill" : "tr-pass-pill"}>
                                {latestLab.yellowOPositive ? "KHÔNG ĐẠT" : "AN TOÀN"}
                              </span>
                            </div>

                            <div className="tr-safety-item">
                              <div className="tr-safety-info">
                                <strong className="tr-safety-name">Dư lượng thuốc trừ sâu Chlorpyrifos</strong>
                                <span className="tr-safety-detail">
                                  Kết quả:{" "}
                                  {latestLab.chlorpyrifosMgKg !== null &&
                                  latestLab.chlorpyrifosMgKg !== undefined
                                    ? `${latestLab.chlorpyrifosMgKg} mg/kg (Ngưỡng: 0.01 mg/kg)`
                                    : "KPH (Không phát hiện dư lượng)"}
                                </span>
                              </div>
                              <span className={(latestLab.chlorpyrifosMgKg ?? 0) <= 0.01 ? "tr-pass-pill" : "tr-fail-pill"}>
                                {(latestLab.chlorpyrifosMgKg ?? 0) <= 0.01 ? "ĐẠT CHUẨN" : "VƯỢT NGƯỠNG"}
                              </span>
                            </div>
                          </div>
                        </section>
                      )}

                      {/* 7. Sản lượng thu hoạch thực tế đã đóng góp (nếu có) */}
                      {realContribHousehold && (
                        <section className="tr-card">
                          <div className="tr-card-header">
                            <h2 className="tr-card-title">Sản lượng thu hoạch đã đóng góp</h2>
                            <span className="tr-badge-green">{realContribHousehold.lotCount} lô hàng</span>
                          </div>
                          <div className="tr-farmer-item">
                            <div className="tr-farmer-row-left">
                              <HouseholdPortrait
                                avatarUrl={realContribHousehold.avatarUrl || avatarUrl}
                                name={realContribHousehold.householdName}
                                className="tr-farmer-avatar"
                              />
                              <div className="tr-farmer-main">
                                <strong className="tr-farmer-name">{realContribHousehold.householdName}</strong>
                                <span className="tr-farmer-sub">
                                  Mã hộ: {realContribHousehold.householdCode}
                                </span>
                              </div>
                            </div>
                            <div className="tr-farmer-qty">
                              <span className="tr-farmer-kg">
                                {Number(
                                  realContribHousehold.weightKg ?? realContribHousehold.contributedKg ?? 0,
                                ).toLocaleString("vi-VN")}{" "}
                                kg
                              </span>
                              <span className="tr-farmer-pct">Tổng sản lượng thực tế</span>
                            </div>
                          </div>
                        </section>
                      )}
                    </div>
                  </div>
                </div>

                {/* ─── Thao tác Trang chủ · In hồ sơ PDF · Chia sẻ liên kết minh bạch ─── */}
                <div className="tr-actions">
                  <Link href="/" className="tr-home-btn">
                    <ArrowLeft size={17} strokeWidth={2.3} aria-hidden="true" />
                    <span>Trang chủ</span>
                  </Link>
                  <button type="button" className="tr-print-btn" onClick={handlePrint}>
                    <Printer size={17} strokeWidth={2.2} aria-hidden="true" />
                    <span>In hồ sơ / Lưu PDF</span>
                  </button>
                  <button type="button" className="tr-share-btn" onClick={handleShare}>
                    {copied ? (
                      <>
                        <Check size={17} strokeWidth={2.4} aria-hidden="true" />
                        <span>Đã sao chép liên kết</span>
                      </>
                    ) : (
                      <>
                        <Share2 size={17} strokeWidth={2.2} aria-hidden="true" />
                        <span>Chia sẻ hồ sơ vùng trồng</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            );
          })()
        ) : data ? (
          /* ═══════════════════════════════════════════════════════════════════════════
             GIAO DIỆN TRUY XUẤT LÔ HÀNG XUẤT KHẨU & TEM NÔNG HỘ / TEM TRÁI SẦU RIÊNG
             (Đồng bộ ảnh đại diện hộ dân từ Profile & Nhật ký canh tác chứng minh)
             ═══════════════════════════════════════════════════════════════════════════ */
          <>
            {/* ─── Khối Xác thực Tem Riêng Lẻ (nếu quét đúng tem quả hoặc tem thùng xuất khẩu) ─── */}
            {data.item && (
              <section className="tr-item-banner">
                <div className="tr-item-badge">
                  {data.item.itemType === "fruit" ? (
                    <>
                      <Tag size={14} />
                      <span>XÁC THỰC TEM ĐỊNH DANH QUẢ SẦU RIÊNG CHÍNH HÃNG</span>
                    </>
                  ) : (
                    <>
                      <Package size={14} />
                      <span>XÁC THỰC TEM ĐỊNH DANH THÙNG CARTON XUẤT KHẨU</span>
                    </>
                  )}
                </div>
                <div className="tr-item-details">
                  <div className="tr-item-code-box">
                    <span className="tr-item-lbl">Mã tem Serial:</span>
                    <strong className="tr-item-code">{data.item.serialCode}</strong>
                  </div>
                  <div className="tr-item-pill-group">
                    <span className="tr-grade-pill">HẠNG {data.item.grade ?? "A"} (XUẤT KHẨU)</span>
                    {data.item.weightKg && (
                      <span className="tr-weight-pill">
                        {data.item.weightKg} kg {data.item.itemType === "fruit" ? "/ Trái" : "/ Thùng"}
                      </span>
                    )}
                    <span className="tr-secure-pill">
                      <CheckCircle2 size={13} color="#15803d" />
                      <span>TEM ĐIỆN TỬ HỢP LỆ</span>
                    </span>
                  </div>
                </div>
                <p className="tr-item-sub">
                  Sản phẩm này đã được dán tem định danh điện tử theo quy trình kiểm soát nguồn gốc nghiêm ngặt của HTX Cư Né và Doanh nghiệp xuất khẩu.
                </p>
              </section>
            )}

            {/* ─── Khối Xác thực Tem Nông Hộ Quả Sầu Riêng Tận Vườn (CheckVN) ─── */}
            {data.farmerStamp && (
              <section className="tr-item-banner">
                <div
                  className="tr-item-badge"
                  style={
                    data.farmerStamp.status === "activated"
                      ? undefined
                      : { background: "#fef3c7", color: "#b45309" }
                  }
                >
                  <Tag size={14} />
                  <span>
                    {data.farmerStamp.status === "activated"
                      ? "TEM ĐIỆN TỬ ĐÃ KÍCH HOẠT THU HÁI TẠI VƯỜN (CHECKVN)"
                      : "TEM ĐIỆN TỬ ĐÃ CẤP CHO NÔNG HỘ – CHƯA KÍCH HOẠT"}
                  </span>
                </div>
                <div className="tr-item-details">
                  <div className="tr-item-code-box">
                    <span className="tr-item-lbl">Mã tem Serial:</span>
                    <strong className="tr-item-code">{data.farmerStamp.serialCode}</strong>
                  </div>
                  <div className="tr-item-pill-group">
                    <span className="tr-grade-pill">
                      HẠNG {data.farmerStamp.grade ?? "A"}{" "}
                      {data.farmerStamp.status === "activated" ? "(XUẤT KHẨU)" : ""}
                    </span>
                    {data.farmerStamp.fruitWeightKg && (
                      <span className="tr-weight-pill">{data.farmerStamp.fruitWeightKg} kg / Quả</span>
                    )}
                    <span
                      className="tr-secure-pill"
                      style={{ color: data.farmerStamp.status === "activated" ? "#15803d" : "#b45309" }}
                    >
                      <CheckCircle2
                        size={13}
                        color={data.farmerStamp.status === "activated" ? "#15803d" : "#b45309"}
                      />
                      <span>
                        {data.farmerStamp.status === "activated"
                          ? "CHÍNH CHỦ ĐÃ KÍCH HOẠT"
                          : "ĐÃ CẤP THEO MÃ NÔNG HỘ"}
                      </span>
                    </span>
                  </div>
                </div>
                <p className="tr-item-sub">
                  Tem cấp phát cho nông hộ <strong>{data.farmerStamp.householdName}</strong> (Mã hộ:{" "}
                  {data.farmerStamp.householdCode}) theo định mức diện tích của vườn sầu riêng HTX Cư Né.
                </p>
              </section>
            )}

            {/* ─── Thẻ 1: Tem Lô Hàng Điện Tử (Đồng bộ thiết kế HarvestAssetTagCard + Watermark) ─── */}
            {data.farmerStamp ? (
              <section className="tr-asset-card" data-status={data.farmerStamp.status}>
                <div className="tr-asset-watermark" aria-hidden="true">
                  <WatermarkStamp
                    topText="HTX SẦU RIÊNG CƯ NÉ"
                    centerText={data.farmerStamp.status === "activated" ? "ĐÃ KÍCH HOẠT" : "ĐÃ CẤP TEM"}
                    bottomText="TRUY XUẤT NGUỒN GỐC"
                  />
                </div>

                <div className="tr-asset-left">
                  <div className="tr-asset-sub-title">
                    <span>SẦU RIÊNG TƯƠI</span>
                    <span className="tr-asset-dot">·</span>
                    <span className="tr-asset-hide-mobile">HTX CƯ NÉ</span>
                    <span className="tr-asset-dot tr-asset-hide-mobile">·</span>
                    <span>{data.puc.code}</span>
                  </div>

                  <div className="tr-asset-code-line">
                    <span className="tr-asset-code-val">TEM {data.farmerStamp.serialCode}</span>
                    <span className="tr-asset-code-divider">·</span>
                    <span className="tr-asset-weight-val">
                      {data.farmerStamp.fruitWeightKg
                        ? `KLT: ${data.farmerStamp.fruitWeightKg} kg`
                        : `HẠNG ${data.farmerStamp.grade ?? "A"}`}
                    </span>
                  </div>

                  <div className="tr-asset-id-group">
                    <span className="tr-asset-id-label">CHỦ HỘ</span>
                    <strong className="tr-asset-id-val">{data.farmerStamp.householdName}</strong>
                    <span className="tr-asset-dot">·</span>
                    <span className="tr-asset-id-label">MÃ HỘ</span>
                    <strong className="tr-asset-id-val">{data.farmerStamp.householdCode}</strong>
                  </div>

                  <div className="tr-asset-meta">
                    <span>Lô đất: {data.farmerStamp.plotCode || "Chưa gắn lô"}</span>
                    <span className="tr-asset-meta-dot">·</span>
                    <span>Thôn: {data.farmerStamp.villageName} (VietGAP &amp; GACC)</span>
                  </div>
                </div>

                <div className="tr-asset-right">
                  <div className="tr-asset-qr-box">
                    {qrSrc ? (
                      <img
                        src={qrSrc}
                        alt={`Mã QR tra cứu ${data.farmerStamp.serialCode}`}
                        className="tr-asset-qr-img"
                      />
                    ) : (
                      <div className="tr-asset-qr-loading" aria-hidden="true">
                        <QrCode size={110} strokeWidth={1.8} />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <section className="tr-asset-card" data-status={data.lot?.status || "exported"}>
                <div className="tr-asset-watermark" aria-hidden="true">
                  <WatermarkStamp
                    topText="HTX SẦU RIÊNG CƯ NÉ"
                    centerText={
                      data.lot?.status === "delivered"
                        ? "ĐÃ GIAO HÀNG"
                        : data.lot?.status === "in_transit"
                          ? "ĐANG VẬN CHUYỂN"
                          : data.lot?.status === "sampling"
                            ? "ĐANG LẤY MẪU"
                            : "ĐÃ XUẤT KHO"
                    }
                    bottomText="CHỨNG THỰC XUẤT XỨ"
                  />
                </div>

                <div className="tr-asset-left">
                  <div className="tr-asset-sub-title">
                    <span>SẦU RIÊNG TƯƠI</span>
                    <span className="tr-asset-dot">·</span>
                    <span className="tr-asset-hide-mobile">HTX CƯ NÉ</span>
                    <span className="tr-asset-dot tr-asset-hide-mobile">·</span>
                    <span>{data.puc.code}</span>
                  </div>

                  <div className="tr-asset-code-line">
                    <span className="tr-asset-code-val">LÔ {data.lot?.code ?? code}</span>
                    <span className="tr-asset-code-divider">·</span>
                    <span className="tr-asset-weight-val">
                      KLT: {((data.lot?.weightTons ?? 0) * 1000).toLocaleString("vi-VN")} kg (
                      {data.lot?.weightTons ?? 0} Tấn)
                    </span>
                  </div>

                  <div className="tr-asset-id-group">
                    <span className="tr-asset-id-label">MÃ TRUY XUẤT</span>
                    <strong className="tr-asset-id-val">{data.lot?.qrCode ?? code}</strong>
                    <span className="tr-asset-dot">·</span>
                    <span className="tr-asset-id-label">MÃ PHC</span>
                    <strong className="tr-asset-id-val">
                      {data.supplyChain?.packhouse.code || data.lot?.packhouseCode || "VN-DLPH-0089"}
                    </strong>
                  </div>

                  <div className="tr-asset-meta">
                    <span>Ngày thu: {formatDate(data.lot?.harvestedOn ?? "")}</span>
                    <span className="tr-asset-meta-dot">·</span>
                    <span>
                      {data.lot?.buyer || "HTX Nông Nghiệp Cư Né"} (
                      {data.lot?.market === "Trung Quốc"
                        ? "Xuất khẩu TQ"
                        : data.lot?.market || "Xuất khẩu chính ngạch"}
                      )
                    </span>
                  </div>
                </div>

                <div className="tr-asset-right">
                  <div className="tr-asset-qr-box">
                    {qrSrc ? (
                      <img
                        src={qrSrc}
                        alt={`Mã QR tra cứu nguồn gốc lô ${data.lot?.code ?? code}`}
                        className="tr-asset-qr-img"
                      />
                    ) : (
                      <div className="tr-asset-qr-loading" aria-hidden="true">
                        <QrCode size={110} strokeWidth={1.8} />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ─── Thân chi tiết Lô hàng / Tem nông hộ: Điện thoại 1 cột · Laptop dàn đều 2 cột ─── */}
            <div className="tr-lot-grid">
              <div className="tr-lot-col-main">
                {/* ─── Thẻ 2: Hành trình Chuỗi Cung Ứng (Chỉ hiển thị khi lô hàng xuất kho có dữ liệu sơ chế & vận chuyển) ─── */}
                {data.supplyChain && (
                  <section className="tr-card tr-lot-order-supply">
                    <div className="tr-card-header">
                      <h2 className="tr-card-title">Hành trình Chuỗi Cung Ứng Khép Kín</h2>
                      <span className="tr-badge-green">Theo hồ sơ lô hàng</span>
                    </div>
                    <p className="tr-card-sub">
                      Hồ sơ đối chiếu xuyên suốt từ vùng trồng, cơ sở đóng gói sơ chế, vận chuyển lạnh đến thị trường tiêu thụ.
                    </p>

                    <div className="tr-timeline-steps" role="list">
                      <div className="tr-step-item">
                        <div className="tr-step-segment">
                          <div className="tr-step-track-col" aria-hidden="true">
                            <div
                              className="tr-step-capsule"
                              style={{ background: "linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)" }}
                            >
                              <div className="tr-step-dot" />
                              <div className="tr-step-dot" />
                            </div>
                          </div>
                          <div className="tr-step-content tr-step-card-blue">
                            <div className="tr-step-head">
                              <strong>1. VÙNG TRỒNG LIÊN KẾT (PUC)</strong>
                              <span className="tr-step-tag">Khảo sát &amp; Canh tác</span>
                            </div>
                            <p className="tr-step-desc">
                              Vùng trồng sầu riêng tập trung HTX Cư Né, mã số <strong>{data.puc.code}</strong>. Canh tác theo quy trình VietGAP, kiểm soát nhật ký phân bón và thời gian cách ly thuốc BVTV (PHI).
                            </p>
                            {data.supplyChain.contract && (
                              <div className="tr-step-subdetail">
                                <span>
                                  Hợp đồng bao tiêu: <strong>{data.supplyChain.contract.code}</strong>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="tr-step-transfer" aria-hidden="true">
                          <div className="tr-step-transfer-track">
                            <div className="tr-step-mini-dot" />
                            <div className="tr-step-mini-dot" />
                            <div className="tr-step-mini-dot" />
                          </div>
                        </div>
                      </div>

                      <div className="tr-step-item">
                        <div className="tr-step-segment">
                          <div className="tr-step-track-col" aria-hidden="true">
                            <div
                              className="tr-step-capsule"
                              style={{ background: "linear-gradient(180deg, #10b981 0%, #34d399 100%)" }}
                            >
                              <div className="tr-step-dot" />
                              <div className="tr-step-dot" />
                            </div>
                          </div>
                          <div className="tr-step-content tr-step-card-mint">
                            <div className="tr-step-head">
                              <strong>2. SƠ CHẾ &amp; ĐÓNG GÓI (PHC)</strong>
                              <span className="tr-step-tag">Nhà máy đóng gói</span>
                            </div>
                            <p className="tr-step-desc">
                              Tại <strong>{data.supplyChain.packhouse.name || "Cơ sở đóng gói liên kết HTX Cư Né"}</strong> (Mã PHC:{" "}
                              <strong>{data.supplyChain.packhouse.code || "VN-DLPH-0089"}</strong>).
                              {data.supplyChain.packhouse.treatmentMethod && (
                                <>
                                  <br />• <strong>Phương pháp sơ chế:</strong> {data.supplyChain.packhouse.treatmentMethod}
                                </>
                              )}
                              {(data.supplyChain.packhouse.gradeAPct !== null ||
                                data.supplyChain.packhouse.avgBrix !== null) && (
                                <>
                                  <br />• <strong>Phân loại chất lượng:</strong>{" "}
                                  {data.supplyChain.packhouse.gradeAPct !== null
                                    ? `Hạng A (${data.supplyChain.packhouse.gradeAPct}%)`
                                    : ""}
                                  {data.supplyChain.packhouse.gradeAPct !== null &&
                                  data.supplyChain.packhouse.avgBrix !== null
                                    ? " · "
                                    : ""}
                                  {data.supplyChain.packhouse.avgBrix !== null ? (
                                    <>
                                      Độ ngọt bình quân <strong>{data.supplyChain.packhouse.avgBrix}° Brix</strong>
                                    </>
                                  ) : null}
                                  .
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="tr-step-transfer" aria-hidden="true">
                          <div className="tr-step-transfer-track">
                            <div className="tr-step-mini-dot" />
                            <div className="tr-step-mini-dot" />
                            <div className="tr-step-mini-dot" />
                          </div>
                        </div>
                      </div>

                      <div className="tr-step-item">
                        <div className="tr-step-segment">
                          <div className="tr-step-track-col" aria-hidden="true">
                            <div
                              className="tr-step-capsule"
                              style={{ background: "linear-gradient(180deg, #8b5cf6 0%, #a78bfa 100%)" }}
                            >
                              <div className="tr-step-dot" />
                              <div className="tr-step-dot" />
                            </div>
                          </div>
                          <div className="tr-step-content tr-step-card-lavender">
                            <div className="tr-step-head">
                              <strong>3. VẬN CHUYỂN CHUỖI LẠNH (COLD CHAIN)</strong>
                              <span className="tr-step-tag">Bảo quản nhiệt độ</span>
                            </div>
                            <p className="tr-step-desc">
                              {data.supplyChain.transport.transporter || data.supplyChain.transport.vehiclePlate ? (
                                <>
                                  Đơn vị vận chuyển:{" "}
                                  <strong>
                                    {data.supplyChain.transport.transporter || "Đang cập nhật đơn vị vận tải"}
                                  </strong>
                                  {data.supplyChain.transport.vehiclePlate ? (
                                    <>
                                      {" "}
                                      · Biển số <strong>{data.supplyChain.transport.vehiclePlate}</strong>
                                    </>
                                  ) : null}
                                  {data.supplyChain.transport.temperatureC !== null ? (
                                    <>
                                      {" "}
                                      · Bảo quản ở <strong>{data.supplyChain.transport.temperatureC}°C</strong>
                                    </>
                                  ) : null}
                                  .
                                </>
                              ) : (
                                "Thông tin phương tiện vận chuyển lạnh sẽ được cập nhật khi lô hàng xuất bến."
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="tr-step-transfer" aria-hidden="true">
                          <div className="tr-step-transfer-track">
                            <div className="tr-step-mini-dot" />
                            <div className="tr-step-mini-dot" />
                            <div className="tr-step-mini-dot" />
                          </div>
                        </div>
                      </div>

                      <div className="tr-step-item">
                        <div className="tr-step-segment">
                          <div className="tr-step-track-col" aria-hidden="true">
                            <div
                              className="tr-step-capsule"
                              style={{ background: "linear-gradient(180deg, #f97316 0%, #fb923c 100%)" }}
                            >
                              <div className="tr-step-dot" />
                              <div className="tr-step-dot" />
                            </div>
                          </div>
                          <div className="tr-step-content tr-step-card-peach">
                            <div className="tr-step-head">
                              <strong>4. ĐỐI CHIẾU KIỂM ĐỊNH &amp; DÁN TEM QR</strong>
                              <span className="tr-step-tag">
                                Thị trường {data.lot?.market || "Xuất khẩu & Nội địa"}
                              </span>
                            </div>
                            <p className="tr-step-desc">
                              {data.labTests[0]
                                ? data.labTests[0].result === "pass"
                                  ? `Đã có phiếu kiểm nghiệm ${data.labTests[0].code} đạt chuẩn an toàn thực phẩm trước khi lưu hành tem QR.`
                                  : `Phiếu kiểm nghiệm ${data.labTests[0].code} đang ghi nhận chỉ tiêu cần rà soát kỹ thuật.`
                                : "Đang chờ đồng bộ phiếu kiểm nghiệm độc lập cho lô hàng trước khi thông quan xuất khẩu."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* ─── Thẻ 5: Hộ nông dân canh tác / Đóng góp lô hàng thực tế (Có ảnh đại diện hộ) ─── */}
                {(() => {
                  const householdsList = data.households ?? [];
                  const sumContribKg = householdsList.reduce(
                    (sum, h) => sum + (h.weightKg && h.weightKg > 0 ? Number(h.weightKg) : 0),
                    0,
                  );
                  const denomKg = totalLotKg > 0 ? totalLotKg : sumContribKg;

                  const sectionTitle = data.farmerStamp
                    ? "Hộ nông dân canh tác & sở hữu tem"
                    : "Hộ nông dân đóng góp lô hàng";

                  const sectionSub = data.farmerStamp
                    ? "Thông tin hộ xã viên được cấp mã tem truy xuất nguồn gốc tại vườn."
                    : "Sản lượng sầu riêng thực tế ghi nhận từ các hộ xã viên tham gia đóng góp vào lô hàng này.";

                  const stampHasGis = Boolean(
                    data.farmerStamp &&
                      (data.farmerStamp.geometryJson ||
                        (data.farmerStamp.lat !== null &&
                          data.farmerStamp.lat !== undefined &&
                          data.farmerStamp.lng !== null &&
                          data.farmerStamp.lng !== undefined)),
                  );

                  return (
                    <section className="tr-card tr-lot-order-farmers">
                      <div className="tr-card-header">
                        <h2 className="tr-card-title">{sectionTitle}</h2>
                        <span className="tr-count-badge">{householdsList.length} hộ</span>
                      </div>
                      <p className="tr-card-sub">{sectionSub}</p>

                      {householdsList.length === 0 ? (
                        <div className="tr-farmer-empty">
                          Chưa ghi nhận số liệu đóng góp sản lượng của hộ nông dân cho lô hàng này.
                        </div>
                      ) : (
                        <div className="tr-farmer-list">
                          {householdsList.map((h, i) => {
                            const realWeightKg =
                              h.weightKg !== null && h.weightKg !== undefined && Number(h.weightKg) > 0
                                ? Number(h.weightKg)
                                : null;
                            const pct =
                              realWeightKg !== null && denomKg > 0
                                ? ((realWeightKg / denomKg) * 100).toFixed(1)
                                : null;

                            return (
                              <div key={i} className="tr-farmer-item">
                                <div className="tr-farmer-row-left">
                                  <HouseholdPortrait
                                    avatarUrl={h.avatarUrl ?? data.farmerStamp?.avatarUrl}
                                    name={h.householdName}
                                    className="tr-farmer-avatar"
                                  />
                                  <div className="tr-farmer-main">
                                    <strong className="tr-farmer-name">{h.householdName}</strong>
                                    <span className="tr-farmer-sub">
                                      Thôn: {h.village} · Mã hộ: {h.householdCode}
                                    </span>
                                  </div>
                                </div>
                                <div className="tr-farmer-qty">
                                  {data.farmerStamp ? (
                                    data.farmerStamp.status === "activated" && realWeightKg !== null ? (
                                      <>
                                        <span className="tr-farmer-kg">
                                          {realWeightKg.toLocaleString("vi-VN")} kg
                                        </span>
                                        <span className="tr-farmer-pct">Khối lượng quả thu hái</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="tr-farmer-pending">Chưa kích hoạt thu hái</span>
                                        <span className="tr-farmer-pct">
                                          {(h.contributedKg ?? 0) > 0
                                            ? `Đã góp ${Number(h.contributedKg).toLocaleString("vi-VN")} kg (${h.lotCount ?? 1} lô)`
                                            : "Chưa đóng góp lô hàng"}
                                        </span>
                                      </>
                                    )
                                  ) : realWeightKg !== null ? (
                                    <>
                                      <span className="tr-farmer-kg">
                                        {realWeightKg.toLocaleString("vi-VN")} kg
                                      </span>
                                      {pct !== null && <span className="tr-farmer-pct">({pct}%)</span>}
                                    </>
                                  ) : (
                                    <span className="tr-farmer-pending">Chưa ghi nhận sản lượng</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {stampHasGis && (
                        <div style={{ marginTop: 12 }}>
                          <button
                            type="button"
                            className="tr-puc-gis-btn"
                            onClick={openStampGisModal}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="17"
                              height="17"
                              fill="none"
                              aria-hidden="true"
                              className="tr-puc-gis-pin"
                            >
                              <path
                                d="M12 2.2C7.86 2.2 4.5 5.56 4.5 9.7c0 5.38 6.42 11.45 6.7 11.7a1.2 1.2 0 0 0 1.6 0c.28-.25 6.7-6.32 6.7-11.7 0-4.14-3.36-7.5-7.5-7.5Zm0 10.3a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z"
                                fill="currentColor"
                              />
                            </svg>
                            <span>Xem trên bản đồ</span>
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })()}

                {/* ─── Thẻ 6: Nhật ký canh tác chứng minh tại vườn ─── */}
                {data.diaries.length > 0 && (
                  <ProvenDiarySection
                    diaries={data.diaries}
                    title="NHẬT KÝ CANH TÁC CHỨNG MINH"
                    subtitle="Lịch sử phun thuốc BVTV (kèm thời gian cách ly PHI), bón phân và chăm sóc tại vườn."
                    className="tr-lot-order-diary"
                  />
                )}
              </div>

              <div className="tr-lot-col-side">
                {/* ─── Thẻ 3: Kiểm tra an toàn thực phẩm ─── */}
                {(() => {
                  const firstLab = data.labTests[0] ?? null;
                  const isLabFail = Boolean(
                    firstLab &&
                      (firstLab.result !== "pass" ||
                        Number(firstLab.cdMgKg) > 0.05 ||
                        firstLab.yellowOPositive ||
                        (firstLab.chlorpyrifosMgKg ?? 0) > 0.01),
                  );
                  return (
                    <section className="tr-card tr-lot-order-lab">
                      <div className="tr-card-header">
                        <h2 className="tr-card-title">Kiểm tra an toàn thực phẩm</h2>
                        <span
                          className={
                            !firstLab ? "tr-badge-neutral" : isLabFail ? "tr-badge-red" : "tr-badge-green"
                          }
                        >
                          {firstLab ? (isLabFail ? "Không đạt" : "Đạt chuẩn") : "Chưa có mẫu"}
                        </span>
                      </div>
                      <p className="tr-card-sub">
                        {firstLab
                          ? `Phiếu kiểm nghiệm ${firstLab.code} (${formatDate(firstLab.sampledOn)}) tại ${firstLab.lab}.`
                          : "Chưa có phiếu kiểm nghiệm gắn với mã truy xuất này trên hệ thống."}
                      </p>

                      {firstLab && (
                        <div className="tr-safety-list">
                          <div className="tr-safety-item">
                            <div className="tr-safety-info">
                              <strong className="tr-safety-name">Kim loại nặng Cadimi (Cd)</strong>
                              <span className="tr-safety-detail">
                                Kết quả: {firstLab.cdMgKg} mg/kg (Mức tối đa cho phép: 0.05 mg/kg)
                              </span>
                            </div>
                            <span className={Number(firstLab.cdMgKg) <= 0.05 ? "tr-pass-pill" : "tr-fail-pill"}>
                              {Number(firstLab.cdMgKg) <= 0.05 ? "ĐẠT CHUẨN" : "VƯỢT NGƯỠNG"}
                            </span>
                          </div>

                          <div className="tr-safety-item">
                            <div className="tr-safety-info">
                              <strong className="tr-safety-name">Chất nhuộm Vàng O (Chất cấm)</strong>
                              <span className="tr-safety-detail">
                                Kết quả: {firstLab.yellowOPositive ? "Dương tính" : "Âm tính (Không phát hiện)"}
                              </span>
                            </div>
                            <span className={firstLab.yellowOPositive ? "tr-fail-pill" : "tr-pass-pill"}>
                              {firstLab.yellowOPositive ? "KHÔNG ĐẠT" : "AN TOÀN"}
                            </span>
                          </div>

                          <div className="tr-safety-item">
                            <div className="tr-safety-info">
                              <strong className="tr-safety-name">Dư lượng thuốc trừ sâu Chlorpyrifos</strong>
                              <span className="tr-safety-detail">
                                Kết quả:{" "}
                                {firstLab.chlorpyrifosMgKg !== null &&
                                firstLab.chlorpyrifosMgKg !== undefined
                                  ? `${firstLab.chlorpyrifosMgKg} mg/kg`
                                  : "KPH (Không phát hiện dư lượng)"}
                              </span>
                            </div>
                            <span className={(firstLab.chlorpyrifosMgKg ?? 0) <= 0.01 ? "tr-pass-pill" : "tr-fail-pill"}>
                              {(firstLab.chlorpyrifosMgKg ?? 0) <= 0.01 ? "ĐẠT CHUẨN" : "VƯỢT NGƯỠNG"}
                            </span>
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })()}

                {/* ─── Thẻ 4: Thông số vùng trồng & Chứng nhận ─── */}
                <section className="tr-card tr-lot-order-legal">
                  <div className="tr-card-header">
                    <h2 className="tr-card-title">Hồ sơ pháp lý &amp; Vùng trồng</h2>
                  </div>

                  <div className="tr-data-list">
                    <div className="tr-data-row">
                      <span className="tr-data-label">Mã số vùng trồng (PUC)</span>
                      <strong className="tr-data-val highlight">{data.puc.code}</strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">Mã cơ sở đóng gói (PHC)</span>
                      <strong className="tr-data-val highlight">
                        {data.supplyChain?.packhouse.code || "VN-DLPH-0089"}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">Đơn vị đại diện</span>
                      <strong className="tr-data-val">{data.puc.name}</strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">Địa chỉ vùng trồng</span>
                      <strong className="tr-data-val">{data.puc.location}</strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">Quy chuẩn áp dụng</span>
                      <strong className="tr-data-val">{data.puc.standard}</strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">
                        {data.lot ? "Doanh nghiệp thu mua" : "Đơn vị quản lý & liên kết"}
                      </span>
                      <strong className="tr-data-val">
                        {data.lot?.buyer || "HTX Kinh Doanh - Dịch Vụ Tổng Hợp Cư Né"}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">
                        {data.lot ? "Thị trường tiêu thụ" : "Định hướng thị trường"}
                      </span>
                      <strong className="tr-data-val">
                        {data.lot?.market || "Xuất khẩu chính ngạch & Nội địa"}
                      </strong>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            {/* ─── Thao tác nhanh cho điện thoại & máy tính ─── */}
            <div className="tr-actions">
              <Link href="/" className="tr-home-btn">
                <ArrowLeft size={17} strokeWidth={2.3} aria-hidden="true" />
                <span>Trang chủ</span>
              </Link>
              <button type="button" className="tr-print-btn" onClick={handlePrint}>
                <Printer size={17} strokeWidth={2.2} aria-hidden="true" />
                <span>In hồ sơ / Lưu PDF</span>
              </button>
              <button type="button" className="tr-share-btn" onClick={handleShare}>
                {copied ? (
                  <>
                    <Check size={17} strokeWidth={2.4} aria-hidden="true" />
                    <span>Đã sao chép liên kết</span>
                  </>
                ) : (
                  <>
                    <Share2 size={17} strokeWidth={2.2} aria-hidden="true" />
                    <span>Chia sẻ hồ sơ truy xuất</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : null}
      </main>

      {/* ─── Chân trang ─── */}
      <footer className="tr-footer">
        <div className={`tr-wrap tr-footer-inner ${isPlotTransparencyView ? "is-plot-narrow" : ""}`}>
          <p className="tr-footer-text">
            Hệ thống quản lý mã số vùng trồng &amp; truy xuất nguồn gốc nông sản
          </p>
          <p className="tr-footer-org">Hợp Tác Xã Nông Nghiệp Cư Né – Tỉnh Đắk Lắk</p>
          <p className="tr-footer-meta">
            Cơ sở dữ liệu xác thực mã số vùng trồng PUC theo tiêu chuẩn Bộ NN&amp;PTNT và GACC.
          </p>
        </div>
      </footer>

      {/* ─── Modal Bản Đồ Vệ Tinh Ranh Giới GIS Thửa Đất (Tải lười khi bấm) ─── */}
      {gisModalPlot && (
        <PlotMapModal
          plot={gisModalPlot.plot}
          householdName={gisModalPlot.householdName}
          onClose={() => setGisModalPlot(null)}
        />
      )}
    </div>
  );
}
