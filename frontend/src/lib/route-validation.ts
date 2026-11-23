export type SectionId =
  | "dashboard"
  | "households"
  | "zones"
  | "approval"
  | "journal"
  | "testing"
  | "harvest"
  | "reports"
  | "catalog"
  | "system"
  | "news";

export type PortalTabRouteId = "home" | "plots" | "diary" | "stamps" | "inspection" | "learn";

export const VALID_ADMIN_SECTIONS: ReadonlySet<SectionId> = new Set([
  "dashboard",
  "households",
  "zones",
  "approval",
  "journal",
  "testing",
  "harvest",
  "reports",
  "catalog",
  "system",
  "news",
]);

/** Ánh xạ các liên kết thông báo nội bộ về đúng phân mục quản trị tương ứng. */
export const ADMIN_SECTION_ALIASES: Record<string, { section: SectionId; sub?: string }> = {
  registrations: { section: "approval", sub: "registrations" },
  schedule: { section: "approval", sub: "schedule" },
  training: { section: "approval" },
  spray: { section: "journal", sub: "spray" },
  violations: { section: "journal", sub: "violations" },
};

const ADMIN_SUBTABS_BY_SECTION: Partial<Record<SectionId, ReadonlySet<string>>> = {
  zones: new Set(["map", "list"]),
  approval: new Set(["pending", "registrations", "schedule", "minutes"]),
  journal: new Set(["protocol", "journal", "violations", "spray"]),
  harvest: new Set(["lots", "plans", "stamps", "contracts", "enterprises"]),
  catalog: new Set(["protocol", "pesticide", "fertilizer", "variety", "diseases", "village", "standards"]),
  system: new Set(["accounts", "deletions", "trace-requests", "roles", "alerts", "audit"]),
};

const PASSIVE_SYSTEM_QUERY_KEYS: ReadonlySet<string> = new Set([
  "perf",
  "net",
  "fbclid",
  "gclid",
  "zarsrc",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
]);

const ALLOWED_ADMIN_KEYS: ReadonlySet<string> = new Set([
  "section",
  "sub",
  "tab",
  "id",
  "violationId",
  "plotCode",
  "householdId",
  ...PASSIVE_SYSTEM_QUERY_KEYS,
]);

const VALID_PORTAL_TABS: ReadonlySet<PortalTabRouteId> = new Set([
  "home",
  "plots",
  "diary",
  "stamps",
  "inspection",
  "learn",
]);

const PORTAL_TAB_ALIASES: Record<string, PortalTabRouteId> = {
  harvest: "stamps",
};

const PORTAL_SUBTABS_BY_TAB: Partial<Record<PortalTabRouteId, ReadonlySet<string>>> = {
  diary: new Set(["protocol", "journal", "spray"]),
  learn: new Set(["protocol", "pesticides", "fertilizers", "varieties", "diseases"]),
};

const ALLOWED_PORTAL_KEYS: ReadonlySet<string> = new Set([
  "tab",
  "sub",
  "view",
  "plot",
  "plotCode",
  "violationId",
  "scheduleId",
  ...PASSIVE_SYSTEM_QUERY_KEYS,
]);

const POSITIVE_INT_RE = /^[1-9]\d{0,14}$/;
const SAFE_PLOT_CODE_RE = /^[A-Za-z0-9._-]{1,64}$/;

type RawSearchRecord = Record<string, string | string[] | undefined>;

function toEntries(input: RawSearchRecord | URLSearchParams): Array<[string, string | string[] | undefined]> {
  if (input instanceof URLSearchParams) {
    const map = new Map<string, string[]>();
    input.forEach((value, key) => {
      const list = map.get(key) ?? [];
      list.push(value);
      map.set(key, list);
    });
    return Array.from(map.entries()).map(([k, arr]) => [k, arr.length === 1 ? arr[0] : arr]);
  }
  return Object.entries(input);
}

/**
 * Kiểm tra chặt chẽ toàn bộ tham số URL của `/admin`:
 * - Từ chối khóa lạ, mảng lặp, giá trị rỗng hoặc chứa ký tự đường dẫn rác (ví dụ `?section=news/dđ/xyz`).
 * - Trả về `null` nếu đường dẫn không hợp lệ để trang gọi `notFound()` (404).
 */
export function resolveValidAdminRoute(
  input: RawSearchRecord | URLSearchParams,
): { section: SectionId; sub?: string } | null {
  const entries = toEntries(input);
  const clean: Record<string, string> = {};

  for (const [key, rawVal] of entries) {
    if (rawVal === undefined) continue;
    if (!ALLOWED_ADMIN_KEYS.has(key)) return null;
    if (Array.isArray(rawVal)) return null;
    if (!rawVal.trim()) return null;
    clean[key] = rawVal;
  }

  let resolvedSection: SectionId = "dashboard";
  let aliasSub: string | undefined;

  if (clean.section !== undefined) {
    if (VALID_ADMIN_SECTIONS.has(clean.section as SectionId)) {
      resolvedSection = clean.section as SectionId;
    } else if (Object.prototype.hasOwnProperty.call(ADMIN_SECTION_ALIASES, clean.section)) {
      resolvedSection = ADMIN_SECTION_ALIASES[clean.section].section;
      aliasSub = ADMIN_SECTION_ALIASES[clean.section].sub;
    } else {
      return null;
    }
  }

  const subCandidate = clean.sub ?? clean.tab;
  if (subCandidate !== undefined) {
    const allowedSubs = ADMIN_SUBTABS_BY_SECTION[resolvedSection];
    if (!allowedSubs || !allowedSubs.has(subCandidate)) {
      return null;
    }
  }

  if (clean.id !== undefined && !POSITIVE_INT_RE.test(clean.id)) return null;
  if (clean.violationId !== undefined && !POSITIVE_INT_RE.test(clean.violationId)) return null;
  if (clean.householdId !== undefined && !POSITIVE_INT_RE.test(clean.householdId)) return null;
  if (clean.plotCode !== undefined && !SAFE_PLOT_CODE_RE.test(clean.plotCode)) return null;

  return { section: resolvedSection, sub: subCandidate ?? aliasSub };
}

/**
 * Kiểm tra chặt chẽ toàn bộ tham số URL của `/portal`:
 * - Trả về `null` nếu có khóa lạ hoặc giá trị rác (ví dụ `?tab=diary/abc/xyz`) để hiện trang 404.
 */
export function resolveValidPortalRoute(
  input: RawSearchRecord | URLSearchParams,
): { tab: PortalTabRouteId; sub?: string } | null {
  const entries = toEntries(input);
  const clean: Record<string, string> = {};

  for (const [key, rawVal] of entries) {
    if (rawVal === undefined) continue;
    if (!ALLOWED_PORTAL_KEYS.has(key)) return null;
    if (Array.isArray(rawVal)) return null;
    if (!rawVal.trim()) return null;
    clean[key] = rawVal;
  }

  let resolvedTab: PortalTabRouteId = "home";
  if (clean.tab !== undefined) {
    if (VALID_PORTAL_TABS.has(clean.tab as PortalTabRouteId)) {
      resolvedTab = clean.tab as PortalTabRouteId;
    } else if (Object.prototype.hasOwnProperty.call(PORTAL_TAB_ALIASES, clean.tab)) {
      resolvedTab = PORTAL_TAB_ALIASES[clean.tab];
    } else {
      return null;
    }
  }

  const subCandidate = clean.sub ?? clean.view;
  if (subCandidate !== undefined) {
    const allowedSubs = PORTAL_SUBTABS_BY_TAB[resolvedTab];
    if (!allowedSubs || !allowedSubs.has(subCandidate)) {
      return null;
    }
  }

  if (clean.violationId !== undefined && !POSITIVE_INT_RE.test(clean.violationId)) return null;
  if (clean.scheduleId !== undefined && !POSITIVE_INT_RE.test(clean.scheduleId)) return null;
  if (clean.plot !== undefined && !SAFE_PLOT_CODE_RE.test(clean.plot)) return null;
  if (clean.plotCode !== undefined && !SAFE_PLOT_CODE_RE.test(clean.plotCode)) return null;

  return { tab: resolvedTab, sub: subCandidate };
}

