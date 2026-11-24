"use client";

import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import DwellSlideshow, { type DwellSlide } from "@/components/landing/DwellSlideshow";
import LandingFooter from "@/components/landing/LandingFooter";
import { Search } from "@/components/ui/PublicIcon";
import { ROLE_LABELS } from "@/constants/roles";
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT, api } from "@/lib/api-client";
import { replaceUrlPreservingState } from "@/lib/back-navigation";
import { homePathFor, INTRO_PATH } from "@/lib/routes";
import { isSafeTraceCode, safeDecodeURIComponent } from "@/utils/url-safety";
import { persistTraceLang, rememberTraceKindHint } from "./[code]/trace-i18n";
import "@/components/landing/landing.css";
import "@/components/landing/swiss-landing.css";
import "./swiss-trace.css";

interface SampleLot {
  sampleType?: "lot";
  code: string;
  qrToken?: string | null;
  variety?: string | null;
  harvestedOn: string | null;
  weightKg: number | null;
  packhouseCode?: string | null;
  producerLabel?: string | null;
  market: string | null;
  status: string | null;
}

interface SampleStamp {
  unitType?: "box" | "fruit";
  code: string;
  qrToken?: string | null;
  weightKg: number | null;
  grade: string | null;
  issuedAt: string | null;
  lotCode: string | null;
  producerLabel: string;
}

interface SamplePlot {
  plotCode: string;
  qrToken?: string | null;
  zoneCode: string;
  villageName?: string | null;
  variety?: string | null;
  areaHa?: number | null;
  treeCount?: number | null;
  maxQuotaKg?: number | null;
  producerLabel?: string | null;
}

function extractPreservedUrlSuffix(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, "https://puc.local");
    const qs = new URLSearchParams();
    const lang = parsed.searchParams.get("lang");
    if (lang === "vi" || lang === "en" || lang === "zh") {
      qs.set("lang", lang);
    }
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const pass = hashParams.get("auditPass");
    const safeHash =
      pass && /^[A-Za-z0-9_-]{4,80}$/.test(pass.trim())
        ? `#auditPass=${encodeURIComponent(pass.trim())}`
        : "";
    return `${qs.toString() ? `?${qs.toString()}` : ""}${safeHash}`;
  } catch {
    return "";
  }
}

function normalizeLookupCandidate(raw: string): string {
  return safeDecodeURIComponent(raw)
    .trim()
    .replace(/^(?:thửa|thua|lô|lo|mã\s*lô|ma\s*lo|mã\s*thửa|ma\s*thua|mã\s*vùng|ma\s*vung|mã\s*hộ|ma\s*ho|nông\s*hộ|nong\s*ho|hộ|ho|mã|ma|puc|phc|tem|thùng|thung)\s*[:#-]?\s*/iu, "")
    .replace(/\s+/g, "");
}

function resolveTraceInputHref(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed || /^\.+$/.test(trimmed)) return null;

  const preservedSuffix = /[?#]/.test(trimmed) ? extractPreservedUrlSuffix(trimmed) : "";

  const tokenPathMatch = /(?:^|\/)t\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/.exec(trimmed);
  if (tokenPathMatch?.[1]) {
    const candidate = safeDecodeURIComponent(tokenPathMatch[1]).trim();
    return isSafeTraceCode(candidate) ? `/t/${encodeURIComponent(candidate)}${preservedSuffix}` : null;
  }

  const tracePathMatch = /(?:^|\/)trace\/([^/?#\s]+)(?:[/?#]|$)/.exec(trimmed);
  if (tracePathMatch?.[1]) {
    const extracted = normalizeLookupCandidate(tracePathMatch[1]);
    return isSafeTraceCode(extracted) ? `/trace/${encodeURIComponent(extracted)}${preservedSuffix}` : null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (!last) return null;
      const extracted = normalizeLookupCandidate(last);
      return isSafeTraceCode(extracted) ? `/trace/${encodeURIComponent(extracted)}${preservedSuffix}` : null;
    } catch {
      return null;
    }
  }

  const candidate = normalizeLookupCandidate(trimmed);
  if (!candidate) return null;

  if (/^[A-Za-z0-9]{12,24}$/.test(candidate) && /[a-z]/.test(candidate) && /[A-Z0-9]/.test(candidate)) {
    return isSafeTraceCode(candidate) ? `/t/${encodeURIComponent(candidate)}` : null;
  }

  if (!isSafeTraceCode(candidate)) return null;
  return `/trace/${encodeURIComponent(candidate)}`;
}

interface TraceSamplesResponse {
  lots: SampleLot[];
  stamps: SampleStamp[];
  plots?: SamplePlot[];
}

type SampleTab = "all" | "lots" | "plots" | "stamps";

let cachedTraceSamples: TraceSamplesResponse | null = null;

const TRACE_HERO_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/lux-qr-atelier.jpg",
    alt: "Sầu riêng Cư Né gắn thẻ truy xuất nguồn gốc QR tối giản đặt trên quầy đá travertine và vách nan gỗ sồi",
    objectPosition: "center 54%",
    mobileObjectPosition: "50% 56%",
  },
  {
    src: "/landing/real-qr-trace-lot.jpg",
    alt: "Lô sầu riêng xuất khẩu gắn tem mã QR định danh nguồn gốc rõ ràng tại kho đóng gói liên kết HTX Cư Né",
    objectPosition: "center 50%",
    mobileObjectPosition: "50% 50%",
  },
  {
    src: "/landing/lux-qr-lot-atelier.jpg",
    alt: "Cặp sầu riêng tuyển chọn gắn thẻ QR trên bệ đá tự nhiên ấm áp theo phong cách kiến trúc tối giản",
    objectPosition: "center 54%",
    mobileObjectPosition: "52% 56%",
  },
  {
    src: "/landing/lux-hero-trace-gallery.jpg",
    alt: "Sầu riêng gắn tem QR cùng sổ nhật ký mùa vụ và điện thoại kiểm tra nguồn gốc trên bàn gỗ sồi",
    objectPosition: "center 54%",
    mobileObjectPosition: "55% 56%",
  },
];

const TRACE_PURITY_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/lux-lab-purity-square.jpg",
    alt: "Mẫu múi sầu riêng tinh khiết đặt trên đĩa sứ trắng cạnh lồng kính thẩm định và bệ đá travertine",
    objectPosition: "center 54%",
    mobileObjectPosition: "50% 54%",
  },
  {
    src: "/landing/lux-arils-square.jpg",
    alt: "Múi sầu riêng vàng ươm tự nhiên đặt trên đĩa gốm thủ công trong không gian nan gỗ sáng thoáng",
    objectPosition: "center 52%",
    mobileObjectPosition: "50% 52%",
  },
  {
    src: "/landing/real-lab-test.jpg",
    alt: "Kỹ thuật viên kiểm nghiệm mẫu cơm sầu riêng trên khay inox cùng cân phân tích an toàn thực phẩm",
    objectPosition: "center 48%",
    mobileObjectPosition: "55% 48%",
  },
];

function formatViDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function formatLotScaleLine(lot: SampleLot): string | null {
  if (lot.weightKg !== null && lot.weightKg !== undefined && Number(lot.weightKg) > 0) {
    return `Sản lượng: ${Number(lot.weightKg).toLocaleString("vi-VN")} kg`;
  }
  return null;
}

function extractAuditPassFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromHash = hashParams.get("auditPass")?.trim();
  if (fromHash && /^[A-Za-z0-9_-]{4,80}$/.test(fromHash)) return fromHash;
  return null;
}

function subscribeAuditPassSession(listener: () => void): () => void {
  window.addEventListener(AUTH_LOGOUT_EVENT, listener);
  window.addEventListener(AUTH_EXPIRED_EVENT, listener);
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener(AUTH_LOGOUT_EVENT, listener);
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
    window.removeEventListener("hashchange", listener);
  };
}

function readAuditSessionReady(): boolean {
  try {
    if (window.sessionStorage.getItem("puc_audit_pass")) return true;
    return Boolean(extractAuditPassFromLocation());
  } catch {
    return false;
  }
}

export default function TraceLookupPage() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [code, setCode] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [samples, setSamples] = useState<TraceSamplesResponse | null>(() => cachedTraceSamples);
  const [loading, setLoading] = useState<boolean>(() => cachedTraceSamples === null);
  const [tab, setTab] = useState<SampleTab>("all");
  const auditSessionReady = useSyncExternalStore(subscribeAuditPassSession, readAuditSessionReady, () => false);

  const authenticated = status === "authenticated";
  const workspaceHref = homePathFor(session?.user.role);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const rawLang = params.get("lang")?.trim().toLowerCase();
      if (rawLang === "vi" || rawLang === "zh" || rawLang === "en") {
        persistTraceLang(rawLang);
      } else if (rawLang?.startsWith("zh")) {
        persistTraceLang("zh");
      }

      const rawPass = extractAuditPassFromLocation();
      if (rawPass) {
        window.sessionStorage.setItem("puc_audit_pass", rawPass);
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hadQueryPass = params.has("auditPass");
      const hadHashPass = hashParams.has("auditPass");
      if (hadQueryPass || hadHashPass) {
        params.delete("auditPass");
        hashParams.delete("auditPass");
        const qs = params.toString();
        const hs = hashParams.toString();
        const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${hs ? `#${hs}` : ""}`;
        replaceUrlPreservingState(cleanUrl);
      }
    } catch {
      // Bỏ qua nếu trình duyệt chặn sessionStorage hoặc History API
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadSamples = (silent: boolean) => {
      if (!silent && cachedTraceSamples) return;
      api
        .get<TraceSamplesResponse>("/public/trace-samples")
        .then((res) => {
          cachedTraceSamples = res;
          if (active) setSamples(res);
        })
        .catch(() => { })
        .finally(() => {
          if (active && !silent) setLoading(false);
        });
    };

    loadSamples(Boolean(cachedTraceSamples));

    let eventSource: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      try {
        eventSource = new EventSource("/api/public/trace-stream");
        eventSource.onmessage = () => loadSamples(true);
      } catch {
        eventSource = null;
      }
    }

    const handleWakeup = () => {
      if (document.visibilityState === "visible") {
        loadSamples(true);
      }
    };
    document.addEventListener("visibilitychange", handleWakeup);
    window.addEventListener("focus", handleWakeup);

    return () => {
      active = false;
      eventSource?.close();
      document.removeEventListener("visibilitychange", handleWakeup);
      window.removeEventListener("focus", handleWakeup);
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    const targetHref = resolveTraceInputHref(code);
    if (!targetHref) {
      setInputError("Mã tra cứu không hợp lệ. Vui lòng nhập mã lô hàng, mã thùng, tem trái, mã thửa đất hoặc mã hộ.");
      return;
    }
    setInputError(null);
    router.push(targetHref);
  };

  const lots = useMemo(() => samples?.lots ?? [], [samples]);
  const stamps = useMemo(() => samples?.stamps ?? [], [samples]);
  const plots = useMemo(() => samples?.plots ?? [], [samples]);

  useEffect(() => {
    for (const lot of lots) {
      rememberTraceKindHint(lot.code, "lot");
      rememberTraceKindHint(lot.qrToken, "lot");
    }
    for (const pl of plots) {
      rememberTraceKindHint(pl.plotCode, "plot");
      rememberTraceKindHint(pl.qrToken, "plot");
    }
    for (const st of stamps) {
      const kind = st.unitType === "box" ? "box" : "fruit";
      rememberTraceKindHint(st.code, kind);
      rememberTraceKindHint(st.qrToken, kind);
    }
  }, [lots, plots, stamps]);

  const quickSamples = useMemo(() => {
    const picked: Array<{ label: string; href: string }> = [];
    const seen = new Set<string>();
    for (const lot of lots.slice(0, 2)) {
      if (lot.code && !seen.has(lot.code)) {
        seen.add(lot.code);
        picked.push({
          label: lot.code,
          href: lot.qrToken
            ? `/t/${encodeURIComponent(lot.qrToken)}`
            : `/trace/${encodeURIComponent(lot.code)}`,
        });
      }
    }
    for (const pl of plots.slice(0, 1)) {
      if (pl.plotCode && !seen.has(pl.plotCode)) {
        seen.add(pl.plotCode);
        picked.push({
          label: `Thửa ${pl.plotCode}`,
          href: pl.qrToken
            ? `/t/${encodeURIComponent(pl.qrToken)}`
            : `/trace/${encodeURIComponent(pl.plotCode)}`,
        });
      }
    }
    for (const st of stamps.slice(0, 1)) {
      if (st.code && !seen.has(st.code)) {
        seen.add(st.code);
        picked.push({
          label: st.code,
          href: st.qrToken
            ? `/t/${encodeURIComponent(st.qrToken)}`
            : `/trace/${encodeURIComponent(st.code)}`,
        });
      }
    }
    return picked.slice(0, 4);
  }, [lots, plots, stamps]);

  const showLots = tab === "all" || tab === "lots";
  const showPlots = tab === "all" || tab === "plots";
  const showStamps = tab === "all" || tab === "stamps";
  const visibleLots = tab === "all" ? lots.slice(0, 4) : lots;
  const visiblePlots = tab === "all" ? plots.slice(0, 2) : plots;
  const visibleStamps = tab === "all" ? stamps.slice(0, 2) : stamps;

  return (
    <div className="lp sw-page sw-trace-page" id="top">
      {/* ─── Thanh điều hướng cố định đồng bộ Landing Page (Không viền bao chữ HTX Cư Né) ─── */}
      <header className="sw-trace-topbar">
        <div className="sw-trace-topbar-inner">
          <Link href={INTRO_PATH} className="sw-trace-brand">
            <Image src="/newlogo.png" alt="" width={22} height={22} className="eh-brand-logo" />
            <span>HTX Cư Né</span>
          </Link>

          <nav className="sw-trace-nav" aria-label="Điều hướng cổng truy xuất">
            <a href="#tra-cuu-ma">Tra cứu mã</a>
            <a href="#ho-so-mau">Hồ sơ mẫu</a>
            <a href="#tieu-chuan">Ba cấp truy xuất</a>
          </nav>

          <div className="sw-trace-top-actions">
            <Link href={INTRO_PATH} className="sw-trace-top-link">
              Trang giới thiệu
            </Link>
            <span className="sw-trace-top-sep" aria-hidden="true" />
            {authenticated ? (
              <>
                {session?.user && (
                  <span className="sw-trace-role-chip">
                    {session.user.fullName} ({ROLE_LABELS[session.user.role]})
                  </span>
                )}
                <Link href={workspaceHref} className="sw-trace-auth-btn">
                  Vào hệ thống
                </Link>
              </>
            ) : (
              <Link href="/login" className="sw-trace-auth-btn">
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ─── KHU VỰC MỞ ĐẦU: LƯỚI 4 CỘT (2 CỘT TRA CỨU - 2 CỘT NHIẾP ẢNH SẦU RIÊNG QR) ─── */}
        <section id="tra-cuu-ma" className="sw-section sw-trace-hero-sec" aria-labelledby="trace-hero-title">
          <div className="sw-grid sw-trace-hero-row">
            <div className="sw-cell sw-col-1-2 sw-trace-hero-panel">
              <div className="sw-trace-hero-head">
                <span className="sw-trace-kicker">Cổng truy xuất nguồn gốc điện tử - HTX Cư Né</span>
              </div>

              <div className="sw-trace-hero-body">
                <h1 id="trace-hero-title" className="sw-trace-title">
                  Tra cứu nguồn gốc mã QR
                </h1>
                <p className="sw-trace-lead">
                  Nhập mã lô hàng, mã thùng đóng gói, tem trái, mã thửa đất hoặc mã hộ thành viên để đối chiếu hồ sơ vùng trồng, nhật ký canh tác và phiếu kiểm nghiệm.
                </p>

                <form onSubmit={handleSubmit} className="sw-trace-form" role="search">
                  <div className="sw-trace-input-wrap">
                    <Search size={17} className="sw-trace-search-icon" aria-hidden="true" />
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value);
                        if (inputError) setInputError(null);
                      }}
                      placeholder="Nhập mã lô, mã thùng, tem trái, mã thửa hoặc mã hộ..."
                      aria-label="Mã lô hàng, mã thùng đóng gói, tem trái, mã thửa đất hoặc mã hộ"
                      className="sw-trace-input"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {code && (
                      <button
                        type="button"
                        className="sw-trace-clear"
                        onClick={() => {
                          setCode("");
                          if (inputError) setInputError(null);
                        }}
                        aria-label="Xóa mã đang nhập"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <button type="submit" className="sw-trace-submit">
                    <span>Tra cứu hồ sơ</span>
                  </button>
                </form>

                {inputError && (
                  <p
                    role="alert"
                    style={{
                      margin: "10px 0 0",
                      padding: "8px 12px",
                      borderRadius: 0,
                      border: "1px solid #d4d4d2",
                      background: "#fef2f2",
                      color: "#b91c1c",
                      fontSize: 13,
                      lineHeight: 1.45,
                    }}
                  >
                    {inputError}
                  </p>
                )}

                {quickSamples.length > 0 && (
                  <div className="sw-trace-quick" aria-label="Mã mẫu tra cứu nhanh">
                    <span className="sw-trace-quick-label">Mã mẫu:</span>
                    {quickSamples.slice(0, 3).map((sample) => (
                      <Link
                        key={sample.label}
                        href={sample.href}
                        className="sw-trace-chip"
                      >
                        {sample.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="sw-trace-hero-foot">
                <span className="sw-micro">HTX Kinh doanh - Dịch vụ Tổng hợp Cư Né</span>
                <span className="sw-micro">Chuẩn liên thông Cổng Truy xuất Quốc gia</span>
              </div>
            </div>

            <div className="sw-media sw-col-3-4 sw-trace-hero-media">
              <DwellSlideshow
                slides={TRACE_HERO_SLIDES}
                priorityFirst
                sizes="(max-width: 768px) calc(100vw - 44px), (max-width: 960px) 100vw, 50vw"
              />
            </div>
          </div>
        </section>

        {/* ─── 01. HỒ SƠ XÁC THỰC GẦN ĐÂY ─── */}
        <section id="ho-so-mau" className="sw-section" aria-labelledby="hosomau-title">
          <header className="sw-grid sw-sec-head">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2-3 sw-head-main">
              <span className="sw-sec-index">01 / Hồ sơ xác thực</span>
              <h2 id="hosomau-title" className="sw-sec-title">
                Lô xuất xưởng, Thửa đất và Tem định danh gần đây
              </h2>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </header>

          <div className="sw-catalog-tabbar">
            <div className="sw-simple-tabs" role="tablist" aria-label="Phân loại hồ sơ mẫu">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "all"}
                className={`sw-tab-pill ${tab === "all" ? "is-active" : ""}`}
                onClick={() => setTab("all")}
              >
                Tất cả
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "lots"}
                className={`sw-tab-pill ${tab === "lots" ? "is-active" : ""}`}
                onClick={() => setTab("lots")}
              >
                Lô xuất xưởng
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "plots"}
                className={`sw-tab-pill ${tab === "plots" ? "is-active" : ""}`}
                onClick={() => setTab("plots")}
              >
                Bảng QR Thửa đất
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "stamps"}
                className={`sw-tab-pill ${tab === "stamps" ? "is-active" : ""}`}
                onClick={() => setTab("stamps")}
              >
                Thùng và Tem mẫu
              </button>
            </div>
          </div>

          {auditSessionReady && (
            <div className="sw-field-audit-callout" role="status">
              <div className="sw-field-audit-copy">
                <span className="sw-field-audit-kicker">
                  Phiên Thẩm định Thực địa đã kích hoạt trên trình duyệt này
                </span>
                <p className="sw-field-audit-desc">
                  Thẻ đoàn công tác đã sẵn sàng. Quý đoàn có thể chọn bất kỳ thửa vườn hoặc lô hàng bên dưới, hoặc quét trực tiếp Bảng QR đầu thửa vườn để đối chiếu vị trí thực tế tại vườn.
                </p>
              </div>
            </div>
          )}

          <div className="sw-trace-dossier-grid">
            {loading ? (
              <div className="sw-trace-state">Đang tải danh sách hồ sơ truy xuất mẫu...</div>
            ) : (showLots ? visibleLots.length : 0) +
              (showPlots ? visiblePlots.length : 0) +
              (showStamps ? visibleStamps.length : 0) ===
              0 ? (
              <div className="sw-trace-state">
                Chưa có hồ sơ mẫu trong mục này. Quý khách có thể nhập trực tiếp mã lô hàng, mã thùng, tem trái hoặc mã thửa đất ở khung tra cứu phía trên.
              </div>
            ) : (
              <>
                {showLots &&
                  visibleLots.map((lot) => {
                    const scaleLine = formatLotScaleLine(lot);
                    const isRevoked = lot.status === "revoked";
                    const dateLabel = formatViDate(lot.harvestedOn);
                    const footLabel = dateLabel ? `Thu hoạch ${dateLabel}` : "Hồ sơ lô hàng";
                    const cardHref = lot.qrToken
                      ? `/t/${encodeURIComponent(lot.qrToken)}`
                      : `/trace/${encodeURIComponent(lot.code)}`;
                    return (
                      <Link
                        key={`lot-${lot.code}`}
                        href={cardHref}
                        className="sw-trace-card"
                      >
                        <div className="sw-trace-card-top">
                          <span className="sw-trace-card-kind">
                            {isRevoked ? "Lô đã thu hồi" : "Lô hàng xuất xưởng"}
                          </span>
                        </div>

                        <div className="sw-trace-card-main">
                          <h3 className="sw-trace-card-code">{lot.code}</h3>
                          <span className="sw-trace-card-owner">
                            {lot.producerLabel || "HTX Kinh doanh - Dịch vụ Tổng hợp Cư Né"}
                          </span>
                          <div className="sw-trace-card-meta">
                            <span>
                              Giống: {lot.variety || "Ri6 & Monthong"}
                              {scaleLine ? ` - ${scaleLine}` : ""}
                            </span>
                            <span>
                              Mã CSĐG: {lot.packhouseCode || "VN-DLPH-0089"} ({lot.market || "Xuất khẩu"})
                            </span>
                          </div>
                        </div>

                        <div className="sw-trace-card-foot">
                          <span className="sw-trace-card-date">{footLabel}</span>
                          <span className="sw-trace-card-cta">Xem hồ sơ lô</span>
                        </div>
                      </Link>
                    );
                  })}

                {showPlots &&
                  visiblePlots.map((pl) => {
                    const cardHref = pl.qrToken
                      ? `/t/${encodeURIComponent(pl.qrToken)}`
                      : `/trace/${encodeURIComponent(pl.plotCode)}`;
                    const areaText =
                      pl.areaHa !== null && pl.areaHa !== undefined
                        ? `${Number(pl.areaHa).toLocaleString("vi-VN")} ha`
                        : "Đã đo đạc GIS";
                    const treesText =
                      pl.treeCount !== null && pl.treeCount !== undefined && Number(pl.treeCount) > 0
                        ? ` (${Number(pl.treeCount).toLocaleString("vi-VN")} cây)`
                        : "";
                    return (
                      <Link
                        key={`plot-${pl.plotCode}`}
                        href={cardHref}
                        className="sw-trace-card"
                      >
                        <div className="sw-trace-card-top">
                          <span className="sw-trace-card-kind">Bảng QR Thửa đất tại vườn</span>
                        </div>

                        <div className="sw-trace-card-main">
                          <h3 className="sw-trace-card-code">Thửa {pl.plotCode}</h3>
                          <span className="sw-trace-card-owner">
                            {pl.producerLabel || "HTX Kinh doanh - Dịch vụ Tổng hợp Cư Né"}
                          </span>
                          <div className="sw-trace-card-meta">
                            <span>Mã vùng PUC: {pl.zoneCode}</span>
                            <span>
                              Quy mô: {areaText}
                              {treesText}
                            </span>
                          </div>
                        </div>

                        <div className="sw-trace-card-foot">
                          <span className="sw-trace-card-date">
                            {pl.villageName || "Xã Krông Búk"}
                          </span>
                          <span className="sw-trace-card-cta">Xem bảng thửa vườn</span>
                        </div>
                      </Link>
                    );
                  })}

                {showStamps &&
                  visibleStamps.map((stamp) => {
                    const dateLabel = formatViDate(stamp.issuedAt);
                    const isBox = stamp.unitType === "box";
                    const stampScaleLine =
                      stamp.weightKg !== null && stamp.weightKg !== undefined
                        ? `Khối lượng: ${Number(stamp.weightKg).toLocaleString("vi-VN")} kg${isBox ? " / Thùng" : " / Quả"}`
                        : `Phân hạng: Hạng ${stamp.grade || "A"}`;
                    const cardHref = stamp.qrToken
                      ? `/t/${encodeURIComponent(stamp.qrToken)}`
                      : `/trace/${encodeURIComponent(stamp.code)}`;
                    return (
                      <Link
                        key={`stamp-${stamp.code}`}
                        href={cardHref}
                        className="sw-trace-card"
                      >
                        <div className="sw-trace-card-top">
                          <span className="sw-trace-card-kind">
                            {isBox ? "Thùng đóng gói định danh lô" : "Tem quả - Dòng cao cấp"}
                          </span>
                        </div>

                        <div className="sw-trace-card-main">
                          <h3 className="sw-trace-card-code">{stamp.code}</h3>
                          <span className="sw-trace-card-owner">
                            {stamp.producerLabel || "HTX Kinh doanh - Dịch vụ Tổng hợp Cư Né"}
                          </span>
                          <div className="sw-trace-card-meta">
                            <span>{stampScaleLine}</span>
                            <span>
                              {stamp.lotCode
                                ? `Thuộc lô: ${stamp.lotCode}`
                                : "Thương hiệu riêng HTX Cư Né"}
                            </span>
                          </div>
                        </div>

                        <div className="sw-trace-card-foot">
                          <span className="sw-trace-card-date">
                            {dateLabel ? `Ngày ${dateLabel}` : "Định danh điện tử"}
                          </span>
                          <span className="sw-trace-card-cta">Kiểm tra mã</span>
                        </div>
                      </Link>
                    );
                  })}
              </>
            )}
          </div>
        </section>

        {/* ─── 02. BA CẤP ĐỘ PHÂN QUYỀN TRUY XUẤT TRÊN CÙNG MÃ QR ─── */}
        <section id="tieu-chuan" className="sw-section" aria-labelledby="tieuchuan-title">
          <header className="sw-grid sw-sec-head">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2-3 sw-head-main">
              <span className="sw-sec-index">02 / Phân quyền bảo mật</span>
              <h2 id="tieuchuan-title" className="sw-sec-title">
                Ba cấp độ khi quét cùng một mã QR
              </h2>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </header>

          <div className="sw-grid sw-checker-row sw-trace-pillars">
            <div className="sw-cell sw-col-1 sw-between">
              <span className="sw-micro">01 - Công khai</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Người tiêu dùng và Nhà nhập khẩu</h3>
                <p className="sw-caption-meta">
                  <span>Định danh thửa vườn, lô hàng, mã vùng PUC, cơ sở đóng gói</span>
                  <span>Đối chiếu quy trình canh tác và bản scan kiểm nghiệm</span>
                </p>
              </div>
            </div>

            <div className="sw-cell sw-col-2 sw-between">
              <span className="sw-micro">02 - Doanh nghiệp</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Cơ sở đóng gói và Nhà phân phối</h3>
                <p className="sw-caption-meta">
                  <span>Các vùng nguồn tham gia và sản lượng định mức từng thửa</span>
                  <span>Trạng thái kiểm nghiệm chi tiết và chuỗi lạnh</span>
                </p>
              </div>
            </div>

            <div className="sw-cell sw-col-3 sw-between">
              <span className="sw-micro">03 - Cơ quan quản lý</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Chi cục, Cán bộ xã và Thanh tra</h3>
                <p className="sw-caption-meta">
                  <span>Danh sách hộ, ranh giới thửa GIS và nhật ký BVTV</span>
                  <span>Biên bản kiểm tra, ghi nhật ký mọi lượt xem</span>
                </p>
              </div>
            </div>

            <div className="sw-media sw-col-4 sw-trace-purity-media">
              <DwellSlideshow
                slides={TRACE_PURITY_SLIDES}
                staggerMs={550}
                sizes="(max-width: 768px) calc(100vw - 44px), (max-width: 960px) 50vw, 25vw"
              />
            </div>
          </div>
        </section>
      </main>

      <LandingFooter fromTrace />
    </div>
  );
}
