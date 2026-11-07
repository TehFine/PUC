// Sự kiện nội bộ để các bộ đếm (badge thanh điều hướng, tổng quan) tải lại sau khi dữ liệu thay đổi.

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
export const ADMIN_EDIT_PLOT_EVENT = "admin:edit-plot-shape";

export function requestEditPlotShape(plotCode: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(EDIT_PLOT_STORAGE_KEY, plotCode);
  } catch {
    // ignore storage errors
  }
  requestAdminNavigate("zones");
  window.dispatchEvent(new CustomEvent<string>(ADMIN_EDIT_PLOT_EVENT, { detail: plotCode }));
}

export function consumePendingEditPlotCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const code = window.sessionStorage.getItem(EDIT_PLOT_STORAGE_KEY);
    if (code) {
      window.sessionStorage.removeItem(EDIT_PLOT_STORAGE_KEY);
      return code;
    }
  } catch {
    // ignore storage errors
  }
  return null;
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
