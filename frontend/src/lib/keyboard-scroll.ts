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

  if (field instanceof HTMLTextAreaElement && rect.height > Math.max(120, visibleHeight * 0.58)) {
    const val = field.value || "";
    const caretPos = typeof field.selectionEnd === "number" ? field.selectionEnd : val.length;
    const beforeCaret = val.slice(0, caretPos);
    const currentLine = beforeCaret.split("\n").length - 1;
    const totalLines = Math.max(1, val.split("\n").length);
    const ratio = Math.min(1, Math.max(0, (currentLine + 0.85) / totalLines));
    const caretY = rect.top + Math.max(28, Math.min(rect.height - 8, ratio * rect.height));
    return {
      top: Math.max(wrapTop, caretY - 54),
      bottom: Math.min(rect.bottom + 8, caretY + 26),
    };
  }

  return { top: wrapTop, bottom: rect.bottom };
}

/**
 * Cuộn vùng chứa sao cho ô nhập liệu đang focus (hoặc dòng đang gõ) nằm gọn trong vùng nhìn thấy phía trên bàn phím ảo.
 */
export function ensureFieldVisible(
  field: HTMLElement,
  options?: {
    boundary?: HTMLElement | null;
    mode?: "focus" | "typing";
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
    const safeTop = Math.max(scrollerRect.top, screenTop) + 14;
    const safeBottom = Math.min(scrollerRect.bottom, screenBottom) - 18;
    const visibleHeight = safeBottom - safeTop;
    if (visibleHeight <= 48) return;

    const band = resolveActiveTargetBand(field, visibleHeight);
    const fieldRect = field.getBoundingClientRect();

    if (mode === "typing") {
      if (band.bottom > safeBottom) {
        scroller.scrollTop += band.bottom - safeBottom + 18;
      } else if (band.top < safeTop && fieldRect.height > visibleHeight * 0.7) {
        scroller.scrollTop -= safeTop - band.top + 12;
      }
      return;
    }

    // Khi mở bàn phím ảo hoặc trên màn hình cảm ứng: chủ động đưa ô cuối trang lên vùng 1/3 trên để dễ nhìn và kiểm tra chính tả.
    if (kbOpen || isCoarse) {
      const comfortAnchor = safeTop + Math.min(34, Math.max(8, visibleHeight * 0.12));
      const tooLow = band.bottom > safeBottom - 16 || fieldRect.top > safeTop + visibleHeight * 0.52;
      if (tooLow) {
        const desiredDelta =
          fieldRect.height <= visibleHeight * 0.72
            ? band.top - comfortAnchor
            : band.bottom - (safeBottom - 20);
        if (desiredDelta > 4) {
          scroller.scrollTo({
            top: scroller.scrollTop + desiredDelta,
            behavior: kbOpen ? "auto" : "smooth",
          });
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
      if (delta > 4) {
        scroller.scrollTo({ top: Math.max(0, scroller.scrollTop - delta), behavior: "smooth" });
      }
    }
    return;
  }

  // Trường hợp biểu mẫu nằm trực tiếp trên trang chính (ngoài Modal/Sheet)
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
        window.scrollBy({ top: delta, behavior: kbOpen ? "auto" : "smooth" });
      }
      return;
    }
  } else if (band.bottom > safeBottom - 12) {
    window.scrollBy({ top: band.bottom - (safeBottom - 48), behavior: "smooth" });
    return;
  }

  if (band.top < safeTop) {
    window.scrollBy({ top: band.top - safeTop - 10, behavior: "smooth" });
  }
}

/**
 * Đồng bộ chiều cao thực tế của vùng nhìn (`visualViewport`) cho Modal / Bottom Sheet / Drawer
 * khi bàn phím ảo trên iOS Safari, Android Chrome hoặc Zalo/Messenger WebView bật lên,
 * đồng thời tự động cuộn ô nhập liệu ở cuối biểu mẫu lên trên bàn phím.
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
    let baselineHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
    let kbOpen = false;
    let focusTimers: number[] = [];

    const clearFocusTimers = () => {
      for (let i = 0; i < focusTimers.length; i++) {
        window.clearTimeout(focusTimers[i]);
      }
      focusTimers = [];
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

      const active = document.activeElement;
      const focusedInside = isTextEntryElement(active) && panel.contains(active);

      if (!focusedInside) {
        baselineHeight = Math.max(window.innerHeight, vv.height);
        if (kbOpen) clearViewportStyles();
        return;
      }

      const heightDrop = Math.max(baselineHeight - vv.height, window.innerHeight - vv.height);
      const nextKbOpen = heightDrop > 90;
      kbOpen = nextKbOpen;

      if (nextKbOpen) {
        backdrop.dataset.kbOpen = "true";
        backdrop.style.setProperty("--vv-height", `${Math.round(vv.height)}px`);
        backdrop.style.setProperty("--vv-top", `${Math.max(0, Math.round(vv.offsetTop))}px`);
      } else {
        clearViewportStyles();
      }

      if (isTextEntryElement(active)) {
        ensureFieldVisible(active, {
          boundary: panel,
          mode: "focus",
          keyboardOpen: nextKbOpen,
        });
      }
    };

    const scheduleFocusReveal = (target: HTMLElement) => {
      clearFocusTimers();
      syncViewport();
      const delays = [60, 180, 340];
      for (let i = 0; i < delays.length; i++) {
        const id = window.setTimeout(() => {
          if (document.activeElement !== target || isClosingRef?.current) return;
          syncViewport();
          ensureFieldVisible(target, {
            boundary: panel,
            mode: "focus",
            keyboardOpen: kbOpen,
          });
        }, delays[i]);
        focusTimers.push(id);
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!isTextEntryElement(target) || !panel.contains(target)) return;
      scheduleFocusReveal(target);
    };

    const onFocusOut = () => {
      clearFocusTimers();
      const id = window.setTimeout(() => {
        if (isClosingRef?.current) return;
        const active = document.activeElement;
        if (!isTextEntryElement(active) || !panel.contains(active)) {
          baselineHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
          clearViewportStyles();
        }
      }, 80);
      focusTimers.push(id);
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
      baselineHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
      window.setTimeout(syncViewport, 180);
    };

    panel.addEventListener("focusin", onFocusIn);
    panel.addEventListener("focusout", onFocusOut);
    panel.addEventListener("input", onInput);
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      clearFocusTimers();
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
    let baselineHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
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
      return Math.max(baselineHeight - vv.height, window.innerHeight - vv.height) > 90;
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
      timers.push(
        window.setTimeout(() => {
          if (!isTextEntryElement(document.activeElement)) {
            baselineHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
          }
        }, 100),
      );
    };

    const onInput = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!isTextEntryElement(target) || isInsideDialog(target)) return;
      window.requestAnimationFrame(() => {
        ensureFieldVisible(target, { mode: "typing", keyboardOpen: isKbOpenNow() });
      });
    };

    const onViewportResize = () => {
      const active = document.activeElement;
      if (!isTextEntryElement(active)) {
        baselineHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
        return;
      }
      if (isInsideDialog(active)) return;
      ensureFieldVisible(active, { mode: "focus", keyboardOpen: isKbOpenNow() });
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("input", onInput);
    vv?.addEventListener("resize", onViewportResize);

    return () => {
      clearTimers();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("input", onInput);
      vv?.removeEventListener("resize", onViewportResize);
    };
  }, []);

  return null;
}

