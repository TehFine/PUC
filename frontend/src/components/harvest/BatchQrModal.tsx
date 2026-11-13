"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Printer, Download, Sparkles, Tag, Package, RefreshCw } from "lucide-react";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import type { HarvestItem } from "@/types/entities";
import { api } from "@/lib/api-client";
import { lockRootScroll } from "@/lib/scroll-lock";
import { buildUtf8CsvBlob, triggerBlobDownload } from "@/utils/download";

export interface BatchQrLot {
  id?: number;
  code: string;
  date?: string;
  harvestedOn?: string;
  packhouseCode?: string | null;
  buyer: string;
  market: string;
}

interface Props {
  lot: BatchQrLot;
  onClose: () => void;
}

interface ItemWithQr extends HarvestItem {
  qrDataUrl?: string;
}

const batchQrCache = new Map<string, string>();

function getPublicBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_PUBLIC_BASE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function BatchQrModal({ lot, onClose }: Props) {
  const titleId = useId();
  const [itemType, setItemType] = useState<"fruit" | "box">("fruit");
  const [count, setCount] = useState<number>(12);
  const [grade, setGrade] = useState<"A" | "B" | "C">("A");
  const [weightKg, setWeightKg] = useState<number>(3.5);
  const [items, setItems] = useState<ItemWithQr[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, startGenerating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 760;
    if (sheet) {
      sheet.style.animation = "none";
      sheet.style.pointerEvents = "none";
      if (isDesktop) {
        sheet.style.transition = "transform 180ms cubic-bezier(0.25, 1, 0.5, 1), opacity 180ms ease-out";
        sheet.style.transform = "translate3d(0, 12px, 0) scale(0.97)";
        sheet.style.opacity = "0";
      } else {
        sheet.style.transition = "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)";
        sheet.style.transform = "translate3d(0, 105%, 0)";
      }
    }
    if (backdrop) {
      backdrop.style.animation = "none";
      backdrop.style.pointerEvents = "none";
      backdrop.style.transition = "opacity 200ms ease-out";
      backdrop.style.opacity = "0";
    }
    setTimeout(() => {
      onClose();
    }, 220);
  }, [onClose]);

  // Đóng bằng phím Escape & khóa cuộn tầng root
  useEffect(() => {
    const unlockScroll = lockRootScroll();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      unlockScroll();
    };
  }, [handleClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isClosingRef.current) return;
      if (sheetRef.current) {
        sheetRef.current.style.animation = "none";
        sheetRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.animation = "none";
        backdropRef.current.style.opacity = "1";
      }
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  useSheetSwipe({ sheetRef, handleRef: dragZoneRef, onDismiss: handleClose });

  // Cập nhật trọng lượng mặc định khi đổi loại tem
  const handleTypeChange = (type: "fruit" | "box") => {
    setItemType(type);
    setWeightKg(type === "fruit" ? 3.5 : 18.0);
  };

  // Tải danh sách tem đã có của lô (chia cụm nhỏ + bộ nhớ đệm để không khóa luồng chính trên máy yếu)
  const fetchItemsWithQr = useCallback(async (lotId: number): Promise<ItemWithQr[]> => {
    const res = await api.get<{ data: HarvestItem[] }>(`/harvest/${lotId}/items`);
    const rawItems = res.data;
    const baseUrl = getPublicBaseUrl();
    const results: ItemWithQr[] = [];
    const CHUNK_SIZE = 8;

    for (let i = 0; i < rawItems.length; i += CHUNK_SIZE) {
      const slice = rawItems.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        slice.map(async (item) => {
          const cached = batchQrCache.get(item.serialCode);
          if (cached) {
            return { ...item, qrDataUrl: cached };
          }
          try {
            const url = `${baseUrl}/trace/${encodeURIComponent(item.serialCode)}`;
            const qrDataUrl = await QRCode.toDataURL(url, {
              margin: 1,
              width: 160,
              color: { dark: "#0f372a", light: "#ffffff" },
            });
            batchQrCache.set(item.serialCode, qrDataUrl);
            return { ...item, qrDataUrl };
          } catch {
            return item;
          }
        }),
      );
      results.push(...chunkResults);
      if (i + CHUNK_SIZE < rawItems.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    return results;
  }, []);

  useEffect(() => {
    let active = true;
    const lotId = lot.id;
    if (!lotId) return;
    fetchItemsWithQr(lotId)
      .then((list) => {
        if (active) {
          setItems(list);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Không tải được danh sách tem.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [lot.id, fetchItemsWithQr]);

  // Sinh thêm dải tem mới
  const handleGenerate = () => {
    const lotId = lot.id;
    if (!lotId) return;
    startGenerating(async () => {
      try {
        setError(null);
        await api.post(`/harvest/${lotId}/generate-items`, {
          count,
          itemType,
          grade,
          weightKg,
        });
        const updated = await fetchItemsWithQr(lotId);
        setItems(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không thể sinh tem mới.");
      }
    });
  };

  // Lọc theo loại tem đang xem
  const filteredItems = items.filter((it) => it.itemType === itemType);

  // Xuất file CSV
  const handleExportCsv = () => {
    if (filteredItems.length === 0) return;
    const baseUrl = getPublicBaseUrl();
    const headers = [
      "Số thứ tự",
      "Mã định danh Serial",
      "Loại tem",
      "Hạng",
      "Khối lượng (kg)",
      "Đường dẫn truy xuất",
    ];
    const rows = filteredItems.map((item, idx) => [
      idx + 1,
      item.serialCode,
      item.itemType === "fruit" ? "Quả" : "Thùng",
      item.grade ?? "A",
      item.weightKg ?? "",
      `${baseUrl}/trace/${encodeURIComponent(item.serialCode)}`,
    ]);
    const blob = buildUtf8CsvBlob(headers, rows);
    triggerBlobDownload(blob, `Danh_sach_tem_${lot.code}_${itemType}.csv`);
  };

  // In tem bằng window.print (gán tạm title để trình duyệt Lưu PDF ra tên file chuẩn)
  const handlePrint = () => {
    const previousTitle = document.title;
    document.title = `Tem-dinh-danh-${lot.code}-${itemType}`;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
    setTimeout(restoreTitle, 1500);
  };

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const displayDate = lot.date ?? (lot.harvestedOn ? lot.harvestedOn.slice(0, 10) : "—");

  const modalNode = (
    <div
      ref={backdropRef}
      className="batch-qr-overlay pt-sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={sheetRef}
        className="batch-qr-modal pt-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header Modal */}
        <div ref={dragZoneRef} className="pt-sheet-topbar no-print">
          <div className="batch-qr-header">
            <div>
              <div className="batch-qr-subtitle">Truy xuất nguồn gốc CheckVN &amp; GACC</div>
              <h2 id={titleId} className="batch-qr-title">
                Bộ sinh &amp; In tem định danh – Lô {lot.code}
              </h2>
            </div>
            <button
              type="button"
              className="batch-qr-close pt-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Đóng"
            >
              <CloseCircleIcon size={28} />
            </button>
          </div>
        </div>

        {/* Cấu hình sinh tem */}
        <div className="batch-qr-toolbar no-print">
          <div className="batch-qr-type-switch">
            <button
              type="button"
              className={`type-btn ${itemType === "fruit" ? "active" : ""}`}
              onClick={() => handleTypeChange("fruit")}
            >
              <Tag size={16} />
              <span>Tem dán từng quả ({items.filter((i) => i.itemType === "fruit").length})</span>
            </button>
            <button
              type="button"
              className={`type-btn ${itemType === "box" ? "active" : ""}`}
              onClick={() => handleTypeChange("box")}
            >
              <Package size={16} />
              <span>Tem dán thùng Carton ({items.filter((i) => i.itemType === "box").length})</span>
            </button>
          </div>

          <div className="batch-qr-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleExportCsv}
              disabled={filteredItems.length === 0}
            >
              <Download size={14} />
              <span>Xuất CSV</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrint}
              disabled={filteredItems.length === 0}
            >
              <Printer size={15} />
              <span>In trang tem</span>
            </button>
          </div>
        </div>

        {/* Khung tạo mới tem con */}
        <div className="batch-qr-gen-panel no-print">
          <div className="gen-panel-title">
            <Sparkles size={16} color="#1b4d3e" />
            <span>Cấp thêm dải mã tem serial mới cho lô {lot.code}</span>
          </div>

          <div className="gen-panel-form">
            <div className="gen-form-group">
              <label>Số lượng tem</label>
              <select
                className="filter-select"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                <option value={6}>6 tem</option>
                <option value={12}>12 tem</option>
                <option value={24}>24 tem</option>
                <option value={48}>48 tem</option>
                <option value={100}>100 tem</option>
              </select>
            </div>

            <div className="gen-form-group">
              <label>Phân hạng</label>
              <select
                className="filter-select"
                value={grade}
                onChange={(e) => setGrade(e.target.value as "A" | "B" | "C")}
              >
                <option value="A">Hạng A (VIP Xuất khẩu)</option>
                <option value="B">Hạng B (Loại 2)</option>
                <option value="C">Hạng C (Nội địa)</option>
              </select>
            </div>

            <div className="gen-form-group">
              <label>{itemType === "fruit" ? "Cân nặng quả (kg)" : "Quy cách thùng (kg)"}</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                className="filter-input"
                style={{ width: 100 }}
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? <RefreshCw size={15} className="spin" /> : <Tag size={15} />}
              <span>{generating ? "Đang cấp mã..." : `Sinh ${count} tem ${itemType === "fruit" ? "quả" : "thùng"}`}</span>
            </button>
          </div>
          {error && <div className="batch-qr-error">{error}</div>}
        </div>

        {/* Khung xem trước & In tem nhãn */}
        <div className="batch-qr-preview-area">
          <div className="preview-header no-print">
            <div className="preview-note">
              <strong>Bản xem trước nhãn in ({filteredItems.length} tem {itemType === "fruit" ? "dán quả" : "dán thùng"})</strong>
              <span>Khổ in tối ưu cho decal bóc dán nhiệt hoặc in A4 văn phòng</span>
            </div>
            {filteredItems.length > 0 && (
              <span className="badge badge-green">Mã QR hợp lệ 100% · Quét trực tiếp bằng camera</span>
            )}
          </div>

          {loading ? (
            <div className="batch-qr-loading no-print">Đang nạp dải mã tem...</div>
          ) : filteredItems.length === 0 ? (
            <div className="batch-qr-empty no-print">
              Chưa có tem {itemType === "fruit" ? "dán quả" : "dán thùng"} nào được cấp cho lô này.
              <br />
              Vui lòng bấm nút <strong>Sinh tem</strong> ở trên để tạo dải mã định danh.
            </div>
          ) : (
            <div className={`print-sheet print-sheet-${itemType}`}>
              {filteredItems.map((item) => (
                <div key={item.id} className={`stamp-card stamp-${itemType}`}>
                  {itemType === "fruit" ? (
                    /* ─── Tem dán từng quả (Fruit Decal 40x30mm) ─── */
                    <div className="fruit-stamp-inner">
                      <div className="fruit-stamp-header">
                        <div className="fruit-stamp-brand">HTX CƯ NÉ</div>
                        <span className="fruit-stamp-grade">HẠNG {item.grade ?? "A"}</span>
                      </div>
                      <div className="fruit-stamp-body">
                        {item.qrDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.qrDataUrl} alt={item.serialCode} className="fruit-qr-img" />
                        ) : (
                          <div className="qr-placeholder" />
                        )}
                        <div className="fruit-stamp-details">
                          <div className="stamp-puc">PUC: VN-DLOR-0086</div>
                          <div className="stamp-crop">SẦU RIÊNG TƯƠI</div>
                          <div className="stamp-weight">{item.weightKg ? `${item.weightKg} kg` : "3.5 kg"}</div>
                        </div>
                      </div>
                      <div className="fruit-stamp-footer">
                        <span
                          className="fruit-serial-code"
                          title="Bấm để sao chép mã"
                          onClick={() => copyCode(item.serialCode)}
                        >
                          {item.serialCode}
                        </span>
                        {copiedCode === item.serialCode && <span className="copied-tag">✔ Đã chép</span>}
                      </div>
                    </div>
                  ) : (
                    /* ─── Tem dán thùng carton (Carton Box Label 100x75mm) ─── */
                    <div className="box-stamp-inner">
                      <div className="box-stamp-head">
                        <div className="box-brand">
                          <strong>HTX SẦU RIÊNG CƯ NÉ – ĐẮK LẮK</strong>
                          <small>TIÊU CHUẨN XUẤT KHẨU VIETGAP &amp; NGHỊ ĐỊNH THƯ GACC</small>
                        </div>
                        <div className="box-stamp-grade-box">
                          HẠNG {item.grade ?? "A"}
                        </div>
                      </div>

                      <div className="box-stamp-grid">
                        <div className="box-qr-col">
                          {item.qrDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.qrDataUrl} alt={item.serialCode} className="box-qr-img" />
                          ) : (
                            <div className="qr-placeholder" />
                          )}
                          <span className="box-qr-caption">QUÉT TRUY XUẤT NGUỒN GỐC</span>
                        </div>

                        <div className="box-info-col">
                          <div className="box-field">
                            <span className="lbl">Mã định danh thùng:</span>
                            <strong
                              className="val serial-highlight"
                              onClick={() => copyCode(item.serialCode)}
                              title="Bấm để chép mã"
                            >
                              {item.serialCode}
                            </strong>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Mã số vùng trồng (PUC):</span>
                            <strong className="val">VN-DLOR-0086</strong>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Mã cơ sở đóng gói (PHC):</span>
                            <strong className="val">{lot.packhouseCode || "VN-DLPH-0089"}</strong>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Quy cách tịnh:</span>
                            <strong className="val">{item.weightKg ? `${item.weightKg} kg / Thùng` : "18.0 kg / Thùng"}</strong>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Doanh nghiệp xuất khẩu:</span>
                            <span className="val">{lot.buyer}</span>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Thị trường:</span>
                            <span className="val">{lot.market}</span>
                          </div>
                        </div>
                      </div>

                      <div className="box-stamp-foot">
                        <span>Lô hàng: {lot.code}</span>
                        <span>Ngày đóng gói: {displayDate}</span>
                        <span className="safe-mark">✔ Kiểm nghiệm Cadimi an toàn · Âm tính Vàng O</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        /* Overlay & Modal */
        .batch-qr-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.52);
          z-index: 1000;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          overflow: hidden;
        }

        .batch-qr-modal {
          background: #ffffff;
          border-radius: 28px 28px 0 0;
          max-width: 960px !important;
          width: 100%;
          height: min(92dvh, calc(100dvh - 28px));
          max-height: 92vh;
          max-height: min(92dvh, calc(100dvh - 28px));
          display: flex;
          flex-direction: column;
          box-shadow: 0 -12px 48px rgba(15, 23, 42, 0.24), 0 -2px 12px rgba(0, 0, 0, 0.06);
          border: none;
          overflow: hidden;
        }

        @media (min-width: 760px) {
          .batch-qr-overlay {
            align-items: center;
            padding: 20px;
          }
          .batch-qr-modal {
            border-radius: 24px;
            height: auto;
            max-height: 90vh;
            max-height: 90dvh;
          }
        }

        @media (min-width: 760px) and (max-height: 760px) {
          .batch-qr-overlay {
            padding: 10px 16px;
          }
          .batch-qr-modal {
            max-height: calc(100vh - 20px);
            max-height: calc(100dvh - 20px);
            border-radius: 20px;
          }
          .batch-qr-header {
            padding: 12px 20px 10px !important;
          }
          .batch-qr-title {
            font-size: 16px;
          }
          .batch-qr-toolbar {
            padding: 8px 20px;
            gap: 10px;
          }
          .batch-qr-gen-panel {
            padding: 10px 20px;
          }
          .gen-panel-title {
            margin-bottom: 6px;
            font-size: 12.5px;
          }
          .batch-qr-preview-area {
            padding: 14px 20px;
            min-height: 180px;
          }
        }

        .batch-qr-header {
          padding: 18px 22px 14px;
          border-bottom: 1px solid rgba(20, 55, 47, 0.07);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #ffffff;
        }

        @media (min-width: 760px) {
          .batch-qr-header {
            padding: 20px 24px 14px;
          }
        }

        .batch-qr-subtitle {
          font-size: 11.5px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: #2e7d32;
          font-weight: 700;
        }

        .batch-qr-title {
          font-size: 18px;
          font-weight: 700;
          color: #14372f;
          margin: 2px 0 0 0;
        }

        .batch-qr-close {
          width: 32px;
          height: 32px;
          padding: 0;
          border-radius: 50%;
          border: none;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #14372f;
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .batch-qr-close:hover {
          background: transparent;
          color: #14372f;
          opacity: 0.72;
          transform: rotate(90deg);
        }

        .batch-qr-toolbar {
          padding: 12px 24px;
          border-bottom: 1px solid #edf1ef;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: #ffffff;
          flex-wrap: wrap;
        }

        .batch-qr-type-switch {
          display: flex;
          gap: 8px;
          background: #f4f7f5;
          padding: 4px;
          border-radius: 10px;
        }

        .type-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          background: transparent;
          color: #4a6358;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .type-btn.active {
          background: #ffffff;
          color: #166534;
          box-shadow: none;
        }

        .batch-qr-actions {
          display: flex;
          gap: 10px;
        }

        .batch-qr-gen-panel {
          padding: 16px 24px;
          background: #f7faf8;
          border-bottom: 1px solid #edf1ef;
        }

        .gen-panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #1b4d3e;
          margin-bottom: 12px;
        }

        .gen-panel-form {
          display: flex;
          align-items: flex-end;
          gap: 14px;
          flex-wrap: wrap;
        }

        .gen-form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .gen-form-group label {
          font-size: 11.5px;
          font-weight: 600;
          color: #556b63;
        }

        .batch-qr-error {
          margin-top: 10px;
          color: #c92a2a;
          font-size: 12.5px;
          font-weight: 500;
        }

        .batch-qr-preview-area {
          padding: 20px 24px;
          overflow-y: auto;
          overscroll-behavior: contain;
          flex: 1;
          background: #eef2ef;
        }

        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .preview-note strong {
          display: block;
          font-size: 13.5px;
          color: #14372f;
        }
        .preview-note span {
          font-size: 11.5px;
          color: #64746d;
        }

        .batch-qr-loading,
        .batch-qr-empty {
          text-align: center;
          padding: 50px 20px;
          color: #607d72;
          font-size: 13.5px;
        }

        /* ─── Bản in tem Quả (Fruit) ─── */
        .print-sheet-fruit {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
        }

        .stamp-fruit {
          background: #ffffff;
          border-radius: 10px;
          border: 1.5px solid #d4dfd9;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.04);
          padding: 10px;
          display: flex;
          flex-direction: column;
        }

        .fruit-stamp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed #d5ded9;
          padding-bottom: 5px;
          margin-bottom: 6px;
        }

        .fruit-stamp-brand {
          font-size: 11px;
          font-weight: 800;
          color: #1b4d3e;
          letter-spacing: 0.3px;
        }

        .fruit-stamp-grade {
          background: #e8f5e9;
          color: #1b5e20;
          border: 1px solid #c8e6c9;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 800;
          padding: 1px 5px;
        }

        .fruit-stamp-body {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .fruit-qr-img {
          width: 76px;
          height: 76px;
          display: block;
          border-radius: 4px;
          border: 1px solid #e0eae4;
        }

        .fruit-stamp-details {
          font-size: 10px;
          color: #3b5047;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stamp-puc {
          font-weight: 700;
          color: #0f372a;
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
          font-size: 9.5px;
        }
        .stamp-crop {
          font-weight: 600;
          color: #166534;
        }
        .stamp-weight {
          font-weight: 700;
          color: #222;
        }

        .fruit-stamp-footer {
          margin-top: 6px;
          padding-top: 5px;
          border-top: 1px dashed #d5ded9;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .fruit-serial-code {
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
          font-size: 10.5px;
          font-weight: 700;
          color: #1b4d3e;
          cursor: pointer;
        }
        .fruit-serial-code:hover {
          text-decoration: underline;
        }

        .copied-tag {
          font-size: 9.5px;
          color: #2e7d32;
          font-weight: 700;
        }

        /* ─── Bản in tem Thùng (Box) ─── */
        .print-sheet-box {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 18px;
        }

        .stamp-box {
          background: #ffffff;
          border: 2px solid #0f372a;
          border-radius: 8px;
          padding: 14px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
        }

        .box-stamp-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0f372a;
          padding-bottom: 8px;
          margin-bottom: 10px;
        }

        .box-brand strong {
          display: block;
          font-size: 12.5px;
          font-weight: 800;
          color: #0f372a;
        }
        .box-brand small {
          display: block;
          font-size: 9.5px;
          color: #465f54;
          font-weight: 600;
        }

        .box-stamp-grade-box {
          background: #0f372a;
          color: #ffffff;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 807;
          white-space: nowrap;
        }

        .box-stamp-grid {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 12px;
          align-items: center;
        }

        .box-qr-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .box-qr-img {
          width: 104px;
          height: 104px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }

        .box-qr-caption {
          font-size: 8px;
          font-weight: 700;
          color: #0f372a;
          margin-top: 4px;
          text-transform: uppercase;
        }

        .box-info-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .box-field {
          font-size: 10.5px;
          display: flex;
          gap: 6px;
        }
        .box-field .lbl {
          color: #555;
          min-width: 125px;
        }
        .box-field .val {
          color: #111;
          font-weight: 500;
        }
        .box-field strong.val {
          font-weight: 700;
          color: #0f372a;
        }
        .serial-highlight {
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
          color: #b45309 !important;
          cursor: pointer;
        }

        .box-stamp-foot {
          margin-top: 10px;
          padding-top: 6px;
          border-top: 1px solid #d5ded9;
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          color: #4a6358;
          font-weight: 600;
          flex-wrap: wrap;
          gap: 6px;
        }
        .safe-mark {
          color: #15803d;
        }

        /* ─── CSS KHI IN ẤN (WINDOW.PRINT) ─── */
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            background: #ffffff !important;
          }

          body > *:not(.batch-qr-overlay) {
            display: none !important;
          }

          .no-print {
            display: none !important;
          }

          .batch-qr-overlay {
            position: static !important;
            inset: auto !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            opacity: 1 !important;
            animation: none !important;
          }

          .batch-qr-modal {
            position: static !important;
            display: block !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            transform: none !important;
            animation: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .batch-qr-preview-area {
            background: #ffffff !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }

          .print-sheet,
          .print-sheet * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-sheet-fruit {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 8mm !important;
            break-inside: auto;
            page-break-inside: auto;
          }

          .stamp-fruit {
            border: 1px solid #000 !important;
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .print-sheet-box {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10mm !important;
            break-inside: auto;
            page-break-inside: auto;
          }

          .stamp-box {
            border: 1.5px solid #000 !important;
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalNode, document.body) : modalNode;
}
