"use client";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number | null;
  pendingBadge?: number | null;
}

/** Thanh tab dùng class `.tab-bar` / `.tab-btn`. */
export default function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map(({ id, label, pendingBadge }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`tab-btn ${active === id ? "active" : ""}`}
          onClick={() => onChange(id)}
        >
          <span>{label}</span>
          {pendingBadge && pendingBadge > 0 ? <span className="tab-badge">{pendingBadge}</span> : null}
        </button>
      ))}
    </div>
  );
}
