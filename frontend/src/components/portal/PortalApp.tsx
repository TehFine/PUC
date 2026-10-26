"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { INTRO_PATH } from "@/lib/routes";
import "./portal.css";
import DiaryTab from "./DiaryTab";
import HomeTab from "./HomeTab";
import InspectionTab from "./InspectionTab";
import LearnTab from "./LearnTab";
import PlotsTab from "./PlotsTab";
import RequestsTab from "./RequestsTab";

export type PortalTabId = "home" | "plots" | "diary" | "inspection" | "requests" | "learn";

const TABS: { id: PortalTabId; label: string; icon: string }[] = [
  { id: "home", label: "Trang chủ", icon: "🏡" },
  { id: "plots", label: "Thửa đất", icon: "🌳" },
  { id: "diary", label: "Nhật ký", icon: "📝" },
  { id: "inspection", label: "Kiểm tra", icon: "🔎" },
  { id: "requests", label: "Hồ sơ", icon: "📨" },
  { id: "learn", label: "Kiến thức", icon: "📚" },
];

/** Cổng dành cho hộ dân (tài khoản vai trò Nông dân). Cán bộ được chuyển về trang quản trị. */
export default function PortalApp() {
  const router = useRouter();
  const { status, session, logout } = useAuth();
  const [tab, setTab] = useState<PortalTabId>("home");

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated" && session?.user.role !== "farmer") router.replace("/admin");
  }, [status, session, router]);

  if (status !== "authenticated" || session?.user.role !== "farmer") {
    return <PageSkeleton label="Đang kiểm tra phiên đăng nhập…" />;
  }

  const navigate = (next: PortalTabId) => {
    setTab(next);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  return (
    <div className="pt-app">
      <header className="pt-topbar">
        <Link href={INTRO_PATH} className="pt-brand" aria-label="HTX Krong Buk – về trang giới thiệu" title="Về trang giới thiệu">
          <span className="pt-brand-mark" aria-hidden="true">
            <Image src="/logo.png" alt="" width={30} height={30} />
          </span>
          <div>
            <strong>HTX Krong Buk</strong>
            <span>Cổng hộ dân</span>
          </div>
        </Link>
        <button id="portal-logout" type="button" className="pt-btn pt-btn-ghost pt-btn-sm" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </header>

      <nav className="pt-tabs" aria-label="Chức năng">
        {TABS.map((item) => (
          <button
            key={item.id}
            id={`portal-tab-${item.id}`}
            type="button"
            className={`pt-tab ${tab === item.id ? "active" : ""}`}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="pt-main">
        {tab === "home" && <HomeTab onNavigate={navigate} />}
        {tab === "plots" && <PlotsTab />}
        {tab === "diary" && <DiaryTab />}
        {tab === "inspection" && <InspectionTab />}
        {tab === "requests" && <RequestsTab />}
        {tab === "learn" && <LearnTab />}
      </main>
    </div>
  );
}
