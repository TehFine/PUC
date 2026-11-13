"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import Sidebar from "@/components/layout/Sidebar";
import UserMenu from "@/components/layout/UserMenu";
import ResponsiveTables from "@/components/ui/ResponsiveTables";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { INTRO_PATH } from "@/lib/routes";
import "@/components/portal/portal.css";

import dynamic from "next/dynamic";
import { SkeletonCards, SkeletonStats } from "@/components/ui/Skeleton";

const TabLoading = () => (
  <div style={{ padding: "8px 0" }}>
    <SkeletonStats count={4} label="Đang tải dữ liệu…" />
    <div style={{ height: 14 }} />
    <SkeletonCards count={2} showSpinner={false} />
  </div>
);

import Dashboard from "@/components/sections/Dashboard";

const Households = dynamic(() => import("@/components/sections/Households"), { loading: TabLoading });
const Approval = dynamic(() => import("@/components/sections/Approval"), { loading: TabLoading });
const Journal = dynamic(() => import("@/components/sections/Journal"), { loading: TabLoading });
const Testing = dynamic(() => import("@/components/sections/Testing"), { loading: TabLoading });
const Harvest = dynamic(() => import("@/components/sections/Harvest"), { loading: TabLoading });
const Catalog = dynamic(() => import("@/components/sections/Catalog"), { loading: TabLoading });
const SystemSettings = dynamic(() => import("@/components/sections/SystemSettings"), { loading: TabLoading });

const Zones = dynamic(() => import("@/components/sections/Zones"), { ssr: false, loading: TabLoading });
const NewsAdmin = dynamic(() => import("@/components/sections/NewsAdmin"), { ssr: false, loading: TabLoading });
const Reports = dynamic(() => import("@/components/sections/Reports"), { ssr: false, loading: TabLoading });

export type SectionId =
  | "dashboard" | "households" | "zones" | "approval"
  | "journal" | "testing" | "harvest"
  | "reports" | "catalog" | "system"
  | "news";

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

export default function Home() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [active, setActive] = useState<SectionId>("dashboard");
  const isFarmer = session?.user.role === "farmer";

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && isFarmer) router.replace("/portal");
  }, [status, isFarmer, router]);

  const navigate = (id: SectionId) => {
    setActive(id);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const renderSection = () => {
    switch (active) {
      case "dashboard":    return <Dashboard />;
      case "households":   return <Households />;
      case "zones":        return <Zones />;
      case "approval":     return <Approval />;
      case "journal":      return <Journal />;
      case "testing":      return <Testing />;
      case "harvest":      return <Harvest />;
      case "reports":      return <Reports />;
      case "catalog":      return <Catalog />;
      case "system":       return <SystemSettings />;
      case "news":         return <NewsAdmin />;
    }
  };

  if (status !== "authenticated" || isFarmer) {
    return <PageSkeleton label="Đang kiểm tra phiên đăng nhập…" />;
  }

  return (
    <div className={`app-shell${active === "zones" ? " is-zones" : ""}`}>
      <ResponsiveTables />
      <div className="app-header">
        <Link href={INTRO_PATH} className="header-home" aria-label="HTX Cư Né – về trang giới thiệu" title="Về trang giới thiệu">
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
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
