"use client";

import { useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { onCountsChanged, requestAdminNavigate } from "@/components/admin/shared/counts-events";
import { RadialPngIcon } from "@/components/portal/RadialIcons";
import { BusyButton } from "@/components/portal/shared/controls";
import { EmptyState, Sheet, StateBlock } from "@/components/portal/ui";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { formatDate } from "@/utils/format";
import type { NotificationItem, NotificationList } from "@/types/notifications";

function resolveSectionFromLink(link: string | null, kind?: string): string | null {
  if (kind === "violation") return "journal";
  if (link) {
    const clean = link.toLowerCase();
    if (clean.includes("approval")) return "approval";
    if (clean.includes("violation") || clean.includes("journal") || clean.includes("spray")) return "journal";
    if (clean.includes("harvest") || clean.includes("stamp")) return "harvest";
    if (clean.includes("training")) return "training";
    if (clean.includes("testing") || clean.includes("lab")) return "testing";
    if (clean.includes("household")) return "households";
    if (clean.includes("registration")) return "registrations";
  }
  if (kind === "approval") return "approval";
  if (kind === "harvest") return "harvest";
  if (kind === "training") return "training";
  if (kind === "lab" || kind === "schedule") return "testing";
  return null;
}

export default function NotificationBell() {
  const { data, loading, error, refresh } = useApi<NotificationList>("/notifications");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => onCountsChanged(() => void refresh()), [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const items: NotificationItem[] = data?.data ?? [];
  const unread = data?.unread ?? items.filter((n) => !n.readAt).length;

  const markRead = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        await api.post(`/notifications/${item.id}/read`);
        await refresh();
      } catch {}
    }
    const section = resolveSectionFromLink(item.link, item.kind);
    setOpen(false);
    if (section) {
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
        <Sheet title="Thông báo từ HTX" onClose={() => setOpen(false)}>
          <div className="pt-stack" style={{ gap: 14 }}>
            {unread > 0 && (
              <div className="pt-notif-toolbar">
                <span className="pt-notif-summary">
                  Bạn có <strong>{unread}</strong> thông báo chưa đọc
                </span>
                <BusyButton
                  type="button"
                  className="pt-btn pt-btn-ghost pt-btn-sm pt-notif-markall-btn"
                  busy={busy}
                  busyLabel="Đang đánh dấu…"
                  onClick={() => void markAllRead()}
                >
                  <CheckCheck size={14} aria-hidden="true" />
                  <span>Đánh dấu đã đọc hết</span>
                </BusyButton>
              </div>
            )}

            <StateBlock loading={loading && items.length === 0} error={error} variant="rows" />

            {!loading && items.length === 0 && (
              <EmptyState icon="none">Hiện chưa có thông báo mới nào từ HTX.</EmptyState>
            )}

            {items.length > 0 && (
              <ul className="pt-notif-list">
                {items.map((item) => {
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
