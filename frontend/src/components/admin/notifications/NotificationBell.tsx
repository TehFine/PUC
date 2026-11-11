"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { onCountsChanged, requestAdminNavigate, requestApprovalTab } from "@/components/admin/shared/counts-events";
import { RadialPngIcon } from "@/components/portal/RadialIcons";
import { BusyButton } from "@/components/portal/shared/controls";
import { DrawerSummaryFooter, EmptyState, Sheet, StateBlock, useIsDesktopViewport, useSheetClose } from "@/components/portal/ui";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { formatDate } from "@/utils/format";
import type { NotificationItem, NotificationList } from "@/types/notifications";

function resolveSectionFromLink(link: string | null, kind?: string): string | null {
  if (kind === "violation") return "journal";
  if (link) {
    const clean = link.toLowerCase();
    if (clean.includes("registration")) return "registrations";
    if (clean.includes("approval")) return "approval";
    if (clean.includes("violation") || clean.includes("journal") || clean.includes("spray")) return "journal";
    if (clean.includes("harvest") || clean.includes("stamp")) return "harvest";
    if (clean.includes("testing") || clean.includes("lab")) return "testing";
    if (clean.includes("household")) return "households";
  }
  if (kind === "approval") return "approval";
  if (kind === "harvest") return "harvest";
  if (kind === "lab" || kind === "schedule") return "testing";
  return null;
}

function AdminDrawerCloseCta() {
  const close = useSheetClose();
  return (
    <button
      type="button"
      className="pt-drawer-cta"
      onClick={() => close?.()}
    >
      <span>Đã nắm thông tin</span>
      <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

export default function NotificationBell() {
  const { data, loading, error, refresh } = useApi<NotificationList>("/notifications");
  const isDesktopDrawer = useIsDesktopViewport(760);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "unread">("all");

  useEffect(() => onCountsChanged(() => void refresh()), [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const items: NotificationItem[] = (data?.data ?? []).filter((n) => n.kind !== "training");
  const unread = items.filter((n) => !n.readAt).length;
  const readCount = items.length - unread;
  const visibleItems = filterMode === "unread" ? items.filter((n) => !n.readAt) : items;

  const markRead = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        await api.post(`/notifications/${item.id}/read`);
        await refresh();
      } catch {}
    }
    const section = resolveSectionFromLink(item.link, item.kind);
    setOpen(false);
    if (section === "registrations") {
      requestApprovalTab("registrations");
    } else if (section) {
      requestAdminNavigate(section);
    }
  };

  const markAllRead = async () => {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      await api.post("/notifications/read-all");
      await refresh();
    } catch {
    } finally {
      setBusy(false);
    }
  };

  const clearRead = async () => {
    if (clearing || readCount === 0) return;
    setClearing(true);
    try {
      await api.post("/notifications/clear-read");
      await refresh();
    } catch {
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="admin-notif-wrap">
      <button
        type="button"
        className="admin-notif-btn pt-notif-btn"
        aria-label={unread > 0 ? `Thông báo (${unread} chưa đọc)` : "Thông báo"}
        title="Thông báo từ HTX"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          void refresh();
        }}
      >
        <RadialPngIcon src="/bell.png" size={18} />
        {unread > 0 && (
          <span className="admin-notif-badge pt-notif-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <Sheet
          variant="drawer"
          title="Thông báo từ HTX"
          onClose={() => setOpen(false)}
          className="pt-notif-sheet"
          footer={
            <DrawerSummaryFooter
              actions={
                <>
                  {readCount > 0 && (
                    <BusyButton
                      type="button"
                      className="pt-drawer-cta-ghost"
                      busy={clearing}
                      busyLabel="Đang xóa…"
                      onClick={() => void clearRead()}
                    >
                      <span>Xóa đã đọc ({readCount})</span>
                    </BusyButton>
                  )}
                  {unread > 0 ? (
                    <BusyButton
                      type="button"
                      className="pt-drawer-cta"
                      busy={busy}
                      busyLabel="Đang đánh dấu…"
                      onClick={() => void markAllRead()}
                    >
                      <span>Đánh dấu đọc hết</span>
                      <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
                    </BusyButton>
                  ) : (
                    <AdminDrawerCloseCta />
                  )}
                </>
              }
            />
          }
        >
          <div className="pt-stack" style={{ gap: 14 }}>
            {items.length > 0 && (
              <div className="pt-notif-toolbar">
                <div className="pt-notif-filter-group">
                  <button
                    type="button"
                    className={`pt-btn pt-btn-sm ${filterMode === "all" ? "pt-btn-primary" : "pt-btn-ghost"}`}
                    onClick={() => setFilterMode("all")}
                  >
                    Tất cả ({items.length})
                  </button>
                  <button
                    type="button"
                    className={`pt-btn pt-btn-sm ${filterMode === "unread" ? "pt-btn-primary" : "pt-btn-ghost"}`}
                    onClick={() => setFilterMode("unread")}
                  >
                    Chưa đọc ({unread})
                  </button>
                </div>
                {!isDesktopDrawer && (unread > 0 || readCount > 0) && (
                  <div className="pt-notif-action-group">
                    {unread > 0 && (
                      <BusyButton
                        type="button"
                        className="pt-btn pt-btn-ghost pt-btn-sm pt-notif-markall-btn"
                        busy={busy}
                        busyLabel="Đang đánh dấu…"
                        onClick={() => void markAllRead()}
                      >
                        <span>Đọc hết</span>
                      </BusyButton>
                    )}
                    {readCount > 0 && (
                      <BusyButton
                        type="button"
                        className="pt-btn pt-btn-ghost pt-btn-sm"
                        busy={clearing}
                        busyLabel="Đang xóa…"
                        onClick={() => void clearRead()}
                      >
                        <span>Xóa đã đọc ({readCount})</span>
                      </BusyButton>
                    )}
                  </div>
                )}
              </div>
            )}

            <StateBlock loading={loading && items.length === 0} error={error} variant="rows" />

            {!loading && visibleItems.length === 0 && (
              isDesktopDrawer ? (
                <p className="pt-drawer-empty-note">
                  {filterMode === "unread"
                    ? "Bạn đã đọc hết tất cả thông báo."
                    : "Hiện chưa có thông báo mới nào từ HTX."}
                </p>
              ) : (
                <EmptyState icon="none">
                  {filterMode === "unread"
                    ? "Bạn đã đọc hết tất cả thông báo."
                    : "Hiện chưa có thông báo mới nào từ HTX."}
                </EmptyState>
              )
            )}

            {visibleItems.length > 0 && (
              <ul className="pt-notif-list">
                {visibleItems.map((item) => {
                  const isUnread = !item.readAt;
                  return (
                    <li
                      key={item.id}
                      className={`pt-notif-item ${isUnread ? "is-unread" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => void markRead(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void markRead(item);
                        }
                      }}
                    >
                      <div className="pt-notif-dot-col">
                        <span className={`pt-notif-dot ${isUnread ? "is-active" : ""}`} aria-hidden="true" />
                      </div>
                      <div className="pt-notif-content">
                        <div className="pt-notif-head">
                          <strong>{item.title}</strong>
                          <span className="pt-notif-time">{formatDate(item.createdAt)}</span>
                        </div>
                        {item.body && <p className="pt-notif-body">{item.body}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
