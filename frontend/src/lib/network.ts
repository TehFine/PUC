"use client";

import { useSyncExternalStore } from "react";

/** Chất lượng mạng hiện tại: tốt, yếu (chậm) hoặc mất kết nối. */
export type NetQuality = "good" | "slow" | "offline";

/** Chế độ hiệu năng hiển thị: "lite" dành cho thiết bị cấu hình yếu / mạng chậm, "full" cho thiết bị mạnh. */
export type PerfTier = "lite" | "full";

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface NavigatorWithHardware extends Navigator {
  connection?: NetworkInformationLike;
  deviceMemory?: number;
}

/** Một request chậm hơn ngưỡng này được coi là dấu hiệu mạng yếu (cho trình duyệt không có Network Information API). */
const SLOW_REQUEST_MS = 3000;
/** Sau chừng này thời gian không thấy request chậm nào nữa thì coi như mạng đã ổn lại. */
const SLOW_MEMORY_MS = 45_000;

const listeners = new Set<() => void>();
let observedSlow = false;
let observedTimer: ReturnType<typeof setTimeout> | undefined;

const emit = () => listeners.forEach((listener) => listener());

const getConnection = (): NetworkInformationLike | undefined =>
  (navigator as NavigatorWithHardware).connection;

/** Cho phép thử giao diện mạng yếu bằng cách thêm ?net=slow (hoặc ?net=offline) vào địa chỉ trang. */
function forcedQuality(): NetQuality | null {
  const value = new URLSearchParams(window.location.search).get("net");
  return value === "slow" || value === "offline" || value === "good" ? value : null;
}

/** Cho phép ép chế độ hiệu năng bằng ?perf=lite hoặc ?perf=full. */
function forcedPerfTier(): PerfTier | null {
  const value = new URLSearchParams(window.location.search).get("perf");
  return value === "lite" || value === "full" ? value : null;
}

/**
 * Phát hiện thiết bị cấu hình yếu (CPU <= 4 nhân, RAM <= 4GB, chế độ tiết kiệm dữ liệu,
 * ưu tiên giảm chuyển động, hoặc mạng đang yếu) để giảm tải GPU/CPU mà vẫn giữ nguyên 100% tính năng.
 */
export function isLowEndDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const forced = forcedPerfTier();
  if (forced) return forced === "lite";
  const nav = navigator as NavigatorWithHardware;
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) {
    return true;
  }
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 4) {
    return true;
  }
  if (nav.connection?.saveData === true) {
    return true;
  }
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return true;
  }
  return readQuality() !== "good";
}

function readPerfTier(): PerfTier {
  return isLowEndDevice() ? "lite" : "full";
}

function readQuality(): NetQuality {
  const forced = forcedQuality();
  if (forced) return forced;
  if (!navigator.onLine) return "offline";
  if (observedSlow) return "slow";
  const connection = getConnection();
  if (!connection) return "good";
  const slowType = connection.effectiveType === "slow-2g" || connection.effectiveType === "2g" || connection.effectiveType === "3g";
  const slowRtt = (connection.rtt ?? 0) >= 600;
  const slowLink = (connection.downlink ?? 0) > 0 && (connection.downlink ?? 0) < 1.2;
  return slowType || slowRtt || slowLink || connection.saveData === true ? "slow" : "good";
}

/** Gọi sau mỗi request: nếu quá chậm thì đánh dấu mạng yếu một lúc để giao diện chuyển sang chế độ nhẹ. */
export function reportRequestTime(ms: number) {
  if (ms < SLOW_REQUEST_MS) return;
  clearTimeout(observedTimer);
  const changed = !observedSlow;
  observedSlow = true;
  observedTimer = setTimeout(() => {
    observedSlow = false;
    emit();
  }, SLOW_MEMORY_MS);
  if (changed) emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  const connection = getConnection();
  connection?.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
    connection?.removeEventListener("change", listener);
  };
}

/** Theo dõi chất lượng mạng; máy chủ và lần vẽ đầu tiên luôn trả về "good" để không lệch hydration. */
export function useNetworkQuality(): NetQuality {
  return useSyncExternalStore(subscribe, readQuality, () => "good");
}

/** Theo dõi chế độ hiệu năng thiết bị ("lite" | "full"); mặc định SSR là "full". */
export function usePerformanceTier(): PerfTier {
  return useSyncExternalStore(subscribe, readPerfTier, () => "full");
}
