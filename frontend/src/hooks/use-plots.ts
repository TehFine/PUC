"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { PlotCollection } from "@/types/geo";

export function usePlots() {
  const [plots, setPlots] = useState<PlotCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlots(await api.get<PlotCollection>("/plots"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách thửa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .get<PlotCollection>("/plots")
      .then((data) => active && setPlots(data))
      .catch((err) => active && setError(err instanceof Error ? err.message : "Không tải được danh sách thửa."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { plots, loading, error, refresh };
}
