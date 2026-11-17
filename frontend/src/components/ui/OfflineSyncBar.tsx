"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useNetworkQuality } from "@/lib/network";
import {
  type OfflineMediaSlot,
  type OfflineOutboxItem,
  removeOfflineOutboxItem,
  retryOfflineOutboxItem,
  triggerOfflineSyncNow,
  useOfflineSyncState,
} from "@/lib/offline-sync";
import { isSafeMediaUrl, isSafeRasterDataUrl } from "@/utils/url-safety";

function formatSyncTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function LocalSlotPreview({ slot }: { slot: OfflineMediaSlot }) {
  const blobUrl = useMemo(() => {
    if (!slot.blob || slot.isVideo || typeof URL === "undefined") {
      return null;
    }
    return URL.createObjectURL(slot.blob);
  }, [slot.blob, slot.isVideo]);

  useEffect(() => {
    if (!blobUrl) return;
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const imgSrc =
    blobUrl ?? (!slot.isVideo && isSafeMediaUrl(slot.uploadedUrl) ? slot.uploadedUrl : null);

  if (slot.isVideo) {
    if (isSafeRasterDataUrl(slot.posterDataUrl)) {
      return (
        <div className="offline-thumb-box" title={slot.fileName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.posterDataUrl} alt={slot.fileName} className="offline-thumb-img" loading="lazy" decoding="async" />
        </div>
      );
    }
    return (
      <div className="offline-thumb-box is-video" title={slot.fileName}>
        <span>VIDEO</span>
        <small>{slot.uploadedId ? "Đã tải" : "Trong máy"}</small>
      </div>
    );
  }

  if (imgSrc) {
    return (
      <div className="offline-thumb-box" title={slot.fileName}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={slot.fileName} className="offline-thumb-img" />
      </div>
    );
  }

  return (
    <div className="offline-thumb-box is-video" title={slot.fileName}>
      <span>ẢNH</span>
      <small>{slot.uploadedId ? "Đã tải" : "Trong máy"}</small>
    </div>
  );
}

/**
 * Thanh thông báo và hộp thoại quản lý hàng đợi đồng bộ ngoại tuyến dùng chung cho Cổng hộ dân và Khu quản trị.
 * Ẩn hoàn toàn khi không có bản ghi chờ đồng bộ.
 */
export default function OfflineSyncBar() {
  const sync = useOfflineSyncState();
  const netQuality = useNetworkQuality();
  const [detailOpen, setDetailOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<OfflineOutboxItem | null>(null);

  const totalPending = sync.queuedCount + sync.failedCount;
  const showBanner = totalPending > 0 || sync.isSyncing || sync.recentSyncedCount > 0;

  if (!showBanner && !detailOpen) {
    return null;
  }

  const isOffline = netQuality === "offline";

  let statusTag = "ĐỒNG BỘ TỰ ĐỘNG";
  let headline = "";
  let subline = "";
  let toneClass = "is-neutral";

  if (sync.isSyncing) {
    statusTag = "ĐANG TẢI LÊN";
    const mediaStep = sync.activeMediaProgress
      ? `, tệp ${sync.activeMediaProgress.done}/${sync.activeMediaProgress.total}`
      : "";
    headline = `Đang cập nhật dữ liệu hiện trường lên máy chủ (${sync.queuedCount} bản ghi${mediaStep})`;
    subline = sync.activeItemLabel ?? "Vui lòng giữ trang mở trong giây lát để hoàn tất truyền tải.";
    toneClass = "is-syncing";
  } else if (sync.failedCount > 0) {
    statusTag = "CẦN KIỂM TRA";
    headline = `Có ${sync.failedCount} bản ghi ngoại tuyến chưa đồng bộ được lên máy chủ`;
    subline = "Mở danh sách chờ để xem chi tiết nguyên nhân, thử gửi lại hoặc hủy bản ghi.";
    toneClass = "is-warning";
  } else if (sync.queuedCount > 0) {
    statusTag = isOffline ? "LƯU TRÊN THIẾT BỊ" : "CHỜ SÓNG ỔN ĐỊNH";
    const fileText = sync.pendingMediaCount > 0 ? ` kèm ${sync.pendingMediaCount} tệp minh chứng` : "";
    headline = `Đã lưu an toàn ${sync.queuedCount} bản ghi${fileText} ngay trên điện thoại`;
    subline = isOffline
      ? "Khi di chuyển tới khu vực có sóng 4G hoặc Wi-Fi ổn định, hệ thống sẽ tự động cập nhật đầy đủ lên máy chủ."
      : "Hệ thống đang kiểm tra chất lượng đường truyền để tự động tải lên máy chủ.";
    toneClass = "is-queued";
  } else if (sync.recentSyncedCount > 0) {
    statusTag = "HOÀN TẤT";
    headline = `Đã cập nhật đầy đủ ${sync.recentSyncedCount} bản ghi hiện trường lên hệ thống`;
    subline = "Toàn bộ hình ảnh minh chứng và thông tin khai báo đã được lưu trữ trên máy chủ.";
    toneClass = "is-done";
  }

  return (
    <>
      {showBanner && (
        <section className={`offline-sync-bar ${toneClass}`} aria-live="polite">
          <div className="offline-sync-copy">
            <span className="offline-sync-eyebrow">{statusTag}</span>
            <strong className="offline-sync-title">{headline}</strong>
            {subline && <p className="offline-sync-sub">{subline}</p>}
          </div>

          {totalPending > 0 && (
            <div className="offline-sync-actions">
              {!isOffline && !sync.isSyncing && (
                <button
                  type="button"
                  className="offline-sync-btn is-primary"
                  onClick={() => void triggerOfflineSyncNow(true)}
                >
                  Đồng bộ ngay
                </button>
              )}
              <button
                type="button"
                className="offline-sync-btn"
                onClick={() => setDetailOpen(true)}
              >
                Hàng đợi ({totalPending})
              </button>
            </div>
          )}
        </section>
      )}

      {detailOpen && (
        <Modal
          title="Hàng đợi đồng bộ dữ liệu hiện trường"
          onClose={() => setDetailOpen(false)}
          width={620}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
              {sync.queuedCount > 0 && !isOffline && (
                <button
                  type="button"
                  className="btn btn-confirm-primary"
                  disabled={sync.isSyncing}
                  onClick={() => void triggerOfflineSyncNow(true)}
                >
                  {sync.isSyncing ? "Đang đồng bộ..." : "Đồng bộ tất cả ngay"}
                </button>
              )}
              <button type="button" className="btn btn-confirm-cancel" onClick={() => setDetailOpen(false)}>
                Đóng
              </button>
            </div>
          }
        >
          {sync.items.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: "#526059" }}>
              Toàn bộ bản ghi và ảnh chụp hiện trường trên thiết bị đã được cập nhật đầy đủ lên máy chủ.
            </p>
          ) : (
            <div className="offline-queue-list">
              {sync.items.map((item, idx) => {
                const uploadedCount = item.mediaSlots.filter((m) => Boolean(m.uploadedId)).length;
                const totalMedia = item.mediaSlots.length;
                return (
                  <article key={item.id} className="offline-queue-card">
                    <div className="offline-queue-head">
                      <span className="offline-queue-idx">{String(idx + 1).padStart(2, "0")}</span>
                      <div className="offline-queue-meta">
                        <strong>{item.label}</strong>
                        <span>
                          Ghi nhận lúc {formatSyncTimestamp(item.capturedAtIso)}
                          {totalMedia > 0 ? `, tệp minh chứng: ${uploadedCount}/${totalMedia} đã tải` : ""}
                        </span>
                      </div>
                      <span
                        className={`offline-queue-badge ${
                          item.status === "failed"
                            ? "is-failed"
                            : item.status === "syncing"
                            ? "is-syncing"
                            : "is-queued"
                        }`}
                      >
                        {item.status === "failed"
                          ? "Cần kiểm tra"
                          : item.status === "syncing"
                          ? "Đang tải lên"
                          : "Chờ mạng"}
                      </span>
                    </div>

                    {item.mediaSlots.length > 0 && (
                      <div className="offline-thumb-row">
                        {item.mediaSlots.map((slot, sIdx) => (
                          <LocalSlotPreview key={`${item.id}-${sIdx}`} slot={slot} />
                        ))}
                      </div>
                    )}

                    {item.lastError && (
                      <p className="offline-queue-error">{item.lastError}</p>
                    )}

                    <div className="offline-queue-foot">
                      {item.status === "failed" && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void retryOfflineOutboxItem(item.id)}
                        >
                          Thử gửi lại
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={item.status === "syncing"}
                        onClick={() => setDeletingItem(item)}
                      >
                        Hủy bản chờ
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {deletingItem && (
        <ConfirmDialog
          title="Hủy bản ghi chờ đồng bộ"
          message={
            <>
              Bạn có chắc chắn muốn xóa <strong>{deletingItem.label}</strong> đang lưu trên thiết bị? Hình ảnh đính kèm
              của bản ghi này sẽ không được tải lên máy chủ.
            </>
          }
          confirmLabel="Xóa bản ghi"
          danger
          onConfirm={() => {
            const id = deletingItem.id;
            setDeletingItem(null);
            void removeOfflineOutboxItem(id);
          }}
          onClose={() => setDeletingItem(null)}
        />
      )}
    </>
  );
}

/**
 * Hiển thị trực tiếp các bản ghi nhật ký / phun thuốc / lộ trình vừa chụp ngoại tuyến ngay trong tab Nhật ký của nông hộ,
 * kèm ảnh xem trước đọc trực tiếp từ bộ nhớ máy trước khi đồng bộ xong.
 */
export function OfflinePendingDiaryCards({
  kinds,
}: {
  kinds: Array<OfflineOutboxItem["kind"]>;
}) {
  const sync = useOfflineSyncState();
  const matching = sync.items.filter((it) => kinds.includes(it.kind));
  if (matching.length === 0) return null;

  return (
    <div className="offline-inline-section">
      <div className="offline-inline-header">
        <span className="offline-sync-eyebrow">BẢN GHI TRÊN THIẾT BỊ CHỜ ĐỒNG BỘ ({matching.length})</span>
      </div>
      <div className="offline-queue-list">
        {matching.map((item) => {
          const uploadedCount = item.mediaSlots.filter((m) => Boolean(m.uploadedId)).length;
          const totalMedia = item.mediaSlots.length;
          return (
            <article key={item.id} className="offline-queue-card">
              <div className="offline-queue-head">
                <div className="offline-queue-meta">
                  <strong>{item.label}</strong>
                  <span>
                    Chụp lúc {formatSyncTimestamp(item.capturedAtIso)}
                    {totalMedia > 0 ? `, minh chứng: ${totalMedia} tệp (${uploadedCount}/${totalMedia} đã tải)` : ""}
                  </span>
                </div>
                <span
                  className={`offline-queue-badge ${
                    item.status === "failed"
                      ? "is-failed"
                      : item.status === "syncing"
                      ? "is-syncing"
                      : "is-queued"
                  }`}
                >
                  {item.status === "failed"
                    ? "Cần kiểm tra"
                    : item.status === "syncing"
                    ? "Đang đồng bộ"
                    : "Chờ sóng ổn định"}
                </span>
              </div>
              {item.mediaSlots.length > 0 && (
                <div className="offline-thumb-row">
                  {item.mediaSlots.map((slot, sIdx) => (
                    <LocalSlotPreview key={`${item.id}-${sIdx}`} slot={slot} />
                  ))}
                </div>
              )}
              {item.lastError && <p className="offline-queue-error">{item.lastError}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
