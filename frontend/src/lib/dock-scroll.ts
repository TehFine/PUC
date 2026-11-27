"use client";

import { useEffect, useRef, type RefObject } from "react";

const DOCK_SELECTOR = [
  ".tab-bar",
  ".pt-segmented-track",
  ".pt-pest-filter-bar",
  ".pt-tabs",
  ".sheet-tabs",
  ".dash-chart-tabs",
  ".pt-notif-filter-group",
  ".tr-tier-switch",
  ".batch-qr-type-switch",
  ".auth-mode-tabs",
  "[role='tablist']",
].join(", ");

const ACTIVE_ITEM_SELECTOR =
  '[aria-selected="true"], [aria-current="page"], [aria-pressed="true"], button.active, button.is-active, .tab-btn.active, .sheet-tab.active, .pt-tab.active, .pt-pest-filter-chip.is-active';

const recentScrollCommand = new WeakMap<HTMLElement, { target: number; at: number }>();

function prefersInstantScroll(): boolean {
  if (typeof window === "undefined") return true;
  if (document.documentElement.dataset.perf === "lite") return true;
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return true;
  }
  return false;
}

function isHorizontallyScrollable(el: HTMLElement): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const style = window.getComputedStyle(el);
  return style.overflowX === "auto" || style.overflowX === "scroll";
}

/**
 * Đưa nút đang chọn hoặc vừa bấm ra chính giữa chiều ngang của thanh dock (kẹp an toàn trong [0, maxScroll]),
 * chỉ cuộn ngang nội bộ thanh dock, tuyệt đối không làm giật cuộn dọc trang nền.
 */
export function centerDockItem(
  dock: HTMLElement | null,
  item: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
): void {
  if (!dock || !item || typeof window === "undefined") return;
  const maxScroll = Math.max(0, dock.scrollWidth - dock.clientWidth);
  if (maxScroll <= 1) return;

  const dockRect = dock.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (dockRect.width <= 0 || itemRect.width <= 0) return;

  const itemLeftInContent = itemRect.left - dockRect.left + dock.scrollLeft;
  const rawTarget = itemLeftInContent + itemRect.width / 2 - dock.clientWidth / 2;
  const targetLeft = Math.max(0, Math.min(maxScroll, Math.round(rawTarget)));

  if (Math.abs(dock.scrollLeft - targetLeft) <= 1) return;

  const now = performance.now();
  const prev = recentScrollCommand.get(dock);
  if (prev && Math.abs(prev.target - targetLeft) <= 2 && now - prev.at < 280) {
    return;
  }
  recentScrollCommand.set(dock, { target: targetLeft, at: now });

  const resolvedBehavior: ScrollBehavior =
    behavior === "smooth" && prefersInstantScroll() ? "auto" : behavior;

  dock.scrollTo({
    left: targetLeft,
    behavior: resolvedBehavior,
  });
}

function findScrollableDockAncestor(start: HTMLElement, stopAt?: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = start.parentElement;
  while (cur && cur !== document.body) {
    if (cur.matches(DOCK_SELECTOR) && isHorizontallyScrollable(cur)) {
      return cur;
    }
    // Nếu `.pt-segmented` hoặc khung bọc ngoài chứa `.pt-segmented-track` con có cuộn ngang
    if (cur === stopAt) break;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Tự động căn giữa nút đang kích hoạt trong thanh dock khi mở trang, khôi phục URL hoặc đổi tab bằng mã.
 */
export function useAutoCenterDock<T extends HTMLElement = HTMLDivElement>(
  activeKey: unknown,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const dock = ref.current;
    if (!dock) return;
    const isInitial = !mountedRef.current;
    mountedRef.current = true;

    const rafId = window.requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const activeItem = el.querySelector<HTMLElement>(ACTIVE_ITEM_SELECTOR);
      if (activeItem) {
        centerDockItem(el, activeItem, isInitial ? "auto" : "smooth");
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [activeKey]);

  return ref;
}

/**
 * Trình lắng nghe ủy quyền toàn cục: hễ người dùng bấm vào bất kỳ nút tab / bộ lọc nào trên mọi thanh dock ngang,
 * tự động trượt mượt đưa nút đó ra chính giữa thanh dock để tập trung hiển thị rõ ràng.
 */
export function DockScrollCenterGuard() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const rawTarget = event.target;
      if (!(rawTarget instanceof Element)) return;

      const btn = rawTarget.closest<HTMLElement>("button, [role='tab'], a");
      if (!btn) return;

      const dock = findScrollableDockAncestor(btn);
      if (!dock) return;

      window.requestAnimationFrame(() => {
        if (!btn.isConnected || !dock.isConnected) return;
        centerDockItem(dock, btn, "smooth");
      });
    };

    document.addEventListener("click", handleClick, { passive: true });
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return null;
}

