"use client";

import { useEffect } from "react";

function annotateTable(table: HTMLTableElement) {
  const headers = Array.from(table.tHead?.rows[0]?.cells ?? []).map((cell) =>
    (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
  if (headers.length === 0) return;

  table.classList.add("responsive-table");

  table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
    Array.from(row.cells).forEach((cell, index) => {
      if (cell.colSpan > 1) return;
      if (!cell.dataset.label) cell.dataset.label = headers[index] ?? "";
    });
  });
}

export default function ResponsiveTables() {
  useEffect(() => {
    let frame = 0;

    const target = document.querySelector(".main-content") ?? document.body;

    const scan = () => {
      frame = 0;
      target
        .querySelectorAll<HTMLTableElement>(".table-wrap table")
        .forEach(annotateTable);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(scan);
    };

    scan();

    const observer = new MutationObserver(schedule);
    observer.observe(target, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
