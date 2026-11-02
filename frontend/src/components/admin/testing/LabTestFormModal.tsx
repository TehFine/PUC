"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { CheckboxField, FormGrid, NumberField, SelectField, TextField, type Option } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, numberText, parseNumber, requireFields, todayIso } from "@/components/admin/shared/form-utils";
import { LAB_RESULT, optionsOf } from "@/components/admin/shared/labels";
import type { LabResult, LabTestRecord } from "@/types/testing";

const RESULT_OPTIONS = optionsOf(LAB_RESULT);

export default function LabTestFormModal({
  initial,
  householdOptions,
  onClose,
  onSaved,
}: {
  initial?: LabTestRecord | null;
  householdOptions: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [code, setCode] = useState(initial?.code ?? "");
  const [householdId, setHouseholdId] = useState(
    initial?.householdId ? String(initial.householdId) : (householdOptions[0]?.value ?? ""),
  );
  const [plotCode, setPlotCode] = useState(initial?.plotCode ?? "");
  const [sampledOn, setSampledOn] = useState(dateText(initial?.sampledOn) || todayIso());
  const [cdMgKg, setCdMgKg] = useState(numberText(initial?.cdMgKg ?? 0.02));
  const [residueMgKg, setResidueMgKg] = useState(numberText(initial?.residueMgKg ?? 0.03));
  const [chlorpyrifosMgKg, setChlorpyrifosMgKg] = useState(numberText(initial?.chlorpyrifosMgKg));
  const [yellowOPositive, setYellowOPositive] = useState(Boolean(initial?.yellowOPositive));
  const [result, setResult] = useState<LabResult>(initial?.result ?? "pass");
  const [lab, setLab] = useState(initial?.lab ?? "Trung tâm Kiểm nghiệm Vùng Tây Nguyên");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<LabTestRecord>(`/testing/${initial.id}`, payload);
    return api.post<LabTestRecord>("/testing", payload);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs: Record<string, string | undefined> = requireFields(
      { code, householdId, plotCode, sampledOn, cdMgKg, residueMgKg, lab },
      {
        code: "mã mẫu",
        householdId: "hộ nông dân",
        plotCode: "mã thửa",
        sampledOn: "ngày lấy mẫu",
        cdMgKg: "hàm lượng Cadmium (Cd)",
        residueMgKg: "dư lượng thuốc BVTV",
        lab: "đơn vị kiểm nghiệm",
      },
    );

    const parsedCd = parseNumber(cdMgKg);
    if (cdMgKg.trim() && (parsedCd === undefined || parsedCd < 0)) {
      errs.cdMgKg = "Hàm lượng Cd phải là số không âm.";
    }
    const parsedResidue = parseNumber(residueMgKg);
    if (residueMgKg.trim() && (parsedResidue === undefined || parsedResidue < 0)) {
      errs.residueMgKg = "Dư lượng phải là số không âm.";
    }
    const parsedChlor = parseNumber(chlorpyrifosMgKg);
    if (chlorpyrifosMgKg.trim() && (parsedChlor === undefined || parsedChlor < 0)) {
      errs.chlorpyrifosMgKg = "Giá trị Chlorpyrifos phải là số không âm (hoặc để trống = KPH).";
    }

    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Record<string, unknown> = {
      code: code.trim(),
      householdId: Number(householdId),
      plotCode: plotCode.trim(),
      sampledOn,
      cdMgKg: parsedCd ?? 0,
      residueMgKg: parsedResidue ?? 0,
      chlorpyrifosMgKg: chlorpyrifosMgKg.trim() ? (parsedChlor ?? null) : null,
      yellowOPositive,
      result,
      lab: lab.trim(),
    };

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật phiếu kiểm nghiệm." : "Đã thêm phiếu kiểm nghiệm mới.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? `Sửa phiếu kiểm nghiệm: ${initial?.code}` : "Thêm phiếu kiểm nghiệm"}
      onClose={save.pending ? () => undefined : onClose}
      width={580}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="testing-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Lưu phiếu kiểm nghiệm"}
          </button>
        </>
      }
    >
      <form id="testing-form" onSubmit={(e) => void submit(e)} noValidate>
        <FormGrid>
          <TextField
            label="Mã mẫu kiểm nghiệm"
            required
            value={code}
            onChange={setCode}
            maxLength={40}
            error={fieldErrors.code}
          />
          <TextField
            label="Ngày lấy mẫu"
            required
            type="date"
            value={sampledOn}
            onChange={setSampledOn}
            error={fieldErrors.sampledOn}
          />
        </FormGrid>

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
            required
            value={plotCode}
            onChange={setPlotCode}
            placeholder="VD: TH-01"
            maxLength={40}
            error={fieldErrors.plotCode}
          />
        </FormGrid>

        <FormGrid>
          <NumberField
            label="Cadmium – Cd (mg/kg)"
            required
            value={cdMgKg}
            onChange={setCdMgKg}
            min={0}
            step={0.001}
            hint="Ngưỡng GACC ≤ 0.05 mg/kg"
            error={fieldErrors.cdMgKg}
          />
          <NumberField
            label="Tổng dư lượng BVTV (mg/kg)"
            required
            value={residueMgKg}
            onChange={setResidueMgKg}
            min={0}
            step={0.001}
            hint="Ngưỡng VietGAP ≤ 0.10 mg/kg"
            error={fieldErrors.residueMgKg}
          />
        </FormGrid>

        <FormGrid>
          <NumberField
            label="Chlorpyrifos (mg/kg)"
            value={chlorpyrifosMgKg}
            onChange={setChlorpyrifosMgKg}
            min={0}
            step={0.001}
            placeholder="Để trống = KPH"
            error={fieldErrors.chlorpyrifosMgKg}
          />
          <SelectField
            label="Kết luận chung"
            value={result}
            onChange={(val) => setResult(val as LabResult)}
            options={RESULT_OPTIONS}
          />
        </FormGrid>

        <TextField
          label="Đơn vị kiểm nghiệm (Lab)"
          required
          value={lab}
          onChange={setLab}
          maxLength={100}
          error={fieldErrors.lab}
        />

        <CheckboxField label="Phát hiện dương tính chất cấm Vàng O (Auramine O)" checked={yellowOPositive} onChange={setYellowOPositive} />

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
