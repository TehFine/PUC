"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { PortalTabId } from "./PortalApp";
import {
  HouseCircleCheckIcon,
  LandLayerLocationIcon,
  DocumentWriterIcon,
  AuditIcon,
  PersonCvIcon,
  BrainQuestionMarkIcon,
  QrTagIcon,
  type RadialIconProps,
} from "./RadialIcons";

export interface NavItemConfig {
  id: PortalTabId;
  label: string;
  icon: React.ComponentType<RadialIconProps>;
  color: string;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: "home",
    label: "Trang chủ",
    icon: HouseCircleCheckIcon,
    color: "#2e7d56",
    activeColor: "#15803d",
    activeBg: "rgba(34, 197, 94, 0.08)",
    activeBorder: "#22c55e",
  },
  {
    id: "plots",
    label: "Thửa đất",
    icon: LandLayerLocationIcon,
    color: "#15803d",
    activeColor: "#16a34a",
    activeBg: "rgba(22, 163, 74, 0.08)",
    activeBorder: "#16a34a",
  },
  {
    id: "diary",
    label: "Nhật ký",
    icon: DocumentWriterIcon,
    color: "#d97706",
    activeColor: "#b45309",
    activeBg: "rgba(245, 158, 11, 0.08)",
    activeBorder: "#f59e0b",
  },
  {
    id: "stamps",
    label: "Tem & Thu hái",
    icon: QrTagIcon,
    color: "#059669",
    activeColor: "#047857",
    activeBg: "rgba(5, 150, 105, 0.08)",
    activeBorder: "#059669",
  },
  {
    id: "inspection",
    label: "Kiểm tra",
    icon: AuditIcon,
    color: "#db2777",
    activeColor: "#e11d48",
    activeBg: "rgba(236, 72, 153, 0.08)",
    activeBorder: "#ec4899",
  },
  {
    id: "requests",
    label: "Hồ sơ",
    icon: PersonCvIcon,
    color: "#0284c7",
    activeColor: "#0369a1",
    activeBg: "rgba(2, 132, 199, 0.08)",
    activeBorder: "#0284c7",
  },
  {
    id: "learn",
    label: "Kiến thức",
    icon: BrainQuestionMarkIcon,
    color: "#ea580c",
    activeColor: "#c2410c",
    activeBg: "rgba(234, 88, 12, 0.08)",
    activeBorder: "#ea580c",
  },
];

interface RadialNavWheelProps {
  currentTab: PortalTabId;
  onSelectTab: (tab: PortalTabId) => void;
}

const STEP_DEG = 12; // 12 độ mỗi bước
const MIN_INDEX = 0;
const MAX_INDEX = NAV_ITEMS.length - 1; // 5
const MIN_ROT = MIN_INDEX * STEP_DEG; // 0 độ (Trang chủ)
const MAX_ROT = MAX_INDEX * STEP_DEG; // 60 độ (Kiến thức)
const RADIUS = 350; // Bán kính hình tròn ảo (px)
const PX_PER_STEP = 73; // Khoảng cách pixel xấp xỉ mỗi bước
const SENSITIVITY = STEP_DEG / PX_PER_STEP; // Độ nhạy vuốt ngón tay: ~0.164 deg/px

// Cấu hình vòng chia vạch đồng hồ (Watch Dial Ticks)
const DIAL_RADIUS = 350;
const DIAL_STEP_DEG = 12;
const DIAL_VIEW_W = 320;
const DIAL_VIEW_H = 700;
const DIAL_ARC_RIGHT = 76; // Khoảng cách từ mép phải tới đường cong chính
const DIAL_CX = DIAL_VIEW_W - DIAL_ARC_RIGHT + DIAL_RADIUS; // 320 - 76 + 350 = 594px
const DIAL_CY = DIAL_VIEW_H / 2; // 350px

interface DialTick {
  key: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: "major" | "medium" | "minor";
}

function generateDialTicks(cx: number, cy: number, r: number): DialTick[] {
  const ticks: DialTick[] = [];
  // Chỉ tạo các vạch trong cung góc có thể hiển thị trên màn hình (-30° đến 105°)
  // Giảm từ 240 vạch xuống ~68 vạch, tiết kiệm 72% chi phí vẽ SVG cho GPU thiết bị yếu
  const minDeg = -30;
  const maxDeg = 105;
  const step = 2.0;

  for (let deg = minDeg; deg <= maxDeg; deg += step) {
    const rad = ((180 + deg) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const isMajor = Math.abs(deg % DIAL_STEP_DEG) < 0.01;
    const isMedium = !isMajor && Math.abs(deg % (DIAL_STEP_DEG / 2)) < 0.01;

    let rInner: number;
    let rOuter: number;
    let type: "major" | "medium" | "minor";

    if (isMajor) {
      rInner = r;
      rOuter = r + 16;
      type = "major";
    } else if (isMedium) {
      rInner = r;
      rOuter = r + 10;
      type = "medium";
    } else {
      rInner = r;
      rOuter = r + 6;
      type = "minor";
    }

    ticks.push({
      key: Math.round(deg * 10),
      x1: cx + rInner * cos,
      y1: cy + rInner * sin,
      x2: cx + rOuter * cos,
      y2: cy + rOuter * sin,
      type,
    });
  }

  return ticks;
}

const DIAL_TICKS = generateDialTicks(DIAL_CX, DIAL_CY, DIAL_RADIUS);

const RETRACT_DURATION_MS = 220; // 220ms đồng bộ hoàn hảo với CSS animation pt-radial-retract

export default function RadialNavWheel({ currentTab, onSelectTab }: RadialNavWheelProps) {
  const currentIndex = useMemo(() => {
    const idx = NAV_ITEMS.findIndex((item) => item.id === currentTab);
    return idx >= 0 ? idx : 0;
  }, [currentTab]);

  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [rotationDeg, setRotationDeg] = useState(() => currentIndex * STEP_DEG);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pointerDownTargetRef = useRef<HTMLElement | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragStartRotRef = useRef(0);
  const lastYRef = useRef(0);
  const velocityRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const latestRotRef = useRef(currentIndex * STEP_DEG);
  const lastHapticIndexRef = useRef(-1);
  const lastVibrateTimeRef = useRef(0);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Khi mở popup, đưa tab hiện tại vào giữa
  const handleOpen = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    setIsClosing(false);
    const initialRot = currentIndex * STEP_DEG;
    latestRotRef.current = initialRot;
    setRotationDeg(initialRot);
    lastHapticIndexRef.current = currentIndex;
    setIsOpen(true);
  };

  const handleClose = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsClosing((prev) => {
      if (prev) return prev;
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        setIsOpen(false);
        setIsClosing(false);
      }, RETRACT_DURATION_MS);
      return true;
    });
  }, []);

  // Tự động thu popup lại sau khi bánh xe dừng lại ở một tab nhanh chóng, tránh trễ
  const scheduleAutoClose = useCallback(
    (delay = 120) => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      autoCloseTimerRef.current = setTimeout(() => {
        handleClose();
      }, delay);
    },
    [handleClose]
  );

  // Khóa cuộn trang nền và chặn kéo giật layout
  useEffect(() => {
    if (!isOpen) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyTouchAction = document.body.style.touchAction;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const preventDefaultTouch = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    window.addEventListener("touchmove", preventDefaultTouch, { passive: false });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.touchAction = prevBodyTouchAction;
      window.removeEventListener("touchmove", preventDefaultTouch);
      window.removeEventListener("keydown", handleKeyDown);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
  }, [isOpen, handleClose]);

  // Khi snap dừng lại ở đâu, chuyển sang tab đó (giới hạn chặt chẽ 0 đến MAX_INDEX)
  const triggerTabChange = useCallback(
    (index: number) => {
      const clampedIdx = Math.max(MIN_INDEX, Math.min(MAX_INDEX, index));
      const targetTab = NAV_ITEMS[clampedIdx].id;
      if (targetTab !== currentTab) {
        onSelectTab(targetTab);
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(16);
          }
        } catch {
          // ignore
        }
      }
    },
    [currentTab, onSelectTab]
  );

  // Hàm xoay bánh xe mượt mà tới góc mục tiêu theo nhịp điệu êm dịu, không giật gấp
  const animateToRotation = useCallback(
    (targetRot: number, targetIdx: number, duration = 240, autoCloseDelay = 120) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      let startTime: number | null = null;
      const startRot = latestRotRef.current;

      const step = (time: number) => {
        if (startTime === null) startTime = time;
        const elapsed = time - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Easing Quartic ease-out: lướt êm, giảm tốc mềm mại và hít nhẹ nhàng vào dock
        const ease = 1 - Math.pow(1 - progress, 3.5);
        const nextRot = startRot + (targetRot - startRot) * ease;
        latestRotRef.current = nextRot;
        setRotationDeg(nextRot);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          latestRotRef.current = targetRot;
          setRotationDeg(targetRot);
          triggerTabChange(targetIdx);
          // Khoảng dừng nhịp điệu vừa vặn trước khi thu drawer
          scheduleAutoClose(autoCloseDelay);
        }
      };

      animFrameRef.current = requestAnimationFrame(step);
    },
    [triggerTabChange, scheduleAutoClose]
  );

  const hasDraggedRef = useRef(false);

  // Hỗ trợ cuộn chuột mượt mà trên desktop/laptop với giới hạn 2 đầu
  useEffect(() => {
    const el = containerRef.current;
    if (!isOpen || !el) return;

    let wheelTimeout: ReturnType<typeof setTimeout> | undefined;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      let newRot = latestRotRef.current - delta * (SENSITIVITY * 0.5);

      // Cản lực và khóa cứng khi cuộn quá 2 đầu
      if (newRot < MIN_ROT) {
        newRot = Math.max(MIN_ROT - 1.5, newRot);
      } else if (newRot > MAX_ROT) {
        newRot = Math.min(MAX_ROT + 1.5, newRot);
      }

      latestRotRef.current = newRot;
      setRotationDeg(newRot);

      clearTimeout(wheelTimeout);
      wheelTimeout = setTimeout(() => {
        const rawSnap = Math.round(latestRotRef.current / STEP_DEG);
        const clampedSnapIdx = Math.max(MIN_INDEX, Math.min(MAX_INDEX, rawSnap));
        const targetSnap = clampedSnapIdx * STEP_DEG;
        animateToRotation(targetSnap, clampedSnapIdx, 240, 120);
      }, 100);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      clearTimeout(wheelTimeout);
    };
  }, [isOpen, animateToRotation]);

  // Xử lý kéo vuốt (Touch & Pointer)
  const onPointerDown = (e: React.PointerEvent) => {
    // Không kích hoạt kéo nếu bấm vào nút đóng
    if ((e.target as HTMLElement).closest(".pt-radial-close-btn")) {
      return;
    }
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    pointerDownTargetRef.current = e.target as HTMLElement;
    hasDraggedRef.current = false;
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    dragStartRotRef.current = latestRotRef.current;
    lastYRef.current = e.clientY;
    velocityRef.current = 0;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    try {
      containerRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore synthetic pointer event errors
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dy = e.clientY - dragStartYRef.current;
    const dx = e.clientX - dragStartXRef.current;
    if (!hasDraggedRef.current) {
      if (Math.abs(dy) > 8 || Math.abs(dx) > 8) {
        hasDraggedRef.current = true;
      } else {
        return; // Tránh rung lắc bánh xe khi người dùng bấm vào nền hoặc chỉ chạm nhẹ
      }
    }

    const rawRot = dragStartRotRef.current - dy * SENSITIVITY;
    let newRot = rawRot;

    // Giới hạn biên cứng: Khi chạm tới Tab đầu (0 - Trang chủ) hoặc Tab cuối (5 - Kiến thức), bánh xe khựng lại không lướt được nữa
    const MAX_OVERSCROLL = 2.4; // Độ lún đàn hồi tối đa 2.4° trước khi dừng hẳn
    const RESISTANCE = 0.12; // Cản lực 88%
    const maxOverDeg = MAX_OVERSCROLL / RESISTANCE; // 20 độ kéo

    if (rawRot < MIN_ROT) {
      const over = MIN_ROT - rawRot;
      newRot = MIN_ROT - Math.min(MAX_OVERSCROLL, over * RESISTANCE);
      // Khóa mốc kéo để khi đảo chiều vuốt ngược lại, phản hồi tức thì không bị trễ
      if (over > maxOverDeg) {
        dragStartYRef.current = e.clientY - (dragStartRotRef.current - (MIN_ROT - maxOverDeg)) / SENSITIVITY;
      }
    } else if (rawRot > MAX_ROT) {
      const over = rawRot - MAX_ROT;
      newRot = MAX_ROT + Math.min(MAX_OVERSCROLL, over * RESISTANCE);
      if (over > maxOverDeg) {
        dragStartYRef.current = e.clientY - (dragStartRotRef.current - (MAX_ROT + maxOverDeg)) / SENSITIVITY;
      }
    }

    const instantV = (e.clientY - lastYRef.current) * SENSITIVITY;
    velocityRef.current = velocityRef.current * 0.5 + instantV * 0.5;
    lastYRef.current = e.clientY;
    latestRotRef.current = newRot;

    if (dragRafRef.current === null) {
      dragRafRef.current = requestAnimationFrame(() => {
        setRotationDeg(latestRotRef.current);
        dragRafRef.current = null;
      });
    }

    // Phản hồi rung haptic tiết kiệm pin (chỉ rung cho các tab hợp lệ 0-5)
    const currentNearest = Math.max(MIN_INDEX, Math.min(MAX_INDEX, Math.round(newRot / STEP_DEG)));
    const now = Date.now();
    if (currentNearest !== lastHapticIndexRef.current && now - lastVibrateTimeRef.current > 120) {
      lastHapticIndexRef.current = currentNearest;
      lastVibrateTimeRef.current = now;
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(8);
        }
      } catch {
        // ignore
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      containerRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    // Nếu người dùng KHÔNG cuộn, KHÔNG lướt mà bấm vào phần nền (không bấm trúng tên các tab)
    if (!hasDraggedRef.current) {
      const downTarget = pointerDownTargetRef.current;
      const upTarget = e.target as HTMLElement;

      const isItem = downTarget?.closest(".pt-radial-item") || upTarget?.closest(".pt-radial-item");
      const isCloseBtn = downTarget?.closest(".pt-radial-close-btn") || upTarget?.closest(".pt-radial-close-btn");

      // Nếu bấm vào nền (không trúng tab item và không trúng nút đóng) -> Thu lại nhanh chóng!
      if (!isItem && !isCloseBtn) {
        handleClose();
        return;
      }
      return;
    }

    if (hasDraggedRef.current) {
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 100);
    }

    // Quán tính nhẹ + hít nam châm (snap to nearest step) khi có vuốt/lướt:
    const currentRot = latestRotRef.current - velocityRef.current * 3.0;
    const rawSnapIdx = Math.round(currentRot / STEP_DEG);
    const clampedSnapIdx = Math.max(MIN_INDEX, Math.min(MAX_INDEX, rawSnapIdx));
    const targetSnap = clampedSnapIdx * STEP_DEG;

    // Animation xoay trượt êm dịu, không giật gấp, dừng lại vừa nhịp
    animateToRotation(targetSnap, clampedSnapIdx, 240, 120);
  };

  // Click trực tiếp vào một mục trên vòng xoay
  const handleItemClick = (idx: number) => {
    if (hasDraggedRef.current) return;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    const clampedIdx = Math.max(MIN_INDEX, Math.min(MAX_INDEX, idx));
    const targetSnap = clampedIdx * STEP_DEG;
    // Xoay trượt nhịp nhàng tới tab được bấm và đóng nhanh gọn
    animateToRotation(targetSnap, clampedIdx, 220, 100);
  };

  // Danh sách các tab hiển thị - KHÔNG LẶP VÔ TẬN: Chỉ hiển thị đúng các tab hiện có (0 đến 5)
  const visibleItems = useMemo(() => {
    return NAV_ITEMS.map((itemConfig, idx) => {
      // Góc lệch so với vị trí giữa: (idx * STEP_DEG - rotationDeg)
      const deltaDeg = idx * STEP_DEG - rotationDeg;
      const deltaRad = (deltaDeg * Math.PI) / 180;

      // Tọa độ hình cung:
      // Khi deltaDeg = 0: X_item nằm xa nhất về bên trái (xOffset = 0)
      // Khi deltaDeg tăng: X_item lùi dần về bên phải (xOffset > 0)
      const y = RADIUS * Math.sin(deltaRad);
      const xOffset = RADIUS * (1 - Math.cos(deltaRad));

      const distFromCenter = Math.abs(deltaDeg);
      const isCenter = distFromCenter < STEP_DEG * 0.45;

      // Độ mờ và scale mượt mà
      const normDist = distFromCenter / (STEP_DEG * 4.6);
      const opacity = Math.max(0.35, Math.min(1, 1 - Math.pow(normDist, 1.7)));
      const scale = Math.max(0.74, 1.08 - Math.min(1, distFromCenter / (STEP_DEG * 3.8)) * 0.32);

      return {
        idx,
        itemConfig,
        xOffset,
        y,
        isCenter,
        opacity,
        scale,
        distFromCenter,
      };
    });
  }, [rotationDeg]);

  return (
    <>
      {/* ── Nút nổi "Điều hướng" ở góc dưới bên phải (chỉ hiện trên Mobile) ── */}
      <aside className="pt-radial-launcher-wrap" aria-label="Menu điều hướng di động">
        <button
          type="button"
          id="portal-radial-toggle"
          className="pt-radial-launcher"
          onClick={handleOpen}
          aria-expanded={isOpen}
          aria-controls="portal-radial-drawer"
          title="Mở menu xoay điều hướng"
        >
          <ArrowUpRight className="pt-radial-launcher-icon" size={17} strokeWidth={2.4} aria-hidden="true" />
          <span className="pt-radial-launcher-label">Điều hướng</span>
        </button>
      </aside>

      {/* ── Popup vòng xoay dạng trục tròn (Arc Wheel Navigation) ── */}
      {isOpen && (
        <div
          id="portal-radial-drawer"
          className={`pt-radial-backdrop ${isClosing ? "is-closing" : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Vòng xoay điều hướng chức năng"
        >
          <div
            ref={containerRef}
            className={`pt-radial-container ${isClosing ? "is-closing" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => {
              if (hasDraggedRef.current) return;
              const target = e.target as HTMLElement;
              if (!target.closest(".pt-radial-item") && !target.closest(".pt-radial-close-btn")) {
                handleClose();
              }
            }}
          >
            {/* Nút đóng góc trên */}
            <div className="pt-radial-header">
              <span className="pt-radial-title">Chuyển chức năng</span>
              <button
                type="button"
                className="pt-radial-close-btn"
                onClick={handleClose}
                aria-label="Đóng điều hướng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Vùng xoay trục tròn */}
            <div className="pt-radial-stage">
              {/* Vòng chia vạch kiểu mặt đồng hồ (Watch Dial Arc & Rotary Ticks) */}
              <svg
                className="pt-radial-dial-svg"
                viewBox={`0 0 ${DIAL_VIEW_W} ${DIAL_VIEW_H}`}
                preserveAspectRatio="xMaxYMid meet"
                aria-hidden="true"
              >
                <defs>
                  {/* Gradient mờ dần ở 2 đầu trên dưới của đường cung tròn */}
                  <linearGradient id="pt-dial-fade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
                    <stop offset="16%" stopColor="#0f172a" stopOpacity="0.75" />
                    <stop offset="50%" stopColor="#0f172a" stopOpacity="0.95" />
                    <stop offset="84%" stopColor="#0f172a" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Đường line tròn chính (Arc track) */}
                <circle
                  cx={DIAL_CX}
                  cy={DIAL_CY}
                  r={DIAL_RADIUS}
                  fill="none"
                  stroke="url(#pt-dial-fade)"
                  strokeWidth="1.5"
                  opacity="0.32"
                />

                {/* Toàn bộ hệ thống vạch chia đồng hồ (xoay cơ học nhịp nhàng cùng rotationDeg) */}
                <g
                  transform={`rotate(${rotationDeg}, ${DIAL_CX}, ${DIAL_CY})`}
                  style={{ willChange: "transform" }}
                >
                  {DIAL_TICKS.map((t) => (
                    <line
                      key={t.key}
                      x1={t.x1}
                      y1={t.y1}
                      x2={t.x2}
                      y2={t.y2}
                      stroke={
                        t.type === "major"
                          ? "rgba(15, 23, 42, 0.72)"
                          : t.type === "medium"
                          ? "rgba(15, 23, 42, 0.45)"
                          : "rgba(15, 23, 42, 0.22)"
                      }
                      strokeWidth={t.type === "major" ? 2.2 : t.type === "medium" ? 1.5 : 1}
                      strokeLinecap="round"
                    />
                  ))}
                </g>

                {/* Kim chỉ thị trung tâm cố định (Master Center Index Marker - Vạch dài nhất kiểu 12h như ảnh) */}
                <g className="pt-radial-needle-fixed">
                  {/* Hiệu ứng hào quang nhẹ phía sau vạch trung tâm */}
                  <line
                    x1={DIAL_CX - DIAL_RADIUS}
                    y1={DIAL_CY}
                    x2={DIAL_CX - DIAL_RADIUS + 26}
                    y2={DIAL_CY}
                    stroke="rgba(34, 197, 94, 0.35)"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  {/* Vạch dài trung tâm sắc nét, vững chãi */}
                  <line
                    x1={DIAL_CX - DIAL_RADIUS}
                    y1={DIAL_CY}
                    x2={DIAL_CX - DIAL_RADIUS + 26}
                    y2={DIAL_CY}
                    stroke="#0f172a"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                  {/* Điểm kim định vị tinh xảo ở gốc vạch */}
                  <circle
                    cx={DIAL_CX - DIAL_RADIUS + 1}
                    cy={DIAL_CY}
                    r="2.5"
                    fill="#15803d"
                  />
                </g>
              </svg>

              {/* Thanh dock dài ngang nằm giữa màn hình (giống phần set timer trên iPhone) */}
              <div className="pt-radial-selection-dock" aria-hidden="true" />

              {/* Danh sách các nút chức năng xếp uốn cong theo cung tròn (đúng 6 tab, không lặp vô tận) */}
              <div className="pt-radial-wheel">
                {visibleItems.map(
                  ({ idx, itemConfig, xOffset, y, isCenter, opacity, scale }) => {
                    const Icon = itemConfig.icon;
                    return (
                      <div
                        key={itemConfig.id}
                        className={`pt-radial-item ${isCenter ? "is-center" : ""}`}
                        style={{
                          transform: `translate3d(${xOffset}px, ${y}px, 0) scale(${scale})`,
                          opacity,
                          zIndex: isCenter ? 20 : 10,
                        }}
                        onClick={() => handleItemClick(idx)}
                      >
                        {/* Nhãn tên chức năng nằm bên trái */}
                        <div
                          className={`pt-radial-label ${isCenter ? "is-active-label" : ""}`}
                          style={{
                            color: isCenter ? "#0f172a" : "#334155",
                          }}
                        >
                          {itemConfig.label}
                        </div>

                        {/* Icon nằm trong capsule/oval trên đường cung */}
                        <div
                          className={`pt-radial-icon-box ${isCenter ? "is-active-icon" : ""}`}
                          style={{
                            borderColor: isCenter ? itemConfig.activeBorder : "transparent",
                            backgroundColor: isCenter ? itemConfig.activeBg : "#ffffff",
                            color: isCenter ? itemConfig.activeColor : itemConfig.color,
                          }}
                        >
                          <Icon size={isCenter ? 24 : 20} />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            {/* Chỉ dẫn lướt xoay phía dưới */}
            <div className="pt-radial-footer">
              <span className="pt-radial-hint">Lướt lên / xuống để xoay bánh xe chức năng</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
