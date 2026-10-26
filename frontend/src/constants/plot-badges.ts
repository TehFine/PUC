import type { PlotSource, PlotStatus } from "@/types/geo";

export const SOURCE_BADGE: Record<PlotSource, string> = {
  declared: "badge-green",
  measured: "badge-orange",
  cadastral: "badge-blue",
  demo: "badge-gray",
};

export const STATUS_BADGE: Record<PlotStatus, string> = {
  approved: "badge-green",
  improve: "badge-gold",
  violation: "badge-red",
  pending: "badge-gray",
};
