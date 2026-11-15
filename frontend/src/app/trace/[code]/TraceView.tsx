"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useAuth } from "@/components/auth/AuthProvider";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { WatermarkStamp } from "@/components/ui/WatermarkStamp";
import { ROLE_LABELS } from "@/constants/roles";
import { reportRequestTime } from "@/lib/network";
import { safeDecodeURIComponent } from "@/utils/url-safety";
import type { Role } from "@/types/api";
import type { PlotStatus, PortalPlot } from "@/types/portal";
import {
  ArrowLeft,
  Search,
  Share2,
  Printer,
  Check,
  CheckCircle2,
  QrCode,
  Clock,
  AlertTriangle,
  ShieldAlert,
  FileText,
  ExternalLink,
  Lock,
  ShieldCheck,
  MapPin,
  Globe,
} from "lucide-react";
import CoarseZoneOverviewMap from "./CoarseZoneOverviewMap";
import {
  TRACE_UI_COPY,
  detectInitialTraceLang,
  persistTraceLang,
  formatTraceDate,
  formatTraceDateTime,
  formatTraceNumber,
  localizeProductName,
  localizeTraceUnitLabel,
  localizeLotStatusLabel,
  localizeZoneStatusLabel,
  localizePackhouseStatusLabel,
  localizeMarket,
  localizeAdminLocation,
  localizeGrowingZoneName,
  localizeCoopName,
  localizeGroupName,
  localizeInspectionNote,
  localizeTimelineStep,
  type TraceLang,
} from "./trace-i18n";
import "./trace.css";

const PlotMapModal = dynamic(() => import("@/components/portal/PlotMapModal"), {
  ssr: false,
});

type ViewerTier = "public" | "enterprise" | "authority";
type ErrorKind = "invalid" | "not_found" | "server" | "timeout" | "network";

interface TraceAccessControl {
  viewerTier: ViewerTier;
  actualTier: ViewerTier;
  roleBaseTier?: ViewerTier;
  viewerTierLabel: string;
  isAuthenticated: boolean;
  viewerRole: Role | null;
  viewerName: string | null;
  scopeDenied?: boolean;
  scopeDeniedMessage?: string | null;
  scopeReason?: string | null;
  auditLogged: boolean;
}

interface TraceTimelineStep {
  step: number;
  key: string;
  title: string;
  date: string | null;
  responsibleUnit: string;
  detail: string;
  status: "completed" | "current" | "upcoming" | "warning" | string;
}

interface TracePublicLabTest {
  code: string;
  sampledOn: string;
  lab: string;
  cdMgKg: number;
  yellowOPositive: boolean;
  residueMgKg: number;
  chlorpyrifosMgKg: number | null;
  result: string;
  scanUrl: string | null;
}

interface TraceRealtimeStatus {
  checkedAt: string;
  allClear: boolean;
  hasSuspensionAlert: boolean;
  lotStatus: string;
  pucCode: string;
  pucStatus: "active" | "suspended" | "revoked" | "pending" | string;
  pucStatusLabel: string;
  pucNote: string | null;
  packhouseCode: string;
  packhouseStatus: "active" | "suspended" | "revoked" | "inactive" | string;
  packhouseStatusLabel: string;
}

interface TracePublicData {
  lotIdentity: {
    productName: string;
    variety: string;
    lotCode: string;
    qrToken?: string | null;
    scannedCode: string;
    traceUnit: "lot" | "box" | "fruit" | "puc_zone" | string;
    traceUnitLabel: string;
    weightTons: number;
    itemWeightKg: number | null;
    itemGrade: string | null;
    market: string;
    status: "valid" | "revoked" | "pending" | "unverified" | string;
    statusLabel: string;
    revokedReason: string | null;
  };
  growingZone: {
    name: string;
    pucCode: string;
    additionalZoneCount: number;
    adminLocation: string;
    status: "active" | "suspended" | "revoked" | "pending" | string;
    statusLabel: string;
    statusNote?: string | null;
    validUntil: string;
    coarseMap: {
      centerLat: number;
      centerLng: number;
      radiusMeters: number;
      zoom: number;
      label: string;
      privacyNote: string;
    };
  };
  producer: {
    cooperativeName: string;
    groupName: string;
    participatingHouseholdCount: number;
    consentedHouseholds: string[];
    consentNote: string;
  };
  packhouse: {
    name: string;
    code: string;
    address: string;
    status?: "active" | "suspended" | "revoked" | "inactive" | string;
    statusLabel?: string;
  };
  realtimeStatus?: TraceRealtimeStatus;
  milestones: {
    harvestedOn: string | null;
    packedOn: string | null;
    exportedOn: string | null;
    sampledOn: string | null;
  };
  timeline: TraceTimelineStep[];
  farmingProcess: {
    standard: string;
    complianceConfirmed: boolean;
    complianceNote: string;
    inspectionNote: string;
  };
  labTests: TracePublicLabTest[];
  phytosanitary: {
    certNo: string | null;
    issuedOn: string | null;
    authority: string;
    statusLabel: string;
  };
  verification: {
    verifiedAt: string;
    totalScans: number;
    scansLast24h: number;
    distinctSources24h?: number;
    distinctCountries24h?: number;
    countries24h?: string[];
    isAbnormal: boolean;
    warningReason?: "revoked" | "realtime_suspended" | "multi_country" | "high_frequency" | null;
    warningMessage: string | null;
    nationalStandardNote: string;
  };
}

interface TraceEnterpriseSourceZone {
  zoneCode: string;
  villageName: string;
  householdCount: number;
  areaHa: number;
  weightKg: number;
  sharePct: number;
  status: string;
}

interface TraceEnterpriseDetailedLab {
  code: string;
  zoneCode: string;
  sampledOn: string;
  lab: string;
  cdMgKg: number;
  cdThresholdMgKg: number;
  yellowOPositive: boolean;
  residueMgKg: number;
  residueThresholdMgKg: number;
  chlorpyrifosMgKg: number | null;
  result: string;
  scanUrl: string | null;
}

interface TraceEnterpriseData {
  sourceZones: TraceEnterpriseSourceZone[];
  totalSourceWeightKg: number;
  detailedLabTests: TraceEnterpriseDetailedLab[];
  packingSpecs: {
    gradeAPct: number | null;
    gradeBPct: number | null;
    gradeCPct: number | null;
    avgBrix: number | null;
    treatmentMethod: string | null;
    transporter: string | null;
    vehiclePlate: string | null;
    temperatureC: number | null;
    departedAt: string | null;
    estimatedArrival: string | null;
  } | null;
}

interface TraceAuthorityPlot {
  plotCode: string;
  zoneCode: string | null;
  sheetNo: string | null;
  parcelNo: string | null;
  variety: string | null;
  plantedYear: number | null;
  areaHa: number;
  status: string;
  source: "declared" | "measured" | "cadastral" | "demo" | string | null;
  lat: number | null;
  lng: number | null;
  geometryJson: string | null;
}

interface TraceAuthorityHousehold {
  householdCode: string;
  householdName: string;
  villageName: string;
  phone: string;
  cccdMasked: string;
  status: string;
  publicTraceConsent: boolean;
  contributedKg: number | null;
  contributedPlotCode?: string | null;
  plots: TraceAuthorityPlot[];
}

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

interface TraceInspectionMinute {
  code: string;
  heldOn: string;
  location: string;
  officer: string;
  result: string;
}

interface TraceInternalViolation {
  severity: "critical" | "warning" | string;
  title: string;
  householdLabel?: string;
  detectedOn: string;
  plotCode?: string | null;
  description?: string | null;
  status?: string;
}

interface TraceAuthorityData {
  sourceHouseholds: TraceAuthorityHousehold[];
  cultivationDiaries: TraceDiaryEntry[];
  inspectionMinutes: TraceInspectionMinute[];
  internalViolations: TraceInternalViolation[];
}

interface TraceData {
  verifiedAt: string;
  accessControl: TraceAccessControl;
  isFarmerStamp?: boolean;
  isPlotSignboard?: boolean;
  item?: {
    serialCode?: string;
    itemType?: string;
    weightKg?: number | null;
    grade?: string | null;
  } | null;
  farmerStamp?: {
    serialCode?: string;
    variety?: string;
  } | null;
  publicData: TracePublicData;
  enterpriseData?: TraceEnterpriseData;
  authorityData?: TraceAuthorityData;
}

function resolveSearchNavigationHref(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const tokenPathMatch = /(?:^|\/)t\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/.exec(trimmed);
  if (tokenPathMatch?.[1]) {
    return `/t/${encodeURIComponent(tokenPathMatch[1])}`;
  }

  const tracePathMatch = /(?:^|\/)trace\/([^/?#\s]+)(?:[/?#]|$)/.exec(trimmed);
  if (tracePathMatch?.[1]) {
    return `/trace/${encodeURIComponent(safeDecodeURIComponent(tracePathMatch[1]))}`;
  }

  if (/^[A-Za-z0-9]{12,24}$/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z0-9]/.test(trimmed)) {
    return `/t/${encodeURIComponent(trimmed)}`;
  }

  return `/trace/${encodeURIComponent(trimmed)}`;
}

/** Phân loại biểu tượng tròn cho từng dòng Nhật ký canh tác ở Cấp 3 (Cơ quan quản lý). */
function classifyDiaryVisual(entry: TraceDiaryEntry): {
  tone: "spray" | "fertilizer" | "prune" | "water" | "care";
  icon: React.ReactNode;
} {
  const act = (entry.activity || "").toLowerCase();
  if (entry.kind === "spray" || /phun|thuốc|bvtv|trừ sâu|trừ nấm|phòng bệnh|diệt khuẩn/.test(act)) {
    return {
      tone: "spray",
      icon: (
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
        <path d="M18.5 5.5C11.5 5.5 6.5 9.6 6.5 16.5c6.9 0 11-4.8 12-11Z" fill="#ffffff" />
        <path d="M6.5 17.5L13.5 10.5" stroke="#15803d" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  };
}

/** Khối Nhật ký canh tác & Phun thuốc BVTV dành riêng cho Cấp 3 (Cơ quan quản lý). */
function AuthorityDiarySection({ diaries }: { diaries: TraceDiaryEntry[] }) {
  return (
    <section className="tr-card tr-puc-journal-card">
      <div className="tr-puc-journal-head">
        <h3 className="tr-puc-journal-title">Nhật ký canh tác &amp; phun thuốc BVTV chi tiết</h3>
        {diaries.length > 0 && <span className="tr-count-badge">{diaries.length} bản ghi</span>}
      </div>
      <p className="tr-card-sub">
        Lưu vết hoạt chất thuốc BVTV, liều lượng phun, thời gian cách ly PHI và người ghi chép thực tế tại hộ.
      </p>

      {diaries.length === 0 ? (
        <div className="tr-farmer-empty">Chưa ghi nhận nhật ký canh tác hoặc đợt phun thuốc nào của các hộ nguồn.</div>
      ) : (
        <div className="tr-proof-timeline" role="list">
          {diaries.map((d, idx) => {
            const visual = classifyDiaryVisual(d);
            const isLast = idx === diaries.length - 1;
            const mrlFailed = d.mrlStatus && d.mrlStatus !== "pass";
            return (
              <div key={idx} className="tr-proof-item" role="listitem">
                <div className="tr-proof-track" aria-hidden="true">
                  <div className={`tr-proof-icon-circle is-${visual.tone}`}>{visual.icon}</div>
                  {!isLast && <div className={`tr-proof-stem is-${visual.tone}`} />}
                </div>
                <div className="tr-proof-body">
                  <strong className="tr-proof-heading">
                    <span className="tr-proof-date">{formatTraceDate(d.entryOn, "vi")}</span>
                    <span className="tr-proof-sep">-</span>
                    <span>{d.activity}</span>
                  </strong>
                  {d.detail && <p className="tr-proof-detail">{d.detail}</p>}
                  <div className="tr-proof-meta">
                    {d.householdName && <span>Hộ: {d.householdName}</span>}
                    {d.plotCode && <span>Mã lô vườn: {d.plotCode}</span>}
                    {d.mrlStatus && (
                      <span className={mrlFailed ? "tr-proof-warn-tag" : "tr-proof-safe-tag"}>
                        {mrlFailed ? "Cảnh báo MRL" : "Đạt ngưỡng MRL"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function readInitialViewParam(): ViewerTier | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("view");
  if (raw === "public" || raw === "enterprise" || raw === "authority") {
    return raw;
  }
  return null;
}

export default function TraceView() {
  const params = useParams();
  const rawRouteParam =
    typeof params.token === "string"
      ? params.token
      : typeof params.code === "string"
        ? params.code
        : "";
  const code = rawRouteParam ? safeDecodeURIComponent(rawRouteParam) : "";

  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus } = useAuth();
  const [lang, setLang] = useState<TraceLang>("vi");
  const [data, setData] = useState<TraceData | null>(null);
  const [selectedView, setSelectedView] = useState<ViewerTier | null>(() => readInitialViewParam());
  const [loading, setLoading] = useState(() => Boolean(code));
  const [switchingTier, setSwitchingTier] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(() => (code ? null : "invalid"));
  const [searchCode, setSearchCode] = useState(code);
  const [copied, setCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [gisModalPlot, setGisModalPlot] = useState<{
    plot: PortalPlot;
    householdName: string;
  } | null>(null);

  // Tự động chọn ngôn ngữ theo trình duyệt người quét (4d) ngay sau khi mount
  useEffect(() => {
    setLang(detectInitialTraceLang());
  }, []);

  const handleChangeLang = (nextLang: TraceLang) => {
    setLang(nextLang);
    persistTraceLang(nextLang);
  };

  const [prevCode, setPrevCode] = useState(code);
  if (prevCode !== code) {
    setPrevCode(code);
    setData(null);
    setQrSrc("");
    setLoading(Boolean(code));
    setErrorKind(code ? null : "invalid");
    setSearchCode(code);
    setGisModalPlot(null);
  }

  const resolvedQrToken = data?.publicData?.lotIdentity?.qrToken || null;

  // (4b + Mục 5) Sinh mã QR đường dẫn token ngẫu nhiên chống giả /t/{token} với độ tương phản tuyệt đối và sửa lỗi mức Q
  useEffect(() => {
    if (!code) return;
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = resolvedQrToken
      ? `${origin}/t/${encodeURIComponent(resolvedQrToken)}`
      : `${origin}/trace/${encodeURIComponent(code)}`;

    QRCode.toDataURL(targetUrl, {
      margin: 1,
      width: 320,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "Q",
    })
      .then((url) => {
        if (active) setQrSrc(url);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [code, resolvedQrToken]);

  useEffect(() => {
    if (!code) return;
    let active = true;
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

    const querySuffix = selectedView ? `?view=${encodeURIComponent(selectedView)}` : "";
    const encodedCode = encodeURIComponent(code);
    const preferAuthenticatedEndpoint =
      authStatus === "authenticated" || Boolean(data?.accessControl?.isAuthenticated);
    const primaryUrl = preferAuthenticatedEndpoint
      ? `/api/trace/${encodedCode}${querySuffix}`
      : `/api/public/trace/${encodedCode}${querySuffix}`;

    fetch(primaryUrl, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => {
        if (res.status === 401 && preferAuthenticatedEndpoint) {
          return fetch(`/api/public/trace/${encodedCode}${querySuffix}`, {
            credentials: "include",
            signal: controller.signal,
          });
        }
        return res;
      })
      .then((res) => {
        reportRequestTime(performance.now() - start);
        if (!res.ok) {
          const httpErr = new Error(res.status === 404 ? "not_found" : "server");
          httpErr.name = "TraceHttpError";
          throw httpErr;
        }
        return res.json();
      })
      .then((payload: TraceData) => {
        if (active) {
          setData(payload);
          setErrorKind(null);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof Error && err.name === "TraceHttpError") {
          setErrorKind(err.message === "not_found" ? "not_found" : "server");
        } else if (err instanceof Error && err.name === "AbortError") {
          setErrorKind("timeout");
        } else {
          setErrorKind("network");
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) {
          setLoading(false);
          setSwitchingTier(false);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [code, selectedView]);

  const handleSelectTier = (tier: ViewerTier) => {
    if (!data) return;
    if (tier === data.accessControl.viewerTier && selectedView === tier) return;
    setSwitchingTier(true);
    setSelectedView(tier);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const nextHref = resolveSearchNavigationHref(searchCode);
    if (nextHref) {
      router.push(nextHref);
    }
  };

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const url = resolvedQrToken
      ? `${origin}/t/${encodeURIComponent(resolvedQrToken)}`
      : `${origin}/trace/${encodeURIComponent(code)}`;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    const prevTitle = document.title;
    const refLabel = data?.publicData?.lotIdentity?.lotCode || code || "PUC";
    const safeCode = refLabel.replace(/[^a-zA-Z0-9_-]+/g, "-");
    document.title = `Ho-so-truy-xuat-${safeCode}`;
    const restore = () => {
      document.title = prevTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
    setTimeout(restore, 1500);
  };

  const openAuthorityPlotGis = (household: TraceAuthorityHousehold, p: TraceAuthorityPlot) => {
    const validStatus: PlotStatus =
      p.status === "approved" ||
      p.status === "improve" ||
      p.status === "violation" ||
      p.status === "pending"
        ? p.status
        : "approved";

    const validSource: PortalPlot["source"] =
      p.source === "declared" ||
      p.source === "measured" ||
      p.source === "cadastral" ||
      p.source === "demo"
        ? p.source
        : "cadastral";

    setGisModalPlot({
      householdName: household.householdName,
      plot: {
        code: p.plotCode,
        sheet: p.sheetNo ?? null,
        parcel: p.parcelNo ?? null,
        village: household.villageName || null,
        zoneCode: p.zoneCode ?? null,
        variety: p.variety ?? null,
        plantedYear: p.plantedYear ?? null,
        areaHa: Number(p.areaHa || 0),
        source: validSource,
        status: validStatus,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        geometryJson: p.geometryJson ?? null,
      },
    });
  };

  const t = TRACE_UI_COPY[lang];
  const pub = data?.publicData;
  const ac = data?.accessControl;

  const errorMessage = errorKind
    ? errorKind === "invalid"
      ? t.errorState.invalidCode
      : errorKind === "not_found"
        ? t.errorState.notFound(code)
        : errorKind === "timeout"
          ? t.errorState.timeoutError
          : errorKind === "network"
            ? t.errorState.networkError
            : t.errorState.serverError
    : null;

  // Mã chữ dự phòng của đơn vị thùng / quả (để kiểm tra khi tem trầy xước - 4b)
  const fallbackUnitSerial = pub
    ? data?.item?.serialCode ||
      data?.farmerStamp?.serialCode ||
      (pub.lotIdentity.scannedCode.toUpperCase() !== pub.lotIdentity.lotCode.toUpperCase() &&
      pub.lotIdentity.scannedCode !== pub.lotIdentity.qrToken
        ? pub.lotIdentity.scannedCode
        : null)
    : null;

  const hasRealtimeAlert = Boolean(pub?.realtimeStatus?.hasSuspensionAlert);
  const returnNextPath =
    pathname ||
    (resolvedQrToken
      ? `/t/${encodeURIComponent(resolvedQrToken)}`
      : `/trace/${encodeURIComponent(code)}`);
  const loginWithNextHref = `/login?next=${encodeURIComponent(returnNextPath)}`;

  const handleSwitchAccount = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Bỏ qua lỗi mạng khi đăng xuất
    }
    if (typeof window !== "undefined") {
      window.location.href = loginWithNextHref;
    }
  };

  return (
    <div className="tr-root" lang={lang === "zh" ? "zh-CN" : lang}>
      {/* ─── Thanh đầu trang cố định Thụy Sĩ (Trên di động ẩn chữ HTX Cư Né, giữ đúng 2 nút ở 2 phía) ─── */}
      <header className="tr-topbar">
        <div className="tr-wrap tr-topbar-inner">
          <Link href="/" className="tr-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/newlogo.png" alt="" width={22} height={22} className="tr-brand-img" decoding="async" />
            <span>{t.topbar.brand}</span>
          </Link>

          <div className="tr-topbar-actions">
            <Link href="/trace" className="tr-top-btn">
              {t.topbar.lookupOther}
            </Link>
            <Link href="/" className="tr-top-btn is-solid">
              {t.topbar.home}
            </Link>
          </div>
        </div>
      </header>

      <main className="tr-wrap tr-main">
        {/* ─── Dải chuyển ngôn ngữ VI / EN / 简体中文 & Trạng thái PUC-PHC thời gian thực (4c, 4d) ─── */}
        <div className="tr-lang-bar no-print">
          <div className="tr-lang-live-pill">
            {pub ? (
              hasRealtimeAlert ? (
                <span className="tr-live-status is-alert">
                  <span className="tr-live-dot" aria-hidden="true" />
                  <span>{t.langBar.liveAlertBadge}</span>
                </span>
              ) : (
                <span className="tr-live-status is-ok">
                  <span className="tr-live-dot" aria-hidden="true" />
                  <span>{t.langBar.liveVerifiedBadge}</span>
                </span>
              )
            ) : (
              <span className="tr-live-status is-neutral">
                <Globe size={13} strokeWidth={2} aria-hidden="true" />
                <span>{t.langBar.label}</span>
              </span>
            )}
          </div>

          <div className="tr-lang-switch" role="group" aria-label={t.langBar.label}>
            <button
              type="button"
              aria-pressed={lang === "vi"}
              className={`tr-lang-btn ${lang === "vi" ? "is-active" : ""}`}
              onClick={() => handleChangeLang("vi")}
            >
              Tiếng Việt
            </button>
            <button
              type="button"
              aria-pressed={lang === "en"}
              className={`tr-lang-btn ${lang === "en" ? "is-active" : ""}`}
              onClick={() => handleChangeLang("en")}
            >
              English
            </button>
            <button
              type="button"
              aria-pressed={lang === "zh"}
              className={`tr-lang-btn ${lang === "zh" ? "is-active" : ""}`}
              onClick={() => handleChangeLang("zh")}
            >
              简体中文
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonCards count={3} label={t.loadingLabel} />
        ) : errorMessage ? (
          <div className="tr-card tr-error-card">
            <h2 className="tr-error-title">{t.errorState.title}</h2>
            <p className="tr-error-desc">{errorMessage}</p>
            <form onSubmit={handleSearch} className="tr-search-form">
              <input
                className="tr-search-input"
                placeholder={t.errorState.inputPlaceholder}
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
              />
              <button type="submit" className="tr-search-btn">
                <Search size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>{t.errorState.searchBtn}</span>
              </button>
            </form>
            <div className="tr-error-actions">
              <Link href="/" className="tr-home-btn">
                <ArrowLeft size={17} strokeWidth={2.3} aria-hidden="true" />
                <span>{t.actions.home}</span>
              </Link>
            </div>
          </div>
        ) : data && pub && ac ? (
          <>
            {/* ─── Nút nhỏ gọn ở đầu trang dành cho Đối tác / Cơ quan quản lý khi quét chưa đăng nhập (Mục 5) ─── */}
            {!ac.isAuthenticated && (
              <div className="tr-partner-login-strip no-print">
                <Link href={loginWithNextHref} className="tr-partner-login-btn">
                  <Lock size={13} strokeWidth={2.1} aria-hidden="true" />
                  <span>{t.authHint.compactBtn}</span>
                </Link>
              </div>
            )}

            {/* ─── Thông báo từ chối chi tiết khi tài khoản đã đăng nhập nhưng lô nằm ngoài phạm vi quản lý (Mục 2 & Mục 5) ─── */}
            {ac.isAuthenticated && ac.scopeDenied && (
              <section className="tr-alert-banner is-warn tr-scope-denied-banner no-print" role="status">
                <div className="tr-scope-denied-main">
                  <div className="tr-alert-banner-head">
                    <Lock size={18} strokeWidth={2.3} aria-hidden="true" />
                    <strong>
                      {lang === "vi" && ac.scopeDeniedMessage
                        ? ac.scopeDeniedMessage
                        : t.scopeAccess.deniedTitle}
                    </strong>
                  </div>
                  <p className="tr-alert-banner-desc">
                    {t.scopeAccess.deniedDesc(
                      ac.viewerName || "Người dùng",
                      ac.viewerRole ? ROLE_LABELS[ac.viewerRole] : ac.viewerTierLabel,
                      lang === "vi" ? (ac.scopeReason ?? null) : null,
                    )}
                  </p>
                </div>
                <button type="button" className="tr-scope-switch-btn" onClick={() => void handleSwitchAccount()}>
                  {t.scopeAccess.switchAccountBtn}
                </button>
              </section>
            )}

            {/* ─── Thanh điều khiển Cấp độ Truy xuất mở rộng (Dành cho Doanh nghiệp & Cơ quan quản lý đã đăng nhập đúng phạm vi) ─── */}
            {ac.actualTier !== "public" && (
              <section className="tr-tier-bar no-print" aria-label="Chuyển đổi cấp độ truy xuất">
                <div className="tr-tier-bar-info">
                  <div className="tr-tier-role-line">
                    <ShieldCheck size={16} strokeWidth={2.2} className="tr-tier-icon" aria-hidden="true" />
                    <span>
                      Tài khoản: <strong>{ac.viewerName || "Cán bộ"}</strong> (
                      {ac.viewerRole ? ROLE_LABELS[ac.viewerRole] : ac.viewerTierLabel})
                    </span>
                  </div>
                  <span className="tr-tier-audit-note">
                    {ac.auditLogged
                      ? "Lượt xem mở rộng này đã được ghi nhận vào nhật ký kiểm toán hệ thống."
                      : "Đang xem ở chế độ giao diện công khai dành cho người tiêu dùng."}
                  </span>
                </div>

                <div className="tr-tier-switch" role="tablist" aria-label="Chọn cấp độ hiển thị">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={ac.viewerTier === "public"}
                    disabled={switchingTier}
                    className={`tr-tier-btn ${ac.viewerTier === "public" ? "is-active" : ""}`}
                    onClick={() => handleSelectTier("public")}
                  >
                    1. Công khai
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={ac.viewerTier === "enterprise"}
                    disabled={switchingTier}
                    className={`tr-tier-btn ${ac.viewerTier === "enterprise" ? "is-active" : ""}`}
                    onClick={() => handleSelectTier("enterprise")}
                  >
                    2. Doanh nghiệp
                  </button>
                  {ac.actualTier === "authority" && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={ac.viewerTier === "authority"}
                      disabled={switchingTier}
                      className={`tr-tier-btn ${ac.viewerTier === "authority" ? "is-active" : ""}`}
                      onClick={() => handleSelectTier("authority")}
                    >
                      3. Cơ quan quản lý
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* ─── 1. Cảnh báo Thu hồi Lô hàng (Mục 1) ─── */}
            {pub.lotIdentity.status === "revoked" && (
              <section className="tr-alert-banner is-danger" role="alert">
                <div className="tr-alert-banner-head">
                  <ShieldAlert size={19} strokeWidth={2.3} aria-hidden="true" />
                  <strong>{t.alerts.revokedTitle}</strong>
                </div>
                <p className="tr-alert-banner-desc">
                  {lang === "vi" && pub.lotIdentity.revokedReason
                    ? pub.lotIdentity.revokedReason
                    : t.alerts.revokedDefaultDesc}
                </p>
              </section>
            )}

            {/* ─── 2. Cảnh báo Trạng thái Thời gian thực PUC / PHC bị tạm dừng hoặc thu hồi (4c) ─── */}
            {pub.realtimeStatus?.hasSuspensionAlert && pub.lotIdentity.status !== "revoked" && (
              <section className="tr-alert-banner is-danger" role="alert">
                <div className="tr-alert-banner-head">
                  <ShieldAlert size={19} strokeWidth={2.3} aria-hidden="true" />
                  <strong>{t.alerts.realtimeSuspendedTitle}</strong>
                </div>
                <p className="tr-alert-banner-desc">
                  {t.alerts.realtimeSuspendedDesc({
                    pucCode: pub.realtimeStatus.pucCode,
                    pucStatusText: localizeZoneStatusLabel(
                      pub.realtimeStatus.pucStatus,
                      pub.realtimeStatus.pucStatusLabel,
                      lang,
                    ),
                    packhouseCode: pub.realtimeStatus.packhouseCode,
                    phcStatusText: localizePackhouseStatusLabel(
                      pub.realtimeStatus.packhouseStatus,
                      pub.realtimeStatus.packhouseStatusLabel,
                      lang,
                    ),
                    note: lang === "vi" ? pub.realtimeStatus.pucNote : null,
                  })}
                </p>
              </section>
            )}

            {/* ─── 3. Thông báo Bản nháp chưa kiểm chứng (4f) ─── */}
            {pub.lotIdentity.status === "unverified" && (
              <section className="tr-alert-banner is-warn" role="status">
                <div className="tr-alert-banner-head">
                  <AlertTriangle size={19} strokeWidth={2.3} aria-hidden="true" />
                  <strong>{t.alerts.unverifiedTitle}</strong>
                </div>
                <p className="tr-alert-banner-desc">{t.alerts.unverifiedDesc}</p>
              </section>
            )}

            {/* ─── 4. Cảnh báo Chống giả: Quét từ nhiều quốc gia hoặc tần suất bất thường (4b) ─── */}
            {(pub.verification.warningReason === "multi_country" ||
              pub.verification.warningReason === "high_frequency") && (
              <section className="tr-alert-banner is-warn" role="alert">
                <div className="tr-alert-banner-head">
                  <AlertTriangle size={19} strokeWidth={2.3} aria-hidden="true" />
                  <strong>
                    {pub.verification.warningReason === "multi_country"
                      ? t.alerts.multiCountryTitle
                      : t.alerts.highFreqTitle}
                  </strong>
                </div>
                <p className="tr-alert-banner-desc">
                  {pub.verification.warningReason === "multi_country"
                    ? t.alerts.multiCountryDesc(
                        pub.verification.distinctCountries24h ||
                          (pub.verification.countries24h?.length ?? 2),
                        (pub.verification.countries24h || []).join(", "),
                      )
                    : t.alerts.highFreqDesc(
                        pub.verification.scansLast24h,
                        pub.verification.distinctSources24h || 1,
                      )}
                </p>
              </section>
            )}

            {/* ─── THẺ 1: NHẬN DIỆN LÔ & XÁC THỰC MÁY CHỦ (Mục 1 - Nhóm Nhận diện lô & Xác thực) ─── */}
            <section className="tr-hero-dossier" data-status={pub.lotIdentity.status}>
              <div className="tr-hero-dossier-main">
                <div className="tr-asset-watermark" aria-hidden="true">
                  <WatermarkStamp
                    topText={t.watermark.top}
                    centerText={
                      pub.lotIdentity.status === "revoked"
                        ? t.watermark.revoked
                        : pub.lotIdentity.status === "unverified"
                          ? t.watermark.unverified
                          : pub.lotIdentity.status === "pending"
                            ? t.watermark.pending
                            : t.watermark.valid
                    }
                    bottomText={t.watermark.bottom}
                  />
                </div>

                <div className="tr-hero-left">
                  <div className="tr-hero-kicker-row">
                    <span className="tr-hero-unit-tag">
                      {localizeTraceUnitLabel(
                        pub.lotIdentity.traceUnit,
                        pub.lotIdentity.traceUnitLabel,
                        lang,
                      )}
                    </span>
                    <span
                      className={
                        pub.lotIdentity.status === "revoked"
                          ? "tr-badge-red"
                          : pub.lotIdentity.status === "pending" ||
                              pub.lotIdentity.status === "unverified"
                            ? "tr-badge-neutral"
                            : "tr-badge-green"
                      }
                    >
                      {localizeLotStatusLabel(
                        pub.lotIdentity.status,
                        pub.lotIdentity.statusLabel,
                        lang,
                      )}
                    </span>
                  </div>

                  <h1 className="tr-hero-product-title">
                    {localizeProductName(
                      pub.lotIdentity.productName,
                      pub.lotIdentity.traceUnit,
                      lang,
                    )}
                  </h1>

                  <div className="tr-hero-identity-grid">
                    <div className="tr-hero-id-cell">
                      <span className="tr-hero-id-lbl">{t.hero.lotCodeLabel}</span>
                      <strong className="tr-hero-id-val">{pub.lotIdentity.lotCode}</strong>
                    </div>

                    <div className="tr-hero-id-cell">
                      <span className="tr-hero-id-lbl">{t.hero.varietyLabel}</span>
                      <strong className="tr-hero-id-val">{pub.lotIdentity.variety}</strong>
                    </div>

                    {fallbackUnitSerial &&
                      fallbackUnitSerial.toUpperCase() !== pub.lotIdentity.lotCode.toUpperCase() && (
                        <div className="tr-hero-id-cell">
                          <span className="tr-hero-id-lbl">{t.hero.fallbackCodeLabel}</span>
                          <strong className="tr-hero-id-val">{fallbackUnitSerial}</strong>
                        </div>
                      )}

                    <div className="tr-hero-id-cell">
                      <span className="tr-hero-id-lbl">
                        {pub.lotIdentity.itemWeightKg !== null
                          ? t.hero.unitSpecLabel
                          : t.hero.lotScaleLabel}
                      </span>
                      <strong className="tr-hero-id-val">
                        {pub.lotIdentity.itemWeightKg !== null
                          ? `${formatTraceNumber(pub.lotIdentity.itemWeightKg, lang)} kg${
                              pub.lotIdentity.itemGrade
                                ? ` (${t.hero.gradeFmt(pub.lotIdentity.itemGrade)})`
                                : ""
                            }`
                          : pub.lotIdentity.weightTons > 0
                            ? t.hero.tonsFmt(
                                formatTraceNumber(pub.lotIdentity.weightTons * 1000, lang),
                                pub.lotIdentity.weightTons,
                              )
                            : localizeMarket(pub.lotIdentity.market, lang)}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="tr-asset-right">
                  <div className="tr-asset-qr-box">
                    {qrSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrSrc}
                        alt={t.hero.qrAlt(pub.lotIdentity.lotCode)}
                        className="tr-asset-qr-img"
                        decoding="async"
                      />
                    ) : (
                      <div className="tr-asset-qr-loading" aria-hidden="true">
                        <QrCode size={84} strokeWidth={1.8} />
                      </div>
                    )}
                  </div>
                  <span className="tr-qr-caption">{t.hero.qrCaption}</span>
                </div>
              </div>

              {/* Dải Xác thực Lượt quét & Quốc gia quét (Mục 1 + 4b) */}
              <div className="tr-hero-verify-bar">
                <div className="tr-verify-stat">
                  <CheckCircle2 size={15} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    {t.hero.scanStatFmt(
                      formatTraceNumber(pub.verification.totalScans, lang),
                      formatTraceNumber(pub.verification.scansLast24h, lang),
                      pub.verification.countries24h && pub.verification.countries24h.length > 0
                        ? t.hero.countriesSuffixFmt(pub.verification.countries24h.join(", "))
                        : null,
                    )}
                  </span>
                </div>
                <div className="tr-verify-time">
                  <Clock size={14} strokeWidth={2} aria-hidden="true" />
                  <span>
                    {t.hero.verifiedAtFmt(formatTraceDateTime(pub.verification.verifiedAt, lang))}
                  </span>
                </div>
              </div>
            </section>

            {/* ─── DÒNG THỜI GIAN TRỰC QUAN 5 BƯỚC: VƯỜN -> THU HOẠCH -> ĐÓNG GÓI -> KIỂM NGHIỆM -> XUẤT KHẨU ─── */}
            <section className="tr-card tr-five-step-card" aria-labelledby="five-step-heading">
              <div className="tr-card-header">
                <h2 id="five-step-heading" className="tr-card-title">
                  {t.timeline.title}
                </h2>
                <span className="tr-count-badge">{t.timeline.badge}</span>
              </div>
              <p className="tr-card-sub">{t.timeline.sub}</p>

              <ol className="tr-five-steps" aria-label={t.timeline.ariaLabel}>
                {pub.timeline.map((st) => {
                  const statusLabel =
                    st.status === "completed"
                      ? t.timeline.statusCompleted
                      : st.status === "warning"
                        ? t.timeline.statusWarning
                        : st.status === "current"
                          ? t.timeline.statusCurrent
                          : t.timeline.statusUpcoming;
                  const localizedStep = localizeTimelineStep(st, {
                    pucCode: pub.growingZone.pucCode,
                    packhouseCode: pub.packhouse.code,
                    packhouseName: pub.packhouse.name,
                    market: pub.lotIdentity.market,
                    lang,
                  });
                  return (
                    <li key={st.key} className={`tr-fstep-item is-${st.status}`}>
                      <div className="tr-fstep-top">
                        <span className="tr-fstep-num">0{st.step}</span>
                        <span className={`tr-fstep-pill is-${st.status}`}>{statusLabel}</span>
                      </div>
                      <h3 className="tr-fstep-title">{localizedStep.title}</h3>
                      <div className="tr-fstep-date">{formatTraceDate(st.date, lang)}</div>
                      <div className="tr-fstep-unit">
                        <span className="tr-fstep-unit-lbl">{t.timeline.responsibleLabel}</span>
                        <strong>{localizedStep.responsibleUnit}</strong>
                      </div>
                      <p className="tr-fstep-detail">{localizedStep.detail}</p>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* ─── BẢNG THÔNG TIN TRUY XUẤT CÔNG KHAI (MỤC 1 - ĐẦY ĐỦ CÁC NHÓM) ─── */}
            <div className="tr-lot-grid">
              <div className="tr-lot-col-main">
                {/* 1. Nhóm Vùng trồng & Bản đồ vector khái quát (4c + 4e) */}
                <section className="tr-card">
                  <div className="tr-card-header">
                    <h2 className="tr-card-title">{t.zone.title}</h2>
                    <span
                      className={
                        pub.growingZone.status === "active"
                          ? "tr-badge-green"
                          : pub.growingZone.status === "suspended" ||
                              pub.growingZone.status === "revoked"
                            ? "tr-badge-red"
                            : "tr-badge-neutral"
                      }
                    >
                      {localizeZoneStatusLabel(
                        pub.growingZone.status,
                        pub.growingZone.statusLabel,
                        lang,
                      )}
                    </span>
                  </div>

                  <div className="tr-data-list">
                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.zone.nameLabel}</span>
                      <strong className="tr-data-val">
                        {localizeGrowingZoneName(pub.growingZone.name, lang)}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.zone.pucLabel}</span>
                      <strong className="tr-data-val highlight">
                        {pub.growingZone.pucCode}
                        {pub.growingZone.additionalZoneCount > 0
                          ? t.zone.linkedZonesSuffix(pub.growingZone.additionalZoneCount)
                          : ""}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.zone.adminLocationLabel}</span>
                      <strong className="tr-data-val">
                        {localizeAdminLocation(pub.growingZone.adminLocation, lang)}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.zone.statusRowLabel}</span>
                      <strong className="tr-data-val">
                        {t.zone.validUntilFmt(
                          localizeZoneStatusLabel(
                            pub.growingZone.status,
                            pub.growingZone.statusLabel,
                            lang,
                          ),
                          formatTraceDate(pub.growingZone.validUntil, lang),
                        )}
                      </strong>
                    </div>
                  </div>

                  <CoarseZoneOverviewMap
                    centerLat={pub.growingZone.coarseMap.centerLat}
                    centerLng={pub.growingZone.coarseMap.centerLng}
                    radiusMeters={pub.growingZone.coarseMap.radiusMeters}
                    zoom={pub.growingZone.coarseMap.zoom}
                    label={pub.growingZone.coarseMap.label}
                    privacyNote={pub.growingZone.coarseMap.privacyNote}
                    pucCode={pub.growingZone.pucCode}
                    adminLocation={localizeAdminLocation(pub.growingZone.adminLocation, lang)}
                    lang={lang}
                  />
                </section>

                {/* 2. Nhóm Đơn vị sản xuất & Cơ sở đóng gói (Kèm trạng thái PHC thời gian thực - 4c) */}
                <section className="tr-card">
                  <div className="tr-card-header">
                    <h2 className="tr-card-title">{t.producerPackhouse.title}</h2>
                  </div>

                  <div className="tr-data-list">
                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.producerPackhouse.producerLabel}</span>
                      <strong className="tr-data-val">
                        {localizeCoopName(pub.producer.cooperativeName, lang)}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.producerPackhouse.groupLabel}</span>
                      <strong className="tr-data-val">
                        {localizeGroupName(
                          pub.producer.groupName,
                          pub.producer.participatingHouseholdCount,
                          lang,
                        )}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.producerPackhouse.householdsLabel}</span>
                      <strong className="tr-data-val">
                        {pub.producer.consentedHouseholds.length > 0
                          ? pub.producer.consentedHouseholds.join(", ")
                          : t.producerPackhouse.representedByCoop}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.producerPackhouse.packhouseNameLabel}</span>
                      <strong className="tr-data-val">{pub.packhouse.name}</strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.producerPackhouse.packhouseCodeLabel}</span>
                      <strong className="tr-data-val highlight">{pub.packhouse.code}</strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.producerPackhouse.packhouseStatusLabel}</span>
                      <strong className="tr-data-val">
                        <span
                          className={
                            !pub.packhouse.status || pub.packhouse.status === "active"
                              ? "tr-badge-green"
                              : "tr-badge-red"
                          }
                        >
                          {localizePackhouseStatusLabel(
                            pub.packhouse.status,
                            pub.packhouse.statusLabel,
                            lang,
                          )}
                        </span>
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.producerPackhouse.packhouseAddressLabel}</span>
                      <strong className="tr-data-val">{pub.packhouse.address}</strong>
                    </div>
                  </div>

                  <p className="tr-privacy-footnote">
                    {lang === "vi"
                      ? pub.producer.consentNote
                      : pub.producer.consentedHouseholds.length > 0
                        ? t.producerPackhouse.consentNoteWithNames
                        : t.producerPackhouse.consentNoteHidden}
                  </p>
                </section>
              </div>

              <div className="tr-lot-col-side">
                {/* 3. Nhóm Kiểm nghiệm an toàn thực phẩm đã duyệt & Bản scan giấy kiểm nghiệm (4f) */}
                {(() => {
                  const labs = pub.labTests;
                  const firstLab = labs[0] ?? null;
                  const anyFail = labs.some(
                    (lt) =>
                      lt.result !== "pass" ||
                      Number(lt.cdMgKg) > 0.05 ||
                      lt.yellowOPositive ||
                      (lt.chlorpyrifosMgKg ?? 0) > 0.01,
                  );

                  return (
                    <section className="tr-card">
                      <div className="tr-card-header">
                        <h2 className="tr-card-title">{t.lab.title}</h2>
                        <span
                          className={
                            !firstLab ? "tr-badge-neutral" : anyFail ? "tr-badge-red" : "tr-badge-green"
                          }
                        >
                          {!firstLab
                            ? t.lab.badgeUpdating
                            : anyFail
                              ? t.lab.badgeFail
                              : t.lab.badgePass}
                        </span>
                      </div>

                      {!firstLab ? (
                        <div className="tr-farmer-empty">{t.lab.emptyNote}</div>
                      ) : (
                        <div className="tr-lab-stack">
                          {labs.map((lt) => {
                            const cdPass = Number(lt.cdMgKg) <= 0.05;
                            const yoPass = !lt.yellowOPositive;
                            const resPass =
                              Number(lt.residueMgKg) <= 0.1 && (lt.chlorpyrifosMgKg ?? 0) <= 0.01;
                            return (
                              <div key={lt.code} className="tr-lab-block">
                                <div className="tr-lab-meta-head">
                                  <div>
                                    <span className="tr-lab-cert-lbl">{t.lab.certNoLabel}</span>
                                    <strong className="tr-lab-cert-code">{lt.code}</strong>
                                  </div>
                                  <span className="tr-lab-date">
                                    {t.lab.dateFmt(formatTraceDate(lt.sampledOn, lang))}
                                  </span>
                                </div>
                                <div className="tr-lab-org">{t.lab.orgFmt(lt.lab)}</div>

                                <div className="tr-safety-list">
                                  <div className="tr-safety-item">
                                    <div className="tr-safety-info">
                                      <strong className="tr-safety-name">{t.lab.cdName}</strong>
                                      <span className="tr-safety-detail">
                                        {t.lab.cdDetailFmt(lt.cdMgKg)}
                                      </span>
                                    </div>
                                    <span className={cdPass ? "tr-pass-pill" : "tr-fail-pill"}>
                                      {cdPass ? t.lab.pillPass : t.lab.pillFail}
                                    </span>
                                  </div>

                                  <div className="tr-safety-item">
                                    <div className="tr-safety-info">
                                      <strong className="tr-safety-name">{t.lab.yoName}</strong>
                                      <span className="tr-safety-detail">
                                        {lt.yellowOPositive ? t.lab.yoPositive : t.lab.yoNegative}
                                      </span>
                                    </div>
                                    <span className={yoPass ? "tr-pass-pill" : "tr-fail-pill"}>
                                      {yoPass ? t.lab.pillSafe : t.lab.pillUnsafe}
                                    </span>
                                  </div>

                                  <div className="tr-safety-item">
                                    <div className="tr-safety-info">
                                      <strong className="tr-safety-name">{t.lab.resName}</strong>
                                      <span className="tr-safety-detail">
                                        {t.lab.resDetailFmt(lt.residueMgKg, lt.chlorpyrifosMgKg)}
                                      </span>
                                    </div>
                                    <span className={resPass ? "tr-pass-pill" : "tr-fail-pill"}>
                                      {resPass ? t.lab.pillPass : t.lab.pillFail}
                                    </span>
                                  </div>
                                </div>

                                {lt.scanUrl ? (
                                  <a
                                    href={lt.scanUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="tr-scan-doc-btn"
                                  >
                                    <FileText size={16} strokeWidth={2} aria-hidden="true" />
                                    <span>{t.lab.viewScanFmt(lt.code)}</span>
                                    <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                                  </a>
                                ) : (
                                  <div className="tr-scan-doc-muted">{t.lab.scanArchivedNote}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })()}

                {/* 4. Nhóm Mốc thời gian, Quy trình sản xuất & Kiểm dịch thực vật */}
                <section className="tr-card">
                  <div className="tr-card-header">
                    <h2 className="tr-card-title">{t.processPhyto.title}</h2>
                  </div>

                  <div className="tr-data-list">
                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.processPhyto.harvestDateLabel}</span>
                      <strong className="tr-data-val highlight">
                        {formatTraceDate(pub.milestones.harvestedOn, lang)}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.processPhyto.packDateLabel}</span>
                      <strong className="tr-data-val highlight">
                        {formatTraceDate(pub.milestones.packedOn, lang)}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.processPhyto.exportDateLabel}</span>
                      <strong className="tr-data-val highlight">
                        {formatTraceDate(pub.milestones.exportedOn, lang)}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.processPhyto.standardLabel}</span>
                      <strong className="tr-data-val">
                        {lang === "vi" ? pub.farmingProcess.standard : t.processPhyto.standardValue}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.processPhyto.complianceLabel}</span>
                      <strong className="tr-data-val">
                        {pub.farmingProcess.complianceConfirmed
                          ? t.processPhyto.complianceConfirmedText
                          : t.processPhyto.complianceReviewingText}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.processPhyto.inspectionLabel}</span>
                      <strong className="tr-data-val">
                        {localizeInspectionNote(pub.farmingProcess.inspectionNote, lang)}
                      </strong>
                    </div>

                    <div className="tr-data-row">
                      <span className="tr-data-label">{t.processPhyto.phytoLabel}</span>
                      <strong className="tr-data-val highlight">
                        {pub.phytosanitary.certNo
                          ? t.processPhyto.phytoIssuedFmt(
                              pub.phytosanitary.certNo,
                              pub.phytosanitary.issuedOn
                                ? formatTraceDate(pub.phytosanitary.issuedOn, lang)
                                : null,
                            )
                          : lang === "vi"
                            ? pub.phytosanitary.statusLabel
                            : t.processPhyto.phytoDefaultPending}
                      </strong>
                    </div>
                  </div>

                  <p className="tr-privacy-footnote">
                    {lang === "vi"
                      ? pub.verification.nationalStandardNote
                      : t.processPhyto.nationalStandardNote}
                  </p>
                </section>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════════
               CẤP ĐỘ 2: HỒ SƠ MỞ RỘNG DOANH NGHIỆP / CƠ SỞ ĐÓNG GÓI (enterpriseData)
               ═══════════════════════════════════════════════════════════════════════════ */}
            {data.enterpriseData && (
              <section className="tr-ext-section" aria-labelledby="ext-ent-heading">
                <div className="tr-ext-header">
                  <div>
                    <span className="tr-ext-kicker">Cấp độ 2 - Truy xuất mở rộng Doanh nghiệp</span>
                    <h2 id="ext-ent-heading" className="tr-ext-title">
                      Vùng nguồn nguyên liệu, sản lượng từng vùng &amp; kiểm nghiệm chi tiết
                    </h2>
                  </div>
                  <span className="tr-badge-green">Đã xác thực quyền Doanh nghiệp</span>
                </div>

                {/* Bảng vùng nguồn của lô & sản lượng từng vùng */}
                <div className="tr-card">
                  <div className="tr-card-header">
                    <h3 className="tr-card-title">Phân bổ các vùng nguồn đóng góp vào lô</h3>
                    <span className="tr-count-badge">
                      Tổng: {data.enterpriseData.totalSourceWeightKg.toLocaleString("vi-VN")} kg
                    </span>
                  </div>

                  <div className="tr-table-scroll">
                    <table className="tr-ext-table">
                      <thead>
                        <tr>
                          <th>Mã vùng trồng (PUC)</th>
                          <th>Khu vực / Thôn</th>
                          <th className="is-num">Số hộ</th>
                          <th className="is-num">Diện tích</th>
                          <th className="is-num">Sản lượng góp</th>
                          <th className="is-num">Tỷ trọng</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.enterpriseData.sourceZones.map((z, idx) => (
                          <tr key={`${z.zoneCode}-${idx}`}>
                            <td className="is-mono">{z.zoneCode}</td>
                            <td>{z.villageName}</td>
                            <td className="is-num">{z.householdCount} hộ</td>
                            <td className="is-num">
                              {z.areaHa > 0 ? `${z.areaHa.toLocaleString("vi-VN")} ha` : "—"}
                            </td>
                            <td className="is-num">
                              <strong>{z.weightKg.toLocaleString("vi-VN")} kg</strong>
                            </td>
                            <td className="is-num">{z.sharePct}%</td>
                            <td>
                              <span
                                className={
                                  z.status === "Đủ điều kiện" ? "tr-badge-green" : "tr-badge-red"
                                }
                              >
                                {z.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Ma trận kiểm nghiệm chi tiết theo vùng & Thông số sơ chế / vận chuyển lạnh */}
                <div className="tr-ext-two-col">
                  <div className="tr-card">
                    <div className="tr-card-header">
                      <h3 className="tr-card-title">Trạng thái kiểm nghiệm chi tiết của lô</h3>
                      <span className="tr-count-badge">
                        {data.enterpriseData.detailedLabTests.length} phiếu
                      </span>
                    </div>

                    {data.enterpriseData.detailedLabTests.length === 0 ? (
                      <div className="tr-farmer-empty">Chưa có phiếu kiểm nghiệm chi tiết.</div>
                    ) : (
                      <div className="tr-table-scroll">
                        <table className="tr-ext-table">
                          <thead>
                            <tr>
                              <th>Số phiếu</th>
                              <th>Mã vùng</th>
                              <th>Ngày mẫu</th>
                              <th className="is-num">Cd (mg/kg)</th>
                              <th>Vàng O</th>
                              <th className="is-num">Dư lượng</th>
                              <th>Kết quả</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.enterpriseData.detailedLabTests.map((lt) => (
                              <tr key={lt.code}>
                                <td className="is-mono">
                                  {lt.scanUrl ? (
                                    <a
                                      href={lt.scanUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="tr-inline-link"
                                    >
                                      {lt.code}
                                    </a>
                                  ) : (
                                    lt.code
                                  )}
                                </td>
                                <td className="is-mono">{lt.zoneCode}</td>
                                <td>{formatTraceDate(lt.sampledOn, "vi")}</td>
                                <td className="is-num">{lt.cdMgKg}</td>
                                <td>{lt.yellowOPositive ? "Dương tính" : "Âm tính"}</td>
                                <td className="is-num">{lt.residueMgKg} mg/kg</td>
                                <td>
                                  <span
                                    className={
                                      lt.result === "pass" ? "tr-badge-green" : "tr-badge-red"
                                    }
                                  >
                                    {lt.result === "pass" ? "Đạt" : "Không đạt"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {data.enterpriseData.packingSpecs && (
                    <div className="tr-card">
                      <div className="tr-card-header">
                        <h3 className="tr-card-title">Thông số sơ chế &amp; chuỗi lạnh</h3>
                      </div>
                      <div className="tr-data-list">
                        <div className="tr-data-row">
                          <span className="tr-data-label">Tỷ lệ phân hạng A / B / C</span>
                          <strong className="tr-data-val highlight">
                            {data.enterpriseData.packingSpecs.gradeAPct !== null
                              ? `${data.enterpriseData.packingSpecs.gradeAPct}% / ${
                                  data.enterpriseData.packingSpecs.gradeBPct ?? 0
                                }% / ${data.enterpriseData.packingSpecs.gradeCPct ?? 0}%`
                              : "Theo quy chuẩn đóng thùng xuất khẩu"}
                          </strong>
                        </div>
                        <div className="tr-data-row">
                          <span className="tr-data-label">Độ ngọt bình quân</span>
                          <strong className="tr-data-val highlight">
                            {data.enterpriseData.packingSpecs.avgBrix !== null
                              ? `${data.enterpriseData.packingSpecs.avgBrix}° Brix`
                              : "Đạt chuẩn thu hái"}
                          </strong>
                        </div>
                        <div className="tr-data-row">
                          <span className="tr-data-label">Phương pháp sơ chế</span>
                          <strong className="tr-data-val">
                            {data.enterpriseData.packingSpecs.treatmentMethod ||
                              "Làm sạch khí nén, phân cỡ & đóng thùng carton"}
                          </strong>
                        </div>
                        <div className="tr-data-row">
                          <span className="tr-data-label">Đơn vị vận tải lạnh</span>
                          <strong className="tr-data-val">
                            {data.enterpriseData.packingSpecs.transporter || "Đang cập nhật"}
                            {data.enterpriseData.packingSpecs.vehiclePlate
                              ? ` (${data.enterpriseData.packingSpecs.vehiclePlate})`
                              : ""}
                          </strong>
                        </div>
                        <div className="tr-data-row">
                          <span className="tr-data-label">Nhiệt độ bảo quản</span>
                          <strong className="tr-data-val highlight">
                            {data.enterpriseData.packingSpecs.temperatureC !== null
                              ? `${data.enterpriseData.packingSpecs.temperatureC}°C`
                              : "13°C - 15°C"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════
               CẤP ĐỘ 3: HỒ SƠ MỞ RỘNG CƠ QUAN QUẢN LÝ NHÀ NƯỚC (authorityData)
               ═══════════════════════════════════════════════════════════════════════════ */}
            {data.authorityData && (
              <section className="tr-ext-section is-authority" aria-labelledby="ext-auth-heading">
                <div className="tr-ext-header">
                  <div>
                    <span className="tr-ext-kicker">
                      Cấp độ 3 - Hồ sơ thanh tra &amp; quản lý nhà nước (Ghi log kiểm toán)
                    </span>
                    <h2 id="ext-auth-heading" className="tr-ext-title">
                      Danh sách hộ &amp; thửa nguồn GIS, nhật ký canh tác và biên bản kiểm tra
                    </h2>
                  </div>
                  <span className="tr-badge-green">Quyền Cơ quan quản lý</span>
                </div>

                {/* 1. Danh sách hộ & thửa nguồn (Kèm nút mở bản đồ GIS chính xác từng thửa; Mã lô vườn 1 dòng chữ trơn) */}
                <div className="tr-card">
                  <div className="tr-card-header">
                    <h3 className="tr-card-title">Danh sách hộ thành viên &amp; thửa đất nguồn</h3>
                    <span className="tr-count-badge">
                      {data.authorityData.sourceHouseholds.length} hộ nguồn
                    </span>
                  </div>
                  <p className="tr-card-sub">
                    Dữ liệu định danh hộ, SĐT, CCCD ẩn số, quan hệ lô - thửa nguồn và tọa độ ranh giới chính xác từng thửa chỉ phục vụ công tác thanh tra, truy vết sự cố.
                  </p>

                  {data.authorityData.sourceHouseholds.length === 0 ? (
                    <div className="tr-farmer-empty">
                      Chưa ghi nhận danh sách hộ đóng góp trực tiếp trong lô này.
                    </div>
                  ) : (
                    <div className="tr-auth-hh-list">
                      {data.authorityData.sourceHouseholds.map((hh, hhIdx) => (
                        <div
                          key={`${hh.householdCode}-${hh.contributedPlotCode || hhIdx}`}
                          className="tr-auth-hh-card"
                        >
                          <div className="tr-auth-hh-top">
                            <div>
                              <strong className="tr-auth-hh-name">{hh.householdName}</strong>
                              <div className="tr-auth-hh-meta">
                                <span>Mã hộ: {hh.householdCode}</span>
                                <span>-</span>
                                <span>Khu vực: {hh.villageName || "Xã Cư Né"}</span>
                                {hh.contributedPlotCode && (
                                  <>
                                    <span>-</span>
                                    <span>Mã lô vườn: {hh.contributedPlotCode}</span>
                                  </>
                                )}
                                {hh.phone && (
                                  <>
                                    <span>-</span>
                                    <span>SĐT: {hh.phone}</span>
                                  </>
                                )}
                                {hh.cccdMasked && (
                                  <>
                                    <span>-</span>
                                    <span>CCCD: {hh.cccdMasked}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="tr-auth-hh-right">
                              {hh.contributedKg !== null && hh.contributedKg !== undefined && (
                                <strong className="tr-auth-hh-kg">
                                  {Number(hh.contributedKg).toLocaleString("vi-VN")} kg
                                </strong>
                              )}
                              <span
                                className={
                                  hh.publicTraceConsent ? "tr-badge-green" : "tr-badge-neutral"
                                }
                              >
                                {hh.publicTraceConsent
                                  ? "Đồng ý hiện tên QR"
                                  : "Ẩn tên trên QR công khai"}
                              </span>
                            </div>
                          </div>

                          {hh.plots.length > 0 && (
                            <div className="tr-auth-plots-list">
                              {hh.plots.map((p) => {
                                const hasGis = Boolean(
                                  p.geometryJson || (p.lat !== null && p.lng !== null),
                                );
                                return (
                                  <div key={p.plotCode} className="tr-auth-plot-row">
                                    <div className="tr-auth-plot-specs">
                                      <span>
                                        Mã lô vườn: <strong>{p.plotCode}</strong>
                                      </span>
                                      <span>-</span>
                                      <span>
                                        Địa chính: Tờ {p.sheetNo || "—"} / Thửa {p.parcelNo || "—"}
                                      </span>
                                      <span>-</span>
                                      <span>
                                        Diện tích: {Number(p.areaHa || 0).toLocaleString("vi-VN")} ha
                                      </span>
                                      {p.lat !== null && p.lng !== null && (
                                        <>
                                          <span>-</span>
                                          <span>
                                            Tọa độ: {Number(p.lat).toFixed(5)}°B,{" "}
                                            {Number(p.lng).toFixed(5)}°Đ
                                          </span>
                                        </>
                                      )}
                                    </div>

                                    {hasGis && (
                                      <button
                                        type="button"
                                        className="tr-auth-gis-btn"
                                        onClick={() => openAuthorityPlotGis(hh, p)}
                                      >
                                        <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
                                        <span>Xem ranh giới GIS</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Nhật ký canh tác & Phun thuốc BVTV chi tiết */}
                <AuthorityDiarySection diaries={data.authorityData.cultivationDiaries} />

                {/* 3. Biên bản kiểm tra & Dữ liệu cảnh báo / kỷ luật nội bộ */}
                <div className="tr-ext-two-col">
                  <div className="tr-card">
                    <div className="tr-card-header">
                      <h3 className="tr-card-title">Biên bản kiểm tra vùng trồng</h3>
                      <span className="tr-count-badge">
                        {data.authorityData.inspectionMinutes.length} biên bản
                      </span>
                    </div>

                    {data.authorityData.inspectionMinutes.length === 0 ? (
                      <div className="tr-farmer-empty">Chưa có biên bản kiểm tra được lưu trữ.</div>
                    ) : (
                      <div className="tr-minutes-list">
                        {data.authorityData.inspectionMinutes.map((m) => (
                          <div key={m.code} className="tr-minute-item">
                            <div className="tr-minute-head">
                              <strong className="tr-minute-code">{m.code}</strong>
                              <span className="tr-minute-date">{formatTraceDate(m.heldOn, "vi")}</span>
                            </div>
                            <div className="tr-minute-meta">
                              Cán bộ kiểm tra: {m.officer} - Địa điểm: {m.location}
                            </div>
                            <div className="tr-minute-result">Kết luận: {m.result}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="tr-card">
                    <div className="tr-card-header">
                      <h3 className="tr-card-title">Hồ sơ cảnh báo &amp; kỷ luật nội bộ</h3>
                      <span className="tr-count-badge">
                        {data.authorityData.internalViolations.length} ghi nhận
                      </span>
                    </div>

                    {data.authorityData.internalViolations.length === 0 ? (
                      <div className="tr-farmer-empty">
                        Không có vi phạm hoặc cảnh cáo nội bộ nào đối với các hộ nguồn của lô hàng.
                      </div>
                    ) : (
                      <div className="tr-minutes-list">
                        {data.authorityData.internalViolations.map((v, idx) => (
                          <div key={idx} className="tr-minute-item is-violation-item">
                            <div className="tr-minute-head">
                              <strong className="tr-minute-code">{v.title}</strong>
                              <span
                                className={
                                  v.severity === "critical" ? "tr-badge-red" : "tr-badge-neutral"
                                }
                              >
                                {v.severity === "critical" ? "Nghiêm trọng" : "Nhắc nhở"}
                              </span>
                            </div>
                            <div className="tr-minute-meta">
                              Ngày phát hiện: {formatTraceDate(v.detectedOn, "vi")}
                              {v.plotCode ? ` - Mã lô vườn: ${v.plotCode}` : ""}
                            </div>
                            {v.description && <div className="tr-minute-result">{v.description}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ─── Dải gợi ý đăng nhập dành cho Doanh nghiệp & Cơ quan quản lý khi quét chưa đăng nhập ─── */}
            {!ac.isAuthenticated && (
              <div className="tr-auth-hint-bar no-print">
                <div className="tr-auth-hint-text">
                  <Lock size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{t.authHint.text}</span>
                </div>
                <Link href={loginWithNextHref} className="tr-auth-hint-link">
                  {t.authHint.loginBtn}
                </Link>
              </div>
            )}

            {/* ─── Thao tác nhanh: Trang chủ - In hồ sơ - Chia sẻ liên kết ─── */}
            <div className="tr-actions no-print">
              <Link href="/" className="tr-home-btn">
                <ArrowLeft size={17} strokeWidth={2.3} aria-hidden="true" />
                <span>{t.actions.home}</span>
              </Link>
              <button type="button" className="tr-print-btn" onClick={handlePrint}>
                <Printer size={17} strokeWidth={2.2} aria-hidden="true" />
                <span>{t.actions.print}</span>
              </button>
              <button type="button" className="tr-share-btn" onClick={handleShare}>
                {copied ? (
                  <>
                    <Check size={17} strokeWidth={2.4} aria-hidden="true" />
                    <span>{t.actions.copied}</span>
                  </>
                ) : (
                  <>
                    <Share2 size={17} strokeWidth={2.2} aria-hidden="true" />
                    <span>{t.actions.share}</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : null}
      </main>

      {/* ─── Chân trang ─── */}
      <footer className="tr-footer">
        <div className="tr-wrap tr-footer-inner">
          <p className="tr-footer-text">{t.footer.line1}</p>
          <p className="tr-footer-org">{t.footer.line2}</p>
          <p className="tr-footer-meta">{t.footer.line3}</p>
        </div>
      </footer>

      {/* ─── Modal Bản Đồ Vệ Tinh Ranh Giới GIS Thửa Đất (Dành riêng Cấp 3 Cơ quan quản lý) ─── */}
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
