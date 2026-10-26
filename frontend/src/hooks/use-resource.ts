"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { ListResponse } from "@/types/api";

const PAGE_SIZE = 500;

/**
 * Tải danh sách từ `/api/<resource>` và chuyển từng bản ghi sang kiểu hiển thị bằng `mapper`.
 * `mapper` nên là hàm ở mức module (tham chiếu ổn định).
 */
export function useResource<TDto, TView>(resource: string, mapper: (dto: TDto) => TView) {
  const [data, setData] = useState<TView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api.get<ListResponse<TDto>>(`/${resource}?pageSize=${PAGE_SIZE}`).then((result) => result.data.map(mapper)),
    [resource, mapper],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
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
      .then((rows) => active && setData(rows))
      .catch((err) => active && setError(err instanceof Error ? err.message : "Không tải được dữ liệu."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  return { data, loading, error, refresh };
}
