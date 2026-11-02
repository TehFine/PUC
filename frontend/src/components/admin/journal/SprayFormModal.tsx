"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, NumberField, SelectField, TextField, type Option } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, numberText, parseNumber, requireFields, textOrNull, todayIso } from "@/components/admin/shared/form-utils";
import { MRL_STATUS, optionsOf } from "@/components/admin/shared/labels";
import type { PesticideDto } from "@/types/api";
import type { MrlStatus, SprayRow } from "@/types/journal";

const MRL_OPTIONS = optionsOf(MRL_STATUS);

export default function SprayFormModal({
  initial,
  householdOptions,
  pesticides,
  pesticideOptions,
  onClose,
  onSaved,
}: {
  initial?: SprayRow | null;
  householdOptions: Option[];
  pesticides: PesticideDto[];
  pesticideOptions: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [sprayedOn, setSprayedOn] = useState(dateText(initial?.sprayedOn) || todayIso());
  const [householdId, setHouseholdId] = useState(
    initial?.householdId ? String(initial.householdId) : (householdOptions[0]?.value ?? ""),
  );
  const [pesticideId, setPesticideId] = useState(
    initial?.pesticideId ? String(initial.pesticideId) : (pesticideOptions[0]?.value ?? ""),
  );
  const [plotCode, setPlotCode] = useState(initial?.plotCode ?? "");
  const [source, setSource] = useState(initial?.source ?? "Cửa hàng VTNN hợp chuẩn HTX");
  const [dose, setDose] = useState(initial?.dose ?? "20 ml / bình 25L");
  const [areaHa, setAreaHa] = useState(numberText(initial?.areaHa ?? 0.5));
  const [isolationDays, setIsolationDays] = useState(numberText(initial?.isolationDays ?? 14));
  const [mrlStatus, setMrlStatus] = useState<MrlStatus>(initial?.mrlStatus ?? "pass");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<SprayRow>(`/spray/${initial.id}`, payload);
    return api.post<SprayRow>("/spray", payload);
  });

  const handlePesticideChange = (val: string) => {
    setPesticideId(val);
    const found = pesticides.find((p) => String(p.id) === val);
    if (found && found.isolationDays != null) {
      setIsolationDays(String(found.isolationDays));
    }
    if (found && found.status === "banned") {
      setMrlStatus("exceeded");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { sprayedOn, householdId, pesticideId, dose, areaHa },
      {
        sprayedOn: "ngày phun",
        householdId: "hộ nông dân",
        pesticideId: "loại thuốc BVTV",
        dose: "liều lượng",
        areaHa: "diện tích phun",
      },
    );
    const parsedArea = parseNumber(areaHa);
    if (areaHa.trim() && (parsedArea === undefined || parsedArea < 0)) {
      errs.areaHa = "Diện tích phải là số không âm.";
    }
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Record<string, unknown> = {
      sprayedOn,
      householdId: Number(householdId),
      pesticideId: Number(pesticideId),
      plotCode: textOrNull(plotCode),
      source: textOrNull(source),
      dose: dose.trim(),
      areaHa: parsedArea ?? 0,
      isolationDays: parseNumber(isolationDays) ?? 0,
      mrlStatus,
    };

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật nhật ký phun thuốc." : "Đã thêm nhật ký phun thuốc.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? "Sửa nhật ký phun thuốc" : "Ghi nhật ký phun thuốc"}
      onClose={save.pending ? () => undefined : onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="spray-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Lưu bản ghi"}
          </button>
        </>
      }
    >
      <form id="spray-form" onSubmit={(e) => void submit(e)} noValidate>
        <FormGrid>
          <SelectField
            label="Hộ nông dân"
            required
            value={householdId}
            onChange={setHouseholdId}
            options={householdOptions}
            placeholder="Chọn hộ"
            error={fieldErrors.householdId}
          />
          <TextField
            label="Mã thửa (plotCode)"
            value={plotCode}
            onChange={setPlotCode}
            placeholder="VD: TH-01"
            maxLength={40}
          />
        </FormGrid>

        <SelectField
          label="Thuốc BVTV sử dụng"
          required
          value={pesticideId}
          onChange={handlePesticideChange}
          options={pesticideOptions}
          placeholder="Chọn thuốc BVTV"
          error={fieldErrors.pesticideId}
        />

        <FormGrid>
          <TextField
            label="Ngày phun"
            required
            type="date"
            value={sprayedOn}
            onChange={setSprayedOn}
            error={fieldErrors.sprayedOn}
          />
          <TextField
            label="Liều lượng pha / phun"
            required
            value={dose}
            onChange={setDose}
            placeholder="20 ml / bình 25L"
            maxLength={100}
            error={fieldErrors.dose}
          />
        </FormGrid>

        <FormGrid>
          <NumberField
            label="Diện tích phun (ha)"
            required
            value={areaHa}
            onChange={setAreaHa}
            min={0}
            step={0.01}
            error={fieldErrors.areaHa}
          />
          <NumberField
            label="Số ngày cách ly (PHI)"
            value={isolationDays}
            onChange={setIsolationDays}
            min={0}
            step={1}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Nguồn gốc vật tư"
            value={source}
            onChange={setSource}
            maxLength={200}
          />
          <SelectField
            label="Trạng thái dư lượng (MRL)"
            value={mrlStatus}
            onChange={(val) => setMrlStatus(val as MrlStatus)}
            options={MRL_OPTIONS}
          />
        </FormGrid>

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
