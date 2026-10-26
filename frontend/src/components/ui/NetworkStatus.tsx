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
      <span className="net-toast-dot" aria-hidden="true" />
      <span>{toast.text}</span>
    </div>
  );
}
