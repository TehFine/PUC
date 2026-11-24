"use client";

import { useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import { compact, dateInput, str, todayIso, toNumber, toText } from "@/components/admin/catalog/form-utils";
import { MultiPhotoField, StoredMediaGallery, useMultiPhotoPicker } from "@/components/portal/shared/controls";
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
  const [brandName, setBrandName] = useState(initial?.brandName ?? "");
  const [expiryOn, setExpiryOn] = useState(dateInput(initial?.expiryOn));
  const [storageCondition, setStorageCondition] = useState(initial?.storageCondition ?? "");
  const [clearExistingImage, setClearExistingImage] = useState(false);
  const productImagePicker = useMultiPhotoPicker("harvest", { maxFiles: 1, allowVideo: false });
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
    let uploadedProductImageId: number | null | undefined;
    if (productImagePicker.hasFiles) {
      const ids = await productImagePicker.ensureUploadedAll();
      uploadedProductImageId = ids[0];
    } else if (initial && clearExistingImage) {
      uploadedProductImageId = null;
    }

    const body: Record<string, unknown> = {
      ...compact({
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
      }),
      ...(initial
        ? {
            brandName: toText(brandName) ?? null,
            expiryOn: toText(expiryOn) ?? null,
            storageCondition: toText(storageCondition) ?? null,
          }
        : compact({
            brandName: toText(brandName),
            expiryOn: toText(expiryOn),
            storageCondition: toText(storageCondition),
          })),
      ...(uploadedProductImageId !== undefined ? { productImageId: uploadedProductImageId } : {}),
    };
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
    if (expiryOn && harvestedOn && expiryOn < harvestedOn) {
      return setLocalError("Hạn sử dụng không được trước ngày thu hoạch của lô hàng.");
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
        <TextField label="Địa chỉ cơ sở đóng gói" value={packhouseAddress} onChange={setPackhouseAddress} maxLength={250} placeholder="Xã, tỉnh" />
        <TextField label="Số giấy chứng nhận kiểm dịch thực vật" value={phytosanitaryCertNo} onChange={setPhytosanitaryCertNo} maxLength={80} placeholder="VD: KDTV-VN-2026-0128" />
        <TextField label="Ngày cấp giấy kiểm dịch" type="date" value={phytosanitaryIssuedOn} onChange={setPhytosanitaryIssuedOn} />
        <NumberField label="Tỷ lệ hạng A (%)" value={gradeAPct} onChange={setGradeAPct} min={0} max={100} />
        <NumberField label="Độ ngọt Brix TB (%)" value={avgBrix} onChange={setAvgBrix} min={0} max={50} />
        <TextField label="Đơn vị vận chuyển" value={transporter} onChange={setTransporter} maxLength={200} />
        <TextField label="Biển số xe lạnh" value={vehiclePlate} onChange={setVehiclePlate} maxLength={50} />
        <NumberField label="Nhiệt độ bảo quản (°C)" value={temperatureC} onChange={setTemperatureC} step={0.5} />
        <TextField
          label="Thương hiệu / Nhãn hiệu sản phẩm (NĐ 37)"
          value={brandName}
          onChange={setBrandName}
          maxLength={160}
          placeholder="VD: Sầu riêng Cư Né VietGAP"
        />
        <TextField
          label="Hạn sử dụng tốt nhất đến ngày"
          type="date"
          value={expiryOn}
          onChange={setExpiryOn}
        />
        <TextField
          label="Điều kiện bảo quản khuyến nghị"
          value={storageCondition}
          onChange={setStorageCondition}
          maxLength={240}
          placeholder="VD: Bảo quản mát 12 - 15°C, độ ẩm 85 - 90%"
        />
      </FormGrid>

      {initial?.productImageUrl && !clearExistingImage && !productImagePicker.hasFiles && (
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
              Ảnh đại diện sản phẩm đang hiển thị trên QR
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setClearExistingImage(true)}
            >
              Gỡ ảnh hiện tại
            </button>
          </div>
          <StoredMediaGallery
            urls={[initial.productImageUrl]}
            altPrefix={`Ảnh sản phẩm lô ${initial.code}`}
            compact
          />
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <MultiPhotoField
          id="harvest-lot-product-image"
          label="Ảnh sản phẩm thực tế của lô hàng (công khai theo Điều 23 NĐ 37/2026)"
          picker={productImagePicker}
          description="Chọn 1 ảnh chụp thực tế sản phẩm hoặc thùng đóng gói của lô để người tiêu dùng đối chiếu."
          cameraLabel="Chụp ảnh lô"
          galleryLabel="Chọn ảnh sản phẩm"
          disabled={pending}
        />
      </div>
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
