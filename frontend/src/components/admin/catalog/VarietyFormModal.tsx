"use client";

import { useState } from "react";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { VarietyCategory, VarietyRecord, VarietyStatus } from "@/types/catalog";
import FormModal from "./FormModal";
import { toNullableText } from "./form-utils";
import ImageUploadField from "./ImageUploadField";
import { toOptions, VARIETY_CATEGORY, VARIETY_STATUS } from "./labels";

const VARIETY_PRESETS = [
  { label: "Ri6", src: "/varieties/ri6.png" },
  { label: "Monthong (Dona)", src: "/varieties/monthong.png" },
  { label: "Musang King", src: "/varieties/musangking.png" },
  { label: "Black Thorn", src: "/varieties/blackthorn.png" },
];

/** Thêm / sửa giống sầu riêng (POST/PATCH /varieties). */
export default function VarietyFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: VarietyRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [category, setCategory] = useState<VarietyCategory>(initial?.category ?? "export");
  const [status, setStatus] = useState<VarietyStatus>(initial?.status ?? "allowed");
  const [weightRange, setWeightRange] = useState(initial?.weightRange ?? "");
  const [harvestYears, setHarvestYears] = useState(initial?.harvestYears ?? "");
  const [fleshColor, setFleshColor] = useState(initial?.fleshColor ?? "");
  const [seedRate, setSeedRate] = useState(initial?.seedRate ?? "");
  const [brix, setBrix] = useState(initial?.brix ?? "");
  const [yieldPerHa, setYieldPerHa] = useState(initial?.yieldPerHa ?? "");
  const [marketPotential, setMarketPotential] = useState(initial?.marketPotential ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? "/varieties/ri6.png");
  const [morphologyText, setMorphologyText] = useState((initial?.morphology ?? []).join("\n"));
  const [density, setDensity] = useState(initial?.farmingTechniques?.density ?? "");
  const [pollination, setPollination] = useState(initial?.farmingTechniques?.pollination ?? "");
  const [thinning, setThinning] = useState(initial?.farmingTechniques?.thinning ?? "");
  const [specialNotes, setSpecialNotes] = useState(initial?.farmingTechniques?.specialNotes ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const morphology = morphologyText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const hasFarming = Boolean(density.trim() || pollination.trim() || thinning.trim() || specialNotes.trim());
    const body = {
      name: name.trim(),
      origin: toNullableText(origin),
      category,
      status,
      weightRange: toNullableText(weightRange),
      harvestYears: toNullableText(harvestYears),
      fleshColor: toNullableText(fleshColor),
      seedRate: toNullableText(seedRate),
      brix: toNullableText(brix),
      yieldPerHa: toNullableText(yieldPerHa),
      marketPotential: toNullableText(marketPotential),
      description: toNullableText(description),
      imageUrl,
      morphology: morphology.length > 0 ? morphology : null,
      farmingTechniques: hasFarming
        ? {
            density: density.trim(),
            pollination: pollination.trim(),
            thinning: thinning.trim(),
            specialNotes: specialNotes.trim(),
          }
        : null,
    };
    return initial ? api.patch(`/varieties/${initial.id}`, body) : api.post("/varieties", body);
  });

  const submit = async () => {
    if (!name.trim()) return setLocalError("Vui lòng nhập tên giống sầu riêng.");
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật giống sầu riêng." : "Đã thêm giống sầu riêng.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa giống: ${initial.name}` : "Thêm giống sầu riêng"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      width={720}
    >
      <FormGrid>
        <TextField label="Tên giống sầu riêng" required value={name} onChange={setName} maxLength={100} />
        <TextField label="Xuất xứ" value={origin} onChange={setOrigin} maxLength={100} placeholder="VD: Vĩnh Long, Thái Lan, Malaysia" />
        <SelectField
          label="Phân loại"
          value={category}
          onChange={(v) => setCategory(v as VarietyCategory)}
          options={toOptions(VARIETY_CATEGORY)}
        />
        <SelectField
          label="Trạng thái"
          value={status}
          onChange={(v) => setStatus(v as VarietyStatus)}
          options={toOptions(VARIETY_STATUS)}
        />
        <TextField label="Trọng lượng trái" value={weightRange} onChange={setWeightRange} maxLength={50} placeholder="VD: 2.0 – 3.5 kg" />
        <TextField label="Thời gian cho thu" value={harvestYears} onChange={setHarvestYears} maxLength={50} placeholder="VD: 3.5 – 4 năm" />
        <TextField label="Màu cơm & Đặc tính" value={fleshColor} onChange={setFleshColor} maxLength={120} placeholder="VD: Cơm vàng đậm, dẻo béo" />
        <TextField label="Tỷ lệ hạt lép" value={seedRate} onChange={setSeedRate} maxLength={80} placeholder="VD: Hạt lép 80%" />
        <TextField label="Độ ngọt (Brix)" value={brix} onChange={setBrix} maxLength={50} placeholder="VD: 26 – 29%" />
        <TextField label="Năng suất bình quân" value={yieldPerHa} onChange={setYieldPerHa} maxLength={80} placeholder="VD: 20 – 25 tấn/ha" />
      </FormGrid>

      <ImageUploadField
        label="Ảnh giống cây"
        value={imageUrl}
        onChange={(url) => setImageUrl(url)}
        purpose="catalog"
        presets={VARIETY_PRESETS}
      />

      <TextField label="Tiềm năng thị trường" value={marketPotential} onChange={setMarketPotential} maxLength={300} />
      <TextAreaField label="Mô tả tổng quan" value={description} onChange={setDescription} rows={2} maxLength={1000} />
      <TextAreaField
        label="Đặc điểm hình thái (mỗi dòng một ý)"
        value={morphologyText}
        onChange={setMorphologyText}
        rows={3}
        placeholder="Trái hình bầu dục, gai thưa&#10;Vỏ mỏng dễ tách múi"
      />

      <FormGrid>
        <TextField label="Mật độ trồng" value={density} onChange={setDensity} placeholder="VD: 8m x 8m (156 cây/ha)" />
        <TextField label="Thụ phấn" value={pollination} onChange={setPollination} placeholder="VD: Thụ phấn chéo ban đêm" />
        <TextField label="Tỉa bông & trái" value={thinning} onChange={setThinning} placeholder="VD: Giữ 60 – 80 trái/cây trưởng thành" />
        <TextField label="Lưu ý kỹ thuật" value={specialNotes} onChange={setSpecialNotes} placeholder="VD: Nhạy cảm úng nước mùa mưa" />
      </FormGrid>
    </FormModal>
  );
}
