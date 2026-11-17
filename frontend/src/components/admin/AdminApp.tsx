"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { hasPendingServerLogout, useAuth } from "@/components/auth/AuthProvider";
import { WORKSPACE_ACTIVE_SESSION_KEY } from "@/components/landing/AutoEnter";
import Sidebar from "@/components/layout/Sidebar";
import UserMenu from "@/components/layout/UserMenu";
import Dashboard from "@/components/sections/Dashboard";
import OfflineSyncBar from "@/components/ui/OfflineSyncBar";
import ResponsiveTables from "@/components/ui/ResponsiveTables";
import { PageSkeleton, SkeletonCards, SkeletonStats } from "@/components/ui/Skeleton";
import {
  ADMIN_LAST_URL_KEY,
  ensureRootEntryBeforeSubPage,
  PUC_URL_SYNC_EVENT,
  pushUrlNavigation,
  readWorkspaceUrl,
  replaceUrlPreservingState,
  saveWorkspaceUrl,
} from "@/lib/back-navigation";
import { lazyChunk } from "@/lib/lazy-chunk";
import { resolveValidAdminRoute, type SectionId } from "@/lib/route-validation";
import { INTRO_PATH } from "@/lib/routes";
import "@/components/portal/portal.css";

const TabLoading = () => (
  <div style={{ padding: "8px 0" }}>
    <SkeletonStats count={4} label="Đang tải dữ liệu…" />
    <div style={{ height: 14 }} />
    <SkeletonCards count={2} showSpinner={false} />
  </div>
);

const Households = dynamic(() => lazyChunk(() => import("@/components/sections/Households")), { loading: TabLoading });
const Approval = dynamic(() => lazyChunk(() => import("@/components/sections/Approval")), { loading: TabLoading });
const Journal = dynamic(() => lazyChunk(() => import("@/components/sections/Journal")), { loading: TabLoading });
const Testing = dynamic(() => lazyChunk(() => import("@/components/sections/Testing")), { loading: TabLoading });
const Harvest = dynamic(() => lazyChunk(() => import("@/components/sections/Harvest")), { loading: TabLoading });
const Catalog = dynamic(() => lazyChunk(() => import("@/components/sections/Catalog")), { loading: TabLoading });
const SystemSettings = dynamic(() => lazyChunk(() => import("@/components/sections/SystemSettings")), { loading: TabLoading });

const Zones = dynamic(() => lazyChunk(() => import("@/components/sections/Zones")), { ssr: false, loading: TabLoading });
const NewsAdmin = dynamic(() => lazyChunk(() => import("@/components/sections/NewsAdmin")), { ssr: false, loading: TabLoading });
const Reports = dynamic(() => lazyChunk(() => import("@/components/sections/Reports")), { ssr: false, loading: TabLoading });

const SECTION_TITLES: Record<SectionId, string> = {
  dashboard: "Tổng quan",
  households: "Nông hộ",
  zones: "Vùng trồng",
  approval: "Hồ sơ",
  journal: "Nhật ký",
  testing: "Kiểm nghiệm",
  harvest: "Lô hàng",
  reports: "Báo cáo",
  catalog: "Danh mục",
  system: "Hệ thống",
  news: "Bản tin",
};

const SECTION_RESOURCE: Record<SectionId, string> = {
  dashboard: "dashboard",
  households: "households",
  zones: "plots",
  approval: "approvals",
  journal: "journal",
  testing: "testing",
  harvest: "harvest",
  reports: "reports",
  catalog: "pesticides",
  system: "accounts",
  news: "news",
};

const ALL_SECTIONS: SectionId[] = [
  "dashboard",
  "households",
  "zones",
  "journal",
  "approval",
  "testing",
  "harvest",
  "news",
  "reports",
  "catalog",
  "system",
];

const LAST_NON_ZONES_SECTION_KEY = "puc:admin-last-non-zones";

function isSectionId(raw: string | null): raw is SectionId {
  return Boolean(raw && Object.prototype.hasOwnProperty.call(SECTION_TITLES, raw));
}

function resolveClientAdminSection(serverSection: SectionId, userId?: number | null): SectionId {
  if (typeof window === "undefined") return serverSection;
  const sp = new URLSearchParams(window.location.search);
  const parsed = resolveValidAdminRoute(sp);
  if (!parsed) return serverSection;
  if (sp.has("section") || sp.has("sub") || sp.has("tab")) {
    return parsed.section;
  }
  const savedUrl = readWorkspaceUrl(ADMIN_LAST_URL_KEY, userId);
  if (savedUrl) {
    const qIdx = savedUrl.indexOf("?");
    const savedSearch = qIdx >= 0 ? savedUrl.slice(qIdx) : "";
    const savedParsed = resolveValidAdminRoute(new URLSearchParams(savedSearch));
    if (savedParsed) {
      return savedParsed.section;
    }
  }
  return parsed.section;
}

export default function AdminApp({ initialSection }: { initialSection: SectionId }) {
  const router = useRouter();
  const { status, session, can } = useAuth();
  const [active, setActive] = useState<SectionId>(() =>
    resolveClientAdminSection(initialSection, session?.user.id),
  );
  const [lastNonZones, setLastNonZones] = useState<SectionId>(() => {
    const resolved = resolveClientAdminSection(initialSection, session?.user.id);
    if (resolved !== "zones") return resolved;
    if (typeof window !== "undefined") {
      try {
        const saved = window.sessionStorage.getItem(LAST_NON_ZONES_SECTION_KEY);
        if (isSectionId(saved) && saved !== "zones") return saved;
      } catch {
        // ignore
      }
    }
    return "dashboard";
  });
  const [invalidClientUrl, setInvalidClientUrl] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? resolveValidAdminRoute(new URLSearchParams(window.location.search)) === null
      : false,
  );
  const activeRef = useRef<SectionId>(active);
  const lastNonZonesRef = useRef<SectionId>(lastNonZones);
  const activeUserId = session?.user.id ?? null;
  const isFarmer = session?.user.role === "farmer";

  useEffect(() => {
    activeRef.current = active;
    if (active !== "zones") {
      lastNonZonesRef.current = active;
      try {
        window.sessionStorage.setItem(LAST_NON_ZONES_SECTION_KEY, active);
      } catch {
        // ignore
      }
    }
  }, [active]);

  useEffect(() => {
    if (status === "anonymous") {
      if (typeof window !== "undefined" && !hasPendingServerLogout() && window.location.pathname.startsWith("/admin")) {
        const directUrl = `${window.location.pathname}${window.location.search}`;
        const targetNext = directUrl !== "/admin" ? directUrl : null;
        router.replace(targetNext ? `/login?next=${encodeURIComponent(targetNext)}` : "/login");
      } else {
        router.replace("/login");
      }
    } else if (status === "authenticated" && isFarmer) {
      router.replace("/portal");
    }
  }, [status, isFarmer, router]);

  useEffect(() => {
    if (status !== "authenticated" || isFarmer || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(WORKSPACE_ACTIVE_SESSION_KEY, "1");
    } catch {
      // ignore
    }

    const sp = new URLSearchParams(window.location.search);
    const parsed = resolveValidAdminRoute(sp);
    if (!parsed) {
      return;
    }

    const hasExplicitRouteParam = sp.has("section") || sp.has("sub") || sp.has("tab");
    let effectiveSection = parsed.section;
    let effectiveUrl = window.location.pathname + window.location.search + window.location.hash;

    if (!hasExplicitRouteParam) {
      const savedUrl = readWorkspaceUrl(ADMIN_LAST_URL_KEY, activeUserId);
      if (savedUrl) {
        const qIdx = savedUrl.indexOf("?");
        const savedSearch = qIdx >= 0 ? savedUrl.slice(qIdx) : "";
        const savedParsed = resolveValidAdminRoute(new URLSearchParams(savedSearch));
        if (savedParsed && (savedParsed.section !== "dashboard" || savedParsed.sub)) {
          effectiveSection = savedParsed.section;
          effectiveUrl = savedUrl;
          replaceUrlPreservingState(savedUrl);
        }
      }
    }

    saveWorkspaceUrl(ADMIN_LAST_URL_KEY, effectiveUrl, activeUserId);

    if (effectiveSection !== activeRef.current) {
      startTransition(() => {
        setActive(effectiveSection);
        if (effectiveSection !== "zones") {
          setLastNonZones(effectiveSection);
        }
      });
    }

    if (effectiveSection !== "dashboard") {
      ensureRootEntryBeforeSubPage("/admin", effectiveUrl);
    }

    const onSync = () => {
      const nextParsed = resolveValidAdminRoute(new URLSearchParams(window.location.search));
      if (!nextParsed) {
        setInvalidClientUrl(true);
        return;
      }
      const syncedUrl = window.location.pathname + window.location.search + window.location.hash;
      saveWorkspaceUrl(ADMIN_LAST_URL_KEY, syncedUrl, activeUserId);
      if (nextParsed.section !== activeRef.current) {
        startTransition(() => {
          setActive(nextParsed.section);
          if (nextParsed.section !== "zones") {
            setLastNonZones(nextParsed.section);
          }
        });
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };
    window.addEventListener(PUC_URL_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PUC_URL_SYNC_EVENT, onSync);
  }, [status, isFarmer, activeUserId]);

  const navigate = useCallback(
    (id: SectionId) => {
      const nextUrl = id === "dashboard" ? "/admin" : `/admin?section=${encodeURIComponent(id)}`;
      if (id !== activeRef.current) {
        pushUrlNavigation(nextUrl);
      } else {
        replaceUrlPreservingState(nextUrl);
      }
      saveWorkspaceUrl(ADMIN_LAST_URL_KEY, nextUrl, activeUserId);
      startTransition(() => {
        setActive(id);
        if (id !== "zones") {
          setLastNonZones(id);
        }
      });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    },
    [activeUserId],
  );

  const handleBackFromZones = useCallback(() => {
    const target = lastNonZonesRef.current !== "zones" ? lastNonZonesRef.current : "dashboard";
    navigate(target);
  }, [navigate]);

  const renderSection = () => {
    const requiredResource = SECTION_RESOURCE[active];
    if (requiredResource && !can(requiredResource, "read")) {
      const fallbackSection =
        ALL_SECTIONS.find((sec) => can(SECTION_RESOURCE[sec], "read")) ?? "dashboard";
      return (
        <div
          className="card"
          style={{
            maxWidth: 520,
            margin: "28px auto",
            padding: "24px",
            textAlign: "center",
            borderRadius: 6,
            border: "1px solid #d4d4d2",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#14372f", margin: "0 0 8px" }}>
            Không có quyền truy cập phân mục {SECTION_TITLES[active]}
          </h2>
          <p style={{ fontSize: 13.5, color: "#5f6d66", margin: "0 0 16px", lineHeight: 1.5 }}>
            Tài khoản hiện tại không được phân quyền xem phân mục này.
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button type="button" className="btn btn-primary" onClick={() => navigate(fallbackSection)}>
              Về {SECTION_TITLES[fallbackSection]}
            </button>
          </div>
        </div>
      );
    }

    switch (active) {
      case "dashboard":
        return <Dashboard />;
      case "households":
        return <Households />;
      case "zones":
        return <Zones />;
      case "approval":
        return <Approval />;
      case "journal":
        return <Journal />;
      case "testing":
        return <Testing />;
      case "harvest":
        return <Harvest />;
      case "reports":
        return <Reports />;
      case "catalog":
        return <Catalog />;
      case "system":
        return <SystemSettings />;
      case "news":
        return <NewsAdmin />;
    }
  };

  if (invalidClientUrl) {
    notFound();
  }

  if (status !== "authenticated" || isFarmer) {
    return <PageSkeleton label="Đang kiểm tra phiên đăng nhập…" />;
  }

  return (
    <div className={`app-shell${active === "zones" ? " is-zones" : ""}`}>
      <ResponsiveTables />
      <div className="app-header">
        <Link
          href={INTRO_PATH}
          className="header-home"
          aria-label="HTX Cư Né - về trang giới thiệu"
          title="Về trang giới thiệu"
        >
          <span className="header-home-mark" aria-hidden="true" />
          <span className="header-brand" aria-hidden="true">
            <strong>HTX Cư Né</strong>
            <small>Khu quản trị</small>
          </span>
        </Link>
        <Sidebar active={active} onNavigate={navigate} />
        <div className="mobile-header-title is-scrolled" aria-live="polite">
          <span>{SECTION_TITLES[active] ?? "Tổng quan"}</span>
        </div>
        <UserMenu
          isZones={active === "zones"}
          onBackFromZones={handleBackFromZones}
          backTitle={`Quay lại ${SECTION_TITLES[lastNonZones] ?? "trang trước"}`}
        />
      </div>
      <div className="main-content">
        <div className="content-area">
          <OfflineSyncBar />
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
