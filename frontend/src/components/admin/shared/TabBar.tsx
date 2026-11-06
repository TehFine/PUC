"use client";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number | null;
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
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`tab-btn ${active === id ? "active" : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
