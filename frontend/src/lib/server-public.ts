import type { PublicOverview } from "@/components/landing/use-public";

function resolveBackendBaseUrl(): string {
  const raw =
    process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  return raw.trim().replace(/\/+$/, "").replace(/\/api$/i, "");
}

function isValidPublicOverview(val: unknown): val is PublicOverview {
  if (!val || typeof val !== "object") return false;
  const o = val as Record<string, unknown>;
  return (
    typeof o.households === "number" &&
    Number.isFinite(o.households) &&
    typeof o.qualifiedHouseholds === "number" &&
    Number.isFinite(o.qualifiedHouseholds) &&
    typeof o.villages === "number" &&
    Number.isFinite(o.villages) &&
    typeof o.plots === "number" &&
    Number.isFinite(o.plots) &&
    typeof o.areaHa === "number" &&
    Number.isFinite(o.areaHa)
  );
}

/**
 * Nạp trước số liệu tổng quan vùng trồng thực tế ngay trên máy chủ (SSR) với timeout ngắn (1,2 giây)
 * và bộ đệm ngắn (30 giây) để hiển thị tức thì ở First Contentful Paint mà không chặn trang nếu API bận.
 */
export async function fetchServerPublicOverview(): Promise<PublicOverview | null> {
  try {
    const res = await fetch(`${resolveBackendBaseUrl()}/api/public/overview`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isValidPublicOverview(json) ? json : null;
  } catch {
    return null;
  }
}

