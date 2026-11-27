"use client";

import { useAutoCenterDock } from "@/lib/dock-scroll";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number | null;
  pendingBadge?: number | null;
}

/** Thanh tab dùng class `.tab-bar` / `.tab-btn`, tự động đưa nút đang chọn ra giữa khi cuộn ngang. */
export default function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  onActivate,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  onActivate?: (id: T) => void;
}) {
  const barRef = useAutoCenterDock<HTMLDivElement>(active);

  return (
    <div ref={barRef} className="tab-bar" role="tablist">
      {tabs.map(({ id, label, pendingBadge }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`tab-btn ${active === id ? "active" : ""}`}
          onClick={() => {
            onActivate?.(id);
            onChange(id);
          }}
        >
          <span>{label}</span>
          {pendingBadge && pendingBadge > 0 ? (
            <span className="tab-badge">{pendingBadge > 99 ? "99+" : pendingBadge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
