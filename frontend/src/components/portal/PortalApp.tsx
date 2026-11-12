"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Camera,
  ClipboardCheck,
  Globe,
  House,
  Mail,
  NotebookPen,
  Scale,
  Trash2,
  TreePine,
  type LucideIcon,
} from "lucide-react";
import { type ChangeEvent, FormEvent, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { invalidateQueries, NOTIFICATIONS_PATH, portalPath, usePortal, useSharedQuery } from "@/hooks/use-portal";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { api, errorMessage } from "@/lib/api-client";
import { isLowEndDevice } from "@/lib/network";
import { HOUSEHOLD_STATUS } from "@/lib/portal-labels";
import { INTRO_PATH } from "@/lib/routes";
import { formatDate } from "@/utils/format";
import type { AppNotification, NotificationList, PortalOverview, PortalProfile } from "@/types/portal";
import dynamic from "next/dynamic";
import "./portal.css";
import HomeTab from "./HomeTab";
import { PortalLangProvider, usePortalLang } from "./i18n";
import { PortalSearchButton, type PortalAction, type PortalSearchTarget } from "./PortalSearch";
import { RadialPngIcon } from "./RadialIcons";
import RadialNavWheel from "./RadialNavWheel";
import { BusyButton, InlineError } from "./shared/controls";
import { uploadPortalFile, validatePickedFile } from "./shared/media";
import { SupportFooter, SystemSupportModal } from "./SystemSupport";
import { DrawerSummaryFooter, EmptyState, Field, Sheet, StateBlock, useIsDesktopViewport, useSheetClose } from "./ui";

const PortalTabLoading = () => <StateBlock loading error={null} />;

function DrawerCloseCta({ label }: { label: string }) {
  const close = useSheetClose();
  return (
    <button
      type="button"
      className="pt-drawer-cta"
      onClick={() => close?.()}
    >
      <span>{label}</span>
      <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

const DiaryTab = dynamic(() => import("./DiaryTab"), { loading: PortalTabLoading });
const InspectionTab = dynamic(() => import("./InspectionTab"), { loading: PortalTabLoading });
const LearnTab = dynamic(() => import("./LearnTab"), { loading: PortalTabLoading });
const PlotsTab = dynamic(() => import("./PlotsTab"), { loading: PortalTabLoading });
const StampsTab = dynamic(() => import("./StampsTab"), { loading: PortalTabLoading });

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
  return (
    <PortalLangProvider>
      <PortalAppContent />
    </PortalLangProvider>
  );
}

function PortalAppContent() {
  const router = useRouter();
  const { lang, setLang, t } = usePortalLang();
  const { status, session, logout, updateProfile } = useAuth();
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
  const [profileOpen, setProfileOpen] = useState(false);
  const isDesktopDrawer = useIsDesktopViewport(760);
  const [supportOpen, setSupportOpen] = useState(false);
  const [navWheelOpen, setNavWheelOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [accountNameInput, setAccountNameInput] = useState("");
  const [accountEmailInput, setAccountEmailInput] = useState("");
  const [accountPasswordInput, setAccountPasswordInput] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [localAvatarOverride, setLocalAvatarOverride] = useState<string | null | undefined>(undefined);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingRead, setClearingRead] = useState(false);
  const [notifFilter, setNotifFilter] = useState<"all" | "unread">("all");
  const [localReadIds, setLocalReadIds] = useState<number[]>([]);
  const [localClearedIds, setLocalClearedIds] = useState<number[]>([]);

  const openSupport = useCallback(() => setSupportOpen(true), []);
  const closeSupport = useCallback(() => setSupportOpen(false), []);

  const currentTabItem = useMemo(() => TABS.find((t) => t.id === tab) || TABS[0], [tab]);

  // Thao tác được yêu cầu từ ô tìm kiếm (ví dụ mở sẵn biểu mẫu ghi nhật ký). `nonce` tăng mỗi lần chọn
  // để tab được dựng lại và nhận thao tác mới, kể cả khi đang ở đúng tab đó.
  const [intent, setIntent] = useState<{ action?: PortalAction; nonce: number }>({ nonce: 0 });

  const navigate = useCallback((next: PortalTabId) => {
    setNavWheelOpen(false);
    // Điều hướng thông thường: bỏ thao tác cũ từ ô tìm kiếm để tab không tự mở lại biểu mẫu
    setIntent((prev) => (prev.action ? { nonce: prev.nonce } : prev));
    startTransition(() => {
      setTab(next);
    });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const handleSearchPick = useCallback((target: PortalSearchTarget) => {
    if (target.kind === "global") {
      if (target.action === "notifications") setNotifOpen(true);
      else if (target.action === "profile") setProfileOpen(true);
      else if (target.action === "password") setPasswordOpen(true);
      else setSupportOpen(true);
      return;
    }
    setNavWheelOpen(false);
    setIntent((prev) => ({ action: target.action, nonce: prev.nonce + 1 }));
    startTransition(() => {
      setTab(target.tab);
    });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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
    document.documentElement.classList.remove("is-scrolling-down");
    document.documentElement.classList.add("pt-html");
    document.body.classList.add("pt-body");
    return () => {
      document.documentElement.classList.remove("pt-html", "is-scrolling-down");
      document.body.classList.remove("pt-body");
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "farmer") return;
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        invalidateQueries(NOTIFICATIONS_PATH);
      }
    };
    const pollMs = isLowEndDevice() ? 60000 : 30000;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        invalidateQueries(NOTIFICATIONS_PATH);
      }
    }, pollMs);
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [status, session?.user.role]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "farmer") return;
    if (isLowEndDevice()) return;
    const loaders = [
      () => import("./PlotsTab"),
      () => import("./DiaryTab"),
      () => import("./StampsTab"),
      () => import("./InspectionTab"),
      () => import("./LearnTab"),
    ];
    const timers = loaders.map((load, idx) =>
      window.setTimeout(() => {
        void load();
      }, 1800 + idx * 450),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [status, session?.user.role]);

  const apiNotifItems = (notifications.data?.data ?? []).filter((n) => n.kind !== "training");
  const fallbackNotifItems = useMemo<AppNotification[]>(() => {
    if (apiNotifItems.length > 0) return [];
    const reminders = (overview?.reminders ?? []).filter((r) => r.kind !== "training");
    return reminders
      .map((r, idx) => {
        const id = -(idx + 1);
        const isRead = localReadIds.includes(id);
        const prefix =
          r.kind === "violation" || r.kind === "journal"
            ? "Cảnh báo vi phạm: "
            : r.kind === "schedule"
              ? "Lịch kiểm tra: "
              : "";
        const title = prefix && !r.title.startsWith(prefix) ? `${prefix}${r.title}` : r.title;
        return {
          id,
          kind: (r.kind === "journal" || r.kind === "isolation" ? "violation" : r.kind) as AppNotification["kind"],
          title,
          body: r.detail ?? null,
          link: `/portal?tab=${r.tab}`,
          readAt: isRead ? new Date().toISOString() : null,
          createdAt: r.date ?? new Date().toISOString(),
        };
      })
      .filter((item) => !localClearedIds.includes(item.id));
  }, [apiNotifItems.length, overview?.reminders, localReadIds, localClearedIds]);

  if (status !== "authenticated" || session?.user.role !== "farmer") {
    return <PageSkeleton label="Đang kiểm tra phiên đăng nhập…" />;
  }

  const profHousehold = profile?.household ?? overview?.household;
  const profAccount = profile?.account;
  const displayName = profHousehold?.name || profAccount?.fullName || session?.user.fullName || "Hộ thành viên";
  const linkedEmail = profAccount?.email ?? session?.user.email ?? null;
  const serverAvatarUrl = profile?.household.avatarUrl ?? overview?.household.avatarUrl ?? null;
  const avatarUrl = localAvatarOverride !== undefined ? localAvatarOverride : serverAvatarUrl;
  const householdStatus = HOUSEHOLD_STATUS[profHousehold?.status ?? "pending"] ?? HOUSEHOLD_STATUS.pending;
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "HD";

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploadingAvatar) return;

    const validationError = validatePickedFile(file);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const attachmentId = await uploadPortalFile(file, "avatar");
      const saved = await api.patch<{ avatarUrl: string | null }>("/portal/profile/avatar", {
        avatarId: attachmentId,
      });
      setLocalAvatarOverride(saved.avatarUrl);
      invalidateQueries(portalPath("profile"));
      invalidateQueries(portalPath("overview"));
    } catch (err) {
      setAvatarError(errorMessage(err, "Không thể tải ảnh đại diện lên. Vui lòng thử lại."));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (uploadingAvatar || !avatarUrl) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      await api.patch<{ avatarUrl: string | null }>("/portal/profile/avatar", { avatarId: null });
      setLocalAvatarOverride(null);
      invalidateQueries(portalPath("profile"));
      invalidateQueries(portalPath("overview"));
    } catch (err) {
      setAvatarError(errorMessage(err, "Không thể gỡ ảnh đại diện."));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const notifItems = apiNotifItems.length > 0 ? apiNotifItems : fallbackNotifItems;
  const unreadCount =
    apiNotifItems.length > 0
      ? (notifications.data?.unread ?? apiNotifItems.filter((n) => !n.readAt).length)
      : fallbackNotifItems.filter((n) => !n.readAt).length;
  const readCount = notifItems.filter((n) => Boolean(n.readAt)).length;
  const visibleNotifItems = notifFilter === "unread" ? notifItems.filter((n) => !n.readAt) : notifItems;

  const normalizedLinkedEmail = linkedEmail ? linkedEmail.trim().toLowerCase() : null;
  const normalizedAccountEmailInput = accountEmailInput.trim() ? accountEmailInput.trim().toLowerCase() : null;
  const accountEmailChanged = normalizedAccountEmailInput !== normalizedLinkedEmail;

  const openEditAccount = () => {
    setAccountNameInput(profAccount?.fullName || session?.user.fullName || displayName);
    setAccountEmailInput(linkedEmail ?? "");
    setAccountPasswordInput("");
    setAccountError(null);
    closeProfile();
    setEditAccountOpen(true);
  };

  const handleSaveAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!accountNameInput.trim()) {
      setAccountError("Tên hiển thị không được để trống.");
      return;
    }
    if (accountEmailChanged && !accountPasswordInput) {
      setAccountError("Vui lòng nhập mật khẩu hiện tại để xác nhận thay đổi địa chỉ email liên kết.");
      return;
    }
    setSavingAccount(true);
    setAccountError(null);
    try {
      await updateProfile({
        fullName: accountNameInput.trim(),
        email: normalizedAccountEmailInput,
        ...(accountEmailChanged ? { currentPassword: accountPasswordInput } : {}),
      });
      setAccountPasswordInput("");
      invalidateQueries(portalPath("profile"), portalPath("overview"));
      setEditAccountOpen(false);
    } catch (err) {
      setAccountError(errorMessage(err, "Không thể cập nhật thông tin tài khoản."));
    } finally {
      setSavingAccount(false);
    }
  };

  const handleMarkRead = async (item: AppNotification) => {
    if (!item.readAt) {
      if (item.id < 0) {
        setLocalReadIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
      } else {
        try {
          await api.post(`/notifications/${item.id}/read`);
          invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
        } catch {
          // Ignore read error and still navigate
        }
      }
    }
    if (item.kind === "system") {
      setNotifOpen(false);
      setSupportOpen(true);
      return;
    }
    const target = resolveNotificationTarget(item);
    setNotifOpen(false);
    navigate(target);
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      if (apiNotifItems.length === 0 && fallbackNotifItems.length > 0) {
        setLocalReadIds(fallbackNotifItems.map((n) => n.id));
      } else {
        await api.post("/notifications/read-all");
        invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
      }
    } catch {
      // Ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClearRead = async () => {
    if (clearingRead || readCount === 0) return;
    setClearingRead(true);
    try {
      if (apiNotifItems.length === 0 && fallbackNotifItems.length > 0) {
        const readIds = fallbackNotifItems.filter((n) => Boolean(n.readAt)).map((n) => n.id);
        setLocalClearedIds((prev) => Array.from(new Set([...prev, ...readIds])));
      } else {
        await api.post("/notifications/clear-read");
        invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
      }
    } catch {
      // Ignore
    } finally {
      setClearingRead(false);
    }
  };

  return (
    <div className="pt-app">
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          {/* Logo thương hiệu HTX Cư Né (hiển thị trên Desktop/Laptop) */}
          <Link href={INTRO_PATH} className="pt-brand" aria-label="HTX Cư Né – về trang giới thiệu" title="Về trang giới thiệu">
            <span className="pt-brand-mark" aria-hidden="true">
              <Image src="/newlogo.png" alt="" width={32} height={32} />
            </span>
            <div className="pt-brand-text">
              <strong>HTX Cư Né</strong>
              <span>Cổng hộ dân</span>
            </div>
          </Link>

          {/* Tiêu đề tab đang chọn trên Mobile */}
          <div className="pt-mobile-tab-title" aria-live="polite">
            <span className="pt-mobile-tab-name">{t(currentTabItem.label)}</span>
          </div>

          {/* Thanh tab điều hướng chức năng trên Desktop/Laptop */}
          <nav className="pt-tabs" aria-label={t("Chức năng")}>
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
                  <span>{t(item.label)}</span>
                </button>
              );
            })}
          </nav>

          {/* Cụm Chuông thông báo + Tìm kiếm + Avatar tài khoản */}
          <div className="pt-topbar-profile" style={{ gap: 8 }}>
            <button
              id="portal-notifications-toggle"
              type="button"
              className="pt-notif-btn"
              onClick={() => {
                setNotifOpen(true);
                invalidateQueries(NOTIFICATIONS_PATH);
              }}
              aria-expanded={notifOpen}
              aria-haspopup="dialog"
              aria-label={unreadCount > 0 ? `Thông báo (${unreadCount} chưa đọc)` : "Thông báo"}
              title="Thông báo từ HTX"
            >
              <RadialPngIcon src="/bell.png" size={18} />
              {unreadCount > 0 && (
                <span className="pt-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
              )}
            </button>

            {/* Tìm chức năng (máy tính): gõ bất kỳ chữ nào để được gợi ý đúng tab và thao tác */}
            <PortalSearchButton id="portal-search-toggle" className="is-desktop" onPick={handleSearchPick} />

            <button
              id="portal-profile-toggle"
              type="button"
              className={`pt-avatar-btn ${profileOpen ? "is-active" : ""}`}
              onClick={toggleProfile}
              aria-expanded={profileOpen}
              aria-haspopup="dialog"
              title={`Hồ sơ: ${displayName}`}
            >
              <span className="pt-avatar">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={displayName} className="pt-avatar-img" />
                ) : (
                  initials
                )}
              </span>
            </button>
          </div>

          {/* Phần điều hướng trên mobile: Nút tròn có icon menu */}
          <div className="pt-topbar-nav">
            {/* Tìm chức năng (điện thoại): đặt cạnh nút menu để không đè lên tiêu đề tab ở giữa */}
            <PortalSearchButton id="portal-search-toggle-mobile" className="is-mobile" onPick={handleSearchPick} />
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
        <div key={`${tab}-${intent.nonce}-${lang}`} className="pt-tab-pane is-active">
          {tab === "home" && <HomeTab onNavigate={navigate} />}
          {tab === "plots" && <PlotsTab />}
          {tab === "diary" && <DiaryTab initialAction={intent.action} />}
          {tab === "stamps" && <StampsTab overview={overview} />}
          {tab === "inspection" && <InspectionTab onNavigate={navigate} />}
          {tab === "learn" && <LearnTab initialAction={intent.action} />}
          <SupportFooter onOpen={openSupport} />
        </div>
      </main>

      {profileOpen && (
        <Sheet
          variant="drawer"
          title={t("Thông tin tài khoản")}
          onClose={closeProfile}
          className="pt-profile-sheet"
        >
          <div id="portal-profile-dropdown" className="pt-profile-sheet-content">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void handleAvatarChange(e)}
              style={{ display: "none" }}
              aria-hidden="true"
              tabIndex={-1}
            />

            <div className="pt-profile-popup-head">
              <button
                type="button"
                className="pt-profile-avatar-trigger"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                title={t("Bấm để tải lên hoặc đổi ảnh đại diện hộ")}
                aria-label={t("Tải lên hoặc đổi ảnh đại diện hộ")}
              >
                <div className="pt-profile-avatar-lg">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={displayName} className="pt-profile-avatar-img" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <span className="pt-profile-avatar-cam" aria-hidden="true">
                  <Camera size={13} strokeWidth={2.4} />
                </span>
              </button>

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

            <div className="pt-profile-photo-card">
              <div className="pt-profile-photo-main">
                <div className="pt-profile-photo-info">
                  <strong className="pt-profile-photo-title">
                    {t("Ảnh đại diện hộ")}
                  </strong>
                  <span className="pt-profile-photo-desc">
                    {t("Hiển thị trên hồ sơ truy xuất QR")}
                  </span>
                </div>
                <div className="pt-profile-photo-actions">
                  <button
                    type="button"
                    className="pt-profile-photo-upload-btn"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    <RadialPngIcon src="/up-loading.png" size={15} />
                    <span>
                      {uploadingAvatar
                        ? t("Đang tải ảnh…")
                        : avatarUrl
                          ? t("Đổi ảnh")
                          : t("Tải ảnh lên")}
                    </span>
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      className="pt-profile-photo-remove-btn"
                      onClick={() => void handleRemoveAvatar()}
                      disabled={uploadingAvatar}
                      title={t("Gỡ ảnh đại diện hiện tại")}
                      aria-label={t("Gỡ ảnh đại diện hiện tại")}
                    >
                      <Trash2 size={14} strokeWidth={2.1} aria-hidden="true" />
                      <span>{t("Gỡ")}</span>
                    </button>
                  )}
                </div>
              </div>
              {avatarError && <InlineError message={avatarError} />}
            </div>

            <div className="pt-profile-details">
              <div className="pt-profile-row">
                <RadialPngIcon src="/call.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Số điện thoại</span>
                  <strong className="pt-profile-val">
                    {profHousehold?.phone || "Chưa cập nhật"}
                  </strong>
                </div>
              </div>

              <div className="pt-profile-row">
                <span className="pt-profile-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, color: "#166534" }}>
                  <Mail size={20} />
                </span>
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Email liên kết Google</span>
                  <strong className="pt-profile-val">
                    {linkedEmail || "Chưa liên kết"}
                  </strong>
                </div>
              </div>

              {profile?.household.cccdMasked && (
                <div className="pt-profile-row">
                  <RadialPngIcon src="/id-card.png" size={24} className="pt-profile-icon" />
                  <div className="pt-profile-row-content">
                    <span className="pt-profile-label">CCCD chủ hộ</span>
                    <strong className="pt-profile-val">{profile.household.cccdMasked}</strong>
                  </div>
                </div>
              )}

              <div className="pt-profile-row">
                <RadialPngIcon src="/placeholder.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Địa bàn</span>
                  <strong className="pt-profile-val">
                    {profHousehold?.villageName ? `${profHousehold.villageName}, Xã Ea Khăl, Đắk Lắk` : "Xã Ea Khăl, Đắk Lắk"}
                  </strong>
                </div>
              </div>

              {profHousehold?.villageLeader && (
                <div className="pt-profile-row">
                  <RadialPngIcon src="/leader.png" size={24} className="pt-profile-icon" />
                  <div className="pt-profile-row-content">
                    <span className="pt-profile-label">Trưởng thôn</span>
                    <strong className="pt-profile-val">{profHousehold.villageLeader}</strong>
                  </div>
                </div>
              )}

              <div className="pt-profile-row">
                <RadialPngIcon src="/scale.png" size={24} className="pt-profile-icon" />
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
              <div className="pt-profile-lang-row" role="group" aria-label={t("Ngôn ngữ")}>
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <Globe size={21} strokeWidth={2.1} />
                </span>
                <span className="pt-profile-action-title">{t("Ngôn ngữ")}</span>
                <div className="pt-lang-seg" data-no-translate translate="no">
                  <button
                    type="button"
                    className={`pt-lang-seg-btn ${lang === "vi" ? "is-active" : ""}`}
                    onClick={() => setLang("vi")}
                    aria-pressed={lang === "vi"}
                  >
                    Tiếng Việt
                  </button>
                  <button
                    type="button"
                    className={`pt-lang-seg-btn ${lang === "zh" ? "is-active" : ""}`}
                    onClick={() => setLang("zh")}
                    aria-pressed={lang === "zh"}
                  >
                    中文
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="pt-profile-intro-btn"
                onClick={openEditAccount}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <RadialPngIcon src="/update.png" size={21} />
                </span>
                <span className="pt-profile-action-title">{t("Cập nhật Email Google & Tài khoản")}</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

              <button
                type="button"
                className="pt-profile-intro-btn"
                onClick={() => {
                  closeProfile();
                  setPasswordOpen(true);
                }}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <RadialPngIcon src="/key.png" size={22} />
                </span>
                <span className="pt-profile-action-title">{t("Đổi mật khẩu")}</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

              <Link
                href={INTRO_PATH}
                className="pt-profile-intro-btn"
                onClick={closeProfile}
                title={t("Về trang giới thiệu HTX Cư Né")}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <Image src="/newlogo.png" alt="" width={24} height={24} />
                </span>
                <span className="pt-profile-action-title">{t("Trang giới thiệu HTX")}</span>
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
                <RadialPngIcon src="/logout.png" size={20} />
                <span>{t("Đăng xuất")}</span>
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {notifOpen && (
        <Sheet
          variant="drawer"
          title={t("Thông báo từ HTX")}
          onClose={() => setNotifOpen(false)}
          className="pt-notif-sheet"
          footer={
            <DrawerSummaryFooter
              actions={
                <>
                  {readCount > 0 && (
                    <BusyButton
                      type="button"
                      className="pt-drawer-cta-ghost"
                      busy={clearingRead}
                      busyLabel={t("Đang xóa…")}
                      onClick={() => void handleClearRead()}
                    >
                      <span>{t("Xóa đã đọc")} ({readCount})</span>
                    </BusyButton>
                  )}
                  {unreadCount > 0 ? (
                    <BusyButton
                      type="button"
                      className="pt-drawer-cta"
                      busy={markingAll}
                      busyLabel={t("Đang đánh dấu…")}
                      onClick={() => void handleMarkAllRead()}
                    >
                      <span>{t("Đánh dấu đọc hết")}</span>
                      <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
                    </BusyButton>
                  ) : (
                    <DrawerCloseCta label={t("Đã nắm thông tin")} />
                  )}
                </>
              }
            />
          }
        >
          <div className="pt-stack" style={{ gap: 14 }}>
            {notifItems.length > 0 && (
              <div className="pt-notif-toolbar">
                <div className="pt-notif-filter-group">
                  <button
                    type="button"
                    className={`pt-btn pt-btn-sm ${notifFilter === "all" ? "pt-btn-primary" : "pt-btn-ghost"}`}
                    onClick={() => setNotifFilter("all")}
                  >
                    Tất cả ({notifItems.length})
                  </button>
                  <button
                    type="button"
                    className={`pt-btn pt-btn-sm ${notifFilter === "unread" ? "pt-btn-primary" : "pt-btn-ghost"}`}
                    onClick={() => setNotifFilter("unread")}
                  >
                    Chưa đọc ({unreadCount})
                  </button>
                </div>
                {!isDesktopDrawer && (unreadCount > 0 || readCount > 0) && (
                  <div className="pt-notif-action-group">
                    {unreadCount > 0 && (
                      <BusyButton
                        type="button"
                        className="pt-btn pt-btn-ghost pt-btn-sm pt-notif-markall-btn"
                        busy={markingAll}
                        busyLabel="Đang đánh dấu…"
                        onClick={() => void handleMarkAllRead()}
                      >
                        <span>Đọc hết</span>
                      </BusyButton>
                    )}
                    {readCount > 0 && (
                      <BusyButton
                        type="button"
                        className="pt-btn pt-btn-ghost pt-btn-sm"
                        busy={clearingRead}
                        busyLabel="Đang xóa…"
                        onClick={() => void handleClearRead()}
                      >
                        <span>Xóa đã đọc ({readCount})</span>
                      </BusyButton>
                    )}
                  </div>
                )}
              </div>
            )}

            <StateBlock loading={notifications.loading} error={notifications.error} variant="rows" />

            {!notifications.loading && visibleNotifItems.length === 0 && (
              isDesktopDrawer ? (
                <p className="pt-drawer-empty-note">
                  {notifFilter === "unread"
                    ? t("Bạn đã đọc hết tất cả thông báo.")
                    : t("Hiện chưa có thông báo mới nào từ HTX.")}
                </p>
              ) : (
                <EmptyState icon="none">
                  {notifFilter === "unread"
                    ? "Bạn đã đọc hết tất cả thông báo."
                    : "Hiện chưa có thông báo mới nào từ HTX."}
                </EmptyState>
              )
            )}

            {visibleNotifItems.length > 0 && (
              <ul className="pt-notif-list">
                {visibleNotifItems.map((item) => {
                  const isUnread = !item.readAt;
                  return (
                    <li
                      key={item.id}
                      className={`pt-notif-item ${isUnread ? "is-unread" : ""} ${item.kind === "system" ? "is-system" : ""}`.trim()}
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

      {editAccountOpen && (
        <Sheet
          variant="drawer"
          title={t("Cập nhật Email Google & Tài khoản")}
          onClose={() => setEditAccountOpen(false)}
          className="pt-password-sheet"
        >
          <form className="pt-form" onSubmit={handleSaveAccount}>
            <Field label="Tên hiển thị tài khoản" htmlFor="pt-acc-name">
              <input
                id="pt-acc-name"
                type="text"
                value={accountNameInput}
                onChange={(e) => setAccountNameInput(e.target.value)}
                required
              />
            </Field>
            <Field label="Email liên kết đăng nhập Google" htmlFor="pt-acc-email">
              <input
                id="pt-acc-email"
                type="email"
                placeholder="vi-du@gmail.com"
                value={accountEmailInput}
                onChange={(e) => setAccountEmailInput(e.target.value)}
              />
            </Field>
            {accountEmailChanged && (
              <Field label="Mật khẩu hiện tại (xác nhận đổi email)" htmlFor="pt-acc-current-password">
                <input
                  id="pt-acc-current-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu hiện tại của bạn"
                  value={accountPasswordInput}
                  onChange={(e) => setAccountPasswordInput(e.target.value)}
                  required
                />
              </Field>
            )}
            <p className="pt-hint">
              Email này giúp bạn đăng nhập 1 chạm bằng nút <strong>Tiếp tục với Google</strong> trên màn hình đăng nhập. Các thông tin pháp lý hộ canh tác (CCCD, diện tích, thửa đất) do Ban quản trị HTX thiết lập và quản lý.
            </p>
            <InlineError message={accountError} />
            <div className="pt-form-actions">
              <button
                type="button"
                className="pt-btn pt-btn-ghost"
                onClick={() => setEditAccountOpen(false)}
                disabled={savingAccount}
              >
                Hủy
              </button>
              <BusyButton
                type="submit"
                className="pt-btn pt-btn-primary"
                busy={savingAccount}
                busyLabel="Đang lưu…"
              >
                Lưu thay đổi
              </BusyButton>
            </div>
          </form>
        </Sheet>
      )}

      {passwordOpen && (
        <Sheet
          variant="drawer"
          title={t("Đổi mật khẩu tài khoản")}
          onClose={() => setPasswordOpen(false)}
          className="pt-password-sheet"
        >
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
