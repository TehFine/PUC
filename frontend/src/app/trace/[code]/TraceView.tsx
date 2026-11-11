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

interface TraceData {
  stampType?: "farmer_fruit" | "plot_signboard" | "lot" | "item";
  isFarmerStamp?: boolean;
  isPlotSignboard?: boolean;
  farmerStamp?: {
    id: number;
    allocationId: number;
    householdId: number;
    plotCode: string | null;
    serialCode: string;
    status: "allocated" | "activated" | "revoked";
    activatedAt: string | null;
    fruitWeightKg: number | null;
    grade: "A" | "B" | "C" | null;
    harvestDate: string | null;
    householdName: string;
    householdCode: string;
    householdPhone: string;
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
    status?: string;
    householdCode?: string | null;
    householdStatus?: string | null;
    avatarUrl?: string | null;
    geometryJson?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  lot?: {
    id: number;
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
    id: number;
    lotId: number;
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
      gradeAPct: number;
      gradeBPct: number;
      gradeCPct: number;
      avgBrix: number;
    };
    transport: {
      transporter: string;
      vehiclePlate: string;
      temperatureC: number;
      departedAt: string;
      estimatedArrival: string;
    };
    contract: {
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

const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
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

/** Thẻ bộ 3 huy hiệu chứng nhận VietGAP – GACC (Trung Quốc) – GlobalGAP. */
function CertificationSealsCard({ status }: { status?: string | null }) {
  const statusLabel =
    status === "pending"
      ? "Đang thẩm định"
      : status === "improve"
        ? "Cần khắc phục"
        : status === "violation"
          ? "Tạm dừng mã"
          : "Đã kiểm định";

  const statusTone =
    status === "pending" || status === "improve"
      ? "is-warn"
      : status === "violation"
        ? "is-danger"
        : "is-verified";

  return (
    <section className="tr-puc-certs-card" aria-label="Chứng nhận tiêu chuẩn vùng trồng">
      <div className="tr-puc-certs-grid">
        {/* 1. Huy hiệu VietGAP */}
        <div className="tr-cert-item">
          <div className="tr-cert-emblem" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="54" height="54">
              <circle cx="32" cy="32" r="30" fill="#ffffff" stroke="#1f8a4c" strokeWidth="2.8" />
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
        </div>

        {/* 2. Huy hiệu GACC (Trung Quốc) */}
        <div className="tr-cert-item">
          <div className="tr-cert-emblem" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="54" height="54">
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
          <span className="tr-cert-label">
            GACC
            <br />
            <small>(Trung Quốc)</small>
          </span>
        </div>

        {/* 3. Huy hiệu GlobalGAP */}
        <div className="tr-cert-item">
          <div className="tr-cert-emblem" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="54" height="54">
              <circle cx="32" cy="32" r="30" fill="#ffffff" stroke="#dce7e0" strokeWidth="2" />
              <circle cx="32" cy="32" r="26" fill="#f7fbf9" />
              <path
                d="M38.5 20.5 A10 10 0 1 0 41.2 29.5 H32.5 V25.8 H45 V30 A13.2 13.2 0 1 1 39.8 17.4 Z"
                fill="#22a05b"
              />
              <text
                x="32"
                y="48"
                textAnchor="middle"
                fill="#15803d"
                fontSize="8.2"
                fontWeight="800"
                letterSpacing="-0.1"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                GlobalGAP
              </text>
            </svg>
          </div>
          <span className="tr-cert-label">GlobalGAP</span>
        </div>
      </div>

      <div className={`tr-puc-cert-status ${statusTone}`}>
        <span>{statusLabel}</span>
      </div>
    </section>
  );
}

/** Khối Nhật ký canh tác chứng minh (Timeline dọc có icon tròn phân màu theo nghiệp vụ). */
function ProvenDiarySection({
  diaries,
  title = "NHẬT KÝ CANH TÁC CHỨNG MINH",
  subtitle,
  emptyMessage = "Hộ nông dân chưa ghi nhận nhật ký canh tác hoặc đợt phun thuốc nào trên lô đất này.",
}: {
  diaries: TraceDiaryEntry[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}) {
  return (
    <section className="tr-card tr-puc-journal-card">
      <h2 className="tr-puc-journal-title">{title}</h2>
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
                    {formatDate(d.entryOn)} - {d.activity}
                  </strong>
                  {d.detail && <p className="tr-proof-detail">{renderDiaryDetailText(d.detail)}</p>}
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

  const isPlotTransparencyView = Boolean(data?.plot && !data?.farmerStamp && !data?.lot);

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
        zoneCode: data.plot.zoneCode || data.puc.code,
        variety: data.plot.variety ?? null,
        plantedYear: data.plot.plantedYear ?? null,
        areaHa: Number(data.plot.areaHa ?? 0),
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
      {/* ─── Thanh đầu trang tối giản ─── */}
      <header className="tr-topbar">
        <div className={`tr-wrap tr-topbar-inner ${isPlotTransparencyView ? "is-plot-narrow" : ""}`}>
          <Link href="/" className="tr-back-btn">
            <ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" />
            <span>Trang chủ</span>
          </Link>

          <span className="tr-verify-tag">
            {isPlotTransparencyView ? "Minh bạch mã vùng trồng PUC" : "Hồ sơ xác thực GACC"}
          </span>
        </div>
      </header>

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
          </div>
        ) : data && isPlotTransparencyView && data.plot ? (
          /* ═══════════════════════════════════════════════════════════════════════════
             GIAO DIỆN TRUY XUẤT TÍNH MINH BẠCH MÃ VÙNG TRỒNG CỦA TỪNG HỘ DÂN (TẠI THỬA ĐẤT)
             Phục vụ cán bộ kiểm tra, đoàn đánh giá GACC và doanh nghiệp xuất khẩu quét tại vườn
             ═══════════════════════════════════════════════════════════════════════════ */
          (() => {
            const plot = data.plot;
            const ownerName = plot.ownerName || "Hộ xã viên HTX Cư Né";
            const avatarUrl = plot.avatarUrl || data.households?.[0]?.avatarUrl || null;
            const hasGisBoundary = Boolean(
              plot.geometryJson || (plot.lat !== null && plot.lat !== undefined && plot.lng !== null && plot.lng !== undefined),
            );
            const effectiveStatus =
              plot.status === "violation" || plot.householdStatus === "violation"
                ? "violation"
                : plot.status === "improve" || plot.householdStatus === "improve"
                  ? "improve"
                  : plot.status === "pending" || plot.householdStatus === "pending"
                    ? "pending"
                    : "approved";

            const statusBadgeText =
              effectiveStatus === "violation"
                ? "TẠM DỪNG MÃ XUẤT KHẨU"
                : effectiveStatus === "improve"
                  ? "CẦN KHẮC PHỤC KỸ THUẬT"
                  : effectiveStatus === "pending"
                    ? "ĐANG THẨM ĐỊNH HỒ SƠ PUC"
                    : "ĐỦ ĐIỀU KIỆN XUẤT KHẨU";

            const locationDisplay = plot.village
              ? `${plot.village}, Xã Ea Khăl, Đắk Lắk`
              : data.puc.location;

            const areaDisplay = plot.areaHa
              ? `${Number(plot.areaHa).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha`
              : "—";

            const varietyMeta = plot.variety
              ? ` (${plot.variety}${plot.plantedYear ? ` · trồng ${plot.plantedYear}` : ""})`
              : plot.plantedYear
                ? ` (trồng ${plot.plantedYear})`
                : "";

            const sheetParcelDisplay =
              plot.sheetNo || plot.parcelNo
                ? `${plot.sheetNo || "—"} / ${plot.parcelNo || "—"}`
                : "Chưa cập nhật";

            const householdsList = data.households ?? [];
            const realContribHousehold = householdsList.find(
              (h) => (h.contributedKg ?? h.weightKg ?? 0) > 0 && (h.lotCount ?? 0) > 0,
            );

            return (
              <>
                {/* ─── Khối 1: Banner Xanh Rừng + Thẻ Hồ Sơ Chủ Hộ & Thửa Đất ─── */}
                <div className="tr-puc-stage">
                  <section className="tr-puc-banner">
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
                        <h1 className="tr-puc-banner-title">TRUY XUẤT NGUỒN GỐC</h1>
                        <div className={`tr-puc-status-pill is-${effectiveStatus}`}>
                          {/* Huy hiệu dấu tích răng cưa chuẩn kiểm định */}
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
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
                          <span>{statusBadgeText}</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="tr-puc-hero-card" aria-label="Thông tin chủ hộ và thửa đất canh tác">
                    <div className="tr-puc-hero-watermark" aria-hidden="true">
                      <WatermarkStamp
                        topText="HTX SẦU RIÊNG CƯ NÉ"
                        centerText="ĐÃ ĐỊNH DANH"
                        bottomText="MÃ VÙNG TRỒNG PUC"
                      />
                    </div>

                    <div className="tr-puc-hero-grid">
                      {/* Cột trái: Ảnh đại diện hộ + Tên chủ hộ */}
                      <div className="tr-puc-owner-col">
                        <HouseholdPortrait avatarUrl={avatarUrl} name={ownerName} />
                        <div className="tr-puc-owner-caption">
                          <span className="tr-puc-owner-lbl">Chủ hộ:</span>
                          <strong className="tr-puc-owner-name">{ownerName}</strong>
                        </div>
                      </div>

                      {/* Cột phải: Thông số định danh vùng trồng & Nút GIS */}
                      <div className="tr-puc-specs-col">
                        <div className="tr-puc-spec-line">
                          <span className="tr-puc-spec-lbl">Mã vùng trồng: </span>
                          <strong className="tr-puc-spec-val">{data.puc.code}</strong>
                        </div>

                        <div className="tr-puc-spec-line">
                          <span className="tr-puc-spec-lbl">Mã lô vườn: </span>
                          <strong className="tr-puc-spec-val tr-puc-plot-chip">{plot.code}</strong>
                        </div>

                        <div className="tr-puc-spec-line">
                          <span className="tr-puc-spec-lbl">Vị trí: </span>
                          <strong className="tr-puc-spec-val">{locationDisplay}</strong>
                        </div>

                        <div className="tr-puc-spec-line">
                          <span className="tr-puc-spec-lbl">Diện tích: </span>
                          <strong className="tr-puc-spec-val">
                            {areaDisplay}
                            {varietyMeta && <span className="tr-puc-spec-note">{varietyMeta}</span>}
                          </strong>
                        </div>

                        <div className="tr-puc-spec-line">
                          <span className="tr-puc-spec-lbl">Số tờ/Thửa: </span>
                          <strong className="tr-puc-spec-val">{sheetParcelDisplay}</strong>
                        </div>

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
                            <span>Xem bản đồ ranh giới GIS</span>
                          </button>
                        ) : (
                          <div className="tr-puc-gis-empty">Chưa cập nhật tọa độ ranh giới GIS</div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>

                {/* ─── Khối 2: Dải Huy Hiệu Chứng Nhận VietGAP · GACC · GlobalGAP ─── */}
                <CertificationSealsCard status={effectiveStatus} />

                {/* ─── Khối 3: NHẬT KÝ CANH TÁC CHỨNG MINH (Phun thuốc + Bón phân + Chăm sóc) ─── */}
                <ProvenDiarySection diaries={data.diaries} />

                {/* ─── Khối 4 (Tùy chọn thực tế): Kiểm nghiệm an toàn thực phẩm tại vườn (nếu có mẫu) ─── */}
                {data.labTests.length > 0 && (
                  <section className="tr-card">
                    <div className="tr-card-header">
                      <h2 className="tr-card-title">Phiếu kiểm nghiệm an toàn thực phẩm</h2>
                      <span className="tr-badge-green">
                        {data.labTests[0].result === "pass" ? "Đạt chuẩn" : "Cần lưu ý"}
                      </span>
                    </div>
                    <p className="tr-card-sub">
                      Phiếu kiểm nghiệm {data.labTests[0].code} ({formatDate(data.labTests[0].sampledOn)}) tại{" "}
                      {data.labTests[0].lab}.
                    </p>
                    <div className="tr-safety-list">
                      <div className="tr-safety-item">
                        <div className="tr-safety-info">
                          <strong className="tr-safety-name">Kim loại nặng Cadimi (Cd)</strong>
                          <span className="tr-safety-detail">
                            Kết quả: {data.labTests[0].cdMgKg} mg/kg (Ngưỡng tối đa: 0.05 mg/kg)
                          </span>
                        </div>
                        <span className="tr-pass-pill">
                          {Number(data.labTests[0].cdMgKg) <= 0.05 ? "ĐẠT CHUẨN" : "VƯỢT NGƯỠNG"}
                        </span>
                      </div>

                      <div className="tr-safety-item">
                        <div className="tr-safety-info">
                          <strong className="tr-safety-name">Chất nhuộm Vàng O (Auramine O)</strong>
                          <span className="tr-safety-detail">
                            Kết quả: {data.labTests[0].yellowOPositive ? "Dương tính" : "Âm tính (Không phát hiện)"}
                          </span>
                        </div>
                        <span className="tr-pass-pill">
                          {data.labTests[0].yellowOPositive ? "KHÔNG ĐẠT" : "AN TOÀN"}
                        </span>
                      </div>

                      <div className="tr-safety-item">
                        <div className="tr-safety-info">
                          <strong className="tr-safety-name">Dư lượng thuốc trừ sâu Chlorpyrifos</strong>
                          <span className="tr-safety-detail">
                            Kết quả:{" "}
                            {data.labTests[0].chlorpyrifosMgKg !== null &&
                            data.labTests[0].chlorpyrifosMgKg !== undefined
                              ? `${data.labTests[0].chlorpyrifosMgKg} mg/kg`
                              : "KPH (Không phát hiện dư lượng)"}
                          </span>
                        </div>
                        <span className="tr-pass-pill">
                          {(data.labTests[0].chlorpyrifosMgKg ?? 0) <= 0.01 ? "ĐẠT CHUẨN" : "VƯỢT NGƯỠNG"}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* ─── Khối 5 (Chỉ hiện khi hộ ĐÃ CÓ đóng góp sản lượng thực tế vào lô thu hoạch) ─── */}
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
                          {Number(realContribHousehold.weightKg ?? realContribHousehold.contributedKg ?? 0).toLocaleString("vi-VN")} kg
                        </span>
                        <span className="tr-farmer-pct">Tổng sản lượng thực tế</span>
                      </div>
                    </div>
                  </section>
                )}

                {/* ─── Thao tác In hồ sơ PDF & Chia sẻ liên kết minh bạch ─── */}
                <div className="tr-actions">
                  <button type="button" className="tr-print-btn" onClick={handlePrint}>
                    <Printer size={18} strokeWidth={2.2} aria-hidden="true" />
                    <span>In hồ sơ / Lưu PDF</span>
                  </button>
                  <button type="button" className="tr-share-btn" onClick={handleShare}>
                    {copied ? (
                      <>
                        <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                        <span>Đã sao chép liên kết</span>
                      </>
                    ) : (
                      <>
                        <Share2 size={18} strokeWidth={2.2} aria-hidden="true" />
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
              <section
                className="tr-item-banner"
                style={{
                  borderLeft: `4px solid ${data.farmerStamp.status === "activated" ? "#16a34a" : "#f59e0b"}`,
                }}
              >
                <div
                  className="tr-item-badge"
                  style={
                    data.farmerStamp.status === "activated"
                      ? undefined
                      : { background: "#fef3c7", borderColor: "#fcd34d", color: "#b45309" }
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

            {/* ─── Thẻ 2: Hành trình Chuỗi Cung Ứng (Vùng trồng -> Sơ chế đóng gói -> Vận chuyển -> Xuất khẩu) ─── */}
            <section className="tr-card">
              <div className="tr-card-header">
                <h2 className="tr-card-title">Hành trình Chuỗi Cung Ứng Khép Kín</h2>
                <span className="tr-badge-green">Minh bạch 100%</span>
              </div>
              <p className="tr-card-sub">
                Hồ sơ theo dõi xuyên suốt từ vườn sầu riêng, cơ sở đóng gói sơ chế, xe vận chuyển lạnh đến cảng xuất khẩu.
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
                        Vùng trồng sầu riêng tập trung HTX Cư Né, mã số <strong>{data.puc.code}</strong>. Canh tác an toàn sinh học theo quy trình VietGAP, kiểm soát nhật ký phân bón và thời gian cách ly thuốc BVTV (PHI).
                      </p>
                      {data.supplyChain?.contract && (
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
                        Tại <strong>{data.supplyChain?.packhouse.name || "Cơ sở đóng gói Đắk Lắk"}</strong> (Mã PHC:{" "}
                        <strong>{data.supplyChain?.packhouse.code || "VN-DLPH-0089"}</strong>).
                        <br />• <strong>Phương pháp sơ chế:</strong>{" "}
                        {data.supplyChain?.packhouse.treatmentMethod ||
                          "Rửa áp lực Ozone, sấy ráo khí động học, khử khuẩn nấm sinh học."}
                        <br />• <strong>Phân loại chất lượng:</strong> Hạng A (
                        {data.supplyChain?.packhouse.gradeAPct ?? 72.5}%) · Độ ngọt bình quân đạt{" "}
                        <strong>{data.supplyChain?.packhouse.avgBrix ?? 33.2}° Brix</strong>.
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
                        Đơn vị logistics:{" "}
                        <strong>{data.supplyChain?.transport.transporter || "Vận tải Lạnh Á Châu"}</strong>.
                        <br />
                        Xe container lạnh biển số{" "}
                        <strong>{data.supplyChain?.transport.vehiclePlate || "47C-289.45"}</strong> duy trì nhiệt độ bảo quản chuẩn{" "}
                        <strong>{data.supplyChain?.transport.temperatureC ?? 13.5}°C</strong> trong suốt hành trình đưa hàng đến cửa khẩu xuất khẩu.
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
                        <strong>4. KIỂM ĐỊNH &amp; DÁN TEM TRUY XUẤT</strong>
                        <span className="tr-step-tag">
                          Thị trường {data.lot?.market || "Xuất khẩu & Nội địa"}
                        </span>
                      </div>
                      <p className="tr-step-desc">
                        Lô hàng đã được kiểm nghiệm độc lập Cadimi an toàn, 100% âm tính chất cấm Vàng O, kích hoạt dải tem QR CheckVN dán trên từng quả và thùng hàng đưa ra thị trường tiêu thụ.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ─── Thẻ 3: Kiểm tra an toàn thực phẩm ─── */}
            <section className="tr-card">
              <div className="tr-card-header">
                <h2 className="tr-card-title">Kiểm tra an toàn thực phẩm</h2>
                <span className="tr-badge-green">
                  {data.labTests[0]
                    ? data.labTests[0].result === "pass"
                      ? "Đạt chuẩn"
                      : "Không đạt"
                    : "Chưa có mẫu"}
                </span>
              </div>
              <p className="tr-card-sub">
                {data.labTests[0]
                  ? `Phiếu kiểm nghiệm ${data.labTests[0].code} (${formatDate(data.labTests[0].sampledOn)}) tại ${data.labTests[0].lab}.`
                  : "Chưa có phiếu kiểm nghiệm gắn với mã truy xuất này."}
              </p>

              {data.labTests[0] && (
                <div className="tr-safety-list">
                  <div className="tr-safety-item">
                    <div className="tr-safety-info">
                      <strong className="tr-safety-name">Kim loại nặng Cadimi (Cd)</strong>
                      <span className="tr-safety-detail">
                        Kết quả: {data.labTests[0].cdMgKg} mg/kg (Mức tối đa cho phép: 0.05 mg/kg)
                      </span>
                    </div>
                    <span className="tr-pass-pill">
                      {Number(data.labTests[0].cdMgKg) <= 0.05 ? "ĐẠT CHUẨN" : "VƯỢT NGƯỠNG"}
                    </span>
                  </div>

                  <div className="tr-safety-item">
                    <div className="tr-safety-info">
                      <strong className="tr-safety-name">Chất nhuộm Vàng O (Chất cấm)</strong>
                      <span className="tr-safety-detail">
                        Kết quả: {data.labTests[0].yellowOPositive ? "Dương tính" : "Âm tính (Không phát hiện)"}
                      </span>
                    </div>
                    <span className="tr-pass-pill">
                      {data.labTests[0].yellowOPositive ? "KHÔNG ĐẠT" : "AN TOÀN"}
                    </span>
                  </div>

                  <div className="tr-safety-item">
                    <div className="tr-safety-info">
                      <strong className="tr-safety-name">Dư lượng thuốc trừ sâu Chlorpyrifos</strong>
                      <span className="tr-safety-detail">
                        Kết quả:{" "}
                        {data.labTests[0].chlorpyrifosMgKg !== null &&
                        data.labTests[0].chlorpyrifosMgKg !== undefined
                          ? `${data.labTests[0].chlorpyrifosMgKg} mg/kg`
                          : "KPH (Không phát hiện dư lượng)"}
                      </span>
                    </div>
                    <span className="tr-pass-pill">
                      {(data.labTests[0].chlorpyrifosMgKg ?? 0) <= 0.01 ? "ĐẠT CHUẨN" : "VƯỢT NGƯỠNG"}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* ─── Thẻ 4: Thông số vùng trồng & Chứng nhận ─── */}
            <section className="tr-card">
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
                <section className="tr-card">
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
                        <span>Xem bản đồ ranh giới GIS của vườn</span>
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
              />
            )}

            {/* ─── Thao tác nhanh cho điện thoại & máy tính ─── */}
            <div className="tr-actions">
              <button type="button" className="tr-print-btn" onClick={handlePrint}>
                <Printer size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>In hồ sơ / Lưu PDF</span>
              </button>
              <button type="button" className="tr-share-btn" onClick={handleShare}>
                {copied ? (
                  <>
                    <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                    <span>Đã sao chép liên kết</span>
                  </>
                ) : (
                  <>
                    <Share2 size={18} strokeWidth={2.2} aria-hidden="true" />
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
