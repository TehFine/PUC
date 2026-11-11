"use client";

import { useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import { toNumber, toText } from "@/components/admin/catalog/form-utils";
import { FormGrid, NumberField, SelectField, TextAreaField, TextField } from "@/components/ui/form/fields";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useApi, useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { FarmerStampRecord, HouseholdOption, StampAllocationRecord } from "@/types/harvest";
import { isSafeMediaUrl } from "@/utils/url-safety";

export function StampAllocationModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const households = useApiList<HouseholdOption>("households");
  const [householdId, setHouseholdId] = useState("");
  const [plotCode, setPlotCode] = useState("");
  const [season, setSeason] = useState(`Vụ ${new Date().getFullYear()}`);
  const [quantity, setQuantity] = useState("100");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const qty = toNumber(quantity) ?? 0;
    return api.post("/stamp-allocations", {
      householdId: Number(householdId),
      plotCode: toText(plotCode),
      season: season.trim(),
      quantity: qty,
      notes: toText(notes),
    });
  });

  const submit = async () => {
    const hId = Number(householdId);
    const qty = toNumber(quantity);
    if (!hId) return setLocalError("Vui lòng chọn hộ nông dân nhận tem.");
    if (!season.trim()) return setLocalError("Vui lòng nhập vụ mùa cấp phát.");
    if (qty === undefined || !Number.isInteger(qty) || qty < 1 || qty > 5000) {
      return setLocalError("Số lượng tem cấp phát phải là số nguyên từ 1 đến 5.000.");
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success("Đã cấp phát dải tem mới cho nông hộ.");
      onSaved();
    }
  };

  return (
    <FormModal
      title="Cấp phát dải tem nông hộ"
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      submitLabel="Cấp phát tem"
      width={580}
    >
      <FormGrid>
        <SelectField
          label="Hộ nông dân"
          required
          value={householdId}
          onChange={setHouseholdId}
          placeholder="— Chọn hộ dân —"
          options={households.rows.map((h) => ({
            value: String(h.id),
            label: `${h.code} – ${h.name}${h.villageName ? ` (${h.villageName})` : ""}`,
          }))}
        />
        <TextField label="Mã thửa (tùy chọn)" value={plotCode} onChange={setPlotCode} maxLength={50} placeholder="VD: KB-T1-01" />
        <TextField label="Vụ mùa" required value={season} onChange={setSeason} maxLength={50} placeholder="VD: Vụ 2026" />
        <NumberField label="Số lượng tem (1 – 5.000)" required value={quantity} onChange={setQuantity} min={1} max={5000} step={1} />
      </FormGrid>
      <TextAreaField label="Ghi chú cấp phát" value={notes} onChange={setNotes} rows={2} maxLength={500} />
    </FormModal>
  );
}

export function StampListModal({
  allocation,
  onClose,
}: {
  allocation: StampAllocationRecord;
  onClose: () => void;
}) {
  const state = useApi<{ data?: FarmerStampRecord[]; stamps?: FarmerStampRecord[] } | FarmerStampRecord[]>(
    `/stamp-allocations/${allocation.id}/stamps`,
  );
  const stamps: FarmerStampRecord[] = Array.isArray(state.data)
    ? state.data
    : (state.data?.data ?? state.data?.stamps ?? []);

  return (
    <Modal
      title={`Danh sách tem – Đợt ${allocation.allocationCode}`}
      onClose={onClose}
      width={720}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12, fontSize: 13 }}>
        <span>
          Hộ nhận: <strong>{allocation.householdName || allocation.householdCode}</strong>
        </span>
        <span>
          Dải mã: <code>{allocation.fromSerial}</code> → <code>{allocation.toSerial}</code>
        </span>
        <span>
          Đã kích hoạt: <strong>{allocation.activatedCount}/{allocation.quantityAllocated}</strong>
        </span>
      </div>
      <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Mã Serial</th>
              <th>Thửa</th>
              <th>Hạng</th>
              <th>Khối lượng</th>
              <th>Ngày kích hoạt</th>
              <th>Ảnh</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {state.loading ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  Đang tải danh sách tem…
                </td>
              </tr>
            ) : state.error ? (
              <tr>
                <td colSpan={7} className="empty-state" style={{ color: "#b73c20" }}>
                  {state.error}
                </td>
              </tr>
            ) : stamps.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  Không có dữ liệu tem.
                </td>
              </tr>
            ) : (
              stamps.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 700 }}>{s.serialCode}</td>
                  <td>{s.plotCode || "—"}</td>
                  <td>{s.grade ? `Hạng ${s.grade}` : "—"}</td>
                  <td>{s.fruitWeightKg ? `${s.fruitWeightKg} kg` : "—"}</td>
                  <td style={{ fontSize: 12 }}>{s.activatedAt ? s.activatedAt.slice(0, 10) : "—"}</td>
                  <td>
                    {isSafeMediaUrl(s.photoUrl) ? (
                      <a href={s.photoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                        Xem ảnh
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        s.status === "activated" ? "badge-green" : s.status === "revoked" ? "badge-red" : "badge-gold"
                      }`}
                    >
                      {s.status === "activated" ? "Đã kích hoạt" : s.status === "revoked" ? "Thu hồi" : "Chưa dán"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
