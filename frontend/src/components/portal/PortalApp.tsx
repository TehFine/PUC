"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  CheckCheck,
  ClipboardCheck,
  CreditCard,
  House,
  KeyRound,
  LogOut,
  MapPin,
  NotebookPen,
  Phone,
  Scale,
  TreePine,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { invalidateQueries, NOTIFICATIONS_PATH, portalPath, usePortal, useSharedQuery } from "@/hooks/use-portal";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { api, errorMessage } from "@/lib/api-client";
import { HOUSEHOLD_STATUS } from "@/lib/portal-labels";
import { INTRO_PATH } from "@/lib/routes";
import { formatDate } from "@/utils/format";
import type { AppNotification, NotificationList, PortalOverview, PortalProfile } from "@/types/portal";
import "./portal.css";
import DiaryTab from "./DiaryTab";
import HomeTab from "./HomeTab";
import InspectionTab from "./InspectionTab";
import LearnTab from "./LearnTab";
import PlotsTab from "./PlotsTab";
import StampsTab from "./StampsTab";
import RadialNavWheel from "./RadialNavWheel";
import { BusyButton, InlineError } from "./shared/controls";
import { SupportFooter, SystemSupportModal } from "./SystemSupport";
import { EmptyState, Field, Sheet, StateBlock, useSheetClose } from "./ui";

export type PortalTabId = "home" | "plots" | "diary" | "stamps" | "inspection" | "learn";

const TABS: { id: PortalTabId; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Trang chủ", icon: House },
  { id: "plots", label: "Thửa đất", icon: TreePine },
  { id: "diary", label: "Nhật ký", icon: NotebookPen },
  { id: "stamps", label: "Thu hoạch", icon: Scale },
  { id: "inspection", label: "Kiểm nghiệm", icon: ClipboardCheck },
  { id: "learn", label: "Kiến thức", icon: BookOpen },
];

function resolveNotificationTarget(item: AppNotification): PortalTabId {
  const kind = (item.kind || "").toLowerCase();
  if (kind === "violation" || kind === "journal" || kind === "spray") return "diary";
  if (kind === "harvest") return "stamps";
  if (kind === "schedule" || kind === "lab") return "inspection";
  if (kind === "training") return "learn";

  const link = (item.link || "").toLowerCase();
  if (link.includes("plot")) return "plots";
  if (link.includes("diary") || link.includes("journal") || link.includes("spray") || link.includes("violation")) {
    return "diary";
  }
  if (link.includes("stamp") || link.includes("harvest")) return "stamps";
  if (link.includes("inspect") || link.includes("lab") || link.includes("schedule")) {
    return "inspection";
  }
  if (link.includes("learn") || link.includes("training")) return "learn";

  return "home";
}

function ChangePasswordForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const sheetClose = useSheetClose();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có tối thiểu 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Xác nhận mật khẩu mới chưa khớp.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      onSuccess();
    } catch (err) {
      setError(errorMessage(err, "Không đổi được mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <Field label="Mật khẩu hiện tại" htmlFor="cp-current">
        <input
          id="cp-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </Field>
      <Field label="Mật khẩu mới (ít nhất 8 ký tự)" htmlFor="cp-new">
        <input
          id="cp-new"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </Field>
      <Field label="Nhập lại mật khẩu mới" htmlFor="cp-confirm">
        <input
          id="cp-confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </Field>
      <p className="pt-hint">Sau khi đổi mật khẩu thành công, hệ thống sẽ đăng xuất để bạn đăng nhập lại bằng mật khẩu mới.</p>
      <InlineError message={error} />
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton
          type="submit"
          className="pt-btn pt-btn-primary"
          busy={saving}
          busyLabel="Đang cập nhật…"
          disabled={!currentPassword || !newPassword || !confirmPassword}
        >
          Lưu mật khẩu mới
        </BusyButton>
      </div>
    </form>
  );
}

/** Cổng dành cho hộ dân (tài khoản vai trò Nông dân). Cán bộ được chuyển về trang quản trị. */
export default function PortalApp() {
  const router = useRouter();
  const { status, session, logout } = useAuth();
  const { data: overview } = usePortal<PortalOverview>("overview");
  const { data: profile } = usePortal<PortalProfile>("profile");
  const notifications = useSharedQuery<NotificationList>(
    status === "authenticated" && session?.user.role === "farmer" ? NOTIFICATIONS_PATH : null,
  );

  const [tab, setTab] = useState<PortalTabId>(() => {
    if (typeof window === "undefined") return "home";
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      return tabParam as PortalTabId;
    }
    return "home";
  });
  const [visitedTabs, setVisitedTabs] = useState<Set<PortalTabId>>(() => {
    if (typeof window === "undefined") return new Set(["home"]);
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      return new Set<PortalTabId>(["home", tabParam as PortalTabId]);
    }
    return new Set(["home"]);
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [navWheelOpen, setNavWheelOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [scrollingDown, setScrollingDown] = useState(false);

  const openSupport = useCallback(() => setSupportOpen(true), []);
  const closeSupport = useCallback(() => setSupportOpen(false), []);

  const currentTabItem = useMemo(() => TABS.find((t) => t.id === tab) || TABS[0], [tab]);

  const navigate = useCallback((next: PortalTabId) => {
    setNavWheelOpen(false);
    setScrollingDown(false);
    document.documentElement.classList.remove("is-scrolling-down");
    startTransition(() => {
      setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
      setTab(next);
    });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 120);
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 260);
  }, []);

  const closeProfile = useCallback(() => {
    setProfileOpen(false);
  }, []);

  const toggleProfile = useCallback(() => {
    setProfileOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && session?.user.role !== "farmer") router.replace("/admin");
  }, [status, session, router]);

  useEffect(() => {
    document.documentElement.classList.add("pt-html");
    document.body.classList.add("pt-body");

    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const delta = y - lastY;
        if (y <= 6 || delta < -4) {
          setScrollingDown(false);
          document.documentElement.classList.remove("is-scrolling-down");
        } else if (y > 10 && delta > 2) {
          setScrollingDown(true);
          document.documentElement.classList.add("is-scrolling-down");
        }
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.documentElement.classList.remove("pt-html", "is-scrolling-down");
      document.body.classList.remove("pt-body");
    };
  }, []);

  if (status !== "authenticated" || session?.user.role !== "farmer") {
    return <PageSkeleton label="Đang kiểm tra phiên đăng nhập…" />;
  }

  const profHousehold = profile?.household ?? overview?.household;
  const profAccount = profile?.account;
  const displayName = profHousehold?.name || profAccount?.fullName || session?.user.fullName || "Hộ thành viên";
  const householdStatus = HOUSEHOLD_STATUS[profHousehold?.status ?? "pending"] ?? HOUSEHOLD_STATUS.pending;
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "HD";

  const unreadCount = notifications.data?.unread ?? overview?.stats.unreadNotifications ?? 0;
  const notifItems = notifications.data?.data ?? [];

  const handleMarkRead = async (item: AppNotification) => {
    if (!item.readAt) {
      try {
        await api.post(`/notifications/${item.id}/read`);
        invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
      } catch {
        // Ignore read error and still navigate
      }
    }
    const target = resolveNotificationTarget(item);
    setNotifOpen(false);
    navigate(target);
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.post("/notifications/read-all");
      invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
    } catch {
      // Ignore
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className={`pt-app${scrollingDown ? " is-scrolling-down" : ""}`}>
      <div className="pt-bg-backdrop" aria-hidden="true" />
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          {/* Logo thương hiệu HTX Krông Búk (hiển thị trên Desktop/Laptop) */}
          <Link href={INTRO_PATH} className="pt-brand" aria-label="HTX Krông Búk – về trang giới thiệu" title="Về trang giới thiệu">
            <span className="pt-brand-mark" aria-hidden="true">
              <Image src="/logo.png" alt="" width={30} height={30} />
            </span>
            <div className="pt-brand-text">
              <strong>HTX Krông Búk</strong>
              <span>Cổng hộ dân</span>
            </div>
          </Link>

          {/* Tiêu đề tab đang chọn trên Mobile */}
          <div className="pt-mobile-tab-title" aria-live="polite">
            <span className="pt-mobile-tab-name">{currentTabItem.label}</span>
          </div>

          {/* Thanh tab điều hướng chức năng trên Desktop/Laptop */}
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

          {/* Cụm Chuông thông báo + Avatar tài khoản */}
          <div className="pt-topbar-profile" style={{ gap: 8 }}>
            <button
              id="portal-notifications-toggle"
              type="button"
              className="pt-notif-btn"
              onClick={() => setNotifOpen(true)}
              aria-label={unreadCount > 0 ? `Thông báo (${unreadCount} chưa đọc)` : "Thông báo"}
              title="Thông báo từ HTX"
            >
              <Bell size={18} strokeWidth={2.1} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="pt-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
              )}
            </button>

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
          </div>

          {/* Phần điều hướng trên mobile: Nút tròn có icon menu */}
          <div className="pt-topbar-nav">
            <button
              id="portal-radial-toggle"
              type="button"
              className={`pt-nav-btn ${navWheelOpen ? "is-active" : ""}`}
              onClick={() => setNavWheelOpen((value) => !value)}
              aria-expanded={navWheelOpen}
              aria-controls="portal-radial-drawer"
              title="Mở menu điều hướng"
              aria-label="Mở menu điều hướng"
            >
              <span className="pt-nav-icon pt-nav-menu-mask" aria-hidden="true" />
            </button>
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
        {visitedTabs.has("stamps") && (
          <div className={`pt-tab-pane ${tab === "stamps" ? "is-active" : "is-hidden"}`}>
            <StampsTab overview={overview} />
            <SupportFooter onOpen={openSupport} />
          </div>
        )}
        {visitedTabs.has("inspection") && (
          <div className={`pt-tab-pane ${tab === "inspection" ? "is-active" : "is-hidden"}`}>
            <InspectionTab onNavigate={navigate} />
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

      {profileOpen && (
        <Sheet
          title="Thông tin tài khoản"
          onClose={closeProfile}
          className="pt-profile-sheet"
        >
          <div id="portal-profile-dropdown" className="pt-profile-sheet-content">
            <div className="pt-profile-popup-head">
              <div className="pt-profile-avatar-lg">
                <span>{initials}</span>
              </div>
              <div className="pt-profile-head-info">
                <strong className="pt-profile-name">{displayName}</strong>
                <div className="pt-profile-badges">
                  <span className="pt-profile-kicker">
                    {profHousehold?.code ? `MÃ: ${profHousehold.code}` : "HỘ THÀNH VIÊN"}
                  </span>
                  <span className={`pt-profile-status is-${householdStatus.tone}`}>
                    {householdStatus.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-profile-details">
              <div className="pt-profile-row">
                <Phone size={17} className="pt-profile-icon" aria-hidden="true" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Số điện thoại</span>
                  <strong className="pt-profile-val">
                    {profHousehold?.phone || "Chưa cập nhật"}
                  </strong>
                </div>
              </div>

              {profile?.household.cccdMasked && (
                <div className="pt-profile-row">
                  <CreditCard size={17} className="pt-profile-icon" aria-hidden="true" />
                  <div className="pt-profile-row-content">
                    <span className="pt-profile-label">CCCD chủ hộ</span>
                    <strong className="pt-profile-val">{profile.household.cccdMasked}</strong>
                  </div>
                </div>
              )}

              <div className="pt-profile-row">
                <MapPin size={17} className="pt-profile-icon" aria-hidden="true" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Địa bàn</span>
                  <strong className="pt-profile-val">
                    {profHousehold?.villageName ? `${profHousehold.villageName}, Xã Krông Búk` : "Xã Krông Búk"}
                  </strong>
                </div>
              </div>

              {profHousehold?.villageLeader && (
                <div className="pt-profile-row">
                  <UserCheck size={17} className="pt-profile-icon" aria-hidden="true" />
                  <div className="pt-profile-row-content">
                    <span className="pt-profile-label">Trưởng thôn</span>
                    <strong className="pt-profile-val">{profHousehold.villageLeader}</strong>
                  </div>
                </div>
              )}

              <div className="pt-profile-row">
                <TreePine size={17} className="pt-profile-icon" aria-hidden="true" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Quy mô vườn</span>
                  <strong className="pt-profile-val">
                    {profHousehold?.plotCount ?? 0} thửa ·{" "}
                    {(profHousehold?.areaHa ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ha
                  </strong>
                </div>
              </div>
            </div>

            <div className="pt-profile-footer">
              <button
                type="button"
                className="pt-profile-intro-btn"
                onClick={() => {
                  closeProfile();
                  setPasswordOpen(true);
                }}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <KeyRound size={20} strokeWidth={2.1} />
                </span>
                <span className="pt-profile-action-title">Đổi mật khẩu</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

              <Link
                href={INTRO_PATH}
                className="pt-profile-intro-btn"
                onClick={closeProfile}
                title="Về trang giới thiệu HTX Krông Búk"
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <Image src="/logo.png" alt="" width={22} height={22} />
                </span>
                <span className="pt-profile-action-title">Trang giới thiệu HTX</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </Link>

              <button
                id="portal-logout"
                type="button"
                className="pt-profile-logout-btn"
                onClick={() => {
                  closeProfile();
                  void logout();
                }}
              >
                <LogOut aria-hidden="true" size={17} strokeWidth={2.2} />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {notifOpen && (
        <Sheet title="Thông báo từ HTX" onClose={() => setNotifOpen(false)}>
          <div className="pt-stack" style={{ gap: 14 }}>
            {unreadCount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Bạn có <strong>{unreadCount}</strong> thông báo chưa đọc
                </span>
                <BusyButton
                  type="button"
                  className="pt-btn pt-btn-ghost pt-btn-sm"
                  busy={markingAll}
                  busyLabel="Đang đánh dấu…"
                  onClick={() => void handleMarkAllRead()}
                >
                  <CheckCheck size={15} aria-hidden="true" />
                  <span>Đánh dấu đã đọc hết</span>
                </BusyButton>
              </div>
            )}

            <StateBlock loading={notifications.loading} error={notifications.error} variant="rows" />

            {!notifications.loading && notifItems.length === 0 && (
              <EmptyState icon="ok">Hiện chưa có thông báo mới nào từ HTX.</EmptyState>
            )}

            {notifItems.length > 0 && (
              <ul className="pt-list">
                {notifItems.map((item) => {
                  const isUnread = !item.readAt;
                  return (
                    <li
                      key={item.id}
                      className={`pt-notif-item ${isUnread ? "is-unread" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => void handleMarkRead(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void handleMarkRead(item);
                        }
                      }}
                    >
                      <div className="pt-notif-dot-col">
                        <span className={`pt-notif-dot ${isUnread ? "is-active" : ""}`} aria-hidden="true" />
                      </div>
                      <div className="pt-notif-content">
                        <div className="pt-notif-head">
                          <strong>{item.title}</strong>
                          <span className="pt-notif-time">{formatDate(item.createdAt)}</span>
                        </div>
                        {item.body && <p className="pt-notif-body">{item.body}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Sheet>
      )}

      {passwordOpen && (
        <Sheet title="Đổi mật khẩu tài khoản" onClose={() => setPasswordOpen(false)}>
          <ChangePasswordForm
            onSuccess={() => {
              setPasswordOpen(false);
              void logout();
            }}
            onClose={() => setPasswordOpen(false)}
          />
        </Sheet>
      )}

      <SystemSupportModal
        open={supportOpen}
        onClose={closeSupport}
        household={overview?.household}
      />

      <RadialNavWheel
        currentTab={tab}
        onSelectTab={navigate}
        open={navWheelOpen}
        onClose={() => setNavWheelOpen(false)}
      />
    </div>
  );
}
