"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import type { ListResponse } from "@/types/api";

/**
 * Tải dữ liệu thô (DTO) từ một đường dẫn API, kèm trạng thái tải/lỗi và `refresh()`.
 * Dùng cho các màn hình cần thao tác ghi (thêm/sửa/xóa) nên giữ nguyên `id` và kiểu số của backend.
 * `path = null` để tạm chưa tải (ví dụ chờ người dùng chọn bản ghi).
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(path);

  useEffect(() => {
    latest.current = path;
  }, [path]);

  const refresh = useCallback(async () => {
    const current = latest.current;
    if (current === null) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(current);
      if (latest.current === current) setData(result);
    } catch (err) {
      if (latest.current === current) setError(errorMessage(err, "Không tải được dữ liệu."));
    } finally {
      if (latest.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    latest.current = path;
    void refresh();
  }, [path, refresh]);

  return { data: path === null ? null : data, loading: path === null ? false : loading, error, refresh, setData };
}

/** Danh sách phân trang chuẩn `{ data, total, page, pageSize }` của backend. */
export function useApiList<T>(resource: string | null, params: Record<string, string | number | undefined | null> = {}) {
  const query = new URLSearchParams();
  query.set("pageSize", String(params.pageSize ?? 500));
  for (const [key, value] of Object.entries(params)) {
    if (key === "pageSize" || value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const path = resource === null ? null : `/${resource}?${query.toString()}`;
  const state = useApi<ListResponse<T>>(path);
  return {
    rows: state.data?.data ?? [],
    total: state.data?.total ?? 0,
    loading: state.loading,
    error: state.error,
    refresh: state.refresh,
  };
}

/**
 * Bọc một thao tác ghi: trạng thái `pending`, thông báo lỗi tiếng Việt, chặn bấm hai lần.
 * `run` trả về kết quả (hoặc `undefined` nếu lỗi) để nơi gọi đóng hộp thoại/làm mới danh sách.
 */
export function useMutation<TArgs extends unknown[], TResult>(action: (...args: TArgs) => Promise<TResult>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const actionRef = useRef(action);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const run = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      return await actionRef.current(...args);
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending, error, setError };
}
