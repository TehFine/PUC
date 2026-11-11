"use client";

import { useState } from "react";
import { formatVn, toNumber } from "@/components/admin/catalog/form-utils";
import { FormGrid, NumberField, SelectField } from "@/components/ui/form/fields";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useApi, useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { HarvestContributionRecord, HarvestLotRecord, HouseholdOption } from "@/types/harvest";

export default function LotContributionsModal({
  lot,
  onClose,
  onChanged,
}: {
  lot: HarvestLotRecord;
  onClose: () => void;
  onChanged: () => void;
}) {
  const households = useApiList<HouseholdOption>("households");
  const contribState = useApi<{ data?: HarvestContributionRecord[] } | HarvestContributionRecord[]>(
    `/harvest/${lot.id}/contributions`,
  );
  const rows: HarvestContributionRecord[] = Array.isArray(contribState.data)
    ? contribState.data
    : (contribState.data?.data ?? []);

  const [householdId, setHouseholdId] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const addMutation = useMutation(async () => {
    const hId = Number(householdId);
    const wKg = toNumber(weightKg) ?? 0;
    return api.post(`/harvest/${lot.id}/contributions`, { householdId: hId, weightKg: wKg });
  });

  const removeMutation = useMutation(async (cid: number) => {
    await api.delete(`/harvest/${lot.id}/contributions/${cid}`);
    return true;
  });

  const handleAdd = async () => {
    const hId = Number(householdId);
    const wKg = toNumber(weightKg);
    if (!hId) return setLocalError("Vui lòng chọn hộ nông dân đóng góp.");
    if (wKg === undefined || Number.isNaN(wKg) || wKg <= 0) {
      return setLocalError("Khối lượng đóng góp (kg) phải lớn hơn 0.");
    }
    setLocalError(null);
    if ((await addMutation.run()) !== undefined) {
      toast.success("Đã cập nhật hộ đóng góp vào lô.");
      setWeightKg("");
      await contribState.refresh();
      onChanged();
    }
  };

  const handleDelete = async (cid: number) => {
    if (await removeMutation.run(cid)) {
      toast.success("Đã xóa đóng góp khỏi lô.");
      await contribState.refresh();
      onChanged();
    }
  };

  const totalKg = rows.reduce((sum, item) => sum + Number(item.weightKg || 0), 0);

  return (
    <Modal
      title={`Hộ đóng góp sản lượng – Lô ${lot.code}`}
      onClose={onClose}
      width={680}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: "var(--bg-input, #f6f8f5)", border: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}>Thêm / cập nhật hộ đóng góp</div>
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
          <NumberField label="Khối lượng đóng góp (kg)" required value={weightKg} onChange={setWeightKg} min={1} step={10} placeholder="VD: 1200" />
        </FormGrid>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={addMutation.pending} onClick={() => void handleAdd()}>
            {addMutation.pending ? "Đang lưu…" : "Ghi nhận đóng góp"}
          </button>
        </div>
        <FormError message={localError ?? addMutation.error ?? removeMutation.error} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 13 }}>
        <span>
          Số hộ tham gia: <strong>{rows.length} hộ</strong>
        </span>
        <span>
          Tổng khối lượng gom: <strong>{formatVn(totalKg, 1)} kg</strong>
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã hộ</th>
              <th>Chủ hộ</th>
              <th>Thôn / Tổ</th>
              <th>Khối lượng (kg)</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {contribState.loading ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  Đang tải danh sách hộ đóng góp…
                </td>
              </tr>
            ) : contribState.error ? (
              <tr>
                <td colSpan={5} className="empty-state" style={{ color: "#b73c20" }}>
                  {contribState.error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  Chưa có hộ nào được ghi nhận trong lô này.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>{item.householdCode || `#${item.householdId}`}</td>
                  <td style={{ fontWeight: 500 }}>{item.householdName || "—"}</td>
                  <td>{item.villageName || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{formatVn(Number(item.weightKg), 1)} kg</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={removeMutation.pending}
                      onClick={() => void handleDelete(item.id)}
                    >
                      Xóa
                    </button>
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
