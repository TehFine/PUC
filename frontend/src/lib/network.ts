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

/** Ngưỡng thời gian phản hồi thực tế để coi một request là chậm. */
const SLOW_REQUEST_MS = 3500;
/** Ngưỡng một request cực chậm (bật cảnh báo ngay mà không cần đợi 2 request liên tiếp). */
const VERY_SLOW_REQUEST_MS = 5500;
/** Ngưỡng phản hồi nhanh chứng tỏ mạng đã ổn định trở lại. */
const FAST_REQUEST_MS = 1000;
/** Sau khoảng thời gian này không còn request chậm nào thì tự gỡ trạng thái mạng yếu. */
const SLOW_MEMORY_MS = 30_000;

const listeners = new Set<() => void>();
let observedSlow = false;
let slowStreak = 0;
let fastStreak = 0;
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
  // Chỉ báo mạng yếu từ Network Information API khi thực sự rơi vào sóng 2G hoặc độ trễ cực cao kèm băng thông nghẽn,
  // tránh báo nhầm lúc mới mở trang trên máy tính/Wi-Fi khi trình duyệt chưa đo xong băng thông.
  const is2G = connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
  const isSeverelyCongested =
    (connection.rtt ?? 0) >= 1000 && (connection.downlink ?? 10) > 0 && (connection.downlink ?? 10) < 0.5;
  return is2G || isSeverelyCongested ? "slow" : "good";
}

/**
 * Đo thời gian phản hồi thực tế của từng request API:
 * - Bật cảnh báo mạng yếu khi có 2 request liên tiếp >= 3.5s hoặc 1 request >= 5.5s.
 * - Tự động gỡ trạng thái mạng yếu ngay khi có 2 request liên tiếp phản hồi nhanh (< 1s).
 */
export function reportRequestTime(ms: number) {
  if (ms >= SLOW_REQUEST_MS) {
    slowStreak += 1;
    fastStreak = 0;
    if (ms >= VERY_SLOW_REQUEST_MS || slowStreak >= 2) {
      clearTimeout(observedTimer);
      const changed = !observedSlow;
      observedSlow = true;
      observedTimer = setTimeout(() => {
        observedSlow = false;
        slowStreak = 0;
        emit();
      }, SLOW_MEMORY_MS);
      if (changed) emit();
    }
    return;
  }

  if (ms < FAST_REQUEST_MS) {
    slowStreak = 0;
    if (observedSlow) {
      fastStreak += 1;
      if (fastStreak >= 2) {
        clearTimeout(observedTimer);
        observedSlow = false;
        fastStreak = 0;
        emit();
      }
    }
  }
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
