"use client";

import { Fragment, memo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { TraceLang } from "./trace-i18n";

const A4_SHEET_WIDTH_PX = 820;
const A4_SHEET_HEIGHT_PX = 1160; // Chuẩn tỷ lệ ISO A4 210 : 297 (820 * 297 / 210 ≈ 1160)
const A4_PAD_TOP_PX = 44;
const A4_PAD_BOTTOM_PX = 36;
const A4_INNER_HEIGHT_PX = A4_SHEET_HEIGHT_PX - A4_PAD_TOP_PX - A4_PAD_BOTTOM_PX; // 1080px
const A4_SAFETY_BUFFER_PX = 8; // Đệm an toàn chống sai số sub-pixel làm chạm chân trang
const A4_HEADER_GAP_PX = 22;
const A4_SECTION_GAP_PX = 22;
const A4_FOOTER_GAP_PX = 22;

export interface A4DossierTableRowItem {
  key: string;
  node: ReactNode;
}

export interface A4DossierTableSpec {
  sectionClassName?: string;
  ariaLabel?: string;
  title: string;
  partTitleFmt?: (part: number, totalParts: number) => string;
  metaRight?: ReactNode;
  metaRightClassName?: string;
  tableClassName?: string;
  thead?: ReactNode;
  rows: A4DossierTableRowItem[];
}

export type A4DossierSectionItem =
  | {
      key: string;
      kind?: "block";
      content: ReactNode;
    }
  | {
      key: string;
      kind: "table";
      table: A4DossierTableSpec;
    };

type PageRenderSlot =
  | {
      kind: "block";
      secIdx: number;
    }
  | {
      kind: "table-slice";
      secIdx: number;
      startRow: number;
      endRow: number;
      partIndex: number;
      totalParts: number;
    };

function measureBoxHeight(el: HTMLElement | null): number {
  if (!el) return 0;
  const rectH = el.getBoundingClientRect().height;
  return rectH > 0 ? Math.ceil(rectH) : el.offsetHeight;
}

function buildInitialSlots(sections: readonly A4DossierSectionItem[]): PageRenderSlot[] {
  const slots: PageRenderSlot[] = [];
  sections.forEach((sec, secIdx) => {
    if (sec.kind === "table") {
      if (sec.table.rows.length > 0) {
        slots.push({
          kind: "table-slice",
          secIdx,
          startRow: 0,
          endRow: sec.table.rows.length,
          partIndex: 0,
          totalParts: 1,
        });
      }
    } else {
      slots.push({ kind: "block", secIdx });
    }
  });
  return slots;
}

function arePagesEqual(a: readonly PageRenderSlot[][], b: readonly PageRenderSlot[][]): boolean {
  if (a.length !== b.length) return false;
  for (let p = 0; p < a.length; p += 1) {
    const pgA = a[p]!;
    const pgB = b[p]!;
    if (pgA.length !== pgB.length) return false;
    for (let s = 0; s < pgA.length; s += 1) {
      const x = pgA[s]!;
      const y = pgB[s]!;
      if (x.kind !== y.kind || x.secIdx !== y.secIdx) return false;
      if (x.kind === "table-slice" && y.kind === "table-slice") {
        if (
          x.startRow !== y.startRow ||
          x.endRow !== y.endRow ||
          x.partIndex !== y.partIndex ||
          x.totalParts !== y.totalParts
        ) {
          return false;
        }
      }
    }
  }
  return true;
}

export function splitCoopHeaderLines(
  coopText: string,
  lang: TraceLang,
): { line1: string; line2: string | null } {
  const trimmed = coopText.trim();
  if (lang === "vi") {
    const m = /^(Hợp\s+tác\s+xã|HTX)\s+(.+)$/i.exec(trimmed);
    if (m?.[1] && m[2]) {
      return { line1: m[1].trim(), line2: m[2].trim() };
    }
  }
  if (lang === "en") {
    const m = /^(.+?)\s+((?:General\s+Business|Agricultural|Durian)\b.+)$/i.exec(trimmed);
    if (m?.[1] && m[2]) {
      return { line1: m[1].trim(), line2: m[2].trim() };
    }
  }
  return { line1: trimmed, line2: null };
}

export const PaginatedA4Dossier = memo(function PaginatedA4Dossier({
  status,
  measureKey,
  headerFull,
  headerContinuation,
  sections,
  renderFooter,
}: {
  status: string;
  measureKey: string;
  headerFull: ReactNode;
  headerContinuation: ReactNode;
  sections: A4DossierSectionItem[];
  renderFooter: (pageIndex: number, totalPages: number) => ReactNode;
}) {
  const deckRef = useRef<HTMLDivElement>(null);
  const sandboxRef = useRef<HTMLDivElement>(null);
  const fullHeaderRef = useRef<HTMLDivElement>(null);
  const contHeaderRef = useRef<HTMLDivElement>(null);
  const lastFooterRef = useRef<HTMLDivElement>(null);
  const midFooterRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const recomputeFnRef = useRef<() => void>(() => {});

  const sectionCount = sections.length;
  const [scale, setScale] = useState<number>(1);
  const [pages, setPages] = useState<PageRenderSlot[][]>(() => [buildInitialSlots(sections)]);

  useLayoutEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;

    let printing = false;

    const updateScale = () => {
      if (printing) return;
      const availWidth = deck.clientWidth;
      if (availWidth <= 0) return;
      const nextScale =
        availWidth >= A4_SHEET_WIDTH_PX
          ? 1
          : Number((availWidth / A4_SHEET_WIDTH_PX).toFixed(6));
      setScale((prev) => (Math.abs(prev - nextScale) < 0.0002 ? prev : nextScale));
    };

    const recomputePages = () => {
      const hFull = measureBoxHeight(fullHeaderRef.current) || 56;
      const hCont = measureBoxHeight(contHeaderRef.current) || 34;
      const hLastFoot = measureBoxHeight(lastFooterRef.current) || 34;
      const hMidFoot = measureBoxHeight(midFooterRef.current) || 34;
      const reservedFoot = Math.max(hLastFoot, hMidFoot);

      type MeasuredSection =
        | { kind: "empty" }
        | { kind: "block"; secIdx: number; height: number }
        | {
            kind: "table";
            secIdx: number;
            totalHeight: number;
            chromeHeight: number;
            rowHeights: number[];
          };

      let hasAnyMeasured = false;
      const measured: MeasuredSection[] = sections.map((sec, idx) => {
        const wrapper = sectionRefs.current[idx] ?? null;
        if (!wrapper) return { kind: "empty" };
        if (sec.kind === "table") {
          if (sec.table.rows.length === 0) return { kind: "empty" };
          const wrapperRectH = wrapper.getBoundingClientRect().height;
          const totalH = wrapperRectH > 0 ? Math.ceil(wrapperRectH) : wrapper.offsetHeight;
          if (totalH > 0) hasAnyMeasured = true;
          const tbody = wrapper.querySelector<HTMLTableSectionElement>(
            'tbody[data-measure-tbody="1"]',
          );
          const tbodyRectH = tbody ? tbody.getBoundingClientRect().height : 0;
          const trList = tbody ? (Array.from(tbody.children) as HTMLElement[]) : [];
          const rowHeights = sec.table.rows.map((_, rIdx) => {
            const trEl = trList[rIdx] ?? null;
            return Math.max(24, measureBoxHeight(trEl) || 38);
          });
          const sumRows = rowHeights.reduce((acc, h) => acc + h, 0);
          const rawChrome =
            wrapperRectH > 0 && tbodyRectH > 0 && wrapperRectH >= tbodyRectH
              ? Math.ceil(wrapperRectH - tbodyRectH)
              : totalH > sumRows
                ? totalH - sumRows
                : sec.table.thead
                  ? 58
                  : 30;
          return {
            kind: "table",
            secIdx: idx,
            totalHeight: totalH || rawChrome + sumRows,
            chromeHeight: Math.max(sec.table.thead ? 44 : 26, rawChrome + 2),
            rowHeights,
          };
        }

        const blockH = measureBoxHeight(wrapper);
        if (blockH > 0) hasAnyMeasured = true;
        return { kind: "block", secIdx: idx, height: blockH };
      });

      if (!hasAnyMeasured) return;

      const pageBudgetFor = (pageIndex: number) => {
        const headerH = pageIndex === 0 ? hFull : hCont;
        return Math.max(
          260,
          A4_INNER_HEIGHT_PX -
            A4_SAFETY_BUFFER_PX -
            headerH -
            A4_HEADER_GAP_PX -
            A4_FOOTER_GAP_PX -
            reservedFoot,
        );
      };

      const rawPages: PageRenderSlot[][] = [];
      let curPage: PageRenderSlot[] = [];
      let usedH = 0;

      const flushPage = () => {
        if (curPage.length > 0) {
          rawPages.push(curPage);
          curPage = [];
          usedH = 0;
        }
      };

      for (const item of measured) {
        if (item.kind === "empty") continue;

        if (item.kind === "block") {
          const curBudget = pageBudgetFor(rawPages.length);
          const gap = curPage.length > 0 ? A4_SECTION_GAP_PX : 0;
          if (curPage.length > 0 && usedH + gap + item.height > curBudget) {
            flushPage();
            curPage.push({ kind: "block", secIdx: item.secIdx });
            usedH = item.height;
          } else {
            curPage.push({ kind: "block", secIdx: item.secIdx });
            usedH += gap + item.height;
          }
          continue;
        }

        // Mục dạng bảng: tự động ngắt dòng vừa khít từng tờ A4, lặp lại tiêu đề cột ở trang tiếp theo
        const totalRows = item.rowHeights.length;
        let rowCursor = 0;
        const createdSlices: Array<Extract<PageRenderSlot, { kind: "table-slice" }>> = [];

        while (rowCursor < totalRows) {
          let curBudget = pageBudgetFor(rawPages.length);
          let gap = curPage.length > 0 ? A4_SECTION_GAP_PX : 0;
          let avail = curBudget - usedH - gap;
          const firstRowNeed = item.chromeHeight + item.rowHeights[rowCursor]!;

          if (curPage.length > 0 && firstRowNeed > avail) {
            flushPage();
            curBudget = pageBudgetFor(rawPages.length);
            gap = 0;
            avail = curBudget;
          }

          let sliceEnd = rowCursor + 1;
          let sliceHeight = item.chromeHeight + item.rowHeights[rowCursor]!;

          while (sliceEnd < totalRows) {
            const nextRowH = item.rowHeights[sliceEnd]!;
            if (sliceHeight + nextRowH > avail) {
              break;
            }
            sliceHeight += nextRowH;
            sliceEnd += 1;
          }

          const sliceSlot: Extract<PageRenderSlot, { kind: "table-slice" }> = {
            kind: "table-slice",
            secIdx: item.secIdx,
            startRow: rowCursor,
            endRow: sliceEnd,
            partIndex: createdSlices.length,
            totalParts: 1,
          };
          createdSlices.push(sliceSlot);
          curPage.push(sliceSlot);
          usedH += gap + sliceHeight;
          rowCursor = sliceEnd;

          if (rowCursor < totalRows) {
            flushPage();
          }
        }

        if (createdSlices.length > 1) {
          for (const sl of createdSlices) {
            sl.totalParts = createdSlices.length;
          }
        }
      }

      if (curPage.length > 0) {
        rawPages.push(curPage);
      }
      if (rawPages.length === 0) {
        rawPages.push(buildInitialSlots(sections));
      }

      setPages((prev) => (arePagesEqual(prev, rawPages) ? prev : rawPages));
    };

    recomputeFnRef.current = recomputePages;

    const onBeforePrint = () => {
      printing = true;
      setScale(1);
    };

    const onAfterPrint = () => {
      printing = false;
      updateScale();
    };

    updateScale();
    recomputePages();

    const hasResizeObserver = typeof ResizeObserver !== "undefined";
    const deckRo = hasResizeObserver ? new ResizeObserver(() => updateScale()) : null;
    const sandboxRo = hasResizeObserver ? new ResizeObserver(() => recomputePages()) : null;
    deckRo?.observe(deck);
    if (sandboxRef.current) {
      sandboxRo?.observe(sandboxRef.current);
    }

    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        recomputePages();
      });
    }

    if (!deckRo) {
      window.addEventListener("resize", updateScale);
    }
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    return () => {
      deckRo?.disconnect();
      sandboxRo?.disconnect();
      if (!deckRo) {
        window.removeEventListener("resize", updateScale);
      }
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [measureKey, sectionCount, sections]);

  const renderTableSlice = (
    sec: Extract<A4DossierSectionItem, { kind: "table" }>,
    startRow: number,
    endRow: number,
    partIndex: number,
    totalParts: number,
  ) => {
    const { table } = sec;
    const headerTitle =
      totalParts > 1 && table.partTitleFmt
        ? table.partTitleFmt(partIndex + 1, totalParts)
        : table.title;
    const sliceRows = table.rows.slice(startRow, endRow);

    return (
      <section
        className={table.sectionClassName || "tr-doc-ledger tr-doc-ext-block"}
        aria-label={table.ariaLabel}
      >
        <div className="tr-doc-meta-strip">
          <span className="tr-doc-meta-left">{headerTitle}</span>
          {table.metaRight ? (
            <strong className={table.metaRightClassName || "tr-doc-meta-right"}>
              {table.metaRight}
            </strong>
          ) : null}
        </div>
        <div className="tr-doc-table-wrap">
          <table className={table.tableClassName || "tr-doc-table"}>
            {table.thead ? <thead>{table.thead}</thead> : null}
            <tbody>
              {sliceRows.map((row) => (
                <Fragment key={row.key}>{row.node}</Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div
      ref={deckRef}
      className="tr-doc-a4-deck"
      style={{ "--a4-scale": String(scale) } as React.CSSProperties}
    >
      {pages.map((pageSlots, pageIdx) => (
        <div key={`a4-sheet-${pageIdx}`} className="tr-doc-a4-page-frame">
          <article className="tr-doc-sheet" data-status={status}>
            {pageIdx === 0 ? headerFull : headerContinuation}

            <div className="tr-doc-page-body">
              {pageSlots.map((slot) => {
                const sec = sections[slot.secIdx];
                if (!sec) return null;
                if (slot.kind === "table-slice" && sec.kind === "table") {
                  return (
                    <div
                      key={`${sec.key}-slice-${slot.startRow}-${slot.endRow}`}
                      className="tr-doc-page-block"
                    >
                      {renderTableSlice(
                        sec,
                        slot.startRow,
                        slot.endRow,
                        slot.partIndex,
                        slot.totalParts,
                      )}
                    </div>
                  );
                }
                if (sec.kind !== "table") {
                  return (
                    <div key={sec.key} className="tr-doc-page-block">
                      {sec.content}
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {renderFooter(pageIdx, pages.length)}
          </article>
        </div>
      ))}

      {/* Khung đo kích thước ẩn chuẩn chiều rộng lòng tờ A4 (716px) để tự động cắt trang theo từng dòng */}
      <div
        ref={sandboxRef}
        className="tr-doc-measure-sandbox no-print"
        aria-hidden="true"
        onLoadCapture={() => recomputeFnRef.current()}
      >
        <div ref={fullHeaderRef} className="tr-doc-measure-item">
          {headerFull}
        </div>
        <div ref={contHeaderRef} className="tr-doc-measure-item">
          {headerContinuation}
        </div>
        <div ref={lastFooterRef} className="tr-doc-measure-item">
          {renderFooter(0, 1)}
        </div>
        <div ref={midFooterRef} className="tr-doc-measure-item">
          {renderFooter(0, 2)}
        </div>
        {sections.map((sec, idx) => (
          <div
            key={`measure-${sec.key}`}
            ref={(el) => {
              sectionRefs.current[idx] = el;
            }}
            className="tr-doc-measure-item"
          >
            {sec.kind === "table" ? (
              <section className={sec.table.sectionClassName || "tr-doc-ledger tr-doc-ext-block"}>
                <div className="tr-doc-meta-strip">
                  <span className="tr-doc-meta-left">
                    {sec.table.partTitleFmt ? sec.table.partTitleFmt(1, 2) : sec.table.title}
                  </span>
                  {sec.table.metaRight ? (
                    <strong className={sec.table.metaRightClassName || "tr-doc-meta-right"}>
                      {sec.table.metaRight}
                    </strong>
                  ) : null}
                </div>
                <div className="tr-doc-table-wrap">
                  <table className={sec.table.tableClassName || "tr-doc-table"}>
                    {sec.table.thead ? <thead>{sec.table.thead}</thead> : null}
                    <tbody data-measure-tbody="1">
                      {sec.table.rows.map((row) => (
                        <Fragment key={row.key}>{row.node}</Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              sec.content
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
