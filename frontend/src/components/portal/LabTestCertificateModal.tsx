"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { ArrowRight, Download, Printer } from "lucide-react";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { WatermarkStamp } from "@/components/ui/WatermarkStamp";
import { isLowEndDevice } from "@/lib/network";
import { lockRootScroll } from "@/lib/scroll-lock";
import { triggerBlobDownload } from "@/utils/download";
import { formatDate } from "@/utils/format";
import { useIsDesktopViewport } from "./ui";
import { useSheetSwipe } from "./use-sheet-swipe";

/** Đóng gói mảng byte ảnh JPEG thành file PDF 1.4 khổ A4 chuẩn (595.28 x 841.89 pt). */
function jpegBytesToA4PdfBlob(jpegBytes: Uint8Array, pixelWidth: number, pixelHeight: number): Blob {
  const pageW = "595.28";
  const pageH = "841.89";
  const encoder = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const offsets: number[] = [0];
  let pos = 0;

  const pushStr = (str: string) => {
    const buf = encoder.encode(str) as Uint8Array<ArrayBuffer>;
    chunks.push(buf);
    pos += buf.byteLength;
  };
  const pushBytes = (buf: Uint8Array) => {
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    chunks.push(copy);
    pos += copy.byteLength;
  };

  pushStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  offsets[1] = pos;
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  offsets[2] = pos;
  pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  offsets[3] = pos;
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  offsets[4] = pos;
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`,
  );
  pushBytes(jpegBytes);
  pushStr("\nendstream\nendobj\n");

  const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  offsets[5] = pos;
  pushStr(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  const xrefPos = pos;
  pushStr("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) {
    pushStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  return new Blob(chunks, { type: "application/pdf" });
}

/** Thu thập quy tắc CSS an toàn cho foreignObject (bỏ @import / @font-face ngoài để không làm bẩn Canvas). */
function collectEmbeddedCssForSvg(): string {
  const chunks: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSImportRule || rule instanceof CSSFontFaceRule) continue;
      const text = rule.cssText;
      if (/url\s*\(\s*["']?(?!data:)/i.test(text)) continue;
      chunks.push(text);
    }
  }

  for (const el of Array.from(document.querySelectorAll("style"))) {
    const raw = el.textContent ?? "";
    if (!raw.trim()) continue;
    const cleaned = raw.replace(/url\s*\(\s*["']?(?!data:)[^)"']+["']?\s*\)/gi, "none");
    chunks.push(cleaned);
  }

  return chunks.join("\n");
}

/** Kết xuất tờ giấy A4 (.cert-paper 790x1117) sang file PDF độ phân giải cao và tải thẳng về máy. */
async function exportCertPaperToPdf(paperEl: HTMLElement, fileName: string): Promise<void> {
  const width = 790;
  const height = 1117;
  const scale = isLowEndDevice() ? 1.5 : 2;
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  const clone = paperEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".cert-paper-fold, .no-print").forEach((node) => node.remove());

  const styles = collectEmbeddedCssForSvg();

  const svgNS = "http://www.w3.org/2000/svg";
  const xhtmlNS = "http://www.w3.org/1999/xhtml";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", String(outW));
  svg.setAttribute("height", String(outH));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const styleEl = document.createElementNS(svgNS, "style");
  styleEl.textContent = `${styles}
    .cert-paper {
      width: ${width}px !important;
      min-height: ${height}px !important;
      height: ${height}px !important;
      margin: 0 !important;
      box-shadow: none !important;
      clip-path: none !important;
      border-radius: 0 !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
    }
  `;
  svg.appendChild(styleEl);

  const fo = document.createElementNS(svgNS, "foreignObject");
  fo.setAttribute("x", "0");
  fo.setAttribute("y", "0");
  fo.setAttribute("width", String(width));
  fo.setAttribute("height", String(height));

  const wrapper = document.createElementNS(xhtmlNS, "div");
  wrapper.setAttribute("xmlns", xhtmlNS);
  wrapper.setAttribute(
    "style",
    `width:${width}px;height:${height}px;background:#ffffff;overflow:hidden;margin:0;padding:0;`,
  );

  wrapper.appendChild(clone);
  fo.appendChild(wrapper);
  svg.appendChild(fo);

  const svgXml = new XMLSerializer().serializeToString(svg);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgXml)}`;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (err) => reject(err);
    image.src = svgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  try {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);

    const jpegBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!jpegBlob) throw new Error("JPEG encoding failed");
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

    const pdfBlob = jpegBytesToA4PdfBlob(jpegBytes, outW, outH);
    triggerBlobDownload(pdfBlob, fileName);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

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

/** Góc gấp giấy trắng 3D (Dog-Ear Fold) với ID riêng biệt tránh xung đột SVG defs giữa Desktop & Mobile */
function PaperDogEarFold({ idPrefix }: { idPrefix: string }) {
  const shadowId = `certFoldShadow-${idPrefix}`;
  const surfaceId = `certFoldSurface-${idPrefix}`;
  const rimId = `certFoldRim-${idPrefix}`;

  return (
    <div className="cert-paper-fold no-print" aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 96 96" fill="none">
        <defs>
          <linearGradient id={shadowId} x1="46" y1="42" x2="18" y2="78" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.22" />
            <stop offset="52%" stopColor="#0f172a" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </linearGradient>

          <linearGradient id={surfaceId} x1="62" y1="34" x2="26" y2="70" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#d8dee6" />
            <stop offset="22%" stopColor="#eef2f6" />
            <stop offset="58%" stopColor="#fbfcfd" />
            <stop offset="88%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e6ebf1" />
          </linearGradient>

          <linearGradient id={rimId} x1="28" y1="0" x2="64" y2="68" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        <path
          d="M20 8 L20 58 Q20 75 38 75 L88 75 Z"
          fill={`url(#${shadowId})`}
        />
        <path
          d="M28 0 L28 51 Q28 68 45 68 L96 68 L28 0 Z"
          fill={`url(#${surfaceId})`}
        />
        <path
          d="M28.5 0.5 L28.5 51 Q28.5 67.5 45 67.5 L95.5 67.5"
          stroke={`url(#${rimId})`}
          strokeWidth="1.2"
          fill="none"
        />
        <line
          x1="28"
          y1="0"
          x2="96"
          y2="68"
          stroke="#cbd5e1"
          strokeWidth="0.9"
        />
      </svg>
    </div>
  );
}

export default function LabTestCertificateModal({ test, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [downloading, setDownloading] = useState<boolean>(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<boolean>(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const mobileStackRef = useRef<HTMLDivElement>(null);
  const [sheetScale, setSheetScale] = useState<number>(0.68);
  const isDesktop = useIsDesktopViewport(760);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const container = containerRef.current;
    const backdrop = backdropRef.current;
    const desktopNow = typeof window !== "undefined" && window.innerWidth >= 760;
    const closeDuration = desktopNow ? 240 : 220;

    if (container) {
      container.style.animation = "none";
      container.style.pointerEvents = "none";
      container.style.transition = desktopNow
        ? "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)"
        : "transform 220ms cubic-bezier(0.25, 1, 0.5, 1)";
      container.style.transform = desktopNow ? "translate3d(100%, 0, 0)" : "translate3d(0, 100%, 0)";
    }
    if (backdrop) {
      backdrop.style.animation = "none";
      backdrop.style.pointerEvents = "none";
      backdrop.style.transition = "opacity 210ms ease-out";
      backdrop.style.opacity = "0";
    }
    setTimeout(() => {
      closingRef.current = false;
      onClose();
    }, closeDuration);
  }, [onClose]);

  useSheetSwipe({
    sheetRef: containerRef,
    handleRef: toolbarRef,
    onDismiss: handleClose,
    enabled: !isDesktop,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (closingRef.current) return;
      if (containerRef.current) {
        containerRef.current.style.animation = "none";
        containerRef.current.style.transform = "translate3d(0, 0, 0)";
        containerRef.current.style.willChange = "auto";
      }
      if (backdropRef.current) {
        backdropRef.current.style.animation = "none";
        backdropRef.current.style.opacity = "1";
      }
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  const isPass = test.result === "pass" || test.result === "Đạt";
  const householdName = test.householdName || "Chưa cập nhật";
  const plotCode = test.plotCode || test.code || "—";

  // Tạo URL QR Code truy xuất hồ sơ kiểm nghiệm gốc
  useEffect(() => {
    const qrTargetCode = test.plotCode || test.code || "";
    const traceUrl =
      typeof window !== "undefined" && qrTargetCode
        ? `${window.location.origin}/trace/${encodeURIComponent(qrTargetCode)}`
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
  }, [test.plotCode, test.code]);

  // Tự động đo chiều rộng khung mobile để scale tờ giấy chuẩn xác tỷ lệ A4 (520 x 735.43)
  useEffect(() => {
    if (isDesktop) return;
    const el = mobileStackRef.current;
    if (!el) return;
    let rafId = 0;
    const measure = () => {
      rafId = 0;
      const w = el.clientWidth;
      if (w > 0) {
        const next = w / 520;
        setSheetScale((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
      }
    };
    const scheduleMeasure = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(measure);
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(scheduleMeasure);
      ro.observe(el);
      return () => {
        if (rafId) window.cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [isDesktop]);

  // Phím ESC đóng modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    const unlockScroll = lockRootScroll();
    return () => {
      window.removeEventListener("keydown", handleKey);
      unlockScroll();
    };
  }, [handleClose]);

  const safeCode = (test.code || "phieu").replace(/[^a-zA-Z0-9-_]+/g, "-");

  // In trực tiếp ra máy in khổ A4
  const handlePrint = () => {
    const previousTitle = document.title;
    document.title = `Phieu-kiem-nghiem-${safeCode}`;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
    // Một số trình duyệt di động không phát sự kiện afterprint: khôi phục dự phòng
    setTimeout(restoreTitle, 1500);
  };

  // Tải thẳng file PDF khổ A4 về thiết bị (không cần qua hộp thoại chọn máy in)
  const handleDownloadPdf = async () => {
    if (downloading || !paperRef.current) return;
    setDownloading(true);
    try {
      await exportCertPaperToPdf(paperRef.current, `Phieu-kiem-nghiem-${safeCode}.pdf`);
    } catch {
      handlePrint();
    } finally {
      setDownloading(false);
    }
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

  // Gắn trực tiếp dưới <body>: khi in chỉ còn phiếu, không bị nội dung trang phía sau đẩy sang trang trắng
  return createPortal(
    <div
      ref={backdropRef}
      className="cert-modal-backdrop cert-print-root"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Phiếu trả kết quả kiểm nghiệm"
    >
      <div ref={containerRef} className="cert-modal-container">
        {/* THANH ĐIỀU KHIỂN THAO TÁC NGOÀI TỜ GIẤY (NO-PRINT) */}
        <div ref={toolbarRef} className="cert-toolbar no-print">
          <div className="cert-toolbar-left">
            <button
              type="button"
              className="cert-drawer-back-btn"
              onClick={handleClose}
              title="Thu gọn phiếu (Esc)"
              aria-label="Thu gọn phiếu kiểm nghiệm"
            >
              <ArrowRight size={19} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <span className="cert-status-badge">
              <span className="cert-status-main">Phiếu kiểm nghiệm điện tử</span>
              <span className="cert-status-sep" aria-hidden="true">·</span>
              <span className="cert-status-sub">Đã ký số &amp; chứng thực</span>
            </span>
          </div>

          <div className="cert-toolbar-right">
            <button
              type="button"
              className="cert-btn-action"
              onClick={() => void handleDownloadPdf()}
              disabled={downloading}
              title="Tải file PDF phiếu kiểm nghiệm khổ A4 về máy"
            >
              <Download size={15} />
              <span className="cert-btn-text-desktop">{downloading ? "Đang tạo PDF…" : "Tải file PDF"}</span>
              <span className="cert-btn-text-mobile">{downloading ? "Đang tải…" : "Tải PDF"}</span>
            </button>
            <button
              type="button"
              className="cert-btn-print"
              onClick={handlePrint}
              title="In phiếu kiểm nghiệm khổ A4"
              aria-label="In phiếu"
            >
              <Printer size={15} />
              <span className="cert-btn-print-label">In</span>
            </button>
            <button
              type="button"
              className="cert-btn-close"
              onClick={handleClose}
              title="Đóng (Esc)"
              aria-label="Đóng"
            >
              <CloseCircleIcon size={26} />
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            1. BẢN DESKTOP & PRINT: 1 TỜ GIẤY A4 CHUẨN (790 x 1117)
            ═══════════════════════════════════════════════════════════════════════ */}
        <div className="cert-paper-shadow-wrap cert-desktop-only">
          <div ref={paperRef} className="cert-paper">
            <PaperDogEarFold idPrefix="desktop" />

            {/* WATERMARK CHÌM Ở TÂM TỜ GIẤY */}
            <div className="cert-watermark" aria-hidden="true">
              <WatermarkStamp
                topText="HTX SẦU RIÊNG CƯ NÉ"
                centerText={test.result === "fail" ? "KHÔNG ĐẠT CHUẨN" : "BẢN CHỨNG THỰC"}
                bottomText="CHUẨN ISO/IEC 17025"
              />
            </div>

            {/* 1. HEADER CÔNG VĂN CHUẨN NHÀ NƯỚC */}
            <div className="cert-header-row">
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
                  <a
                    href={`/trace/${encodeURIComponent(plotCode)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cert-qr-wrap"
                    style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                    title={`Bấm vào mã QR để mở trang truy xuất nguồn gốc lô ${plotCode}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="Mã QR xác thực phiếu" className="cert-qr-img" />
                    <span className="cert-qr-caption">Quét / Chạm tra cứu</span>
                  </a>
                )}
              </div>
            </div>

            <div className="cert-double-divider" />

            {/* 2. TIÊU ĐỀ PHIẾU XÉT NGHIỆM */}
            <div className="cert-title-section">
              <h1 className="cert-main-title">PHIẾU TRẢ KẾT QUẢ KIỂM NGHIỆM</h1>
              <h2 className="cert-sub-title">CHẤT LƯỢNG NÔNG SẢN VÀ DƯ LƯỢNG THUỐC BVTV</h2>
              <div className="cert-protocol-badge">
                (Theo Nghị định thư GACC Lệnh 248/249 &amp; Quy chuẩn Kỹ thuật Quốc gia VietGAP)
              </div>
            </div>

            {/* 3. THÔNG TIN MẪU THỬ & ĐỐI TƯỢNG KIỂM NGHIỆM */}
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

            {/* 4. BẢNG KẾT QUẢ XÉT NGHIỆM CHI TIẾT */}
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
                    <tr>
                      <td className="text-center">01</td>
                      <td>
                        <strong>Hàm lượng Cadimi (Cd)</strong>
                        <div className="cert-sub-note">Kim loại nặng theo Lệnh 248/249</div>
                      </td>
                      <td>TCVN 7602:2007 (F-AAS)</td>
                      <td className="text-center">mg/kg</td>
                      <td className="text-center font-bold">
                        <span className={test.cdMgKg <= 0.05 ? "val-ok" : "val-exceed"}>{test.cdMgKg}</span>
                      </td>
                      <td className="text-center">
                        &le; 0.05 mg/kg
                        <div className="cert-tag-pass">&le; GACC</div>
                      </td>
                    </tr>

                    <tr>
                      <td className="text-center">02</td>
                      <td>
                        <strong>Tổng dư lượng hóa chất BVTV</strong>
                        <div className="cert-sub-note">Nhóm Phospho &amp; Cúc tổng hợp</div>
                      </td>
                      <td>AOAC 2007.01 (LC-MS/MS)</td>
                      <td className="text-center">mg/kg</td>
                      <td className="text-center font-bold">
                        <span className={test.residueMgKg <= 0.1 ? "val-ok" : "val-exceed"}>{test.residueMgKg}</span>
                      </td>
                      <td className="text-center">
                        &le; 0.10 mg/kg
                        <div className="cert-tag-pass">VietGAP</div>
                      </td>
                    </tr>

                    <tr>
                      <td className="text-center">03</td>
                      <td>
                        <strong>Hoạt chất Chlorpyrifos Ethyl</strong>
                        <div className="cert-sub-note">Danh mục cấm theo TT 10/2024</div>
                      </td>
                      <td>TCVN 8938:2011 (GC-MS)</td>
                      <td className="text-center">mg/kg</td>
                      <td className="text-center font-bold">
                        <span className={isChlorpyrifosPass ? "val-ok" : "val-exceed"}>{chlorpyrifosDisplay}</span>
                      </td>
                      <td className="text-center">
                        KPH (Cấm tuyệt đối)
                        <div className="cert-tag-zero">LOD: 0.01</div>
                      </td>
                    </tr>

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

            {/* 5. PHẦN KẾT LUẬN & ĐÁNH GIÁ */}
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

            {/* 6. PHẦN KÝ TÊN VÀ CON DẤU MỘC ĐỎ PHÁP LÝ */}
            <div className="cert-signatures-section">
              <div className="cert-sign-col">
                <div className="cert-sign-role">Người thực hiện phân tích</div>
                <div className="cert-sign-hint">(Ký và ghi rõ họ tên)</div>

                <div className="cert-handwritten-signature">
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

              <div className="cert-sign-col cert-sign-col-right">
                <div className="cert-sign-date">
                  <em>Đắk Lắk, ngày {day} tháng {month} năm {year}</em>
                </div>
                <div className="cert-sign-role">GIÁM ĐỐC TRUNG TÂM KIỂM NGHIỆM</div>
                <div className="cert-sign-hint">(Ký tên và đóng dấu pháp nhân)</div>

                <div className="cert-stamp-and-sign-area">
                  <div className="cert-director-signature">
                    <svg width="165" height="58" viewBox="0 0 165 58" fill="none">
                      <path
                        d="M32 42 C 42 12, 54 6, 62 28 C 66 38, 72 22, 82 14 C 90 8, 96 32, 108 26 C 118 20, 128 12, 144 22"
                        stroke="#1e3a8a"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M46 46 C 72 40, 112 38, 152 44"
                        stroke="#1e3a8a"
                        strokeWidth="2.1"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <div className="cert-red-stamp" aria-hidden="true">
                    <svg width="118" height="118" viewBox="0 0 130 130" fill="none">
                      <defs>
                        <path id="stampTopArc-desktop" d="M 19,65 A 46,46 0 1,1 111,65" />
                        <path id="stampBottomArc-desktop" d="M 111,65 A 46,46 0 1,1 19,65" />
                      </defs>
                      <circle cx="65" cy="65" r="58" stroke="#d32f2f" strokeWidth="3.2" strokeDasharray="120 2 80 1" opacity="0.88" />
                      <circle cx="65" cy="65" r="54" stroke="#d32f2f" strokeWidth="1.2" opacity="0.85" />
                      <circle cx="65" cy="65" r="35" stroke="#d32f2f" strokeWidth="1.4" opacity="0.85" />

                      <text fill="#d32f2f" fontSize="7.3" fontWeight="800" letterSpacing="0.8">
                        <textPath href="#stampTopArc-desktop" startOffset="50%" textAnchor="middle">
                          SỞ NN &amp; PTNT TỈNH ĐẮK LẮK
                        </textPath>
                      </text>
                      <text fill="#d32f2f" fontSize="6.7" fontWeight="800" letterSpacing="0.5">
                        <textPath href="#stampBottomArc-desktop" startOffset="50%" textAnchor="middle">
                          * TT KIỂM ĐỊNH &amp; KHẢO NGHIỆM CL *
                        </textPath>
                      </text>

                      <polygon
                        points="65,42 68.5,52.5 79.5,52.5 70.5,59 74,69.5 65,63 56,69.5 59.5,59 50.5,52.5 61.5,52.5"
                        fill="#d32f2f"
                        opacity="0.88"
                      />
                      <text x="65" y="76" textAnchor="middle" fill="#d32f2f" fontSize="6.5" fontWeight="900" fontFamily="'Times New Roman', serif">
                        ISO/IEC 17025
                      </text>
                      <text x="65" y="83" textAnchor="middle" fill="#d32f2f" fontSize="5.8" fontWeight="600" fontFamily="'Times New Roman', serif">
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

        {/* ═══════════════════════════════════════════════════════════════════════
            2. BẢN MOBILE (< 760PX): 2 TỜ GIẤY CHUẨN TỶ LỆ A4 (210 : 297) LIỀN MẠCH
               Người dùng lướt dọc trực tiếp từ Trang 1 xuống Trang 2 & hỗ trợ zoom
               (Không mount trên Desktop để tiết kiệm 2x cây DOM + SVG Watermark)
            ═══════════════════════════════════════════════════════════════════════ */}
        {!isDesktop && (
        <div
          ref={mobileStackRef}
          className="cert-mobile-a4-stack no-print"
          style={{ "--sheet-scale": sheetScale } as React.CSSProperties}
        >
          {/* ─── TỜ A4 SỐ 1 / 2: TIÊU ĐỀ, THÔNG TIN MẪU & BẢNG KẾT QUẢ 6 CỘT ─── */}
          <div className="cert-mobile-a4-frame">
            <div className="cert-mobile-a4-canvas">
              <PaperDogEarFold idPrefix="m1" />

              <div className="cert-watermark" aria-hidden="true">
                <WatermarkStamp
                  topText="HTX SẦU RIÊNG CƯ NÉ"
                  centerText={test.result === "fail" ? "KHÔNG ĐẠT CHUẨN" : "BẢN CHỨNG THỰC"}
                  bottomText="CHUẨN ISO/IEC 17025"
                />
              </div>

              <div className="cert-m-top-group">
                <div className="cert-m-header">
                  <div className="cert-m-org">
                    <div className="cert-crest">
                      <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
                        <circle cx="24" cy="24" r="22" fill="#0f2942" stroke="#d97706" strokeWidth="1.5" />
                        <circle cx="24" cy="24" r="18" fill="#1e3a5f" />
                        <path d="M12 28 C10 22 14 16 18 13 C16 17 16 23 18 27 Z" fill="#f59e0b" opacity="0.95" />
                        <path d="M36 28 C38 22 34 16 30 13 C32 17 32 23 30 27 Z" fill="#f59e0b" opacity="0.95" />
                        <polygon points="24,14 26,19 31,19 27,22 29,27 24,24 19,27 21,22 17,19 22,19" fill="#fbbf24" />
                        <path d="M21 28 L27 28 L29 34 L19 34 Z" fill="#38bdf8" opacity="0.9" />
                        <circle cx="24" cy="31" r="1.5" fill="#ffffff" />
                      </svg>
                    </div>
                    <div className="cert-m-org-text">
                      <div className="cert-m-ministry">SỞ NÔNG NGHIỆP &amp; PHÁT TRIỂN NÔNG THÔN TỈNH ĐẮK LẮK</div>
                      <div className="cert-m-center">TRUNG TÂM KIỂM ĐỊNH &amp; KHẢO NGHIỆM CHẤT LƯỢNG NÔNG LÂM THỦY SẢN</div>
                      <div className="cert-m-branch">Phòng Hóa nghiệm &amp; Kiểm soát Dư lượng BVTV (ISO/IEC 17025:2017 - VILAS 238)</div>
                    </div>
                  </div>

                  <div className="cert-m-meta">
                    <div className="cert-m-doc">
                      <span>Số: </span>
                      <strong>LAB-{test.code}/PKN-2024</strong>
                    </div>
                    <div className="cert-m-doc">
                      <span>Mã PUC: </span>
                      <strong>VN-DLK-0028</strong>
                    </div>
                    {qrDataUrl && (
                      <a
                        href={`/trace/${encodeURIComponent(plotCode)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cert-m-qr"
                        style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                        title={`Bấm vào mã QR để mở trang truy xuất nguồn gốc lô ${plotCode}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrDataUrl} alt="Mã QR xác thực phiếu" />
                        <span>Quét / Chạm tra cứu</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="cert-m-divider" />

                <div className="cert-m-title-box">
                  <div className="cert-m-main-title">PHIẾU TRẢ KẾT QUẢ KIỂM NGHIỆM</div>
                  <div className="cert-m-sub-title">CHẤT LƯỢNG NÔNG SẢN VÀ DƯ LƯỢNG THUỐC BVTV</div>
                  <div className="cert-m-protocol">
                    (Theo Nghị định thư GACC Lệnh 248/249 &amp; Quy chuẩn Kỹ thuật Quốc gia VietGAP)
                  </div>
                </div>
              </div>

              {/* Thông tin mẫu thử 2 cột chuẩn A4 */}
              <div className="cert-m-info-grid">
                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Tên chủ hộ / Cơ sở SX:</span>
                  <strong className="cert-m-val">{householdName}</strong>
                </div>
                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Mã vùng trồng / Thửa:</span>
                  <strong className="cert-m-val">VN-DLK-0028 · Thửa {plotCode}</strong>
                </div>

                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Địa chỉ canh tác:</span>
                  <span className="cert-m-val">Xã Ea Tar, H. Cư M&apos;gar, Đắk Lắk</span>
                </div>
                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Đối tượng mẫu thử:</span>
                  <span className="cert-m-val">Sầu riêng tươi (<em>Durio zibethinus</em> - Monthong/Ri6)</span>
                </div>

                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Đơn vị / Người gửi mẫu:</span>
                  <span className="cert-m-val">Ban Kiểm soát Kỹ thuật HTX Nông nghiệp Ea Tar</span>
                </div>
                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Ngày lấy mẫu:</span>
                  <strong className="cert-m-val">{formatDate(test.sampledOn)}</strong>
                </div>

                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Đơn vị kiểm nghiệm (Lab):</span>
                  <span className="cert-m-val">{test.lab}</span>
                </div>
                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Tình trạng mẫu nhận:</span>
                  <span className="cert-m-val">Mẫu đại diện nguyên quả, niêm phong mã {test.code}</span>
                </div>

                <div className="cert-m-info-item cert-m-full">
                  <span className="cert-m-lbl">Yêu cầu kiểm nghiệm:</span>
                  <span className="cert-m-val">Phân tích kim loại nặng Cadimi (Cd), Dư lượng BVTV, Hoạt chất cấm Chlorpyrifos, Phẩm nhuộm Vàng O (Auramine O).</span>
                </div>

                <div className="cert-m-info-item cert-m-full">
                  <span className="cert-m-lbl">Phương pháp xét nghiệm:</span>
                  <span className="cert-m-val">Sắc ký khí &amp; lỏng khối phổ (GC-MS/MS, LC-MS/MS), Quang phổ hấp thụ nguyên tử AAS (AOAC 2007.01, TCVN 7602:2007).</span>
                </div>
              </div>

              {/* Bảng kết quả đủ 6 cột chuẩn A4 */}
              <div className="cert-m-table-wrap">
                <div className="cert-m-sec-heading">KẾT QUẢ THỬ NGHIỆM:</div>
                <table className="cert-m-table">
                  <thead>
                    <tr>
                      <th style={{ width: "6%" }}>STT</th>
                      <th style={{ width: "31%" }}>TÊN CHỈ TIÊU KIỂM NGHIỆM</th>
                      <th style={{ width: "22%" }}>PHƯƠNG PHÁP THỬ</th>
                      <th style={{ width: "10%" }}>ĐƠN VỊ</th>
                      <th style={{ width: "14%" }}>KẾT QUẢ</th>
                      <th style={{ width: "17%" }}>NGƯỠNG CHO PHÉP</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-center">01</td>
                      <td>
                        <strong>Hàm lượng Cadimi (Cd)</strong>
                        <div className="cert-m-note">Kim loại nặng theo Lệnh 248/249</div>
                      </td>
                      <td>TCVN 7602:2007 (F-AAS)</td>
                      <td className="text-center">mg/kg</td>
                      <td className="text-center font-bold">
                        <span className={test.cdMgKg <= 0.05 ? "val-ok" : "val-exceed"}>{test.cdMgKg}</span>
                      </td>
                      <td className="text-center">
                        &le; 0.05 mg/kg
                        <div className="cert-tag-pass">&le; GACC</div>
                      </td>
                    </tr>

                    <tr>
                      <td className="text-center">02</td>
                      <td>
                        <strong>Tổng dư lượng hóa chất BVTV</strong>
                        <div className="cert-m-note">Nhóm Phospho &amp; Cúc tổng hợp</div>
                      </td>
                      <td>AOAC 2007.01 (LC-MS/MS)</td>
                      <td className="text-center">mg/kg</td>
                      <td className="text-center font-bold">
                        <span className={test.residueMgKg <= 0.1 ? "val-ok" : "val-exceed"}>{test.residueMgKg}</span>
                      </td>
                      <td className="text-center">
                        &le; 0.10 mg/kg
                        <div className="cert-tag-pass">VietGAP</div>
                      </td>
                    </tr>

                    <tr>
                      <td className="text-center">03</td>
                      <td>
                        <strong>Hoạt chất Chlorpyrifos Ethyl</strong>
                        <div className="cert-m-note">Danh mục cấm theo TT 10/2024</div>
                      </td>
                      <td>TCVN 8938:2011 (GC-MS)</td>
                      <td className="text-center">mg/kg</td>
                      <td className="text-center font-bold">
                        <span className={isChlorpyrifosPass ? "val-ok" : "val-exceed"}>{chlorpyrifosDisplay}</span>
                      </td>
                      <td className="text-center">
                        KPH (Cấm tuyệt đối)
                        <div className="cert-tag-zero">LOD: 0.01</div>
                      </td>
                    </tr>

                    <tr>
                      <td className="text-center">04</td>
                      <td>
                        <strong>Chất cấm Vàng O (Auramine O)</strong>
                        <div className="cert-m-note">Phẩm nhuộm công nghiệp cấm</div>
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

              {/* Chân trang Tờ 1 */}
              <div className="cert-m-sheet-footer">
                <span>Hồ sơ kiểm nghiệm gốc: LAB-{test.code}/PKN-2024 · Xem tiếp kết luận &amp; chữ ký tại Trang 02</span>
                <strong>Trang 01 / 02</strong>
              </div>
            </div>
          </div>

          {/* ─── TỜ A4 SỐ 2 / 2: ĐÁNH GIÁ KIỂM DỊCH, KẾT LUẬN, CHỮ KÝ & DẤU MỘC ─── */}
          <div className="cert-mobile-a4-frame">
            <div className="cert-mobile-a4-canvas is-continuation">
              <div className="cert-watermark" aria-hidden="true">
                <WatermarkStamp
                  topText="HTX SẦU RIÊNG CƯ NÉ"
                  centerText={test.result === "fail" ? "KHÔNG ĐẠT CHUẨN" : "BẢN CHỨNG THỰC"}
                  bottomText="CHUẨN ISO/IEC 17025"
                />
              </div>

              {/* Running Header gọn gàng nối tiếp từ Trang 1 */}
              <div className="cert-m-running-header">
                <span className="cert-m-running-title">
                  PHIẾU TRẢ KẾT QUẢ KIỂM NGHIỆM <em>(Tiếp theo Trang 01)</em>
                </span>
                <span className="cert-m-running-code">
                  Số: <strong>LAB-{test.code}/PKN-2024</strong> · Mã PUC: <strong>VN-DLK-0028</strong>
                </span>
              </div>

              {/* Bảng đánh giá cảm quan & kiểm dịch thực vật SPS/GACC */}
              <div className="cert-m-sps-section">
                <div className="cert-m-sec-heading">
                  ĐÁNH GIÁ NGOẠI QUAN &amp; KIỂM DỊCH THỰC VẬT (SPS / LỆNH 248 GACC):
                </div>
                <div className="cert-m-sps-grid">
                  <div className="cert-m-sps-cell">
                    <span className="cert-m-sps-lbl">Độ chín &amp; Sinh lý mẫu quả:</span>
                    <strong className="cert-m-sps-val val-ok">Đạt chuẩn thu hoạch (Chất khô &ge; 32%)</strong>
                  </div>
                  <div className="cert-m-sps-cell">
                    <span className="cert-m-sps-lbl">Kiểm dịch sinh vật gây hại:</span>
                    <strong className="cert-m-sps-val val-ok">KPH (Không có rệp sáp, sâu đục hạt)</strong>
                  </div>
                  <div className="cert-m-sps-cell">
                    <span className="cert-m-sps-lbl">Ngoại quan vỏ &amp; Cuống quả:</span>
                    <strong className="cert-m-sps-val">Nguyên vẹn, gai đều, không nấm mốc</strong>
                  </div>
                  <div className="cert-m-sps-cell">
                    <span className="cert-m-sps-lbl">Truy xuất nhật ký canh tác:</span>
                    <strong className="cert-m-sps-val">Đồng bộ 100% nhật ký điện tử PUC</strong>
                  </div>
                </div>
              </div>

              {/* Khối Kết luận & Đối chiếu Quy chuẩn */}
              <div className="cert-m-conclusion-box">
                <div className="cert-m-concl-line">
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

                <div className="cert-m-protocol-row">
                  <div>
                    <span>Mã quy trình kiểm nghiệm: </span>
                    <strong>QT-KNCL-GACC-500/PUC</strong>
                  </div>
                  <div>
                    <span>Sử dụng PXN tham chiếu: </span>
                    <span className="cert-checkbox-group">
                      <span className="cert-box checked">&#9746; Không</span>
                      <span className="cert-box">&#9744; Có</span>
                    </span>
                  </div>
                </div>

                <div className="cert-m-notes">
                  <strong>Chú thích: </strong>
                  <em>
                    (1) KPH: Không phát hiện (dưới giới hạn định lượng LOD = 0.01 mg/kg). (2) Kết quả chỉ có giá trị đối với mẫu thử niêm phong mang mã số {test.code}. (3) Phiếu có giá trị xuất trình cơ quan Hải quan và Kiểm dịch thực vật tại cửa khẩu xuất khẩu.
                  </em>
                </div>

                <div className="cert-m-dispatch">
                  <span>Thời điểm trả kết quả: </span>
                  <strong>{formatDate(test.sampledOn)} — 17h30 · Chủ hộ: {householdName} (Thửa {plotCode})</strong>
                </div>
              </div>

              {/* Khối Ký tên & Con dấu mộc đỏ pháp lý */}
              <div className="cert-m-signatures">
                <div className="cert-sign-col">
                  <div className="cert-m-sign-role">Người thực hiện phân tích</div>
                  <div className="cert-m-sign-hint">(Ký và ghi rõ họ tên)</div>

                  <div className="cert-m-handwritten">
                    <svg width="138" height="48" viewBox="0 0 150 52" fill="none">
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

                  <div className="cert-m-sign-name">KS. Nguyễn Thị Thùy Dương</div>
                  <div className="cert-m-sign-title">Kỹ thuật viên Phân tích Hóa nghiệm</div>
                </div>

                <div className="cert-sign-col cert-sign-col-right">
                  <div className="cert-m-sign-date">
                    <em>Đắk Lắk, ngày {day} tháng {month} năm {year}</em>
                  </div>
                  <div className="cert-m-sign-role">GIÁM ĐỐC TRUNG TÂM KIỂM NGHIỆM</div>
                  <div className="cert-m-sign-hint">(Ký tên và đóng dấu pháp nhân)</div>

                  <div className="cert-m-stamp-area">
                    <div className="cert-director-signature">
                      <svg width="145" height="50" viewBox="0 0 165 58" fill="none">
                        <path
                          d="M32 42 C 42 12, 54 6, 62 28 C 66 38, 72 22, 82 14 C 90 8, 96 32, 108 26 C 118 20, 128 12, 144 22"
                          stroke="#1e3a8a"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M46 46 C 72 40, 112 38, 152 44"
                          stroke="#1e3a8a"
                          strokeWidth="2.1"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>

                    <div className="cert-m-red-stamp" aria-hidden="true">
                      <svg width="104" height="104" viewBox="0 0 130 130" fill="none">
                        <defs>
                          <path id="stampTopArc-m2" d="M 19,65 A 46,46 0 1,1 111,65" />
                          <path id="stampBottomArc-m2" d="M 111,65 A 46,46 0 1,1 19,65" />
                        </defs>
                        <circle cx="65" cy="65" r="58" stroke="#d32f2f" strokeWidth="3.2" strokeDasharray="120 2 80 1" opacity="0.88" />
                        <circle cx="65" cy="65" r="54" stroke="#d32f2f" strokeWidth="1.2" opacity="0.85" />
                        <circle cx="65" cy="65" r="35" stroke="#d32f2f" strokeWidth="1.4" opacity="0.85" />

                        <text fill="#d32f2f" fontSize="7.3" fontWeight="800" letterSpacing="0.8">
                          <textPath href="#stampTopArc-m2" startOffset="50%" textAnchor="middle">
                            SỞ NN &amp; PTNT TỈNH ĐẮK LẮK
                          </textPath>
                        </text>
                        <text fill="#d32f2f" fontSize="6.7" fontWeight="800" letterSpacing="0.5">
                          <textPath href="#stampBottomArc-m2" startOffset="50%" textAnchor="middle">
                            * TT KIỂM ĐỊNH &amp; KHẢO NGHIỆM CL *
                          </textPath>
                        </text>

                        <polygon
                          points="65,42 68.5,52.5 79.5,52.5 70.5,59 74,69.5 65,63 56,69.5 59.5,59 50.5,52.5 61.5,52.5"
                          fill="#d32f2f"
                          opacity="0.88"
                        />
                        <text x="65" y="76" textAnchor="middle" fill="#d32f2f" fontSize="6.5" fontWeight="900" fontFamily="'Times New Roman', serif">
                          ISO/IEC 17025
                        </text>
                        <text x="65" y="83" textAnchor="middle" fill="#d32f2f" fontSize="5.8" fontWeight="600" fontFamily="'Times New Roman', serif">
                          SỐ: 08-VILAS 238
                        </text>
                      </svg>
                    </div>
                  </div>

                  <div className="cert-m-sign-name">TS. Trần Gia Phú</div>
                  <div className="cert-m-sign-title">Giám đốc Trung tâm Kiểm nghiệm</div>
                </div>
              </div>

              {/* Footer Mã vạch & Bảo mật Trang 2 */}
              <div className="cert-m-footer">
                <div className="cert-barcode-box">
                  <svg width="165" height="22" viewBox="0 0 200 28" fill="none">
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
                  <div className="cert-m-barcode-val">*PUC-{test.code}-ISO17025*</div>
                </div>

                <div className="cert-m-hash">
                  <div>
                    <span>Mã bảo mật: </span>
                    <code>PUC-SHA256-{test.code}-CERT-OK</code>
                  </div>
                  <div className="cert-m-hash-bottom">
                    <span>Cổng DVC Quốc gia: puc.mard.gov.vn</span>
                    <strong>Trang 02 / 02</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* CSS RIÊNG DÀNH CHO TỜ GIẤY PHIẾU XÉT NGHIỆM VÀ KHỔ IN A4 */}
      <style jsx>{`
        /* ── Backdrop mờ nền đen (không dùng backdrop-filter để cuộn 60fps không nóng GPU) ── */
        .cert-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(15, 23, 42, 0.82);
          overflow-y: auto;
          overflow-x: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x pan-y pinch-zoom;
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
          gap: 12px;
          padding: 10px 16px;
          background: #1e293b;
          color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
        }

        .cert-toolbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }

        .cert-drawer-back-btn {
          display: none;
        }

        .cert-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #34d399;
          min-width: 0;
        }

        .cert-toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .cert-btn-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 7px 14px;
          background: #dfe9f8;
          color: #0084ff;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
          cursor: pointer;
          box-shadow: none;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .cert-btn-text-mobile {
          display: none;
        }

        .cert-btn-action:hover:not(:disabled) {
          background: #d0dff5;
          color: #006ee6;
        }

        .cert-btn-action:disabled {
          opacity: 0.72;
          cursor: wait;
        }

        .cert-btn-print {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 7px 12px;
          background: #dfe9f8;
          color: #0084ff;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
          cursor: pointer;
          box-shadow: none;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .cert-btn-print:hover {
          background: #d0dff5;
          color: #006ee6;
        }

        .cert-btn-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          flex-shrink: 0;
          border-radius: 50%;
          background: transparent;
          color: #ffffff;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.15s ease;
        }

        .cert-btn-close:hover {
          background: transparent;
          opacity: 0.78;
          transform: rotate(90deg);
        }

        /* ── TỜ GIẤY CHUẨN A4 VỚI GÓC GẤP TRẮNG 3D (DESKTOP) ── */
        .cert-paper-shadow-wrap {
          --fold-size: 68px;
          --fold-box: 96px;
          position: relative;
          filter: drop-shadow(0 12px 26px rgba(15, 23, 42, 0.24));
        }

        .cert-paper {
          position: relative;
          background: linear-gradient(155deg, #ffffff 0%, #fcfdfe 68%, #f4f6f9 100%);
          color: #0f172a;
          border-radius: 14px;
          padding: 40px 44px 32px;
          clip-path: polygon(
            0 0,
            calc(100% - var(--fold-size)) 0,
            100% var(--fold-size),
            100% 100%,
            0 100%
          );
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Times New Roman", serif;
          line-height: 1.45;
          overflow: hidden;
        }

        :global(.cert-paper-fold) {
          position: absolute;
          top: 0;
          right: 0;
          width: var(--fold-box);
          height: var(--fold-box);
          pointer-events: none;
          z-index: 10;
        }

        .cert-watermark {
          position: absolute;
          top: 52%;
          left: 50%;
          width: 340px;
          height: 302px;
          transform: translate(-50%, -50%) rotate(-16deg);
          pointer-events: none;
          user-select: none;
          color: #dc2626;
          opacity: 0.105;
          z-index: 1;
        }

        .cert-mobile-a4-canvas .cert-watermark {
          width: 228px;
          height: 202px;
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
          padding-right: 42px;
        }

        .cert-doc-number,
        .cert-puc-code {
          font-size: 11.5px;
          color: #334155;
        }

        .cert-doc-number strong,
        .cert-puc-code strong {
          color: #0f2942;
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
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
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
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
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
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

        /* ── BẢN 2 TRANG A4 LIỀN MẠCH TRÊN MOBILE (MẶC ĐỊNH ẨN TRÊN DESKTOP) ── */
        .cert-mobile-a4-stack {
          display: none;
        }

        /* ── MÀN HÌNH LỚN / LAPTOP: NGĂN KÉO TRƯỢT DỌC TỪ CẠNH PHẢI ── */
        @keyframes certDrawerSlideIn {
          from { transform: translate3d(100%, 0, 0); }
          to { transform: translate3d(0, 0, 0); }
        }

        @media screen and (min-width: 760px) {
          .cert-modal-backdrop {
            padding: 0;
            justify-content: flex-end;
            align-items: stretch;
            overflow: hidden;
            background: rgba(15, 23, 42, 0.44);
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
          }

          .cert-modal-container {
            width: min(856px, 94vw);
            max-width: min(856px, 94vw);
            height: 100vh;
            height: 100dvh;
            margin: 0;
            gap: 0;
            background: #f1f5f9;
            box-shadow: -16px 0 48px rgba(15, 23, 42, 0.18), -1px 0 0 rgba(15, 23, 42, 0.06);
            overflow: hidden;
            animation: certDrawerSlideIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }

          .cert-toolbar {
            flex-shrink: 0;
            padding: 16px 24px;
            background: #ffffff;
            color: #0f172a;
            border-radius: 0;
            border-bottom: 1px solid rgba(15, 23, 42, 0.08);
            box-shadow: none;
          }

          .cert-drawer-back-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            padding: 0;
            border: none;
            border-radius: 10px;
            background: #f2f4f7;
            color: #111827;
            cursor: pointer;
            flex-shrink: 0;
            transition: background-color 0.16s ease, transform 0.16s cubic-bezier(0.22, 1, 0.36, 1);
          }

          .cert-drawer-back-btn svg {
            transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
          }

          .cert-drawer-back-btn:hover {
            background: #e5e8ee;
            color: #0f172a;
          }

          .cert-drawer-back-btn:hover svg {
            transform: translateX(2px);
          }

          .cert-drawer-back-btn:active {
            transform: scale(0.94);
            background: #dce0e8;
          }

          .cert-status-badge {
            font-size: 14px;
            color: #0f172a;
          }

          .cert-status-main {
            font-family: var(--font-display-stack, inherit);
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.02em;
            text-transform: uppercase;
            color: #0f172a;
          }

          .cert-status-sep {
            color: #cbd5e1;
          }

          .cert-status-sub {
            font-size: 13px;
            font-weight: 600;
            color: #166534;
          }

          .cert-btn-close {
            display: none;
          }

          .cert-paper-shadow-wrap.cert-desktop-only {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            overflow-x: auto;
            padding: 22px 24px 36px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            scrollbar-width: thin;
            scrollbar-color: rgba(15, 23, 42, 0.16) transparent;
          }
        }

        /* ── RESPONSIVE MOBILE / TABLET NHỎ (< 760px): HIỂN THỊ 2 TỜ GIẤY ĐÚNG TỶ LỆ A4 (210 : 297) LIỀN MẠCH ── */
        @media (max-width: 759px) {
          .cert-modal-backdrop {
            padding: 10px 8px 22px;
          }

          .cert-toolbar {
            padding: 9px 11px;
            gap: 10px;
            border-radius: 12px;
          }

          .cert-status-badge {
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
            line-height: 1.2;
          }

          .cert-status-main {
            font-size: 12px;
            font-weight: 700;
            color: #34d399;
            white-space: nowrap;
          }

          .cert-status-sep {
            display: none;
          }

          .cert-status-sub {
            font-size: 10.5px;
            font-weight: 500;
            color: #94a3b8;
            white-space: nowrap;
          }

          .cert-toolbar-right {
            gap: 7px;
          }

          .cert-btn-action {
            padding: 7px 11px;
            font-size: 11.5px;
            border-radius: 8px;
            gap: 5px;
          }

          .cert-btn-text-desktop {
            display: none;
          }

          .cert-btn-text-mobile {
            display: inline;
          }

          .cert-btn-print {
            padding: 7px 9px;
            font-size: 11.5px;
          }

          .cert-btn-print-label {
            display: none;
          }

          .cert-btn-close {
            width: 32px;
            height: 32px;
            border-radius: 8px;
          }

          /* Ẩn bản 1 trang desktop, bật bản 2 tờ A4 liền mạch trên mobile */
          .cert-desktop-only {
            display: none;
          }

          .cert-mobile-a4-stack {
            display: flex;
            flex-direction: column;
            gap: 14px;
            width: 100%;
            max-width: 540px;
            margin: 0 auto;
          }

          /* Khung bao mỗi tờ giấy khóa đúng chuẩn tỷ lệ A4 (210 : 297) */
          .cert-mobile-a4-frame {
            position: relative;
            width: 100%;
            aspect-ratio: 210 / 297;
            filter: drop-shadow(0 10px 22px rgba(15, 23, 42, 0.24));
          }

          /* Tờ giấy A4 gốc kích thước chuẩn 520 x 735.43 (210 : 297) được scale khớp 100% khung */
          .cert-mobile-a4-canvas {
            --fold-size: 46px;
            --fold-box: 65px;
            position: absolute;
            top: 0;
            left: 0;
            width: 520px;
            height: 735.43px;
            transform: scale(var(--sheet-scale, 0.68));
            transform-origin: top left;
            background: linear-gradient(155deg, #ffffff 0%, #fcfdfe 68%, #f4f6f9 100%);
            color: #0f172a;
            border-radius: 12px;
            padding: 22px 24px 16px;
            clip-path: polygon(
              0 0,
              calc(100% - var(--fold-size)) 0,
              100% var(--fold-size),
              100% 100%,
              0 100%
            );
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Times New Roman", serif;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
          }

          .cert-mobile-a4-canvas.is-continuation {
            clip-path: none;
          }

          .cert-m-running-header {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding-bottom: 7px;
            border-bottom: 1px solid #cbd5e1;
            font-size: 9px;
            color: #475569;
          }

          .cert-m-running-title {
            font-weight: 800;
            color: #0f2942;
            letter-spacing: 0.02em;
          }

          .cert-m-running-title em {
            font-weight: 500;
            color: #64748b;
          }

          .cert-m-running-code {
            font-size: 8.8px;
            color: #475569;
            white-space: nowrap;
          }

          .cert-m-running-code strong {
            color: #0f2942;
            font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
            font-variant-numeric: tabular-nums;
          }

          .cert-m-top-group {
            position: relative;
            z-index: 2;
          }

          .cert-m-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
          }

          .cert-m-org {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            flex: 1;
            min-width: 0;
          }

          .cert-m-org-text {
            display: flex;
            flex-direction: column;
            gap: 1.5px;
          }

          .cert-m-ministry {
            font-size: 8.8px;
            font-weight: 700;
            color: #475569;
            letter-spacing: 0.02em;
          }

          .cert-m-center {
            font-size: 10.3px;
            font-weight: 900;
            color: #0f2942;
            line-height: 1.22;
            text-transform: uppercase;
          }

          .cert-m-branch {
            font-size: 8.8px;
            font-style: italic;
            color: #64748b;
          }

          .cert-m-meta {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 1.5px;
            flex-shrink: 0;
            padding-right: 30px;
          }

          .cert-m-doc {
            font-size: 9.2px;
            color: #334155;
            white-space: nowrap;
          }

          .cert-m-doc strong {
            color: #0f2942;
            font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
            font-variant-numeric: tabular-nums;
            font-size: 9.6px;
          }

          .cert-m-qr {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-top: 2px;
          }

          .cert-m-qr img {
            width: 40px;
            height: 40px;
            border: 1px solid #e2e8f0;
            padding: 1.5px;
            background: #ffffff;
          }

          .cert-m-qr span {
            font-size: 7.2px;
            color: #64748b;
            margin-top: 1px;
          }

          .cert-m-divider {
            height: 3px;
            border-top: 1.4px solid #0f2942;
            border-bottom: 0.8px solid #0f2942;
            margin: 8px 0 9px;
          }

          .cert-m-title-box {
            text-align: center;
          }

          .cert-m-main-title {
            font-size: 16px;
            font-weight: 900;
            color: #1e3a8a;
            letter-spacing: 0.03em;
            line-height: 1.2;
          }

          .cert-m-sub-title {
            font-size: 11px;
            font-weight: 800;
            color: #0f2942;
            margin-top: 2px;
            letter-spacing: 0.015em;
          }

          .cert-m-protocol {
            font-size: 8.8px;
            font-style: italic;
            color: #475569;
            margin-top: 2px;
          }

          /* Lưới thông tin mẫu 2 cột chuẩn A4 */
          .cert-m-info-grid {
            position: relative;
            z-index: 2;
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 12px;
            row-gap: 4.5px;
            font-size: 9.8px;
            line-height: 1.34;
            background: rgba(248, 250, 252, 0.72);
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 10px;
          }

          .cert-m-info-item {
            display: flex;
            align-items: baseline;
            gap: 4px;
            min-width: 0;
          }

          .cert-m-full {
            grid-column: 1 / -1;
            padding-top: 2px;
            border-top: 1px dashed #e2e8f0;
          }

          .cert-m-lbl {
            font-weight: 600;
            color: #334155;
            flex-shrink: 0;
          }

          .cert-m-val {
            color: #0f172a;
          }

          /* Bảng kết quả 6 cột chuẩn A4 trên Tờ 1 */
          .cert-m-table-wrap {
            position: relative;
            z-index: 2;
          }

          .cert-m-sec-heading {
            font-size: 10.5px;
            font-weight: 800;
            color: #0f2942;
            text-transform: uppercase;
            margin-bottom: 4px;
          }

          .cert-m-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.4px;
            border: 1px solid #334155;
            background: rgba(255, 255, 255, 0.85);
          }

          .cert-m-table th,
          .cert-m-table td {
            border: 1px solid #475569;
            padding: 4.5px 5px;
            vertical-align: middle;
            line-height: 1.25;
          }

          .cert-m-table th {
            background: #f1f5f9;
            color: #0f2942;
            font-weight: 800;
            text-align: center;
            font-size: 8.6px;
            letter-spacing: 0.01em;
          }

          .cert-m-note {
            font-size: 8.2px;
            color: #64748b;
            font-style: italic;
            margin-top: 1px;
          }

          .cert-m-sheet-footer {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid #cbd5e1;
            padding-top: 6px;
            font-size: 8.8px;
            color: #64748b;
          }

          .cert-m-sheet-footer strong {
            color: #0f2942;
            font-weight: 800;
          }

          /* Tờ 2: Bảng đánh giá cảm quan & kiểm dịch SPS */
          .cert-m-sps-section {
            position: relative;
            z-index: 2;
          }

          .cert-m-sps-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            background: #f8fafc;
            overflow: hidden;
          }

          .cert-m-sps-cell {
            padding: 7px 9px;
            border-right: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 9.4px;
          }

          .cert-m-sps-cell:nth-child(2n) {
            border-right: none;
          }

          .cert-m-sps-cell:nth-child(n + 3) {
            border-bottom: none;
          }

          .cert-m-sps-lbl {
            font-size: 8.6px;
            color: #64748b;
            font-weight: 600;
          }

          .cert-m-sps-val {
            font-size: 9.6px;
            color: #0f2942;
          }

          /* Tờ 2: Khối kết luận */
          .cert-m-conclusion-box {
            position: relative;
            z-index: 2;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px 12px;
            font-size: 9.8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .cert-m-concl-line {
            font-size: 10.4px;
            line-height: 1.38;
          }

          .cert-m-protocol-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px dashed #cbd5e1;
            padding-top: 5px;
            color: #334155;
            font-size: 9.4px;
          }

          .cert-m-notes {
            font-size: 9px;
            color: #64748b;
            line-height: 1.38;
          }

          .cert-m-dispatch {
            font-size: 9.4px;
            color: #334155;
          }

          /* Tờ 2: Khối chữ ký & dấu mộc đỏ */
          .cert-m-signatures {
            position: relative;
            z-index: 2;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            align-items: end;
            padding: 4px 0;
          }

          .cert-m-sign-date {
            font-size: 9.2px;
            color: #475569;
            margin-bottom: 2px;
          }

          .cert-m-sign-role {
            font-size: 10.2px;
            font-weight: 800;
            color: #0f2942;
            text-transform: uppercase;
          }

          .cert-m-sign-hint {
            font-size: 8.8px;
            font-style: italic;
            color: #64748b;
          }

          .cert-m-handwritten {
            height: 62px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 4px 0;
          }

          .cert-m-stamp-area {
            position: relative;
            height: 68px;
            width: 170px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 4px 0;
          }

          .cert-m-red-stamp {
            position: absolute;
            top: -16px;
            left: 6px;
            z-index: 3;
            pointer-events: none;
            transform: rotate(-7deg);
            mix-blend-mode: multiply;
          }

          .cert-m-sign-name {
            font-size: 11.2px;
            font-weight: 800;
            color: #0f2942;
          }

          .cert-m-sign-title {
            font-size: 9.2px;
            color: #64748b;
          }

          /* Tờ 2: Footer Barcode & Bảo mật */
          .cert-m-footer {
            position: relative;
            z-index: 2;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
            font-size: 8.8px;
            color: #64748b;
          }

          .cert-m-barcode-val {
            font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
            font-variant-numeric: tabular-nums;
            font-size: 8.5px;
            letter-spacing: 0.08em;
            color: #0f2942;
          }

          .cert-m-hash {
            text-align: right;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .cert-m-hash code {
            background: #f1f5f9;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 8.5px;
            color: #0f2942;
          }

          .cert-m-hash-bottom {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
          }

          .cert-m-hash-bottom strong {
            color: #0f2942;
            font-weight: 800;
          }
        }

        /* Màn hình hẹp 320px–380px: thu gọn thanh công cụ để không tràn hoặc che nút tải PDF */
        @media (max-width: 380px) {
          .cert-toolbar {
            padding: 8px 9px;
            gap: 6px;
          }

          .cert-status-sub {
            display: none;
          }

          .cert-toolbar-right {
            gap: 5px;
          }

          .cert-btn-action {
            padding: 6px 9px;
            font-size: 11px;
          }

          .cert-btn-print {
            padding: 6px 8px;
          }
        }

        /* Thiết bị yếu (data-perf="lite"): tắt drop-shadow và mix-blend-mode để cuộn mượt không nóng máy */
        :global(html[data-perf="lite"]) .cert-paper-shadow-wrap,
        :global(html[data-perf="lite"]) .cert-mobile-a4-frame {
          filter: none;
        }

        :global(html[data-perf="lite"]) .cert-red-stamp,
        :global(html[data-perf="lite"]) .cert-m-red-stamp {
          mix-blend-mode: normal;
        }

        /* ── CHẾ ĐỘ IN ẤN CHUẨN A4 (PRINT MEDIA) ──
           Chỉ in đúng 1 tờ phiếu bản desktop (thiết kế 790px ≈ khổ 210mm), ẩn toàn bộ phần còn lại của trang. */
        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {
          :global(html),
          :global(body) {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            background: #ffffff !important;
          }

          :global(body > *:not(.cert-print-root)) {
            display: none !important;
          }

          .cert-modal-backdrop {
            position: static !important;
            inset: auto !important;
            z-index: auto !important;
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            background: none !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            animation: none !important;
          }

          .cert-modal-container {
            display: block !important;
            width: 210mm !important;
            max-width: none !important;
            margin: 0 !important;
            transform: none !important;
          }

          .no-print,
          .cert-mobile-a4-stack {
            display: none !important;
          }

          .cert-desktop-only {
            display: block !important;
            filter: none !important;
          }

          .cert-paper {
            position: relative !important;
            width: 210mm !important;
            max-width: none !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            clip-path: none !important;
            background: #ffffff !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Giữ nguyên màu con dấu, bảng kết quả và nền khi in / lưu PDF */
          .cert-paper,
          .cert-paper * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
