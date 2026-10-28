"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

const portalCache = new Map<string, unknown>();

/** Tải dữ liệu từ `/api/portal/<path>`; `refresh` tải lại (dùng sau khi ghi). Có cache bộ nhớ tránh flash loading khi chuyển tab. */
export function usePortal<T>(path: string) {
  const cached = portalCache.get(path) as T | undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.get<T>(`/portal/${path}`), [path]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const fresh = await load();
      portalCache.set(path, fresh);
      setData(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [load, path]);

  useEffect(() => {
    let active = true;
    load()
      .then((result) => {
        if (!active) return;
        portalCache.set(path, result);
        setData(result);
      })
      .catch((err) => {
        if (!active) return;
        if (!portalCache.has(path)) {
          setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load, path]);

  return { data, loading, error, refresh };
}
