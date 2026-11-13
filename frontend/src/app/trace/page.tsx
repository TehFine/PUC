"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import DwellSlideshow, { type DwellSlide } from "@/components/landing/DwellSlideshow";
import LandingFooter from "@/components/landing/LandingFooter";
import { api } from "@/lib/api-client";
import { homePathFor } from "@/lib/routes";
import "@/components/landing/landing.css";
import "@/components/landing/swiss-landing.css";
import "./swiss-trace.css";

interface SampleLot {
  sampleType?: "lot" | "plot";
  code: string;
  harvestedOn: string | null;
  weightKg: number | null;
  areaHa?: number | null;
  buyer: string | null;
  market: string | null;
  status: string | null;
}

interface SampleStamp {
  code: string;
  issuedAt: string | null;
  lotCode: string | null;
  weightKg: number | null;
  grade: string | null;
  householdName: string;
}

interface TraceSamplesResponse {
  lots: SampleLot[];
  stamps: SampleStamp[];
}

type SampleTab = "all" | "lots" | "stamps";

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

function formatLotBadge(lot: SampleLot): { text: string; tone: "ok" | "warn" } {
  if (lot.weightKg !== null && lot.weightKg !== undefined && Number(lot.weightKg) > 0) {
    return {
      text: `${Number(lot.weightKg).toLocaleString("vi-VN")} kg`,
      tone: "ok",
    };
  }
  if (lot.areaHa !== null && lot.areaHa !== undefined && Number(lot.areaHa) > 0) {
    return {
      text: `${Number(lot.areaHa).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha`,
      tone: lot.status === "pending" || lot.status === "improve" ? "warn" : "ok",
    };
  }
  return {
    text: lot.sampleType === "plot" ? "Hồ sơ PUC" : "Đã định danh",
    tone: "ok",
  };
}

export default function TraceLookupPage() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [code, setCode] = useState("");
  const [samples, setSamples] = useState<TraceSamplesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SampleTab>("all");

  const authenticated = status === "authenticated";
  const workspaceHref = homePathFor(session?.user.role);

  useEffect(() => {
    let active = true;
    api
      .get<TraceSamplesResponse>("/public/trace-samples")
      .then((res) => {
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
    const trimmed = code.trim();
    if (!trimmed) return;
    router.push(`/trace/${encodeURIComponent(trimmed)}`);
  };

  const lots = useMemo(() => samples?.lots ?? [], [samples]);
  const stamps = useMemo(() => samples?.stamps ?? [], [samples]);

  const quickCodes = useMemo(() => {
    const picked: string[] = [];
    for (const lot of lots.slice(0, 2)) {
      if (lot.code && !picked.includes(lot.code)) picked.push(lot.code);
    }
    for (const st of stamps.slice(0, 2)) {
      if (st.code && !picked.includes(st.code)) picked.push(st.code);
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
            <a href="#ho-so-mau">Hồ sơ gần đây</a>
            <a href="#tieu-chuan">Ba lớp đối chiếu</a>
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
        {/* ─── KHU VỰC MỞ ĐẦU: LƯỚI 4 CỘT (2 CỘT TRA CỨU · 2 CỘT NHIẾP ẢNH SẦU RIÊNG QR) ─── */}
        <section id="tra-cuu-ma" className="sw-section" aria-labelledby="trace-hero-title">
          <div className="sw-grid sw-trace-hero-row">
            <div className="sw-cell sw-col-1-2 sw-trace-hero-panel">
              <div className="sw-trace-hero-head">
                <span className="sw-trace-kicker">Xác thực nguồn gốc · VietGAP &amp; GACC</span>
                <span className="sw-micro">PUC Digital Dossier</span>
              </div>

              <div className="sw-trace-hero-body">
                <h1 id="trace-hero-title" className="sw-trace-title">
                  Tra cứu mã lô &amp; tem QR
                </h1>
                <p className="sw-trace-lead">
                  Nhập mã lô thu hoạch, mã thửa vườn hoặc mã tem QR dán trên từng trái sầu riêng để kiểm tra mã số vùng trồng PUC, phiếu kiểm nghiệm Cadimi &amp; Vàng O cùng nhật ký canh tác của hộ thành viên.
                </p>

                <form onSubmit={handleSubmit} className="sw-trace-form" role="search">
                  <div className="sw-trace-input-wrap">
                    <Search size={17} strokeWidth={1.7} className="sw-trace-search-icon" aria-hidden="true" />
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Nhập mã lô, mã thửa hoặc mã tem (VD: LOT-SR-2026-001)"
                      aria-label="Mã lô, mã thửa vườn hoặc mã tem truy xuất"
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
                    <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </form>

                {quickCodes.length > 0 && (
                  <div className="sw-trace-quick" aria-label="Mã mẫu tra cứu nhanh">
                    <span className="sw-trace-quick-label">Thử nhanh:</span>
                    {quickCodes.map((sampleCode) => (
                      <Link
                        key={sampleCode}
                        href={`/trace/${encodeURIComponent(sampleCode)}`}
                        className="sw-trace-chip"
                      >
                        {sampleCode}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="sw-trace-hero-foot">
                <span className="sw-micro">HTX Nông nghiệp Cư Né · Huyện Krông Búk, Đắk Lắk</span>
                <span className="sw-micro">Đối chiếu thời gian thực</span>
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
                Lô thu hoạch &amp; Tem QR gần đây
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
                Lô thu hoạch &amp; Thửa vườn {!loading && lots.length > 0 ? `(${lots.length})` : ""}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "stamps"}
                className={`sw-tab-pill ${tab === "stamps" ? "is-active" : ""}`}
                onClick={() => setTab("stamps")}
              >
                Tem QR nông hộ {!loading && stamps.length > 0 ? `(${stamps.length})` : ""}
              </button>
            </div>
          </div>

          <div className="sw-trace-dossier-grid">
            {loading ? (
              <div className="sw-trace-state">Đang tải danh sách hồ sơ xác thực gần đây…</div>
            ) : (showLots ? visibleLots.length : 0) + (showStamps ? visibleStamps.length : 0) === 0 ? (
              <div className="sw-trace-state">
                Chưa có hồ sơ mẫu trong mục này. Quý khách có thể nhập trực tiếp mã lô hoặc mã tem ở khung tra cứu phía trên.
              </div>
            ) : (
              <>
                {showLots &&
                  visibleLots.map((lot) => {
                    const badge = formatLotBadge(lot);
                    const isPlot = lot.sampleType === "plot";
                    const dateLabel = formatViDate(lot.harvestedOn);
                    return (
                      <Link
                        key={`lot-${lot.code}`}
                        href={`/trace/${encodeURIComponent(lot.code)}`}
                        className="sw-trace-card"
                      >
                        <div className="sw-trace-card-top">
                          <span className="sw-trace-card-kind">
                            {isPlot ? "Thửa vườn PUC" : "Lô thu hoạch"}
                          </span>
                          <span className={`sw-status-tag ${badge.tone === "ok" ? "is-ok" : "is-warn"}`}>
                            {badge.text}
                          </span>
                        </div>

                        <div className="sw-trace-card-main">
                          <h3 className="sw-trace-card-code">{lot.code}</h3>
                          <span className="sw-trace-card-owner">
                            {lot.buyer || "HTX Nông nghiệp Cư Né"}
                          </span>
                          <div className="sw-trace-card-meta">
                            <span>
                              {isPlot
                                ? `Mã vùng: ${lot.market || "66-PUC-SR0001-00728"}`
                                : `Thị trường: ${lot.market || "Xuất khẩu chính ngạch"}`}
                            </span>
                          </div>
                        </div>

                        <div className="sw-trace-card-foot">
                          <span className="sw-trace-card-date">
                            {dateLabel ? `Ngày ${dateLabel}` : isPlot ? " Định danh GIS" : "Hồ sơ lô hàng"}
                          </span>
                          <span className="sw-trace-card-cta">Xem hồ sơ →</span>
                        </div>
                      </Link>
                    );
                  })}

                {showStamps &&
                  visibleStamps.map((stamp) => {
                    const dateLabel = formatViDate(stamp.issuedAt);
                    return (
                      <Link
                        key={`stamp-${stamp.code}`}
                        href={`/trace/${encodeURIComponent(stamp.code)}`}
                        className="sw-trace-card"
                      >
                        <div className="sw-trace-card-top">
                          <span className="sw-trace-card-kind">Tem QR nông hộ</span>
                          <span className="sw-status-tag is-ok">
                            {stamp.weightKg !== null && stamp.weightKg !== undefined
                              ? `${Number(stamp.weightKg).toLocaleString("vi-VN")} kg`
                              : `Hạng ${stamp.grade || "A"}`}
                          </span>
                        </div>

                        <div className="sw-trace-card-main">
                          <h3 className="sw-trace-card-code">{stamp.code}</h3>
                          <span className="sw-trace-card-owner">Hộ {stamp.householdName}</span>
                          <div className="sw-trace-card-meta">
                            <span>
                              {stamp.lotCode
                                ? `Gắn thửa vườn: ${stamp.lotCode}`
                                : "Định danh quả sầu riêng tại vườn"}
                            </span>
                          </div>
                        </div>

                        <div className="sw-trace-card-foot">
                          <span className="sw-trace-card-date">
                            {dateLabel ? `Cấp ${dateLabel}` : "Tem điện tử"}
                          </span>
                          <span className="sw-trace-card-cta">Kiểm tra tem →</span>
                        </div>
                      </Link>
                    );
                  })}
              </>
            )}
          </div>
        </section>

        {/* ─── 02. BA LỚP ĐỐI CHIẾU MINH BẠCH ─── */}
        <section id="tieu-chuan" className="sw-section" aria-labelledby="tieuchuan-title">
          <header className="sw-grid sw-sec-head">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2-3 sw-head-main">
              <span className="sw-sec-index">02 / Minh bạch</span>
              <h2 id="tieuchuan-title" className="sw-sec-title">
                Ba lớp đối chiếu nguồn gốc
              </h2>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </header>

          <div className="sw-grid sw-checker-row sw-trace-pillars">
            <div className="sw-cell sw-col-1 sw-between">
              <span className="sw-micro">01 · Định danh địa lý</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Mã số vùng trồng PUC</h3>
                <p className="sw-caption-meta">
                  <span>Đo đạc tọa độ ranh giới thửa vườn GPS</span>
                  <span>Gắn đúng hộ thành viên tại xã Cư Né</span>
                  <span>Đáp ứng Nghị định thư xuất khẩu GACC</span>
                </p>
              </div>
            </div>

            <div className="sw-cell sw-col-2 sw-between">
              <span className="sw-micro">02 · Giám sát thực địa</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Nhật ký mùa vụ &amp; PHI</h3>
                <p className="sw-caption-meta">
                  <span>Lưu vết lịch sử bón phân &amp; phun thuốc</span>
                  <span>Cảnh báo tự động thời gian cách ly PHI</span>
                  <span>Thẩm định nội bộ bởi cán bộ kỹ thuật</span>
                </p>
              </div>
            </div>

            <div className="sw-cell sw-col-3 sw-between">
              <span className="sw-micro">03 · An toàn thực phẩm</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Kiểm nghiệm độc lập</h3>
                <p className="sw-caption-meta">
                  <span>Xét nghiệm kim loại nặng Cadimi (Cd)</span>
                  <span>Kiểm soát chất cấm Vàng O (Auramine O)</span>
                  <span>Đạt ngưỡng dư lượng MRL trước cắt trái</span>
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
