"use client";

/** Thanh phân trang chuẩn (`.pagination` / `.pg-btn`) cho danh sách phân trang phía máy chủ. */
export default function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const items: (number | "gap")[] = [];
  const add = (value: number | "gap") => items.push(value);
  const windowStart = Math.max(2, page - 1);
  const windowEnd = Math.min(pages - 1, page + 1);
  add(1);
  if (windowStart > 2) add("gap");
  for (let p = windowStart; p <= windowEnd; p++) add(p);
  if (windowEnd < pages - 1) add("gap");
  add(pages);

  return (
    <nav className="pagination" aria-label="Phân trang">
      <button type="button" className="pg-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước">
        ‹
      </button>
      {items.map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="pg-btn" aria-hidden="true" style={{ cursor: "default" }}>
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pg-btn ${item === page ? "active" : ""}`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" className="pg-btn" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau">
        ›
      </button>
    </nav>
  );
}
