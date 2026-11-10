"use client";

import { useApi } from "./use-api";
import type { PlotCollection } from "@/types/geo";

export function usePlots() {
  const { data: plots, loading, error, refresh } = useApi<PlotCollection>("/plots");
  return { plots, loading, error, refresh };
}
