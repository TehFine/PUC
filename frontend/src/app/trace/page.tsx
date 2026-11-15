"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import DwellSlideshow, { type DwellSlide } from "@/components/landing/DwellSlideshow";
import LandingFooter from "@/components/landing/LandingFooter";
import { api } from "@/lib/api-client";
import { homePathFor } from "@/lib/routes";
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

function resolveTraceInputHref(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const tokenPathMatch = /(?:^|\/)t\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/.exec(trimmed);
  if (tokenPathMatch?.[1]) {
    return `/t/${encodeURIComponent(tokenPathMatch[1])}`;
  }

  const tracePathMatch = /(?:^|\/)trace\/([^/?#\s]+)(?:[/?#]|$)/.exec(trimmed);
  if (tracePathMatch?.[1]) {
    return `/trace/${encodeURIComponent(decodeURIComponent(tracePathMatch[1]))}`;
  }

  if (/^[A-Za-z0-9]{12,24}$/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z0-9]/.test(trimmed)) {
    return `/t/${encodeURIComponent(trimmed)}`;
  }

  return `/trace/${encodeURIComponent(trimmed)}`;
}

interface TraceSamplesResponse {
  lots: SampleLot[];
  stamps: SampleStamp[];
}

type SampleTab = "all" | "lots" | "stamps";

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

export default function TraceLookupPage() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [code, setCode] = useState("");
  const [samples, setSamples] = useState<TraceSamplesResponse | null>(() => cachedTraceSamples);
  const [loading, setLoading] = useState<boolean>(() => cachedTraceSamples === null);
  const [tab, setTab] = useState<SampleTab>("all");

  const authenticated = status === "authenticated";
  const workspaceHref = homePathFor(session?.user.role);

  useEffect(() => {
    if (cachedTraceSamples) return;
    let active = true;
    api
      .get<TraceSamplesResponse>("/public/trace-samples")
      .then((res) => {
        cachedTraceSamples = res;
        if (active) setSamples(res);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const targetHref = resolveTraceInputHref(code);
    if (!targetHref) return;
    router.push(targetHref);
  };

  const lots = useMemo(() => samples?.lots ?? [], [samples]);
  const stamps = useMemo(() => samples?.stamps ?? [], [samples]);

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
    for (const st of stamps.slice(0, 2)) {
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
  }, [lots, stamps]);

  const showLots = tab === "all" || tab === "lots";
  const showStamps = tab === "all" || tab === "stamps";
  const visibleLots = tab === "all" ? lots.slice(0, 4) : lots;
  const visibleStamps = tab === "all" ? stamps.slice(0, 4) : stamps;
  const totalCount = lots.length + stamps.length;

  return (
    <div className="lp sw-page sw-trace-page" id="top">
      {/* ─── Thanh điều hướng cố định đồng bộ Landing Page (Không viền bao chữ HTX Cư Né) ─── */}
      <header className="sw-trace-topbar">
        <div className="sw-trace-topbar-inner">
          <Link href="/" className="sw-trace-brand">
            <Image src="/newlogo.png" alt="" width={22} height={22} className="eh-brand-logo" />
            <span>HTX Cư Né</span>
          </Link>

          <nav className="sw-trace-nav" aria-label="Điều hướng cổng truy xuất">
            <a href="#tra-cuu-ma">Tra cứu mã</a>
            <a href="#ho-so-mau">Lô &amp; thùng mẫu</a>
            <a href="#tieu-chuan">Ba cấp truy xuất</a>
          </nav>

          <div className="sw-trace-top-actions">
            <Link href="/" className="sw-trace-top-link">
              Trang chủ
            </Link>
            <span className="sw-trace-top-sep" aria-hidden="true" />
            {authenticated ? (
              <Link href={workspaceHref} className="sw-trace-auth-btn">
                Vào hệ thống
              </Link>
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
                <span className="sw-trace-kicker">Truy xuất nguồn gốc theo lô - HTX Cư Né</span>
              </div>

              <div className="sw-trace-hero-body">
                <h1 id="trace-hero-title" className="sw-trace-title">
                  Tra cứu mã lô &amp; thùng QR
                </h1>
                <p className="sw-trace-lead">
                  Nhập mã lô hàng, mã thùng đóng gói hoặc mã QR để xem vùng trồng, dòng thời gian 5 bước và phiếu kiểm nghiệm.
                </p>

                <form onSubmit={handleSubmit} className="sw-trace-form" role="search">
                  <div className="sw-trace-input-wrap">
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="sw-trace-search-icon"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Nhập token /t/..., mã lô chữ hoặc mã thùng..."
                      aria-label="Token QR chống giả, mã lô hàng hoặc mã thùng đóng gói"
                      className="sw-trace-input"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {code && (
                      <button
                        type="button"
                        className="sw-trace-clear"
                        onClick={() => setCode("")}
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
                Lô xuất xưởng &amp; Thùng đóng gói gần đây
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
                Tất cả {!loading && totalCount > 0 ? `(${totalCount})` : ""}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "lots"}
                className={`sw-tab-pill ${tab === "lots" ? "is-active" : ""}`}
                onClick={() => setTab("lots")}
              >
                Lô xuất xưởng {!loading && lots.length > 0 ? `(${lots.length})` : ""}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "stamps"}
                className={`sw-tab-pill ${tab === "stamps" ? "is-active" : ""}`}
                onClick={() => setTab("stamps")}
              >
                Thùng &amp; Tem mẫu {!loading && stamps.length > 0 ? `(${stamps.length})` : ""}
              </button>
            </div>
          </div>

          <div className="sw-trace-dossier-grid">
            {loading ? (
              <div className="sw-trace-state">Đang tải danh sách lô hàng và thùng đóng gói gần đây…</div>
            ) : (showLots ? visibleLots.length : 0) + (showStamps ? visibleStamps.length : 0) === 0 ? (
              <div className="sw-trace-state">
                Chưa có hồ sơ mẫu trong mục này. Quý khách có thể nhập trực tiếp mã lô hoặc mã thùng ở khung tra cứu phía trên.
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
                            {lot.qrToken && (
                              <span>Đường dẫn QR chống giả: /t/{lot.qrToken}</span>
                            )}
                          </div>
                        </div>

                        <div className="sw-trace-card-foot">
                          <span className="sw-trace-card-date">{footLabel}</span>
                          <span className="sw-trace-card-cta">Xem hồ sơ lô</span>
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
                            {stamp.qrToken && (
                              <span>Đường dẫn QR chống giả: /t/{stamp.qrToken}</span>
                            )}
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
                <h3 className="sw-caption-title">Người tiêu dùng &amp; Nhà nhập khẩu</h3>
                <p className="sw-caption-meta">
                  <span>Nhận diện lô, mã vùng PUC, cơ sở đóng gói</span>
                  <span>Dòng thời gian 5 bước &amp; bản scan kiểm nghiệm</span>
                </p>
              </div>
            </div>

            <div className="sw-cell sw-col-2 sw-between">
              <span className="sw-micro">02 - Doanh nghiệp</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Cơ sở đóng gói &amp; Nhà phân phối</h3>
                <p className="sw-caption-meta">
                  <span>Các vùng nguồn tham gia lô &amp; sản lượng từng vùng</span>
                  <span>Trạng thái kiểm nghiệm chi tiết &amp; chuỗi lạnh</span>
                </p>
              </div>
            </div>

            <div className="sw-cell sw-col-3 sw-between">
              <span className="sw-micro">03 - Cơ quan quản lý</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Chi cục, Cán bộ xã &amp; Thanh tra</h3>
                <p className="sw-caption-meta">
                  <span>Danh sách hộ, ranh giới thửa GIS &amp; nhật ký phun</span>
                  <span>Biên bản kiểm tra - Ghi nhật ký mọi lượt xem</span>
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
