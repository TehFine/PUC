import type { FeatureCollection } from "geojson";
import { api } from "@/lib/api-client";
import type { CreatedPlot } from "@/types/geo";

export function createPlot(payload: Record<string, unknown>) {
  return api.post<CreatedPlot>("/plots", payload);
}

export function saveMeasurement(payload: Record<string, unknown>) {
  return api.post<{ persisted?: boolean }>("/plots/measurements", payload);
}

export function importCadastral(collection: FeatureCollection, sourceRef: string) {
  return api.post<{ imported?: number; persisted?: boolean }>("/plots/import", {
    collection,
    sourceRef,
  });
}
