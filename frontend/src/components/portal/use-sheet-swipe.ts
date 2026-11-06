"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Thao tác vuốt cho các popup dạng bảng trượt từ dưới lên, lấy cảm hứng từ khung bình luận TikTok / Facebook:
 *
 * - Vuốt trên thanh tiêu đề (handle) → kéo popup xuống ngay.
 * - Vuốt trong phần nội dung:
 *     + Nếu nội dung còn cuộn được lên trên → cuộn nội dung bình thường.
 *     + Khi nội dung đã cuộn lên tới đầu (scrollTop = 0) mà ngón tay vẫn tiếp tục kéo xuống
 *       → chuyển ngay sang kéo cả popup xuống (kể cả giữa chừng một lần vuốt), thả tay để đóng.
 *     + Đang kéo popup mà đẩy ngược lên quá vị trí ban đầu → trả lại quyền cuộn cho nội dung.
 * - Thả tay: đóng nếu kéo đủ xa hoặc vuốt nhanh (flick); ngược lại popup bật về vị trí cũ.
 *
 * Toàn bộ xử lý dùng listener gốc (touchmove non-passive để có thể chặn cuộn) và cập nhật transform trực tiếp
 * trên DOM, không setState trong lúc kéo để giữ 60–120 FPS trên máy yếu.
 */

interface SheetSwipeOptions {
  /** Phần tử popup sẽ được dịch chuyển khi kéo. */
  sheetRef: RefObject<HTMLElement | null>;
  /** Vùng thanh cầm / tiêu đề: chạm vào đây luôn kéo popup (không cuộn nội dung). */
  handleRef?: RefObject<HTMLElement | null>;
  /** Gọi khi người dùng vuốt đủ để đóng; hàm này tự chạy hiệu ứng trượt xuống từ vị trí hiện tại. */
  onDismiss: () => void;
  /** Bật/tắt (ví dụ popup chưa mở). Thay đổi giá trị sẽ gắn lại listener. */
  enabled?: boolean;
}

type Mode = "idle" | "pending" | "scroll" | "drag" | "ignore";

/** Các phần tử không nhận thao tác kéo popup (bản đồ, thanh trượt, ô nhập liệu…). */
const NO_DRAG_SELECTOR =
  "input, textarea, select, [contenteditable='true'], .leaflet-container, [data-no-sheet-drag]";

const START_SLOP = 6; // px: ngưỡng phân biệt chạm nhẹ với vuốt
const SNAP_BACK_MS = 260;

/** Tìm vùng cuộn dọc gần nhất của phần tử được chạm, tính cả bản thân khung popup (boundary). */
function findVerticalScroller(target: EventTarget | null, boundary: HTMLElement): HTMLElement | null {
  let el = target instanceof Element ? (target as HTMLElement) : null;
  while (el) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return el;
    }
    if (el === boundary) break;
    el = el.parentElement;
  }
  const parent = boundary.parentElement;
  if (parent && parent.scrollHeight > parent.clientHeight + 1) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
}

export function useSheetSwipe({ sheetRef, handleRef, onDismiss, enabled = true }: SheetSwipeOptions) {
  // Giữ tham chiếu mới nhất của onDismiss mà không phải gắn lại listener mỗi lần render.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!enabled) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    let mode: Mode = "idle";
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let originY = 0; // Mốc ngón tay tại thời điểm bắt đầu kéo popup
    let offset = 0; // Khoảng dịch chuyển hiện tại của popup
    let inHandle = false;
    let scroller: HTMLElement | null = null;
    let lockedScroller: HTMLElement | null = null;
    let samples: { y: number; t: number }[] = [];
    let snapTimer: ReturnType<typeof setTimeout> | null = null;

    const setTransform = (px: number) => {
      sheet.style.transform = `translate3d(0, ${px}px, 0)`;
    };

    const lockScroller = () => {
      // Khóa cuộn nội dung trong lúc kéo popup để nội dung không trôi theo ngón tay
      // (cần thiết khi trình duyệt đã bắt đầu cuộn và touchmove không còn chặn được).
      if (scroller && !lockedScroller) {
        lockedScroller = scroller;
        scroller.style.overflowY = "hidden";
      }
    };

    const unlockScroller = () => {
      if (lockedScroller) {
        lockedScroller.style.overflowY = "";
        lockedScroller = null;
      }
    };

    const startDrag = (y: number) => {
      if (snapTimer) {
        clearTimeout(snapTimer);
        snapTimer = null;
      }
      mode = "drag";
      originY = y;
      offset = 0;
      samples = [{ y, t: performance.now() }];
      sheet.style.animation = "none";
      sheet.style.transition = "none";
      lockScroller();
    };

    const snapBack = () => {
      sheet.style.transition = `transform ${SNAP_BACK_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      setTransform(0);
      snapTimer = setTimeout(() => {
        sheet.style.transition = "";
        snapTimer = null;
      }, SNAP_BACK_MS + 20);
    };

    const finishDrag = (cancelled: boolean) => {
      unlockScroller();
      const now = performance.now();
      // Vận tốc tính trên ~100ms cuối để nhận diện cú vuốt nhanh (flick)
      const recent = samples.filter((s) => now - s.t <= 100);
      const first = recent[0] ?? samples[0];
      const last = samples[samples.length - 1];
      const velocity = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      const distanceThreshold = Math.min(140, sheet.offsetHeight * 0.28);

      if (!cancelled && (offset > distanceThreshold || (velocity > 0.45 && offset > 16))) {
        dismissRef.current();
      } else if (offset !== 0) {
        snapBack();
      } else {
        sheet.style.transition = "";
      }
      offset = 0;
      samples = [];
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || sheet.style.pointerEvents === "none") {
        mode = "ignore";
        return;
      }
      const target = e.target as Element | null;
      if (target?.closest(NO_DRAG_SELECTOR)) {
        mode = "ignore";
        return;
      }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      inHandle = !!(handleRef?.current && target && handleRef.current.contains(target));
      scroller = inHandle ? null : findVerticalScroller(target, sheet);
      mode = "pending";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (mode === "idle" || mode === "ignore") return;
      const touch = e.touches[0];
      if (!touch) return;
      const y = touch.clientY;
      const stepY = y - lastY;

      if (mode === "pending") {
        const dx = touch.clientX - startX;
        const dy = y - startY;
        if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          // Vuốt ngang (ví dụ thanh tab cuộn ngang): nhường hoàn toàn cho trình duyệt
          mode = "ignore";
          return;
        }
        const atTop = !scroller || scroller.scrollTop <= 1;
        if (inHandle || (atTop && dy > 0)) {
          startDrag(y);
        } else {
          mode = "scroll";
        }
      } else if (mode === "scroll") {
        // Đang cuộn nội dung: khi đã chạm đầu danh sách mà ngón tay vẫn kéo xuống → chuyển sang kéo popup
        if (stepY > 0 && (!scroller || scroller.scrollTop <= 1)) {
          startDrag(y);
        }
      }

      if (mode === "drag") {
        let next = y - originY;
        if (next < 0) {
          const canScrollContent = !!scroller && scroller.scrollHeight > scroller.clientHeight + 1;
          if (canScrollContent && !inHandle) {
            // Đẩy popup ngược lên quá vị trí ban đầu: trả lại quyền cuộn cho nội dung
            setTransform(0);
            offset = 0;
            unlockScroller();
            mode = "scroll";
            lastY = y;
            return;
          }
          next *= 0.15; // Kháng lực đàn hồi khi kéo lên ở thanh tiêu đề
        }
        offset = next;
        setTransform(next);
        samples.push({ y, t: performance.now() });
        if (samples.length > 12) samples.shift();
        if (e.cancelable) e.preventDefault();
      }

      lastY = y;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (mode === "drag") finishDrag(e.type === "touchcancel");
      mode = "idle";
      scroller = null;
    };

    // Kéo bằng chuột / touchpad trên cả thanh tiêu đề lẫn phần thân popup (khi danh sách đã ở đầu trang)
    let mouseActive = false;
    let suppressNextClick = false;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || sheet.style.pointerEvents === "none") return;
      const target = e.target as Element | null;
      if (!target || target.closest(NO_DRAG_SELECTOR)) return;
      inHandle = !!(handleRef?.current && handleRef.current.contains(target));
      if (inHandle && target.closest("button, a")) return;
      scroller = inHandle ? null : findVerticalScroller(target, sheet);
      mouseActive = true;
      startX = e.clientX;
      startY = e.clientY;
      lastY = e.clientY;
      mode = "pending";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!mouseActive || mode === "idle" || mode === "ignore") return;
      const y = e.clientY;
      const stepY = y - lastY;

      if (mode === "pending") {
        const dx = e.clientX - startX;
        const dy = y - startY;
        if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          mode = "ignore";
          return;
        }
        const atTop = !scroller || scroller.scrollTop <= 1;
        if (inHandle || (atTop && dy > 0)) {
          suppressNextClick = true;
          startDrag(y);
        } else {
          mode = "scroll";
        }
      } else if (mode === "scroll") {
        if (stepY > 0 && (!scroller || scroller.scrollTop <= 1)) {
          suppressNextClick = true;
          startDrag(y);
        }
      }

      if (mode === "drag") {
        const next = y - originY;
        offset = next < 0 ? next * 0.15 : next;
        setTransform(offset);
        samples.push({ y, t: performance.now() });
        if (samples.length > 12) samples.shift();
      }
      lastY = y;
    };
    const onPointerUp = () => {
      if (!mouseActive) return;
      mouseActive = false;
      if (mode === "drag") finishDrag(false);
      mode = "idle";
      scroller = null;
      if (suppressNextClick) {
        setTimeout(() => {
          suppressNextClick = false;
        }, 50);
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd);
    sheet.addEventListener("touchcancel", onTouchEnd);
    sheet.addEventListener("pointerdown", onPointerDown);
    sheet.addEventListener("click", onClickCapture, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      if (snapTimer) clearTimeout(snapTimer);
      unlockScroller();
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
      sheet.removeEventListener("touchcancel", onTouchEnd);
      sheet.removeEventListener("pointerdown", onPointerDown);
      sheet.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [enabled, sheetRef, handleRef]);
}
