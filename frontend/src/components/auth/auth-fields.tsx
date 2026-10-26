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
export function PasswordInput({ show, ...props }: { show: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  return <input {...props} className="auth-input" type={show ? "text" : "password"} />;
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

/** Thông báo lỗi dạng khung đỏ nhạt kèm biểu tượng. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className="auth-error" role="alert">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.2v.1" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
