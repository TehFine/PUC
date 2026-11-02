"use client";

import { useEffect, useState } from "react";

/** Trả về giá trị sau khi người dùng ngừng gõ `delay` ms (dùng cho ô tìm kiếm gọi server). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
