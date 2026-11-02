"use client";

import { useState } from "react";
import { FormGrid, NumberField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { VillageRecord } from "@/types/catalog";
import FormModal from "./FormModal";
import { str, toNullableText, toNumber } from "./form-utils";

/** Thêm / sửa thôn/tổ (POST/PATCH /villages). */
export default function VillageFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: VillageRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [leader, setLeader] = useState(initial?.leader ?? "");
  const [householdCount, setHouseholdCount] = useState(str(initial?.householdCount ?? 0));
  const [plotCount, setPlotCount] = useState(str(initial?.plotCount ?? 0));
  const [areaHa, setAreaHa] = useState(str(initial?.areaHa ?? 0));
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const body = {
      name: name.trim(),
      leader: toNullableText(leader),
      householdCount: toNumber(householdCount) ?? 0,
      plotCount: toNumber(plotCount) ?? 0,
      areaHa: toNumber(areaHa) ?? 0,
    };
    return initial ? api.patch(`/villages/${initial.id}`, body) : api.post("/villages", body);
  });

  const submit = async () => {
    const hhVal = toNumber(householdCount) ?? 0;
    const plotVal = toNumber(plotCount) ?? 0;
    const areaVal = toNumber(areaHa) ?? 0;
    if (!name.trim()) return setLocalError("Vui lòng nhập tên thôn / tổ.");
    if (!Number.isInteger(hhVal) || hhVal < 0) return setLocalError("Số hộ đăng ký phải là số nguyên không âm.");
    if (!Number.isInteger(plotVal) || plotVal < 0) return setLocalError("Số thửa phải là số nguyên không âm.");
    if (Number.isNaN(areaVal) || areaVal < 0) return setLocalError("Diện tích phải là số không âm.");
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật thôn / tổ." : "Đã thêm thôn / tổ.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa thôn / tổ: ${initial.name}` : "Thêm thôn / tổ"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
    >
      <FormGrid>
        <TextField label="Tên thôn / tổ" required value={name} onChange={setName} maxLength={100} placeholder="VD: Thôn 1" />
        <TextField label="Trưởng thôn / Tổ trưởng" value={leader} onChange={setLeader} maxLength={100} />
        <NumberField label="Số hộ đăng ký" value={householdCount} onChange={setHouseholdCount} min={0} step={1} />
        <NumberField label="Số thửa đất" value={plotCount} onChange={setPlotCount} min={0} step={1} />
        <NumberField label="Diện tích (ha)" value={areaHa} onChange={setAreaHa} min={0} step={0.1} />
      </FormGrid>
    </FormModal>
  );
}
