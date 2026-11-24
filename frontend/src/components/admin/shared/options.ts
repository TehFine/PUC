"use client";

import { useMemo } from "react";
import { useApiList } from "@/hooks/use-api";
import type { Option } from "@/components/ui/form/fields";
import type { PesticideDto, VillageDto } from "@/types/api";
import type { HouseholdRow } from "@/types/households";

function cleanAdminLabelDash(raw: string | null | undefined): string {
  return String(raw || "")
    .replace(/\s*[–—]\s*/g, ", ")
    .trim();
}

/** Danh sách hộ (tối đa 500, đã giới hạn theo thôn ở backend) làm lựa chọn cho các biểu mẫu. */
export function useHouseholdOptions(enabled = true) {
  const { rows, loading, error } = useApiList<HouseholdRow>(enabled ? "households" : null, { pageSize: 500 });
  const options = useMemo<Option[]>(
    () =>
      rows.map((h) => {
        const plotPart = h.plotCodesSummary ? `, Thửa ${h.plotCodesSummary}` : "";
        const villagePart = h.villageName ? ` - ${cleanAdminLabelDash(h.villageName)}` : "";
        return {
          value: String(h.id),
          label: `${h.name}${plotPart} (${h.code})${villagePart}`,
        };
      }),
    [rows],
  );
  return { households: rows, options, loading, error };
}

/** Danh sách thôn cho bộ lọc và biểu mẫu hộ. */
export function useVillageOptions(enabled = true) {
  const { rows, loading, error } = useApiList<VillageDto>(enabled ? "villages" : null, { pageSize: 500 });
  const options = useMemo<Option[]>(() => rows.map((v) => ({ value: String(v.id), label: v.name })), [rows]);
  return { villages: rows, options, loading, error };
}

const PESTICIDE_STATUS_LABEL: Record<PesticideDto["status"], string> = {
  allowed: "",
  restricted: " (hạn chế)",
  banned: " (CẤM)",
};

/** Danh mục thuốc BVTV cho biểu mẫu phun thuốc. */
export function usePesticideOptions(enabled = true) {
  const { rows, loading, error } = useApiList<PesticideDto>(enabled ? "pesticides" : null, { pageSize: 500 });
  const options = useMemo<Option[]>(
    () =>
      rows.map((p) => ({
        value: String(p.id),
        label: `${p.name}${p.activeIngredient ? ` – ${p.activeIngredient}` : ""}${PESTICIDE_STATUS_LABEL[p.status] ?? ""}`,
      })),
    [rows],
  );
  return { pesticides: rows, options, loading, error };
}
