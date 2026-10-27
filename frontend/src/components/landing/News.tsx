"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { NEWS_CATEGORIES, type NewsArticle } from "./news-data";
import { useNewsArticles } from "@/lib/news-store";

export default function News() {
  const { articles } = useNewsArticles();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [readingArticle, setReadingArticle] = useState<NewsArticle | null>(null);

  // Khóa cuộn trang khi mở modal đọc bài viết
  useEffect(() => {
    if (readingArticle) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setReadingArticle(null);
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [readingArticle]);

  const filteredArticles =
    selectedCategory === "all"
      ? articles
      : articles.filter((item) => item.category === selectedCategory);

  const featured = filteredArticles[0];
  const regularList = filteredArticles.slice(1);

  return (
    <div className="lp-news-root">
      {/* Bộ lọc chuyên mục bản tin */}
      <div className="lp-news-tabs-wrap">
        <div className="lp-news-tabs" role="tablist" aria-label="Lọc chuyên mục bản tin">
          {NEWS_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              className={`lp-news-tab ${selectedCategory === cat.id ? "is-active" : ""}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bài viết tiêu điểm (Featured Card) */}
      {featured && (
        <article className="lp-news-featured lp-glass" onClick={() => setReadingArticle(featured)}>
          <div className="lp-news-feat-media lp-clip">
            <Image
              src={featured.image}
              alt={featured.imageAlt}
              fill
              sizes="(max-width: 900px) 100vw, 560px"
              priority
            />
            <span className="lp-clip-arrow" aria-hidden="true">
              <svg viewBox="0 0 42 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ overflow: "visible", display: "block" }}>
                <path d="M1 8h36M30 2.5 37 8l-7 5.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>

          <div className="lp-news-feat-body">
            <div className="lp-news-meta">
              <span className={`lp-news-badge is-${featured.tagTone}`}>{featured.categoryLabel}</span>
              <span className="lp-news-date">{featured.date}</span>
              <span className="lp-news-read">{featured.readTime}</span>
            </div>

            <h3 className="lp-news-feat-title">{featured.title}</h3>
            <p className="lp-news-feat-desc">{featured.excerpt}</p>

            <div className="lp-news-feat-foot">
              <span className="lp-news-author">{featured.author}</span>
              <button
                type="button"
                className="lp-news-read-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setReadingArticle(featured);
                }}
              >
                Đọc toàn bộ bài viết →
              </button>
            </div>
          </div>
        </article>
      )}

      {/* Lưới các bài viết tiếp theo */}
      {regularList.length > 0 && (
        <div className="lp-news-grid">
          {regularList.map((item) => (
            <article
              key={item.id}
              className="lp-news-card lp-glass"
              onClick={() => setReadingArticle(item)}
            >
              <div className="lp-news-card-media">
                <Image
                  src={item.image}
                  alt={item.imageAlt}
                  fill
                  sizes="(max-width: 768px) 100vw, 360px"
                />
              </div>

              <div className="lp-news-card-body">
                <div className="lp-news-meta">
                  <span className={`lp-news-badge is-${item.tagTone}`}>{item.categoryLabel}</span>
                  <span className="lp-news-date">{item.date}</span>
                </div>

                <h4 className="lp-news-card-title">{item.title}</h4>
                <p className="lp-news-card-desc">{item.excerpt}</p>

                <div className="lp-news-card-foot">
                  <span className="lp-news-read">{item.readTime}</span>
                  <span className="lp-news-link">Đọc tiếp →</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Modal / Bảng đọc toàn bộ nội dung bài báo */}
      {readingArticle && (
        <div
          className="lp-news-modal-backdrop"
          onClick={() => setReadingArticle(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reading-title"
        >
          <div className="lp-news-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="lp-news-modal-drag" aria-hidden="true" />
            <header className="lp-news-modal-head">
              <div className="lp-news-meta">
                <span className={`lp-news-badge is-${readingArticle.tagTone}`}>
                  {readingArticle.categoryLabel}
                </span>
                <span className="lp-news-date">{readingArticle.date}</span>
                <span className="lp-news-read">{readingArticle.readTime}</span>
              </div>
              <button
                type="button"
                className="lp-news-modal-close"
                aria-label="Đóng bài viết"
                onClick={() => setReadingArticle(null)}
              >
                ✕
              </button>
            </header>

            <div className="lp-news-modal-scroll">
              <h2 id="reading-title" className="lp-news-modal-title">
                {readingArticle.title}
              </h2>

              <p className="lp-news-modal-author">
                Tác giả: <strong>{readingArticle.author}</strong> · Phát hành nội bộ HTX Krông Búk
              </p>

              <figure className="lp-news-modal-photo">
                <Image
                  src={readingArticle.image}
                  alt={readingArticle.imageAlt}
                  fill
                  sizes="(max-width: 900px) 100vw, 760px"
                />
                <figcaption>{readingArticle.imageAlt}</figcaption>
              </figure>

              <div className="lp-news-modal-body">
                <p className="lp-news-lead">{readingArticle.content.lead}</p>

                {readingArticle.content.sections.map((sec) => (
                  <section key={sec.heading} className="lp-news-modal-sec">
                    <h3>{sec.heading}</h3>
                    {sec.paragraphs.map((p, idx) => (
                      <p key={idx}>{p}</p>
                    ))}
                    {sec.bulletPoints && (
                      <ul className="lp-news-bullets">
                        {sec.bulletPoints.map((bp, bpIdx) => (
                          <li key={bpIdx}>{bp}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}

                {readingArticle.content.takeaway && (
                  <div className="lp-news-takeaway">
                    <div className="lp-news-takeaway-label">KHUYẾN CÁO NHÀ NÔNG</div>
                    <p>{readingArticle.content.takeaway}</p>
                  </div>
                )}

                <div className="lp-news-support-box">
                  <strong>Bà con cần hướng dẫn cụ thể tại vườn?</strong>
                  <p>
                    Vui lòng liên hệ cán bộ khuyến nông phụ trách thôn hoặc gửi yêu cầu trực tiếp qua{" "}
                    <strong>Cổng hộ dân</strong> để được kỹ sư HTX về tận vườn hỗ trợ kiểm tra và xử lý kịp thời.
                  </p>
                </div>
              </div>

              <footer className="lp-news-modal-foot">
                <button
                  type="button"
                  className="lp-btn lp-btn-solid"
                  onClick={() => setReadingArticle(null)}
                >
                  Đã hiểu, quay lại bản tin
                </button>
              </footer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
