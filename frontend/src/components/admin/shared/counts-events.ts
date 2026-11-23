// Sự kiện nội bộ để các bộ đếm (badge thanh điều hướng, tổng quan) tải lại sau khi dữ liệu thay đổi.

import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
  getAuthScopeUser,
} from "@/lib/api-client";

export const ADMIN_COUNTS_EVENT = "admin:counts-changed";

/** Gọi sau mỗi thao tác ghi có thể làm thay đổi số hồ sơ chờ duyệt / vi phạm mở / đăng ký chờ. */
export function notifyCountsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ADMIN_COUNTS_EVENT));
}

/** Đăng ký lắng nghe sự kiện thay đổi số đếm; trả về hàm hủy đăng ký. */
export function onCountsChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ADMIN_COUNTS_EVENT, listener);
  return () => window.removeEventListener(ADMIN_COUNTS_EVENT, listener);
}

/** Sự kiện yêu cầu khu quản trị chuyển sang một mục (thanh điều hướng lắng nghe). */
export const ADMIN_NAVIGATE_EVENT = "admin:navigate";

export function requestAdminNavigate(section: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<string>(ADMIN_NAVIGATE_EVENT, { detail: section }));
}

export function onAdminNavigate(listener: (section: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<string>).detail;
    if (typeof detail === "string" && detail) listener(detail);
  };
  window.addEventListener(ADMIN_NAVIGATE_EVENT, handler);
  return () => window.removeEventListener(ADMIN_NAVIGATE_EVENT, handler);
}

const EDIT_PLOT_STORAGE_KEY = "puc:pending-edit-plot-code";
const PENDING_EDIT_PLOT_TTL_MS = 15_000;
export const ADMIN_EDIT_PLOT_EVENT = "admin:edit-plot-shape";

interface PendingEditPlotPayload {
  code: string;
  at: number;
  u: number | null;
}

function readValidPendingEditPlotPayload(): PendingEditPlotPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(EDIT_PLOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingEditPlotPayload>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.code !== "string" ||
      !parsed.code.trim() ||
      typeof parsed.at !== "number" ||
      !Number.isFinite(parsed.at) ||
      Date.now() - parsed.at > PENDING_EDIT_PLOT_TTL_MS
    ) {
      window.sessionStorage.removeItem(EDIT_PLOT_STORAGE_KEY);
      return null;
    }
    const activeUser = getAuthScopeUser();
    if (activeUser !== null && parsed.u !== null && parsed.u !== activeUser) {
      window.sessionStorage.removeItem(EDIT_PLOT_STORAGE_KEY);
      return null;
    }
    return { code: parsed.code.trim(), at: parsed.at, u: parsed.u ?? null };
  } catch {
    try {
      window.sessionStorage.removeItem(EDIT_PLOT_STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

export function hasPendingEditPlotCode(): boolean {
  return readValidPendingEditPlotPayload() !== null;
}

export function requestEditPlotShape(plotCode: string): void {
  if (typeof window === "undefined") return;
  const trimmed = plotCode.trim();
  if (!trimmed) return;
  try {
    const payload: PendingEditPlotPayload = {
      code: trimmed,
      at: Date.now(),
      u: getAuthScopeUser(),
    };
    window.sessionStorage.setItem(EDIT_PLOT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
  requestAdminNavigate("zones");
  window.dispatchEvent(new CustomEvent<string>(ADMIN_EDIT_PLOT_EVENT, { detail: trimmed }));
}

export function consumePendingEditPlotCode(): string | null {
  if (typeof window === "undefined") return null;
  const payload = readValidPendingEditPlotPayload();
  try {
    window.sessionStorage.removeItem(EDIT_PLOT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  return payload ? payload.code : null;
}

const APPROVAL_TAB_STORAGE_KEY = "puc:pending-approval-tab";
export const ADMIN_APPROVAL_TAB_EVENT = "admin:approval-tab";

export function requestApprovalTab(tab: "pending" | "registrations" | "schedule" | "minutes"): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(APPROVAL_TAB_STORAGE_KEY, tab);
  } catch {
    // ignore storage errors
  }
  requestAdminNavigate("approval");
  window.dispatchEvent(new CustomEvent<string>(ADMIN_APPROVAL_TAB_EVENT, { detail: tab }));
}

export function consumePendingApprovalTab(): "pending" | "registrations" | "schedule" | "minutes" | null {
  if (typeof window === "undefined") return null;
  try {
    const tab = window.sessionStorage.getItem(APPROVAL_TAB_STORAGE_KEY);
    if (tab === "pending" || tab === "registrations" || tab === "schedule" || tab === "minutes") {
      window.sessionStorage.removeItem(APPROVAL_TAB_STORAGE_KEY);
      return tab;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export type AdminJournalTabId = "journal" | "violations" | "spray";
const JOURNAL_TAB_STORAGE_KEY = "puc:pending-journal-tab";
export const ADMIN_JOURNAL_TAB_EVENT = "admin:journal-tab";

export function requestJournalTab(tab: AdminJournalTabId): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(JOURNAL_TAB_STORAGE_KEY, tab);
  } catch {
    // ignore storage errors
  }
  requestAdminNavigate("journal");
  window.dispatchEvent(new CustomEvent<AdminJournalTabId>(ADMIN_JOURNAL_TAB_EVENT, { detail: tab }));
}

export function consumePendingJournalTab(): AdminJournalTabId | null {
  if (typeof window === "undefined") return null;
  try {
    const tab = window.sessionStorage.getItem(JOURNAL_TAB_STORAGE_KEY);
    if (tab === "journal" || tab === "violations" || tab === "spray") {
      window.sessionStorage.removeItem(JOURNAL_TAB_STORAGE_KEY);
      return tab;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export type AdminSystemTabId =
  | "accounts"
  | "deletions"
  | "trace-requests"
  | "roles"
  | "alerts"
  | "audit";
const SYSTEM_TAB_STORAGE_KEY = "puc:pending-system-tab";
const DELETION_REQ_ID_STORAGE_KEY = "puc:pending-deletion-req-id";
const TRACE_REQ_ID_STORAGE_KEY = "puc:pending-trace-req-id";
export const ADMIN_SYSTEM_TAB_EVENT = "admin:system-tab";

export function requestSystemTab(tab: AdminSystemTabId, targetRequestId?: number | null): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SYSTEM_TAB_STORAGE_KEY, tab);
    if (targetRequestId && Number.isFinite(targetRequestId) && targetRequestId > 0) {
      if (tab === "trace-requests") {
        window.sessionStorage.setItem(TRACE_REQ_ID_STORAGE_KEY, String(targetRequestId));
      } else {
        window.sessionStorage.setItem(DELETION_REQ_ID_STORAGE_KEY, String(targetRequestId));
      }
    }
  } catch {
    // ignore storage errors
  }
  requestAdminNavigate("system");
  window.dispatchEvent(new CustomEvent<AdminSystemTabId>(ADMIN_SYSTEM_TAB_EVENT, { detail: tab }));
}

export function consumePendingSystemTab(): AdminSystemTabId | null {
  if (typeof window === "undefined") return null;
  try {
    const tab = window.sessionStorage.getItem(SYSTEM_TAB_STORAGE_KEY);
    if (
      tab === "accounts" ||
      tab === "deletions" ||
      tab === "trace-requests" ||
      tab === "roles" ||
      tab === "alerts" ||
      tab === "audit"
    ) {
      window.sessionStorage.removeItem(SYSTEM_TAB_STORAGE_KEY);
      return tab;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function consumePendingDeletionRequestId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DELETION_REQ_ID_STORAGE_KEY);
    if (raw) {
      window.sessionStorage.removeItem(DELETION_REQ_ID_STORAGE_KEY);
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) return num;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function consumePendingTraceRequestId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TRACE_REQ_ID_STORAGE_KEY);
    if (raw) {
      window.sessionStorage.removeItem(TRACE_REQ_ID_STORAGE_KEY);
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) return num;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

if (typeof window !== "undefined") {
  const clearAllPendingIntents = () => {
    try {
      window.sessionStorage.removeItem(EDIT_PLOT_STORAGE_KEY);
      window.sessionStorage.removeItem(APPROVAL_TAB_STORAGE_KEY);
      window.sessionStorage.removeItem(JOURNAL_TAB_STORAGE_KEY);
      window.sessionStorage.removeItem(SYSTEM_TAB_STORAGE_KEY);
      window.sessionStorage.removeItem(DELETION_REQ_ID_STORAGE_KEY);
      window.sessionStorage.removeItem(TRACE_REQ_ID_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };
  window.addEventListener(AUTH_LOGOUT_EVENT, clearAllPendingIntents);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearAllPendingIntents);
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, clearAllPendingIntents);
}
