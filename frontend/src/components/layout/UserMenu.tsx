"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import ChangePasswordModal from "@/components/admin/notifications/ChangePasswordModal";
import NotificationBell from "@/components/admin/notifications/NotificationBell";
import { ROLE_LABELS } from "@/constants/roles";
import { INTRO_PATH } from "@/lib/routes";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export default function UserMenu() {
  const { session, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!session) return null;
  const { fullName, role } = session.user;
  const title = `${fullName} – ${ROLE_LABELS[role]}`;

  return (
    <div className="user-menu" ref={ref}>
      <NotificationBell />

      <button
        className={`header-avatar ${open ? "is-active" : ""}`}
        type="button"
        aria-label={title}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-avatar">{initials(fullName)}</span>
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <strong>{fullName}</strong>
          <span>{ROLE_LABELS[role]}</span>
          <Link
            href={INTRO_PATH}
            className="user-menu-intro-link"
            onClick={() => setOpen(false)}
            title="Về trang giới thiệu HTX"
          >
            <span>Trang giới thiệu</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <button
            type="button"
            role="menuitem"
            className="btn btn-outline btn-sm"
            style={{ marginBottom: 6 }}
            onClick={() => {
              setOpen(false);
              setChangingPassword(true);
            }}
          >
            <KeyRound size={14} />
            Đổi mật khẩu
          </button>
          <button
            id="logout-button"
            type="button"
            role="menuitem"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            Đăng xuất
          </button>
        </div>
      )}

      {changingPassword && (
        <ChangePasswordModal
          onClose={() => setChangingPassword(false)}
          onSuccessLogout={logout}
        />
      )}
    </div>
  );
}
