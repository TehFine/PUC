"use client";

import { useEffect, useState } from "react";
import { SectionId } from "@/app/admin/page";
import { useAuth } from "@/components/auth/AuthProvider";

interface NavItem {
  id: SectionId;
  label: string;
  badge?: number;
  badgeType?: "red" | "warn";
  /** Tài nguyên cần quyền đọc để thấy mục này; bỏ trống = ai cũng thấy. */
  resource?: string;
}

const topItems: NavItem[] = [
  { id: "dashboard", label: "Tổng quan" },
  { id: "households", label: "Nông hộ", resource: "households" },
  { id: "zones", label: "Vùng trồng", resource: "plots" },
  { id: "approval", label: "Duyệt hồ sơ", badge: 7, resource: "approvals" },
  { id: "registrations", label: "Đăng ký hộ", resource: "registrations" },
  { id: "journal", label: "Nhật ký", badge: 3, badgeType: "warn", resource: "journal" },
  { id: "testing", label: "Kiểm nghiệm", resource: "testing" },
  { id: "harvest", label: "Lô hàng", resource: "harvest" },
  { id: "training", label: "Tập huấn", resource: "training" },
  { id: "news", label: "Bản tin" },
  { id: "reports", label: "Báo cáo" },
  { id: "catalog", label: "Danh mục", resource: "pesticides" },
];

const bottomItems: NavItem[] = [
  { id: "system", label: "Hệ thống", resource: "accounts" },
];

interface Props {
  active: SectionId;
  onNavigate: (id: SectionId) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
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
        <span />
        <span />
        <span />
      </button>

      {open && (
        <div
          className="nav-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <nav
        id="main-nav"
        className={`sidebar${open ? " open" : ""}`}
        aria-label="Điều hướng chính"
      >
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
            {badge && (
              <span className={`nav-badge ${badgeType === "warn" ? "warn" : ""}`}>
                {badge}
              </span>
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
