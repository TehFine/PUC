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
  sampling: { label: "Đang lấy mẫu", badge: "badge-gold" },
  revoked: { label: "Đã thu hồi", badge: "badge-red" },
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
  const [variety, setVariety] = useState(initial?.variety ?? "Ri6 & Monthong (Dona)");
  const [harvestedOn, setHarvestedOn] = useState(dateInput(initial?.harvestedOn) || todayIso());
  const [packedOn, setPackedOn] = useState(dateInput(initial?.packedOn));
  const [exportedOn, setExportedOn] = useState(dateInput(initial?.exportedOn));
  const [weightTons, setWeightTons] = useState(str(initial?.weightTons ?? ""));
  const [enterpriseId, setEnterpriseId] = useState(str(initial?.enterpriseId));
  const [contractId, setContractId] = useState(str(initial?.contractId));
  const [buyer, setBuyer] = useState(initial?.buyer ?? "");
  const [market, setMarket] = useState(initial?.market ?? "Trung Quốc");
  const [status, setStatus] = useState<HarvestLotStatus>(initial?.status ?? "sampling");
  const [revokedReason, setRevokedReason] = useState(initial?.revokedReason ?? "");
  const [packhouseCode, setPackhouseCode] = useState(initial?.packhouseCode ?? "VN-DLPH-0089");
  const [packhouseName, setPackhouseName] = useState(initial?.packhouseName ?? "");
  const [packhouseAddress, setPackhouseAddress] = useState(initial?.packhouseAddress ?? "");
  const [phytosanitaryCertNo, setPhytosanitaryCertNo] = useState(initial?.phytosanitaryCertNo ?? "");
  const [phytosanitaryIssuedOn, setPhytosanitaryIssuedOn] = useState(dateInput(initial?.phytosanitaryIssuedOn));
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
      if (!packhouseName.trim()) setPackhouseName(found.name);
      if (!packhouseAddress.trim() && found.address) setPackhouseAddress(found.address);
    }
  };

  const { run, pending, error } = useMutation(async () => {
    const wTons = toNumber(weightTons) ?? 0;
    const body = compact({
      code: code.trim(),
      variety: toText(variety),
      harvestedOn,
      packedOn: toText(packedOn),
      exportedOn: toText(exportedOn),
      weightTons: wTons,
      buyer: buyer.trim(),
      market: market.trim(),
      status,
      revokedReason: status === "revoked" ? toText(revokedReason) : undefined,
      qrCode: toText(qrCode) ?? code.trim(),
      enterpriseId: toNumber(enterpriseId),
      contractId: toNumber(contractId),
      packhouseCode: toText(packhouseCode),
      packhouseName: toText(packhouseName),
      packhouseAddress: toText(packhouseAddress),
      phytosanitaryCertNo: toText(phytosanitaryCertNo),
      phytosanitaryIssuedOn: toText(phytosanitaryIssuedOn),
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
      width={720}
    >
      <FormGrid>
        <TextField label="Mã lô hàng" required value={code} onChange={setCode} maxLength={40} placeholder="VD: LO-2026-009" />
        <TextField label="Giống sầu riêng" value={variety} onChange={setVariety} maxLength={120} placeholder="VD: Ri6, Monthong (Dona)" />
        <NumberField label="Khối lượng (tấn)" required value={weightTons} onChange={setWeightTons} min={0.1} step={0.1} placeholder="VD: 18.5" />
        <SelectField
          label="Trạng thái lô (cập nhật / thu hồi từ server)"
          required
          value={status}
          onChange={(v) => setStatus(v as HarvestLotStatus)}
          options={Object.entries(LOT_STATUS_LABELS).map(([value, info]) => ({ value, label: info.label }))}
        />
        <TextField label="Ngày thu hoạch" type="date" required value={harvestedOn} onChange={setHarvestedOn} />
        <TextField label="Ngày sơ chế / đóng gói" type="date" value={packedOn} onChange={setPackedOn} />
        <TextField label="Ngày xuất lô / thông quan" type="date" value={exportedOn} onChange={setExportedOn} />
        <TextField label="Mã QR Lô" value={qrCode} onChange={setQrCode} maxLength={100} placeholder="Mặc định lấy theo mã lô" />
        <SelectField
          label="Doanh nghiệp / Cơ sở đóng gói liên kết"
          value={enterpriseId}
          onChange={handleEnterpriseChange}
          placeholder="— Chọn doanh nghiệp (tùy chọn) —"
          options={enterprises.map((e) => ({ value: String(e.id), label: `${e.code} – ${e.name}` }))}
        />
        <SelectField
          label="Hợp đồng bao tiêu (chỉ lưu nội bộ)"
          value={contractId}
          onChange={setContractId}
          placeholder="— Chọn hợp đồng (tùy chọn) —"
          options={contracts.map((c) => ({ value: String(c.id), label: `${c.code} – ${c.title}` }))}
        />
        <TextField label="Đơn vị thu mua thương mại (ẩn khỏi QR công khai)" required value={buyer} onChange={setBuyer} maxLength={200} />
        <SelectField
          label="Thị trường"
          required
          value={market}
          onChange={setMarket}
          options={MARKET_SUGGESTIONS.map((m) => ({ value: m, label: m }))}
        />
        <TextField label="Mã số cơ sở đóng gói (PHC)" value={packhouseCode} onChange={setPackhouseCode} maxLength={50} />
        <TextField label="Tên cơ sở đóng gói hiển thị QR" value={packhouseName} onChange={setPackhouseName} maxLength={200} placeholder="Mặc định theo CSĐG liên kết" />
        <TextField label="Địa chỉ cơ sở đóng gói" value={packhouseAddress} onChange={setPackhouseAddress} maxLength={250} placeholder="Xã, huyện, tỉnh" />
        <TextField label="Số giấy chứng nhận kiểm dịch thực vật" value={phytosanitaryCertNo} onChange={setPhytosanitaryCertNo} maxLength={80} placeholder="VD: KDTV-VN-2026-0128" />
        <TextField label="Ngày cấp giấy kiểm dịch" type="date" value={phytosanitaryIssuedOn} onChange={setPhytosanitaryIssuedOn} />
        <NumberField label="Tỷ lệ hạng A (%)" value={gradeAPct} onChange={setGradeAPct} min={0} max={100} />
        <NumberField label="Độ ngọt Brix TB (%)" value={avgBrix} onChange={setAvgBrix} min={0} max={50} />
        <TextField label="Đơn vị vận chuyển" value={transporter} onChange={setTransporter} maxLength={200} />
        <TextField label="Biển số xe lạnh" value={vehiclePlate} onChange={setVehiclePlate} maxLength={50} />
        <NumberField label="Nhiệt độ bảo quản (°C)" value={temperatureC} onChange={setTemperatureC} step={0.5} />
      </FormGrid>
      {status === "revoked" && (
        <TextField
          label="Lý do thu hồi lô hàng (hiển thị cảnh báo khi quét QR)"
          value={revokedReason}
          onChange={setRevokedReason}
          maxLength={300}
          placeholder="VD: Thu hồi rà soát niêm phong thùng hoặc kiểm tra lại mẫu lưu"
        />
      )}
    </FormModal>
  );
}
