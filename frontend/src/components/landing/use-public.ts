"use client";

import { useEffect, useState } from "react";
import { reportRequestTime } from "@/lib/network";

export interface PublicOverview {
  households: number;
  qualifiedHouseholds: number;
  villages: number;
  plots: number;
  areaHa: number;
}

export interface PublicPesticide {
  name: string;
  activeIngredient: string;
  concentration: string | null;
  mrlMgKg: number | null;
  isolationDays: number | null;
  status: "allowed" | "restricted" | "banned";
}

export interface PublicVariety {
  name: string;
  origin: string | null;
  weightRange: string | null;
  harvestYears: string | null;
  description: string | null;
}

export interface PublicCourse {
  title: string;
  heldOn: string;
  location: string | null;
  trainer: string | null;
  capacity: number;
  enrolled: number;
}

export interface PublicCatalog {
  pesticides: PublicPesticide[];
  varieties: PublicVariety[];
  training: PublicCourse[];
}

type State<T> = { data: T | null; error: boolean; loading: boolean };

// Dùng chung một lần gọi cho nhiều thành phần trên trang.
const cache = new Map<string, Promise<unknown>>();

const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1500;

/** Một lần gọi có giới hạn thời gian; thời gian phản hồi được báo cho bộ theo dõi chất lượng mạng. */
async function fetchJson<T>(path: string): Promise<T> {
  const startedAt = performance.now();
  try {
    const response = await fetch(`/api/public/${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json()) as T;
  } finally {
    reportRequestTime(performance.now() - startedAt);
  }
}

function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    // Mạng chập chờn: tự thử lại một lần trước khi báo lỗi, để người dùng không phải tải lại trang.
    const request = fetchJson<T>(path)
      .catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return fetchJson<T>(path);
      })
      .catch((error) => {
        cache.delete(path); // cho phép thử lại ở lần tải sau
        throw error;
      });
    cache.set(path, request);
  }
  return cache.get(path) as Promise<T>;
}

export function usePublic<T>(path: string): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: false, loading: true });

  useEffect(() => {
    let active = true;
    load<T>(path)
      .then((data) => active && setState({ data, error: false, loading: false }))
      .catch(() => active && setState({ data: null, error: true, loading: false }));
    return () => {
      active = false;
    };
  }, [path]);

  return state;
}
