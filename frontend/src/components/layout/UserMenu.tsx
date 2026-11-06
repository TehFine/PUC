"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import ChangePasswordModal from "@/components/admin/notifications/ChangePasswordModal";
import NotificationBell from "@/components/admin/notifications/NotificationBell";
import { RadialPngIcon } from "@/components/portal/RadialIcons";
import { Sheet } from "@/components/portal/ui";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
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

  if (!session) return null;
  const { fullName, username, role } = session.user;
  const title = `${fullName} – ${ROLE_LABELS[role]}`;

  return (
    <div className="user-menu">
      <button
        className={`header-avatar ${open ? "is-active" : ""}`}
        type="button"
        aria-label={title}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-avatar">{initials(fullName)}</span>
      </button>

      <NotificationBell />

      {open && (
        <Sheet
          title="Thông tin tài khoản"
          onClose={() => setOpen(false)}
          className="pt-profile-sheet"
        >
          <div className="pt-profile-sheet-content">
            <div className="pt-profile-popup-head">
              <div className="pt-profile-avatar-lg">
                <span>{initials(fullName)}</span>
              </div>
              <div className="pt-profile-head-info">
                <strong className="pt-profile-name">{fullName}</strong>
                <div className="pt-profile-badges">
                  <span className="pt-profile-kicker">{ROLE_LABELS[role]}</span>
                  <span className="pt-profile-status is-ok" style={{ color: "#15803d" }}>
                    Đang hoạt động
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-profile-details">
              <div className="pt-profile-row">
                <RadialPngIcon src="/id-card.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Tài khoản đăng nhập</span>
                  <strong className="pt-profile-val">{username}</strong>
                </div>
              </div>

              <div className="pt-profile-row">
                <RadialPngIcon src="/leader.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Vai trò phân quyền</span>
                  <strong className="pt-profile-val">{ROLE_LABELS[role]}</strong>
                </div>
              </div>

              <div className="pt-profile-row">
                <RadialPngIcon src="/placeholder.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Đơn vị quản lý</span>
                  <strong className="pt-profile-val">HTX Sầu riêng Krông Búk, Đắk Lắk</strong>
                </div>
              </div>
            </div>

            <div className="pt-profile-footer">
              <button
                type="button"
                className="pt-profile-intro-btn"
                onClick={() => {
                  setOpen(false);
                  setChangingPassword(true);
                }}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <RadialPngIcon src="/key.png" size={22} />
                </span>
                <span className="pt-profile-action-title">Đổi mật khẩu</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

              <Link
                href={INTRO_PATH}
                className="pt-profile-intro-btn"
                onClick={() => setOpen(false)}
                title="Về trang giới thiệu HTX Krông Búk"
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <Image src="/logo.png" alt="" width={24} height={24} />
                </span>
                <span className="pt-profile-action-title">Trang giới thiệu HTX</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </Link>

              <button
                id="logout-button"
                type="button"
                className="pt-profile-logout-btn"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
              >
                <RadialPngIcon src="/logout.png" size={20} />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </Sheet>
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
