"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AuthShell from "@/components/auth/AuthShell";
import { AuthError, AuthField, PasswordInput, ShowPasswordCheck } from "@/components/auth/auth-fields";
import { api, ApiError } from "@/lib/api-client";
import { homePathFor } from "@/lib/routes";

interface Village {
  id: number;
  name: string;
}

const PHONE_RE = /^0[0-9]{9}$/;

export default function RegisterPage() {
  const router = useRouter();
  const { status, session } = useAuth();
  const [villages, setVillages] = useState<Village[]>([]);
  const [form, setForm] = useState({ fullName: "", phone: "", password: "", confirm: "", villageId: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(homePathFor(session?.user.role));
  }, [status, session, router]);

  useEffect(() => {
    let active = true;
    api
      .get<Village[]>("/public/villages")
      .then((rows) => active && setVillages(rows))
      .catch(() => undefined); // chọn thôn là tùy chọn: lỗi tải danh sách không chặn đăng ký
    return () => {
      active = false;
    };
  }, []);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    if (error) setError(null);
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const isFieldInvalid = (field: "name" | "phone" | "password") => {
    if (!error) return false;
    const lower = error.toLowerCase();
    if (field === "name") return lower.includes("họ tên");
    if (field === "phone") return lower.includes("điện thoại");
    if (field === "password") return lower.includes("mật khẩu");
    return true;
  };

  const validate = (): string | null => {
    if (!form.fullName.trim()) return "Vui lòng nhập họ tên.";
    if (!PHONE_RE.test(form.phone.replace(/[\s.-]/g, ""))) return "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.";
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      return "Mật khẩu cần tối thiểu 8 ký tự, gồm cả chữ cái và chữ số.";
    }
    if (form.password !== form.confirm) return "Mật khẩu nhập lại chưa khớp.";
    return null;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);

    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/register", {
        fullName: form.fullName.trim(),
        phone: form.phone,
        password: form.password,
        villageId: form.villageId ? Number(form.villageId) : undefined,
        note: form.note.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      const detail = err instanceof ApiError ? err.details?.map((item) => item.message).join(" ") : "";
      setError(detail || (err instanceof Error ? err.message : "Không đăng ký được."));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell variant="register" title="Đã gửi đăng ký" subtitle="Tài khoản của bạn đang chờ cán bộ HTX duyệt." hideSwitch>
        <div aria-live="polite">
          <span className="auth-done-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <ol className="auth-steps">
            <li>
              <b>1</b>
              <span>
                Cán bộ sẽ đối chiếu số điện thoại <strong>{form.phone}</strong> với hồ sơ hộ và gắn tài khoản vào đúng hộ của bạn.
              </span>
            </li>
            <li>
              <b>2</b>
              <span>Sau khi được duyệt, bạn đăng nhập bằng số điện thoại và mật khẩu vừa tạo.</span>
            </li>
          </ol>
          <Link href="/" className="auth-submit is-link">
            Về trang chủ
            <span className="auth-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell variant="register" title="Đăng ký tài khoản hộ dân" subtitle="Điền thông tin bên dưới, cán bộ HTX sẽ duyệt và gắn tài khoản vào đúng hộ của bạn." wide>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField id="register-name" label="Họ và tên chủ hộ">
          <input
            id="register-name"
            className={`auth-input${isFieldInvalid("name") ? " is-error" : ""}`}
            autoComplete="name"
            autoFocus
            placeholder="Ví dụ: Nguyễn Văn An"
            value={form.fullName}
            onChange={set("fullName")}
          />
        </AuthField>

        <div className="auth-row">
          <AuthField id="register-phone" label="Số điện thoại" hint="Dùng để đăng nhập sau này.">
            <input
              id="register-phone"
              className={`auth-input${isFieldInvalid("phone") ? " is-error" : ""}`}
              inputMode="tel"
              autoComplete="tel"
              placeholder="10 chữ số, bắt đầu bằng 0"
              value={form.phone}
              onChange={set("phone")}
            />
          </AuthField>
          <AuthField id="register-village" label="Thôn" optional>
            <select id="register-village" className="auth-input" value={form.villageId} onChange={set("villageId")}>
              <option value="">Chọn thôn</option>
              {villages.map((village) => (
                <option key={village.id} value={village.id}>
                  {village.name}
                </option>
              ))}
            </select>
          </AuthField>
        </div>

        <AuthField id="register-note" label="Mã hộ hoặc ghi chú giúp cán bộ đối chiếu" optional>
          <input id="register-note" className="auth-input" maxLength={300} value={form.note} onChange={set("note")} />
        </AuthField>

        <div className="auth-row">
          <AuthField id="register-password" label="Mật khẩu" hint="Tối thiểu 8 ký tự, có cả chữ và số.">
            <PasswordInput
              id="register-password"
              className={isFieldInvalid("password") ? "is-error" : ""}
              show={showPassword}
              autoComplete="new-password"
              value={form.password}
              onChange={set("password")}
            />
          </AuthField>
          <AuthField id="register-confirm" label="Nhập lại mật khẩu">
            <PasswordInput
              id="register-confirm"
              className={isFieldInvalid("password") ? "is-error" : ""}
              show={showPassword}
              autoComplete="new-password"
              value={form.confirm}
              onChange={set("confirm")}
            />
          </AuthField>
        </div>

        <ShowPasswordCheck id="register-show-password" checked={showPassword} onChange={setShowPassword} />

        {error && <AuthError>{error}</AuthError>}

        <button id="register-submit" type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? (
            "Đang gửi…"
          ) : (
            <>
              Gửi đăng ký
              <span className="auth-arrow" aria-hidden="true">
                →
              </span>
            </>
          )}
        </button>
      </form>
      <p className="auth-note">Hộ chưa có trong danh sách của HTX cần được cán bộ ghi nhận trước khi tài khoản được duyệt.</p>
    </AuthShell>
  );
}
