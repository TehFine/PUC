import type { InputHTMLAttributes, ReactNode } from "react";

/** Một ô nhập có nhãn phía trên và dòng gợi ý (tùy chọn) phía dưới. */
export function AuthField({ id, label, optional, hint, children }: { id: string; label: string; optional?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="auth-opt"> (không bắt buộc)</span>}
      </label>
      {children}
      {hint && <p className="auth-hint">{hint}</p>}
    </div>
  );
}

/** Ô mật khẩu: loại ô (ẩn/hiện) do trang điều khiển để một ô tích có thể áp dụng cho nhiều ô mật khẩu. */
export function PasswordInput({
  show,
  className,
  isError,
  ...props
}: { show: boolean; isError?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const fullClass = ["auth-input", isError ? "is-error" : "", className].filter(Boolean).join(" ");
  return <input {...props} className={fullClass} type={show ? "text" : "password"} />;
}

/** Ô tích "Hiện mật khẩu": vùng bấm lớn, dễ dùng cho người lớn tuổi. */
export function ShowPasswordCheck({ id, checked, onChange }: { id: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="auth-check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      Hiện mật khẩu
    </label>
  );
}

/** Thông báo lỗi viền đỏ phát sáng kèm hiệu ứng rung lắc (không dùng icon). */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className="auth-error" role="alert">
      {children}
    </p>
  );
}


