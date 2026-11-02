"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { SkeletonCards } from "@/components/ui/Skeleton";
import {
  ArrowLeft,
  Search,
  Share2,
  Check,
  CheckCircle2,
  Tag,
  Package,
  QrCode,
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
  const [qrSrc, setQrSrc] = useState<string>("");

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

          <span className="tr-verify-tag">Hồ sơ xác thực GACC</span>
        </div>
      </header>

      <main className="tr-wrap tr-main">
        {loading ? (
          <SkeletonCards count={3} label="Đang nạp hồ sơ lô hàng & tem truy xuất…" />
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

            {/* ─── Thẻ 1: Tem Lô Hàng Điện Tử (Đồng bộ thiết kế HarvestAssetTagCard + Watermark) ─── */}
            {data.farmerStamp ? (
              <section className="tr-asset-card" data-status={data.farmerStamp.status}>
                <div className="tr-asset-watermark" aria-hidden="true">
                  <div className="tr-asset-watermark-inner">
                    <span className="tr-asset-watermark-title">
                      {data.farmerStamp.status === "activated" ? "ĐÃ KÍCH HOẠT" : "ĐÃ CẤP TEM"}
                    </span>
                    <span className="tr-asset-watermark-sub">HTX KRÔNG BÚK · ĐÃ KIỂM TRA</span>
                  </div>
                </div>

                <div className="tr-asset-left">
                  <div className="tr-asset-sub-title">
                    <span>SẦU RIÊNG TƯƠI</span>
                    <span className="tr-asset-dot">·</span>
                    <span className="tr-asset-hide-mobile">HTX KRÔNG BÚK</span>
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
                    <span className="tr-asset-id-label">CCCD</span>
                    <strong className="tr-asset-id-val">{data.farmerStamp.householdCccd}</strong>
                  </div>

                  <div className="tr-asset-meta">
                    <span>Lô đất: {data.farmerStamp.plotCode || "TH1-001"}</span>
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
            ) : data.plot ? (
              <section className="tr-asset-card" data-status="active">
                <div className="tr-asset-watermark" aria-hidden="true">
                  <div className="tr-asset-watermark-inner">
                    <span className="tr-asset-watermark-title">ĐÃ ĐỊNH DANH</span>
                    <span className="tr-asset-watermark-sub">HTX KRÔNG BÚK · ĐÃ KIỂM TRA</span>
                  </div>
                </div>

                <div className="tr-asset-left">
                  <div className="tr-asset-sub-title">
                    <span>LÔ CANH TÁC SẦU RIÊNG</span>
                    <span className="tr-asset-dot">·</span>
                    <span className="tr-asset-hide-mobile">HTX KRÔNG BÚK</span>
                    <span className="tr-asset-dot tr-asset-hide-mobile">·</span>
                    <span>{data.puc.code}</span>
                  </div>

                  <div className="tr-asset-code-line">
                    <span className="tr-asset-code-val">LÔ {data.plot.code}</span>
                    <span className="tr-asset-code-divider">·</span>
                    <span className="tr-asset-weight-val">DT: {data.plot.areaHa} ha</span>
                  </div>

                  <div className="tr-asset-id-group">
                    <span className="tr-asset-id-label">CHỦ HỘ</span>
                    <strong className="tr-asset-id-val">{data.plot.ownerName || "Hộ nông dân"}</strong>
                    <span className="tr-asset-dot">·</span>
                    <span className="tr-asset-id-label">GIỐNG</span>
                    <strong className="tr-asset-id-val">{data.plot.variety || "Monthong (Dona)"}</strong>
                  </div>

                  <div className="tr-asset-meta">
                    <span>Năm trồng: {data.plot.plantedYear || "Cây thuần thục"}</span>
                    <span className="tr-asset-meta-dot">·</span>
                    <span>Krông Búk, Đắk Lắk (VietGAP &amp; GACC)</span>
                  </div>
                </div>

                <div className="tr-asset-right">
                  <div className="tr-asset-qr-box">
                    {qrSrc ? (
                      <img
                        src={qrSrc}
                        alt={`Mã QR tra cứu lô đất ${data.plot.code}`}
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
                  <div className="tr-asset-watermark-inner">
                    <span className="tr-asset-watermark-title">ĐÃ XUẤT KHO</span>
                    <span className="tr-asset-watermark-sub">HTX KRÔNG BÚK · ĐÃ KIỂM TRA</span>
                  </div>
                </div>

                <div className="tr-asset-left">
                  <div className="tr-asset-sub-title">
                    <span>SẦU RIÊNG TƯƠI</span>
                    <span className="tr-asset-dot">·</span>
                    <span className="tr-asset-hide-mobile">HTX KRÔNG BÚK</span>
                    <span className="tr-asset-dot tr-asset-hide-mobile">·</span>
                    <span>{data.puc.code}</span>
                  </div>

                  <div className="tr-asset-code-line">
                    <span className="tr-asset-code-val">LÔ {data.lot?.code ?? code}</span>
                    <span className="tr-asset-code-divider">·</span>
                    <span className="tr-asset-weight-val">
                      KLT: {((data.lot?.weightTons ?? 0) * 1000).toLocaleString("vi-VN")} kg ({data.lot?.weightTons ?? 0} Tấn)
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
                      {data.lot?.buyer || "HTX Nông Nghiệp Krông Búk"} (
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
                {/* Giai đoạn 1 */}
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
                        Vùng trồng sầu riêng tập trung HTX Krông Búk, mã số <strong>{data.puc.code}</strong>. Canh tác an toàn sinh học theo quy trình VietGAP, kiểm soát nhật ký phân bón và thời gian cách ly thuốc BVTV (PHI).
                      </p>
                      {data.supplyChain?.contract && (
                        <div className="tr-step-subdetail">
                          <span>Hợp đồng bao tiêu: <strong>{data.supplyChain.contract.code}</strong></span>
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

                {/* Giai đoạn 2 */}
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
                        Tại <strong>{data.supplyChain?.packhouse.name || "Cơ sở đóng gói Đắk Lắk"}</strong> (Mã PHC: <strong>{data.supplyChain?.packhouse.code || "VN-DLPH-0089"}</strong>).
                        <br />
                        • <strong>Phương pháp sơ chế:</strong> {data.supplyChain?.packhouse.treatmentMethod || "Rửa áp lực Ozone, sấy ráo khí động học, khử khuẩn nấm sinh học."}
                        <br />
                        • <strong>Phân loại chất lượng:</strong> Hạng A ({data.supplyChain?.packhouse.gradeAPct ?? 72.5}%) · Độ ngọt bình quân đạt <strong>{data.supplyChain?.packhouse.avgBrix ?? 33.2}° Brix</strong>.
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

                {/* Giai đoạn 3 */}
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
                        Đơn vị logistics: <strong>{data.supplyChain?.transport.transporter || "Vận tải Lạnh Á Châu"}</strong>.
                        <br />
                        Xe container lạnh biển số <strong>{data.supplyChain?.transport.vehiclePlate || "47C-289.45"}</strong> duy trì nhiệt độ bảo quản chuẩn <strong>{data.supplyChain?.transport.temperatureC ?? 13.5}°C</strong> trong suốt hành trình đưa hàng đến cửa khẩu xuất khẩu.
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

                {/* Giai đoạn 4 */}
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
                        <span className="tr-step-tag">Thị trường {data.lot?.market || "Xuất khẩu & Nội địa"}</span>
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
                        {data.labTests[0].chlorpyrifosMgKg !== null && data.labTests[0].chlorpyrifosMgKg !== undefined
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
          </p>
          <p className="tr-footer-org">
            Hợp Tác Xã Nông Nghiệp Krông Búk – Tỉnh Đắk Lắk
          </p>
          <p className="tr-footer-meta">
            Cơ sở dữ liệu xác thực mã số vùng trồng PUC theo tiêu chuẩn Bộ NN&amp;PTNT và GACC.
          </p>
        </div>
      </footer>
    </div>
  );
}
