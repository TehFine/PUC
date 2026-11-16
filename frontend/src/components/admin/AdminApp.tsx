"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { WORKSPACE_ACTIVE_SESSION_KEY } from "@/components/landing/AutoEnter";
import Sidebar from "@/components/layout/Sidebar";
import UserMenu from "@/components/layout/UserMenu";
import Dashboard from "@/components/sections/Dashboard";
import OfflineSyncBar from "@/components/ui/OfflineSyncBar";
import ResponsiveTables from "@/components/ui/ResponsiveTables";
import { PageSkeleton, SkeletonCards, SkeletonStats } from "@/components/ui/Skeleton";
import {
  ensureRootEntryBeforeSubPage,
  PUC_URL_SYNC_EVENT,
  pushUrlNavigation,
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

export default function AdminApp({ initialSection }: { initialSection: SectionId }) {
  const router = useRouter();
  const { status, session } = useAuth();
  const [active, setActive] = useState<SectionId>(initialSection);
  const [invalidClientUrl, setInvalidClientUrl] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? resolveValidAdminRoute(new URLSearchParams(window.location.search)) === null
      : false,
  );
  const activeRef = useRef<SectionId>(active);
  const isFarmer = session?.user.role === "farmer";

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && isFarmer) router.replace("/portal");
  }, [status, isFarmer, router]);

  useEffect(() => {
    if (status !== "authenticated" || isFarmer || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(WORKSPACE_ACTIVE_SESSION_KEY, "1");
    } catch {
      // ignore
    }

    const parsed = resolveValidAdminRoute(new URLSearchParams(window.location.search));
    if (!parsed) {
      return;
    }

    if (parsed.section !== "dashboard") {
      const fullUrl = window.location.pathname + window.location.search + window.location.hash;
      ensureRootEntryBeforeSubPage("/admin", fullUrl);
    }

    const onSync = () => {
      const nextParsed = resolveValidAdminRoute(new URLSearchParams(window.location.search));
      if (!nextParsed) {
        setInvalidClientUrl(true);
        return;
      }
      if (nextParsed.section !== activeRef.current) {
        startTransition(() => {
          setActive(nextParsed.section);
        });
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };
    window.addEventListener(PUC_URL_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PUC_URL_SYNC_EVENT, onSync);
  }, [status, isFarmer]);

  const navigate = useCallback((id: SectionId) => {
    if (id !== activeRef.current) {
      const nextUrl = id === "dashboard" ? "/admin" : `/admin?section=${encodeURIComponent(id)}`;
      pushUrlNavigation(nextUrl);
    }
    startTransition(() => {
      setActive(id);
    });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const renderSection = () => {
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
        <UserMenu />
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
