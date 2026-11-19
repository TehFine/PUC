export type PopupExitKind = "modal" | "drawer" | "sheet" | "floating-card";

export const POPUP_CLOSE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export function resolvePopupExitKind(
  variant: "drawer" | "modal",
  desktopBreakpoint = 760,
): PopupExitKind {
  if (variant === "modal") return "modal";
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= desktopBreakpoint;
  return isDesktop ? "drawer" : "sheet";
}

/**
 * Thực thi hiệu ứng thu gọn mượt mà cho popup / ngăn kéo / bottom sheet (240ms–260ms, vừa mắt).
 * Dùng `setProperty("animation", "none", "important")` để luôn thắng mọi quy tắc CSS `forwards`.
 */
export function animatePopupExit(
  panel: HTMLElement | null,
  backdrop: HTMLElement | null,
  kind: PopupExitKind,
): number {
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion) {
    if (panel) panel.style.opacity = "0";
    if (backdrop) backdrop.style.opacity = "0";
    return 20;
  }

  const durationMs = kind === "floating-card" ? 240 : kind === "modal" ? 250 : 260;

  if (panel) {
    panel.style.setProperty("animation", "none", "important");
    panel.style.pointerEvents = "none";
    if (kind === "modal") {
      panel.style.setProperty(
        "transition",
        `transform ${durationMs}ms ${POPUP_CLOSE_EASE}, opacity ${durationMs - 15}ms ease-out`,
        "important",
      );
      panel.style.transform = "translate3d(0, 10px, 0) scale(0.94)";
      panel.style.opacity = "0";
    } else if (kind === "drawer") {
      panel.style.setProperty("transition", `transform ${durationMs}ms ${POPUP_CLOSE_EASE}`, "important");
      panel.style.transform = "translate3d(100%, 0, 0)";
    } else if (kind === "floating-card") {
      panel.style.setProperty(
        "transition",
        `transform ${durationMs}ms ${POPUP_CLOSE_EASE}, opacity ${durationMs - 15}ms ease-out`,
        "important",
      );
      panel.style.transform = "translate3d(8px, 0, 0) scale(0.95)";
      panel.style.opacity = "0";
    } else {
      panel.style.setProperty("transition", `transform ${durationMs}ms ${POPUP_CLOSE_EASE}`, "important");
      panel.style.transform = "translate3d(0, 104%, 0)";
    }
  }

  if (backdrop) {
    backdrop.style.setProperty("animation", "none", "important");
    backdrop.style.pointerEvents = "none";
    backdrop.style.setProperty("transition", `opacity ${durationMs - 15}ms ease-out`, "important");
    backdrop.style.opacity = "0";
  }

  return durationMs;
}

/**
 * Dự phòng khi thành phần cha đóng popup trực tiếp (`setOpen(false)`) sau khi lưu biểu mẫu hoặc bấm nút tùy biến
 * mà chưa đi qua `handleClose`: nhân bản lớp giao diện tĩnh (`pointer-events: none`) trong `useLayoutEffect`
 * để vẫn hiển thị trọn vẹn hiệu ứng thu popup mượt mà trước khi biến mất.
 */
export function spawnExitCloneIfNeeded(
  rootNode: HTMLElement | null,
  panelNode: HTMLElement | null,
  kind: PopupExitKind,
): void {
  if (!rootNode || typeof window === "undefined" || typeof document === "undefined") return;
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }
  const host = rootNode.parentElement ?? document.body;
  if (!host.isConnected) return;

  const cloneRoot = rootNode.cloneNode(true) as HTMLElement;
  cloneRoot.removeAttribute("id");
  cloneRoot.setAttribute("aria-hidden", "true");
  cloneRoot.setAttribute("inert", "");
  cloneRoot.style.pointerEvents = "none";

  const descendantsWithAttrs = cloneRoot.querySelectorAll("[id], [autofocus]");
  for (const el of descendantsWithAttrs) {
    el.removeAttribute("id");
    el.removeAttribute("autofocus");
  }

  const isSameNode = rootNode === panelNode;
  const clonePanel = isSameNode
    ? cloneRoot
    : ((panelNode
        ? cloneRoot.querySelector<HTMLElement>('[role="dialog"], .pt-sheet, .modal, .batch-qr-modal, .cert-modal-container, .pt-radial-sheet')
        : null) ?? (cloneRoot.firstElementChild as HTMLElement | null));

  // Khóa vị trí khởi đầu hiện tại trước khi gắn transition thu gọn
  if (clonePanel) {
    clonePanel.style.setProperty("animation", "none", "important");
    clonePanel.style.transition = "none";
    clonePanel.style.transform = "translate3d(0, 0, 0) scale(1)";
    clonePanel.style.opacity = "1";
  }
  if (!isSameNode) {
    cloneRoot.style.setProperty("animation", "none", "important");
    cloneRoot.style.transition = "none";
    cloneRoot.style.opacity = "1";
  }

  host.appendChild(cloneRoot);
  // Ép trình duyệt chốt frame ban đầu trước khi kích hoạt transition thu lại
  void cloneRoot.offsetWidth;

  const durationMs = animatePopupExit(clonePanel, isSameNode ? null : cloneRoot, kind);
  window.setTimeout(() => {
    cloneRoot.remove();
  }, durationMs + 25);
}

