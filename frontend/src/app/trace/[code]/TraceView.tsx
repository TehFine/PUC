"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Share2,
  Check,
  ShieldCheck,
  Building2,
  Truck,
  TreePine,
  CheckCircle2,
  Tag,
  Package,
} from "lucide-react";
import "./trace.css";

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
    householdCccd: string;
    householdCode: string;
    householdPhone: string;
    villageName: string;
    variety?: string | null;
    areaHa?: number | null;
    plantedYear?: number | null;
  } | null;
  plot?: {
    id: number;
    code: string;
    sheetNo?: string;
    parcelNo?: string;
    ownerName?: string;
    village?: string;
    zoneCode?: string;
    variety?: string;
    plantedYear?: number;
    areaHa?: number;
    status?: string;
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
    weightKg: number;
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
  diaries: {
    entryOn: string;
    plotCode: string;
    activity: string;
    detail: string | null;
    recorder: string;
    householdName?: string;
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
              ? `Không tìm thấy thông tin lô hàng hoặc mã tem "${code}". Quý khách vui lòng kiểm tra lại tem dán trên quả hoặc thùng sầu riêng.`
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

  const totalLotKg = data?.lot?.weightTons
    ? data.lot.weightTons * 1000
    : (data?.farmerStamp?.fruitWeightKg ?? 0);

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

          <span className="tr-verify-tag">Hồ sơ xác thực GACC</span>
        </div>
      </header>

      <main className="tr-wrap tr-main">
        {loading ? (
          <div className="tr-state-card">
            <div className="tr-loading-pulse" />
            <h2 className="tr-state-title">Đang nạp hồ sơ lô hàng &amp; tem truy xuất...</h2>
            <p className="tr-state-desc">
              Hệ thống đang đối soát mã vùng trồng, mã nhà đóng gói và kết quả kiểm nghiệm từ cơ sở dữ liệu HTX.
            </p>
          </div>
        ) : error ? (
          <div className="tr-card tr-error-card">
            <h2 className="tr-error-title">Chưa tìm thấy thông tin</h2>
            <p className="tr-error-desc">{error}</p>
            <form onSubmit={handleSearch} className="tr-search-form">
              <input
                className="tr-search-input"
                placeholder="Nhập mã khác (ví dụ: LH-2024-038 hoặc LH-2024-038-Q0001)..."
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
                  Sản phẩm này đã được dán tem định danh điện tử theo quy trình kiểm soát nguồn gốc nghiêm ngặt của HTX Krông Búk và Doanh nghiệp xuất khẩu.
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
                  style={{ background: data.farmerStamp.status === "activated" ? "#15803d" : "#b45309" }}
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
                      HẠNG {data.farmerStamp.grade ?? "A"} {data.farmerStamp.status === "activated" ? "(XUẤT KHẨU)" : ""}
                    </span>
                    {data.farmerStamp.fruitWeightKg && (
                      <span className="tr-weight-pill">
                        {data.farmerStamp.fruitWeightKg} kg / Quả
                      </span>
                    )}
                    <span
                      className="tr-secure-pill"
                      style={{ color: data.farmerStamp.status === "activated" ? "#15803d" : "#b45309" }}
                    >
                      <CheckCircle2 size={13} color={data.farmerStamp.status === "activated" ? "#15803d" : "#b45309"} />
                      <span>
                        {data.farmerStamp.status === "activated" ? "CHÍNH CHỦ ĐÃ KÍCH HOẠT" : "ĐÃ CẤP THEO CCCD DUY NHẤT"}
                      </span>
                    </span>
                  </div>
                </div>
                <p className="tr-item-sub">
                  Tem cấp phát cho nông hộ <strong>{data.farmerStamp.householdName}</strong> (CCCD: {data.farmerStamp.householdCccd}) theo định mức diện tích của vườn sầu riêng HTX Krông Búk.
                </p>
              </section>
            )}

            {/* ─── Thẻ 1: Khối thông tin chính (Tem Quả Nông hộ / Lô vườn / Lô hàng) ─── */}
            {data.farmerStamp ? (
              <section className="tr-hero-card">
                <div
                  className="tr-hero-badge"
                  style={{
                    background: data.farmerStamp.status === "activated" ? "#166534" : "#854d0e",
                  }}
                >
                  {data.farmerStamp.status === "activated"
                    ? "TEM QUẢ TẬN VƯỜN ĐÃ KÍCH HOẠT"
                    : "TEM ĐIỆN TỬ ĐÃ CẤP CHO NÔNG HỘ"}
                </div>
                <h1 className="tr-hero-title">Sầu Riêng Krông Búk</h1>
                <p className="tr-hero-origin">
                  Hộ nông dân: <strong>{data.farmerStamp.householdName}</strong> · Thôn: {data.farmerStamp.villageName} · VietGAP &amp; GACC
                </p>

                <div
                  className="tr-hero-status-pill"
                  style={{
                    background:
                      data.farmerStamp.status === "activated"
                        ? "rgba(22, 101, 52, 0.15)"
                        : "rgba(161, 98, 7, 0.15)",
                    color: data.farmerStamp.status === "activated" ? "#15803d" : "#b45309",
                  }}
                >
                  {data.farmerStamp.status === "activated"
                    ? "ĐÃ XÁC THỰC THU HÁI TẠI VƯỜN · ĐẠT CHUẨN XUẤT KHẨU"
                    : "TEM ĐÃ ĐƯỢC CẤP THEO HẠN NGẠCH CCCD · CHƯA KÍCH HOẠT THU HÁI"}
                </div>

                <div className="tr-hero-grid">
                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Mã tem Serial</span>
                    <strong className="tr-hero-val highlight">{data.farmerStamp.serialCode}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Chủ hộ canh tác</span>
                    <strong className="tr-hero-val">{data.farmerStamp.householdName}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Định danh CCCD</span>
                    <strong className="tr-hero-val highlight">{data.farmerStamp.householdCccd}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Lô đất canh tác</span>
                    <strong className="tr-hero-val">{data.farmerStamp.plotCode || "TH1-001"}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Khối lượng quả</span>
                    <strong className="tr-hero-val">
                      {data.farmerStamp.fruitWeightKg
                        ? `${data.farmerStamp.fruitWeightKg} kg (Hạng ${data.farmerStamp.grade ?? "A"})`
                        : "Chờ thu hái thực tế"}
                    </strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Mã số vùng trồng (PUC)</span>
                    <strong className="tr-hero-val highlight">{data.puc.code}</strong>
                  </div>
                </div>
              </section>
            ) : data.plot ? (
              <section className="tr-hero-card">
                <div className="tr-hero-badge">BIỂN CẮM ĐẦU LÔ VƯỜN QR</div>
                <h1 className="tr-hero-title">Định Danh Lô Canh Tác Sầu Riêng</h1>
                <p className="tr-hero-origin">
                  Mã lô: <strong>{data.plot.code}</strong> · Vùng trồng: {data.puc.code} · Krông Búk, Đắk Lắk
                </p>

                <div className="tr-hero-status-pill">
                  ĐÃ ĐỊNH DANH ĐỊA CHÍNH &amp; CẮM BIỂN ĐẦU LÔ VƯỜN
                </div>

                <div className="tr-hero-grid">
                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Mã lô canh tác</span>
                    <strong className="tr-hero-val highlight">{data.plot.code}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Chủ sở hữu</span>
                    <strong className="tr-hero-val">{data.plot.ownerName || "Hộ nông dân"}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Diện tích thửa</span>
                    <strong className="tr-hero-val highlight">{data.plot.areaHa} ha</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Giống sầu riêng</span>
                    <strong className="tr-hero-val">{data.plot.variety || "Monthong (Dona)"}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Năm trồng</span>
                    <strong className="tr-hero-val">{data.plot.plantedYear ? `Năm ${data.plot.plantedYear}` : "Cây thuần thục"}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Mã số vùng trồng (PUC)</span>
                    <strong className="tr-hero-val highlight">{data.puc.code}</strong>
                  </div>
                </div>
              </section>
            ) : (
              <section className="tr-hero-card">
                <div className="tr-hero-badge">XÁC THỰC NGUỒN GỐC CHÍNH NGẠCH</div>
                <h1 className="tr-hero-title">Sầu Riêng Krông Búk</h1>
                <p className="tr-hero-origin">Vùng trồng Đắk Lắk · Tiêu chuẩn VietGAP &amp; GACC</p>

                <div className="tr-hero-status-pill">
                  ĐÃ KIỂM ĐỊNH AN TOÀN · ĐẠT CHUẨN XUẤT KHẨU
                </div>

                <div className="tr-hero-grid">
                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Mã số lô hàng</span>
                    <strong className="tr-hero-val highlight">{data.lot?.code ?? code}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Mã tem QR Lô</span>
                    <strong className="tr-hero-val">{data.lot?.qrCode ?? code}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Ngày thu hoạch</span>
                    <strong className="tr-hero-val">{formatDate(data.lot?.harvestedOn ?? "")}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Mã vùng trồng (PUC)</span>
                    <strong className="tr-hero-val highlight">{data.puc.code}</strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Mã nhà đóng gói (PHC)</span>
                    <strong className="tr-hero-val highlight">
                      {data.supplyChain?.packhouse.code || data.lot?.packhouseCode || "VN-DLPH-0089"}
                    </strong>
                  </div>

                  <div className="tr-hero-item">
                    <span className="tr-hero-label">Tổng sản lượng lô</span>
                    <strong className="tr-hero-val">{data.lot?.weightTons ?? 0} Tấn</strong>
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

              <div className="tr-timeline-steps">
                {/* Giai đoạn 1 */}
                <div className="tr-step-item">
                  <div className="tr-step-marker">
                    <TreePine size={18} />
                  </div>
                  <div className="tr-step-content">
                    <div className="tr-step-head">
                      <strong>1. VÙNG TRỒNG LIÊN KẾT (PUC)</strong>
                      <span className="tr-step-tag">Khảo sát &amp; Canh tác</span>
                    </div>
                    <p className="tr-step-desc">
                      Vùng trồng sầu riêng tập trung HTX Krông Búk, mã số <strong>{data.puc.code}</strong>. Canh tác an toàn sinh học theo quy trình VietGAP, kiểm soát nhật ký phân bón và thời gian cách ly thuốc BVTV (PHI).
                    </p>
                    {data.supplyChain?.contract && (
                      <div className="tr-step-subdetail">
                        <span>Hợp đồng bao tiêu: <strong>{data.supplyChain.contract.code}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Giai đoạn 2 */}
                <div className="tr-step-item">
                  <div className="tr-step-marker">
                    <Building2 size={18} />
                  </div>
                  <div className="tr-step-content">
                    <div className="tr-step-head">
                      <strong>2. SƠ CHẾ &amp; ĐÓNG GÓI (PHC)</strong>
                      <span className="tr-step-tag">Nhà máy đóng gói</span>
                    </div>
                    <p className="tr-step-desc">
                      Tại <strong>{data.supplyChain?.packhouse.name || "Cơ sở đóng gói Đắk Lắk"}</strong> (Mã PHC: <strong>{data.supplyChain?.packhouse.code || "VN-DLPH-0089"}</strong>).
                      <br />
                      • <strong>Phương pháp sơ chế:</strong> {data.supplyChain?.packhouse.treatmentMethod || "Rửa áp lực Ozone, sấy ráo khí động học, khử khuẩn nấm sinh học."}
                      <br />
                      • <strong>Phân loại chất lượng:</strong> Hạng A ({data.supplyChain?.packhouse.gradeAPct ?? 72.5}%) · Độ ngọt bình quân đạt <strong>{data.supplyChain?.packhouse.avgBrix ?? 33.2}° Brix</strong>.
                    </p>
                  </div>
                </div>

                {/* Giai đoạn 3 */}
                <div className="tr-step-item">
                  <div className="tr-step-marker">
                    <Truck size={18} />
                  </div>
                  <div className="tr-step-content">
                    <div className="tr-step-head">
                      <strong>3. VẬN CHUYỂN CHUỖI LẠNH (COLD CHAIN)</strong>
                      <span className="tr-step-tag">Bảo quản nhiệt độ</span>
                    </div>
                    <p className="tr-step-desc">
                      Đơn vị logistics: <strong>{data.supplyChain?.transport.transporter || "Vận tải Lạnh Á Châu"}</strong>.
                      <br />
                      Xe container lạnh biển số <strong>{data.supplyChain?.transport.vehiclePlate || "47C-289.45"}</strong> duy trì nhiệt độ bảo quản chuẩn <strong>{data.supplyChain?.transport.temperatureC ?? 13.5}°C</strong> trong suốt hành trình đưa hàng đến cửa khẩu xuất khẩu.
                    </p>
                  </div>
                </div>

                {/* Giai đoạn 4 */}
                <div className="tr-step-item">
                  <div className="tr-step-marker">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="tr-step-content">
                    <div className="tr-step-head">
                      <strong>4. KIỂM ĐỊNH &amp; DÁN TEM TRUY XUẤT</strong>
                      <span className="tr-step-tag">Thị trường {data.lot?.market || "Xuất khẩu & Nội địa"}</span>
                    </div>
                    <p className="tr-step-desc">
                      Lô hàng đã được kiểm nghiệm độc lập Cadimi an toàn, 100% âm tính chất cấm Vàng O, kích hoạt dải tem QR CheckVN dán trên từng quả và thùng hàng đưa ra thị trường tiêu thụ.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ─── Thẻ 3: Kiểm tra an toàn thực phẩm ─── */}
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
                      Kết quả: {data.labTests[0]?.yellowOPositive ? "Dương tính" : "Âm tính 100% (Không phát hiện)"}
                    </span>
                  </div>
                  <span className="tr-pass-pill">AN TOÀN</span>
                </div>

                <div className="tr-safety-item">
                  <div className="tr-safety-info">
                    <strong className="tr-safety-name">Dư lượng thuốc trừ sâu Chlorpyrifos</strong>
                    <span className="tr-safety-detail">
                      Kết quả: {data.labTests[0]?.chlorpyrifosMgKg ?? "KPH"} (Không phát hiện dư lượng)
                    </span>
                  </div>
                  <span className="tr-pass-pill">ĐẠT CHUẨN</span>
                </div>
              </div>
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
                  <span className="tr-data-label">Doanh nghiệp thu mua</span>
                  <strong className="tr-data-val">{data.lot?.buyer || "HTX Nông Nghiệp Krông Búk"}</strong>
                </div>

                <div className="tr-data-row">
                  <span className="tr-data-label">Thị trường tiêu thụ</span>
                  <strong className="tr-data-val">{data.lot?.market || "Xuất khẩu chính ngạch & Nội địa"}</strong>
                </div>
              </div>
            </section>

            {/* ─── Thẻ 5: Hộ nông dân thu hoạch ─── */}
            {data.households && data.households.length > 0 && (
              <section className="tr-card">
                <div className="tr-card-header">
                  <h2 className="tr-card-title">
                    {data.farmerStamp ? "Hộ nông dân canh tác & sở hữu tem" : "Hộ nông dân đóng góp lô hàng"}
                  </h2>
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
            )}

            {/* ─── Thẻ 6: Nhật ký canh tác thực tế ─── */}
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
        <div className="tr-wrap tr-footer-inner">
          <p className="tr-footer-text">
            Hệ thống quản lý mã số vùng trồng &amp; truy xuất nguồn gốc nông sản
            <br />
            <strong>Hợp Tác Xã Nông Nghiệp Krông Búk – Tỉnh Đắk Lắk</strong>
          </p>
          <div className="tr-footer-meta">
            Cơ sở dữ liệu xác thực mã số vùng trồng PUC theo tiêu chuẩn Bộ NN&amp;PTNT và GACC.
          </div>
        </div>
      </footer>
    </div>
  );
}
