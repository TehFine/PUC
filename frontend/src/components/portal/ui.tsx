"use client";

import { useEffect, type ReactNode } from "react";
import { CalendarDays, CircleCheck, FlaskConical, GraduationCap, Map, Microscope, NotebookPen, Package, Search, Send, TreePine, X } from "lucide-react";
import { SkeletonCards, SkeletonRows, SkeletonStats } from "@/components/ui/Skeleton";
import type { Tone } from "@/lib/portal-labels";

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pt-pill pt-pill-${tone}`}>{children}</span>;
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-card">
      {(title || action) && (
        <header className="pt-card-head">
          {title && <h2 className="pt-card-title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const EMPTY_ICONS = {
  request: Send,
  learn: GraduationCap,
  search: Search,
  diary: NotebookPen,
  spray: FlaskConical,
  map: Map,
  plot: TreePine,
  harvest: Package,
  ok: CircleCheck,
  calendar: CalendarDays,
  lab: Microscope,
};

export type EmptyIconName = keyof typeof EMPTY_ICONS;

export function EmptyState({ icon, children }: { icon: EmptyIconName; children: ReactNode }) {
  const Icon = EMPTY_ICONS[icon];
  return (
    <div className="pt-empty">
      <span aria-hidden="true">
        <Icon />
      </span>
      <p>{children}</p>
    </div>
  );
}

/** Hiển thị trạng thái tải (skeleton) / lỗi; trả về null khi đã có dữ liệu để nơi gọi tự vẽ nội dung. */
export function StateBlock({ loading, error, variant = "cards" }: { loading: boolean; error: string | null; variant?: "cards" | "rows" | "stats" }) {
  if (loading) {
    if (variant === "rows") return <SkeletonRows count={4} />;
    if (variant === "stats") return <SkeletonStats />;
    return <SkeletonCards count={2} />;
  }
  if (error) return <div className="pt-state pt-state-error" role="alert">{error}</div>;
  return null;
}

/** Hộp thoại dạng bảng trượt từ dưới lên (trên máy tính hiển thị giữa màn hình). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="pt-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="pt-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="pt-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="pt-icon-btn" onClick={onClose} aria-label="Đóng">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="pt-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="pt-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
