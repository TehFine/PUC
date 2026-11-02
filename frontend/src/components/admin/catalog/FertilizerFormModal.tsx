"use client";

import { useState } from "react";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { FertilizerCategory, FertilizerRecord, FertilizerStatus } from "@/types/catalog";
import FormModal from "./FormModal";
import { toNullableText } from "./form-utils";
import ImageUploadField from "./ImageUploadField";
import { FERTILIZER_CATEGORY, FERTILIZER_STATUS, toOptions } from "./labels";

/** Thêm / sửa phân bón (POST/PATCH /fertilizers). */
export default function FertilizerFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: FertilizerRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<FertilizerCategory>(initial?.category ?? "organic");
  const [status, setStatus] = useState<FertilizerStatus>(initial?.status ?? "allowed");
  const [formula, setFormula] = useState(initial?.formula ?? "");
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? "");
  const [dosage, setDosage] = useState(initial?.dosage ?? "");
  const [applicationMethod, setApplicationMethod] = useState(initial?.applicationMethod ?? "");
  const [timing, setTiming] = useState(initial?.timing ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const body = {
      name: name.trim(),
      category,
      status,
      formula: formula.trim(),
      manufacturer: manufacturer.trim(),
      dosage: dosage.trim(),
      applicationMethod: applicationMethod.trim(),
      timing: timing.trim(),
      imageUrl,
      description: toNullableText(description),
    };
    return initial ? api.patch(`/fertilizers/${initial.id}`, body) : api.post("/fertilizers", body);
  });

  const submit = async () => {
    if (!name.trim() || !formula.trim() || !manufacturer.trim() || !dosage.trim() || !applicationMethod.trim() || !timing.trim()) {
      return setLocalError("Vui lòng nhập đầy đủ tên phân bón, công thức, nhà sản xuất, định mức, phương thức và thời điểm bón.");
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật phân bón." : "Đã thêm phân bón.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa phân bón: ${initial.name}` : "Thêm phân bón"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      width={680}
    >
      <FormGrid>
        <TextField label="Tên thương phẩm" required value={name} onChange={setName} maxLength={150} />
        <TextField label="Nhà sản xuất" required value={manufacturer} onChange={setManufacturer} maxLength={150} />
        <SelectField
          label="Phân loại"
          required
          value={category}
          onChange={(v) => setCategory(v as FertilizerCategory)}
          options={toOptions(FERTILIZER_CATEGORY)}
        />
        <SelectField
          label="Trạng thái"
          required
          value={status}
          onChange={(v) => setStatus(v as FertilizerStatus)}
          options={toOptions(FERTILIZER_STATUS)}
        />
        <TextField label="Thành phần / Công thức" required value={formula} onChange={setFormula} maxLength={200} placeholder="VD: Hữu cơ 75%, Humic 3.5%" />
        <TextField label="Định mức khuyến cáo" required value={dosage} onChange={setDosage} maxLength={100} placeholder="VD: 3 – 5 kg/gốc/lần" />
        <TextField label="Phương thức bón" required value={applicationMethod} onChange={setApplicationMethod} maxLength={150} placeholder="VD: Rải quanh tán, xới nhẹ" />
        <TextField label="Thời điểm bón" required value={timing} onChange={setTiming} maxLength={150} placeholder="VD: Sau thu hoạch & trước phân hóa mầm hoa" />
      </FormGrid>
      <ImageUploadField label="Ảnh minh họa" value={imageUrl} onChange={(url) => setImageUrl(url)} purpose="catalog" />
      <TextAreaField label="Mô tả & Lưu ý sử dụng" value={description} onChange={setDescription} rows={3} maxLength={1000} />
    </FormModal>
  );
}
