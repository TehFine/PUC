"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { AppleLoadingPill } from "@/components/ui/Skeleton";
import { onCountsChanged, requestAdminNavigate } from "@/components/admin/shared/counts-events";
import { formatDateTime } from "@/utils/format";
import type { NotificationItem, NotificationList } from "@/types/notifications";

const KIND_META: Record<string, { label: string; bg: string; color: string }> = {
  approval: { label: "Hồ sơ", bg: "#fde8e2", color: "#c93f18" },
  violation: { label: "Nhật ký · Vi phạm", bg: "#fef3c7", color: "#b45309" },
  harvest: { label: "Lô hàng", bg: "#e7f6ec", color: "#15803d" },
  training: { label: "Tập huấn", bg: "#e0f2fe", color: "#0369a1" },
  schedule: { label: "Lịch kiểm tra", bg: "#f3e8ff", color: "#6d28d9" },
  lab: { label: "Kiểm nghiệm", bg: "#e0f2fe", color: "#0369a1" },
  system: { label: "Hệ thống", bg: "#eef4f0", color: "#14372f" },
};

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
  if (kind === "lab") return "testing";
  return null;
}

export default function NotificationBell() {
  const { data, loading, refresh } = useApi<NotificationList>("/notifications");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => onCountsChanged(() => void refresh()), [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
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
    if (section) {
      setOpen(false);
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
    <div ref={ref} className="admin-notif-wrap">
      <button
        type="button"
        className="admin-notif-btn"
        aria-label={unread > 0 ? `Thông báo (${unread} chưa đọc)` : "Thông báo"}
        title="Thông báo"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} strokeWidth={2.1} />
        {unread > 0 && (
          <span className="admin-notif-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Danh sách thông báo"
          className="admin-notif-dropdown"
        >
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 14, color: "var(--ink)" }}>
              Thông báo {unread > 0 ? `(${unread})` : ""}
            </strong>
            {unread > 0 && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ padding: "4px 10px", fontSize: 11.5 }}
                disabled={busy}
                onClick={() => void markAllRead()}
              >
                <CheckCheck size={13} />
                Đọc tất cả
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto", maxHeight: 350 }}>
            {loading && items.length === 0 && (
              <div style={{ padding: 20, display: "flex", justifyContent: "center" }}>
                <AppleLoadingPill label="Đang tải thông báo…" />
              </div>
            )}
            {!loading && items.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
                Chưa có thông báo nào.
              </div>
            )}
            {items.map((item) => {
              const isUnread = !item.readAt;
              const meta = KIND_META[item.kind] ?? KIND_META.system;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markRead(item)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 18px",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: isUnread ? "#f3f8ee" : "#fff",
                    cursor: "pointer",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 999,
                        background: meta.bg,
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>
                    {isUnread && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#e05326",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ fontWeight: isUnread ? 700 : 500, fontSize: 13, color: "var(--ink)" }}>
                    {item.title}
                  </div>
                  {item.body && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.45 }}>
                      {item.body}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    {formatDateTime(item.createdAt)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
