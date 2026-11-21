export type PopupExitKind = "modal" | "drawer" | "sheet" | "floating-card";

/** Đường cong giảm tốc mượt dần khi gần tới điểm dừng (Quintic Ease-Out) */
export const POPUP_OPEN_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export const POPUP_OPEN_MS = 380;
export const POPUP_CLOSE_EASE = "cubic-bezier(0.25, 1, 0.5, 1)";

export function resolvePopupExitKind(
  _variant?: "drawer" | "modal",
  _desktopBreakpoint = 760,
): PopupExitKind {
  void _variant;
  void _desktopBreakpoint;
  return "sheet";
}

function readCurrentTranslateY(el: HTMLElement): number {
  const raw = window.getComputedStyle(el).transform;
  if (!raw || raw === "none") return 0;
  try {
    return new DOMMatrixReadOnly(raw).m42;
  } catch {
    const m3d = raw.match(/matrix3d\(([^)]+)\)/);
    if (m3d) {
      const parts = m3d[1].split(",").map((s) => parseFloat(s.trim()));
      return Number.isFinite(parts[13]) ? parts[13] : 0;
    }
    const m2d = raw.match(/matrix\(([^)]+)\)/);
    if (m2d) {
      const parts = m2d[1].split(",").map((s) => parseFloat(s.trim()));
      return Number.isFinite(parts[5]) ? parts[5] : 0;
    }
    return 0;
  }
}

/**
 * Giữ lớp ghép phần cứng GPU (`data-animating="true"`) suốt quá trình popup trượt từ cạnh dưới lên,
 * và chỉ gỡ `animation` / `transform` khi popup thực sự đang mở yên (tuyệt đối không can thiệp khi đang kéo hoặc đóng).
 */
export function attachSmoothSheetSettle(
  panel: HTMLElement | null,
  backdrop: HTMLElement | null,
  isClosingRef?: { current: boolean },
  onSettled?: () => void,
): () => void {
  if (!panel || typeof window === "undefined") {
    return () => { };
  }

  let settled = false;
  delete panel.dataset.closing;
  panel.dataset.animating = "true";

  if (backdrop) {
    backdrop.style.setProperty("animation", "none", "important");
    backdrop.style.opacity = "1";
  }

  const settle = () => {
    if (settled) return;
    settled = true;
    panel.removeEventListener("animationend", handleAnimationEnd);
    window.clearTimeout(fallbackTimer);
    delete panel.dataset.animating;

    if (
      isClosingRef?.current ||
      panel.dataset.dragging === "true" ||
      panel.dataset.closing === "true"
    ) {
      return;
    }

    panel.style.setProperty("animation", "none", "important");
    panel.style.transform = "";
    panel.style.willChange = "auto";

    if (backdrop) {
      backdrop.style.setProperty("animation", "none", "important");
      backdrop.style.opacity = "1";
    }

    onSettled?.();
  };

  const handleAnimationEnd = (event: AnimationEvent) => {
    if (event.target !== panel) return;
    settle();
  };

  panel.addEventListener("animationend", handleAnimationEnd);
  const fallbackTimer = window.setTimeout(settle, POPUP_OPEN_MS + 160);

  return () => {
    settled = true;
    panel.removeEventListener("animationend", handleAnimationEnd);
    window.clearTimeout(fallbackTimer);
    delete panel.dataset.animating;
  };
}

/**
 * Trượt thẳng popup xuống khỏi cạnh dưới từ đúng vị trí ngón tay hiện tại rồi đóng dứt khoát,
 * tuyệt đối không nảy ngược, không nháy sáng hay sinh hoạt ảnh phụ.
 */
export function animatePopupExit(
  panel: HTMLElement | null,
  backdrop: HTMLElement | null,
  _kind?: PopupExitKind,
): number {
  void _kind;
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion || !panel || typeof window === "undefined") {
    if (panel) panel.style.opacity = "0";
    if (backdrop) backdrop.style.opacity = "0";
    return 0;
  }

  delete panel.dataset.animating;
  delete panel.dataset.dragging;
  panel.dataset.closing = "true";
  panel.style.pointerEvents = "none";
  panel.style.setProperty("animation", "none", "important");

  const currentY = readCurrentTranslateY(panel);
  const rect = panel.getBoundingClientRect();
  const viewportH = window.innerHeight || 900;
  const remainingPx = viewportH - rect.top + 24;

  // Nếu người dùng đã kéo popup tụt hẳn xuống dưới mép màn hình -> đóng tức thì không chờ
  if (remainingPx <= 0) {
    panel.style.transition = "none";
    panel.style.opacity = "0";
    if (backdrop) {
      backdrop.style.setProperty("animation", "none", "important");
      backdrop.style.transition = "none";
      backdrop.style.opacity = "0";
    }
    return 0;
  }

  const baseHeight = Math.max(rect.height, 280);
  const durationMs = Math.max(110, Math.min(230, Math.round((remainingPx / baseHeight) * 230)));
  const targetY = Math.ceil(currentY + remainingPx);

  // Khóa vị trí hiện tại trước khi gắn transition để không bao giờ giật ngược về 0
  panel.style.transition = "none";
  panel.style.transform = `translate3d(0, ${Math.round(currentY)}px, 0)`;
  panel.style.willChange = "transform";
  void panel.offsetWidth;

  panel.style.setProperty("transition", `transform ${durationMs}ms ${POPUP_CLOSE_EASE}`, "important");
  panel.style.transform = `translate3d(0, ${targetY}px, 0)`;

  if (backdrop) {
    backdrop.style.setProperty("animation", "none", "important");
    backdrop.style.pointerEvents = "none";
    backdrop.style.setProperty("transition", `opacity ${durationMs}ms linear`, "important");
    backdrop.style.opacity = "0";
  }

  return durationMs;
}

/**
 * Đã vô hiệu hóa hoàn toàn cơ chế nhân bản DOM khi tháo popup để tránh hiện tượng
 * nháy sáng bật ngược lên một lần nữa sau khi popup đã trượt đóng xong.
 */
export function spawnExitCloneIfNeeded(
  _rootNode: HTMLElement | null,
  _panelNode: HTMLElement | null,
  _kind?: PopupExitKind,
): void {
  void _rootNode;
  void _panelNode;
  void _kind;
}
