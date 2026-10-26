"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABELS } from "@/constants/roles";

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
      <button
        className="header-avatar"
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
          <button id="logout-button" type="button" role="menuitem" className="btn btn-outline btn-sm" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
