"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionId } from "@/app/admin/page";
import { useAuth } from "@/components/auth/AuthProvider";
import { useApi } from "@/hooks/use-api";
import { onAdminNavigate, onCountsChanged } from "@/components/admin/shared/counts-events";
import type { DashboardSummary } from "@/types/dashboard";

interface NavItem {
  id: SectionId;
  label: string;
  badge?: number;
  badgeType?: "red" | "warn";
  /** Tài nguyên cần quyền đọc để thấy mục này; bỏ trống = ai cũng thấy. */
  resource?: string;
}

const bottomItems: NavItem[] = [{ id: "system", label: "Hệ thống", resource: "accounts" }];

interface Props {
  active: SectionId;
  onNavigate: (id: SectionId) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: summary, refresh } = useApi<DashboardSummary>("/dashboard/summary");

  useEffect(() => onCountsChanged(() => void refresh()), [refresh]);

  useEffect(
    () =>
      onAdminNavigate((section) => {
        onNavigate(section as SectionId);
        setOpen(false);
      }),
    [onNavigate],
  );

  const counts = summary?.counts;

  const topItems = useMemo<NavItem[]>(
    () => [
      { id: "dashboard", label: "Tổng quan" },
      { id: "households", label: "Nông hộ", resource: "households" },
      { id: "zones", label: "Vùng trồng", resource: "plots" },
      {
        id: "approval",
        label: "Hồ sơ",
        resource: "approvals",
      },
      {
        id: "registrations",
        label: "Đăng ký",
        resource: "registrations",
      },
      {
        id: "journal",
        label: "Nhật ký",
        resource: "journal",
      },
      { id: "testing", label: "Kiểm nghiệm", resource: "testing" },
      { id: "harvest", label: "Lô hàng", resource: "harvest" },
      { id: "training", label: "Tập huấn", resource: "training" },
      { id: "news", label: "Bản tin" },
      { id: "reports", label: "Báo cáo" },
      { id: "catalog", label: "Danh mục", resource: "pesticides" },
    ],
    [],
  );

  const allowed = (item: NavItem) => !item.resource || can(item.resource, "read");

  useEffect(() => {
    if (!open) return;

    document.body.classList.add("nav-open");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.classList.remove("nav-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", closeOnDesktop);
    return () => query.removeEventListener("change", closeOnDesktop);
  }, []);

  const go = (id: SectionId) => {
    onNavigate(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`nav-toggle${open ? " open" : ""}`}
        aria-label={open ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="nav-toggle-icon nav-menu-mask" aria-hidden="true" />
      </button>

      {open && <div className="nav-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}

      <nav id="main-nav" className={`sidebar${open ? " open" : ""}`} aria-label="Điều hướng chính">
        {topItems.filter(allowed).map(({ id, label, badge, badgeType }) => (
          <button
            key={id}
            type="button"
            className={`nav-item ${active === id ? "active" : ""}`}
            data-label={label}
            aria-current={active === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            {label}
            {!!badge && badge > 0 && (
              <span className={`nav-badge ${badgeType === "warn" ? "warn" : ""}`}>{badge}</span>
            )}
          </button>
        ))}

        {bottomItems.filter(allowed).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`nav-item nav-sep ${active === id ? "active" : ""}`}
            data-label={label}
            aria-current={active === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
