"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, NumberField, SelectField, TextField, type Option } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { hasErrors, numberText, parseNumber, requireFields } from "@/components/admin/shared/form-utils";
import { HOUSEHOLD_STATUS, optionsOf } from "@/components/admin/shared/labels";
import type { HouseholdInput, HouseholdRow, HouseholdStatus } from "@/types/households";

const STATUS_OPTIONS = optionsOf(HOUSEHOLD_STATUS);

export default function HouseholdFormModal({
  initial,
  villageOptions,
  onClose,
  onSaved,
}: {
  initial?: HouseholdRow | null;
  villageOptions: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [cccd, setCccd] = useState(initial?.cccd ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [villageId, setVillageId] = useState(initial?.villageId ? String(initial.villageId) : (villageOptions[0]?.value ?? ""));
  const [plotCount, setPlotCount] = useState(numberText(initial?.plotCount ?? 1));
  const [areaHa, setAreaHa] = useState(numberText(initial?.areaHa ?? 0.5));
  const [status, setStatus] = useState<HouseholdStatus>(initial?.status ?? "pending");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Partial<HouseholdInput>) => {
    if (initial) {
      return api.patch<HouseholdRow>(`/households/${initial.id}`, payload);
    }
    return api.post<HouseholdRow>("/households", payload);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs: Record<string, string | undefined> = requireFields(
      { code, name, phone, villageId, ...(isEdit && cccd.includes("*") ? {} : { cccd }) },
      {
        code: "mã vùng trồng / mã hộ",
        name: "họ và tên chủ hộ",
        cccd: "số CCCD",
        phone: "số điện thoại",
        villageId: "thôn / tổ",
      },
    );

    const trimmedCccd = cccd.trim();
    const shouldSendCccd = !isEdit || !trimmedCccd.includes("*");
    if (shouldSendCccd && trimmedCccd && !/^\d{12}$/.test(trimmedCccd)) {
      errs.cccd = "CCCD phải gồm đúng 12 chữ số.";
    }
    const cleanPhone = phone.trim().replace(/[\s.-]/g, "");
    if (cleanPhone && !/^0\d{9,10}$/.test(cleanPhone)) {
      errs.phone = "Số điện thoại phải bắt đầu bằng 0 và gồm 10–11 chữ số.";
    }

    const parsedPlots = parseNumber(plotCount);
    if (plotCount.trim() && (parsedPlots === undefined || parsedPlots < 0 || !Number.isInteger(parsedPlots))) {
      errs.plotCount = "Số thửa phải là số nguyên không âm.";
    }
    const parsedArea = parseNumber(areaHa);
    if (areaHa.trim() && (parsedArea === undefined || parsedArea < 0)) {
      errs.areaHa = "Diện tích phải là số không âm.";
    }

    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Partial<HouseholdInput> = {
      code: code.trim(),
      name: name.trim(),
      phone: cleanPhone,
      villageId: Number(villageId),
      plotCount: parsedPlots ?? 0,
      areaHa: parsedArea ?? 0,
      status,
    };
    if (shouldSendCccd) {
      payload.cccd = trimmedCccd;
    }

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật thông tin hộ nông dân." : "Đã thêm hộ nông dân mới.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? `Sửa hộ: ${initial?.name}` : "Thêm hộ nông dân mới"}
      onClose={save.pending ? () => undefined : onClose}
      width={580}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="household-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Thêm hộ mới"}
          </button>
        </>
      }
    >
      <form id="household-form" onSubmit={(e) => void submit(e)} noValidate>
        <FormGrid>
          <TextField
            label="Mã vùng trồng / Mã hộ"
            required
            value={code}
            onChange={setCode}
            placeholder="VD: KB-001"
            maxLength={40}
            error={fieldErrors.code}
          />
          <TextField
            label="Họ và tên chủ hộ"
            required
            value={name}
            onChange={setName}
            placeholder="Nguyễn Văn A"
            maxLength={100}
            error={fieldErrors.name}
          />
        </FormGrid>

        <FormGrid>
          <TextField
            label="Số CCCD (12 chữ số)"
            required={!isEdit}
            value={cccd}
            onChange={setCccd}
            placeholder="260123456789"
            maxLength={12}
            inputMode="numeric"
            hint={isEdit && cccd.includes("*") ? "Giữ nguyên nếu không thay đổi CCCD." : undefined}
            error={fieldErrors.cccd}
          />
          <TextField
            label="Số điện thoại"
            required
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={setPhone}
            placeholder="0912345678"
            maxLength={11}
            error={fieldErrors.phone}
          />
        </FormGrid>

        <FormGrid>
          <SelectField
            label="Thôn / Tổ"
            required
            value={villageId}
            onChange={setVillageId}
            options={villageOptions}
            placeholder="Chọn thôn"
            error={fieldErrors.villageId}
          />
          <SelectField
            label="Trạng thái"
            value={status}
            onChange={(val) => setStatus(val as HouseholdStatus)}
            options={STATUS_OPTIONS}
          />
        </FormGrid>

        <FormGrid>
          <NumberField
            label="Số thửa canh tác"
            value={plotCount}
            onChange={setPlotCount}
            min={0}
            step={1}
            error={fieldErrors.plotCount}
          />
          <NumberField
            label="Diện tích (ha)"
            value={areaHa}
            onChange={setAreaHa}
            min={0}
            step={0.01}
            error={fieldErrors.areaHa}
          />
        </FormGrid>

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
