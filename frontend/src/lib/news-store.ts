"use client";

import { useSyncExternalStore } from "react";
import { NEWS_ARTICLES, type NewsArticle } from "@/components/landing/news-data";

const STORAGE_KEY = "puc_htx_news_articles";
const EVENT_NAME = "htx:news-updated";

let cachedRaw: string | null = null;
let cachedArticles: NewsArticle[] = NEWS_ARTICLES;

/** Lấy danh sách bài viết tin tức từ localStorage hoặc khởi tạo bài viết mẫu ban đầu */
export function getStoredArticles(): NewsArticle[] {
  if (typeof window === "undefined") return NEWS_ARTICLES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (cachedRaw === null) {
        const defaultRaw = JSON.stringify(NEWS_ARTICLES);
        try {
          localStorage.setItem(STORAGE_KEY, defaultRaw);
        } catch {
          // Bỏ qua lỗi hạn ngạch hoặc môi trường riêng tư
        }
        cachedRaw = defaultRaw;
        cachedArticles = NEWS_ARTICLES;
      }
      return cachedArticles;
    }

    if (raw === cachedRaw) {
      return cachedArticles;
    }

    const parsed = JSON.parse(raw) as NewsArticle[];
    cachedRaw = raw;
    cachedArticles = Array.isArray(parsed) && parsed.length > 0 ? parsed : NEWS_ARTICLES;
    return cachedArticles;
  } catch (err) {
    console.error("Lỗi khi đọc tin tức từ localStorage:", err);
    return cachedArticles;
  }
}

/** Lưu danh sách bài viết vào localStorage và thông báo cho các component */
export function setStoredArticles(articles: NewsArticle[]): void {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(articles);
    cachedRaw = raw;
    cachedArticles = articles;
    localStorage.setItem(STORAGE_KEY, raw);
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

function subscribeNews(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
    window.removeEventListener("storage", callback);
  };
}

const emptySubscribe = () => () => {};
const getClientMounted = () => true;
const getServerMounted = () => false;
const getServerArticles = () => NEWS_ARTICLES;

/** React Hook sử dụng danh sách tin tức với khả năng phản ứng thời gian thực */
export function useNewsArticles() {
  const articles = useSyncExternalStore(subscribeNews, getStoredArticles, getServerArticles);
  const mounted = useSyncExternalStore(emptySubscribe, getClientMounted, getServerMounted);

  return {
    articles,
    mounted,
    upsertArticle,
    deleteArticle: deleteArticleById,
    resetDefaults: resetArticlesToDefault,
  };
}
