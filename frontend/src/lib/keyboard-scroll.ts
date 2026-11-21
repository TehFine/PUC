"use client";

import { useEffect, type RefObject } from "react";

const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "file",
  "range",
  "color",
  "hidden",
  "image",
]);

/**
 * Kiểm tra phần tử có phải ô nhập liệu mở bàn phím ảo (input văn bản/số, textarea, select, contenteditable) hay không.
 */
export function isTextEntryElement(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const inputType = ((el as HTMLInputElement).type || "text").toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(inputType);
  }
  return false;
}

function isScrollableY(el: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

function findNearestScrollContainer(target: HTMLElement, boundary?: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = target.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    if (
      el.classList.contains("modal-body") ||
      el.classList.contains("pt-sheet-body") ||
      (isScrollableY(el) && el.scrollHeight > el.clientHeight + 1)
    ) {
      return el;
    }
    if (boundary && el === boundary) break;
    el = el.parentElement;
  }
  return null;
}

/**
 * Ước lượng tọa độ dọc của con trỏ soạn thảo bên trong `<textarea>` nhiều dòng
 * để khi người dùng gõ văn bản dài, dòng đang gõ luôn nằm trong vùng nhìn thấy.
 */
function resolveActiveTargetBand(field: HTMLElement, visibleHeight: number): { top: number; bottom: number } {
  const rect = field.getBoundingClientRect();
  const fieldWrap = field.closest(".form-group, .pt-field") as HTMLElement | null;
  const wrapTop = fieldWrap ? Math.min(fieldWrap.getBoundingClientRect().top, rect.top) : rect.top - 22;

  if (field instanceof HTMLTextAreaElement && rect.height > Math.max(110, visibleHeight * 0.56)) {
    const val = field.value || "";
    const caretPos = typeof field.selectionEnd === "number" ? field.selectionEnd : val.length;
    const beforeCaret = val.slice(0, caretPos);
    const currentLine = beforeCaret.split("\n").length - 1;
    const totalLines = Math.max(1, val.split("\n").length);
    const ratio = Math.min(1, Math.max(0, (currentLine + 0.85) / totalLines));
    const caretY = rect.top + Math.max(26, Math.min(rect.height - 8, ratio * rect.height));
    return {
      top: Math.max(wrapTop, caretY - 48),
      bottom: Math.min(rect.bottom + 8, caretY + 24),
    };
  }

  return { top: wrapTop, bottom: rect.bottom };
}

/**
 * Cuộn vùng chứa bên trong hộp thoại (hoặc trang chính) sao cho ô nhập liệu đang focus
 * nằm gọn trong khung nhìn phía trên bàn phím ảo, giữ nguyên thanh tiêu đề và thanh nút chân popup.
 */
export function ensureFieldVisible(
  field: HTMLElement,
  options?: {
    boundary?: HTMLElement | null;
    mode?: "focus" | "typing" | "pretap";
    keyboardOpen?: boolean;
  },
): void {
  if (typeof window === "undefined" || !field.isConnected) return;
  const vv = window.visualViewport;
  if (vv && vv.scale > 1.02) return;

  const mode = options?.mode ?? "focus";
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  const kbOpen = Boolean(options?.keyboardOpen);

  const screenTop = vv ? vv.offsetTop : 0;
  const screenBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const scroller = findNearestScrollContainer(field, options?.boundary);

  if (scroller) {
    const scrollerRect = scroller.getBoundingClientRect();
    const safeTop = Math.max(scrollerRect.top, screenTop) + 12;
    const safeBottom = Math.min(scrollerRect.bottom, screenBottom) - 14;
    const visibleHeight = safeBottom - safeTop;
    if (visibleHeight <= 44) return;

    const band = resolveActiveTargetBand(field, visibleHeight);
    const fieldRect = field.getBoundingClientRect();

    // Trước khi bàn phím kịp đẩy khung cố định của trình duyệt di động lên:
    // đưa ngay ô nằm ở nửa dưới màn hình lên vùng 1/4 trên của thân popup một cách tức thời (instant).
    if (mode === "pretap") {
      if (fieldRect.bottom > screenTop + (screenBottom - screenTop) * 0.44) {
        const targetTop = safeTop + Math.min(28, Math.max(8, visibleHeight * 0.08));
        const delta = band.top - targetTop;
        if (delta > 4) {
          scroller.scrollTop += delta;
        }
      }
      return;
    }

    if (mode === "typing") {
      if (band.bottom > safeBottom) {
        scroller.scrollTop += band.bottom - safeBottom + 16;
      } else if (band.top < safeTop && fieldRect.height > visibleHeight * 0.68) {
        scroller.scrollTop -= safeTop - band.top + 12;
      }
      return;
    }

    if (kbOpen || isCoarse) {
      const comfortAnchor = safeTop + Math.min(28, Math.max(8, visibleHeight * 0.1));
      const tooLow = band.bottom > safeBottom - 12 || fieldRect.top > safeTop + visibleHeight * 0.46;
      if (tooLow) {
        const desiredDelta =
          fieldRect.height <= visibleHeight * 0.72
            ? band.top - comfortAnchor
            : band.bottom - (safeBottom - 16);
        if (desiredDelta > 3) {
          scroller.scrollTop += desiredDelta;
        }
        return;
      }
    } else if (band.bottom > safeBottom - 12) {
      const delta = band.bottom - (safeBottom - 44);
      if (delta > 4) {
        scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: "smooth" });
      }
      return;
    }

    if (band.top < safeTop) {
      const delta = safeTop - band.top + 8;
      if (delta > 3) {
        if (kbOpen || isCoarse) {
          scroller.scrollTop = Math.max(0, scroller.scrollTop - delta);
        } else {
          scroller.scrollTo({ top: Math.max(0, scroller.scrollTop - delta), behavior: "smooth" });
        }
      }
    }
    return;
  }

  // Biểu mẫu nằm trực tiếp trên trang chính (ngoài Modal/Sheet)
  const headerOffset = 68;
  const safeTop = screenTop + headerOffset;
  const safeBottom = screenBottom - 24;
  const visibleHeight = safeBottom - safeTop;
  if (visibleHeight <= 60) return;

  const band = resolveActiveTargetBand(field, visibleHeight);
  const fieldRect = field.getBoundingClientRect();

  if (mode === "typing") {
    if (band.bottom > safeBottom) {
      window.scrollBy({ top: band.bottom - safeBottom + 20, behavior: "auto" });
    }
    return;
  }

  if (kbOpen || isCoarse) {
    const comfortAnchor = safeTop + Math.min(36, Math.max(10, visibleHeight * 0.14));
    if (band.bottom > safeBottom - 16 || fieldRect.top > safeTop + visibleHeight * 0.52) {
      const delta =
        fieldRect.height <= visibleHeight * 0.72
          ? band.top - comfortAnchor
          : band.bottom - (safeBottom - 24);
      if (delta > 4) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
      return;
    }
  } else if (band.bottom > safeBottom - 12) {
    window.scrollBy({ top: band.bottom - (safeBottom - 48), behavior: "smooth" });
    return;
  }

  if (band.top < safeTop) {
    window.scrollBy({ top: band.top - safeTop - 10, behavior: kbOpen ? "auto" : "smooth" });
  }
}

/**
 * Neo chặt hộp thoại (Modal / Drawer / Bottom Sheet) khớp chính xác với khung hiển thị thực tế (`visualViewport`)
 * phía trên bàn phím di động:
 * - Ngăn trình duyệt di động đẩy trôi cả khối popup lên cao làm lộ trang nền phía sau.
 * - Giữ thanh tiêu đề ở cạnh trên và thanh nút hành động (`.modal-footer`) nằm ngay sát trên bàn phím.
 * - Đưa ô nhập liệu ở cuối biểu mẫu (như Khuyến cáo nhà nông) vào giữa vùng thân cuộn của popup.
 */
export function useDialogKeyboardViewport(
  backdropRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  isClosingRef?: RefObject<boolean>,
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return;

    const vv = window.visualViewport;
    // Lưu chiều cao khung hình tối đa khi chưa bật bàn phím (chỉ làm mới khi xoay ngang/dọc màn hình),
    // tuyệt đối không ghi đè bằng chiều cao lúc đang chuyển tiếp giữa 2 ô nhập liệu!
    let maxViewportHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
    let kbOpen = false;
    let focusTimers: number[] = [];
    let settleRaf = 0;
    let touchStartPos: { x: number; y: number; target: HTMLElement | null } | null = null;

    const clearFocusTimers = () => {
      for (let i = 0; i < focusTimers.length; i++) {
        window.clearTimeout(focusTimers[i]);
      }
      focusTimers = [];
      if (settleRaf) {
        window.cancelAnimationFrame(settleRaf);
        settleRaf = 0;
      }
    };

    const clearViewportStyles = () => {
      kbOpen = false;
      delete backdrop.dataset.kbOpen;
      backdrop.style.removeProperty("--vv-height");
      backdrop.style.removeProperty("--vv-top");
    };

    const syncViewport = () => {
      if (isClosingRef?.current || panel.dataset.closing === "true") return;
      if (!vv || vv.scale > 1.02) {
        if (kbOpen) clearViewportStyles();
        return;
      }

      maxViewportHeight = Math.max(maxViewportHeight, window.innerHeight, vv.height);

      const active = document.activeElement;
      const focusedInside = isTextEntryElement(active) && panel.contains(active);

      // Nếu trình duyệt di động tự dịch visualViewport.offsetTop lên để tránh bàn phím,
      // hoặc chiều cao vùng nhìn thu hẹp > 80px khi đang đặt con trỏ trong biểu mẫu:
      // khóa khung backdrop + modal khớp khít tọa độ [vv.offsetTop .. vv.offsetTop + vv.height].
      const heightDrop = Math.max(maxViewportHeight - vv.height, window.innerHeight - vv.height);
      const viewportShifted = vv.offsetTop > 1 || heightDrop > 80;
      const nextKbOpen = focusedInside && viewportShifted;
      kbOpen = nextKbOpen;

      if (nextKbOpen) {
        backdrop.dataset.kbOpen = "true";
        backdrop.style.setProperty("--vv-height", `${Math.round(vv.height)}px`);
        backdrop.style.setProperty("--vv-top", `${Math.max(0, Math.round(vv.offsetTop))}px`);
      } else if (!focusedInside && heightDrop <= 80 && vv.offsetTop <= 1) {
        clearViewportStyles();
      } else if (focusedInside) {
        // Bàn phím đang chuẩn bị trượt lên: neo sẵn theo khung nhìn hiện tại để không bị giật
        backdrop.dataset.kbOpen = "true";
        backdrop.style.setProperty("--vv-height", `${Math.round(vv.height)}px`);
        backdrop.style.setProperty("--vv-top", `${Math.max(0, Math.round(vv.offsetTop))}px`);
      }

      if (focusedInside && isTextEntryElement(active)) {
        ensureFieldVisible(active, {
          boundary: panel,
          mode: "focus",
          keyboardOpen: true,
        });
      }
    };

    // Theo dõi liên tục từng khung hình trong 380ms lúc bàn phím di động đang trượt lên
    const startFrameTracking = (target: HTMLElement) => {
      const startMs = performance.now();
      const tick = (now: number) => {
        if (isClosingRef?.current || document.activeElement !== target) {
          settleRaf = 0;
          return;
        }
        syncViewport();
        if (now - startMs < 400) {
          settleRaf = window.requestAnimationFrame(tick);
        } else {
          settleRaf = 0;
        }
      };
      if (settleRaf) window.cancelAnimationFrame(settleRaf);
      settleRaf = window.requestAnimationFrame(tick);
    };

    // Chặn trước hành vi tự đẩy trôi toàn bộ popup của iOS Safari / Android khi chạm vào ô cuối trang:
    // Ngay khoảnh khắc nhấc ngón tay chạm nhẹ (tap < 8px) vào ô nhập liệu ở nửa dưới màn hình,
    // cuộn tức thời thân `.modal-body` đưa ô đó lên nửa trên TRƯỚC KHI sự kiện `focus` kích hoạt bàn phím!
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchStartPos = null;
        return;
      }
      const rawTarget = event.target instanceof Element ? event.target : null;
      const field = rawTarget?.closest('input, textarea, select, [contenteditable="true"]') ?? null;
      if (isTextEntryElement(field) && panel.contains(field)) {
        touchStartPos = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          target: field,
        };
      } else {
        touchStartPos = null;
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!touchStartPos || !touchStartPos.target) return;
      const changed = event.changedTouches[0];
      const { x, y, target } = touchStartPos;
      touchStartPos = null;
      if (!changed) return;
      if (Math.abs(changed.clientX - x) < 9 && Math.abs(changed.clientY - y) < 9) {
        ensureFieldVisible(target, {
          boundary: panel,
          mode: "pretap",
          keyboardOpen: true,
        });
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!isTextEntryElement(target) || !panel.contains(target)) return;
      clearFocusTimers();
      ensureFieldVisible(target, {
        boundary: panel,
        mode: "pretap",
        keyboardOpen: true,
      });
      syncViewport();
      startFrameTracking(target);

      const delays = [120, 260, 440];
      for (let i = 0; i < delays.length; i++) {
        focusTimers.push(
          window.setTimeout(() => {
            if (document.activeElement !== target || isClosingRef?.current) return;
            syncViewport();
          }, delays[i]),
        );
      }
    };

    const onFocusOut = () => {
      clearFocusTimers();
      focusTimers.push(
        window.setTimeout(() => {
          if (isClosingRef?.current) return;
          const active = document.activeElement;
          if (!isTextEntryElement(active) || !panel.contains(active)) {
            clearViewportStyles();
          }
        }, 90),
      );
    };

    const onInput = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!isTextEntryElement(target) || !panel.contains(target)) return;
      window.requestAnimationFrame(() => {
        ensureFieldVisible(target, {
          boundary: panel,
          mode: "typing",
          keyboardOpen: kbOpen,
        });
      });
    };

    const onOrientationChange = () => {
      maxViewportHeight = 0;
      window.setTimeout(() => {
        maxViewportHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
        syncViewport();
      }, 180);
    };

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchend", onTouchEnd, { passive: true });
    panel.addEventListener("focusin", onFocusIn);
    panel.addEventListener("focusout", onFocusOut);
    panel.addEventListener("input", onInput);
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      clearFocusTimers();
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("focusin", onFocusIn);
      panel.removeEventListener("focusout", onFocusOut);
      panel.removeEventListener("input", onInput);
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("orientationchange", onOrientationChange);
      clearViewportStyles();
    };
  }, [backdropRef, panelRef, isClosingRef]);
}

/**
 * Bảo vệ tự động cho các biểu mẫu nằm trực tiếp trên trang chính (ngoài Modal/Sheet),
 * đảm bảo các ô nhập liệu ở cuối trang luôn cuộn lên trên bàn phím ảo khi bấm vào hoặc đang gõ.
 */
export function KeyboardScrollGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    let maxViewportHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
    let timers: number[] = [];

    const clearTimers = () => {
      for (let i = 0; i < timers.length; i++) {
        window.clearTimeout(timers[i]);
      }
      timers = [];
    };

    const isInsideDialog = (el: Element) =>
      Boolean(el.closest('[role="dialog"], [aria-modal="true"]'));

    const isKbOpenNow = () => {
      if (!vv || vv.scale > 1.02) return false;
      maxViewportHeight = Math.max(maxViewportHeight, window.innerHeight, vv.height);
      return Math.max(maxViewportHeight - vv.height, window.innerHeight - vv.height) > 85;
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!isTextEntryElement(target) || isInsideDialog(target)) return;
      clearTimers();
      const delays = [60, 200, 360];
      for (let i = 0; i < delays.length; i++) {
        timers.push(
          window.setTimeout(() => {
            if (document.activeElement !== target) return;
            ensureFieldVisible(target, { mode: "focus", keyboardOpen: isKbOpenNow() });
          }, delays[i]),
        );
      }
    };

    const onFocusOut = () => {
      clearTimers();
    };

    const onInput = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!isTextEntryElement(target) || isInsideDialog(target)) return;
      window.requestAnimationFrame(() => {
        ensureFieldVisible(target, { mode: "typing", keyboardOpen: isKbOpenNow() });
      });
    };

    const onViewportResize = () => {
      if (vv && vv.scale <= 1.02) {
        maxViewportHeight = Math.max(maxViewportHeight, window.innerHeight, vv.height);
      }
      const active = document.activeElement;
      if (!isTextEntryElement(active) || isInsideDialog(active)) return;
      ensureFieldVisible(active, { mode: "focus", keyboardOpen: isKbOpenNow() });
    };

    const onOrientationChange = () => {
      maxViewportHeight = 0;
      window.setTimeout(() => {
        maxViewportHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
      }, 180);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("input", onInput);
    vv?.addEventListener("resize", onViewportResize);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      clearTimers();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("input", onInput);
      vv?.removeEventListener("resize", onViewportResize);
      window.removeEventListener("orientationchange", onOrientationChange);
    };
  }, []);

  return null;
}
