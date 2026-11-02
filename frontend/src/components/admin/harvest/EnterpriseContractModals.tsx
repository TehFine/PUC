"use client";

import { useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import { compact, dateInput, str, todayIso, toNumber, toText } from "@/components/admin/catalog/form-utils";
import { FormGrid, NumberField, SelectField, TextAreaField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { ContractRecord, EnterpriseRecord } from "@/types/harvest";

export function EnterpriseFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: EnterpriseRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [taxCode, setTaxCode] = useState(initial?.taxCode ?? "");
  const [representative, setRepresentative] = useState(initial?.representative ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [packhouseCode, setPackhouseCode] = useState(initial?.packhouseCode ?? "VN-DLPH-0089");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(initial?.status ?? "active");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const body = compact({
      code: code.trim(),
      name: name.trim(),
      taxCode: toText(taxCode),
      representative: toText(representative),
      phone: toText(phone),
      packhouseCode: toText(packhouseCode),
      address: toText(address),
      status,
    });
    return initial ? api.patch(`/enterprises/${initial.id}`, body) : api.post("/enterprises", body);
  });

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      return setLocalError("Vui lòng nhập mã doanh nghiệp và tên doanh nghiệp.");
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật doanh nghiệp." : "Đã thêm doanh nghiệp đối tác.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa doanh nghiệp: ${initial.name}` : "Thêm doanh nghiệp & Nhà đóng gói"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      width={620}
    >
      <FormGrid>
        <TextField label="Mã doanh nghiệp" required value={code} onChange={setCode} maxLength={40} placeholder="VD: DN-004" />
        <TextField label="Tên doanh nghiệp" required value={name} onChange={setName} maxLength={200} />
        <TextField label="Mã số thuế" value={taxCode} onChange={setTaxCode} maxLength={40} />
        <TextField label="Người đại diện" value={representative} onChange={setRepresentative} maxLength={100} />
        <TextField label="Điện thoại" type="tel" value={phone} onChange={setPhone} maxLength={30} />
        <TextField label="Mã cơ sở đóng gói (PHC)" value={packhouseCode} onChange={setPackhouseCode} maxLength={50} />
        <SelectField
          label="Trạng thái"
          value={status}
          onChange={(v) => setStatus(v as "active" | "inactive")}
          options={[
            { value: "active", label: "Đang hoạt động" },
            { value: "inactive", label: "Ngừng hoạt động" },
          ]}
        />
      </FormGrid>
      <TextField label="Địa chỉ cơ sở" value={address} onChange={setAddress} maxLength={300} />
    </FormModal>
  );
}

export function ContractFormModal({
  initial,
  enterprises,
  onClose,
  onSaved,
}: {
  initial: ContractRecord | null;
  enterprises: EnterpriseRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [enterpriseId, setEnterpriseId] = useState(str(initial?.enterpriseId ?? enterprises[0]?.id ?? ""));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [signedOn, setSignedOn] = useState(dateInput(initial?.signedOn) || todayIso());
  const [validUntil, setValidUntil] = useState(dateInput(initial?.validUntil) || todayIso());
  const [targetTons, setTargetTons] = useState(str(initial?.targetTons ?? 100));
  const [priceGuarantee, setPriceGuarantee] = useState(initial?.priceGuarantee ?? "");
  const [market, setMarket] = useState(initial?.market ?? "Trung Quốc");
  const [status, setStatus] = useState<"active" | "completed" | "expired">(initial?.status ?? "active");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const body = compact({
      code: code.trim(),
      enterpriseId: Number(enterpriseId),
      title: title.trim(),
      signedOn,
      validUntil,
      targetTons: toNumber(targetTons),
      priceGuarantee: toText(priceGuarantee),
      market: toText(market),
      status,
      notes: toText(notes),
    });
    return initial ? api.patch(`/contracts/${initial.id}`, body) : api.post("/contracts", body);
  });

  const submit = async () => {
    if (!code.trim() || !enterpriseId || !title.trim() || !signedOn || !validUntil) {
      return setLocalError("Vui lòng nhập đầy đủ số hợp đồng, doanh nghiệp, tiêu đề và thời hạn.");
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật hợp đồng bao tiêu." : "Đã thêm hợp đồng bao tiêu.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa hợp đồng: ${initial.code}` : "Thêm hợp đồng bao tiêu"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      width={640}
    >
      <FormGrid>
        <TextField label="Số hợp đồng" required value={code} onChange={setCode} maxLength={50} />
        <SelectField
          label="Doanh nghiệp đối tác"
          required
          value={enterpriseId}
          onChange={setEnterpriseId}
          placeholder="— Chọn doanh nghiệp —"
          options={enterprises.map((e) => ({ value: String(e.id), label: `${e.code} – ${e.name}` }))}
        />
        <TextField label="Ngày ký" type="date" required value={signedOn} onChange={setSignedOn} />
        <TextField label="Hiệu lực đến" type="date" required value={validUntil} onChange={setValidUntil} />
        <NumberField label="Sản lượng cam kết (tấn)" value={targetTons} onChange={setTargetTons} min={0} step={1} />
        <TextField label="Đơn giá bảo hiểm / thỏa thuận" value={priceGuarantee} onChange={setPriceGuarantee} placeholder="VD: Sàn 65.000đ/kg" />
        <TextField label="Thị trường mục tiêu" value={market} onChange={setMarket} placeholder="VD: Trung Quốc" />
        <SelectField
          label="Trạng thái"
          value={status}
          onChange={(v) => setStatus(v as "active" | "completed" | "expired")}
          options={[
            { value: "active", label: "Đang hiệu lực" },
            { value: "completed", label: "Đã hoàn thành" },
            { value: "expired", label: "Hết hạn" },
          ]}
        />
      </FormGrid>
      <TextField label="Tên hợp đồng & Nội dung chính" required value={title} onChange={setTitle} maxLength={250} />
      <TextAreaField label="Ghi chú điều khoản" value={notes} onChange={setNotes} rows={2} maxLength={500} />
    </FormModal>
  );
}
