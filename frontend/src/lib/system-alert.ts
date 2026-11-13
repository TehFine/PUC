"use client";

import { useSyncExternalStore } from "react";
import type { HealthCheckResponse, SystemAlertRecord } from "@/types/notifications";

export type RuntimeIncidentKind = "unreachable" | "server_error" | "chunk_error";

export interface RuntimeIncident {
  id: string;
  kind: RuntimeIncidentKind;
  status?: number;
  title: string;
  message: string;
  occurredAt: number;
}

export interface SystemAlertSnapshot {
  runtimeIncident: RuntimeIncident | null;
  broadcastAlert: SystemAlertRecord | null;
  recoveredAt: number | null;
  checking: boolean;
}

const HEALTH_POLL_NORMAL_MS = 45_000;
const HEALTH_POLL_DEGRADED_MS = 10_000;
const RECOVERED_BANNER_MS = 3_800;

let state: SystemAlertSnapshot = {
  runtimeIncident: null,
  broadcastAlert: null,
  recoveredAt: null,
  checking: false,
};

const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let recoveredTimer: ReturnType<typeof setTimeout> | undefined;
let monitorMounted = false;
let inFlightCheck: Promise<HealthCheckResponse | null> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<SystemAlertSnapshot>) {
  state = { ...state, ...patch };
  emit();
}

function markRecovered() {
  if (recoveredTimer) clearTimeout(recoveredTimer);
  const now = Date.now();
  setState({ runtimeIncident: null, recoveredAt: now });
  recoveredTimer = setTimeout(() => {
    if (state.recoveredAt === now) {
      setState({ recoveredAt: null });
    }
  }, RECOVERED_BANNER_MS);
}

/**
 * Được gọi tự động từ `api-client.ts` khi máy chủ không phản hồi (dù điện thoại/máy tính vẫn có mạng)
 * hoặc trả về mã lỗi máy chủ nghiêm trọng (500, 502, 503, 504).
 */
export function reportServerFailure(
  kind: "unreachable" | "server_error",
  status?: number,
  detail?: string,
): void {
  if (typeof window === "undefined") return;
  if (kind === "unreachable" && typeof navigator !== "undefined" && navigator.onLine === false) {
    // Mất mạng phía thiết bị đã có NetworkStatus xử lý riêng.
    return;
  }

  // Với lỗi 500 đơn lẻ do 1 thao tác nghiệp vụ, báo ngay nhưng tự kiểm tra lại /api/health để xác thực.
  const isGatewayOrDown =
    kind === "unreachable" || status === 502 || status === 503 || status === 504;

  const title = isGatewayOrDown
    ? "Mất kết nối tới máy chủ hệ thống HTX"
    : "Hệ thống đang gặp sự cố xử lý tạm thời";

  const message = isGatewayOrDown
    ? "Máy chủ hoặc cơ sở dữ liệu đang gián đoạn tạm thời. Hệ thống đang tự động kết nối lại — vui lòng chờ ít phút hoặc liên hệ kỹ thuật HTX nếu cần gấp."
    : detail && detail !== "Không xử lý được yêu cầu. Vui lòng thử lại."
      ? detail
      : "Yêu cầu vừa thực hiện gặp lỗi máy chủ nội bộ (500). Vui lòng thử lại sau ít giây hoặc báo kỹ thuật HTX.";

  setState({
    recoveredAt: null,
    runtimeIncident: {
      id: `rt-${kind}-${status ?? 0}`,
      kind,
      status,
      title,
      message,
      occurredAt: Date.now(),
    },
  });

  scheduleNextPoll(HEALTH_POLL_DEGRADED_MS);
}

/**
 * Được gọi từ `api-client.ts` khi các yêu cầu API phản hồi bình thường (< 500).
 */
export function reportServerHealthy(): void {
  if (typeof window === "undefined") return;
  if (state.runtimeIncident && state.runtimeIncident.kind !== "chunk_error") {
    markRecovered();
    scheduleNextPoll(HEALTH_POLL_NORMAL_MS);
  }
}

/** Chủ động kiểm tra `/api/health` để lấy trạng thái máy chủ, CSDL và thông báo khẩn đang bật. */
export async function checkSystemHealth(): Promise<HealthCheckResponse | null> {
  if (typeof window === "undefined") return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  if (inFlightCheck) return inFlightCheck;

  setState({ checking: true });
  inFlightCheck = (async () => {
    try {
      const res = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as HealthCheckResponse | null;

      if (!res.ok || !data || data.status === "degraded" || data.database === "down") {
        setState({
          checking: false,
          recoveredAt: null,
          broadcastAlert: data?.alert ?? state.broadcastAlert,
          runtimeIncident: {
            id: `rt-health-${res.status}`,
            kind: res.status === 503 ? "server_error" : "unreachable",
            status: res.status,
            title:
              data?.database === "down"
                ? "Cơ sở dữ liệu hệ thống đang gián đoạn"
                : "Máy chủ hệ thống đang bảo trì hoặc quá tải",
            message:
              "Hệ thống đang tự động khôi phục kết nối. Dữ liệu của bạn vẫn an toàn — vui lòng thử lại sau ít phút.",
            occurredAt: Date.now(),
          },
        });
        scheduleNextPoll(HEALTH_POLL_DEGRADED_MS);
        return data;
      }

      const hadOutage =
        state.runtimeIncident !== null && state.runtimeIncident.kind !== "chunk_error";
      if (hadOutage) {
        if (recoveredTimer) clearTimeout(recoveredTimer);
        const now = Date.now();
        setState({
          checking: false,
          broadcastAlert: data.alert ?? null,
          runtimeIncident: null,
          recoveredAt: now,
        });
        recoveredTimer = setTimeout(() => {
          if (state.recoveredAt === now) {
            setState({ recoveredAt: null });
          }
        }, RECOVERED_BANNER_MS);
      } else {
        setState({
          checking: false,
          broadcastAlert: data.alert ?? null,
        });
      }

      scheduleNextPoll(data.alert ? 20_000 : HEALTH_POLL_NORMAL_MS);
      return data;
    } catch {
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        reportServerFailure("unreachable");
      }
      setState({ checking: false });
      scheduleNextPoll(HEALTH_POLL_DEGRADED_MS);
      return null;
    } finally {
      inFlightCheck = null;
    }
  })();

  return inFlightCheck;
}

/** Đồng bộ ngay sau khi Quản trị viên vừa phát hoặc gỡ thông báo khẩn. */
export function notifySystemAlertsChanged(): void {
  void checkSystemHealth();
}

function scheduleNextPoll(delayMs: number) {
  if (typeof window === "undefined" || !monitorMounted) return;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      // Tạm nghỉ hoàn toàn khi tab ẩn; sự kiện visibilitychange sẽ tự đánh thức lại ngay khi mở tab.
      return;
    }
    void checkSystemHealth();
  }, delayMs);
}

function isChunkLoadFailure(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? `${reason.name} ${reason.message}`
      : typeof reason === "string"
        ? reason
        : "";
  return (
    msg.includes("ChunkLoadError") ||
    msg.includes("Loading chunk") ||
    msg.includes("Failed to fetch dynamically imported module")
  );
}

function startMonitorIfNeeded() {
  if (typeof window === "undefined" || monitorMounted) return;
  monitorMounted = true;

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      void checkSystemHealth();
    }
  };
  const onOnline = () => {
    void checkSystemHealth();
  };
  const onWindowError = (event: ErrorEvent) => {
    if (isChunkLoadFailure(event.error ?? event.message)) {
      setState({
        runtimeIncident: {
          id: "rt-chunk-error",
          kind: "chunk_error",
          title: "Hệ thống vừa cập nhật phiên bản mới",
          message: "Vui lòng bấm “Tải lại trang” để đồng bộ bản cập nhật mới nhất và tiếp tục thao tác.",
          occurredAt: Date.now(),
        },
      });
    }
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadFailure(event.reason)) {
      setState({
        runtimeIncident: {
          id: "rt-chunk-error",
          kind: "chunk_error",
          title: "Hệ thống vừa cập nhật phiên bản mới",
          message: "Vui lòng bấm “Tải lại trang” để đồng bộ bản cập nhật mới nhất và tiếp tục thao tác.",
          occurredAt: Date.now(),
        },
      });
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  void checkSystemHealth();

  return () => {
    monitorMounted = false;
    if (pollTimer) clearTimeout(pollTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

let stopMonitorCleanup: (() => void) | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    stopMonitorCleanup = startMonitorIfNeeded();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopMonitorCleanup) {
      stopMonitorCleanup();
      stopMonitorCleanup = undefined;
    }
  };
}

const SERVER_SNAPSHOT: SystemAlertSnapshot = {
  runtimeIncident: null,
  broadcastAlert: null,
  recoveredAt: null,
  checking: false,
};

export function useSystemAlertSnapshot(): SystemAlertSnapshot {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_SNAPSHOT);
}

export function clearRuntimeIncident(): void {
  if (state.runtimeIncident) {
    setState({ runtimeIncident: null });
  }
}
