"use client";

import { useCallback, useEffect, useState } from "react";
import { NEWS_ARTICLES, type NewsArticle } from "@/components/landing/news-data";
import type { NewsCategory, PublicNewsRecord } from "@/types/news";

export const NEWS_CATEGORY_META: Record<
  NewsCategory,
  { label: string; tone: NewsArticle["tagTone"]; badge: string }
> = {
  visit: { label: "Lãnh đạo & Thăm vườn", tone: "blue", badge: "blue" },
  training: { label: "Tập huấn nhà nông", tone: "green", badge: "green" },
  protection: { label: "Thuốc & Sâu bệnh", tone: "yellow", badge: "warn" },
  farming: { label: "Quy trình chăm bón", tone: "peach", badge: "plain" },
};

export function formatVnDate(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoOrDate);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return isoOrDate;
}

export function mapPublicNewsToArticle(record: PublicNewsRecord & { id?: number | string }): NewsArticle {
  const catMeta = NEWS_CATEGORY_META[record.category] ?? NEWS_CATEGORY_META.visit;
  const content = record.content ?? { lead: record.excerpt, sections: [] };
  return {
    id: record.slug || String(record.id ?? ""),
    category: record.category,
    categoryLabel: catMeta.label,
    tagTone: catMeta.tone,
    featured: Boolean(record.featured),
    title: record.title,
    excerpt: record.excerpt,
    date: formatVnDate(record.publishedOn),
    readTime: record.readTime || "4 phút đọc",
    author: record.author || "Ban Kỹ thuật & Truyền thông HTX",
    image: record.imageUrl || "/landing/news-field-visit.jpg",
    imageAlt: record.imageAlt || record.title,
    content: {
      lead: content.lead || record.excerpt,
      sections: Array.isArray(content.sections) ? content.sections : [],
      takeaway: content.takeaway,
    },
  };
}

async function fetchPublicArticles(): Promise<NewsArticle[]> {
  const response = await fetch("/api/public/news", { cache: "no-store" });
  if (!response.ok) return NEWS_ARTICLES;
  const body = (await response.json()) as
    | { data?: (PublicNewsRecord & { id?: number })[] }
    | (PublicNewsRecord & { id?: number })[];
  const rawList = Array.isArray(body) ? body : (body.data ?? []);
  return rawList.length > 0 ? rawList.map(mapPublicNewsToArticle) : NEWS_ARTICLES;
}

/**
 * Hook tải bản tin đã xuất bản từ `GET /api/public/news`.
 * Nếu ngoại tuyến hoặc danh sách rỗng thì dùng `NEWS_ARTICLES` mặc định.
 */
export function useNewsArticles() {
  const [articles, setArticles] = useState<NewsArticle[]>(NEWS_ARTICLES);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchPublicArticles();
      setArticles(next);
    } catch {
      // Ngoại tuyến: giữ danh sách bài viết mẫu NEWS_ARTICLES
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchPublicArticles()
      .then((next) => {
        if (active) setArticles(next);
      })
      .catch(() => {
        // Ngoại tuyến: giữ NEWS_ARTICLES
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    articles,
    loading,
    refresh,
  };
}
