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
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const currentTabItem = useMemo(() => TABS.find((t) => t.id === tab) || TABS[0], [tab]);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && session?.user.role !== "farmer") router.replace("/admin");
  }, [status, session, router]);

  // Đóng popup khi click ngoài hoặc nhấn ESC
  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  if (status !== "authenticated" || session?.user.role !== "farmer") {
    return <PageSkeleton label="Đang kiểm tra phiên đăng nhập…" />;
  }

  const navigate = (next: PortalTabId) => {
    setTab(next);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

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
            {/* Avatar chỉ là 1 hình tròn duy nhất, click vào bật popup */}
            <button
              id="portal-profile-toggle"
              type="button"
              className={`pt-avatar-btn ${profileOpen ? "is-active" : ""}`}
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-expanded={profileOpen}
              aria-haspopup="dialog"
              title={`Hồ sơ: ${displayName}`}
            >
              <span className="pt-avatar">{initials}</span>
            </button>

            {/* Popup chi tiết tài khoản khi bấm vào avatar */}
            {profileOpen && (
              <div
                id="portal-profile-dropdown"
                className="pt-profile-popup"
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
                      setProfileOpen(false);
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
        {tab === "home" && <HomeTab onNavigate={navigate} />}
        {tab === "plots" && <PlotsTab />}
        {tab === "diary" && <DiaryTab />}
        {tab === "inspection" && <InspectionTab />}
        {tab === "requests" && <RequestsTab />}
        {tab === "learn" && <LearnTab />}
      </main>

      {/* Điều hướng trục tròn dạng bánh xe uốn cong trên Mobile */}
      <RadialNavWheel currentTab={tab} onSelectTab={navigate} />
    </div>
  );
}
