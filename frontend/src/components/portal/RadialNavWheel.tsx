"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { lockRootScroll } from "@/lib/scroll-lock";
import { usePortalLang } from "./i18n";
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
import { useSheetSwipe } from "./use-sheet-swipe";

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
    desc: "Theo dõi lô xuất kho và tem truy xuất.",
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
    desc: "Tra cứu thuốc BVTV, phân bón và giống cây.",
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
  const { t } = usePortalLang();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<PortalTabId>(currentTab);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef(false);

  // Vùng tiêu đề: chạm vào đây luôn kéo popup; trong danh sách thì cuộn tới đầu rồi kéo tiếp để đóng
  const headRef = useRef<HTMLDivElement>(null);

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

    const unlockScroll = lockRootScroll();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unlockScroll();
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

  // Vuốt kiểu khung bình luận TikTok / Facebook (dùng chung với các popup Sheet)
  useSheetSwipe({ sheetRef, handleRef: headRef, onDismiss: handleClose, enabled: isOpen });

  const drawerNode = isOpen ? (
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
        <div ref={headRef} className="pt-radial-sheet-head">
          <div className="pt-sheet-handle-zone" aria-hidden="true" style={{ paddingTop: 0, paddingBottom: 10 }}>
            <div className="pt-sheet-handle-bar" />
          </div>
          <h2 className="pt-radial-sheet-title">{t("Điều hướng")}</h2>
        </div>

        <div className="pt-radial-card-list" role="radiogroup" aria-label={t("Danh mục chức năng")}>
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
                  <span className="pt-radial-option-title">{t(item.label)}</span>
                  <span className="pt-radial-option-desc">{t(item.desc)}</span>
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
            {t("Xong")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

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

      {drawerNode && (typeof document !== "undefined" ? createPortal(drawerNode, document.body) : drawerNode)}
    </>
  );
}
