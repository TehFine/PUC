"use client";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number | null;
}

/** Thanh tab dùng class `.tab-bar` / `.tab-btn`; badge chỉ hiện khi > 0. */
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
      {tabs.map(({ id, label, badge }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`tab-btn ${active === id ? "active" : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
          {!!badge && badge > 0 && <span className="tab-badge">{badge}</span>}
        </button>
      ))}
    </div>
  );
}
