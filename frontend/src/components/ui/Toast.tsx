"use client";

import { useSyncExternalStore } from "react";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function push(tone: ToastTone, message: string, ttl = 4000) {
  const id = nextId++;
  items = [...items, { id, tone, message }];
  emit();
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, ttl);
}

/** Thông báo nổi ngắn sau khi lưu/xóa thành công hoặc lỗi. Gọi được ở bất kỳ đâu phía client. */
export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message, 6000),
  info: (message: string) => push("info", message),
};

const TONE_STYLE: Record<ToastTone, { background: string; color: string }> = {
  success: { background: "#1f5a43", color: "#fff" },
  error: { background: "#9a2f17", color: "#fff" },
  info: { background: "#14372f", color: "#fff" },
};

/** Đặt một lần ở layout gốc. */
export function Toaster() {
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => items,
  );
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(20px + env(safe-area-inset-bottom))",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "min(92vw, 420px)",
        pointerEvents: "none",
      }}
    >
      {list.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          style={{
            ...TONE_STYLE[item.tone],
            padding: "12px 16px",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: "0 10px 30px rgba(20,55,47,.25)",
            pointerEvents: "auto",
          }}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
