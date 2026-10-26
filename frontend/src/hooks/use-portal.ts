"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

/** Tải dữ liệu từ `/api/portal/<path>`; `refresh` tải lại (dùng sau khi ghi). */
export function usePortal<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.get<T>(`/portal/${path}`), [path]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setData(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    let active = true;
    load()
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err instanceof Error ? err.message : "Không tải được dữ liệu."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  return { data, loading, error, refresh };
}
