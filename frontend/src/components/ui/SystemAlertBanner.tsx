"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  checkSystemHealth,
  clearRuntimeIncident,
  useSystemAlertSnapshot,
} from "@/lib/system-alert";

const DISMISSED_STORAGE_KEY = "puc_dismissed_system_alert";

function readDismissedId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(DISMISSED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveDismissedId(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, key);
  } catch {
    // Ignore storage restriction
  }
}

export default function SystemAlertBanner() {
  const { session } = useAuth();
  const pathname = usePathname() || "";
  const { runtimeIncident, broadcastAlert, recoveredAt, checking } = useSystemAlertSnapshot();
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => readDismissedId());

  const role = session?.user.role;
  const matchesBroadcastAudience = (() => {
    if (!broadcastAlert || !broadcastAlert.active) return false;
    if (broadcastAlert.audience === "all") return true;
    if (broadcastAlert.audience === "farmer") {
      return role === "farmer" || pathname.startsWith("/portal");
    }
    if (broadcastAlert.audience === "staff") {
      return Boolean((role && role !== "farmer") || pathname.startsWith("/admin"));
    }
    return true;
  })();

  // Ưu tiên 1: Lỗi kết nối máy chủ / CSDL / phiên bản client ngay thời điểm hiện tại.
  if (runtimeIncident) {
    const incidentKey = `${runtimeIncident.id}-${Math.floor(runtimeIncident.occurredAt / 30_000)}`;
    if (dismissedKey !== incidentKey) {
      const isChunk = runtimeIncident.kind === "chunk_error";
      return (
        <div
          className={`sys-alert-banner ${isChunk ? "is-warning" : "is-critical"}`}
          role="alert"
          aria-live="assertive"
        >
          <div className="sys-alert-main">
            <div className="sys-alert-top">
              <span className="sys-alert-badge">
                <span className="sys-alert-dot" aria-hidden="true" />
                {isChunk ? "CẬP NHẬT PHIÊN BẢN" : "KHẨN CẤP · SỰ CỐ HỆ THỐNG"}
              </span>
              <button
                type="button"
                className="sys-alert-close"
                aria-label="Đóng thông báo khẩn"
                onClick={() => {
                  setDismissedKey(incidentKey);
                  clearRuntimeIncident();
                }}
              >
                ×
              </button>
            </div>
            <strong className="sys-alert-title">{runtimeIncident.title}</strong>
            <p className="sys-alert-desc">{runtimeIncident.message}</p>
            <div className="sys-alert-actions">
              {isChunk ? (
                <button
                  type="button"
                  className="sys-alert-btn is-solid"
                  onClick={() => window.location.reload()}
                >
                  Tải lại trang ngay
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="sys-alert-btn is-solid"
                    disabled={checking}
                    onClick={() => void checkSystemHealth()}
                  >
                    {checking ? "Đang kiểm tra…" : "Thử kết nối lại"}
                  </button>
                  <a href="tel:0366663778" className="sys-alert-btn is-ghost">
                    Hotline kỹ thuật: 0366 663 778
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // Ưu tiên 2: Thông báo khẩn / bảo trì do Quản trị viên HTX phát trên toàn hệ thống.
  if (matchesBroadcastAudience && broadcastAlert) {
    const alertKey = `broadcast-${broadcastAlert.id}-${broadcastAlert.createdAt}`;
    if (dismissedKey !== alertKey) {
      const isCritical = broadcastAlert.severity === "critical";
      return (
        <div
          className={`sys-alert-banner ${isCritical ? "is-critical" : "is-warning"}`}
          role="alert"
          aria-live={isCritical ? "assertive" : "polite"}
        >
          <div className="sys-alert-main">
            <div className="sys-alert-top">
              <span className="sys-alert-badge">
                <span className="sys-alert-dot" aria-hidden="true" />
                {isCritical ? "THÔNG BÁO KHẨN TỪ HTX" : "THÔNG BÁO BẢO TRÌ / KỸ THUẬT"}
              </span>
              <button
                type="button"
                className="sys-alert-close"
                aria-label="Ẩn thông báo này"
                onClick={() => {
                  setDismissedKey(alertKey);
                  saveDismissedId(alertKey);
                }}
              >
                ×
              </button>
            </div>
            <strong className="sys-alert-title">{broadcastAlert.title}</strong>
            <p className="sys-alert-desc">{broadcastAlert.message}</p>
            {isCritical && (
              <div className="sys-alert-actions">
                <a href="tel:0366663778" className="sys-alert-btn is-ghost">
                  Hotline hỗ trợ HTX: 0366 663 778
                </a>
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  // Ưu tiên 3: Báo ngắn gọn khi hệ thống vừa tự khôi phục sau sự cố.
  if (recoveredAt) {
    return (
      <div className="sys-alert-banner is-recovered" role="status" aria-live="polite">
        <div className="sys-alert-recovered-row">
          <span className="sys-alert-dot" aria-hidden="true" />
          <span>Hệ thống đã khôi phục kết nối ổn định.</span>
        </div>
      </div>
    );
  }

  return null;
}
