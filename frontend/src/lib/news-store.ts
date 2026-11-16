"use client";

import { useCallback, useEffect, useState } from "react";
import { NEWS_ARTICLES, type NewsArticle } from "@/components/landing/news-data";
import { DATA_MUTATED_EVENT, DATA_SYNC_CHANNEL } from "@/lib/api-client";
import { reportRequestTime } from "@/lib/network";
import type { NewsCategory, PublicNewsRecord } from "@/types/news";
import { isSafeMediaUrl } from "@/utils/url-safety";

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

export function sanitizeNewsContent(rawContent: unknown, fallbackLead = ""): NewsArticle["content"] {
  const obj =
    rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)
      ? (rawContent as Record<string, unknown>)
      : {};
  const lead = typeof obj.lead === "string" && obj.lead.trim() ? obj.lead : fallbackLead;
  const takeaway = typeof obj.takeaway === "string" && obj.takeaway.trim() ? obj.takeaway : undefined;
  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  const sections = rawSections
    .filter((sec): sec is Record<string, unknown> => Boolean(sec && typeof sec === "object" && !Array.isArray(sec)))
    .map((sec) => {
      const heading = typeof sec.heading === "string" ? sec.heading : "";
      const paragraphs = Array.isArray(sec.paragraphs)
        ? sec.paragraphs.filter((p): p is string => typeof p === "string")
        : [];
      const bulletList = Array.isArray(sec.bulletPoints)
        ? sec.bulletPoints.filter((b): b is string => typeof b === "string")
        : [];
      return {
        heading,
        paragraphs,
        bulletPoints: bulletList.length > 0 ? bulletList : undefined,
      };
    });

  return {
    lead,
    sections,
    takeaway,
  };
}

export function mapApiArticle(record: PublicNewsRecord & { id?: number | string }): NewsArticle {
  const catMeta = NEWS_CATEGORY_META[record.category] ?? NEWS_CATEGORY_META.visit;
  const imageUrl = isSafeMediaUrl(record.imageUrl) ? record.imageUrl : undefined;
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
    author: record.author || "Ban Kỹ thuật và Truyền thông HTX",
    image: imageUrl ?? "/landing/news-field-visit.jpg",
    imageAlt: record.imageAlt || record.title,
    content: sanitizeNewsContent(record.content, record.excerpt),
  };
}

export const mapPublicNewsToArticle = mapApiArticle;

let cachedNewsArticles: NewsArticle[] | null = null;
let cachedNewsEtag: string | null = null;
let cachedNewsFreshUntil = 0;
let inflightNewsPromise: Promise<NewsArticle[]> | null = null;
const NEWS_TIMEOUT_MS = 18_000;
const NEWS_FRESH_MS = 30_000;

if (typeof window !== "undefined") {
  const markNewsStale = () => {
    cachedNewsFreshUntil = 0;
  };
  window.addEventListener(DATA_MUTATED_EVENT, markNewsStale);
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(DATA_SYNC_CHANNEL);
      bc.addEventListener("message", markNewsStale);
    } catch {
      // ignore
    }
  }
}

async function fetchPublicArticles(force = false): Promise<NewsArticle[]> {
  if (!force && cachedNewsArticles && Date.now() < cachedNewsFreshUntil) return cachedNewsArticles;
  if (!force && inflightNewsPromise) return inflightNewsPromise;

  const request = (async () => {
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);
    try {
      const headers: Record<string, string> | undefined =
        cachedNewsEtag && cachedNewsArticles ? { "If-None-Match": cachedNewsEtag } : undefined;
      const response = await fetch("/api/public/news", {
        cache: "no-store",
        headers,
        signal: controller.signal,
      });
      reportRequestTime(performance.now() - start);
      if (response.status === 304 && cachedNewsArticles) {
        cachedNewsFreshUntil = Date.now() + NEWS_FRESH_MS;
        return cachedNewsArticles;
      }
      if (!response.ok) return cachedNewsArticles ?? NEWS_ARTICLES;
      const nextEtag = response.headers.get("ETag");
      const body = (await response.json()) as
        | { data?: (PublicNewsRecord & { id?: number })[] }
        | (PublicNewsRecord & { id?: number })[];
      const rawList = Array.isArray(body) ? body : (body.data ?? []);
      const resolved = rawList.length > 0 ? rawList.map(mapPublicNewsToArticle) : NEWS_ARTICLES;
      cachedNewsArticles = resolved;
      cachedNewsEtag = nextEtag;
      cachedNewsFreshUntil = Date.now() + NEWS_FRESH_MS;
      return resolved;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => {
    inflightNewsPromise = null;
  });

  inflightNewsPromise = request;
  return request;
}

/**
 * Hook tải bản tin đã xuất bản từ `GET /api/public/news`.
 * Có bộ nhớ đệm trong phiên và timeout an toàn cho mạng 3G/4G yếu; ngoại tuyến dùng `NEWS_ARTICLES`.
 */
export function useNewsArticles() {
  const [articles, setArticles] = useState<NewsArticle[]>(() => cachedNewsArticles ?? NEWS_ARTICLES);
  const [loading, setLoading] = useState<boolean>(() => cachedNewsArticles === null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchPublicArticles(true);
      setArticles(next);
    } catch {
      // Ngoại tuyến: giữ danh sách bài viết mẫu NEWS_ARTICLES
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedNewsArticles && Date.now() < cachedNewsFreshUntil) return;
    let active = true;
    fetchPublicArticles(false)
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

  return { articles, loading, refresh };
}
