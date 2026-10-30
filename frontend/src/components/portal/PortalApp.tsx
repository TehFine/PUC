"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ClipboardCheck,
  House,
  LogOut,
  MapPin,
  NotebookPen,
  Phone,
  Send,
  TreePine,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePortal } from "@/hooks/use-portal";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { INTRO_PATH } from "@/lib/routes";
import type { PortalOverview } from "@/types/portal";
import "./portal.css";
import DiaryTab from "./DiaryTab";
import HomeTab from "./HomeTab";
import InspectionTab from "./InspectionTab";
import LearnTab from "./LearnTab";
import PlotsTab from "./PlotsTab";
import RequestsTab from "./RequestsTab";
import RadialNavWheel from "./RadialNavWheel";
import { SupportFooter, SystemSupportModal } from "./SystemSupport";

export type PortalTabId = "home" | "plots" | "diary" | "inspection" | "requests" | "learn";

const TABS: { id: PortalTabId; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Trang chủ", icon: House },
  { id: "plots", label: "Thửa đất", icon: TreePine },
  { id: "diary", label: "Nhật ký", icon: NotebookPen },
  { id: "inspection", label: "Kiểm tra", icon: ClipboardCheck },
  { id: "requests", label: "Hồ sơ", icon: Send },
  { id: "learn", label: "Kiến thức", icon: BookOpen },
];

/** Cổng dành cho hộ dân (tài khoản vai trò Nông dân). Cán bộ được chuyển về trang quản trị. */
export default function PortalApp() {
  const router = useRouter();
  const { status, session, logout } = useAuth();
  const { data: overview } = usePortal<PortalOverview>("overview");
  const [tab, setTab] = useState<PortalTabId>("home");
  const [visitedTabs, setVisitedTabs] = useState<Set<PortalTabId>>(() => new Set(["home"]));
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const openSupport = useCallback(() => setSupportOpen(true), []);
  const closeSupport = useCallback(() => setSupportOpen(false), []);

  const currentTabItem = useMemo(() => TABS.find((t) => t.id === tab) || TABS[0], [tab]);

  const navigate = useCallback((next: PortalTabId) => {
    startTransition(() => {
      setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
      setTab(next);
    });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const closeProfile = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setProfileClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setProfileOpen(false);
      setProfileClosing(false);
    }, 200);
  }, []);

  const toggleProfile = useCallback(() => {
    if (profileOpen) {
      closeProfile();
    } else {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      setProfileClosing(false);
      setProfileOpen(true);
    }
  }, [profileOpen, closeProfile]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && session?.user.role !== "farmer") router.replace("/admin");
  }, [status, session, router]);

  // Đóng popup khi click ngoài hoặc nhấn ESC (chạy qua closeProfile để có animation đóng êm)
  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        closeProfile();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeProfile();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen, closeProfile]);

  if (status !== "authenticated" || session?.user.role !== "farmer") {
    return <PageSkeleton label="Đang kiểm tra phiên đăng nhập…" />;
  }

  const household = overview?.household;
  const displayName = household?.name || session?.user.fullName || "Hộ thành viên";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "HD";

  return (
    <div className="pt-app">
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          <Link href={INTRO_PATH} className="pt-brand" aria-label="HTX Krông Búk – về trang giới thiệu" title="Về trang giới thiệu">
            <span className="pt-brand-mark" aria-hidden="true">
              <Image src="/logo.png" alt="" width={30} height={30} />
            </span>
            <div className="pt-brand-text">
              <strong>HTX Krông Búk</strong>
              <span>Cổng hộ dân</span>
            </div>
          </Link>

          {/* Tiêu đề tab đang chọn trên Mobile (thay thế cụm chữ HTX Krông Búk / Cổng hộ dân) */}
          <div className="pt-mobile-tab-title" aria-live="polite">
            <span className="pt-mobile-tab-name">{currentTabItem.label}</span>
          </div>

          <nav className="pt-tabs" aria-label="Chức năng">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`portal-tab-${item.id}`}
                  type="button"
                  className={`pt-tab ${tab === item.id ? "active" : ""}`}
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-topbar-right" ref={profileMenuRef}>
            {/* Lớp nền mờ (Backdrop Scrim) làm mờ hậu cảnh để người dùng focus vào popup profile */}
            {(profileOpen || profileClosing) && (
              <div
                className={`pt-profile-backdrop ${profileClosing ? "is-closing" : ""}`}
                onClick={closeProfile}
                aria-hidden="true"
              />
            )}

            {/* Avatar chỉ là 1 hình tròn duy nhất, click vào bật popup */}
            <button
              id="portal-profile-toggle"
              type="button"
              className={`pt-avatar-btn ${profileOpen ? "is-active" : ""}`}
              onClick={toggleProfile}
              aria-expanded={profileOpen}
              aria-haspopup="dialog"
              title={`Hồ sơ: ${displayName}`}
            >
              <span className="pt-avatar">{initials}</span>
            </button>

            {/* Popup chi tiết tài khoản khi bấm vào avatar */}
            {(profileOpen || profileClosing) && (
              <div
                id="portal-profile-dropdown"
                className={`pt-profile-popup ${profileClosing ? "is-closing" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Thông tin tài khoản hộ dân"
              >
                {/* Header: Avatar lớn + Tên + Mã hộ */}
                <div className="pt-profile-popup-head">
                  <div className="pt-profile-avatar-lg">
                    <span>{initials}</span>
                  </div>
                  <div className="pt-profile-head-info">
                    <strong className="pt-profile-name">{displayName}</strong>
                    <div className="pt-profile-badges">
                      <span className="pt-profile-kicker">
                        {household?.code ? `MÃ: ${household.code}` : "HỘ THÀNH VIÊN"}
                      </span>
                      <span className="pt-profile-status">Đủ chuẩn xuất khẩu</span>
                    </div>
                  </div>
                </div>

                {/* Body: Thông tin chi tiết */}
                <div className="pt-profile-details">
                  <div className="pt-profile-row">
                    <Phone size={15} className="pt-profile-icon" aria-hidden="true" />
                    <div className="pt-profile-row-content">
                      <span className="pt-profile-label">Số điện thoại</span>
                      <strong className="pt-profile-val">
                        {household?.phone || session?.user.username || "Chưa cập nhật"}
                      </strong>
                    </div>
                  </div>

                  <div className="pt-profile-row">
                    <MapPin size={15} className="pt-profile-icon" aria-hidden="true" />
                    <div className="pt-profile-row-content">
                      <span className="pt-profile-label">Địa bàn canh tác</span>
                      <strong className="pt-profile-val">
                        {household?.villageName || "Thôn 1"}, Xã Krông Búk
                      </strong>
                    </div>
                  </div>

                  {household?.villageLeader && (
                    <div className="pt-profile-row">
                      <UserCheck size={15} className="pt-profile-icon" aria-hidden="true" />
                      <div className="pt-profile-row-content">
                        <span className="pt-profile-label">Trưởng thôn phụ trách</span>
                        <strong className="pt-profile-val">{household.villageLeader}</strong>
                      </div>
                    </div>
                  )}

                  <div className="pt-profile-row">
                    <TreePine size={15} className="pt-profile-icon" aria-hidden="true" />
                    <div className="pt-profile-row-content">
                      <span className="pt-profile-label">Quy mô vườn sầu riêng</span>
                      <strong className="pt-profile-val">
                        {household?.plotCount ?? 3} thửa đất · {household?.areaHa ? household.areaHa.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : "2,4"} ha
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Footer: Nút đăng xuất được đẩy vào trong cụm popup avatar */}
                <div className="pt-profile-footer">
                  <button
                    id="portal-logout"
                    type="button"
                    className="pt-profile-logout-btn"
                    onClick={() => {
                      closeProfile();
                      void logout();
                    }}
                  >
                    <LogOut aria-hidden="true" size={15} strokeWidth={2.2} />
                    <span>Đăng xuất tài khoản</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="pt-main">
        {visitedTabs.has("home") && (
          <div className={`pt-tab-pane ${tab === "home" ? "is-active" : "is-hidden"}`}>
            <HomeTab onNavigate={navigate} />
            <SupportFooter onOpen={openSupport} />
          </div>
        )}
        {visitedTabs.has("plots") && (
          <div className={`pt-tab-pane ${tab === "plots" ? "is-active" : "is-hidden"}`}>
            <PlotsTab />
            <SupportFooter onOpen={openSupport} />
          </div>
        )}
        {visitedTabs.has("diary") && (
          <div className={`pt-tab-pane ${tab === "diary" ? "is-active" : "is-hidden"}`}>
            <DiaryTab />
            <SupportFooter onOpen={openSupport} />
          </div>
        )}
        {visitedTabs.has("inspection") && (
          <div className={`pt-tab-pane ${tab === "inspection" ? "is-active" : "is-hidden"}`}>
            <InspectionTab />
            <SupportFooter onOpen={openSupport} />
          </div>
        )}
        {visitedTabs.has("requests") && (
          <div className={`pt-tab-pane ${tab === "requests" ? "is-active" : "is-hidden"}`}>
            <RequestsTab />
            <SupportFooter onOpen={openSupport} />
          </div>
        )}
        {visitedTabs.has("learn") && (
          <div className={`pt-tab-pane ${tab === "learn" ? "is-active" : "is-hidden"}`}>
            <LearnTab />
            <SupportFooter onOpen={openSupport} />
          </div>
        )}
      </main>

      {/* Hộp thoại hỗ trợ hệ thống (tối giản, thông tin rõ ràng) */}
      <SystemSupportModal
        open={supportOpen}
        onClose={closeSupport}
        household={overview?.household}
      />

      {/* Điều hướng trục tròn dạng bánh xe uốn cong trên Mobile */}
      <RadialNavWheel currentTab={tab} onSelectTab={navigate} />
    </div>
  );
}
