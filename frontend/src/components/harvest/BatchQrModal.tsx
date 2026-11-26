"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "@/components/ui/Toast";
import { useIsDesktopViewport } from "@/components/portal/ui";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import type { HarvestItem } from "@/types/entities";
import { api, AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT, AUTH_SCOPE_CHANGED_EVENT } from "@/lib/api-client";
import { useBackLayer } from "@/lib/back-navigation";
import {
  animatePopupExit,
  attachSmoothSheetSettle,
  resolvePopupExitKind,
  spawnExitCloneIfNeeded,
} from "@/lib/popup-motion";
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

const MAX_BATCH_QR_CACHE = 200;
const batchQrCache = new Map<string, string>();

if (typeof window !== "undefined") {
  const clearBatchQrCache = () => {
    batchQrCache.clear();
  };
  window.addEventListener(AUTH_LOGOUT_EVENT, clearBatchQrCache);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearBatchQrCache);
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, clearBatchQrCache);
}

function setBatchQrCacheEntry(code: string, url: string) {
  if (batchQrCache.has(code)) {
    batchQrCache.delete(code);
  } else if (batchQrCache.size >= MAX_BATCH_QR_CACHE) {
    const oldest = batchQrCache.keys().next().value;
    if (oldest !== undefined) batchQrCache.delete(oldest);
  }
  batchQrCache.set(code, url);
}

function getPublicBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_PUBLIC_BASE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function BatchQrModal({ lot, onClose }: Props) {
  const { can } = useAuth();
  const canGenerate = can("harvest", "update");
  const titleId = useId();
  const isDesktop = useIsDesktopViewport(760);
  const [itemType, setItemType] = useState<"fruit" | "box">("box");
  const [eccLevel, setEccLevel] = useState<"Q" | "M">("Q");
  const [count, setCount] = useState<number>(12);
  const [grade, setGrade] = useState<"A" | "B" | "C">("A");
  const [weightKg, setWeightKg] = useState<number>(18.0);
  const [items, setItems] = useState<ItemWithQr[]>([]);
  const [loading, setLoading] = useState(() => Boolean(lot.id));
  const [generating, startGenerating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [prevLotId, setPrevLotId] = useState(lot.id);
  if (prevLotId !== lot.id) {
    setPrevLotId(lot.id);
    setItems([]);
    setError(null);
    setLoading(Boolean(lot.id));
  }
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragZoneRef = useRef<HTMLDivElement>(null);
  const backdropDownRef = useRef(false);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    const exitKind = resolvePopupExitKind("drawer", 760);
    const closeDuration = animatePopupExit(sheetRef.current, backdropRef.current, exitKind);
    window.setTimeout(() => {
      onCloseRef.current();
    }, closeDuration);
  }, []);

  useLayoutEffect(() => {
    const backdropEl = backdropRef.current;
    const sheetEl = sheetRef.current;
    return () => {
      if (!isClosingRef.current) {
        spawnExitCloneIfNeeded(backdropEl, sheetEl, resolvePopupExitKind("drawer", 760));
      }
    };
  }, []);

  useBackLayer(true, handleClose);

  useEffect(() => {
    const unlockScroll = lockRootScroll();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const overlays = document.querySelectorAll(
        ".pt-sheet-backdrop, .modal-overlay, .cert-modal-backdrop, .pt-radial-backdrop",
      );
      if (overlays.length > 0 && overlays[overlays.length - 1] !== backdropRef.current) return;
      event.stopPropagation();
      handleClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      unlockScroll();
    };
  }, [handleClose]);

  useEffect(
    () => attachSmoothSheetSettle(sheetRef.current, backdropRef.current, isClosingRef),
    [],
  );

  useSheetSwipe({
    sheetRef,
    handleRef: dragZoneRef,
    onDismiss: handleClose,
    enabled: !isDesktop,
  });

  const handleTypeChange = (type: "fruit" | "box") => {
    setItemType(type);
    setWeightKg(type === "fruit" ? 3.5 : 18.0);
  };

  const fetchItemsWithQr = useCallback(async (lotId: number, level: "Q" | "M"): Promise<ItemWithQr[]> => {
    const res = await api.get<{ data: HarvestItem[] }>(`/harvest/${lotId}/items`);
    const rawItems = res.data;
    const baseUrl = getPublicBaseUrl();
    const results: ItemWithQr[] = [];
    const CHUNK_SIZE = 8;

    for (let i = 0; i < rawItems.length; i += CHUNK_SIZE) {
      const slice = rawItems.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        slice.map(async (item) => {
          const tokenOrSerial = item.qrToken || item.serialCode;
          const cacheKey = `${tokenOrSerial}::${level}`;
          const cached = batchQrCache.get(cacheKey);
          if (cached) {
            return { ...item, qrDataUrl: cached };
          }
          try {
            const url = `${baseUrl}/t/${encodeURIComponent(tokenOrSerial)}`;
            const qrDataUrl = await QRCode.toDataURL(url, {
              errorCorrectionLevel: level,
              margin: 2,
              width: 240,
              color: { dark: "#000000", light: "#ffffff" },
            });
            setBatchQrCacheEntry(cacheKey, qrDataUrl);
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
    fetchItemsWithQr(lotId, eccLevel)
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
  }, [lot.id, eccLevel, fetchItemsWithQr]);

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
        const updated = await fetchItemsWithQr(lotId, eccLevel);
        setItems(updated);
        toast.success(`Đã tạo ${count} mã tem ${itemType === "fruit" ? "trái" : "thùng"}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không thể sinh tem mới.");
      }
    });
  };

  const boxCount = items.filter((it) => it.itemType === "box").length;
  const fruitCount = items.filter((it) => it.itemType === "fruit").length;
  const filteredItems = items.filter((it) => it.itemType === itemType);

  const handleExportCsv = () => {
    if (filteredItems.length === 0) return;
    const baseUrl = getPublicBaseUrl();
    const headers = [
      "Số thứ tự",
      "Mã lô hàng",
      "Mã định danh Serial",
      "Token chống giả",
      "Mã vùng trồng (PUC)",
      "Mã cơ sở đóng gói (PHC)",
      "Loại tem",
      "Hạng",
      "Khối lượng (kg)",
      "Mức sửa lỗi QR",
      "Đường dẫn truy xuất (/t/token)",
    ];
    const rows = filteredItems.map((item, idx) => {
      const tokenOrSerial = item.qrToken || item.serialCode;
      return [
        idx + 1,
        lot.code,
        item.serialCode,
        tokenOrSerial,
        item.pucCode?.trim() || "",
        lot.packhouseCode?.trim() || "",
        item.itemType === "fruit" ? "Quả" : "Thùng",
        item.grade ?? "A",
        item.weightKg ?? "",
        eccLevel,
        `${baseUrl}/t/${encodeURIComponent(tokenOrSerial)}`,
      ];
    });
    const blob = buildUtf8CsvBlob(headers, rows);
    triggerBlobDownload(blob, `Danh_sach_tem_${lot.code}_${itemType}.csv`);
    toast.success("Đã tải tệp CSV danh sách tem");
  };

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
    toast.success(`Đã sao chép mã ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const displayDate = lot.date ?? (lot.harvestedOn ? lot.harvestedOn.slice(0, 10) : "Chưa rõ");

  const modalNode = (
    <div
      ref={backdropRef}
      className="batch-qr-overlay pt-sheet-backdrop"
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const startedOnBackdrop = backdropDownRef.current;
        backdropDownRef.current = false;
        if (startedOnBackdrop && e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={sheetRef}
        className="batch-qr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Thanh tiêu đề cố định */}
        <div ref={dragZoneRef} className="batch-qr-topbar no-print">
          <div className="batch-qr-header">
            <div className="batch-qr-head-copy">
              <h2 id={titleId} className="batch-qr-title">
                In tem lô {lot.code}
              </h2>
            </div>
            <button
              type="button"
              className="batch-qr-close"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Đóng"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        </div>

        {/* Thân ngăn kéo cuộn mượt trên cả laptop và di động */}
        <div className="batch-qr-body">
          {/* Chuyển loại tem và xuất bản */}
          <div className="batch-qr-toolbar no-print">
            <div className="batch-qr-type-switch" role="tablist" aria-label="Loại tem">
              <button
                type="button"
                role="tab"
                aria-selected={itemType === "box"}
                className={`type-btn ${itemType === "box" ? "active" : ""}`}
                onClick={() => handleTypeChange("box")}
              >
                Tem thùng ({boxCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={itemType === "fruit"}
                className={`type-btn ${itemType === "fruit" ? "active" : ""}`}
                onClick={() => handleTypeChange("fruit")}
              >
                Tem quả ({fruitCount})
              </button>
            </div>

            <div className="batch-qr-actions">
              <select
                className="bqr-select bqr-ecc-select"
                value={eccLevel}
                onChange={(e) => setEccLevel(e.target.value as "Q" | "M")}
                aria-label="Độ nét mã QR"
              >
                <option value="Q">Mức Q (chống mờ kho lạnh)</option>
                <option value="M">Mức M (tiêu chuẩn)</option>
              </select>
              <button
                type="button"
                className="bqr-btn bqr-btn-secondary"
                onClick={handleExportCsv}
                disabled={filteredItems.length === 0}
              >
                Xuất CSV
              </button>
              <button
                type="button"
                className="bqr-btn bqr-btn-primary"
                onClick={handlePrint}
                disabled={filteredItems.length === 0}
              >
                In tem
              </button>
            </div>
          </div>

          {/* Khung tạo mới dải tem */}
          {canGenerate && (
            <div className="batch-qr-gen-panel no-print">
              <div className="gen-panel-title">Tạo tem mới</div>

              <div className="gen-panel-form">
                <div className="gen-form-group gen-col-count">
                  <label htmlFor={`${titleId}-count`}>Số lượng</label>
                  <select
                    id={`${titleId}-count`}
                    className="bqr-select"
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

                <div className="gen-form-group gen-col-grade">
                  <label htmlFor={`${titleId}-grade`}>Phân hạng</label>
                  <select
                    id={`${titleId}-grade`}
                    className="bqr-select"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value as "A" | "B" | "C")}
                  >
                    <option value="A">Hạng A (Xuất khẩu)</option>
                    <option value="B">Hạng B</option>
                    <option value="C">Hạng C</option>
                  </select>
                </div>

                <div className="gen-form-group gen-col-weight">
                  <label htmlFor={`${titleId}-weight`}>Khối lượng (kg)</label>
                  <input
                    id={`${titleId}-weight`}
                    type="number"
                    step="0.1"
                    min="0.5"
                    className="bqr-input"
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                  />
                </div>

                <button
                  type="button"
                  className="bqr-btn bqr-btn-primary gen-col-submit"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating
                    ? "Đang tạo..."
                    : `Tạo ${count} tem ${itemType === "fruit" ? "quả" : "thùng"}`}
                </button>
              </div>
              {error && <div className="batch-qr-error">{error}</div>}
            </div>
          )}

          {/* Khung xem trước và bản in tem */}
          <div className="batch-qr-preview-area">
            <div className="preview-header no-print">
              <div className="preview-head-row">
                <strong>Xem trước ({filteredItems.length} tem)</strong>
                <span className="preview-spec">Tương phản cao, mức {eccLevel}</span>
              </div>
              <p className="preview-sub">
                Cỡ QR tối thiểu {itemType === "fruit" ? "2,2 x 2,2 cm" : "2,8 x 2,8 cm"}, in decal nhựa chịu ẩm và quét thử trước khi in.
              </p>
            </div>

            {loading ? (
              <div className="batch-qr-loading no-print">Đang tải danh sách tem...</div>
            ) : filteredItems.length === 0 ? (
              <div className="batch-qr-empty no-print">
                Chưa có tem {itemType === "fruit" ? "quả" : "thùng"} nào. Chọn thông số ở trên và bấm <strong>Tạo tem</strong>.
              </div>
            ) : (
              <div className={`print-sheet print-sheet-${itemType}`}>
                {filteredItems.map((item) => {
                  const itemPucCode = item.pucCode?.trim() || "Chưa cập nhật";
                  const itemPhcCode = lot.packhouseCode?.trim() || "Chưa cập nhật";
                  return (
                    <div key={item.id} className={`stamp-card stamp-${itemType}`}>
                      {itemType === "fruit" ? (
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
                              <div className="qr-placeholder qr-placeholder-fruit" />
                            )}
                            <div className="fruit-stamp-details">
                              <div className="fruit-field">
                                <span className="fruit-lbl">Lô:</span>
                                <strong className="fruit-val">{lot.code}</strong>
                              </div>
                              <div className="fruit-field">
                                <span className="fruit-lbl">PUC:</span>
                                <strong className="fruit-val">{itemPucCode}</strong>
                              </div>
                              <div className="fruit-field">
                                <span className="fruit-lbl">PHC:</span>
                                <strong className="fruit-val">{itemPhcCode}</strong>
                              </div>
                              <div className="fruit-field">
                                <span className="fruit-lbl">KL:</span>
                                <strong className="fruit-val">{item.weightKg ? `${item.weightKg} kg` : "Chưa cập nhật"}</strong>
                              </div>
                            </div>
                          </div>
                          <div className="fruit-stamp-footer">
                            <span
                              className="fruit-serial-code"
                              title="Bấm để sao chép mã dự phòng"
                              onClick={() => copyCode(item.serialCode)}
                            >
                              Mã: {item.serialCode}
                            </span>
                            {copiedCode === item.serialCode && (
                              <span className="copied-tag no-print">Đã chép</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="box-stamp-inner">
                          <div className="box-stamp-head">
                            <div className="box-brand">
                              <strong>HTX SẦU RIÊNG CƯ NÉ - ĐẮK LẮK</strong>
                              <small>NHÃN ĐỊNH DANH LÔ HÀNG VÀ TRUY XUẤT NGUỒN GỐC</small>
                            </div>
                            <div className="box-stamp-grade-box">HẠNG {item.grade ?? "A"}</div>
                          </div>

                          <div className="box-stamp-grid">
                            <div className="box-qr-col">
                              {item.qrDataUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.qrDataUrl} alt={item.serialCode} className="box-qr-img" />
                              ) : (
                                <div className="qr-placeholder qr-placeholder-box" />
                              )}
                              <div className="box-qr-meta">
                                <span className="box-qr-caption">QUÉT MÃ KIỂM TRA</span>
                                <span className="box-qr-mobile-hint no-print">
                                  Chạm vào mã lô hoặc mã thùng bên dưới để sao chép nhanh
                                </span>
                              </div>
                            </div>

                            <div className="box-info-col">
                              <div className="box-field">
                                <span className="lbl">Mã lô hàng:</span>
                                <span className="val-wrap">
                                  <strong
                                    className="val serial-highlight"
                                    onClick={() => copyCode(lot.code)}
                                    title="Bấm để sao chép mã lô"
                                  >
                                    {lot.code}
                                  </strong>
                                  {copiedCode === lot.code && (
                                    <span className="copied-tag no-print">Đã chép</span>
                                  )}
                                </span>
                              </div>
                              <div className="box-field">
                                <span className="lbl">Mã vùng trồng (PUC):</span>
                                <strong className="val">{itemPucCode}</strong>
                              </div>
                              <div className="box-field">
                                <span className="lbl">Mã đóng gói (PHC):</span>
                                <strong className="val">{itemPhcCode}</strong>
                              </div>
                              <div className="box-field">
                                <span className="lbl">Mã thùng dự phòng:</span>
                                <span className="val-wrap">
                                  <strong
                                    className="val val-copyable"
                                    onClick={() => copyCode(item.serialCode)}
                                    title="Bấm để sao chép mã thùng"
                                  >
                                    {item.serialCode}
                                  </strong>
                                  {copiedCode === item.serialCode && (
                                    <span className="copied-tag no-print">Đã chép</span>
                                  )}
                                </span>
                              </div>
                              <div className="box-field">
                                <span className="lbl">Quy cách tịnh:</span>
                                <strong className="val">
                                  {item.weightKg ? `${item.weightKg} kg / Thùng` : "Chưa cập nhật"}
                                </strong>
                              </div>
                              <div className="box-field">
                                <span className="lbl">Đơn vị sản xuất:</span>
                                <span className="val">HTX Kinh doanh và Dịch vụ Tổng hợp Cư Né</span>
                              </div>
                            </div>
                          </div>

                          <div className="box-stamp-foot">
                            <div className="box-stamp-foot-meta">
                              <span>
                                Ngày đóng gói: <strong>{displayDate}</strong>
                              </span>
                              <span>
                                Thị trường: <strong>{lot.market}</strong>
                              </span>
                            </div>
                            <div className="box-stamp-foot-note">
                              Quét mã QR để kiểm tra hiệu lực PUC, PHC và phiếu kiểm nghiệm theo thời gian thực
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes bqr-sheet-slide-up {
          from {
            transform: translate3d(0, 100%, 0);
          }
          to {
            transform: translate3d(0, 0, 0);
          }
        }

        /* ─── Lớp phủ và khung ngăn kéo (bật thẳng từ cạnh dưới lên) ─── */
        .batch-qr-overlay.pt-sheet-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1050;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          background: rgba(15, 23, 42, 0.48);
          animation: none;
          touch-action: auto;
          overflow: hidden;
        }

        .batch-qr-modal {
          background: #ffffff;
          width: 100%;
          max-width: 100%;
          height: auto;
          max-height: min(92dvh, calc(100dvh - 16px));
          display: flex;
          flex-direction: column;
          border-radius: 8px 8px 0 0;
          border-top: 1px solid rgba(20, 55, 47, 0.14);
          box-shadow: 0 -6px 20px rgba(15, 23, 42, 0.14);
          overflow: hidden;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          animation: bqr-sheet-slide-up 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @media screen and (min-width: 760px) {
          .batch-qr-overlay.pt-sheet-backdrop {
            justify-content: flex-end;
            align-items: stretch;
            padding: 0;
            background: rgba(15, 23, 42, 0.44);
          }

          .batch-qr-modal {
            width: min(640px, 92vw);
            max-width: min(640px, 92vw);
            height: 100dvh;
            min-height: 100dvh;
            max-height: 100dvh;
            margin: 0;
            border-radius: 0;
            border: none;
            border-left: 1px solid rgba(20, 55, 47, 0.14);
            box-shadow: -16px 0 40px rgba(15, 23, 42, 0.14);
            animation: bqr-sheet-slide-up 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
          }
        }

        /* ─── Thanh tiêu đề ─── */
        .batch-qr-topbar {
          flex-shrink: 0;
          background: #ffffff;
          border-bottom: 1px solid #e2e5e3;
          touch-action: pinch-zoom;
        }

        .batch-qr-header {
          padding: 14px 16px;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) 36px;
          align-items: center;
          gap: 12px;
          background: #ffffff;
        }

        @media screen and (min-width: 760px) {
          .batch-qr-header {
            padding: 18px 24px 16px;
          }
        }

        .batch-qr-head-copy {
          grid-column: 2;
          min-width: 0;
          text-align: center;
        }

        .batch-qr-title {
          font-size: 16.5px;
          font-weight: 700;
          color: #14372f;
          margin: 0;
          line-height: 1.25;
          font-variant-numeric: tabular-nums;
        }

        @media screen and (min-width: 760px) {
          .batch-qr-title {
            font-size: 18px;
          }
        }

        .batch-qr-close {
          grid-column: 3;
          justify-self: end;
          width: 34px;
          height: 34px;
          padding: 0;
          border-radius: 6px;
          border: 1px solid #d4d4d2;
          background: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #14372f;
          font-size: 20px;
          line-height: 1;
          flex-shrink: 0;
          transition: background-color 160ms ease, border-color 160ms ease;
        }

        .batch-qr-close:hover {
          background: #f7f7f5;
          border-color: #14372f;
        }

        /* ─── Thân cuộn dọc ─── */
        .batch-qr-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: pan-y pinch-zoom;
          display: flex;
          flex-direction: column;
          background: #f7f7f5;
        }

        /* ─── Thanh chuyển chế độ và nút thao tác ─── */
        .batch-qr-toolbar {
          padding: 12px 16px;
          border-bottom: 1px solid #e2e5e3;
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: #ffffff;
          flex-shrink: 0;
        }

        @media screen and (min-width: 760px) {
          .batch-qr-toolbar {
            padding: 14px 24px;
          }
        }

        .batch-qr-type-switch {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px;
          background: #f3f5f4;
          border: 1px solid #e2e5e3;
          padding: 3px;
          border-radius: 6px;
        }

        .type-btn {
          height: 34px;
          padding: 0 10px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid transparent;
          background: transparent;
          color: #5f6d66;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
        }

        .type-btn:hover:not(.active) {
          color: #14372f;
        }

        .type-btn.active {
          background: #ffffff;
          color: #14372f;
          border-color: #d4d4d2;
        }

        .batch-qr-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          align-items: center;
        }

        .bqr-ecc-select {
          grid-column: 1 / -1;
        }

        @media screen and (min-width: 560px) {
          .batch-qr-actions {
            grid-template-columns: minmax(0, 1fr) auto auto;
          }

          .bqr-ecc-select {
            grid-column: auto;
          }
        }

        /* ─── Ô chọn, ô nhập số và nút chuẩn 38px đồng bộ ─── */
        .bqr-select,
        .bqr-input {
          width: 100%;
          height: 38px;
          min-height: 38px;
          background-color: #ffffff;
          border: 1px solid #d4d4d2;
          border-radius: 6px;
          padding: 0 12px;
          color: #121212;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          font-variant-numeric: tabular-nums;
          transition: border-color 160ms ease;
        }

        .bqr-select {
          appearance: none;
          -webkit-appearance: none;
          padding-right: 36px;
          cursor: pointer;
          text-overflow: ellipsis;
          background-image: url("/icons/chevron-down-forest.svg");
          background-repeat: no-repeat;
          background-position: right 11px center;
          background-size: 14px;
        }

        .bqr-select:hover,
        .bqr-input:hover {
          border-color: #9ca3af;
        }

        .bqr-select:focus,
        .bqr-input:focus {
          border-color: #14372f;
        }

        .bqr-btn {
          height: 38px;
          min-height: 38px;
          padding: 0 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          white-space: nowrap;
          box-sizing: border-box;
          font-variant-numeric: tabular-nums;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, opacity 160ms ease;
        }

        .bqr-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .bqr-btn-secondary {
          background: #ffffff;
          color: #14372f;
          border: 1px solid #d4d4d2;
        }

        .bqr-btn-secondary:hover:not(:disabled) {
          background: #f7f7f5;
          border-color: #14372f;
        }

        .bqr-btn-primary {
          background: #14372f;
          color: #ffffff;
          border: 1px solid #14372f;
        }

        .bqr-btn-primary:hover:not(:disabled) {
          background: #0f2922;
          border-color: #0f2922;
        }

        /* ─── Khung cấp mới dải tem ─── */
        .batch-qr-gen-panel {
          padding: 14px 16px;
          background: #ffffff;
          border-bottom: 1px solid #e2e5e3;
          flex-shrink: 0;
        }

        @media screen and (min-width: 760px) {
          .batch-qr-gen-panel {
            padding: 14px 24px 16px;
          }
        }

        .gen-panel-title {
          font-size: 13px;
          font-weight: 700;
          color: #14372f;
          margin: 0 0 10px 0;
          line-height: 1.35;
          font-variant-numeric: tabular-nums;
        }

        .gen-panel-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          align-items: end;
        }

        .gen-col-count {
          order: 1;
        }

        .gen-col-weight {
          order: 2;
        }

        .gen-col-grade {
          grid-column: 1 / -1;
          order: 3;
        }

        .gen-col-submit {
          grid-column: 1 / -1;
          order: 4;
          width: 100%;
        }

        @media screen and (min-width: 580px) {
          .gen-panel-form {
            grid-template-columns: 108px minmax(0, 1fr) 142px auto;
          }

          .gen-col-count,
          .gen-col-grade,
          .gen-col-weight,
          .gen-col-submit {
            grid-column: auto;
            order: 0;
            width: auto;
          }
        }

        .gen-form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }

        .gen-form-group label {
          font-size: 11.5px;
          font-weight: 600;
          color: #5f6d66;
          line-height: 1.3;
          white-space: nowrap;
        }

        .batch-qr-error {
          margin-top: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid #e2e5e3;
          background: #fdf2f2;
          color: #b91c1c;
          font-size: 12.5px;
          font-weight: 500;
        }

        /* ─── Vùng xem trước nhãn in ─── */
        .batch-qr-preview-area {
          padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px));
          flex: 1;
          background: #f7f7f5;
        }

        @media screen and (min-width: 760px) {
          .batch-qr-preview-area {
            padding: 18px 24px 28px;
          }
        }

        .preview-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
        }

        .preview-head-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .preview-head-row strong {
          font-size: 14px;
          font-weight: 700;
          color: #14372f;
          line-height: 1.35;
          font-variant-numeric: tabular-nums;
        }

        .preview-spec {
          font-size: 12.5px;
          font-weight: 600;
          color: #15803d;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }

        .preview-sub {
          margin: 0;
          font-size: 12px;
          color: #5f6d66;
          line-height: 1.45;
          font-variant-numeric: tabular-nums;
        }

        .batch-qr-loading,
        .batch-qr-empty {
          text-align: center;
          padding: 36px 16px;
          background: #ffffff;
          border: 1px solid #e2e5e3;
          border-radius: 6px;
          color: #5f6d66;
          font-size: 13px;
          line-height: 1.55;
        }

        .batch-qr-empty strong {
          color: #14372f;
        }

        .qr-placeholder {
          border: 1px solid #d4d4d2;
          border-radius: 4px;
          background: #f7f7f5;
          flex-shrink: 0;
        }

        .qr-placeholder-fruit {
          width: 76px;
          height: 76px;
        }

        .qr-placeholder-box {
          width: 104px;
          height: 104px;
        }

        /* ─── Bản in tem từng quả (Fruit) ─── */
        .print-sheet-fruit {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
        }

        @media screen and (min-width: 480px) {
          .print-sheet-fruit {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
        }

        .stamp-fruit {
          background: #ffffff;
          border-radius: 6px;
          border: 1px solid #14372f;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
        }

        .fruit-stamp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #e2e5e3;
          padding-bottom: 6px;
          margin-bottom: 8px;
        }

        .fruit-stamp-brand {
          font-size: 11px;
          font-weight: 700;
          color: #14372f;
          letter-spacing: 0.04em;
        }

        .fruit-stamp-grade {
          background: #14372f;
          color: #ffffff;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          white-space: nowrap;
        }

        .fruit-stamp-body {
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr);
          gap: 10px;
          align-items: center;
        }

        .fruit-qr-img {
          width: 76px;
          height: 76px;
          display: block;
          border-radius: 4px;
          border: 1px solid #d4d4d2;
        }

        .fruit-stamp-details {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .fruit-field {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr);
          column-gap: 6px;
          align-items: baseline;
          font-size: 10.5px;
          line-height: 1.35;
          font-variant-numeric: tabular-nums;
        }

        .fruit-lbl {
          color: #5f6d66;
          font-weight: 500;
        }

        .fruit-val {
          color: #14372f;
          font-weight: 700;
          min-width: 0;
          word-break: break-word;
          font-variant-numeric: tabular-nums;
        }

        .fruit-stamp-footer {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid #e2e5e3;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .fruit-serial-code {
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
          font-size: 11px;
          font-weight: 700;
          color: #14372f;
          cursor: pointer;
        }

        .fruit-serial-code:hover {
          text-decoration: underline;
        }

        .copied-tag {
          font-size: 10px;
          color: #15803d;
          font-weight: 600;
          white-space: nowrap;
        }

        /* ─── Bản in tem thùng (Box) ─── */
        .print-sheet-box {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 14px;
        }

        .stamp-box {
          background: #ffffff;
          border: 1.5px solid #14372f;
          border-radius: 6px;
          padding: 14px 16px;
        }

        .box-stamp-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          border-bottom: 1.5px solid #14372f;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }

        .box-brand {
          min-width: 0;
          flex: 1;
        }

        .box-brand strong {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #14372f;
          line-height: 1.3;
        }

        .box-brand small {
          display: block;
          margin-top: 2px;
          font-size: 10px;
          color: #5f6d66;
          font-weight: 600;
          letter-spacing: 0.03em;
          line-height: 1.35;
        }

        .box-stamp-grade-box {
          background: #14372f;
          color: #ffffff;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .box-stamp-grid {
          display: grid;
          grid-template-columns: 112px minmax(0, 1fr);
          gap: 16px;
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
          border: 1px solid #d4d4d2;
          border-radius: 4px;
          display: block;
          background: #ffffff;
          flex-shrink: 0;
        }

        .box-qr-meta {
          margin-top: 5px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .box-qr-caption {
          font-size: 8.5px;
          font-weight: 700;
          color: #14372f;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .box-qr-mobile-hint {
          display: none;
        }

        .box-info-col {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }

        .box-field {
          display: grid;
          grid-template-columns: 146px minmax(0, 1fr);
          column-gap: 10px;
          align-items: baseline;
          font-size: 11.5px;
          line-height: 1.4;
        }

        .box-field .lbl {
          color: #5f6d66;
          font-weight: 500;
        }

        .val-wrap {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          flex-wrap: wrap;
          min-width: 0;
        }

        .box-field .val {
          color: #121212;
          font-weight: 500;
          min-width: 0;
          word-break: break-word;
          font-variant-numeric: tabular-nums;
        }

        .box-field strong.val {
          font-weight: 700;
          color: #14372f;
        }

        .val-copyable {
          cursor: pointer;
        }

        .val-copyable:hover,
        .serial-highlight:hover {
          text-decoration: underline;
        }

        .serial-highlight {
          font-family: var(--font-num-stack, -apple-system, "Segoe UI", Arial, sans-serif);
          font-variant-numeric: tabular-nums;
          color: #9a6712 !important;
          cursor: pointer;
        }

        .box-stamp-foot {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid #d4d4d2;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .box-stamp-foot-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 11px;
          color: #5f6d66;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
        }

        .box-stamp-foot-meta strong {
          color: #14372f;
          font-weight: 600;
        }

        .box-stamp-foot-note {
          font-size: 10.5px;
          color: #15803d;
          font-weight: 600;
          line-height: 1.35;
        }

        /* ─── Giao diện di động cho thẻ nhãn thùng ─── */
        @media screen and (max-width: 500px) {
          .stamp-box {
            padding: 12px;
          }

          .box-stamp-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 12px;
          }

          .box-qr-col {
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            gap: 12px;
            padding: 8px 10px;
            background: #f7f7f5;
            border: 1px solid #e2e5e3;
            border-radius: 6px;
            text-align: left;
          }

          .box-qr-img,
          .qr-placeholder-box {
            width: 80px;
            height: 80px;
          }

          .box-qr-meta {
            margin-top: 0;
            min-width: 0;
          }

          .box-qr-caption {
            font-size: 10px;
          }

          .box-qr-mobile-hint {
            display: block;
            font-size: 11px;
            color: #5f6d66;
            line-height: 1.35;
          }

          .box-field {
            grid-template-columns: 128px minmax(0, 1fr);
            column-gap: 8px;
          }
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

          .batch-qr-overlay,
          .batch-qr-overlay.pt-sheet-backdrop,
          .batch-qr-modal,
          .batch-qr-body,
          .batch-qr-preview-area {
            position: static !important;
            inset: auto !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            opacity: 1 !important;
            transform: none !important;
            animation: none !important;
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
            border: 1.5px solid #000 !important;
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .fruit-qr-img {
            width: 22mm !important;
            height: 22mm !important;
            min-width: 22mm !important;
            min-height: 22mm !important;
            border: 1px solid #000 !important;
            border-radius: 0 !important;
            image-rendering: pixelated;
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

          .box-stamp-grid {
            grid-template-columns: 30mm minmax(0, 1fr) !important;
            gap: 3.5mm !important;
          }

          .box-field {
            grid-template-columns: 36mm minmax(0, 1fr) !important;
            font-size: 9.5px !important;
          }

          .box-qr-img {
            width: 28mm !important;
            height: 28mm !important;
            min-width: 28mm !important;
            min-height: 28mm !important;
            border: 1px solid #000 !important;
            border-radius: 0 !important;
            image-rendering: pixelated;
          }
        }
      `}</style>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalNode, document.body) : modalNode;
}
