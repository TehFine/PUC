"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { ArrowRight, Download, Printer } from "@/components/ui/PublicIcon";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { WatermarkStamp } from "@/components/ui/WatermarkStamp";
import { isLowEndDevice } from "@/lib/network";
import { useBackLayer } from "@/lib/back-navigation";
import { lockRootScroll } from "@/lib/scroll-lock";
import { triggerBlobDownload } from "@/utils/download";
import { formatDate } from "@/utils/format";
import { isSafeExternalHttpsUrl, isSafeMediaUrl } from "@/utils/url-safety";
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

/** Kết xuất tờ giấy A4 (.cert-paper) sang file PDF độ phân giải cao và tải thẳng về máy, không cắt ngang bảng hay khung nội dung. */
async function exportCertPaperToPdf(paperEl: HTMLElement, fileName: string): Promise<void> {
  const width = 790;
  const a4Height = 1117;
  const scale = isLowEndDevice() ? 1.5 : 2;
  const outW = Math.round(width * scale);
  const outH = Math.round(a4Height * scale);

  const clone = paperEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".no-print").forEach((node) => node.remove());

  // Đo chiều cao thực tế của nội dung tờ phiếu ở đúng bề rộng chuẩn 790px (kể cả khi đang mở trên thiết bị di động)
  let naturalHeight = a4Height;
  if (typeof document !== "undefined") {
    const measureHost = document.createElement("div");
    measureHost.style.cssText =
      `position:fixed;left:-99999px;top:0;width:${width}px;visibility:hidden;pointer-events:none;z-index:-1;background:#ffffff;`;
    const measureClone = clone.cloneNode(true) as HTMLElement;
    measureClone.style.width = `${width}px`;
    measureClone.style.minHeight = "0";
    measureClone.style.height = "auto";
    measureClone.style.maxHeight = "none";
    measureClone.style.overflow = "visible";
    measureHost.appendChild(measureClone);
    document.body.appendChild(measureHost);
    const measured = Math.ceil(measureClone.scrollHeight);
    document.body.removeChild(measureHost);
    if (measured > 0) {
      naturalHeight = Math.max(a4Height, measured);
    }
  }

  const renderH = Math.round(naturalHeight * scale);
  const styles = collectEmbeddedCssForSvg();

  const svgNS = "http://www.w3.org/2000/svg";
  const xhtmlNS = "http://www.w3.org/1999/xhtml";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", String(outW));
  svg.setAttribute("height", String(renderH));
  svg.setAttribute("viewBox", `0 0 ${width} ${naturalHeight}`);

  const styleEl = document.createElementNS(svgNS, "style");
  styleEl.textContent = `${styles}
    .cert-paper {
      width: ${width}px !important;
      min-height: ${naturalHeight}px !important;
      height: ${naturalHeight}px !important;
      margin: 0 !important;
      border: none !important;
      box-shadow: none !important;
      clip-path: none !important;
      border-radius: 0 !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
      overflow: visible !important;
    }
  `;
  svg.appendChild(styleEl);

  const fo = document.createElementNS(svgNS, "foreignObject");
  fo.setAttribute("x", "0");
  fo.setAttribute("y", "0");
  fo.setAttribute("width", String(width));
  fo.setAttribute("height", String(naturalHeight));

  const wrapper = document.createElementNS(xhtmlNS, "div");
  wrapper.setAttribute("xmlns", xhtmlNS);
  wrapper.setAttribute(
    "style",
    `width:${width}px;height:${naturalHeight}px;background:#ffffff;overflow:visible;margin:0;padding:0;`,
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
    const fitRatio = naturalHeight > a4Height ? a4Height / naturalHeight : 1;
    const drawW = Math.round(outW * fitRatio);
    const drawH = Math.round(renderH * fitRatio);
    const offsetX = Math.round((outW - drawW) / 2);
    ctx.drawImage(img, offsetX, 0, drawW, drawH);

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
  labAccreditationCode?: string | null;
  externalVerifyCode?: string | null;
  externalVerifyUrl?: string | null;
  scanUrl?: string | null;
  reportHash?: string | null;
}

interface Props {
  test: LabTestCertificateItem;
  onClose: () => void;
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
  const plotCode = test.plotCode || test.code || "-";
  const safeExternalUrl = isSafeExternalHttpsUrl(test.externalVerifyUrl)
    ? test.externalVerifyUrl.trim()
    : null;
  const safeScanUrl = isSafeMediaUrl(test.scanUrl) ? test.scanUrl : null;
  const safeReportHash =
    typeof test.reportHash === "string" && /^[a-fA-F0-9]{16,128}$/.test(test.reportHash.trim())
      ? test.reportHash.trim()
      : null;

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

  useBackLayer(true, handleClose);

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

  // Năm hồ sơ thực tế trích từ ngày lấy mẫu
  const dateObj = test.sampledOn ? new Date(test.sampledOn) : new Date();
  const year = !isNaN(dateObj.getFullYear())
    ? String(dateObj.getFullYear())
    : String(new Date().getFullYear());

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
              <span className="cert-status-main">Phiếu kiểm nghiệm</span>
            </span>
          </div>

          <div className="cert-toolbar-right">
            {safeScanUrl && (
              <a
                href={safeScanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cert-btn-action"
                style={{ textDecoration: "none" }}
                title="Mở tệp scan PDF gốc do phòng thử nghiệm phát hành"
              >
                <span className="cert-btn-text-desktop">Bản scan gốc</span>
                <span className="cert-btn-text-mobile">Scan gốc</span>
              </a>
            )}
            {safeExternalUrl && (
              <a
                href={safeExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="cert-btn-action"
                style={{ textDecoration: "none" }}
                title={
                  test.externalVerifyCode
                    ? `Đối chiếu mã ${test.externalVerifyCode} trên cổng phòng kiểm nghiệm độc lập`
                    : "Mở cổng tra cứu chéo của phòng kiểm nghiệm độc lập"
                }
              >
                <span className="cert-btn-text-desktop">Cổng Lab độc lập</span>
                <span className="cert-btn-text-mobile">Cổng Lab</span>
              </a>
            )}
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
            1. BẢN DESKTOP & PRINT: 1 TỜ GIẤY A4 CHUẨN PHẲNG (790 x 1117)
            ═══════════════════════════════════════════════════════════════════════ */}
        <div className="cert-paper-shadow-wrap cert-desktop-only">
          <div ref={paperRef} className="cert-paper">
            {/* WATERMARK CHÌM Ở TÂM TỜ GIẤY */}
            <div className="cert-watermark" aria-hidden="true">
              <WatermarkStamp
                topText="HTX NÔNG NGHIỆP CƯ NÉ"
                centerText={test.result === "fail" ? "KHÔNG ĐẠT CHUẨN" : "BẢN TRÍCH XUẤT HỆ THỐNG"}
                bottomText="ĐỐI CHIẾU BẢN SCAN LAB"
              />
            </div>

            {/* 1. HEADER ĐƠN VỊ TRÍCH XUẤT HỆ THỐNG */}
            <div className="cert-header-row">
              <div className="cert-org-col">
                <div className="cert-org-text">
                  <div className="cert-ministry">HỆ THỐNG QUẢN LÝ VÙNG TRỒNG VÀ TRUY XUẤT NGUỒN GỐC PUC</div>
                  <div className="cert-center-name">HỢP TÁC XÃ NÔNG NGHIỆP CƯ NÉ - HUYỆN KRÔNG BÚK, TỈNH ĐẮK LẮK</div>
                  <div className="cert-lab-branch">
                    Đơn vị thử nghiệm thực hiện: {test.lab}, {test.labAccreditationCode || "Chuẩn ISO/IEC 17025"}
                  </div>
                </div>
              </div>

              <div className="cert-meta-col">
                <div className="cert-doc-number">
                  <span>Số hồ sơ: </span>
                  <strong>LAB-{test.code}/PKN-{year}</strong>
                </div>
                <div className="cert-puc-code">
                  <span>Mã PUC: </span>
                  <strong>VN-DLOR-0086</strong>
                </div>
                {qrDataUrl && (
                  <a
                    href={`/trace/${encodeURIComponent(plotCode)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cert-qr-wrap"
                    style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                    title={`Bấm vào mã QR để mở trang truy xuất nguồn gốc thửa ${plotCode}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="Mã QR tra cứu truy xuất" className="cert-qr-img" />
                    <span className="cert-qr-caption">Quét tra cứu thửa</span>
                  </a>
                )}
              </div>
            </div>

            <div className="cert-double-divider" />

            {/* 2. TIÊU ĐỀ PHIẾU TRÍCH XUẤT */}
            <div className="cert-title-section">
              <h1 className="cert-main-title">PHIẾU TRÍCH XUẤT KẾT QUẢ KIỂM NGHIỆM</h1>
              <h2 className="cert-sub-title">CHẤT LƯỢNG NÔNG SẢN VÀ DƯ LƯỢNG THUỐC BVTV</h2>
              <div className="cert-protocol-badge">
                (Theo Nghị định thư GACC Lệnh 248/249 và Quy chuẩn Kỹ thuật Quốc gia VietGAP)
              </div>
            </div>

            {/* 3. THÔNG TIN MẪU THỬ & ĐỐI TƯỢNG KIỂM NGHIỆM */}
            <div className="cert-info-block">
              <div className="cert-info-grid">
                <div className="cert-info-row">
                  <span className="cert-lbl">Tên chủ hộ sản xuất:</span>
                  <span className="cert-val cert-bold">{householdName}</span>
                </div>
                <div className="cert-info-row">
                  <span className="cert-lbl">Mã số vùng trồng (PUC) và Thửa:</span>
                  <span className="cert-val cert-bold">VN-DLOR-0086 - Thửa {plotCode}</span>
                </div>

                <div className="cert-info-row">
                  <span className="cert-lbl">Địa chỉ canh tác:</span>
                  <span className="cert-val">Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk</span>
                </div>
                <div className="cert-info-row">
                  <span className="cert-lbl">Đối tượng mẫu thử:</span>
                  <span className="cert-val">Quả sầu riêng tươi (<em>Durio zibethinus</em> - Monthong, Ri6)</span>
                </div>

                <div className="cert-info-row">
                  <span className="cert-lbl">Đơn vị quản lý gửi mẫu:</span>
                  <span className="cert-val">Ban Kiểm soát Kỹ thuật HTX Nông nghiệp Cư Né</span>
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
                  <span className="cert-lbl">Mã nhận diện mẫu thử:</span>
                  <span className="cert-val">Mẫu đại diện nguyên quả, mã hồ sơ {test.code}</span>
                </div>

                <div className="cert-info-row cert-col-full">
                  <span className="cert-lbl">Chỉ tiêu theo dõi:</span>
                  <span className="cert-val">Kim loại nặng Cadimi (Cd), Tổng dư lượng BVTV, Hoạt chất cấm Chlorpyrifos, Phẩm nhuộm Vàng O (Auramine O).</span>
                </div>

                <div className="cert-info-row cert-col-full">
                  <span className="cert-lbl">Phương pháp phân tích tham chiếu:</span>
                  <span className="cert-val">Sắc ký khí và lỏng khối phổ (GC-MS/MS, LC-MS/MS), Quang phổ hấp thụ nguyên tử AAS (AOAC 2007.01, TCVN 7602:2007).</span>
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
                <span className="cert-concl-title">KẾT LUẬN ĐỐI CHIẾU NGƯỠNG: </span>
                {isPass ? (
                  <strong className="cert-concl-pass">
                    Mẫu sầu riêng ĐẠT NGƯỠNG AN TOÀN VỆ SINH THỰC PHẨM theo tiêu chí theo dõi vùng trồng xuất khẩu sang thị trường Trung Quốc (Lệnh 248/249 GACC và tiêu chuẩn VietGAP).
                  </strong>
                ) : (
                  <strong className="cert-concl-fail">
                    MẪU KIỂM NGHIỆM KHÔNG ĐẠT NGƯỠNG AN TOÀN. Tồn tại chỉ số vượt mức cho phép, tạm dừng thu hoạch tại thửa {plotCode} để xử lý khoanh vùng.
                  </strong>
                )}
              </div>

              <div className="cert-notes-line">
                <span className="cert-notes-lbl">Ghi chú: </span>
                <em>
                  (1) KPH: Không phát hiện (dưới giới hạn định lượng LOD = 0.01 mg/kg). (2) Số liệu trên được trích xuất nguyên trạng từ hồ sơ mẫu {test.code} ghi nhận trên hệ thống PUC của HTX Nông nghiệp Cư Né.
                </em>
              </div>

              <div className="cert-dispatch-time">
                <span>Ngày lấy mẫu ghi nhận: </span>
                <strong>{formatDate(test.sampledOn)}</strong>
              </div>
            </div>

            {/* 6. KHỐI XÁC THỰC HỒ SƠ GỐC (KHÔNG GIẢ LẬP CHỮ KÝ HOẶC CON DẤU CƠ QUAN NHÀ NƯỚC) */}
            <div className="cert-verify-summary-box">
              <div className="cert-verify-summary-head">
                THÔNG TIN ĐỐI CHIẾU PHIẾU KẾT QUẢ GỐC CỦA PHÒNG THỬ NGHIỆM
              </div>
              <div className="cert-verify-summary-grid">
                <div className="cert-verify-summary-item">
                  <span className="cert-verify-lbl">Đơn vị thử nghiệm thực hiện:</span>
                  <strong className="cert-verify-val">
                    {test.lab}, {test.labAccreditationCode || "ISO/IEC 17025"}
                  </strong>
                </div>
                <div className="cert-verify-summary-item">
                  <span className="cert-verify-lbl">Ngày lấy mẫu kiểm định:</span>
                  <strong className="cert-verify-val">{formatDate(test.sampledOn)}</strong>
                </div>
                <div className="cert-verify-summary-item">
                  <span className="cert-verify-lbl">Mã băm tệp gốc (SHA-256):</span>
                  <code className="cert-verify-code">
                    {safeReportHash || "Chưa đính kèm mã băm"}
                  </code>
                </div>
                <div className="cert-verify-summary-item">
                  <span className="cert-verify-lbl">Mã đối chiếu phòng Lab:</span>
                  <strong className="cert-verify-val">
                    {test.externalVerifyCode || "Đối chiếu theo số phiếu gốc"}
                  </strong>
                </div>
              </div>
              <div className="cert-verify-summary-note">
                Tài liệu này là bản trích xuất dữ liệu từ Hệ thống Quản lý Vùng trồng PUC của HTX Nông nghiệp Cư Né, không thay thế chữ ký và con dấu pháp nhân trên phiếu kết quả gốc. Khi làm thủ tục kiểm dịch hoặc thông quan, vui lòng đối chiếu trực tiếp bản scan PDF gốc do phòng thử nghiệm ISO/IEC 17025 phát hành
                {safeScanUrl ? (
                  <>
                    {" "}(
                    <a
                      href={safeScanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cert-verify-inline-link"
                    >
                      mở bản scan PDF đính kèm
                    </a>
                    ).
                  </>
                ) : (
                  "."
                )}
              </div>
            </div>

            {/* 7. CHÂN TRANG HỆ THỐNG */}
            <div className="cert-footer-row">
              <div>
                Đơn vị quản lý hồ sơ: <strong>HTX Nông nghiệp Cư Né - Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk</strong>
              </div>
              <div className="cert-security-hash">
                <span>Mã hồ sơ: </span>
                <code>LAB-{test.code}/PKN-{year}</code>
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
              <div className="cert-watermark" aria-hidden="true">
                <WatermarkStamp
                  topText="HTX NÔNG NGHIỆP CƯ NÉ"
                  centerText={test.result === "fail" ? "KHÔNG ĐẠT CHUẨN" : "BẢN TRÍCH XUẤT HỆ THỐNG"}
                  bottomText="ĐỐI CHIẾU BẢN SCAN LAB"
                />
              </div>

              <div className="cert-m-top-group">
                <div className="cert-m-header">
                  <div className="cert-m-org">
                    <div className="cert-m-org-text">
                      <div className="cert-m-ministry">HỆ THỐNG QUẢN LÝ VÙNG TRỒNG VÀ TRUY XUẤT NGUỒN GỐC PUC</div>
                      <div className="cert-m-center">HỢP TÁC XÃ NÔNG NGHIỆP CƯ NÉ - HUYỆN KRÔNG BÚK, TỈNH ĐẮK LẮK</div>
                      <div className="cert-m-branch">
                        Đơn vị thử nghiệm thực hiện: {test.lab}, {test.labAccreditationCode || "Chuẩn ISO/IEC 17025"}
                      </div>
                    </div>
                  </div>

                  <div className="cert-m-meta">
                    <div className="cert-m-doc">
                      <span>Số hồ sơ: </span>
                      <strong>LAB-{test.code}/PKN-{year}</strong>
                    </div>
                    <div className="cert-m-doc">
                      <span>Mã PUC: </span>
                      <strong>VN-DLOR-0086</strong>
                    </div>
                    {qrDataUrl && (
                      <a
                        href={`/trace/${encodeURIComponent(plotCode)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cert-m-qr"
                        style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
                        title={`Bấm vào mã QR để mở trang truy xuất nguồn gốc thửa ${plotCode}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrDataUrl} alt="Mã QR tra cứu truy xuất" />
                        <span>Quét tra cứu thửa</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="cert-m-divider" />

                <div className="cert-m-title-box">
                  <div className="cert-m-main-title">PHIẾU TRÍCH XUẤT KẾT QUẢ KIỂM NGHIỆM</div>
                  <div className="cert-m-sub-title">CHẤT LƯỢNG NÔNG SẢN VÀ DƯ LƯỢNG THUỐC BVTV</div>
                  <div className="cert-m-protocol">
                    (Theo Nghị định thư GACC Lệnh 248/249 và Quy chuẩn Kỹ thuật Quốc gia VietGAP)
                  </div>
                </div>
              </div>

              {/* Thông tin mẫu thử 2 cột chuẩn A4 */}
              <div className="cert-m-info-grid">
                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Tên chủ hộ sản xuất:</span>
                  <strong className="cert-m-val">{householdName}</strong>
                </div>
                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Mã vùng trồng và Thửa:</span>
                  <strong className="cert-m-val">VN-DLOR-0086 - Thửa {plotCode}</strong>
                </div>

                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Địa chỉ canh tác:</span>
                  <span className="cert-m-val">Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk</span>
                </div>
                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Đối tượng mẫu thử:</span>
                  <span className="cert-m-val">Sầu riêng tươi (<em>Durio zibethinus</em> - Monthong, Ri6)</span>
                </div>

                <div className="cert-m-info-item">
                  <span className="cert-m-lbl">Đơn vị quản lý gửi mẫu:</span>
                  <span className="cert-m-val">Ban Kiểm soát Kỹ thuật HTX Nông nghiệp Cư Né</span>
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
                  <span className="cert-m-lbl">Mã nhận diện mẫu thử:</span>
                  <span className="cert-m-val">Mẫu đại diện nguyên quả, mã hồ sơ {test.code}</span>
                </div>

                <div className="cert-m-info-item cert-m-full">
                  <span className="cert-m-lbl">Chỉ tiêu theo dõi:</span>
                  <span className="cert-m-val">Kim loại nặng Cadimi (Cd), Tổng dư lượng BVTV, Hoạt chất cấm Chlorpyrifos, Phẩm nhuộm Vàng O (Auramine O).</span>
                </div>

                <div className="cert-m-info-item cert-m-full">
                  <span className="cert-m-lbl">Phương pháp phân tích tham chiếu:</span>
                  <span className="cert-m-val">Sắc ký khí và lỏng khối phổ (GC-MS/MS, LC-MS/MS), Quang phổ hấp thụ nguyên tử AAS (AOAC 2007.01, TCVN 7602:2007).</span>
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
                <span>Hồ sơ trích xuất: LAB-{test.code}/PKN-{year} - Xem tiếp kết luận và đối chiếu hồ sơ gốc tại Trang 02</span>
                <strong>Trang 01 / 02</strong>
              </div>
            </div>
          </div>

          {/* ─── TỜ A4 SỐ 2 / 2: ĐÁNH GIÁ KIỂM DỊCH, KẾT LUẬN & ĐỐI CHIẾU HỒ SƠ GỐC ─── */}
          <div className="cert-mobile-a4-frame">
            <div className="cert-mobile-a4-canvas is-continuation">
              <div className="cert-watermark" aria-hidden="true">
                <WatermarkStamp
                  topText="HTX NÔNG NGHIỆP CƯ NÉ"
                  centerText={test.result === "fail" ? "KHÔNG ĐẠT CHUẨN" : "BẢN TRÍCH XUẤT HỆ THỐNG"}
                  bottomText="ĐỐI CHIẾU BẢN SCAN LAB"
                />
              </div>

              {/* Running Header gọn gàng nối tiếp từ Trang 1 */}
              <div className="cert-m-running-header">
                <span className="cert-m-running-title">
                  PHIẾU TRÍCH XUẤT KẾT QUẢ KIỂM NGHIỆM <em>(Tiếp theo Trang 01)</em>
                </span>
                <span className="cert-m-running-code">
                  Số hồ sơ: <strong>LAB-{test.code}/PKN-{year}</strong> - Mã PUC: <strong>VN-DLOR-0086</strong>
                </span>
              </div>

              {/* Bảng đánh giá cảm quan & kiểm dịch thực vật SPS/GACC */}
              <div className="cert-m-sps-section">
                <div className="cert-m-sec-heading">
                  GHI NHẬN KIỂM SOÁT NỘI BỘ VÙNG TRỒNG (SPS VÀ LỆNH 248 GACC):
                </div>
                <div className="cert-m-sps-grid">
                  <div className="cert-m-sps-cell">
                    <span className="cert-m-sps-lbl">Độ chín và sinh lý mẫu quả:</span>
                    <strong className="cert-m-sps-val val-ok">Đạt chuẩn thu hoạch (Chất khô &ge; 32%)</strong>
                  </div>
                  <div className="cert-m-sps-cell">
                    <span className="cert-m-sps-lbl">Kiểm dịch sinh vật gây hại:</span>
                    <strong className="cert-m-sps-val val-ok">KPH (Không có rệp sáp, sâu đục hạt)</strong>
                  </div>
                  <div className="cert-m-sps-cell">
                    <span className="cert-m-sps-lbl">Ngoại quan vỏ và cuống quả:</span>
                    <strong className="cert-m-sps-val">Nguyên vẹn, gai đều, không nấm mốc</strong>
                  </div>
                  <div className="cert-m-sps-cell">
                    <span className="cert-m-sps-lbl">Truy xuất nhật ký canh tác:</span>
                    <strong className="cert-m-sps-val">Đồng bộ nhật ký điện tử vùng trồng PUC</strong>
                  </div>
                </div>
              </div>

              {/* Khối Kết luận & Đối chiếu Quy chuẩn */}
              <div className="cert-m-conclusion-box">
                <div className="cert-m-concl-line">
                  <span className="cert-concl-title">KẾT LUẬN ĐỐI CHIẾU NGƯỠNG: </span>
                  {isPass ? (
                    <strong className="cert-concl-pass">
                      Mẫu sầu riêng ĐẠT NGƯỠNG AN TOÀN VỆ SINH THỰC PHẨM theo tiêu chí theo dõi vùng trồng xuất khẩu sang thị trường Trung Quốc (Lệnh 248/249 GACC và tiêu chuẩn VietGAP).
                    </strong>
                  ) : (
                    <strong className="cert-concl-fail">
                      MẪU KIỂM NGHIỆM KHÔNG ĐẠT NGƯỠNG AN TOÀN. Tồn tại chỉ số vượt mức cho phép, tạm dừng thu hoạch tại thửa {plotCode} để xử lý khoanh vùng.
                    </strong>
                  )}
                </div>

                <div className="cert-m-notes">
                  <strong>Ghi chú: </strong>
                  <em>
                    (1) KPH: Không phát hiện (dưới giới hạn định lượng LOD = 0.01 mg/kg). (2) Số liệu trên được trích xuất nguyên trạng từ hồ sơ mẫu {test.code} ghi nhận trên hệ thống PUC của HTX Nông nghiệp Cư Né.
                  </em>
                </div>

                <div className="cert-m-dispatch">
                  <span>Ngày lấy mẫu ghi nhận: </span>
                  <strong>{formatDate(test.sampledOn)} - Chủ hộ: {householdName} (Thửa {plotCode})</strong>
                </div>
              </div>

              {/* Khối xác thực hồ sơ gốc (không giả lập chữ ký và con dấu cơ quan nhà nước) */}
              <div className="cert-verify-summary-box is-mobile">
                <div className="cert-verify-summary-head">
                  THÔNG TIN ĐỐI CHIẾU PHIẾU KẾT QUẢ GỐC CỦA PHÒNG THỬ NGHIỆM
                </div>
                <div className="cert-verify-summary-grid">
                  <div className="cert-verify-summary-item">
                    <span className="cert-verify-lbl">Đơn vị thử nghiệm thực hiện:</span>
                    <strong className="cert-verify-val">
                      {test.lab}, {test.labAccreditationCode || "ISO/IEC 17025"}
                    </strong>
                  </div>
                  <div className="cert-verify-summary-item">
                    <span className="cert-verify-lbl">Ngày lấy mẫu kiểm định:</span>
                    <strong className="cert-verify-val">{formatDate(test.sampledOn)}</strong>
                  </div>
                  <div className="cert-verify-summary-item">
                    <span className="cert-verify-lbl">Mã băm tệp gốc (SHA-256):</span>
                    <code className="cert-verify-code">
                      {safeReportHash || "Chưa đính kèm mã băm"}
                    </code>
                  </div>
                  <div className="cert-verify-summary-item">
                    <span className="cert-verify-lbl">Mã đối chiếu phòng Lab:</span>
                    <strong className="cert-verify-val">
                      {test.externalVerifyCode || "Đối chiếu theo số phiếu gốc"}
                    </strong>
                  </div>
                </div>
                <div className="cert-verify-summary-note">
                  Tài liệu này là bản trích xuất dữ liệu hệ thống của HTX Nông nghiệp Cư Né, không thay thế chữ ký và con dấu pháp nhân trên phiếu kết quả gốc. Vui lòng đối chiếu trực tiếp bản scan PDF gốc của phòng thử nghiệm ISO/IEC 17025 khi làm thủ tục kiểm dịch.
                </div>
              </div>

              {/* Chân trang hệ thống Trang 2 */}
              <div className="cert-m-footer">
                <div>
                  HTX Nông nghiệp Cư Né - Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk
                </div>

                <div className="cert-m-hash">
                  <div className="cert-m-hash-bottom">
                    <span>Mã hồ sơ: LAB-{test.code}/PKN-{year}</span>
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
          border-radius: 8px;
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
        }

        /* ── TỜ GIẤY CHUẨN A4 PHẲNG VUÔNG GÓC (DESKTOP) ── */
        .cert-paper-shadow-wrap {
          position: relative;
        }

        .cert-paper {
          position: relative;
          width: 100%;
          max-width: 790px;
          min-height: 1117px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #d4d4d2;
          border-radius: 0;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
          padding: 30px 38px 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Times New Roman", serif;
          line-height: 1.42;
          overflow: hidden;
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
          width: 52px;
          height: 52px;
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
          margin: 10px 0 12px;
        }

        /* 2. Tiêu đề phiếu */
        .cert-title-section {
          position: relative;
          z-index: 2;
          text-align: center;
          margin-bottom: 14px;
        }

        .cert-main-title {
          font-size: 19.5px;
          font-weight: 900;
          color: #1e3a8a;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          line-height: 1.22;
        }

        .cert-sub-title {
          font-size: 13.5px;
          font-weight: 750;
          color: #0f2942;
          margin: 3px 0 0;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .cert-protocol-badge {
          display: inline-block;
          font-size: 10.5px;
          font-style: italic;
          color: #475569;
          margin-top: 3px;
        }

        /* 3. Khối thông tin mẫu */
        .cert-info-block {
          position: relative;
          z-index: 2;
          margin-bottom: 14px;
          font-size: 12px;
          line-height: 1.4;
        }

        .cert-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 18px;
          row-gap: 4px;
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
          margin-bottom: 14px;
        }

        .cert-table-heading {
          font-size: 13px;
          font-weight: 800;
          color: #0f2942;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .cert-table-wrapper {
          overflow-x: auto;
        }

        .cert-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
          border: 1px solid #334155;
        }

        .cert-table th,
        .cert-table td {
          border: 1px solid #475569;
          padding: 5.5px 7px;
          vertical-align: middle;
          line-height: 1.32;
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
          padding: 10px 12px;
          margin-bottom: 12px;
          font-size: 11.5px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .cert-conclusion-line {
          font-size: 12px;
          line-height: 1.38;
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

        /* 6. Khối đối chiếu hồ sơ gốc phòng thử nghiệm */
        .cert-verify-summary-box {
          position: relative;
          z-index: 2;
          margin-top: 0;
          margin-bottom: 12px;
          padding: 10px 12px;
          border: 1px solid #d4d4d2;
          border-radius: 6px;
          background: #f7f7f5;
          font-variant-numeric: tabular-nums;
        }

        .cert-verify-summary-head {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #14372f;
          margin-bottom: 6px;
          padding-bottom: 5px;
          border-bottom: 1px solid #e2e5e3;
        }

        .cert-verify-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 14px;
          margin-bottom: 6px;
        }

        .cert-verify-summary-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .cert-verify-lbl {
          font-size: 10.5px;
          color: #5f6d66;
        }

        .cert-verify-val {
          font-size: 11.5px;
          font-weight: 600;
          color: #121212;
          word-break: break-word;
        }

        .cert-verify-code {
          font-family: var(--font-num-stack, monospace);
          font-variant-numeric: tabular-nums;
          font-size: 10.5px;
          color: #14372f;
          background: #ffffff;
          border: 1px solid #d4d4d2;
          border-radius: 4px;
          padding: 2px 6px;
          word-break: break-all;
        }

        .cert-verify-summary-note {
          font-size: 10.5px;
          line-height: 1.45;
          color: #5f5f5c;
        }

        .cert-verify-inline-link {
          color: #14372f;
          font-weight: 600;
          text-decoration: underline;
        }

        .cert-verify-summary-box.is-mobile {
          margin-top: 8px;
          margin-bottom: 10px;
          padding: 9px 11px;
        }

        .cert-verify-summary-box.is-mobile .cert-verify-summary-head {
          font-size: 9.2px;
          margin-bottom: 6px;
          padding-bottom: 4px;
        }

        .cert-verify-summary-box.is-mobile .cert-verify-lbl {
          font-size: 8.8px;
        }

        .cert-verify-summary-box.is-mobile .cert-verify-val {
          font-size: 9.5px;
        }

        .cert-verify-summary-box.is-mobile .cert-verify-code {
          font-size: 8.6px;
        }

        .cert-verify-summary-box.is-mobile .cert-verify-summary-note {
          font-size: 8.8px;
          line-height: 1.4;
        }

        /* 7. Chân trang hệ thống */
        .cert-footer-row {
          position: relative;
          z-index: 2;
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-top: 1px solid #d4d4d2;
          padding-top: 8px;
          font-size: 10.5px;
          color: #5f6d66;
          font-variant-numeric: tabular-nums;
        }

        .cert-security-hash {
          text-align: right;
          max-width: 320px;
        }

        .cert-security-hash code {
          background: #f7f7f5;
          border: 1px solid #d4d4d2;
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 10px;
          color: #14372f;
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
            border-radius: 6px;
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
            font-weight: 700;
            letter-spacing: 0.02em;
            text-transform: uppercase;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
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
            border-radius: 8px;
          }

          .cert-status-badge {
            min-width: 0;
            line-height: 1.25;
          }

          .cert-status-main {
            font-size: 13px;
            font-weight: 700;
            color: #ffffff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
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
          }

          /* Tờ giấy A4 gốc kích thước chuẩn 520 x 735.43 (210 : 297) phẳng vuông góc */
          .cert-mobile-a4-canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 520px;
            height: 735.43px;
            transform: scale(var(--sheet-scale, 0.68));
            transform-origin: top left;
            background: #ffffff;
            color: #0f172a;
            border: 1px solid #d4d4d2;
            border-radius: 0;
            box-shadow: 0 4px 14px rgba(15, 23, 42, 0.14);
            padding: 22px 24px 16px;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Times New Roman", serif;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
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
           Dàn trang chuẩn khổ A4 với lề thực tế, chống cắt ngang bảng và các khối xác thực. */
        @page {
          size: A4 portrait;
          margin: 10mm 12mm;
        }

        @media print {
          :global(html),
          :global(body) {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
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
            margin: 0 !important;
            background: none !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            animation: none !important;
          }

          .cert-modal-container {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            box-shadow: none !important;
            background: #ffffff !important;
            transform: none !important;
            animation: none !important;
          }

          .no-print,
          .cert-mobile-a4-stack {
            display: none !important;
          }

          .cert-desktop-only,
          .cert-paper-shadow-wrap.cert-desktop-only {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            filter: none !important;
          }

          .cert-paper {
            position: relative !important;
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            clip-path: none !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          .cert-table-wrapper {
            overflow: visible !important;
          }

          .cert-table thead {
            display: table-header-group !important;
          }

          .cert-table-heading {
            break-after: avoid !important;
            page-break-after: avoid !important;
          }

          .cert-header-row,
          .cert-title-section,
          .cert-info-block,
          .cert-table-section,
          .cert-table,
          .cert-table tr,
          .cert-conclusion-block,
          .cert-verify-summary-box,
          .cert-footer-row {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .cert-footer-row {
            margin-top: 10px !important;
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
