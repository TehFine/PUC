"use client";

import { FormEvent, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Mail, QrCode } from "@/components/ui/PublicIcon";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminNotificationBell } from "@/components/admin/notifications/AdminNotificationsSheet";
import ChangePasswordModal from "@/components/admin/notifications/ChangePasswordModal";
import { RadialPngIcon } from "@/components/portal/RadialIcons";
import { BusyButton, InlineError } from "@/components/portal/shared/controls";
import { Field, Sheet } from "@/components/portal/ui";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { ROLE_LABELS } from "@/constants/roles";
import { errorMessage } from "@/lib/api-client";
import { usePersistedState } from "@/lib/back-navigation";
import { INTRO_PATH } from "@/lib/routes";

const QrScannerModal = dynamic(() => import("@/components/admin/harvest/QrScannerModal"), { ssr: false });
const ActiveSessionsSheet = dynamic(
  () => import("@/components/layout/UserSecuritySheets").then((m) => m.ActiveSessionsSheet),
  { ssr: false },
);
const TwoFactorSecuritySheet = dynamic(
  () => import("@/components/layout/UserSecuritySheets").then((m) => m.TwoFactorSecuritySheet),
  { ssr: false },
);

const initials = (name: string | null | undefined) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "HT";

export default function UserMenu({
  isZones = false,
  onBackFromZones,
  backTitle = "Quay lại trang trước",
}: {
  isZones?: boolean;
  onBackFromZones?: () => void;
  backTitle?: string;
} = {}) {
  const { session, logout, updateProfile, refreshSession } = useAuth();
  const [open, setOpen] = usePersistedState("admin:usermenu:open", false);
  const [scanningQr, setScanningQr] = usePersistedState("admin:usermenu:qr", false);
  const [managing2fa, setManaging2fa] = usePersistedState("admin:usermenu:2fa", false);
  const [managingSessions, setManagingSessions] = usePersistedState("admin:usermenu:sessions", false);
  const [changingPassword, setChangingPassword] = usePersistedState("admin:usermenu:password", false);
  const [editingProfile, setEditingProfile] = usePersistedState("admin:usermenu:edit-profile", false);
  const [fullNameInput, setFullNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [profilePasswordInput, setProfilePasswordInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  if (!session) return null;
  const {
    fullName,
    username,
    email,
    role,
    enterpriseId,
    assignedCommune,
    assignedRegion,
    coopCode,
    twoFactorEnabled,
  } = session.user;
  const scopeSummary =
    role === "enterprise"
      ? enterpriseId
        ? `Doanh nghiệp liên kết (#${enterpriseId})`
        : "Chưa gắn doanh nghiệp"
      : role === "village_officer"
        ? assignedCommune || "Xã Cư Né"
        : role === "inspector"
          ? assignedRegion || "Tỉnh Đắk Lắk"
          : `${coopCode || "HTX-CUNE"} (HTX Cư Né, Đắk Lắk)`;
  const title = `${fullName} – ${ROLE_LABELS[role]}`;
  const normalizedCurrentEmail = email ? email.trim().toLowerCase() : null;
  const normalizedNextEmail = emailInput.trim() ? emailInput.trim().toLowerCase() : null;
  const emailChanged = normalizedNextEmail !== normalizedCurrentEmail;

  const openEditProfile = () => {
    setFullNameInput(fullName);
    setEmailInput(email ?? "");
    setProfilePasswordInput("");
    setProfileError(null);
    setOpen(false);
    setEditingProfile(true);
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullNameInput.trim()) {
      setProfileError("Họ tên hiển thị không được để trống.");
      return;
    }
    if (emailChanged && !profilePasswordInput) {
      setProfileError("Vui lòng nhập mật khẩu hiện tại để xác nhận thay đổi địa chỉ email liên kết.");
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      await updateProfile({
        fullName: fullNameInput.trim(),
        email: normalizedNextEmail,
        ...(emailChanged ? { currentPassword: profilePasswordInput } : {}),
      });
      setProfilePasswordInput("");
      setEditingProfile(false);
    } catch (err) {
      setProfileError(errorMessage(err, "Không thể cập nhật thông tin tài khoản."));
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="user-menu">
      {!isZones && <AdminNotificationBell enabled={role !== "farmer"} />}
      {!isZones && role !== "farmer" && (
        <button
          type="button"
          className="admin-qr-btn"
          title="Quét mã QR truy xuất nhanh bằng phiên đăng nhập hiện tại"
          aria-label="Quét QR truy xuất"
          onClick={() => setScanningQr(true)}
        >
          <QrCode size={16} />
          <span className="admin-qr-label">Quét QR</span>
        </button>
      )}
      {isZones ? (
        <button
          className="header-avatar header-zones-back"
          type="button"
          aria-label={backTitle}
          title={backTitle}
          onClick={() => {
            setOpen(false);
            onBackFromZones?.();
          }}
        >
          <ArrowLeft size={19} />
        </button>
      ) : (
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
      )}

      {open && (
        <Sheet
          variant="drawer"
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
                <span className="pt-profile-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24 }}>
                  <Mail size={20} />
                </span>
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Email liên kết Google</span>
                  <strong className="pt-profile-val">{email || "Chưa liên kết"}</strong>
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
                  <span className="pt-profile-label">Phạm vi quản lý</span>
                  <strong className="pt-profile-val">{scopeSummary}</strong>
                </div>
              </div>

              <div className="pt-profile-row">
                <RadialPngIcon src="/face-id.png" size={24} className="pt-profile-icon" />
                <div className="pt-profile-row-content">
                  <span className="pt-profile-label">Bảo mật xác thực 2 lớp (OTP)</span>
                  <strong className="pt-profile-val" style={{ color: twoFactorEnabled ? "#15803d" : undefined }}>
                    {twoFactorEnabled ? "Đang bật" : "Chưa bật"}
                  </strong>
                </div>
              </div>
            </div>

            <div className="pt-profile-footer">
              {role !== "farmer" && (
                <button
                  type="button"
                  className="pt-profile-intro-btn"
                  onClick={() => {
                    setOpen(false);
                    setScanningQr(true);
                  }}
                >
                  <span className="pt-profile-action-icon" aria-hidden="true">
                    <RadialPngIcon src="/qr-code.png" size={22} />
                  </span>
                  <span className="pt-profile-action-title">Quét QR truy xuất nhanh</span>
                  <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
                </button>
              )}

              <button
                type="button"
                className="pt-profile-intro-btn"
                onClick={() => {
                  setOpen(false);
                  setManaging2fa(true);
                }}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <RadialPngIcon src="/face-id.png" size={22} />
                </span>
                <span className="pt-profile-action-title">
                  Xác thực 2 lớp (OTP){twoFactorEnabled ? " - Đang bật" : ""}
                </span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

              <button
                type="button"
                className="pt-profile-intro-btn"
                onClick={() => {
                  setOpen(false);
                  setManagingSessions(true);
                }}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <RadialPngIcon src="/signal.png" size={22} />
                </span>
                <span className="pt-profile-action-title">Phiên đăng nhập &amp; Đăng xuất từ xa</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

              <button
                type="button"
                className="pt-profile-intro-btn"
                onClick={openEditProfile}
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <RadialPngIcon src="/update.png" size={21} />
                </span>
                <span className="pt-profile-action-title">Cập nhật hồ sơ & Email Google</span>
                <DetailArrowIcon size={22} className="pt-profile-intro-arrow" />
              </button>

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
                title="Về trang giới thiệu HTX Cư Né"
              >
                <span className="pt-profile-action-icon" aria-hidden="true">
                  <Image src="/newlogo.png" alt="" width={24} height={24} />
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

      {editingProfile && (
        <Sheet
          variant="drawer"
          title="Cập nhật hồ sơ và Email Google"
          onClose={() => {
            setProfilePasswordInput("");
            setEditingProfile(false);
          }}
          className="pt-password-sheet"
        >
          <form className="pt-form" autoComplete="off" data-form-type="other" onSubmit={handleSaveProfile}>
            <Field label="Họ và tên hiển thị" htmlFor="um-fullname">
              <input
                id="um-fullname"
                type="text"
                autoComplete="off"
                value={fullNameInput}
                onChange={(e) => setFullNameInput(e.target.value)}
                required
              />
            </Field>
            <Field label="Email liên kết đăng nhập Google" htmlFor="um-email">
              <input
                id="um-email"
                type="email"
                autoComplete="off"
                placeholder="vi-du@gmail.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </Field>
            {emailChanged && (
              <Field label="Mật khẩu hiện tại (xác nhận đổi email)" htmlFor="um-current-password">
                <input
                  id="um-current-password"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  placeholder="Nhập mật khẩu hiện tại của bạn"
                  value={profilePasswordInput}
                  onChange={(e) => setProfilePasswordInput(e.target.value)}
                  required
                />
              </Field>
            )}
            <p className="pt-hint">
              Email này được dùng để đăng nhập nhanh bằng nút <strong>Tiếp tục với Google</strong> trên màn hình đăng nhập.
            </p>
            <InlineError message={profileError} />
            <div className="pt-form-actions">
              <button
                type="button"
                className="pt-btn pt-btn-ghost"
                onClick={() => {
                  setProfilePasswordInput("");
                  setEditingProfile(false);
                }}
                disabled={savingProfile}
              >
                Hủy
              </button>
              <BusyButton
                type="submit"
                className="pt-btn pt-btn-primary"
                busy={savingProfile}
                busyLabel="Đang lưu…"
              >
                Lưu thay đổi
              </BusyButton>
            </div>
          </form>
        </Sheet>
      )}

      {changingPassword && (
        <ChangePasswordModal
          onClose={() => setChangingPassword(false)}
          onSuccessLogout={logout}
        />
      )}

      {managing2fa && (
        <TwoFactorSecuritySheet
          enabled={Boolean(twoFactorEnabled)}
          onClose={() => setManaging2fa(false)}
          onChanged={refreshSession}
        />
      )}

      {managingSessions && (
        <ActiveSessionsSheet
          onClose={() => setManagingSessions(false)}
          onRevokedCurrent={logout}
        />
      )}

      {scanningQr && <QrScannerModal onClose={() => setScanningQr(false)} />}
    </div>
  );
}
