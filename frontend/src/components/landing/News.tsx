"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNewsArticles } from "@/lib/news-store";
import { lockRootScroll } from "@/lib/scroll-lock";
import { useStripPagination } from "./use-strip-pagination";

const shouldSkipImageOpt = (src: string) => src.startsWith("/api/") || /^https?:\/\//i.test(src);

function getNewsFocusPosition(imageSrc: string): string {
  if (imageSrc.includes("news-field-visit")) return "center 58%";
  if (imageSrc.includes("news-training")) return "center 50%";
  if (imageSrc.includes("news-protection")) return "center 45%";
  return "center 48%";
}

export default function News() {
  const { articles } = useNewsArticles();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });

  const readingArticle =
    activeIndex !== null && articles[activeIndex] ? articles[activeIndex] : null;

  const {
    stopCount,
    activeStop,
    canPrev,
    canNext,
    handleStripScroll,
    cancelProgrammaticLock,
    scrollToStop,
    scrollByStep,
  } = useStripPagination(trackRef, articles.length);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !trackRef.current) return;
    cancelProgrammaticLock();
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: trackRef.current.scrollLeft,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active || !trackRef.current) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) > 6) {
      state.moved = true;
      setIsDragging(true);
    }
    if (state.moved) {
      e.preventDefault();
      trackRef.current.scrollLeft = state.startScrollLeft - dx;
    }
  };

  const stopDragging = () => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    setIsDragging(false);
  };

  const closeDrawer = useCallback(() => setActiveIndex(null), []);
  const nextArticle = useCallback(() => {
    setActiveIndex((prev) =>
      prev === null || articles.length === 0 ? null : (prev + 1) % articles.length,
    );
  }, [articles.length]);
  const prevArticle = useCallback(() => {
    setActiveIndex((prev) =>
      prev === null || articles.length === 0
        ? null
        : (prev - 1 + articles.length) % articles.length,
    );
  }, [articles.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    const unlockScroll = lockRootScroll();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
      if (e.key === "ArrowRight") nextArticle();
      if (e.key === "ArrowLeft") prevArticle();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unlockScroll();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, closeDrawer, nextArticle, prevArticle]);

  return (
    <section id="tin-tuc" className="sw-section" aria-labelledby="tintuc-title">
      {/* Hàng tiêu đề mục tinh gọn, đồng bộ với phần Tập huấn */}
      <header className="sw-grid sw-sec-head">
        <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />

        <div className="sw-cell sw-col-2-3 sw-head-main">
          <span className="sw-sec-index">04 / Tin tức</span>
          <h2 id="tintuc-title" className="sw-sec-title">
            Bản tin nhà nông
          </h2>
        </div>

        <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
      </header>

      {/* Dải danh sách bản tin nằm ngang cuộn mượt + dấu chấm phân trang + nút Trước / Tiếp ngay bên dưới */}
      <div className="sw-training-strip-shell">
        <div
          ref={trackRef}
          className={`sw-training-strip ${isDragging ? "is-dragging" : ""}`}
          onScroll={handleStripScroll}
          onTouchStart={cancelProgrammaticLock}
          onWheel={cancelProgrammaticLock}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
        >
          {articles.map((article, idx) => {
            const focusPos = getNewsFocusPosition(article.image);

            return (
              <article
                key={article.id}
                className="sw-training-slide"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (dragStateRef.current.moved) {
                    dragStateRef.current.moved = false;
                    return;
                  }
                  setActiveIndex(idx);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveIndex(idx);
                  }
                }}
              >
                <div className="sw-training-photo">
                  <Image
                    src={article.image}
                    alt={article.imageAlt}
                    fill
                    draggable={false}
                    unoptimized={shouldSkipImageOpt(article.image)}
                    sizes="(max-width: 560px) 84vw, (max-width: 960px) 46vw, 30vw"
                    style={{ objectFit: "cover", objectPosition: focusPos }}
                  />
                </div>

                <div className="sw-training-caption">
                  <h3 className="sw-training-slide-title is-news">{article.title}</h3>
                  <p className="sw-training-slide-sub">
                    {article.categoryLabel} · {article.date}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="sw-training-strip-foot">
          {stopCount > 1 && (
            <div
              className="sw-strip-dots"
              role="tablist"
              aria-label="Chọn trang danh sách bản tin"
            >
              {Array.from({ length: stopCount }, (_, i) => {
                const isCurrent = i === activeStop;
                return (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    aria-label={`Trang bản tin ${i + 1} trên ${stopCount}`}
                    className={`sw-strip-dot ${isCurrent ? "is-active" : ""}`}
                    onClick={() => scrollToStop(i)}
                  >
                    <span className="sw-strip-dot-circle" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="sw-training-scroll-btns" aria-label="Cuộn danh sách bản tin">
            <button
              type="button"
              className="eh-step-btn"
              disabled={!canPrev}
              onClick={() => scrollByStep(-1)}
            >
              Trước
            </button>
            <button
              type="button"
              className="eh-step-btn"
              disabled={!canNext}
              onClick={() => scrollByStep(1)}
            >
              Tiếp
            </button>
          </div>
        </div>
      </div>

      {/* Ngăn trượt từ cạnh phải màn hình hiển thị chi tiết bài báo (giống phần Tập huấn) */}
      {readingArticle && (
        <div
          className="sw-side-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="news-drawer-title"
          onClick={closeDrawer}
        >
          <aside className="sw-side-drawer" onClick={(e) => e.stopPropagation()}>
            <header className="sw-side-head">
              <div className="sw-modal-meta">
                <span>{readingArticle.categoryLabel}</span>
                <span>·</span>
                <span>{readingArticle.date}</span>
                <span>·</span>
                <span>{readingArticle.readTime}</span>
              </div>
              <button
                type="button"
                className="sw-side-close"
                aria-label="Đóng bản tin"
                onClick={closeDrawer}
              >
                <span>Đóng</span>
                <span className="sw-side-close-x" aria-hidden="true">
                  ×
                </span>
              </button>
            </header>

            <div className="sw-side-scroll">
              <div className="sw-side-photo-stage">
                <Image
                  src={readingArticle.image}
                  alt={readingArticle.imageAlt}
                  width={1200}
                  height={760}
                  unoptimized={shouldSkipImageOpt(readingArticle.image)}
                  className="sw-side-photo-full"
                  priority
                />
              </div>

              <div className="sw-side-content">
                <span className="sw-micro">Thực hiện: {readingArticle.author}</span>
                <h2 id="news-drawer-title" className="sw-side-title">
                  {readingArticle.title}
                </h2>
                <p className="sw-side-lead">{readingArticle.content.lead}</p>

                {readingArticle.content.sections.map((sec) => (
                  <section key={sec.heading} className="sw-side-section">
                    <h4>{sec.heading}</h4>
                    {sec.paragraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                    {sec.bulletPoints && (
                      <ul className="sw-clean-list">
                        {sec.bulletPoints.map((bp, bi) => (
                          <li key={bi}>{bp}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}

                {readingArticle.content.takeaway && (
                  <div className="sw-side-callout">
                    <span className="sw-micro">Khuyến cáo nhà nông</span>
                    <p>{readingArticle.content.takeaway}</p>
                  </div>
                )}
              </div>
            </div>

            <footer className="sw-side-foot">
              <button type="button" className="eh-step-btn" onClick={prevArticle}>
                <span>Bản tin trước</span>
              </button>
              <button type="button" className="eh-step-btn" onClick={nextArticle}>
                <span>Tiếp</span>
              </button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  );
}
