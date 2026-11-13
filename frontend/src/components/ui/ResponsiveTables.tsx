"use client";

import { useEffect } from "react";

function annotateTable(table: HTMLTableElement) {
  const headers = Array.from(table.tHead?.rows[0]?.cells ?? []).map((cell) =>
    (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
  if (headers.length === 0) return;

  table.classList.add("responsive-table");

  table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
    if (row.dataset.rtAnnotated === "1") return;
    Array.from(row.cells).forEach((cell, index) => {
      if (cell.colSpan > 1) return;
      if (!cell.dataset.label) cell.dataset.label = headers[index] ?? "";
    });
    row.dataset.rtAnnotated = "1";
  });
}

export default function ResponsiveTables() {
  useEffect(() => {
    let frame = 0;
    let observing = false;

    const target = document.querySelector(".main-content") ?? document.body;
    const mql = window.matchMedia("(max-width: 640px)");

    const scan = () => {
      frame = 0;
      if (!mql.matches) return;
      target
        .querySelectorAll<HTMLTableElement>(".table-wrap table")
        .forEach(annotateTable);
    };

    const schedule = () => {
      if (frame || !mql.matches) return;
      frame = window.requestAnimationFrame(scan);
    };

    const observer = new MutationObserver((mutations) => {
      let hasTableMutation = false;
      for (let i = 0; i < mutations.length; i++) {
        const added = mutations[i].addedNodes;
        for (let j = 0; j < added.length; j++) {
          const node = added[j];
          if (node.nodeType === 1) {
            const el = node as Element;
            if (
              el.tagName === "TABLE" ||
              el.tagName === "TBODY" ||
              el.tagName === "TR" ||
              el.querySelector?.("table, tbody, tr")
            ) {
              hasTableMutation = true;
              break;
            }
          }
        }
        if (hasTableMutation) break;
      }
      if (hasTableMutation) {
        schedule();
      }
    });

    const syncMode = () => {
      if (mql.matches) {
        scan();
        if (!observing) {
          observer.observe(target, { childList: true, subtree: true });
          observing = true;
        }
      } else if (observing) {
        observer.disconnect();
        observing = false;
        if (frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      }
    };

    syncMode();
    mql.addEventListener("change", syncMode);

    return () => {
      mql.removeEventListener("change", syncMode);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
