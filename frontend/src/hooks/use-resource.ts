"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { ListResponse } from "@/types/api";

const PAGE_SIZE = 500;
const resourceCache = new Map<string, unknown>();
const resourceInflight = new Map<string, Promise<unknown>>();

/**
 * Tải danh sách từ `/api/<resource>` và chuyển từng bản ghi sang kiểu hiển thị bằng `mapper`.
 * `mapper` nên là hàm ở mức module (tham chiếu ổn định).
 */
export function useResource<TDto, TView>(resource: string, mapper: (dto: TDto) => TView) {
  const cached = resourceCache.get(resource) as TView[] | undefined;
  const [data, setData] = useState<TView[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const existing = resourceInflight.get(resource) as Promise<TView[]> | undefined;
    if (existing) return existing;
    const req = api
      .get<ListResponse<TDto>>(`/${resource}?pageSize=${PAGE_SIZE}`)
      .then((result) => {
        const mapped = result.data.map(mapper);
        resourceCache.set(resource, mapped);
        return mapped;
      })
      .finally(() => {
        resourceInflight.delete(resource);
      });
    resourceInflight.set(resource, req);
    return req;
  }, [resource, mapper]);

  const refresh = useCallback(async () => {
    setError(null);
    resourceInflight.delete(resource);
    try {
      const fresh = await load();
      setData(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [load, resource]);

  useEffect(() => {
    if (resourceCache.has(resource)) {
      return;
    }
    let active = true;
    load()
      .then((rows) => {
        if (!active) return;
        setData(rows);
      })
      .catch((err) => {
        if (!active) return;
        if (!resourceCache.has(resource)) {
          setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load, resource]);

  return { data, loading, error, refresh };
}
