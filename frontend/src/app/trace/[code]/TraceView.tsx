"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  ShieldCheck,
  CheckCircle2,
  Building2,
  MapPin,
  Calendar,
  Scale,
  Globe2,
  Tag,
  QrCode,
  Printer,
  Share2,
  Check,
  Search,
  ArrowLeft,
  AlertTriangle,
  FileCheck,
  ClipboardList,
  Users2,
  FlaskConical,
  Leaf,
  Award,
  Sparkles,
  Layers,
  FileText,
} from "lucide-react";
import "./trace.css";

interface TraceData {
  lot: {
    id: number;
    code: string;
    qrCode: string;
    harvestedOn: string;
    weightTons: number;
    householdCount: number;
    buyer: string;
    market: string;
    status: string;
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
  households: {
    householdName: string;
    householdCode: string;
    village: string;
    weightKg: number;
  }[];
  labTests: {
    code: string;
    householdName: string;
    plotCode: string;
    sampledOn: string;
    cdMgKg: number;
    yellowOPositive: boolean;
    residueMgKg: number;
    chlorpyrifosMgKg: number | null;
    result: string;
    lab: string;
  }[];
  diaries: {
    entryOn: string;
    plotCode: string;
    activity: string;
    detail: string | null;
    recorder: string;
    householdName: string;
  }[];
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

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export default function TraceView() {
  const params = useParams();
  const code = typeof params.code === "string" ? decodeURIComponent(params.code) : "";
  const router = useRouter();
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchCode, setSearchCode] = useState(code);
  const [copied, setCopied] = useState(false);

  const [prevCode, setPrevCode] = useState(code);
  if (prevCode !== code) {
    setPrevCode(code);
    setLoading(true);
    setError(null);
    setSearchCode(code);
  }

  useEffect(() => {
    if (!code) return;
    let active = true;

    fetch(`/api/public/trace/${encodeURIComponent(code)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? `Không tìm thấy thông tin lô hàng có mã "${code}". Vui lòng kiểm tra lại tem QR.`
              : "Có lỗi xảy ra khi truy vấn dữ liệu từ máy chủ.",
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

  const totalLotKg = data ? data.lot.weightTons * 1000 : 0;

  return (
    <div className="tr-root">
      {/* ─── Topbar ─── */}
      <header className="tr-topbar">
        <div className="tr-wrap tr-topbar-inner">
          <div className="tr-topbar-left">
            <Link href="/" className="tr-back-btn" title="Quay về trang chủ">
              <ArrowLeft size={16} strokeWidth={2.4} aria-hidden="true" />
              <span>Trang chủ</span>
            </Link>

            <div className="tr-divider" aria-hidden="true" />

            <Link href="/" className="tr-brand">
              <span className="tr-brand-logo">
                <Image src="/logo.png" alt="Krông Búk" width={32} height={32} priority />
              </span>
              <div className="tr-brand-text">
                <strong>HTX SẦU RIÊNG KRÔNG BÚK</strong>
                <span>Hệ thống truy xuất nguồn gốc số hóa</span>
              </div>
            </Link>
          </div>

          <div className="tr-topbar-right">
            <span className="tr-live-badge">
              <span className="tr-live-dot" />
              <ShieldCheck size={14} strokeWidth={2.2} aria-hidden="true" />
              <span>Xác thực TCVN · GACC</span>
            </span>
          </div>
        </div>
      </header>

      <main className="tr-wrap tr-main">
        {loading ? (
          <div className="tr-state-box">
            <div className="tr-spinner-wrap">
              <Sparkles size={28} className="tr-spin-icon" aria-hidden="true" />
            </div>
            <h2 className="tr-state-title">
              Đang xác thực thông tin lô hàng từ cơ sở dữ liệu quốc gia...
            </h2>
            <p className="tr-state-desc">
              Hệ thống đang truy xuất mã vùng trồng PUC, kết quả kiểm định phòng Lab và nhật ký canh tác.
            </p>
          </div>
        ) : error ? (
          <div className="tr-card tr-error-box">
            <div className="tr-error-icon">
              <AlertTriangle size={36} strokeWidth={2} aria-hidden="true" />
            </div>
            <h2 className="tr-error-title">Không tìm thấy dữ liệu truy xuất</h2>
            <p className="tr-error-desc">{error}</p>
            <form onSubmit={handleSearch} className="tr-search-form tr-search-error">
              <input
                className="tr-search-input"
                placeholder="Nhập mã khác (vd: LH-2024-038)..."
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
              />
              <button type="submit" className="tr-search-btn">
                <Search size={15} strokeWidth={2.2} aria-hidden="true" />
                <span>Tra cứu</span>
              </button>
            </form>
          </div>
        ) : data ? (
          <>
            {/* ─── Hero Certificate Banner ─── */}
            <section className="tr-hero">
              <div className="tr-hero-header">
                <div className="tr-hero-tag">
                  <ShieldCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>Chứng nhận xuất xứ chính ngạch · GACC Approved</span>
                </div>
                <div className="tr-hero-seal" title="Mã chứng nhận hợp lệ">
                  <QrCode size={18} strokeWidth={2} aria-hidden="true" />
                  <span>TEM ĐIỆN TỬ BỘ NN&amp;PTNT</span>
                </div>
              </div>

              <h1 className="tr-hero-title">
                <span>Sầu Riêng Krông Búk</span>
                <span className="tr-hero-lot-badge">Lô {data.lot.code}</span>
              </h1>

              <p className="tr-hero-subtitle">
                Hồ sơ minh bạch 100% chuỗi cung ứng từ nông hộ thành viên, diện tích canh tác, nhật ký chăm sóc đến
                phiếu kiểm nghiệm phòng Lab đạt chuẩn xuất khẩu.
              </p>

              <div className="tr-hero-grid">
                <div className="tr-hero-kpi is-highlight">
                  <div className="tr-hero-kpi-icon">
                    <QrCode size={16} strokeWidth={2.2} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="tr-hero-kpi-label">Mã số vùng trồng (PUC)</div>
                    <div className="tr-hero-kpi-val highlight">{data.puc.code}</div>
                  </div>
                </div>

                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-icon">
                    <Calendar size={16} strokeWidth={2.2} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="tr-hero-kpi-label">Ngày thu hoạch</div>
                    <div className="tr-hero-kpi-val">{formatDate(data.lot.harvestedOn)}</div>
                  </div>
                </div>

                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-icon">
                    <Scale size={16} strokeWidth={2.2} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="tr-hero-kpi-label">Tổng sản lượng</div>
                    <div className="tr-hero-kpi-val">{data.lot.weightTons} Tấn</div>
                  </div>
                </div>

                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-icon">
                    <Globe2 size={16} strokeWidth={2.2} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="tr-hero-kpi-label">Thị trường xuất khẩu</div>
                    <div className="tr-hero-kpi-val">{data.lot.market}</div>
                  </div>
                </div>

                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-icon">
                    <Users2 size={16} strokeWidth={2.2} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="tr-hero-kpi-label">Hộ dân tham gia</div>
                    <div className="tr-hero-kpi-val">{data.households.length} Hộ</div>
                  </div>
                </div>

                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-icon">
                    <Tag size={16} strokeWidth={2.2} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="tr-hero-kpi-label">Mã tem niêm phong</div>
                    <div className="tr-hero-kpi-val">{data.lot.qrCode}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* ─── Card 1: Căn cước Vùng trồng & Pháp lý ─── */}
            <section className="tr-card">
              <div className="tr-card-head">
                <h2 className="tr-card-title">
                  <span className="tr-card-icon">
                    <Building2 size={18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span>Căn cước Vùng trồng &amp; Đơn vị Xuất khẩu</span>
                </h2>
                <span className="tr-status-pill is-success">
                  <FileCheck size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>Đã kiểm duyệt</span>
                </span>
              </div>

              <div className="tr-info-grid">
                <div className="tr-info-item">
                  <div className="tr-info-icon-cell">
                    <Building2 size={15} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="tr-info-content">
                    <span className="tr-info-label">Đơn vị quản lý vùng trồng</span>
                    <strong className="tr-info-val">{data.puc.name}</strong>
                  </div>
                </div>

                <div className="tr-info-item">
                  <div className="tr-info-icon-cell">
                    <MapPin size={15} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="tr-info-content">
                    <span className="tr-info-label">Địa danh vùng trồng</span>
                    <strong className="tr-info-val">{data.puc.location}</strong>
                  </div>
                </div>

                <div className="tr-info-item">
                  <div className="tr-info-icon-cell">
                    <Leaf size={15} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="tr-info-content">
                    <span className="tr-info-label">Cây trồng &amp; Giống đăng ký</span>
                    <strong className="tr-info-val">{data.puc.variety}</strong>
                  </div>
                </div>

                <div className="tr-info-item">
                  <div className="tr-info-icon-cell">
                    <Award size={15} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="tr-info-content">
                    <span className="tr-info-label">Quy chuẩn canh tác áp dụng</span>
                    <strong className="tr-info-val">{data.puc.standard}</strong>
                  </div>
                </div>

                <div className="tr-info-item">
                  <div className="tr-info-icon-cell">
                    <Globe2 size={15} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="tr-info-content">
                    <span className="tr-info-label">Doanh nghiệp xuất khẩu</span>
                    <strong className="tr-info-val">{data.lot.buyer}</strong>
                  </div>
                </div>

                <div className="tr-info-item">
                  <div className="tr-info-icon-cell">
                    <QrCode size={15} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="tr-info-content">
                    <span className="tr-info-label">Mã tem QR niêm phong</span>
                    <strong className="tr-info-val is-mono">{data.lot.qrCode}</strong>
                  </div>
                </div>
              </div>
            </section>

            {/* ─── Card 2: Tiêu chuẩn An toàn & Phiếu kiểm nghiệm Lab ─── */}
            <section className="tr-card">
              <div className="tr-card-head">
                <h2 className="tr-card-title">
                  <span className="tr-card-icon">
                    <FlaskConical size={18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span>Kiểm Soát An Toàn Thực Phẩm &amp; Phiếu Kiểm Nghiệm Lab</span>
                </h2>
                <span className="tr-status-pill is-success">
                  <CheckCircle2 size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>Đạt 100% chỉ tiêu</span>
                </span>
              </div>

              <div className="tr-tests-grid">
                {data.certifications.map((c) => (
                  <div key={c.title} className="tr-test-card is-pass">
                    <div className="tr-test-top">
                      <span className="tr-test-badge">
                        <CheckCircle2 size={12} strokeWidth={2.4} aria-hidden="true" />
                        <span>{c.status}</span>
                      </span>
                      <h3 className="tr-test-title">{c.title}</h3>
                      <p className="tr-test-desc">
                        {c.code ? `Mã chứng nhận: ${c.code}` : c.standard ? `Chỉ tiêu: ${c.standard}` : ""}
                      </p>
                    </div>
                    <div className="tr-test-meta">
                      <span>Cơ quan giám sát:</span>
                      <strong>{c.authority}</strong>
                    </div>
                  </div>
                ))}
              </div>

              {data.labTests.length > 0 && (
                <div className="tr-sub-block">
                  <div className="tr-sub-head">
                    <FileText size={16} strokeWidth={2.2} aria-hidden="true" />
                    <strong>Phiếu phân tích mẫu sầu riêng tại phòng thí nghiệm kiểm định độc lập</strong>
                  </div>
                  <div className="tr-table-responsive">
                    <table className="tr-table">
                      <thead>
                        <tr>
                          <th>Số phiếu Lab</th>
                          <th>Hộ lấy mẫu</th>
                          <th>Thửa đất</th>
                          <th>Hàm lượng Cadimi (Cd)</th>
                          <th>Chất cấm Vàng O</th>
                          <th>Phòng xét nghiệm</th>
                          <th style={{ textAlign: "right" }}>Kết luận</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.labTests.map((t) => (
                          <tr key={t.code}>
                            <td className="is-mono is-bold">{t.code}</td>
                            <td>{t.householdName}</td>
                            <td>
                              <span className="tr-pill-light">{t.plotCode}</span>
                            </td>
                            <td>
                              <strong className="tr-text-green">{t.cdMgKg} mg/kg</strong>
                              <span className="tr-note-sub"> (&le; 0.05)</span>
                            </td>
                            <td>
                              <span className="tr-badge-sub is-neg">
                                {t.yellowOPositive ? "Dương tính (Cấm)" : "Âm tính (Đạt)"}
                              </span>
                            </td>
                            <td className="tr-text-muted">{t.lab}</td>
                            <td style={{ textAlign: "right" }}>
                              <span className="tr-status-pill is-success">
                                <CheckCircle2 size={11} strokeWidth={2.4} aria-hidden="true" />
                                <span>Đạt chuẩn</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* ─── Card 3: Minh bạch Hộ Nông Dân (Mass Balance) ─── */}
            <section className="tr-card">
              <div className="tr-card-head">
                <h2 className="tr-card-title">
                  <span className="tr-card-icon">
                    <Users2 size={18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span>Hộ Nông Dân Đóng Góp Sản Lượng Lô Hàng</span>
                </h2>
                <span className="tr-status-pill is-info">
                  <Users2 size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>{data.households.length} Hộ xã viên</span>
                </span>
              </div>

              <p className="tr-card-lead">
                Sản lượng từng hộ được cân đo điện tử và đối soát điện tử, bảo đảm chống trà trộn sầu riêng trôi nổi
                ngoài vùng trồng được cấp phép.
              </p>

              <div className="tr-table-responsive">
                <table className="tr-table">
                  <thead>
                    <tr>
                      <th>Hộ nông dân</th>
                      <th>Mã hộ thành viên</th>
                      <th>Địa bàn thôn</th>
                      <th style={{ textAlign: "right" }}>Sản lượng giao</th>
                      <th style={{ textAlign: "right" }}>Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.households.map((h, i) => {
                      const pct = totalLotKg > 0 ? ((h.weightKg / totalLotKg) * 100).toFixed(1) : "0";
                      return (
                        <tr key={i}>
                          <td>
                            <div className="tr-farmer-cell">
                              <span className="tr-farmer-avatar">{getInitials(h.householdName)}</span>
                              <strong>{h.householdName}</strong>
                            </div>
                          </td>
                          <td className="is-mono tr-text-muted">{h.householdCode}</td>
                          <td>{h.village}</td>
                          <td style={{ textAlign: "right" }}>
                            <strong className="tr-text-green">
                              {Number(h.weightKg).toLocaleString("vi-VN")} kg
                            </strong>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="tr-pct-cell">
                              <span className="tr-pct-label">{pct}%</span>
                              <div className="tr-pct-bar-bg" aria-hidden="true">
                                <div className="tr-pct-bar-fill" style={{ width: `${Math.min(100, Number(pct) * 2.5)}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ─── Card 4: Nhật ký canh tác ─── */}
            {data.diaries.length > 0 && (
              <section className="tr-card">
                <div className="tr-card-head">
                  <h2 className="tr-card-title">
                    <span className="tr-card-icon">
                      <ClipboardList size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span>Nhật Ký Canh Tác Điện Tử Của Lô Hàng</span>
                  </h2>
                  <span className="tr-status-pill is-success">
                    <CheckCircle2 size={13} strokeWidth={2.2} aria-hidden="true" />
                    <span>Số hóa thời gian thực</span>
                  </span>
                </div>

                <p className="tr-card-lead">
                  Dữ liệu được các hộ xã viên ghi chép trực tiếp tại vườn thông qua ứng dụng Cổng hộ dân Krông Búk.
                </p>

                <ul className="tr-timeline">
                  {data.diaries.map((d, idx) => (
                    <li key={idx} className="tr-timeline-item">
                      <span className="tr-timeline-node">
                        <Leaf size={11} strokeWidth={2.4} aria-hidden="true" />
                      </span>
                      <div className="tr-timeline-content">
                        <div className="tr-timeline-head">
                          <strong className="tr-timeline-activity">{d.activity}</strong>
                          <span className="tr-timeline-date">{formatDate(d.entryOn)}</span>
                          <span className="tr-timeline-plot">{d.plotCode}</span>
                          <span className="tr-timeline-farmer">{d.householdName}</span>
                        </div>
                        {d.detail && <p className="tr-timeline-detail">{d.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ─── Actions: Print & Share ─── */}
            <div className="tr-actions">
              <button type="button" className="tr-action-btn" onClick={() => window.print()}>
                <Printer size={16} strokeWidth={2.2} aria-hidden="true" />
                <span>In hồ sơ chứng nhận</span>
              </button>
              <button type="button" className="tr-action-btn" onClick={handleShare}>
                {copied ? (
                  <>
                    <Check size={16} strokeWidth={2.6} className="tr-text-green" aria-hidden="true" />
                    <span className="tr-text-green">Đã sao chép liên kết!</span>
                  </>
                ) : (
                  <>
                    <Share2 size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>Chia sẻ hồ sơ truy xuất</span>
                  </>
                )}
              </button>
            </div>

            {/* ─── Search Box for other QR / Lot code ─── */}
            <div className="tr-search-box">
              <div className="tr-search-box-head">
                <Search size={16} strokeWidth={2.4} aria-hidden="true" />
                <strong>Bạn muốn tra cứu mã lô hàng hoặc tem QR khác?</strong>
              </div>
              <p className="tr-search-box-sub">
                Nhập mã lô hàng (ví dụ: LH-2024-037) hoặc mã quét trên tem QR quả sầu riêng để kiểm tra hồ sơ.
              </p>
              <form onSubmit={handleSearch} className="tr-search-form">
                <input
                  className="tr-search-input"
                  placeholder="Nhập mã lô (vd: LH-2024-038 hoặc QR-038)..."
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  aria-label="Nhập mã truy xuất nguồn gốc"
                />
                <button type="submit" className="tr-search-btn">
                  <Search size={15} strokeWidth={2.2} aria-hidden="true" />
                  <span>Kiểm tra</span>
                </button>
              </form>
            </div>
          </>
        ) : null}

        {/* ─── Footer ─── */}
        <footer className="tr-footer">
          <p>© {new Date().getFullYear()} Hợp tác xã Nông nghiệp Krông Búk, Tỉnh Đắk Lắk.</p>
          <p className="tr-footer-sub">
            Cơ sở dữ liệu mã số vùng trồng (PUC) và truy xuất nguồn gốc chính ngạch theo chuẩn Nghị định thư Bộ NN&amp;PTNT và Tổng cục Hải quan Trung Quốc (GACC).
          </p>
        </footer>
      </main>
    </div>
  );
}
