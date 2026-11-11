let lockCount = 0;
let lockedScrollX = 0;
let lockedScrollY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let cleanupListeners: (() => void) | null = null;

const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], [data-scroll-lock-allow]';
const INTERACTIVE_KEY_SELECTOR =
  'input, textarea, select, button, a, summary, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="slider"], [role="tab"], [role="radio"]';
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function isScrollableOverflow(value: string): boolean {
  return value === "auto" || value === "scroll" || value === "overlay";
}

/**
 * Kiểm tra xem từ `target` đi ngược lên `dialogRoot` có vùng cuộn nào
 * còn dư hành trình theo hướng `(deltaX, deltaY)` hay không.
 */
function canScrollWithinDialog(
  target: Element,
  dialogRoot: Element,
  deltaX: number,
  deltaY: number,
): boolean {
  if (deltaX === 0 && deltaY === 0) return true;

  let el: Element | null = target;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      const style = window.getComputedStyle(el);

      if (deltaY !== 0 && isScrollableOverflow(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if (deltaY < 0 && el.scrollTop > 0) return true;
        if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 0.5) return true;
      }

      if (deltaX !== 0 && isScrollableOverflow(style.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        if (deltaX < 0 && el.scrollLeft > 0) return true;
        if (deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 0.5) return true;
      }
    }

    if (el === dialogRoot) break;
    el = el.parentElement;
  }

  return false;
}

function hasScrollableAncestorInDialog(target: Element, dialogRoot: Element): boolean {
  let el: Element | null = target;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      const style = window.getComputedStyle(el);
      if (isScrollableOverflow(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        return true;
      }
    }
    if (el === dialogRoot) break;
    el = el.parentElement;
  }
  return false;
}

function attachRootScrollLock(): () => void {
  lockedScrollX = window.scrollX;
  lockedScrollY = window.scrollY;

  const onWheel = (event: WheelEvent) => {
    // Cho phép tổ hợp phóng to / thu nhỏ trình duyệt (Ctrl/Cmd + lăn chuột hoặc chụm 2 ngón trên trackpad)
    if (event.ctrlKey || event.metaKey) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      if (event.cancelable) event.preventDefault();
      return;
    }

    // Nhường hoàn toàn cho bản đồ tương tác Leaflet tự xử lý phóng to / thu nhỏ
    if (target.closest(".leaflet-container")) return;

    const dialogRoot = target.closest(DIALOG_SELECTOR);
    if (!dialogRoot) {
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (!canScrollWithinDialog(target, dialogRoot, event.deltaX, event.deltaY)) {
      if (event.cancelable) event.preventDefault();
    }
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 1) {
      lastTouchX = event.touches[0].clientX;
      lastTouchY = event.touches[0].clientY;
    }
  };

  const onTouchMove = (event: TouchEvent) => {
    // Nếu useSheetSwipe hoặc thành phần con đã chủ động chặn cuộn để kéo popup thì giữ nguyên
    if (event.defaultPrevented) return;
    // Cho phép thao tác đa điểm (chụm 2 ngón phóng to phiếu kiểm nghiệm / bản đồ)
    if (event.touches.length > 1) return;

    const touch = event.touches[0];
    if (!touch) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (target.closest('.leaflet-container, input[type="range"]')) {
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      return;
    }

    const dialogRoot = target.closest(DIALOG_SELECTOR);
    if (!dialogRoot) {
      if (event.cancelable) event.preventDefault();
      return;
    }

    const deltaX = lastTouchX - touch.clientX;
    const deltaY = lastTouchY - touch.clientY;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;

    if (!canScrollWithinDialog(target, dialogRoot, deltaX, deltaY)) {
      if (event.cancelable) event.preventDefault();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!SCROLL_KEYS.has(event.key)) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(INTERACTIVE_KEY_SELECTOR)) return;

    const dialogRoot = target?.closest(DIALOG_SELECTOR);
    if (target && dialogRoot && hasScrollableAncestorInDialog(target, dialogRoot)) {
      return;
    }

    event.preventDefault();
  };

  const onWindowScroll = (event: Event) => {
    if (
      event.target !== document &&
      event.target !== document.documentElement &&
      event.target !== window
    ) {
      return;
    }
    if (window.scrollX !== lockedScrollX || window.scrollY !== lockedScrollY) {
      window.scrollTo(lockedScrollX, lockedScrollY);
    }
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onWindowScroll, { passive: true });

  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", onWindowScroll);
  };
}

/**
 * Khóa cuộn trang nền khi mở popup / sheet / modal mà KHÔNG gán `overflow: hidden` lên `<html>` hay `<body>`.
 *
 * Giữ thanh cuộn dọc của trình duyệt đứng yên 100%, không làm thay đổi `clientWidth` nên khung hình
 * phía sau và thanh điều hướng cố định (fixed topbar) tuyệt đối không bị giật ngang khi bật hoặc tắt popup,
 * đồng thời vẫn cho phép cuộn mượt bên trong nội dung của popup.
 */
export function lockRootScroll(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  if (lockCount === 0) {
    cleanupListeners = attachRootScrollLock();
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released || typeof window === "undefined") return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && cleanupListeners) {
      cleanupListeners();
      cleanupListeners = null;
    }
  };
}
