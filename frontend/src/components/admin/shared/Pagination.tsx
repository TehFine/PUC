"use client";

/** Phân trang phía server: hiển thị "x–y / tổng" và các nút trang (rút gọn bằng "…"). */
export default function Pagination({
  page,
  pageSize,
  total,
  onChange,
  unit = "bản ghi",
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  unit?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const items: (number | "gap")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) items.push(p);
    else if (items[items.length - 1] !== "gap") items.push("gap");
  }

  return (
    <div className="table-footer">
      <span>
        Hiển thị {from}–{to} / {total} {unit}
      </span>
      {pages > 1 && (
        <nav className="pagination" aria-label="Phân trang">
          <button type="button" className="pg-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước">
            ‹
          </button>
          {items.map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="pg-btn" aria-hidden="true" style={{ border: "none", cursor: "default" }}>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`pg-btn${item === page ? " active" : ""}`}
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
      )}
    </div>
  );
}
