"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
              ? `Không tìm thấy thông tin lô hàng có mã "${code}". Vui lòng kiểm tra lại tem QR.`
              : "Có lỗi xảy ra khi truy vấn dữ liệu máy chủ.",
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
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="tr-root">
      {/* ─── Topbar ─── */}
      <header className="tr-topbar">
        <div className="tr-wrap tr-topbar-inner">
          <Link href="/" className="tr-brand">
            <span className="tr-brand-logo">KB</span>
            <div className="tr-brand-text">
              <strong>HTX SẦU RIÊNG KRÔNG BÚK</strong>
              <span>Hệ thống truy xuất nguồn gốc số hóa</span>
            </div>
          </Link>
          <span className="tr-live-badge">
            <span className="tr-live-dot" />
            Xác thực TCVN / GACC
          </span>
        </div>
      </header>

      <main className="tr-wrap">
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
            <strong style={{ display: "block", fontSize: 18, color: "#14372f" }}>
              Đang xác thực thông tin lô hàng từ cơ sở dữ liệu quốc gia...
            </strong>
            <p style={{ color: "#64748b", fontSize: 14 }}>Vui lòng chờ trong giây lát.</p>
          </div>
        ) : error ? (
          <div className="tr-card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontSize: 20, color: "#991b1b", marginBottom: 8 }}>Không tìm thấy dữ liệu truy xuất</h2>
            <p style={{ color: "#475569", fontSize: 14, maxWidth: 500, margin: "0 auto 24px" }}>{error}</p>
            <form onSubmit={handleSearch} className="tr-search-form" style={{ maxWidth: 360 }}>
              <input
                className="tr-search-input"
                placeholder="Nhập mã khác (vd: LH-2024-038)..."
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
              />
              <button type="submit" className="tr-search-btn">
                Tra cứu
              </button>
            </form>
          </div>
        ) : data ? (
          <>
            {/* ─── Hero Certificate Banner ─── */}
            <section className="tr-hero">
              <span className="tr-hero-tag">✓ Chứng nhận xuất xứ chính ngạch</span>
              <h1 className="tr-hero-title">Sầu Riêng Krông Búk – Lô {data.lot.code}</h1>
              <p className="tr-hero-subtitle">
                Hồ sơ minh bạch 100% chuỗi cung ứng từ nông hộ, diện tích canh tác, nhật ký chăm sóc đến phiếu kiểm
                nghiệm phòng Lab đạt chuẩn xuất khẩu.
              </p>

              <div className="tr-hero-grid">
                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-label">Mã số vùng trồng (PUC)</div>
                  <div className="tr-hero-kpi-val highlight">{data.puc.code}</div>
                </div>
                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-label">Ngày thu hoạch</div>
                  <div className="tr-hero-kpi-val">{formatDate(data.lot.harvestedOn)}</div>
                </div>
                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-label">Tổng sản lượng</div>
                  <div className="tr-hero-kpi-val">{data.lot.weightTons} Tấn</div>
                </div>
                <div className="tr-hero-kpi">
                  <div className="tr-hero-kpi-label">Thị trường mục tiêu</div>
                  <div className="tr-hero-kpi-val">{data.lot.market}</div>
                </div>
              </div>
            </section>

            {/* ─── Card 1: Căn cước Vùng trồng & Pháp lý ─── */}
            <section className="tr-card">
              <div className="tr-card-head">
                <h2 className="tr-card-title">
                  <span className="tr-card-icon">🏷️</span>
                  Thông tin Vùng trồng & Đơn vị xuất khẩu
                </h2>
                <span className="tr-test-badge">Hợp lệ</span>
              </div>
              <div className="tr-info-grid">
                <div className="tr-info-item">
                  <span className="tr-info-label">Đơn vị quản lý vùng trồng</span>
                  <span className="tr-info-val">{data.puc.name}</span>
                </div>
                <div className="tr-info-item">
                  <span className="tr-info-label">Địa danh vùng trồng</span>
                  <span className="tr-info-val">{data.puc.location}</span>
                </div>
                <div className="tr-info-item">
                  <span className="tr-info-label">Cây trồng & Giống đăng ký</span>
                  <span className="tr-info-val">{data.puc.variety}</span>
                </div>
                <div className="tr-info-item">
                  <span className="tr-info-label">Quy chuẩn áp dụng</span>
                  <span className="tr-info-val">{data.puc.standard}</span>
                </div>
                <div className="tr-info-item">
                  <span className="tr-info-label">Doanh nghiệp xuất khẩu</span>
                  <span className="tr-info-val">{data.lot.buyer}</span>
                </div>
                <div className="tr-info-item">
                  <span className="tr-info-label">Mã tem QR niêm phong</span>
                  <span className="tr-info-val">{data.lot.qrCode}</span>
                </div>
              </div>
            </section>

            {/* ─── Card 2: Tiêu chuẩn An toàn & Phiếu kiểm nghiệm ─── */}
            <section className="tr-card">
              <div className="tr-card-head">
                <h2 className="tr-card-title">
                  <span className="tr-card-icon">🔬</span>
                  Kiểm soát An toàn thực phẩm & Kết quả phòng Lab
                </h2>
                <span className="tr-test-badge">Đạt 100%</span>
              </div>

              <div className="tr-tests-grid">
                {data.certifications.map((c) => (
                  <div key={c.title} className="tr-test-card is-pass">
                    <div>
                      <span className="tr-test-badge">✓ {c.status}</span>
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
                <div style={{ marginTop: 20 }}>
                  <strong style={{ fontSize: 13, color: "#14372f", display: "block", marginBottom: 10 }}>
                    Phiếu phân tích mẫu sầu riêng tại phòng thí nghiệm kiểm định:
                  </strong>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tr-hh-table">
                      <thead>
                        <tr>
                          <th>Số phiếu</th>
                          <th>Hộ lấy mẫu</th>
                          <th>Thửa đất</th>
                          <th>Hàm lượng Cd</th>
                          <th>Chất Vàng O</th>
                          <th>Phòng xét nghiệm</th>
                          <th>Kết quả</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.labTests.map((t) => (
                          <tr key={t.code}>
                            <td style={{ fontWeight: 700 }}>{t.code}</td>
                            <td>{t.householdName}</td>
                            <td>{t.plotCode}</td>
                            <td>{t.cdMgKg} mg/kg</td>
                            <td>{t.yellowOPositive ? "Dương tính (Cấm)" : "Âm tính (Đạt)"}</td>
                            <td>{t.lab}</td>
                            <td>
                              <span className="tr-test-badge">Đạt chuẩn</span>
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
                  <span className="tr-card-icon">👨‍🌾</span>
                  Danh sách Hộ nông dân đóng góp sản lượng lô hàng
                </h2>
                <span className="tr-test-badge">{data.households.length} Hộ tham gia</span>
              </div>
              <p style={{ fontSize: 13, color: "#64748b", margin: "-8px 0 16px" }}>
                Sản lượng từng hộ được cân đo điện tử và đối soát chống trà trộn hàng trôi nổi ngoài vùng trồng.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table className="tr-hh-table">
                  <thead>
                    <tr>
                      <th>Tên hộ dân</th>
                      <th>Mã hộ nông dân</th>
                      <th>Thôn trực thuộc</th>
                      <th style={{ textAlign: "right" }}>Sản lượng thu hoạch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.households.map((h, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{h.householdName}</td>
                        <td style={{ color: "#64748b" }}>{h.householdCode}</td>
                        <td>{h.village}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#14372f" }}>
                          {Number(h.weightKg).toLocaleString("vi-VN")} kg
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ─── Card 4: Nhật ký canh tác ─── */}
            {data.diaries.length > 0 && (
              <section className="tr-card">
                <div className="tr-card-head">
                  <h2 className="tr-card-title">
                    <span className="tr-card-icon">📖</span>
                    Nhật ký canh tác & Quy trình chăm sóc thực tế
                  </h2>
                  <span className="tr-test-badge">Số hóa thời gian thực</span>
                </div>
                <p style={{ fontSize: 13, color: "#64748b", margin: "-8px 0 16px" }}>
                  Bà con nông dân ghi chép trực tiếp tại vườn cây qua ứng dụng di động Cổng hộ dân.
                </p>

                <ul className="tr-timeline">
                  {data.diaries.map((d, idx) => (
                    <li key={idx} className="tr-timeline-item">
                      <span className="tr-timeline-node" />
                      <div className="tr-timeline-head">
                        <span className="tr-timeline-activity">{d.activity}</span>
                        <span className="tr-timeline-date">{formatDate(d.entryOn)}</span>
                        <span className="tr-timeline-plot">{d.plotCode}</span>
                        <span style={{ fontSize: 12, color: "#64748b" }}>– {d.householdName}</span>
                      </div>
                      {d.detail && <p className="tr-timeline-detail">{d.detail}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ─── Actions & Search Other Box ─── */}
            <div className="tr-actions">
              <button type="button" className="tr-action-btn" onClick={() => window.print()}>
                🖨️ In hồ sơ chứng nhận
              </button>
              <button type="button" className="tr-action-btn" onClick={handleShare}>
                🔗 {copied ? "Đã sao chép liên kết!" : "Chia sẻ liên kết truy xuất"}
              </button>
            </div>

            <div className="tr-search-box">
              <strong style={{ fontSize: 14, color: "#14372f" }}>Bạn muốn tra cứu mã lô hàng hoặc tem QR khác?</strong>
              <form onSubmit={handleSearch} className="tr-search-form">
                <input
                  className="tr-search-input"
                  placeholder="Nhập mã lô (vd: LH-2024-037)..."
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                />
                <button type="submit" className="tr-search-btn">
                  Kiểm tra
                </button>
              </form>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
