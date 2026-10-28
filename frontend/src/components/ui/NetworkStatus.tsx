"use client";

import { useEffect, useRef, useState } from "react";
import { useNetworkQuality, type NetQuality } from "@/lib/network";
import "./skeleton.css";

type Toast = { kind: "slow" | "offline" | "ok"; text: string } | null;

const MESSAGES = {
  slow: "Mạng đang yếu, trang có thể tải chậm hơn bình thường.",
  offline: "Bạn đang mất kết nối mạng. Trang sẽ tiếp tục khi có mạng lại.",
  ok: "Đã kết nối lại.",
} as const;

function IosSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="11" y="2" width="2" height="5.5" rx="1" opacity="1.0" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(30 12 12)" opacity="0.92" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(60 12 12)" opacity="0.84" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(90 12 12)" opacity="0.75" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(120 12 12)" opacity="0.67" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(150 12 12)" opacity="0.58" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(180 12 12)" opacity="0.50" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(210 12 12)" opacity="0.42" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(240 12 12)" opacity="0.33" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(270 12 12)" opacity="0.25" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(300 12 12)" opacity="0.17" />
      <rect x="11" y="2" width="2" height="5.5" rx="1" transform="rotate(330 12 12)" opacity="0.08" />
    </svg>
  );
}

/**
 * Ghi trạng thái mạng vào <html data-net="…"> (CSS dựa vào đó để hiện skeleton ngay khi mạng yếu)
 * và báo cho người dùng biết bằng một dải thông báo nhỏ, tự ẩn.
 */
export default function NetworkStatus() {
  const quality = useNetworkQuality();
  const [toast, setToast] = useState<Toast>(null);
  const previous = useRef<NetQuality>("good");

  useEffect(() => {
    document.documentElement.dataset.net = quality;
    return () => {
      delete document.documentElement.dataset.net;
    };
  }, [quality]);

  useEffect(() => {
    const before = previous.current;
    previous.current = quality;

    let next: Toast = null;
    if (quality === "slow") next = { kind: "slow", text: MESSAGES.slow };
    else if (quality === "offline") next = { kind: "offline", text: MESSAGES.offline };
    else if (before === "offline") next = { kind: "ok", text: MESSAGES.ok };

    // Cập nhật thông báo theo thay đổi của trạng thái mạng (hệ thống bên ngoài).
    setToast(next);
    if (!next || next.kind === "offline") return;
    const timer = setTimeout(() => setToast(null), next.kind === "ok" ? 2500 : 7000);
    return () => clearTimeout(timer);
  }, [quality]);

  if (!toast) return null;
  return (
    <div className={`net-toast is-${toast.kind === "slow" ? "slow" : toast.kind}`} role="status" aria-live="polite">
      {toast.kind === "slow" ? (
        <IosSpinner className="net-toast-ios-spinner" />
      ) : (
        <span className="net-toast-dot" aria-hidden="true" />
      )}
      <span>{toast.text}</span>
    </div>
  );
}
