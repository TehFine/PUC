"use client";

import { useEffect, useState } from "react";

/** Trả về `value` sau khi người dùng ngừng gõ `delay` ms (dùng cho ô tìm kiếm gọi API). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
