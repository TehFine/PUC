"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, Download, X, ShieldCheck, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { formatDate } from "@/utils/format";

export interface LabTestCertificateItem {
  id?: number;
  code: string;
  plotCode: string;
  sampledOn: string;
  cdMgKg: number;
  yellowOPositive: boolean;
  residueMgKg: number;
  chlorpyrifosMgKg: number | null;
  result: "pass" | "fail" | string;
  lab: string;
  householdName?: string;
}

interface Props {
  test: LabTestCertificateItem;
  onClose: () => void;
}

export default function LabTestCertificateModal({ test, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const isPass = test.result === "pass" || test.result === "Đạt";
  const householdName = test.householdName || "Nguyễn Văn An";
  const plotCode = test.plotCode || "TH1";

  // Tạo URL QR Code truy xuất hồ sơ kiểm nghiệm gốc
  useEffect(() => {
    const traceUrl = typeof window !== "undefined"
      ? `${window.location.origin}/trace/${encodeURIComponent(plotCode)}`
      : "";
    if (traceUrl) {
      QRCode.toDataURL(traceUrl, {
        margin: 1,
        width: 140,
        color: { dark: "#0f2942", light: "#ffffff" },
      })
        .then(setQrDataUrl)
        .catch(() => {});
    }
  }, [test.code, plotCode]);

  // Phím ESC đóng modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const handlePrint = () => {
    window.print();
  };

  // Format ngày tháng hiển thị phần ký tên
  const dateObj = test.sampledOn ? new Date(test.sampledOn) : new Date();
  const day = !isNaN(dateObj.getDate()) ? String(dateObj.getDate()).padStart(2, "0") : "22";
  const month = !isNaN(dateObj.getMonth()) ? String(dateObj.getMonth() + 1).padStart(2, "0") : "10";
  const year = !isNaN(dateObj.getFullYear()) ? String(dateObj.getFullYear()) : "2024";

  // Chỉ số Chlorpyrifos
  const chlorpyrifosDisplay =
    test.chlorpyrifosMgKg === null || test.chlorpyrifosMgKg === undefined || test.chlorpyrifosMgKg === 0
      ? "KPH"
      : `${test.chlorpyrifosMgKg} mg/kg`;
  const isChlorpyrifosPass = test.chlorpyrifosMgKg === null || test.chlorpyrifosMgKg === undefined || test.chlorpyrifosMgKg === 0;

  return (
    <div
      className="cert-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Phiếu trả kết quả kiểm nghiệm"
    >
      <div className="cert-modal-container">
        {/* THANH ĐIỀU KHIỂN THAO TÁC NGOÀI TỜ GIẤY (NO-PRINT) */}
        <div className="cert-toolbar no-print">
          <div className="cert-toolbar-left">
            <span className="cert-status-badge">
              <ShieldCheck size={16} className="text-emerald-400" />
              <span>Phiếu kiểm nghiệm điện tử · Đã ký số &amp; chứng thực</span>
            </span>
          </div>

          <div className="cert-toolbar-right">
            <button
              type="button"
              className="cert-btn-action"
              onClick={handlePrint}
              title="In phiếu kiểm nghiệm khổ A4 hoặc lưu thành PDF"
            >
              <Printer size={15} />
              <span>In phiếu / Xuất PDF</span>
            </button>
            <button
              type="button"
              className="cert-btn-close"
              onClick={onClose}
              title="Đóng (Esc)"
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* TỜ GIẤY PHIẾU XÉT NGHIỆM CHUẨN A4 */}
        <div className="cert-paper">
          {/* HIỆU ỨNG GÓC GẤP TRANG GIẤY (FOLDED CORNER NHƯ ẢNH MẪU 2) */}
          <div className="cert-paper-fold no-print" aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              {/* Bóng đổ của góc gập */}
              <path d="M0 0 L56 56 L0 56 Z" fill="rgba(15, 23, 42, 0.16)" />
              {/* Mặt lật của góc gấp màu xanh chuyển sắc */}
              <path d="M0 0 L56 56 L0 56 Z" fill="url(#paperFoldGrad)" />
              <path d="M0 0 L56 56" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="1" />
              <defs>
                <linearGradient id="paperFoldGrad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0f2942" />
                  <stop offset="50%" stopColor="#1e3a8a" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* WATERMARK CHÌM Ở TÂM TỜ GIẤY */}
          <div className="cert-watermark" aria-hidden="true">
            <div className="cert-watermark-text">PUC · BẢN GỐC CHỨNG THỰC</div>
            <div className="cert-watermark-sub">ISO/IEC 17025:2017</div>
          </div>

          {/* 1. HEADER CÔNG VĂN CHUẨN NHÀ NƯỚC (NHƯ ẢNH 1) */}
          <div className="cert-header-row">
            {/* Góc trái: Logo & Đơn vị kiểm nghiệm */}
            <div className="cert-org-col">
              <div className="cert-crest">
                <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="22" fill="#0f2942" stroke="#d97706" strokeWidth="1.5" />
                  <circle cx="24" cy="24" r="18" fill="#1e3a5f" />
                  <path d="M12 28 C10 22 14 16 18 13 C16 17 16 23 18 27 Z" fill="#f59e0b" opacity="0.95" />
                  <path d="M36 28 C38 22 34 16 30 13 C32 17 32 23 30 27 Z" fill="#f59e0b" opacity="0.95" />
                  <polygon points="24,14 26,19 31,19 27,22 29,27 24,24 19,27 21,22 17,19 22,19" fill="#fbbf24" />
                  <path d="M21 28 L27 28 L29 34 L19 34 Z" fill="#38bdf8" opacity="0.9" />
                  <circle cx="24" cy="31" r="1.5" fill="#ffffff" />
                </svg>
              </div>
              <div className="cert-org-text">
                <div className="cert-ministry">SỞ NÔNG NGHIỆP &amp; PHÁT TRIỂN NÔNG THÔN TỈNH ĐẮK LẮK</div>
                <div className="cert-center-name">TRUNG TÂM KIỂM ĐỊNH &amp; KHẢO NGHIỆM CHẤT LƯỢNG NÔNG LÂM THỦY SẢN</div>
                <div className="cert-lab-branch">Phòng Hóa nghiệm &amp; Kiểm soát Dư lượng BVTV (ISO/IEC 17025:2017 - VILAS 238)</div>
              </div>
            </div>

            {/* Góc phải: Số hiệu phiếu & Mã QR xác thực */}
            <div className="cert-meta-col">
              <div className="cert-doc-number">
                <span>Số: </span>
                <strong>LAB-{test.code}/PKN-2024</strong>
              </div>
              <div className="cert-puc-code">
                <span>Mã PUC: </span>
                <strong>VN-DLK-0028</strong>
              </div>
              {qrDataUrl && (
                <div className="cert-qr-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="Mã QR xác thực phiếu" className="cert-qr-img" />
                  <span className="cert-qr-caption">Quét tra cứu gốc</span>
                </div>
              )}
            </div>
          </div>

          {/* ĐƯỜNG KẺ ĐÔI CÔNG VĂN CHÍNH THỨC */}
          <div className="cert-double-divider" />

          {/* 2. TIÊU ĐỀ PHIẾU XÉT NGHIỆM IN HOA ĐẬM Ở GIỮA */}
          <div className="cert-title-section">
            <h1 className="cert-main-title">
              PHIẾU TRẢ KẾT QUẢ KIỂM NGHIỆM
            </h1>
            <h2 className="cert-sub-title">
              CHẤT LƯỢNG NÔNG SẢN VÀ DƯ LƯỢNG THUỐC BVTV
            </h2>
            <div className="cert-protocol-badge">
              (Theo Nghị định thư GACC Lệnh 248/249 &amp; Quy chuẩn Kỹ thuật Quốc gia VietGAP)
            </div>
          </div>

          {/* 3. THÔNG TIN MẪU THỬ & ĐỐI TƯỢNG KIỂM NGHIỆM (CHIA CỘT NHƯ ẢNH 1) */}
          <div className="cert-info-block">
            <div className="cert-info-grid">
              <div className="cert-info-row">
                <span className="cert-lbl">Tên chủ hộ / Cơ sở sản xuất:</span>
                <span className="cert-val cert-bold">{householdName}</span>
              </div>
              <div className="cert-info-row">
                <span className="cert-lbl">Mã số vùng trồng (PUC) / Thửa:</span>
                <span className="cert-val cert-bold">VN-DLK-0028 · Thửa {plotCode}</span>
              </div>

              <div className="cert-info-row">
                <span className="cert-lbl">Địa chỉ canh tác:</span>
                <span className="cert-val">Xã Ea Tar, Huyện Cư M&apos;gar, Tỉnh Đắk Lắk</span>
              </div>
              <div className="cert-info-row">
                <span className="cert-lbl">Đối tượng mẫu thử:</span>
                <span className="cert-val">Quả sầu riêng tươi (<em>Durio zibethinus</em> - Monthong/Ri6)</span>
              </div>

              <div className="cert-info-row">
                <span className="cert-lbl">Đơn vị / Người gửi mẫu:</span>
                <span className="cert-val">Ban Kiểm soát Kỹ thuật HTX Nông nghiệp Ea Tar</span>
              </div>
              <div className="cert-info-row">
                <span className="cert-lbl">Ngày lấy mẫu:</span>
                <span className="cert-val cert-bold">{formatDate(test.sampledOn)}</span>
              </div>

              <div className="cert-info-row">
                <span className="cert-lbl">Đơn vị kiểm nghiệm (Lab):</span>
                <span className="cert-val">{test.lab}</span>
              </div>
              <div className="cert-info-row">
                <span className="cert-lbl">Tình trạng mẫu nhận:</span>
                <span className="cert-val">Mẫu đại diện nguyên quả, niêm phong kẹp chì mã {test.code}</span>
              </div>

              <div className="cert-info-row cert-col-full">
                <span className="cert-lbl">Yêu cầu kiểm nghiệm:</span>
                <span className="cert-val">Phân tích kim loại nặng Cadimi (Cd), Dư lượng BVTV, Hoạt chất cấm Chlorpyrifos, Phẩm nhuộm Vàng O (Auramine O).</span>
              </div>

              <div className="cert-info-row cert-col-full">
                <span className="cert-lbl">Phương pháp xét nghiệm:</span>
                <span className="cert-val">Sắc ký khí &amp; lỏng khối phổ (GC-MS/MS, LC-MS/MS), Quang phổ hấp thụ nguyên tử AAS (AOAC 2007.01, TCVN 7602:2007).</span>
              </div>
            </div>
          </div>

          {/* 4. BẢNG KẾT QUẢ XÉT NGHIỆM CHI TIẾT (CHUẨN BẢNG PHÒNG THÍ NGHIỆM) */}
          <div className="cert-table-section">
            <div className="cert-table-heading">
              <strong>KẾT QUẢ THỬ NGHIỆM:</strong>
            </div>

            <div className="cert-table-wrapper">
              <table className="cert-table">
                <thead>
                  <tr>
                    <th style={{ width: "5%" }}>STT</th>
                    <th style={{ width: "32%" }}>TÊN CHỈ TIÊU KIỂM NGHIỆM</th>
                    <th style={{ width: "23%" }}>PHƯƠNG PHÁP THỬ</th>
                    <th style={{ width: "10%" }}>ĐƠN VỊ</th>
                    <th style={{ width: "14%" }}>KẾT QUẢ</th>
                    <th style={{ width: "16%" }}>NGƯỠNG CHO PHÉP</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Hàng 1: Cadimi */}
                  <tr>
                    <td className="text-center">01</td>
                    <td>
                      <strong>Hàm lượng Cadimi (Cd)</strong>
                      <div className="cert-sub-note">Kim loại nặng theo Lệnh 248/249</div>
                    </td>
                    <td>TCVN 7602:2007 (F-AAS)</td>
                    <td className="text-center">mg/kg</td>
                    <td className="text-center font-bold">
                      <span className={test.cdMgKg <= 0.05 ? "val-ok" : "val-exceed"}>
                        {test.cdMgKg}
                      </span>
                    </td>
                    <td className="text-center">
                      &le; 0.05 mg/kg
                      <div className="cert-tag-pass">&le; GACC</div>
                    </td>
                  </tr>

                  {/* Hàng 2: Dư lượng thuốc BVTV */}
                  <tr>
                    <td className="text-center">02</td>
                    <td>
                      <strong>Tổng dư lượng hóa chất BVTV</strong>
                      <div className="cert-sub-note">Nhóm Phospho &amp; Cúc tổng hợp</div>
                    </td>
                    <td>AOAC 2007.01 (LC-MS/MS)</td>
                    <td className="text-center">mg/kg</td>
                    <td className="text-center font-bold">
                      <span className={test.residueMgKg <= 0.1 ? "val-ok" : "val-exceed"}>
                        {test.residueMgKg}
                      </span>
                    </td>
                    <td className="text-center">
                      &le; 0.10 mg/kg
                      <div className="cert-tag-pass">VietGAP</div>
                    </td>
                  </tr>

                  {/* Hàng 3: Chlorpyrifos */}
                  <tr>
                    <td className="text-center">03</td>
                    <td>
                      <strong>Hoạt chất Chlorpyrifos Ethyl</strong>
                      <div className="cert-sub-note">Danh mục cấm theo TT 10/2024</div>
                    </td>
                    <td>TCVN 8938:2011 (GC-MS)</td>
                    <td className="text-center">mg/kg</td>
                    <td className="text-center font-bold">
                      <span className={isChlorpyrifosPass ? "val-ok" : "val-exceed"}>
                        {chlorpyrifosDisplay}
                      </span>
                    </td>
                    <td className="text-center">
                      KPH (Cấm tuyệt đối)
                      <div className="cert-tag-zero">LOD: 0.01</div>
                    </td>
                  </tr>

                  {/* Hàng 4: Vàng O */}
                  <tr>
                    <td className="text-center">04</td>
                    <td>
                      <strong>Chất cấm Vàng O (Auramine O)</strong>
                      <div className="cert-sub-note">Phẩm nhuộm công nghiệp cấm</div>
                    </td>
                    <td>Phương pháp LC-MS/MS</td>
                    <td className="text-center">Định tính</td>
                    <td className="text-center font-bold">
                      <span className={!test.yellowOPositive ? "val-ok" : "val-exceed"}>
                        {test.yellowOPositive ? "Dương tính" : "Âm tính"}
                      </span>
                    </td>
                    <td className="text-center">
                      Âm tính (Cấm tuyệt đối)
                      <div className="cert-tag-zero">Zero-tolerance</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. PHẦN KẾT LUẬN & ĐÁNH GIÁ (CHUẨN HÌNH ẢNH MẪU 1) */}
          <div className="cert-conclusion-block">
            <div className="cert-conclusion-line">
              <span className="cert-concl-title">KẾT LUẬN: </span>
              {isPass ? (
                <strong className="cert-concl-pass">
                  Mẫu sầu riêng ĐẠT TIÊU CHUẨN AN TOÀN VỆ SINH THỰC PHẨM VÀ ĐỦ ĐIỀU KIỆN XUẤT KHẨU CHÍNH NGẠCH SANG THỊ TRƯỜNG TRUNG QUỐC (Theo Lệnh 248/249 GACC &amp; Tiêu chuẩn VietGAP).
                </strong>
              ) : (
                <strong className="cert-concl-fail">
                  MẪU KIỂM NGHIỆM KHÔNG ĐẠT TIÊU CHUẨN XUẤT KHẨU. Tồn tại chỉ số vượt ngưỡng quy định an toàn. Cơ sở tạm dừng thu hoạch tại thửa {plotCode} để xử lý khoanh vùng.
                </strong>
              )}
            </div>

            <div className="cert-protocol-meta">
              <div className="cert-meta-item">
                <span>Mã quy trình kiểm nghiệm: </span>
                <strong>QT-KNCL-GACC-500/PUC</strong>
              </div>
              <div className="cert-meta-item">
                <span>Sử dụng PXN tham chiếu: </span>
                <span className="cert-checkbox-group">
                  <span className="cert-box checked">&#9746; Không</span>
                  <span className="cert-box">&#9744; Có</span>
                </span>
              </div>
            </div>

            <div className="cert-notes-line">
              <span className="cert-notes-lbl">Chú thích: </span>
              <em>
                (1) KPH: Không phát hiện (dưới giới hạn định lượng LOD = 0.01 mg/kg). (2) Kết quả chỉ có giá trị đối với mẫu thử niêm phong mang mã số {test.code}. (3) Phiếu có giá trị xuất trình cơ quan Hải quan và Kiểm dịch thực vật tại cửa khẩu xuất khẩu.
              </em>
            </div>

            <div className="cert-dispatch-time">
              <span>Thời điểm trả kết quả: </span>
              <strong>{formatDate(test.sampledOn)} — 17h30.</strong>
            </div>
          </div>

          {/* 6. PHẦN KÝ TÊN VÀ CON DẤU MỘC ĐỎ PHÁP LÝ (NHƯ ẢNH 1) */}
          <div className="cert-signatures-section">
            {/* Cột Trái: Kỹ thuật viên xét nghiệm */}
            <div className="cert-sign-col">
              <div className="cert-sign-role">Người thực hiện phân tích</div>
              <div className="cert-sign-hint">(Ký và ghi rõ họ tên)</div>

              <div className="cert-handwritten-signature">
                {/* SVG Chữ ký tay nét mực xanh bút máy chân thực của KS. Nguyễn Thị Thùy Dương */}
                <svg width="150" height="52" viewBox="0 0 150 52" fill="none">
                  <path
                    d="M14 36 C 20 16, 28 8, 34 20 C 38 28, 34 42, 44 30 C 53 18, 60 10, 68 23 C 73 32, 76 40, 86 26 C 94 14, 103 22, 113 33 C 120 40, 130 28, 136 20"
                    stroke="#1d4ed8"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M20 42 C 43 40, 83 39, 126 41"
                    stroke="#1d4ed8"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                  <circle cx="130" cy="41" r="1.5" fill="#1d4ed8" />
                </svg>
              </div>

              <div className="cert-sign-name">KS. Nguyễn Thị Thùy Dương</div>
              <div className="cert-sign-title">Kỹ thuật viên Phân tích Hóa nghiệm</div>
            </div>

            {/* Cột Phải: Trưởng đơn vị kiểm nghiệm + Dấu mộc đỏ tròn */}
            <div className="cert-sign-col cert-sign-col-right">
              <div className="cert-sign-date">
                <em>Đắk Lắk, ngày {day} tháng {month} năm {year}</em>
              </div>
              <div className="cert-sign-role">Trưởng phòng Kiểm nghiệm &amp; Đo lường</div>
              <div className="cert-sign-hint">(Ký tên và đóng dấu)</div>

              <div className="cert-stamp-and-sign-area">
                {/* 1. CHỮ KÝ TAY MỰC XANH CỦA GIÁM ĐỐC / TRƯỞNG PHÒNG */}
                <div className="cert-director-signature">
                  <svg width="170" height="60" viewBox="0 0 170 60" fill="none">
                    <path
                      d="M18 42 C 10 23, 26 6, 40 14 C 50 22, 43 46, 30 44 C 22 42, 36 26, 53 22 C 68 18, 76 36, 88 26 C 100 16, 110 30, 124 24 C 136 18, 143 33, 153 20"
                      stroke="#1d4ed8"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M23 48 C 58 46, 108 44, 156 46"
                      stroke="#1d4ed8"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                    />
                    <circle cx="160" cy="46" r="1.8" fill="#1d4ed8" />
                  </svg>
                </div>

                {/* 2. CON DẤU MỘC ĐỎ TRÒN BẢO CHỨNG SVG CHUẨN CÔNG VĂN VIỆT NAM (ĐÈ LÊN CHỮ KÝ) */}
                <div className="cert-red-stamp" aria-hidden="true">
                  <svg width="130" height="130" viewBox="0 0 130 130" fill="none">
                    {/* Vòng tròn kép đỏ ngoài */}
                    <circle cx="65" cy="65" r="62" stroke="#d32f2f" strokeWidth="2.4" fill="none" opacity="0.9" />
                    <circle cx="65" cy="65" r="44" stroke="#d32f2f" strokeWidth="1.2" strokeDasharray="3 1.5" fill="none" opacity="0.85" />

                    {/* Vòng chữ tròn trên: TRUNG TÂM KIỂM NGHIỆM CHẤT LƯỢNG */}
                    <path id="stamp-arc-top" d="M 15,65 A 50,50 0 0,1 115,65" fill="none" />
                    <text fill="#d32f2f" fontSize="7.6" fontWeight="800" letterSpacing="1px" fontFamily="'Times New Roman', serif">
                      <textPath href="#stamp-arc-top" startOffset="50%" textAnchor="middle">
                        TRUNG TÂM KIỂM NGHIỆM CHẤT LƯỢNG
                      </textPath>
                    </text>

                    {/* Vòng chữ tròn dưới: TỈNH ĐẮK LẮK */}
                    <path id="stamp-arc-bot" d="M 115,65 A 50,50 0 0,1 15,65" fill="none" />
                    <text fill="#d32f2f" fontSize="7.4" fontWeight="800" letterSpacing="1.2px" fontFamily="'Times New Roman', serif">
                      <textPath href="#stamp-arc-bot" startOffset="50%" textAnchor="middle">
                        ★ TỈNH ĐẮK LẮK ★
                      </textPath>
                    </text>

                    {/* Biểu tượng ngôi sao 5 cánh ở giữa */}
                    <polygon
                      points="65,36 67.5,43 75,43 69,47.5 71,55 65,50 59,55 61,47.5 55,43 62.5,43"
                      fill="#d32f2f"
                    />

                    {/* Chữ ĐÃ KIỂM ĐỊNH & ISO 17025 */}
                    <text
                      x="65"
                      y="64"
                      textAnchor="middle"
                      fill="#d32f2f"
                      fontSize="8.5"
                      fontWeight="900"
                      fontFamily="'Times New Roman', serif"
                      letterSpacing="0.8px"
                    >
                      ĐÃ PHÊ DUYỆT
                    </text>
                    <text
                      x="65"
                      y="74"
                      textAnchor="middle"
                      fill="#d32f2f"
                      fontSize="6.8"
                      fontWeight="700"
                      fontFamily="'Times New Roman', serif"
                    >
                      ISO/IEC 17025
                    </text>
                    <text
                      x="65"
                      y="83"
                      textAnchor="middle"
                      fill="#d32f2f"
                      fontSize="5.8"
                      fontWeight="600"
                      fontFamily="'Times New Roman', serif"
                    >
                      SỐ: 08-VILAS 238
                    </text>
                  </svg>
                </div>
              </div>

              <div className="cert-sign-name">TS. Trần Gia Phú</div>
              <div className="cert-sign-title">Giám đốc Trung tâm Kiểm nghiệm</div>
            </div>
          </div>

          {/* 7. DẢI FOOTER BẢO MẬT & MÃ VẠCH (BARCODE) DƯỚI CÙNG */}
          <div className="cert-footer-row">
            <div className="cert-barcode-box">
              {/* Barcode SVG tượng trưng chân thực */}
              <svg width="200" height="28" viewBox="0 0 200 28" fill="none">
                <rect x="0" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="5" y="0" width="1.5" height="22" fill="#0f2942" />
                <rect x="9" y="0" width="4" height="22" fill="#0f2942" />
                <rect x="15" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="19" y="0" width="1" height="22" fill="#0f2942" />
                <rect x="23" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="28" y="0" width="5" height="22" fill="#0f2942" />
                <rect x="35" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="39" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="45" y="0" width="1.5" height="22" fill="#0f2942" />
                <rect x="49" y="0" width="4" height="22" fill="#0f2942" />
                <rect x="55" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="60" y="0" width="5" height="22" fill="#0f2942" />
                <rect x="68" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="73" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="78" y="0" width="1.5" height="22" fill="#0f2942" />
                <rect x="82" y="0" width="4" height="22" fill="#0f2942" />
                <rect x="88" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="93" y="0" width="1.5" height="22" fill="#0f2942" />
                <rect x="97" y="0" width="4" height="22" fill="#0f2942" />
                <rect x="103" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="108" y="0" width="5" height="22" fill="#0f2942" />
                <rect x="115" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="120" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="125" y="0" width="1.5" height="22" fill="#0f2942" />
                <rect x="130" y="0" width="4" height="22" fill="#0f2942" />
                <rect x="136" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="140" y="0" width="5" height="22" fill="#0f2942" />
                <rect x="148" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="153" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="158" y="0" width="1.5" height="22" fill="#0f2942" />
                <rect x="162" y="0" width="4" height="22" fill="#0f2942" />
                <rect x="168" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="173" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="178" y="0" width="4" height="22" fill="#0f2942" />
                <rect x="185" y="0" width="2" height="22" fill="#0f2942" />
                <rect x="190" y="0" width="3" height="22" fill="#0f2942" />
                <rect x="196" y="0" width="4" height="22" fill="#0f2942" />
              </svg>
              <div className="cert-barcode-val">*PUC-{test.code}-ISO17025*</div>
            </div>

            <div className="cert-security-hash">
              <span>Mã bảo mật điện tử: </span>
              <code>PUC-SHA256-{test.code}-CERT-OK</code>
              <div>Xác thực trực tuyến tại Cổng Dịch vụ công Quốc gia: puc.mard.gov.vn</div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS RIÊNG DÀNH CHO TỜ GIẤY PHIẾU XÉT NGHIỆM VÀ KHỔ IN A4 */}
      <style jsx>{`
        /* ── Backdrop mờ nền đen ── */
        .cert-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(15, 23, 42, 0.72);
          backdrop-filter: blur(6px);
          overflow-y: auto;
          padding: 24px 16px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          animation: certFadeIn 0.2s ease-out;
        }

        @keyframes certFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .cert-modal-container {
          width: 100%;
          max-width: 790px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin: auto;
        }

        /* ── Thanh điều khiển phía trên ── */
        .cert-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: #1e293b;
          color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
        }

        .cert-toolbar-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cert-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 600;
          color: #34d399;
        }

        .cert-toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .cert-btn-action {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: #2563eb;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .cert-btn-action:hover {
          background: #1d4ed8;
        }

        .cert-btn-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border: none;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .cert-btn-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        /* ── TỜ GIẤY CHUẨN A4 ── */
        .cert-paper {
          position: relative;
          background: #ffffff;
          color: #0f172a;
          border-radius: 4px;
          padding: 38px 44px 32px;
          box-shadow:
            0 10px 30px -5px rgba(15, 23, 42, 0.14),
            0 25px 60px -15px rgba(15, 23, 42, 0.28),
            0 0 1px rgba(15, 23, 42, 0.15);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Times New Roman", serif;
          line-height: 1.45;
          overflow: hidden;
        }

        /* Góc gập trang giấy (Top Right Fold) */
        .cert-paper-fold {
          position: absolute;
          top: 0;
          right: 0;
          width: 56px;
          height: 56px;
          pointer-events: none;
          z-index: 10;
        }

        /* Watermark mờ nhạt bảo mật */
        .cert-watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-25deg);
          pointer-events: none;
          user-select: none;
          text-align: center;
          opacity: 0.038;
          z-index: 1;
        }

        .cert-watermark-text {
          font-size: 54px;
          font-weight: 900;
          letter-spacing: 4px;
          color: #0f2942;
          white-space: nowrap;
        }

        .cert-watermark-sub {
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 2px;
          color: #0f2942;
        }

        /* 1. Header công văn */
        .cert-header-row {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .cert-org-col {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          flex: 1;
        }

        .cert-crest {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .cert-org-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .cert-ministry {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          letter-spacing: 0.03em;
        }

        .cert-center-name {
          font-size: 13.5px;
          font-weight: 900;
          color: #0f2942;
          letter-spacing: -0.01em;
          text-transform: uppercase;
        }

        .cert-lab-branch {
          font-size: 11px;
          font-style: italic;
          color: #64748b;
        }

        .cert-meta-col {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          flex-shrink: 0;
        }

        .cert-doc-number,
        .cert-puc-code {
          font-size: 11.5px;
          color: #334155;
        }

        .cert-doc-number strong,
        .cert-puc-code strong {
          color: #0f2942;
          font-family: monospace;
          font-size: 12px;
        }

        .cert-qr-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 4px;
        }

        .cert-qr-img {
          width: 58px;
          height: 58px;
          border: 1px solid #e2e8f0;
          padding: 2px;
          background: #ffffff;
        }

        .cert-qr-caption {
          font-size: 9px;
          color: #64748b;
          margin-top: 1px;
        }

        /* Đường kẻ đôi công văn */
        .cert-double-divider {
          position: relative;
          z-index: 2;
          height: 3px;
          border-top: 1.5px solid #0f2942;
          border-bottom: 0.8px solid #0f2942;
          margin: 14px 0 16px;
        }

        /* 2. Tiêu đề phiếu */
        .cert-title-section {
          position: relative;
          z-index: 2;
          text-align: center;
          margin-bottom: 20px;
        }

        .cert-main-title {
          font-size: 21px;
          font-weight: 900;
          color: #1e3a8a;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          line-height: 1.25;
        }

        .cert-sub-title {
          font-size: 14.5px;
          font-weight: 750;
          color: #0f2942;
          margin: 4px 0 0;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .cert-protocol-badge {
          display: inline-block;
          font-size: 11px;
          font-style: italic;
          color: #475569;
          margin-top: 4px;
        }

        /* 3. Khối thông tin mẫu */
        .cert-info-block {
          position: relative;
          z-index: 2;
          margin-bottom: 18px;
          font-size: 12.5px;
        }

        .cert-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 20px;
          row-gap: 5px;
        }

        .cert-col-full {
          grid-column: 1 / -1;
        }

        .cert-info-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .cert-lbl {
          font-weight: 600;
          color: #334155;
          flex-shrink: 0;
        }

        .cert-val {
          color: #0f172a;
        }

        .cert-bold {
          font-weight: 700;
        }

        /* 4. Bảng kết quả */
        .cert-table-section {
          position: relative;
          z-index: 2;
          margin-bottom: 18px;
        }

        .cert-table-heading {
          font-size: 13.5px;
          font-weight: 800;
          color: #0f2942;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .cert-table-wrapper {
          overflow-x: auto;
        }

        .cert-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          border: 1px solid #334155;
        }

        .cert-table th,
        .cert-table td {
          border: 1px solid #475569;
          padding: 7px 8px;
          vertical-align: middle;
        }

        .cert-table th {
          background: #f1f5f9;
          color: #0f2942;
          font-weight: 800;
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.02em;
        }

        .cert-sub-note {
          font-size: 10.5px;
          color: #64748b;
          font-style: italic;
          margin-top: 1px;
        }

        .text-center {
          text-align: center;
        }

        .font-bold {
          font-weight: 700;
        }

        .val-ok {
          color: #15803d;
          font-size: 13px;
        }

        .val-exceed {
          color: #dc2626;
          font-size: 13px;
        }

        .cert-tag-pass {
          display: inline-block;
          font-size: 9.5px;
          font-weight: 700;
          color: #15803d;
          background: #dcfce7;
          border-radius: 4px;
          padding: 1px 5px;
          margin-top: 2px;
        }

        .cert-tag-zero {
          display: inline-block;
          font-size: 9.5px;
          font-weight: 700;
          color: #475569;
          background: #f1f5f9;
          border-radius: 4px;
          padding: 1px 5px;
          margin-top: 2px;
        }

        /* 5. Khối kết luận */
        .cert-conclusion-block {
          position: relative;
          z-index: 2;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 12px 14px;
          margin-bottom: 20px;
          font-size: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .cert-conclusion-line {
          font-size: 12.5px;
          line-height: 1.4;
        }

        .cert-concl-title {
          font-weight: 900;
          text-decoration: underline;
          color: #0f2942;
        }

        .cert-concl-pass {
          color: #15803d;
          font-weight: 750;
        }

        .cert-concl-fail {
          color: #dc2626;
          font-weight: 750;
        }

        .cert-protocol-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          border-top: 1px dashed #cbd5e1;
          padding-top: 6px;
          color: #334155;
        }

        .cert-checkbox-group {
          display: inline-flex;
          gap: 10px;
        }

        .cert-box {
          font-family: monospace;
          font-size: 12px;
        }

        .cert-box.checked {
          color: #0f2942;
          font-weight: 700;
        }

        .cert-notes-line {
          font-size: 11px;
          color: #64748b;
          line-height: 1.4;
        }

        .cert-notes-lbl {
          font-weight: 700;
          color: #334155;
        }

        .cert-dispatch-time {
          font-size: 11.5px;
          color: #334155;
        }

        /* 6. Phần Ký tên & Dấu mộc đỏ */
        .cert-signatures-section {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 10px;
          margin-bottom: 24px;
        }

        .cert-sign-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .cert-sign-col-right {
          align-items: center;
        }

        .cert-sign-date {
          font-size: 11.5px;
          color: #475569;
          margin-bottom: 2px;
        }

        .cert-sign-role {
          font-size: 12.5px;
          font-weight: 800;
          color: #0f2942;
          text-transform: uppercase;
        }

        .cert-sign-hint {
          font-size: 10.5px;
          font-style: italic;
          color: #64748b;
        }

        .cert-handwritten-signature {
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 4px 0;
        }

        .cert-stamp-and-sign-area {
          position: relative;
          height: 75px;
          width: 190px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 4px 0;
        }

        .cert-director-signature {
          position: relative;
          z-index: 2;
        }

        .cert-red-stamp {
          position: absolute;
          top: -16px;
          left: 10px;
          z-index: 3;
          pointer-events: none;
          transform: rotate(-7deg);
          mix-blend-mode: multiply;
        }

        .cert-sign-name {
          font-size: 13.5px;
          font-weight: 800;
          color: #0f2942;
        }

        .cert-sign-title {
          font-size: 11px;
          color: #64748b;
        }

        /* 7. Footer & Barcode */
        .cert-footer-row {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          border-top: 1px solid #e2e8f0;
          padding-top: 12px;
          font-size: 10.5px;
          color: #64748b;
        }

        .cert-barcode-box {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .cert-barcode-val {
          font-family: monospace;
          font-size: 10px;
          letter-spacing: 0.1em;
          color: #0f2942;
        }

        .cert-security-hash {
          text-align: right;
          max-width: 320px;
        }

        .cert-security-hash code {
          background: #f1f5f9;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 10px;
          color: #0f2942;
        }

        /* ── RESPONSIVE MOBILE ── */
        @media (max-width: 640px) {
          .cert-paper {
            padding: 24px 16px 20px;
          }

          .cert-header-row {
            flex-direction: column;
            gap: 12px;
          }

          .cert-meta-col {
            align-items: flex-start;
          }

          .cert-qr-wrap {
            display: none;
          }

          .cert-info-grid {
            grid-template-columns: 1fr;
          }

          .cert-main-title {
            font-size: 17px;
          }

          .cert-sub-title {
            font-size: 12.5px;
          }

          .cert-table th,
          .cert-table td {
            padding: 5px 4px;
            font-size: 11px;
          }

          .cert-signatures-section {
            grid-template-columns: 1fr;
            gap: 18px;
          }

          .cert-footer-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .cert-security-hash {
            text-align: left;
          }
        }

        /* ── CHẾ ĐỘ IN ẤN CHUẨN A4 (PRINT MEDIA) ── */
        @media print {
          body * {
            visibility: hidden !important;
          }

          .cert-paper,
          .cert-paper * {
            visibility: visible !important;
          }

          .no-print,
          .cert-modal-backdrop {
            display: none !important;
            background: transparent !important;
            padding: 0 !important;
          }

          .cert-paper {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 20mm 15mm !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
