"use client";

import { useState } from "react";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { api } from "@/lib/api-client";
import type { HouseholdRecord } from "@/types/households";

function generateDefaultPassword(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const tail = digits.length >= 4 ? digits.slice(-4) : "2026";
  return `Cune@${tail}`;
}

export default function HouseholdAccountModal({
  household,
  onClose,
  onIssued,
}: {
  household: HouseholdRecord;
  onClose: () => void;
  onIssued: () => void;
}) {
  const hasExisting = Boolean(household.accountId);
  const [username, setUsername] = useState(household.accountUsername || household.phone || "");
  const [email, setEmail] = useState(
    household.accountEmail ||
      (/^0[0-9]{9}$/.test(household.phone.trim()) ? `nongho.${household.phone.trim()}@gmail.com` : ""),
  );
  const [password, setPassword] = useState(() => generateDefaultPassword(household.phone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedResult, setIssuedResult] = useState<{
    username: string;
    password: string;
    email: string | null;
  } | null>(null);

  const submit = async () => {
    const cleanUser = username.trim();
    if (!cleanUser) {
      setError("Vui lòng nhập tên đăng nhập (Số điện thoại chủ hộ).");
      return;
    }
    if (password.trim().length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Mật khẩu ban hành cần tối thiểu 8 ký tự, bao gồm cả chữ cái và chữ số.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{
        username: string;
        email: string | null;
      }>(`/households/${household.id}/issue-account`, {
        username: cleanUser,
        password: password.trim(),
        email: email.trim() ? email.trim().toLowerCase() : null,
      });
      toast.success(
        hasExisting
          ? `Đã cấp lại thông tin tài khoản cho hộ ${household.name}.`
          : `Đã ban hành tài khoản cho hộ ${household.name}.`,
      );
      setIssuedResult({
        username: res.username,
        password: password.trim(),
        email: res.email,
      });
      onIssued();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không ban hành được tài khoản cho hộ nông dân này.");
    } finally {
      setBusy(false);
    }
  };

  const copyCredentials = async () => {
    if (!issuedResult) return;
    const text = [
      "PHIẾU BÀN GIAO TÀI KHOẢN CỔNG HỘ DÂN – HTX SẦU RIÊNG CƯ NÉ",
      `Chủ hộ: ${household.name}`,
      `Mã vùng trồng / Mã hộ: ${household.code}`,
      `Thôn: ${household.villageName || `Thôn #${household.villageId}`}`,
      `Tên đăng nhập (SĐT): ${issuedResult.username}`,
      `Mật khẩu khởi tạo: ${issuedResult.password}`,
      issuedResult.email ? `Email Google liên kết: ${issuedResult.email}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Đã sao chép thông tin bàn giao tài khoản.");
    } catch {
      toast.error("Không sao chép tự động được.");
    }
  };

  if (issuedResult) {
    return (
      <Modal
        title="Phiếu bàn giao tài khoản hộ nông dân"
        onClose={onClose}
        width={520}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => void copyCredentials()}>
              Sao chép phiếu bàn giao
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Hoàn tất
            </button>
          </>
        }
      >
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "#f2f8f4",
            border: "1px solid #cce3d4",
            display: "grid",
            gap: 10,
            fontSize: 13.5,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--text-secondary)" }}>Chủ hộ thành viên:</span>
            <strong>{household.name}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--text-secondary)" }}>Mã hộ / Vùng trồng:</span>
            <strong style={{ fontFamily: "monospace" }}>{household.code}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--text-secondary)" }}>Tên đăng nhập (SĐT):</span>
            <strong style={{ fontFamily: "monospace", color: "var(--green-800)", fontSize: 15 }}>
              {issuedResult.username}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: "var(--text-secondary)" }}>Mật khẩu đã ban hành:</span>
            <strong style={{ fontFamily: "monospace", color: "#b45309", fontSize: 15 }}>
              {issuedResult.password}
            </strong>
          </div>
          {issuedResult.email && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ color: "var(--text-secondary)" }}>Email Google liên kết:</span>
              <strong style={{ fontFamily: "monospace" }}>{issuedResult.email}</strong>
            </div>
          )}
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Tài khoản đã được kích hoạt và gắn trực tiếp với hồ sơ hộ <strong>{household.code}</strong>. Người dùng có thể đăng nhập ngay trên Cổng hộ dân và tự đổi mật khẩu sau khi nhận bàn giao.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={`${hasExisting ? "Cấp lại" : "Ban hành"} tài khoản: ${household.name}`}
      onClose={busy ? () => undefined : onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? "Đang ban hành…" : hasExisting ? "Cập nhật & Cấp lại" : "Ban hành tài khoản"}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
        Thiết lập tài khoản đăng nhập Cổng hộ dân cho hộ <strong>{household.name}</strong> (Mã hộ:{" "}
        <code>{household.code}</code> · {household.villageName || `Thôn #${household.villageId}`}).
      </p>

      <div className="form-group">
        <label htmlFor="issue-acc-username">Tên đăng nhập (mặc định theo SĐT chủ hộ)</label>
        <input
          id="issue-acc-username"
          className="form-input"
          value={username}
          disabled={busy}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="VD: 0974564405"
        />
      </div>

      <div className="form-group">
        <label htmlFor="issue-acc-email">Email Google liên kết (để đăng nhập bằng Google)</label>
        <input
          id="issue-acc-email"
          type="email"
          className="form-input"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="VD: nongho.0974564405@gmail.com"
        />
      </div>

      <div className="form-group">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <label htmlFor="issue-acc-password" style={{ margin: 0 }}>
            Mật khẩu ban hành (tối thiểu 8 ký tự gồm chữ và số)
          </label>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ padding: "2px 8px", fontSize: 11.5 }}
            disabled={busy}
            onClick={() => setPassword(generateDefaultPassword(username || household.phone))}
          >
            Tạo mặc định
          </button>
        </div>
        <input
          id="issue-acc-password"
          type="text"
          className="form-input"
          style={{ fontFamily: "monospace", fontWeight: 600 }}
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="VD: Cune@4405"
        />
      </div>

      <FormError message={error} />
    </Modal>
  );
}

