import type { AuthUser } from "../../auth/auth-user";
import { isCoopStaffRole } from "../../auth/permissions";
import { DatabaseService } from "../../database/database.service";
import { badRequest, forbidden } from "../errors/app.exception";

export const CUNE_ADMIN_LOCATION = "Xã Krông Búk, Tỉnh Đắk Lắk";
export const EAKHAL_ADMIN_LOCATION = "Xã Ea Khăl, Tỉnh Đắk Lắk";

export const EAKHAL_VILLAGE_SQL_REGEX = "ea\\s*kh[aă]l|ea\\s*k''?s[oô]";

function normGeoText(val: string): string {
  return val
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const COMMUNE_LEVEL_PREFIX_RE = /^(?:xa|phuong|thi tran)\s+/;
const DISTRICT_LEVEL_PREFIX_RE = /^(?:huyen|quan|thi xa|thanh pho|tp\.?)\s+/;
const ADMIN_LEVEL_PREFIX_RE = /^(?:xa|phuong|thi tran|huyen|quan|thi xa|thanh pho|tp\.?|tinh)\s+/;

function matchesSingleSegment(target: string, adminLocations: string[]): boolean {
  if (!target) return false;
  if (target === "*" || target === "toan quoc") return true;

  const targetHasPrefix = ADMIN_LEVEL_PREFIX_RE.test(target);
  const targetStripped = target.replace(ADMIN_LEVEL_PREFIX_RE, "").trim();

  for (const loc of adminLocations) {
    const segments = loc
      .split(",")
      .map((s) => normGeoText(s))
      .filter(Boolean);
    const hasKrongBukCommune = segments.some((s) => s === "xa krong buk" || s === "krong buk");
    if (
      hasKrongBukCommune &&
      (target === "xa cu ne" ||
        target === "huyen krong buk" ||
        (!targetHasPrefix && (targetStripped === "cu ne" || targetStripped === "krong buk")))
    ) {
      return true;
    }
    const hasEaKhalCommune = segments.some((s) => s === "xa ea khal" || s === "ea khal");
    if (
      hasEaKhalCommune &&
      (target === "huyen ea h'leo" ||
        target === "huyen ea hleo" ||
        (!targetHasPrefix && (targetStripped === "ea h'leo" || targetStripped === "ea hleo")))
    ) {
      return true;
    }
    for (const seg of segments) {
      if (seg === target) return true;
      if (!targetHasPrefix) {
        const segStripped = seg.replace(ADMIN_LEVEL_PREFIX_RE, "").trim();
        if (segStripped === targetStripped) return true;
      }
    }
  }
  return false;
}

export function matchesJurisdiction(assignedRaw: string, adminLocations: string[]): boolean {
  const fullTarget = normGeoText(assignedRaw);
  if (!fullTarget) return false;
  if (fullTarget === "*" || fullTarget === "toan quoc") return true;

  const rawParts = assignedRaw
    .split(",")
    .map((s) => normGeoText(s))
    .filter(Boolean);
  if (rawParts.length <= 1) {
    return matchesSingleSegment(fullTarget, adminLocations);
  }

  // Khi chuỗi địa bàn chứa nhiều cấp hành chính ngăn cách bởi dấu phẩy
  // (VD: "Xã Krông Búk, Tỉnh Đắk Lắk" hoặc "Xã Ea Khăl, Huyện Ea H'Leo, Tỉnh Đắk Lắk"),
  // ưu tiên cấp chi tiết nhất (cấp xã -> cấp huyện -> cấp tỉnh) để hậu tố ", Tỉnh Đắk Lắk"
  // không làm mở rộng nhầm sang xã khác trong cùng tỉnh.
  const communeParts = rawParts.filter(
    (p) =>
      COMMUNE_LEVEL_PREFIX_RE.test(p) ||
      p === "cu ne" ||
      p === "krong buk" ||
      p === "ea khal",
  );
  if (communeParts.length > 0) {
    return communeParts.some((p) => matchesSingleSegment(p, adminLocations));
  }

  const districtParts = rawParts.filter(
    (p) => DISTRICT_LEVEL_PREFIX_RE.test(p) || p === "ea h'leo" || p === "ea hleo",
  );
  if (districtParts.length > 0) {
    return districtParts.some((p) => matchesSingleSegment(p, adminLocations));
  }

  return rawParts.some((p) => matchesSingleSegment(p, adminLocations));
}

export function resolveParcelAdminLocation(villageName?: string | null, zoneOrPlotCode?: string | null): string {
  const v = (villageName || "").trim();
  const z = (zoneOrPlotCode || "").trim();
  if (/ea\s*kh[aă]l|ea\s*k'?s[oô]/i.test(v) || /^66-PUC-SR0001-/i.test(z)) {
    return EAKHAL_ADMIN_LOCATION;
  }
  return CUNE_ADMIN_LOCATION;
}

function normVillageKey(val?: string | null): string {
  return (val || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Kiểm tra cán bộ có thuộc phạm vi HTX Cư Né / địa bàn cho phép hay không (dùng cho cấp danh sách, báo cáo, duyệt tài khoản).
 */
export function isStaffInCuneCoopScope(user: AuthUser | undefined, allowEaKhal = false): boolean {
  if (!user) return true;
  if (user.role === "enterprise" || user.role === "farmer") return false;
  if (isCoopStaffRole(user.role)) {
    const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
    if (userCoop !== "HTX-CUNE") return false;
  }
  const allowedLocations = allowEaKhal ? [CUNE_ADMIN_LOCATION, EAKHAL_ADMIN_LOCATION] : [CUNE_ADMIN_LOCATION];
  if (user.role === "inspector") {
    const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
    if (!matchesJurisdiction(region, allowedLocations)) return false;
  }
  if (user.role === "village_officer") {
    const hasVillage = user.villageId !== null && user.villageId !== undefined;
    const hasCommune = Boolean(user.assignedCommune && user.assignedCommune.trim());
    if (!hasVillage && !hasCommune) return false;
  }
  if (user.assignedCommune && user.assignedCommune.trim()) {
    if (!matchesJurisdiction(user.assignedCommune, allowedLocations)) return false;
  }
  return true;
}

/**
 * Kiểm tra cán bộ có quyền truy cập một hộ / thửa / thôn cụ thể hay không.
 */
export function isStaffInParcelScope(
  user: AuthUser | undefined,
  row: {
    villageId?: number | null;
    villageName?: string | null;
    zoneCode?: string | null;
    plotCode?: string | null;
  },
  officerVillageName?: string | null,
): boolean {
  if (!user) return true;
  if (user.role === "enterprise" || user.role === "farmer") return false;
  if (isCoopStaffRole(user.role)) {
    const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
    if (userCoop !== "HTX-CUNE") return false;
  }
  const locations = [resolveParcelAdminLocation(row.villageName, row.zoneCode || row.plotCode)];
  if (user.role === "village_officer") {
    const hasVillage = user.villageId !== null && user.villageId !== undefined;
    const hasCommune = Boolean(user.assignedCommune && user.assignedCommune.trim());
    if (!hasVillage && !hasCommune) return false;
    if (hasVillage) {
      if (row.villageId !== null && row.villageId !== undefined) {
        if (Number(row.villageId) !== Number(user.villageId)) return false;
      } else {
        const expectedVillage = normVillageKey(officerVillageName);
        const actualVillage = normVillageKey(row.villageName);
        if (!expectedVillage || !actualVillage || expectedVillage !== actualVillage) {
          return false;
        }
      }
    }
    if (hasCommune && !matchesJurisdiction(user.assignedCommune!, locations)) return false;
    return true;
  }
  if (user.role === "inspector") {
    const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
    if (!matchesJurisdiction(region, locations)) return false;
  }
  if (user.assignedCommune && user.assignedCommune.trim()) {
    if (!matchesJurisdiction(user.assignedCommune, locations)) return false;
  }
  return true;
}

/**
 * Trả về điều kiện lọc SQL trên cột `village_id` (`column`) theo đầy đủ phạm vi:
 * - `htx_officer` / `admin`: phải thuộc `HTX-CUNE` (ngoài HTX trả về `1 = 0`) và khớp `assignedCommune` nếu có.
 * - `inspector`: phải khớp `assignedRegion` (mặc định `Tỉnh Đắk Lắk`) và `assignedCommune` nếu có.
 * - `village_officer`: lọc theo `villageId` và/hoặc `assignedCommune` (ví dụ `Xã Ea Khăl` hoặc `Xã Krông Búk`).
 * - `enterprise` / `farmer`: trả `null` để các service có nhánh xử lý riêng tự quyết định.
 */
export const villageScope = (column: string) => (user: AuthUser, params: unknown[]): string | null => {
  if (user.role === "enterprise" || user.role === "farmer") {
    return null;
  }

  if (isCoopStaffRole(user.role)) {
    const userCoop = (user.coopCode || "HTX-CUNE").trim().toUpperCase();
    if (userCoop !== "HTX-CUNE") return "1 = 0";
  }

  const clauses: string[] = [];

  if (user.role === "inspector") {
    const region = (user.assignedRegion || "Tỉnh Đắk Lắk").trim();
    const regionInCune = matchesJurisdiction(region, [CUNE_ADMIN_LOCATION]);
    const regionInEaKhal = matchesJurisdiction(region, [EAKHAL_ADMIN_LOCATION]);
    if (!regionInCune && !regionInEaKhal) return "1 = 0";
    if (regionInEaKhal && !regionInCune) {
      clauses.push(`${column} IN (SELECT v_sc.id FROM villages v_sc WHERE v_sc.name ~* '${EAKHAL_VILLAGE_SQL_REGEX}')`);
    } else if (regionInCune && !regionInEaKhal) {
      clauses.push(`(${column} IS NULL OR ${column} NOT IN (SELECT v_sc.id FROM villages v_sc WHERE v_sc.name ~* '${EAKHAL_VILLAGE_SQL_REGEX}'))`);
    }
  }

  if (user.role === "village_officer") {
    const hasVillage = user.villageId !== null && user.villageId !== undefined;
    const hasCommune = Boolean(user.assignedCommune && user.assignedCommune.trim());
    if (!hasVillage && !hasCommune) return "1 = 0";
    if (hasVillage) {
      params.push(user.villageId);
      clauses.push(`${column} = $${params.length}`);
    }
  }

  const commune = user.assignedCommune?.trim() || "";
  if (commune) {
    const inCune = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
    const inEaKhal = matchesJurisdiction(commune, [EAKHAL_ADMIN_LOCATION]);
    if (!inCune && !inEaKhal) return "1 = 0";
    if (inEaKhal && !inCune) {
      clauses.push(`${column} IN (SELECT v_sc.id FROM villages v_sc WHERE v_sc.name ~* '${EAKHAL_VILLAGE_SQL_REGEX}')`);
    } else if (inCune && !inEaKhal) {
      clauses.push(`(${column} IS NULL OR ${column} NOT IN (SELECT v_sc.id FROM villages v_sc WHERE v_sc.name ~* '${EAKHAL_VILLAGE_SQL_REGEX}'))`);
    }
  }

  return clauses.length > 0 ? clauses.join(" AND ") : null;
};

/** Kiểm tra hộ tồn tại và nằm trong phạm vi quản lý của cán bộ thực hiện thao tác. */
export async function assertHouseholdInScope(
  db: DatabaseService,
  input: Record<string, unknown>,
  user: AuthUser,
): Promise<void> {
  if (input.householdId === undefined || input.householdId === null) return;
  const { rows } = await db.query<{ village_id: number | null; village_name: string | null }>(
    `SELECT h.village_id, v.name AS village_name
       FROM households h
       LEFT JOIN villages v ON v.id = h.village_id
      WHERE h.id = $1`,
    [input.householdId],
  );
  if (rows.length === 0) throw badRequest("Hộ nông dân không tồn tại.");
  const row = rows[0];
  let officerVillageName: string | null = null;
  if (user.role === "village_officer" && user.villageId) {
    const vr = await db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [user.villageId]);
    officerVillageName = vr.rows[0]?.name ?? null;
  }
  if (
    !isStaffInParcelScope(
      user,
      { villageId: row.village_id, villageName: row.village_name },
      officerVillageName,
    )
  ) {
    throw forbidden("Hộ nông dân này không thuộc phạm vi quản lý của bạn.");
  }
}
