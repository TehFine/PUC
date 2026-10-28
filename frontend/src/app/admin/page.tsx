"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import Sidebar from "@/components/layout/Sidebar";
import UserMenu from "@/components/layout/UserMenu";
import ResponsiveTables from "@/components/ui/ResponsiveTables";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { INTRO_PATH } from "@/lib/routes";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";

const TabLoading = () => (
  <div style={{ padding: "24px 0" }}>
    <Skeleton h={32} w={200} r={8} />
    <div style={{ height: 16 }} />
    <Skeleton h={140} r={14} />
  </div>
);

import Dashboard from "@/components/sections/Dashboard";
import Households from "@/components/sections/Households";
import Approval from "@/components/sections/Approval";
import Journal from "@/components/sections/Journal";
import Testing from "@/components/sections/Testing";
import Harvest from "@/components/sections/Harvest";
import Training from "@/components/sections/Training";
import Catalog from "@/components/sections/Catalog";
import SystemSettings from "@/components/sections/SystemSettings";
import Registrations from "@/components/sections/Registrations";

const Zones = dynamic(() => import("@/components/sections/Zones"), { ssr: false, loading: TabLoading });
const NewsAdmin = dynamic(() => import("@/components/sections/NewsAdmin"), { ssr: false, loading: TabLoading });
const Reports = dynamic(() => import("@/components/sections/Reports"), { ssr: false, loading: TabLoading });

export type SectionId =
  | "dashboard" | "households" | "zones" | "approval"
  | "journal" | "testing" | "harvest" | "training"
  | "reports" | "catalog" | "system" | "registrations"
  | "news";

const SECTION_TITLES: Record<SectionId, string> = {
  dashboard: "Tổng quan",
  households: "Nông hộ",
  zones: "Vùng trồng",
  approval: "Duyệt hồ sơ",
  registrations: "Đăng ký hộ",
  journal: "Nhật ký",
  testing: "Kiểm nghiệm",
  harvest: "Lô hàng",
  training: "Tập huấn",
  reports: "Báo cáo",
  catalog: "Danh mục",
  system: "Hệ thống",
  news: "Bản tin",
};

export default function Home() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [active, setActive] = useState<SectionId>("dashboard");
  const [isScrolled, setIsScrolled] = useState(false);
  const isFarmer = session?.user.role === "farmer";

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && isFarmer) router.replace("/portal");
  }, [status, isFarmer, router]);

  useEffect(() => {
    const onScroll = () => {
      const isPast = window.scrollY > 24;
      setIsScrolled((prev) => (prev !== isPast ? isPast : prev));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
      case "training":     return <Training />;
      case "reports":      return <Reports />;
      case "catalog":      return <Catalog />;
      case "system":       return <SystemSettings />;
      case "registrations": return <Registrations />;
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
        <Link href={INTRO_PATH} className="header-home" aria-label="HTX Krông Búk – về trang giới thiệu" title="Về trang giới thiệu">
          <span className="header-home-mark" aria-hidden="true" />
          <span className="header-brand" aria-hidden="true">
            <strong>HTX Krông Búk</strong>
            <small>Khu quản trị</small>
          </span>
        </Link>
        <Sidebar active={active} onNavigate={navigate} />
        <div className={`mobile-header-title ${isScrolled ? "is-scrolled" : ""}`} aria-hidden={!isScrolled}>
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
