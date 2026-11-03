"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PortalTabId } from "./PortalApp";
import {
  HouseCircleCheckIcon,
  LandLayerLocationIcon,
  DocumentWriterIcon,
  AuditIcon,
  BrainQuestionMarkIcon,
  QrTagIcon,
  type RadialIconProps,
} from "./RadialIcons";

export interface NavItemConfig {
  id: PortalTabId;
  label: string;
  desc: string;
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
    desc: "Tổng quan nông hộ và nhắc nhở.",
    icon: HouseCircleCheckIcon,
    color: "#111827",
    activeColor: "#e05a2b",
    activeBg: "#fbe9e2",
    activeBorder: "transparent",
  },
  {
    id: "plots",
    label: "Thửa đất",
    desc: "Bản đồ ranh giới các thửa vườn.",
    icon: LandLayerLocationIcon,
    color: "#111827",
    activeColor: "#e05a2b",
    activeBg: "#fbe9e2",
    activeBorder: "transparent",
  },
  {
    id: "diary",
    label: "Nhật ký",
    desc: "Ghi chép canh tác và phun thuốc.",
    icon: DocumentWriterIcon,
    color: "#111827",
    activeColor: "#e05a2b",
    activeBg: "#fbe9e2",
    activeBorder: "transparent",
  },
  {
    id: "stamps",
    label: "Thu hoạch",
    desc: "Khai báo sản lượng và lô xuất kho.",
    icon: QrTagIcon,
    color: "#111827",
    activeColor: "#e05a2b",
    activeBg: "#fbe9e2",
    activeBorder: "transparent",
  },
  {
    id: "inspection",
    label: "Kiểm nghiệm",
    desc: "Lịch lấy mẫu và phiếu kiểm định.",
    icon: AuditIcon,
    color: "#111827",
    activeColor: "#e05a2b",
    activeBg: "#fbe9e2",
    activeBorder: "transparent",
  },
  {
    id: "learn",
    label: "Kiến thức",
    desc: "Vật tư VietGAP và lớp tập huấn.",
    icon: BrainQuestionMarkIcon,
    color: "#111827",
    activeColor: "#e05a2b",
    activeBg: "#fbe9e2",
    activeBorder: "transparent",
  },
];

interface RadialNavWheelProps {
  currentTab: PortalTabId;
  onSelectTab: (tab: PortalTabId) => void;
  open?: boolean;
  onClose?: () => void;
  showFloatingLauncher?: boolean;
}

const CLOSE_DURATION_MS = 240;

export default function RadialNavWheel({
  currentTab,
  onSelectTab,
  open: propOpen,
  onClose: propOnClose,
  showFloatingLauncher = false,
}: RadialNavWheelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<PortalTabId>(currentTab);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef(false);

  // Hỗ trợ vuốt kéo xuống từ tiêu đề để đóng mượt mà
  const isTrackingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const currentTranslateYRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTab(currentTab);
    }
  }, [currentTab, isOpen]);

  const handleOpen = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
    isClosingRef.current = false;
    setSelectedTab(currentTab);
    setIsOpen(true);
  }, [currentTab]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    if (selectTimerRef.current) {
      clearTimeout(selectTimerRef.current);
      selectTimerRef.current = null;
    }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);

    if (sheetRef.current) {
      sheetRef.current.style.animation = "none";
      sheetRef.current.style.pointerEvents = "none";
      sheetRef.current.style.transition =
        "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)";
      sheetRef.current.style.transform = "translate3d(0, 105%, 0)";
    }
    if (backdropRef.current) {
      backdropRef.current.style.animation = "none";
      backdropRef.current.style.pointerEvents = "none";
      backdropRef.current.style.transition = "opacity 200ms ease-out";
      backdropRef.current.style.opacity = "0";
    }

    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      isClosingRef.current = false;
      propOnClose?.();
    }, CLOSE_DURATION_MS);
  }, [propOnClose]);

  useEffect(() => {
    if (propOpen === undefined) return;
    const rafId = requestAnimationFrame(() => {
      if (propOpen && !isOpen) {
        handleOpen();
      } else if (!propOpen && isOpen && !isClosingRef.current) {
        handleClose();
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [propOpen, isOpen, handleOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (isClosingRef.current) return;
      if (sheetRef.current) {
        sheetRef.current.style.animation = "none";
        sheetRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.animation = "none";
        backdropRef.current.style.opacity = "1";
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose]);

  // Khi người dùng chạm và thả tay vào một tab: cập nhật chọn ngay lập tức, chuyển tab và tự động thu popup lại mượt mà
  const handleSelectItem = (tabId: PortalTabId) => {
    if (isClosingRef.current) return;
    setSelectedTab(tabId);
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {
      // ignore
    }

    if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
    selectTimerRef.current = setTimeout(() => {
      if (tabId !== currentTab) {
        onSelectTab(tabId);
      }
      handleClose();
    }, 110);
  };

  const handleDone = () => {
    if (selectedTab !== currentTab) {
      onSelectTab(selectedTab);
    }
    handleClose();
  };

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isClosingRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    isTrackingRef.current = true;
    isDraggingRef.current = false;
    dragStartYRef.current = e.clientY;
    currentTranslateYRef.current = 0;
    dragStartTimeRef.current = Date.now();
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isTrackingRef.current || activePointerIdRef.current !== e.pointerId || isClosingRef.current) return;
    const rawDeltaY = e.clientY - dragStartYRef.current;
    if (!isDraggingRef.current) {
      if (Math.abs(rawDeltaY) < 4) return;
      isDraggingRef.current = true;
      dragStartYRef.current = e.clientY;
      dragStartTimeRef.current = Date.now();
      if (sheetRef.current) {
        sheetRef.current.style.transition = "none";
        sheetRef.current.style.animation = "none";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "none";
        backdropRef.current.style.animation = "none";
      }
      return;
    }
    const deltaY = e.clientY - dragStartYRef.current;
    const translateY = deltaY < 0 ? deltaY * 0.12 : deltaY;
    currentTranslateYRef.current = translateY;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translate3d(0, ${translateY}px, 0)`;
    }
  };

  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    const wasDragging = isDraggingRef.current;
    isTrackingRef.current = false;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (!wasDragging) return;
    const deltaY = currentTranslateYRef.current;
    const elapsed = Math.max(1, Date.now() - dragStartTimeRef.current);
    const velocity = deltaY / elapsed;
    if (deltaY > 100 || (velocity > 0.4 && deltaY > 30)) {
      handleClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 240ms cubic-bezier(0.25, 1, 0.5, 1)";
      sheetRef.current.style.transform = "translate3d(0, 0, 0)";
    }
  };

  return (
    <>
      {showFloatingLauncher && (
        <aside className="pt-radial-launcher-wrap" aria-label="Menu điều hướng di động">
          <button
            type="button"
            id="portal-radial-floating-toggle"
            className="pt-radial-launcher"
            onClick={handleOpen}
            aria-expanded={isOpen}
            aria-controls="portal-radial-drawer"
            title="Mở menu điều hướng"
          >
            <span className="pt-radial-launcher-icon pt-nav-menu-mask" aria-hidden="true" />
            <span className="pt-radial-launcher-label">Điều hướng</span>
          </button>
        </aside>
      )}

      {isOpen && (
        <div
          id="portal-radial-drawer"
          ref={backdropRef}
          className="pt-radial-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Điều hướng chức năng"
        >
          <div
            ref={sheetRef}
            className="pt-radial-sheet"
          >
            <div
              className="pt-radial-sheet-head"
              onPointerDown={onHeaderPointerDown}
              onPointerMove={onHeaderPointerMove}
              onPointerUp={onHeaderPointerUp}
              onPointerCancel={onHeaderPointerUp}
            >
              <h2 className="pt-radial-sheet-title">Điều hướng</h2>
            </div>

            <div className="pt-radial-card-list" role="radiogroup" aria-label="Chọn danh mục chức năng">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = selectedTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`pt-radial-option-card ${isActive ? "is-active" : ""}`}
                    onClick={() => handleSelectItem(item.id)}
                  >
                    <div className="pt-radial-option-icon">
                      <Icon size={26} />
                    </div>
                    <div className="pt-radial-option-text">
                      <span className="pt-radial-option-title">{item.label}</span>
                      <span className="pt-radial-option-desc">{item.desc}</span>
                    </div>
                    <div className="pt-radial-option-radio" aria-hidden="true">
                      <span className="pt-radial-option-radio-dot" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-radial-sheet-footer">
              <button
                type="button"
                className="pt-radial-done-btn"
                onClick={handleDone}
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
