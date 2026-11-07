"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SectionId } from "@/app/admin/page";
import { useAuth } from "@/components/auth/AuthProvider";
import { onAdminNavigate } from "@/components/admin/shared/counts-events";
import { useSheetSwipe } from "@/components/portal/use-sheet-swipe";
import { lockRootScroll } from "@/lib/scroll-lock";

interface NavItem {
  id: SectionId;
  label: string;
  desc: string;
  badge?: number;
  badgeType?: "red" | "warn";
  /** Tài nguyên cần quyền đọc để thấy mục này; bỏ trống = ai cũng thấy. */
  resource?: string;
}

const bottomItems: NavItem[] = [
  {
    id: "system",
    label: "Hệ thống",
    desc: "Phân quyền tài khoản và nhật ký hoạt động.",
    resource: "accounts",
  },
];

interface Props {
  active: SectionId;
  onNavigate: (id: SectionId) => void;
}

const CLOSE_DURATION_MS = 240;

export default function Sidebar({ active, onNavigate }: Props) {
  const { can } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<SectionId>(active);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef(false);

  const handleOpen = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
    isClosingRef.current = false;
    setSelectedTab(active);
    setIsOpen(true);
  }, [active]);

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
      sheetRef.current.style.transition = "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)";
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
    }, CLOSE_DURATION_MS);
  }, []);

  useEffect(
    () =>
      onAdminNavigate((section) => {
        const target = section === "registrations" ? "approval" : (section as SectionId);
        onNavigate(target);
        handleClose();
      }),
    [onNavigate, handleClose],
  );

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

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      unlockScroll();
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, handleClose]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (query.matches && isOpen) handleClose();
    };
    query.addEventListener("change", closeOnDesktop);
    return () => query.removeEventListener("change", closeOnDesktop);
  }, [isOpen, handleClose]);

  const topItems = useMemo<NavItem[]>(
    () => [
      { id: "dashboard", label: "Tổng quan", desc: "Số liệu thống kê và tình hình vùng trồng." },
      { id: "households", label: "Nông hộ", desc: "Danh sách hộ thành viên và chuẩn xuất khẩu.", resource: "households" },
      { id: "zones", label: "Vùng trồng", desc: "Bản đồ ranh giới thửa đất và chỉ số canh tác.", resource: "plots" },
      {
        id: "approval",
        label: "Hồ sơ",
        desc: "Tiếp nhận, xét duyệt hồ sơ, tài khoản đăng ký và lịch kiểm tra.",
        resource: "approvals",
      },
      {
        id: "journal",
        label: "Nhật ký",
        desc: "Theo dõi nhật ký canh tác, phun thuốc và vi phạm.",
        resource: "journal",
      },
      { id: "testing", label: "Kiểm nghiệm", desc: "Kết quả phân tích mẫu và tồn dư thuốc BVTV.", resource: "testing" },
      { id: "harvest", label: "Lô hàng", desc: "Quản lý lô thu hoạch, tem truy xuất và hợp đồng.", resource: "harvest" },
      { id: "news", label: "Bản tin", desc: "Đăng tải thông báo và tin tức nông nghiệp." },
      { id: "reports", label: "Báo cáo", desc: "Tổng hợp số liệu định kỳ và xuất báo cáo." },
      { id: "catalog", label: "Danh mục", desc: "Quản lý thuốc BVTV, phân bón, giống và thôn tổ.", resource: "pesticides" },
    ],
    [],
  );

  const allowed = (item: NavItem) => !item.resource || can(item.resource, "read");
  const allAllowedItems = useMemo(
    () => [...topItems.filter(allowed), ...bottomItems.filter(allowed)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topItems, can],
  );

  const go = (id: SectionId) => {
    onNavigate(id);
    if (isOpen) handleClose();
  };

  const handleSelectItem = (id: SectionId) => {
    if (isClosingRef.current) return;
    setSelectedTab(id);
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {
      // ignore
    }

    if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
    selectTimerRef.current = setTimeout(() => {
      if (id !== active) {
        onNavigate(id);
      }
      handleClose();
    }, 110);
  };

  const handleDone = () => {
    if (selectedTab !== active) {
      onNavigate(selectedTab);
    }
    handleClose();
  };

  useSheetSwipe({ sheetRef, handleRef: headRef, onDismiss: handleClose, enabled: isOpen });

  return (
    <>
      <button
        type="button"
        className={`nav-toggle${isOpen ? " open" : ""}`}
        aria-label={isOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
        aria-expanded={isOpen}
        aria-controls="admin-radial-drawer"
        onClick={() => (isOpen ? handleClose() : handleOpen())}
      >
        <span className="nav-toggle-icon nav-menu-mask" aria-hidden="true" />
      </button>

      <nav id="main-nav" className="sidebar" aria-label="Điều hướng chính">
        {topItems.filter(allowed).map(({ id, label, badge, badgeType }) => (
          <button
            key={id}
            type="button"
            className={`nav-item ${active === id ? "active" : ""}`}
            data-label={label}
            aria-current={active === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            {label}
            {!!badge && badge > 0 && (
              <span className={`nav-badge ${badgeType === "warn" ? "warn" : ""}`}>{badge}</span>
            )}
          </button>
        ))}

        {bottomItems.filter(allowed).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`nav-item nav-sep ${active === id ? "active" : ""}`}
            data-label={label}
            aria-current={active === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="admin-radial-drawer"
            ref={backdropRef}
            className="pt-radial-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Điều hướng chức năng"
          >
            <div ref={sheetRef} className="pt-radial-sheet">
              <div ref={headRef} className="pt-radial-sheet-head">
                <div className="pt-sheet-handle-zone" aria-hidden="true" style={{ paddingTop: 0, paddingBottom: 10 }}>
                  <div className="pt-sheet-handle-bar" />
                </div>
                <h2 className="pt-radial-sheet-title">Điều hướng</h2>
              </div>

              <div className="pt-radial-card-list" role="radiogroup" aria-label="Danh mục chức năng">
                {allAllowedItems.map((item) => {
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
                      <div className="pt-radial-option-text">
                        <span className="pt-radial-option-title">
                          {item.label}
                          {!!item.badge && item.badge > 0 && (
                            <span className={`nav-badge ${item.badgeType === "warn" ? "warn" : ""}`} style={{ marginLeft: 8 }}>
                              {item.badge}
                            </span>
                          )}
                        </span>
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
                <button type="button" className="pt-radial-done-btn" onClick={handleDone}>
                  Xong
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
