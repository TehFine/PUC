"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
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
  TreePine,
  type LucideIcon,
} from "@/components/ui/PublicIcon";
import { type ChangeEvent, FormEvent, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasPendingServerLogout, useAuth } from "@/components/auth/AuthProvider";
import { WORKSPACE_ACTIVE_SESSION_KEY } from "@/components/landing/AutoEnter";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { ConfirmDialog } from "@/components/ui/Modal";
import OfflineSyncBar from "@/components/ui/OfflineSyncBar";
import { toast } from "@/components/ui/Toast";
import {
  invalidateQueries,
  NOTIFICATIONS_PATH,
  optimisticMarkNotificationRead,
  portalPath,
  useSharedQuery,
  warmPortalEssentialOfflineCache,
} from "@/hooks/use-portal";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { isRealtimeStreamConnected, useRealtimeNotifications } from "@/lib/realtime-notifications";
import {
  api,
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
  errorMessage,
} from "@/lib/api-client";
import {
  ensureRootEntryBeforeSubPage,
  PORTAL_LAST_URL_KEY,
  PUC_URL_SYNC_EVENT,
  pushUrlNavigation,
  readWorkspaceUrl,
  replaceUrlPreservingState,
  resetOverlayHistoryOnRouteLeave,
  saveWorkspaceUrl,
  usePersistedState,
} from "@/lib/back-navigation";
import { lazyChunk } from "@/lib/lazy-chunk";
import { resolveValidPortalRoute } from "@/lib/route-validation";
import { isLowEndDevice } from "@/lib/network";
import { HOUSEHOLD_STATUS } from "@/lib/portal-labels";
import { INTRO_PATH } from "@/lib/routes";
import { formatTime, groupNotificationsByDay } from "@/utils/format";
import { isSafeMediaUrl } from "@/utils/url-safety";
import type { AppNotification, NotificationList, PortalOverview, PortalProfile } from "@/types/portal";
import dynamic from "next/dynamic";
import "./portal.css";
import HomeTab from "./HomeTab";
import { PortalLangProvider, usePortalLang } from "./i18n";

const ActiveSessionsSheet = dynamic(
  () => import("@/components/layout/UserSecuritySheets").then((m) => m.ActiveSessionsSheet),
  { ssr: false },
);
const TwoFactorSecuritySheet = dynamic(
  () => import("@/components/layout/UserSecuritySheets").then((m) => m.TwoFactorSecuritySheet),
  { ssr: false },
);
import type { PortalAction, PortalSearchTarget } from "./PortalSearch";
import { RadialPngIcon } from "./RadialIcons";
import RadialNavWheel from "./RadialNavWheel";
import { BusyButton, InlineError } from "./shared/controls";
import { uploadPortalFile, validatePickedFile } from "./shared/media";
import { SupportFooter, SystemSupportModal } from "./SystemSupport";
import { DrawerSummaryFooter, EmptyState, Field, Sheet, StateBlock, useIsDesktopViewport, useSheetClose } from "./ui";

const PortalTabLoading = () => <StateBlock loading error={null} />;
const PortalSearchDialog = dynamic(() => lazyChunk(() => import("./PortalSearch")), { ssr: false });

const LEGACY_READ_NOTIFS_KEY = "puc_portal_read_notifs";
const READ_NOTIFS_PREFIX = "puc_portal_read_notifs:";

function buildReadNotifsStorageKey(userId: number | null | undefined): string | null {
  return typeof userId === "number" && Number.isInteger(userId) && userId > 0
    ? `${READ_NOTIFS_PREFIX}${userId}`
    : null;
}

function formatHouseholdLocation(villageName?: string | null, communeLocation?: string | null): string {
  const v = (villageName ?? "").trim();
  const c = (communeLocation ?? "").trim();
  if (v && c) {
    const vNorm = v.toLowerCase();
    const cNorm = c.toLowerCase();
    const cFirst = cNorm.split(",")[0]?.trim() ?? "";
    if (cNorm.startsWith(vNorm) || vNorm === cFirst) return c;
    if (vNorm.includes(cNorm)) return v;
    return [v, c].join(", ");
  }
  return [v, c].filter(Boolean).join(", ") || "Chưa cập nhật";
}

/** Băm một chiều khóa nhắc nhở để không lưu nguyên văn tiêu đề vi phạm/nhắc việc trên thiết bị dùng chung. */
function hashReminderReadKey(kind: string, title: string, date?: string | null): string {
  const input = `${kind}|${title}|${date ?? ""}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `rem:${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
}

function loadScopedReadKeys(userId: number | null | undefined): string[] {
  if (typeof window === "undefined") return [];
  const storageKey = buildReadNotifsStorageKey(userId);
  if (!storageKey) return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && (x.startsWith("api:") || x.startsWith("rem:")))
      : [];
  } catch {
    return [];
  }
}

function clearAllReadNotifStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_READ_NOTIFS_KEY);
  } catch {
    // ignore
  }
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k && (k === LEGACY_READ_NOTIFS_KEY || k.startsWith(READ_NOTIFS_PREFIX))) {
        window.sessionStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
}

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

const DiaryTab = dynamic(() => lazyChunk(() => import("./DiaryTab")), { loading: PortalTabLoading });
const InspectionTab = dynamic(() => lazyChunk(() => import("./InspectionTab")), { loading: PortalTabLoading });
const LearnTab = dynamic(() => lazyChunk(() => import("./LearnTab")), { loading: PortalTabLoading });
const PlotsTab = dynamic(() => lazyChunk(() => import("./PlotsTab")), { loading: PortalTabLoading });
const StampsTab = dynamic(() => lazyChunk(() => import("./StampsTab")), { loading: PortalTabLoading });

export type PortalTabId = "home" | "plots" | "diary" | "stamps" | "inspection" | "learn";

const TABS: { id: PortalTabId; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Trang chủ", icon: House },
  { id: "diary", label: "Nhật ký", icon: NotebookPen },
  { id: "plots", label: "Thửa đất", icon: TreePine },
  { id: "learn", label: "Kiến thức", icon: BookOpen },
  { id: "inspection", label: "Kiểm nghiệm", icon: ClipboardCheck },
  { id: "stamps", label: "Thu hoạch", icon: Scale },
];

function resolveNotificationTarget(item: AppNotification): { tab: PortalTabId; action?: PortalAction } {
  const kind = (item.kind || "").toLowerCase();
  const link = (item.link || "").toLowerCase();
  if (kind === "protocol" || link.includes("view=protocol") || link.includes("care-protocol")) {
    return { tab: "diary" };
  }
  if (kind === "violation" || kind === "journal" || kind === "spray") return { tab: "diary" };
  if (kind === "harvest") return { tab: "stamps" };
  if (kind === "schedule" || kind === "lab") return { tab: "inspection" };
  if (kind === "training") return { tab: "learn" };

  if (link.includes("plot")) return { tab: "plots" };
  if (link.includes("diary") || link.includes("journal") || link.includes("spray") || link.includes("violation")) {
    return { tab: "diary" };
  }
  if (link.includes("stamp") || link.includes("harvest")) return { tab: "stamps" };
  if (link.includes("inspect") || link.includes("lab") || link.includes("schedule")) {
    return { tab: "inspection" };
  }
  if (link.includes("learn") || link.includes("training")) return { tab: "learn" };

  return { tab: "home" };
}

function ChangePasswordForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const { t } = usePortalLang();
  const sheetClose = useSheetClose();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setError(t("Vui lòng nhập mật khẩu hiện tại."));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("Mật khẩu mới phải có tối thiểu 8 ký tự."));
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError(t("Mật khẩu mới cần bao gồm cả chữ cái và chữ số."));
      return;
    }
    if (new TextEncoder().encode(newPassword.normalize("NFC")).length > 72) {
      setError(t("Mật khẩu mới tối đa 72 byte UTF-8."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("Xác nhận mật khẩu mới chưa khớp."));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t("Mật khẩu mới phải khác mật khẩu hiện tại."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess();
    } catch (err) {
      setError(errorMessage(err, t("Không đổi được mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.")));
      setSaving(false);
    }
  };

  const inputType = showPassword ? "text" : "password";

  return (
    <form className="pt-form" autoComplete="off" data-form-type="other" onSubmit={submit} noValidate>
      <Field label={t("Mật khẩu hiện tại")} htmlFor="cp-current">
        <input
          id="cp-current"
          type={inputType}
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          data-lpignore="true"
          data-1p-ignore="true"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            if (error) setError(null);
          }}
          required
        />
      </Field>
      <Field label={t("Mật khẩu mới (tối thiểu 8 ký tự, gồm chữ và số)")} htmlFor="cp-new">
        <input
          id="cp-new"
          type={inputType}
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          data-lpignore="true"
          data-1p-ignore="true"
          minLength={8}
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (error) setError(null);
          }}
          required
        />
      </Field>
      <Field label={t("Nhập lại mật khẩu mới")} htmlFor="cp-confirm">
        <input
          id="cp-confirm"
          type={inputType}
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          data-lpignore="true"
          data-1p-ignore="true"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (error) setError(null);
          }}
          required
        />
      </Field>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 13,
          color: "#475569",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
        />
        <span>{t("Hiện mật khẩu")}</span>
      </label>
      <p className="pt-hint">
        {t("Sau khi đổi mật khẩu thành công, hệ thống sẽ đăng xuất để bạn đăng nhập lại bằng mật khẩu mới.")}
      </p>
      <InlineError message={error} />
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          {t("Hủy")}
        </button>
        <BusyButton
          type="submit"
          className="pt-btn pt-btn-primary"
          busy={saving}
          busyLabel={t("Đang cập nhật…")}
          disabled={!currentPassword || !newPassword || !confirmPassword}
        >
          {t("Lưu mật khẩu mới")}
        </BusyButton>
      </div>
    </form>
  );
}

/** Cổng dành cho hộ dân (tài khoản vai trò Nông dân). Cán bộ được chuyển về trang quản trị. */
export default function PortalApp({ initialTab = "home" }: { initialTab?: PortalTabId } = {}) {
  return (
    <PortalLangProvider>
      <PortalAppContent initialTab={initialTab} />
    </PortalLangProvider>
  );
}

function resolveClientPortalTab(serverTab: PortalTabId, userId?: number | null): PortalTabId {
  if (typeof window === "undefined") return serverTab;
  const sp = new URLSearchParams(window.location.search);
  const parsed = resolveValidPortalRoute(sp);
  if (!parsed) return serverTab;
  if (sp.has("tab") || sp.has("sub") || sp.has("view")) {
    return parsed.tab;
  }
  const savedUrl = readWorkspaceUrl(PORTAL_LAST_URL_KEY, userId);
  if (savedUrl) {
    const qIdx = savedUrl.indexOf("?");
    const savedSearch = qIdx >= 0 ? savedUrl.slice(qIdx) : "";
    const savedParsed = resolveValidPortalRoute(new URLSearchParams(savedSearch));
    if (savedParsed) {
      return savedParsed.tab;
    }
  }
  return parsed.tab;
}

function PortalAppContent({ initialTab }: { initialTab: PortalTabId }) {
  const router = useRouter();
  const { lang, setLang, t } = usePortalLang();
  const { status, session, logout, updateProfile, refreshSession } = useAuth();
  const isFarmerAuth = status === "authenticated" && session?.user.role === "farmer";
  const { data: overview } = useSharedQuery<PortalOverview>(isFarmerAuth ? portalPath("overview") : null);
  const { data: profile } = useSharedQuery<PortalProfile>(isFarmerAuth ? portalPath("profile") : null);
  const notifications = useSharedQuery<NotificationList>(isFarmerAuth ? NOTIFICATIONS_PATH : null);

  const [tab, setTab] = useState<PortalTabId>(() =>
    resolveClientPortalTab(initialTab, session?.user.id),
  );
  const [invalidClientUrl, setInvalidClientUrl] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? resolveValidPortalRoute(new URLSearchParams(window.location.search)) === null
      : false,
  );
  const [profileOpen, setProfileOpen] = usePersistedState("portal:profile-open", false);
  const isDesktopDrawer = useIsDesktopViewport(760);
  const [supportOpen, setSupportOpen] = usePersistedState("portal:support-open", false);
  const [searchOpen, setSearchOpen] = usePersistedState("portal:search-open", false);
  const pendingSearchTargetRef = useRef<PortalSearchTarget | null>(null);
  const [navWheelOpen, setNavWheelOpen] = usePersistedState("portal:nav-open", false);
  const [notifOpen, setNotifOpen] = usePersistedState("portal:notif-open", false);
  const [passwordOpen, setPasswordOpen] = usePersistedState("portal:password-open", false);
  const [twoFactorOpen, setTwoFactorOpen] = usePersistedState("portal:2fa-open", false);
  const [sessionsOpen, setSessionsOpen] = usePersistedState("portal:sessions-open", false);
  const [editAccountOpen, setEditAccountOpen] = usePersistedState("portal:edit-account-open", false);
  const [accountNameInput, setAccountNameInput] = useState("");
  const [accountEmailInput, setAccountEmailInput] = useState("");
  const [accountPasswordInput, setAccountPasswordInput] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [localAvatarOverride, setLocalAvatarOverride] = useState<string | null | undefined>(undefined);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [localConsentOverride, setLocalConsentOverride] = useState<boolean | undefined>(undefined);
  const [confirmRemoveAvatar, setConfirmRemoveAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [notifFilter, setNotifFilter] = usePersistedState<"unread" | "read">(
    "portal:notif-filter",
    "unread",
    (v): v is "unread" | "read" => v === "unread" || v === "read",
  );
  const activeUserId = session?.user.id ?? null;
  const [readKeysState, setReadKeysState] = useState<{ userId: number | null; keys: string[] }>(() => ({
    userId: activeUserId,
    keys: loadScopedReadKeys(activeUserId),
  }));
  const localReadKeys = useMemo(
    () => (readKeysState.userId === activeUserId ? readKeysState.keys : loadScopedReadKeys(activeUserId)),
    [activeUserId, readKeysState],
  );

  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_READ_NOTIFS_KEY);
    } catch {
      // ignore
    }
    const onClearAuth = () => {
      clearAllReadNotifStorage();
      setReadKeysState({ userId: null, keys: [] });
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onClearAuth);
    window.addEventListener(AUTH_EXPIRED_EVENT, onClearAuth);
    window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, onClearAuth);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onClearAuth);
      window.removeEventListener(AUTH_EXPIRED_EVENT, onClearAuth);
      window.removeEventListener(AUTH_SCOPE_CHANGED_EVENT, onClearAuth);
    };
  }, []);

  const rememberLocalReadKeys = useCallback(
    (keysToAdd: string[]) => {
      if (keysToAdd.length === 0 || !activeUserId) return;
      setReadKeysState((prev) => {
        const base = prev.userId === activeUserId ? prev.keys : loadScopedReadKeys(activeUserId);
        const merged = Array.from(new Set([...base, ...keysToAdd])).slice(-200);
        const storageKey = buildReadNotifsStorageKey(activeUserId);
        if (storageKey) {
          try {
            window.sessionStorage.setItem(storageKey, JSON.stringify(merged));
          } catch {
            // ignore storage quota errors
          }
        }
        return { userId: activeUserId, keys: merged };
      });
    },
    [activeUserId],
  );

  const openSupport = useCallback(() => setSupportOpen(true), [setSupportOpen]);
  const closeSupport = useCallback(() => setSupportOpen(false), [setSupportOpen]);

  const currentTabItem = useMemo(() => TABS.find((t) => t.id === tab) || TABS[0], [tab]);

  // Thao tác được yêu cầu từ ô tìm kiếm (ví dụ mở sẵn biểu mẫu ghi nhật ký). `nonce` tăng mỗi lần chọn
  // để tab được dựng lại và nhận thao tác mới, kể cả khi đang ở đúng tab đó.
  const [intent, setIntent] = useState<{ action?: PortalAction; nonce: number }>({ nonce: 0 });
  const tabRef = useRef<PortalTabId>(tab);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  const buildPortalTabUrl = useCallback((nextTab: PortalTabId, action?: PortalAction) => {
    const sp = new URLSearchParams();
    if (nextTab !== "home") {
      sp.set("tab", nextTab);
    }
    if (action === "learn-pesticides") sp.set("sub", "pesticides");
    else if (action === "learn-fertilizers") sp.set("sub", "fertilizers");
    else if (action === "learn-varieties") sp.set("sub", "varieties");
    else if (action === "learn-diseases") sp.set("sub", "diseases");
    const qs = sp.toString();
    return qs ? `/portal?${qs}` : "/portal";
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "farmer" || typeof window === "undefined") {
      return;
    }
    try {
      window.sessionStorage.setItem(WORKSPACE_ACTIVE_SESSION_KEY, "1");
    } catch {
      // ignore
    }
    const sp = new URLSearchParams(window.location.search);
    const initialParsed = resolveValidPortalRoute(sp);
    if (!initialParsed) {
      return;
    }

    const hasExplicitRouteParam = sp.has("tab") || sp.has("sub") || sp.has("view");
    let effectiveTab: PortalTabId = initialParsed.tab;
    let effectiveUrl = window.location.pathname + window.location.search + window.location.hash;

    if (!hasExplicitRouteParam) {
      const savedUrl = readWorkspaceUrl(PORTAL_LAST_URL_KEY, activeUserId);
      if (savedUrl) {
        const qIdx = savedUrl.indexOf("?");
        const savedSearch = qIdx >= 0 ? savedUrl.slice(qIdx) : "";
        const savedParsed = resolveValidPortalRoute(new URLSearchParams(savedSearch));
        if (savedParsed && (savedParsed.tab !== "home" || savedParsed.sub)) {
          effectiveTab = savedParsed.tab;
          effectiveUrl = savedUrl;
          replaceUrlPreservingState(savedUrl);
        }
      }
    }

    saveWorkspaceUrl(PORTAL_LAST_URL_KEY, effectiveUrl, activeUserId);

    if (effectiveTab !== tabRef.current) {
      startTransition(() => {
        setTab(effectiveTab);
      });
    }

    if (effectiveTab !== "home") {
      ensureRootEntryBeforeSubPage("/portal", effectiveUrl);
    }

    const onSync = () => {
      const parsed = resolveValidPortalRoute(new URLSearchParams(window.location.search));
      if (!parsed) {
        setInvalidClientUrl(true);
        return;
      }
      const syncedUrl = window.location.pathname + window.location.search + window.location.hash;
      saveWorkspaceUrl(PORTAL_LAST_URL_KEY, syncedUrl, activeUserId);
      const resolved: PortalTabId = parsed.tab;
      if (resolved !== tabRef.current) {
        startTransition(() => {
          setTab(resolved);
        });
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };

    window.addEventListener(PUC_URL_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PUC_URL_SYNC_EVENT, onSync);
  }, [status, session?.user.role, activeUserId]);

  const navigate = useCallback(
    (next: PortalTabId, action?: PortalAction) => {
      setNavWheelOpen(false);
      const nextUrl = buildPortalTabUrl(next, action);
      if (next !== tabRef.current || action) {
        pushUrlNavigation(nextUrl);
      } else {
        replaceUrlPreservingState(nextUrl);
      }
      saveWorkspaceUrl(PORTAL_LAST_URL_KEY, nextUrl, activeUserId);
      setIntent((prev) =>
        action ? { action, nonce: prev.nonce + 1 } : prev.action ? { nonce: prev.nonce } : prev,
      );
      startTransition(() => {
        setTab(next);
      });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    },
    [buildPortalTabUrl, activeUserId, setNavWheelOpen],
  );

  const handleSearchPick = useCallback(
    (target: PortalSearchTarget) => {
      if (target.kind === "global") {
        if (target.action === "notifications") setNotifOpen(true);
        else if (target.action === "profile") setProfileOpen(true);
        else if (target.action === "password") setPasswordOpen(true);
        else setSupportOpen(true);
        return;
      }
      setNavWheelOpen(false);
      const nextUrl = buildPortalTabUrl(target.tab, target.action);
      pushUrlNavigation(nextUrl);
      saveWorkspaceUrl(PORTAL_LAST_URL_KEY, nextUrl, activeUserId);
      setIntent((prev) => ({ action: target.action, nonce: prev.nonce + 1 }));
      startTransition(() => {
        setTab(target.tab);
      });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    },
    [buildPortalTabUrl, activeUserId, setNavWheelOpen, setNotifOpen, setPasswordOpen, setProfileOpen, setSupportOpen],
  );

  const closeProfile = useCallback(() => {
    setProfileOpen(false);
  }, [setProfileOpen]);

  const toggleProfile = useCallback(() => {
    setProfileOpen((prev) => !prev);
  }, [setProfileOpen]);

  useEffect(() => {
    if (status === "anonymous") {
      if (hasPendingServerLogout()) return;
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/portal")) {
        const directUrl = `${window.location.pathname}${window.location.search}`;
        const targetNext = directUrl !== "/portal" ? directUrl : null;
        router.replace(targetNext ? `/login?next=${encodeURIComponent(targetNext)}` : "/login");
      } else {
        router.replace("/login");
      }
    } else if (status === "authenticated" && session?.user.role !== "farmer") {
      router.replace("/admin");
    }
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

  useRealtimeNotifications(status === "authenticated" && session?.user.role === "farmer");

  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "farmer") return;
    let lastTriggerAt = 0;
    const onFocusOrVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastTriggerAt < 3_000) return;
      lastTriggerAt = now;
      invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
    };
    const pollMs = isLowEndDevice() ? 90_000 : 60_000;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !isRealtimeStreamConnected()) {
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
    const lowEnd = isLowEndDevice();
    // Trên máy yếu chỉ nạp sẵn 2 gói nhẹ thiết yếu khi đi rẫy (Nhật ký và Thửa đất) để mở được khi mất sóng;
    // máy mạnh nạp đủ các tab lúc nhàn rỗi.
    const loaders = lowEnd
      ? [() => import("./DiaryTab"), () => import("./PlotsTab"), () => import("./PlotMapModal")]
      : [
        () => import("./PlotsTab"),
        () => import("./PlotMapModal"),
        () => import("./DiaryTab"),
        () => import("./StampsTab"),
        () => import("./InspectionTab"),
        () => import("./LearnTab"),
        () => import("./PortalSearch"),
      ];
    let cancelled = false;
    let timerId = 0;
    let idleId = 0;
    const ric =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
          .requestIdleCallback
        : null;
    const cic =
      typeof window !== "undefined" && "cancelIdleCallback" in window
        ? (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback
        : null;

    const runStep = (idx: number) => {
      if (cancelled || idx >= loaders.length) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const exec = () => {
        if (cancelled) return;
        loaders[idx]()
          .catch(() => { })
          .finally(() => {
            if (!cancelled) {
              timerId = window.setTimeout(() => runStep(idx + 1), lowEnd ? 1100 : 650);
            }
          });
      };
      if (ric) {
        idleId = ric(exec, { timeout: 2800 });
      } else {
        timerId = window.setTimeout(exec, lowEnd ? 1100 : 650);
      }
    };

    timerId = window.setTimeout(() => {
      void warmPortalEssentialOfflineCache();
      runStep(0);
    }, lowEnd ? 3200 : 2200);
    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
      if (idleId && cic) cic(idleId);
    };
  }, [status, session?.user.role]);

  const rawApiNotifItems = notifications.data?.data;
  const locallyMarkedUnreadCount = useMemo(() => {
    if (!rawApiNotifItems) return 0;
    return rawApiNotifItems.filter((n) => !n.readAt && localReadKeys.includes(`api:${n.id}`)).length;
  }, [rawApiNotifItems, localReadKeys]);
  const apiNotifItems = useMemo<AppNotification[]>(() => {
    const rawItems = rawApiNotifItems ?? [];
    return rawItems.map((n) =>
      n.readAt || !localReadKeys.includes(`api:${n.id}`)
        ? n
        : { ...n, readAt: new Date().toISOString() },
    );
  }, [rawApiNotifItems, localReadKeys]);
  const fallbackNotifItems = useMemo<Array<AppNotification & { _readKey: string }>>(() => {
    if (apiNotifItems.length > 0) return [];
    const reminders = (overview?.reminders ?? []).filter((r) => r.kind !== "training");
    return reminders.map((r, idx) => {
      const id = -(idx + 1);
      const readKey = hashReminderReadKey(r.kind, r.title, r.date);
      const isRead = localReadKeys.includes(readKey);
      const prefix =
        r.kind === "violation" || r.kind === "journal"
          ? "Cảnh báo vi phạm: "
          : r.kind === "schedule"
            ? "Lịch kiểm tra: "
            : "";
      const title = prefix && !r.title.startsWith(prefix) ? `${prefix}${r.title}` : r.title;
      return {
        id,
        _readKey: readKey,
        kind: (r.kind === "journal" || r.kind === "isolation" ? "violation" : r.kind) as AppNotification["kind"],
        title,
        body: r.detail ?? null,
        link: `/portal?tab=${r.tab}`,
        readAt: isRead ? new Date().toISOString() : null,
        createdAt: r.date ?? new Date().toISOString(),
      };
    });
  }, [apiNotifItems.length, overview?.reminders, localReadKeys]);

  if (invalidClientUrl) {
    notFound();
  }

  if (status === "loading") {
    return <PageSkeleton label="Đang kiểm tra phiên đăng nhập…" />;
  }

  if (status !== "authenticated" || session?.user.role !== "farmer") {
    return null;
  }

  const profHousehold = profile?.household ?? overview?.household;
  const profAccount = profile?.account;
  const displayName = profHousehold?.name || profAccount?.fullName || session?.user.fullName || "Hộ thành viên";
  const linkedEmail = profAccount?.email ?? session?.user.email ?? null;
  const serverAvatarUrl = profile?.household?.avatarUrl ?? overview?.household?.avatarUrl ?? null;
  const rawAvatarUrl = localAvatarOverride !== undefined ? localAvatarOverride : serverAvatarUrl;
  const avatarUrl = isSafeMediaUrl(rawAvatarUrl) ? rawAvatarUrl : null;
  const publicTraceConsent =
    localConsentOverride !== undefined ? localConsentOverride : Boolean(profile?.household?.publicTraceConsent);
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
      toast.success(t("Đã cập nhật ảnh đại diện"));
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
      setConfirmRemoveAvatar(false);
      invalidateQueries(portalPath("profile"));
      invalidateQueries(portalPath("overview"));
      toast.success(t("Đã gỡ ảnh đại diện"));
    } catch (err) {
      setAvatarError(errorMessage(err, "Không thể gỡ ảnh đại diện."));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleToggleTraceConsent = async (next: boolean) => {
    if (savingConsent) return;
    setSavingConsent(true);
    setConsentError(null);
    try {
      const saved = await api.patch<{ publicTraceConsent: boolean }>("/portal/profile/trace-consent", {
        publicTraceConsent: next,
      });
      setLocalConsentOverride(saved.publicTraceConsent);
      invalidateQueries(portalPath("profile"));
      toast.success(
        saved.publicTraceConsent
          ? t("Đã bật hiển thị tên trên QR")
          : t("Đã ẩn tên trên QR công khai"),
      );
    } catch (err) {
      setConsentError(errorMessage(err, "Không thể cập nhật tùy chọn hiển thị tên trên QR."));
    } finally {
      setSavingConsent(false);
    }
  };

  const notifItems: Array<AppNotification & { _readKey?: string }> =
    apiNotifItems.length > 0 ? apiNotifItems : fallbackNotifItems;
  const unreadNotifItems = notifItems.filter((n) => !n.readAt);
  const readNotifItems = notifItems.filter((n) => Boolean(n.readAt));
  const unreadCount =
    apiNotifItems.length > 0 && typeof notifications.data?.unread === "number"
      ? Math.max(unreadNotifItems.length, notifications.data.unread - locallyMarkedUnreadCount)
      : !notifications.data && typeof overview?.stats?.unreadNotifications === "number"
        ? overview.stats.unreadNotifications
        : unreadNotifItems.length;
  const readCount = readNotifItems.length;
  const visibleNotifItems = notifFilter === "unread" ? unreadNotifItems : readNotifItems;

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
      toast.success(t("Đã lưu thông tin tài khoản"));
    } catch (err) {
      setAccountError(errorMessage(err, "Không thể cập nhật thông tin tài khoản."));
    } finally {
      setSavingAccount(false);
    }
  };

  const handleMarkRead = async (item: AppNotification & { _readKey?: string }) => {
    if (!item.readAt) {
      if (item.id < 0) {
        if (item._readKey) rememberLocalReadKeys([item._readKey]);
      } else {
        rememberLocalReadKeys([`api:${item.id}`]);
        optimisticMarkNotificationRead(item.id);
        void api
          .post(`/notifications/${item.id}/read`)
          .then(() => invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview")))
          .catch(() => invalidateQueries(NOTIFICATIONS_PATH));
      }
    }
    const rawLink = (item.link || "").trim();
    if (item.kind === "system") {
      if (rawLink.startsWith("/portal")) {
        setNotifOpen(false);
        const target = resolveNotificationTarget(item);
        navigate(target.tab, target.action);
        return;
      }
      if (rawLink.startsWith("/#") || rawLink.startsWith("/gioi-thieu")) {
        resetOverlayHistoryOnRouteLeave();
        setNotifOpen(false);
        const introTarget = rawLink.startsWith("/#")
          ? `${INTRO_PATH}${rawLink.slice(1)}`
          : rawLink;
        router.push(introTarget);
        return;
      }
      setNotifOpen(false);
      setSupportOpen(true);
      return;
    }
    const target = resolveNotificationTarget(item);
    setNotifOpen(false);
    navigate(target.tab, target.action);
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      if (apiNotifItems.length === 0 && fallbackNotifItems.length > 0) {
        rememberLocalReadKeys(fallbackNotifItems.map((n) => n._readKey));
      } else {
        rememberLocalReadKeys(apiNotifItems.map((n) => `api:${n.id}`));
        optimisticMarkNotificationRead();
        await api.post("/notifications/read-all");
        invalidateQueries(NOTIFICATIONS_PATH, portalPath("overview"));
      }
      toast.success(t("Đã đánh dấu đã đọc tất cả"));
    } catch {
      // Ignore
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="pt-app">
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          {/* Logo thương hiệu HTX Cư Né (hiển thị trên Desktop/Laptop) */}
          <Link
            href={INTRO_PATH}
            className="pt-brand"
            aria-label="HTX Cư Né - về trang giới thiệu"
            title="Về trang giới thiệu"
            onClick={() => resetOverlayHistoryOnRouteLeave()}
          >
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
              title="Thông báo"
            >
              <RadialPngIcon src="/bell.png" size={18} />
              {unreadCount > 0 && (
                <span className="pt-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
              )}
            </button>

            {/* Tìm chức năng (máy tính): gõ bất kỳ chữ nào để được gợi ý đúng tab và thao tác */}
            <button
              id="portal-search-toggle"
              type="button"
              className="pt-notif-btn pt-search-btn is-desktop"
              onClick={() => setSearchOpen(true)}
              aria-expanded={searchOpen}
              aria-haspopup="dialog"
              aria-label={t("Tìm chức năng")}
              title={t("Tìm chức năng")}
            >
              <RadialPngIcon src="/search.png" size={18} />
            </button>

            <button
              id="portal-profile-toggle"
              type="button"
              className={`pt-avatar-btn ${profileOpen ? "is-active" : ""}`}
              onClick={toggleProfile}
              aria-expanded={profileOpen}
              aria-haspopup="dialog"
              title={`Hồ sơ: ${displayName}`}
              data-no-translate="true"
            >
              <span className="pt-avatar">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={displayName} className="pt-avatar-img" loading="lazy" decoding="async" />
                ) : (
                  initials
                )}
              </span>
            </button>
          </div>

          {/* Phần điều hướng trên mobile: Nút tròn có icon menu */}
          <div className="pt-topbar-nav">
            {/* Tìm chức năng (điện thoại): đặt cạnh nút menu để không đè lên tiêu đề tab ở giữa */}
            <button
              id="portal-search-toggle-mobile"
              type="button"
              className="pt-notif-btn pt-search-btn is-mobile"
              onClick={() => setSearchOpen(true)}
              aria-expanded={searchOpen}
              aria-haspopup="dialog"
              aria-label={t("Tìm chức năng")}
              title={t("Tìm chức năng")}
            >
              <RadialPngIcon src="/search.png" size={18} />
            </button>
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
        <OfflineSyncBar />
        <div key={`${tab}-${intent.nonce}-${lang}`} className="pt-tab-pane is-active">
          {tab === "home" && <HomeTab onNavigate={navigate} />}
          {tab === "plots" && <PlotsTab />}
          {tab === "diary" && <DiaryTab initialAction={intent.action} />}
          {tab === "stamps" && <StampsTab overview={overview} />}
          {tab === "inspection" && <InspectionTab />}
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

            <div className="pt-profile-popup-head is-split-card">
              <div className="pt-profile-head-top">
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
                      <img src={avatarUrl} alt={displayName} className="pt-profile-avatar-img" loading="lazy" decoding="async" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <span className="pt-profile-avatar-cam" aria-hidden="true">
                    <Camera size={13} strokeWidth={2.4} />
                  </span>
                </button>

                <div className="pt-profile-head-info">
                  <strong className="pt-profile-name" data-no-translate="true">{displayName}</strong>
                </div>
              </div>

              <div className="pt-profile-head-split">
                <div className="pt-profile-head-cell">
                  <span className="pt-profile-kicker" data-no-translate={profHousehold?.code ? "true" : undefined}>
                    {profHousehold?.code || "HỘ THÀNH VIÊN"}
                  </span>
                </div>
                <div className="pt-profile-head-cell">
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
                      onClick={() => setConfirmRemoveAvatar(true)}
                      disabled={uploadingAvatar}
                      title={t("Gỡ ảnh đại diện hiện tại")}
                      aria-label={t("Gỡ ảnh đại diện hiện tại")}
                    >
                      <span>{t("Xóa ảnh")}</span>
                    </button>
                  )}
                </div>
              </div>
              {avatarError && <InlineError message={avatarError} />}
              {confirmRemoveAvatar && (
                <ConfirmDialog
                  title={t("Xóa ảnh đại diện")}
                  message={t("Xác nhận xóa ảnh đại diện hiện tại của hộ nông dân?")}
                  confirmLabel={t("Xóa ảnh")}
                  danger
                  pending={uploadingAvatar}
                  error={avatarError}
                  onConfirm={() => void handleRemoveAvatar()}
                  onClose={() => {
                    if (!uploadingAvatar) setConfirmRemoveAvatar(false);
                  }}
                />
              )}
            </div>

            <div className="pt-profile-photo-card">
              <div className="pt-profile-photo-main">
                <div className="pt-profile-photo-info">
                  <strong className="pt-profile-photo-title">
                    {t("Hiển thị tên hộ trên QR công khai")}
                  </strong>
                  <span className="pt-profile-photo-desc">
                    {publicTraceConsent
                      ? t("Đang bật - Người tiêu dùng quét QR thấy tên hộ cùng HTX Cư Né")
                      : t("Đang tắt - Mặc định bảo mật, chỉ hiển thị tên HTX Cư Né")}
                  </span>
                </div>
                <div className="pt-profile-photo-actions">
                  <button
                    type="button"
                    className="pt-profile-photo-upload-btn"
                    onClick={() => void handleToggleTraceConsent(!publicTraceConsent)}
                    disabled={savingConsent}
                    aria-pressed={publicTraceConsent}
                  >
                    <span>
                      {savingConsent
                        ? t("Đang lưu…")
                        : publicTraceConsent
                          ? t("Tắt hiển thị")
                          : t("Đồng ý hiển thị")}
                    </span>
                  </button>
                </div>
              </div>
              {consentError && <InlineError message={consentError} />}
            </div>

            <div className="pt-profile-details">
              <div className="pt-profile-row">
                <RadialPngIcon src="/call.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Số điện thoại</span>
                  <strong className="pt-profile-val" data-no-translate="true">
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
                  <strong className="pt-profile-val" data-no-translate="true">
                    {linkedEmail || "Chưa liên kết"}
                  </strong>
                </div>
              </div>

              {profile?.household?.cccdMasked && (
                <div className="pt-profile-row">
                  <RadialPngIcon src="/id-card.png" size={24} className="pt-profile-icon" />
                  <div className="pt-profile-row-content">
                    <span className="pt-profile-label">CCCD chủ hộ</span>
                    <strong className="pt-profile-val" data-no-translate="true">{profile.household.cccdMasked}</strong>
                  </div>
                </div>
              )}

              <div className="pt-profile-row">
                <RadialPngIcon src="/placeholder.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Địa bàn</span>
                  <strong className="pt-profile-val">
                    {formatHouseholdLocation(profHousehold?.villageName, profHousehold?.communeLocation)}
                  </strong>
                </div>
              </div>

              {profHousehold?.villageLeader && (
                <div className="pt-profile-row">
                  <RadialPngIcon src="/leader.png" size={24} className="pt-profile-icon" />
                  <div className="pt-profile-row-content">
                    <span className="pt-profile-label">Trưởng thôn</span>
                    <strong className="pt-profile-val" data-no-translate="true">{profHousehold.villageLeader}</strong>
                  </div>
                </div>
              )}

              <div className="pt-profile-row">
                <RadialPngIcon src="/scale.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Quy mô vườn</span>
                  <strong className="pt-profile-val">
                    {profHousehold?.plotCount ?? 0} thửa -{" "}
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
                    className={`pt-lang-seg-btn ${lang === "en" ? "is-active" : ""}`}
                    onClick={() => setLang("en")}
                    aria-pressed={lang === "en"}
                  >
                    English
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
                onClick={() => {
                  closeProfile();
                  setTwoFactorOpen(true);
                }}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <RadialPngIcon src="/face-id.png" size={22} />
                </span>
                <span className="pt-profile-action-title">
                  {session?.user.twoFactorEnabled ? t("Xác thực 2 lớp (OTP) - Đang bật") : t("Xác thực 2 lớp (OTP)")}
                </span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

              <button
                type="button"
                className="pt-profile-intro-btn"
                onClick={() => {
                  closeProfile();
                  setSessionsOpen(true);
                }}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <RadialPngIcon src="/signal.png" size={22} />
                </span>
                <span className="pt-profile-action-title">{t("Phiên đăng nhập và đăng xuất từ xa")}</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

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
                onClick={() => {
                  resetOverlayHistoryOnRouteLeave();
                  closeProfile();
                }}
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
                  toast.success(t("Đã đăng xuất"));
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
          title={t("Thông báo")}
          onClose={() => setNotifOpen(false)}
          className="pt-notif-sheet"
          footer={
            <DrawerSummaryFooter
              actions={
                unreadCount > 0 ? (
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
                )
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
                    className={`pt-btn pt-btn-sm ${notifFilter === "unread" ? "pt-btn-primary is-active" : "pt-btn-ghost"}`}
                    aria-pressed={notifFilter === "unread"}
                    onClick={() => setNotifFilter("unread")}
                  >
                    Chưa đọc ({unreadCount})
                  </button>
                  <button
                    type="button"
                    className={`pt-btn pt-btn-sm ${notifFilter === "read" ? "pt-btn-primary is-active" : "pt-btn-ghost"}`}
                    aria-pressed={notifFilter === "read"}
                    onClick={() => setNotifFilter("read")}
                  >
                    Đã đọc ({readCount})
                  </button>
                </div>
                {!isDesktopDrawer && notifFilter === "unread" && unreadCount > 0 && (
                  <div className="pt-notif-action-group">
                    <BusyButton
                      type="button"
                      className="pt-btn pt-btn-ghost pt-btn-sm pt-notif-markall-btn"
                      busy={markingAll}
                      busyLabel="Đang đánh dấu…"
                      onClick={() => void handleMarkAllRead()}
                    >
                      <span>Đọc hết</span>
                    </BusyButton>
                  </div>
                )}
              </div>
            )}

            <StateBlock loading={notifications.loading} error={notifications.error} variant="rows" />

            {!notifications.loading && visibleNotifItems.length === 0 && (
              isDesktopDrawer ? (
                <p className="pt-drawer-empty-note" style={{ textAlign: "center" }}>
                  {notifItems.length === 0
                    ? t("Hiện chưa có thông báo mới nào từ HTX.")
                    : notifFilter === "unread"
                      ? t("Bạn đã đọc hết tất cả thông báo.")
                      : t("Chưa có thông báo nào đã đọc.")}
                </p>
              ) : (
                <EmptyState icon="none">
                  {notifItems.length === 0
                    ? "Hiện chưa có thông báo mới nào từ HTX."
                    : notifFilter === "unread"
                      ? "Bạn đã đọc hết tất cả thông báo."
                      : "Chưa có thông báo nào đã đọc."}
                </EmptyState>
              )
            )}

            {visibleNotifItems.length > 0 && (
              <div className="pt-notif-day-list">
                {groupNotificationsByDay(visibleNotifItems, lang).map((group) => (
                  <section key={group.dayKey} className="pt-notif-day-group" aria-label={group.heading}>
                    <div className="pt-notif-day-heading" data-no-translate="true">
                      {group.heading}
                    </div>
                    <ul className="pt-notif-list">
                      {group.items.map((item) => {
                        const isUnread = !item.readAt;
                        const timeLabel = formatTime(item.createdAt);
                        return (
                          <li
                            key={item.id}
                            className={`pt-notif-item ${isUnread ? "is-unread" : "is-read"} ${item.kind === "system" ? "is-system" : ""}`.trim()}
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
                            <div className="pt-notif-content">
                              <div className="pt-notif-head">
                                <strong>{item.title}</strong>
                                {timeLabel && (
                                  <span className="pt-notif-time" data-no-translate="true">
                                    {timeLabel}
                                  </span>
                                )}
                              </div>
                              {item.body && <p className="pt-notif-body">{item.body}</p>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </Sheet>
      )}

      {editAccountOpen && (
        <Sheet
          variant="drawer"
          title={t("Cập nhật Email Google và Tài khoản")}
          onClose={() => {
            setAccountPasswordInput("");
            setEditAccountOpen(false);
          }}
          className="pt-password-sheet"
        >
          <form className="pt-form" autoComplete="off" data-form-type="other" onSubmit={handleSaveAccount}>
            <Field label="Tên hiển thị tài khoản" htmlFor="pt-acc-name">
              <input
                id="pt-acc-name"
                type="text"
                autoComplete="off"
                value={accountNameInput}
                onChange={(e) => setAccountNameInput(e.target.value)}
                required
              />
            </Field>
            <Field label="Email liên kết đăng nhập Google" htmlFor="pt-acc-email">
              <input
                id="pt-acc-email"
                type="email"
                autoComplete="off"
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
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
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
                onClick={() => {
                  setAccountPasswordInput("");
                  setEditAccountOpen(false);
                }}
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

      {twoFactorOpen && (
        <TwoFactorSecuritySheet
          enabled={Boolean(session?.user.twoFactorEnabled)}
          onClose={() => setTwoFactorOpen(false)}
          onChanged={refreshSession}
        />
      )}

      {sessionsOpen && (
        <ActiveSessionsSheet
          onClose={() => setSessionsOpen(false)}
          onRevokedCurrent={logout}
        />
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
              toast.success(t("Đã đổi mật khẩu, vui lòng đăng nhập lại"));
              setPasswordOpen(false);
              void logout();
            }}
            onClose={() => setPasswordOpen(false)}
          />
        </Sheet>
      )}

      {searchOpen && (
        <PortalSearchDialog
          onClose={() => {
            setSearchOpen(false);
            const target = pendingSearchTargetRef.current;
            pendingSearchTargetRef.current = null;
            if (target) handleSearchPick(target);
          }}
          onPick={(target) => {
            pendingSearchTargetRef.current = target;
          }}
        />
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
