"use client";

import { useEffect, useState } from "react";
import { NEWS_ARTICLES, type NewsArticle } from "@/components/landing/news-data";

const STORAGE_KEY = "puc_htx_news_articles";
const EVENT_NAME = "htx:news-updated";

/** Lấy danh sách bài viết tin tức từ localStorage hoặc khởi tạo bài viết mẫu ban đầu */
export function getStoredArticles(): NewsArticle[] {
  if (typeof window === "undefined") return NEWS_ARTICLES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(NEWS_ARTICLES));
      return NEWS_ARTICLES;
    }
    const parsed = JSON.parse(raw) as NewsArticle[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : NEWS_ARTICLES;
  } catch (err) {
    console.error("Lỗi khi đọc tin tức từ localStorage:", err);
    return NEWS_ARTICLES;
  }
}

/** Lưu danh sách bài viết vào localStorage và thông báo cho các component */
export function setStoredArticles(articles: NewsArticle[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: articles }));
  } catch (err) {
    console.error("Lỗi khi lưu tin tức vào localStorage:", err);
  }
}

/** Thêm hoặc cập nhật một bài viết */
export function upsertArticle(article: NewsArticle): void {
  const current = getStoredArticles();
  const index = current.findIndex((a) => a.id === article.id);
  let updated: NewsArticle[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = article;
  } else {
    // Đưa bài mới lên đầu danh sách
    updated = [article, ...current];
  }
  setStoredArticles(updated);
}

/** Xóa một bài viết theo ID */
export function deleteArticleById(id: string): void {
  const current = getStoredArticles();
  const updated = current.filter((a) => a.id !== id);
  setStoredArticles(updated);
}

/** Đặt lại danh sách bài viết về mặc định */
export function resetArticlesToDefault(): void {
  setStoredArticles(NEWS_ARTICLES);
}

/** React Hook sử dụng danh sách tin tức với khả năng phản ứng thời gian thực */
export function useNewsArticles() {
  const [articles, setArticles] = useState<NewsArticle[]>(NEWS_ARTICLES);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setArticles(getStoredArticles());

    const handleUpdate = () => {
      setArticles(getStoredArticles());
    };

    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  return {
    articles,
    mounted,
    upsertArticle,
    deleteArticle: deleteArticleById,
    resetDefaults: resetArticlesToDefault,
  };
}
