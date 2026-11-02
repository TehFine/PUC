"use client";

import { useState } from "react";
import { FormGrid, NumberField, SelectField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { PesticideRecord, PesticideStatus } from "@/types/catalog";
import FormModal from "./FormModal";
import { str, toNullableText, toNumber } from "./form-utils";
import { PESTICIDE_STATUS, toOptions } from "./labels";

/** Thêm / sửa thuốc BVTV (POST/PATCH /pesticides). */
export default function PesticideFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: PesticideRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [activeIngredient, setActiveIngredient] = useState(initial?.activeIngredient ?? "");
  const [concentration, setConcentration] = useState(initial?.concentration ?? "");
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? "");
  const [mrl, setMrl] = useState(str(initial?.mrlMgKg));
  const [isolation, setIsolation] = useState(str(initial?.isolationDays));
  const [status, setStatus] = useState<PesticideStatus>(initial?.status ?? "allowed");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const mrlValue = toNumber(mrl);
    const isolationValue = toNumber(isolation);
    const body = {
      name: name.trim(),
      activeIngredient: activeIngredient.trim(),
      concentration: toNullableText(concentration),
      manufacturer: toNullableText(manufacturer),
      mrlMgKg: mrlValue ?? null,
      isolationDays: isolationValue ?? null,
      status,
    };
    return initial ? api.patch(`/pesticides/${initial.id}`, body) : api.post("/pesticides", body);
  });

  const submit = async () => {
    const mrlValue = toNumber(mrl);
    const isolationValue = toNumber(isolation);
    if (!name.trim() || !activeIngredient.trim()) return setLocalError("Vui lòng nhập tên thương phẩm và hoạt chất.");
    if (mrlValue !== undefined && (Number.isNaN(mrlValue) || mrlValue < 0)) return setLocalError("MRL phải là số không âm.");
    if (isolationValue !== undefined && (!Number.isInteger(isolationValue) || isolationValue < 0))
      return setLocalError("Thời gian cách ly phải là số ngày nguyên không âm.");
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật thuốc BVTV." : "Đã thêm thuốc BVTV.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa thuốc: ${initial.name}` : "Thêm thuốc BVTV"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
    >
      <FormGrid>
        <TextField label="Tên thương phẩm" required value={name} onChange={setName} maxLength={100} />
        <TextField label="Hoạt chất" required value={activeIngredient} onChange={setActiveIngredient} maxLength={100} />
        <TextField label="Hàm lượng" value={concentration} onChange={setConcentration} maxLength={50} placeholder="VD: 250 g/l" />
        <TextField label="Nhà sản xuất" value={manufacturer} onChange={setManufacturer} maxLength={100} />
        <NumberField label="MRL (mg/kg)" value={mrl} onChange={setMrl} min={0} />
        <NumberField label="Thời gian cách ly (ngày)" value={isolation} onChange={setIsolation} min={0} step={1} />
        <SelectField
          label="Trạng thái"
          required
          value={status}
          onChange={(v) => setStatus(v as PesticideStatus)}
          options={toOptions(PESTICIDE_STATUS)}
        />
      </FormGrid>
    </FormModal>
  );
}
