"use client";

import { useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import { compact, dateInput, str, todayIso, toNumber, toText } from "@/components/admin/catalog/form-utils";
import { FormGrid, NumberField, SelectField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { ContractRecord, EnterpriseRecord, HarvestLotRecord, HarvestLotStatus } from "@/types/harvest";

export const LOT_STATUS_LABELS: Record<HarvestLotStatus, { label: string; badge: string }> = {
  exported: { label: "Đã xuất khẩu", badge: "badge-green" },
  delivered: { label: "Đã giao hàng", badge: "badge-blue" },
  in_transit: { label: "Đang vận chuyển", badge: "badge-gold" },
  sampling: { label: "Đang lấy mẫu", badge: "badge-red" },
};

const MARKET_SUGGESTIONS = ["Trung Quốc", "Nội địa", "Nhật Bản", "Hàn Quốc", "EU"];

export default function HarvestLotFormModal({
  initial,
  enterprises,
  contracts,
  onClose,
  onSaved,
}: {
  initial: HarvestLotRecord | null;
  enterprises: EnterpriseRecord[];
  contracts: ContractRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [harvestedOn, setHarvestedOn] = useState(dateInput(initial?.harvestedOn) || todayIso());
  const [weightTons, setWeightTons] = useState(str(initial?.weightTons ?? ""));
  const [enterpriseId, setEnterpriseId] = useState(str(initial?.enterpriseId));
  const [contractId, setContractId] = useState(str(initial?.contractId));
  const [buyer, setBuyer] = useState(initial?.buyer ?? "");
  const [market, setMarket] = useState(initial?.market ?? "Trung Quốc");
  const [status, setStatus] = useState<HarvestLotStatus>(initial?.status ?? "sampling");
  const [packhouseCode, setPackhouseCode] = useState(initial?.packhouseCode ?? "VN-DLPH-0089");
  const [qrCode, setQrCode] = useState(initial?.qrCode ?? "");
  const [gradeAPct, setGradeAPct] = useState(str(initial?.gradeAPct));
  const [avgBrix, setAvgBrix] = useState(str(initial?.avgBrix));
  const [transporter, setTransporter] = useState(initial?.transporter ?? "");
  const [vehiclePlate, setVehiclePlate] = useState(initial?.vehiclePlate ?? "");
  const [temperatureC, setTemperatureC] = useState(str(initial?.temperatureC));
  const [localError, setLocalError] = useState<string | null>(null);

  const handleEnterpriseChange = (val: string) => {
    setEnterpriseId(val);
    const found = enterprises.find((e) => String(e.id) === val);
    if (found) {
      if (!buyer.trim()) setBuyer(found.name);
      if (found.packhouseCode) setPackhouseCode(found.packhouseCode);
    }
  };

  const { run, pending, error } = useMutation(async () => {
    const wTons = toNumber(weightTons) ?? 0;
    const body = compact({
      code: code.trim(),
      harvestedOn,
      weightTons: wTons,
      buyer: buyer.trim(),
      market: market.trim(),
      status,
      qrCode: toText(qrCode) ?? code.trim(),
      enterpriseId: toNumber(enterpriseId),
      contractId: toNumber(contractId),
      packhouseCode: toText(packhouseCode),
      gradeAPct: toNumber(gradeAPct),
      avgBrix: toNumber(avgBrix),
      transporter: toText(transporter),
      vehiclePlate: toText(vehiclePlate),
      temperatureC: toNumber(temperatureC),
    });
    return initial ? api.patch(`/harvest/${initial.id}`, body) : api.post("/harvest", body);
  });

  const submit = async () => {
    const wTons = toNumber(weightTons);
    if (!code.trim() || !harvestedOn || !buyer.trim() || !market.trim()) {
      return setLocalError("Vui lòng nhập mã lô, ngày thu hoạch, đơn vị thu mua và thị trường.");
    }
    if (wTons === undefined || Number.isNaN(wTons) || wTons <= 0) {
      return setLocalError("Khối lượng lô (tấn) phải lớn hơn 0.");
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật lô thu hoạch." : "Đã tạo lô thu hoạch mới.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa lô hàng: ${initial.code}` : "Tạo lô thu hoạch mới"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      width={680}
    >
      <FormGrid>
        <TextField label="Mã lô hàng" required value={code} onChange={setCode} maxLength={40} placeholder="VD: LO-2026-009" />
        <TextField label="Ngày thu hoạch" type="date" required value={harvestedOn} onChange={setHarvestedOn} />
        <NumberField label="Khối lượng (tấn)" required value={weightTons} onChange={setWeightTons} min={0.1} step={0.1} placeholder="VD: 18.5" />
        <SelectField
          label="Trạng thái lô"
          required
          value={status}
          onChange={(v) => setStatus(v as HarvestLotStatus)}
          options={Object.entries(LOT_STATUS_LABELS).map(([value, info]) => ({ value, label: info.label }))}
        />
        <SelectField
          label="Doanh nghiệp liên kết"
          value={enterpriseId}
          onChange={handleEnterpriseChange}
          placeholder="— Chọn doanh nghiệp (tùy chọn) —"
          options={enterprises.map((e) => ({ value: String(e.id), label: `${e.code} – ${e.name}` }))}
        />
        <SelectField
          label="Hợp đồng bao tiêu"
          value={contractId}
          onChange={setContractId}
          placeholder="— Chọn hợp đồng (tùy chọn) —"
          options={contracts.map((c) => ({ value: String(c.id), label: `${c.code} – ${c.title}` }))}
        />
        <TextField label="Đơn vị thu mua" required value={buyer} onChange={setBuyer} maxLength={200} />
        <SelectField
          label="Thị trường"
          required
          value={market}
          onChange={setMarket}
          options={MARKET_SUGGESTIONS.map((m) => ({ value: m, label: m }))}
        />
        <TextField label="Mã nhà đóng gói (PHC)" value={packhouseCode} onChange={setPackhouseCode} maxLength={50} />
        <TextField label="Mã QR Lô" value={qrCode} onChange={setQrCode} maxLength={100} placeholder="Mặc định lấy theo mã lô" />
        <NumberField label="Tỷ lệ hạng A (%)" value={gradeAPct} onChange={setGradeAPct} min={0} max={100} />
        <NumberField label="Độ ngọt Brix TB (%)" value={avgBrix} onChange={setAvgBrix} min={0} max={50} />
        <TextField label="Đơn vị vận chuyển" value={transporter} onChange={setTransporter} maxLength={200} />
        <TextField label="Biển số xe lạnh" value={vehiclePlate} onChange={setVehiclePlate} maxLength={50} />
        <NumberField label="Nhiệt độ bảo quản (°C)" value={temperatureC} onChange={setTemperatureC} step={0.5} />
      </FormGrid>
    </FormModal>
  );
}
