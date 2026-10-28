"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { ListResponse } from "@/types/api";

const PAGE_SIZE = 500;
const resourceCache = new Map<string, unknown>();

/**
 * Tải danh sách từ `/api/<resource>` và chuyển từng bản ghi sang kiểu hiển thị bằng `mapper`.
 * `mapper` nên là hàm ở mức module (tham chiếu ổn định).
 */
export function useResource<TDto, TView>(resource: string, mapper: (dto: TDto) => TView) {
  const cached = resourceCache.get(resource) as TView[] | undefined;
  const [data, setData] = useState<TView[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api.get<ListResponse<TDto>>(`/${resource}?pageSize=${PAGE_SIZE}`).then((result) => result.data.map(mapper)),
    [resource, mapper],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const fresh = await load();
      resourceCache.set(resource, fresh);
      setData(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [load, resource]);

  useEffect(() => {
    let active = true;
    load()
      .then((rows) => {
        if (!active) return;
        resourceCache.set(resource, rows);
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
