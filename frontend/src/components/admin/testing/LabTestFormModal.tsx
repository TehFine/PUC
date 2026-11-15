"use client";

import { type ChangeEvent, useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { CheckboxField, FormGrid, NumberField, SelectField, TextField, type Option } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, numberText, parseNumber, requireFields, todayIso } from "@/components/admin/shared/form-utils";
import { LAB_RESULT, optionsOf } from "@/components/admin/shared/labels";
import type { LabRecordStatus, LabResult, LabTestRecord } from "@/types/testing";

const RESULT_OPTIONS = optionsOf(LAB_RESULT);
const RECORD_STATUS_OPTIONS: Option[] = [
  { value: "verified", label: "Đã kiểm chứng (hiển thị trên QR công khai)" },
  { value: "draft", label: "Bản nháp nội bộ (ẩn trên QR công khai)" },
];

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
  const [recordStatus, setRecordStatus] = useState<LabRecordStatus>(initial?.recordStatus ?? "verified");
  const [lab, setLab] = useState(initial?.lab ?? "Trung tâm Kiểm nghiệm Vùng Tây Nguyên");
  const [scanAttachmentId, setScanAttachmentId] = useState<number | null>(initial?.scanAttachmentId ?? null);
  const [scanUrl, setScanUrl] = useState<string | null>(initial?.scanUrl ?? null);
  const [uploadingScan, setUploadingScan] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<LabTestRecord>(`/testing/${initial.id}`, payload);
    return api.post<LabTestRecord>("/testing", payload);
  });

  const handleScanPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingScan) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Tệp scan phiếu kiểm nghiệm không được vượt quá 10 MB.");
      return;
    }
    setUploadingScan(true);
    setUploadError(null);
    try {
      const uploaded = await api.upload(file, "lab");
      setScanAttachmentId(uploaded.id);
      setScanUrl(`/api/public/files/${uploaded.id}`);
      toast.success("Đã tải lên bản scan giấy kiểm nghiệm.");
    } catch (err) {
      setUploadError(errorMessage(err, "Không thể tải tệp scan lên máy chủ."));
    } finally {
      setUploadingScan(false);
    }
  };

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
      recordStatus,
      lab: lab.trim(),
      scanAttachmentId,
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
      onClose={save.pending || uploadingScan ? () => undefined : onClose}
      width={600}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending || uploadingScan}>
            Hủy
          </button>
          <button type="submit" form="testing-form" className="btn btn-primary" disabled={save.pending || uploadingScan}>
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
            label="Cadmium - Cd (mg/kg)"
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

        <FormGrid>
          <TextField
            label="Đơn vị kiểm nghiệm (Lab)"
            required
            value={lab}
            onChange={setLab}
            maxLength={100}
            error={fieldErrors.lab}
          />
          <SelectField
            label="Trạng thái kiểm chứng dữ liệu"
            value={recordStatus}
            onChange={(val) => setRecordStatus(val as LabRecordStatus)}
            options={RECORD_STATUS_OPTIONS}
          />
        </FormGrid>

        <div className="form-group">
          <label>Bản scan giấy kiểm nghiệm gốc (PDF, JPG, PNG - hiển thị trên QR công khai)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <label className="btn btn-outline btn-sm" style={{ cursor: uploadingScan ? "wait" : "pointer", margin: 0 }}>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => void handleScanPick(e)}
                disabled={uploadingScan}
                style={{ display: "none" }}
              />
              {uploadingScan ? "Đang tải lên…" : scanUrl ? "Đổi tệp scan" : "Tải tệp scan lên"}
            </label>
            {scanUrl && (
              <>
                <a
                  href={scanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                  style={{ textDecoration: "none" }}
                >
                  Xem bản scan đã gắn
                </a>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    setScanAttachmentId(null);
                    setScanUrl(null);
                  }}
                >
                  Gỡ tệp
                </button>
              </>
            )}
          </div>
          {uploadError && (
            <small role="alert" style={{ display: "block", marginTop: 5, color: "#b73c20", fontSize: 12 }}>
              {uploadError}
            </small>
          )}
        </div>

        <CheckboxField label="Phát hiện dương tính chất cấm Vàng O (Auramine O)" checked={yellowOPositive} onChange={setYellowOPositive} />

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
