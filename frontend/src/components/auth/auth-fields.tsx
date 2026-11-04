"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

/** Đường line đỏ chạy quanh viền nút khi hệ thống đang xử lý đăng nhập. */
export function AuthBusyBorderRing() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 360, h: 56 });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  const inset = 3;
  const rw = Math.max(20, size.w - inset * 2);
  const rh = Math.max(20, size.h - inset * 2);
  const rx = rh / 2;

  return (
    <svg
      ref={svgRef}
      className="auth-busy-ring"
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden="true"
    >
      <rect
        className="auth-busy-ring-track"
        x={inset}
        y={inset}
        width={rw}
        height={rh}
        rx={rx}
        ry={rx}
      />
      <rect
        className="auth-busy-ring-stroke"
        x={inset}
        y={inset}
        width={rw}
        height={rh}
        rx={rx}
        ry={rx}
        pathLength={100}
      />
    </svg>
  );
}

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


