"use client";

import { memo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { TraceLang } from "./trace-i18n";

const A4_SHEET_WIDTH_PX = 820;
const A4_SHEET_HEIGHT_PX = 1160; // Chuẩn tỷ lệ ISO A4 210 : 297 (820 * 297 / 210 ≈ 1160)
const A4_PAD_TOP_PX = 44;
const A4_PAD_BOTTOM_PX = 36;
const A4_INNER_HEIGHT_PX = A4_SHEET_HEIGHT_PX - A4_PAD_TOP_PX - A4_PAD_BOTTOM_PX; // 1080px
const A4_HEADER_GAP_PX = 24;
const A4_SECTION_GAP_PX = 30;
const A4_FOOTER_GAP_PX = 24;

export interface A4DossierSectionItem {
  key: string;
  content: ReactNode;
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

  const sectionCount = sections.length;
  const [scale, setScale] = useState<number>(1);
  const [pages, setPages] = useState<number[][]>(() => [
    Array.from({ length: sectionCount }, (_, idx) => idx),
  ]);

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
      const hFull = fullHeaderRef.current?.offsetHeight ?? 48;
      const hCont = contHeaderRef.current?.offsetHeight ?? 32;
      const hLastFoot = lastFooterRef.current?.offsetHeight ?? 78;
      const hMidFoot = midFooterRef.current?.offsetHeight ?? 34;

      const heights = Array.from(
        { length: sectionCount },
        (_, idx) => sectionRefs.current[idx]?.offsetHeight ?? 0,
      );
      if (hFull === 0 || heights.length === 0 || heights.every((h) => h === 0)) return;

      const sumAll =
        heights.reduce((acc, h) => acc + h, 0) +
        Math.max(0, heights.length - 1) * A4_SECTION_GAP_PX;
      const singlePageTotal =
        hFull + A4_HEADER_GAP_PX + sumAll + A4_FOOTER_GAP_PX + hLastFoot;

      let nextPages: number[][];
      if (singlePageTotal <= A4_INNER_HEIGHT_PX) {
        nextPages = [heights.map((_, i) => i)];
      } else {
        nextPages = [];
        let curPage: number[] = [];
        let usedH = 0;
        const reservedFoot = Math.max(hLastFoot, hMidFoot);

        for (let i = 0; i < heights.length; i += 1) {
          const isFirstPage = nextPages.length === 0;
          const headerH = isFirstPage ? hFull : hCont;
          const budget =
            A4_INNER_HEIGHT_PX - headerH - A4_HEADER_GAP_PX - A4_FOOTER_GAP_PX - reservedFoot;
          const addH = (curPage.length > 0 ? A4_SECTION_GAP_PX : 0) + heights[i];

          if (curPage.length > 0 && usedH + addH > budget) {
            nextPages.push(curPage);
            curPage = [i];
            usedH = heights[i];
          } else {
            curPage.push(i);
            usedH += addH;
          }
        }
        if (curPage.length > 0) {
          nextPages.push(curPage);
        }
      }

      setPages((prev) => {
        if (
          prev.length === nextPages.length &&
          prev.every(
            (pg, pIdx) =>
              pg.length === nextPages[pIdx]?.length &&
              pg.every((v, iIdx) => v === nextPages[pIdx]?.[iIdx]),
          )
        ) {
          return prev;
        }
        return nextPages;
      });
    };

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
  }, [measureKey, sectionCount]);

  return (
    <div
      ref={deckRef}
      className="tr-doc-a4-deck"
      style={{ "--a4-scale": String(scale) } as React.CSSProperties}
    >
      {pages.map((sectionIndices, pageIdx) => (
        <div key={`a4-sheet-${pageIdx}`} className="tr-doc-a4-page-frame">
          <article className="tr-doc-sheet" data-status={status}>
            {pageIdx === 0 ? headerFull : headerContinuation}

            <div className="tr-doc-page-body">
              {sectionIndices.map((secIdx) => {
                const sec = sections[secIdx];
                if (!sec) return null;
                return (
                  <div key={sec.key} className="tr-doc-page-block">
                    {sec.content}
                  </div>
                );
              })}
            </div>

            {renderFooter(pageIdx, pages.length)}
          </article>
        </div>
      ))}

      {/* Khung đo kích thước ẩn chuẩn chiều rộng lòng tờ A4 (716px) để tự động ngắt trang chính xác */}
      <div ref={sandboxRef} className="tr-doc-measure-sandbox no-print" aria-hidden="true">
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
            {sec.content}
          </div>
        ))}
      </div>
    </div>
  );
});
