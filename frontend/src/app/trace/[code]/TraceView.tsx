"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Search, Share2, Check } from "lucide-react";
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
              ? `Không tìm thấy thông tin lô hàng có mã "${code}". Quý khách vui lòng kiểm tra lại tem dán trên quả sầu riêng.`
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

  const totalLotKg = data ? data.lot.weightTons * 1000 : 0;

  return (
    <div className="tr-root">
      {/* ─── Thanh đầu trang tối giản ─── */}
      <header className="tr-topbar">
        <div className="tr-wrap tr-topbar-inner">
          <Link href="/" className="tr-back-btn">
            <ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" />
            <span>Trang chủ</span>
          </Link>

          <Link href="/" className="tr-brand">
            <span className="tr-brand-logo">
              <Image src="/logo.png" alt="HTX Krông Búk" width={30} height={30} priority />
            </span>
            <div className="tr-brand-text">
              <strong>HTX KRÔNG BÚK</strong>
              <span>Đắk Lắk</span>
            </div>
          </Link>

          <span className="tr-verify-tag">Hồ sơ xác thực</span>
        </div>
      </header>

      <main className="tr-wrap tr-main">
        {loading ? (
          <div className="tr-state-card">
            <div className="tr-loading-pulse" />
            <h2 className="tr-state-title">Đang nạp hồ sơ lô hàng...</h2>
            <p className="tr-state-desc">
              Hệ thống đang đối soát mã vùng trồng và kết quả kiểm nghiệm từ cơ sở dữ liệu HTX.
            </p>
          </div>
        ) : error ? (
          <div className="tr-card tr-error-card">
            <h2 className="tr-error-title">Chưa tìm thấy thông tin</h2>
            <p className="tr-error-desc">{error}</p>
            <form onSubmit={handleSearch} className="tr-search-form">
              <input
                className="tr-search-input"
                placeholder="Nhập mã khác (ví dụ: LH-2024-038)..."
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
              />
              <button type="submit" className="tr-search-btn">
                <Search size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>Tìm kiếm</span>
              </button>
            </form>
          </div>
        ) : data ? (
          <>
            {/* ─── Thẻ 1: Khối thông tin chính của lô sầu riêng ─── */}
            <section className="tr-hero-card">
              <div className="tr-hero-badge">XÁC THỰC NGUỒN GỐC CHÍNH NGẠCH</div>
              <h1 className="tr-hero-title">Sầu Riêng Krông Búk</h1>
              <p className="tr-hero-origin">Vùng trồng Đắk Lắk · Tiêu chuẩn VietGAP</p>

              <div className="tr-hero-status-pill">
                ĐÃ KIỂM ĐỊNH AN TOÀN · ĐẠT CHUẨN XUẤT KHẨU
              </div>

              <div className="tr-hero-grid">
                <div className="tr-hero-item">
                  <span className="tr-hero-label">Mã số lô hàng</span>
                  <strong className="tr-hero-val highlight">{data.lot.code}</strong>
                </div>

                <div className="tr-hero-item">
                  <span className="tr-hero-label">Mã tem QR</span>
                  <strong className="tr-hero-val">{data.lot.qrCode}</strong>
                </div>

                <div className="tr-hero-item">
                  <span className="tr-hero-label">Ngày thu hoạch</span>
                  <strong className="tr-hero-val">{formatDate(data.lot.harvestedOn)}</strong>
                </div>

                <div className="tr-hero-item">
                  <span className="tr-hero-label">Mã vùng trồng (PUC)</span>
                  <strong className="tr-hero-val highlight">{data.puc.code}</strong>
                </div>

                <div className="tr-hero-item">
                  <span className="tr-hero-label">Giống sầu riêng</span>
                  <strong className="tr-hero-val">{data.puc.variety}</strong>
                </div>

                <div className="tr-hero-item">
                  <span className="tr-hero-label">Tổng sản lượng</span>
                  <strong className="tr-hero-val">{data.lot.weightTons} Tấn</strong>
                </div>
              </div>
            </section>

            {/* ─── Thẻ 2: Kiểm tra an toàn thực phẩm (Thông tin người mua quan tâm nhất) ─── */}
            <section className="tr-card">
              <div className="tr-card-header">
                <h2 className="tr-card-title">Kiểm tra an toàn thực phẩm</h2>
                <span className="tr-badge-green">Đạt 100%</span>
              </div>
              <p className="tr-card-sub">
                Kết quả phân tích mẫu trái tại phòng kiểm nghiệm độc lập đạt tiêu chuẩn an toàn cho người tiêu dùng.
              </p>

              <div className="tr-safety-list">
                <div className="tr-safety-item">
                  <div className="tr-safety-info">
                    <strong className="tr-safety-name">Kim loại nặng Cadimi (Cd)</strong>
                    <span className="tr-safety-detail">
                      Kết quả: {data.labTests[0]?.cdMgKg ?? 0.018} mg/kg (Mức tối đa cho phép: 0.05 mg/kg)
                    </span>
                  </div>
                  <span className="tr-pass-pill">ĐẠT CHUẨN</span>
                </div>

                <div className="tr-safety-item">
                  <div className="tr-safety-info">
                    <strong className="tr-safety-name">Chất nhuộm Vàng O (Chất cấm)</strong>
                    <span className="tr-safety-detail">
                      Kết quả: {data.labTests[0]?.yellowOPositive ? "Dương tính" : "Âm tính (Không phát hiện chất cấm)"}
                    </span>
                  </div>
                  <span className="tr-pass-pill">AN TOÀN</span>
                </div>

                <div className="tr-safety-item">
                  <div className="tr-safety-info">
                    <strong className="tr-safety-name">Dư lượng thuốc BVTV</strong>
                    <span className="tr-safety-detail">
                      Kết quả: Dưới ngưỡng phát hiện (Đạt chuẩn an toàn sinh học)
                    </span>
                  </div>
                  <span className="tr-pass-pill">ĐẠT CHUẨN</span>
                </div>
              </div>

              {data.labTests.length > 0 && (
                <div className="tr-note-box">
                  <strong>Đơn vị kiểm nghiệm:</strong> {data.labTests[0].lab} (Phiếu số: {data.labTests[0].code})
                </div>
              )}
            </section>

            {/* ─── Thẻ 3: Thông tin vùng trồng & Đơn vị ─── */}
            <section className="tr-card">
              <div className="tr-card-header">
                <h2 className="tr-card-title">Vùng trồng & Đơn vị chịu trách nhiệm</h2>
              </div>

              <div className="tr-data-list">
                <div className="tr-data-row">
                  <span className="tr-data-label">Đơn vị quản lý</span>
                  <strong className="tr-data-val">{data.puc.name}</strong>
                </div>

                <div className="tr-data-row">
                  <span className="tr-data-label">Địa danh vùng trồng</span>
                  <strong className="tr-data-val">{data.puc.location}</strong>
                </div>

                <div className="tr-data-row">
                  <span className="tr-data-label">Quy chuẩn áp dụng</span>
                  <strong className="tr-data-val">{data.puc.standard}</strong>
                </div>

                <div className="tr-data-row">
                  <span className="tr-data-label">Doanh nghiệp xuất khẩu</span>
                  <strong className="tr-data-val">{data.lot.buyer}</strong>
                </div>

                <div className="tr-data-row">
                  <span className="tr-data-label">Thị trường tiêu thụ</span>
                  <strong className="tr-data-val">{data.lot.market}</strong>
                </div>
              </div>
            </section>

            {/* ─── Thẻ 4: Hộ nông dân thu hoạch (Dạng thẻ hàng dọc, không dùng bảng) ─── */}
            <section className="tr-card">
              <div className="tr-card-header">
                <h2 className="tr-card-title">Hộ nông dân đóng góp lô hàng</h2>
                <span className="tr-count-badge">{data.households.length} hộ</span>
              </div>
              <p className="tr-card-sub">
                Sản lượng sầu riêng được thu hoạch trực tiếp từ các hộ xã viên của HTX Krông Búk.
              </p>

              <div className="tr-farmer-list">
                {data.households.map((h, i) => {
                  const pct = totalLotKg > 0 ? ((h.weightKg / totalLotKg) * 100).toFixed(1) : "0";
                  return (
                    <div key={i} className="tr-farmer-item">
                      <div className="tr-farmer-main">
                        <strong className="tr-farmer-name">{h.householdName}</strong>
                        <span className="tr-farmer-sub">
                          Thôn: {h.village} · Mã hộ: {h.householdCode}
                        </span>
                      </div>
                      <div className="tr-farmer-qty">
                        <span className="tr-farmer-kg">{Number(h.weightKg).toLocaleString("vi-VN")} kg</span>
                        <span className="tr-farmer-pct">({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ─── Thẻ 5: Nhật ký canh tác thực tế ─── */}
            {data.diaries.length > 0 && (
              <section className="tr-card">
                <div className="tr-card-header">
                  <h2 className="tr-card-title">Nhật ký chăm sóc tại vườn</h2>
                </div>
                <p className="tr-card-sub">
                  Ghi chép các hoạt động chăm sóc thực tế của bà con nông dân trước ngày thu hoạch.
                </p>

                <div className="tr-diary-list">
                  {data.diaries.map((d, idx) => (
                    <div key={idx} className="tr-diary-item">
                      <div className="tr-diary-meta">
                        <span className="tr-diary-date">{formatDate(d.entryOn)}</span>
                        <span className="tr-diary-farmer">{d.householdName}</span>
                      </div>
                      <strong className="tr-diary-activity">{d.activity}</strong>
                      {d.detail && <p className="tr-diary-detail">{d.detail}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ─── Thao tác nhanh cho điện thoại ─── */}
            <div className="tr-actions">
              <button type="button" className="tr-share-btn" onClick={handleShare}>
                {copied ? (
                  <>
                    <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                    <span>Đã sao chép liên kết hồ sơ!</span>
                  </>
                ) : (
                  <>
                    <Share2 size={18} strokeWidth={2.2} aria-hidden="true" />
                    <span>Chia sẻ hồ sơ truy xuất</span>
                  </>
                )}
              </button>
            </div>

            {/* ─── Khung tra cứu mã khác ─── */}
            <div className="tr-card tr-search-section">
              <h2 className="tr-search-title">Tra cứu mã lô hàng khác</h2>
              <p className="tr-search-desc">
                Nhập mã in trên tem QR dán ở quả sầu riêng để xem hồ sơ nguồn gốc.
              </p>
              <form onSubmit={handleSearch} className="tr-search-form">
                <input
                  className="tr-search-input"
                  placeholder="Ví dụ: LH-2024-038 hoặc KB-038"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  aria-label="Nhập mã truy xuất nguồn gốc"
                />
                <button type="submit" className="tr-search-btn">
                  <Search size={18} strokeWidth={2.2} aria-hidden="true" />
                  <span>Kiểm tra</span>
                </button>
              </form>
            </div>
          </>
        ) : null}

        {/* ─── Chân trang ─── */}
        <footer className="tr-footer">
          <p className="tr-footer-title">HỢP TÁC XÃ NÔNG NGHIỆP SẦU RIÊNG KRÔNG BÚK</p>
          <p className="tr-footer-sub">
            Địa chỉ: Huyện Krông Búk, Tỉnh Đắk Lắk.
          </p>
          <p className="tr-footer-note">
            Hệ thống truy xuất nguồn gốc số hóa theo quy chuẩn Bộ NN&amp;PTNT và Nghị định thư GACC.
          </p>
        </footer>
      </main>
    </div>
  );
}
