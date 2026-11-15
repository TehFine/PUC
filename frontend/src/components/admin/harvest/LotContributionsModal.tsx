"use client";

import { useEffect, useState } from "react";
import { formatVn, toNumber } from "@/components/admin/catalog/form-utils";
import { FormGrid, NumberField, SelectField, TextField } from "@/components/ui/form/fields";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useApi, useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type {
  HarvestContributionRecord,
  HarvestLotRecord,
  HouseholdOption,
  HouseholdPlotOption,
} from "@/types/harvest";

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
  const [plotOptions, setPlotOptions] = useState<HouseholdPlotOption[]>([]);
  const [loadingPlots, setLoadingPlots] = useState(false);
  const [plotCode, setPlotCode] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hId = Number(householdId);
    if (!hId) {
      setPlotOptions([]);
      setPlotCode("");
      return;
    }
    setLoadingPlots(true);
    api
      .get<{ data?: HouseholdPlotOption[] }>(`/harvest-plan/household-plots?householdId=${hId}`)
      .then((res) => {
        if (!active) return;
        const list = res.data ?? [];
        setPlotOptions(list);
        setPlotCode(list[0]?.plotCode ?? "");
      })
      .catch(() => {
        if (!active) return;
        setPlotOptions([]);
      })
      .finally(() => {
        if (active) setLoadingPlots(false);
      });
    return () => {
      active = false;
    };
  }, [householdId]);

  const addMutation = useMutation(async () => {
    const hId = Number(householdId);
    const wKg = toNumber(weightKg) ?? 0;
    const trimmedPlot = plotCode.trim();
    return api.post(`/harvest/${lot.id}/contributions`, {
      householdId: hId,
      ...(trimmedPlot ? { plotCode: trimmedPlot } : {}),
      weightKg: wKg,
    });
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
      toast.success("Đã ghi nhận thửa nguồn đóng góp vào lô.");
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
  const distinctHouseholds = new Set(rows.map((item) => item.householdId)).size;

  return (
    <Modal
      title={`Quan hệ Lô và Thửa nguồn - Lô ${lot.code}`}
      onClose={onClose}
      width={740}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: "var(--bg-input, #f6f8f5)", border: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>Ghi nhận hộ và thửa đất đóng góp sản lượng</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Lưu chính xác quan hệ lô hàng và thửa nguồn giúp truy vết xuôi hoặc ngược tức thì khi mẫu kiểm nghiệm phát sinh sự cố.
        </div>
        <FormGrid>
          <SelectField
            label="Hộ nông dân"
            required
            value={householdId}
            onChange={setHouseholdId}
            placeholder="— Chọn hộ dân —"
            options={households.rows.map((h) => ({
              value: String(h.id),
              label: `${h.code} - ${h.name}${h.villageName ? ` (${h.villageName})` : ""}`,
            }))}
          />
          {plotOptions.length > 0 ? (
            <SelectField
              label="Thửa đất nguồn (plotCode)"
              value={plotCode}
              onChange={setPlotCode}
              options={plotOptions.map((p) => ({
                value: p.plotCode,
                label: `${p.plotCode}${p.variety ? ` (${p.variety})` : ""}${p.zoneCode ? ` - ${p.zoneCode}` : ""}`,
              }))}
            />
          ) : (
            <TextField
              label={loadingPlots ? "Đang tải danh sách thửa…" : "Mã thửa nguồn (plotCode)"}
              value={plotCode}
              onChange={setPlotCode}
              placeholder="VD: TH1-001 (tự động chọn nếu để trống)"
              maxLength={50}
            />
          )}
          <NumberField label="Khối lượng đóng góp (kg)" required value={weightKg} onChange={setWeightKg} min={1} step={10} placeholder="VD: 1200" />
        </FormGrid>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={addMutation.pending} onClick={() => void handleAdd()}>
            {addMutation.pending ? "Đang lưu…" : "Ghi nhận vào lô"}
          </button>
        </div>
        <FormError message={localError ?? addMutation.error ?? removeMutation.error} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 13 }}>
        <span>
          Tổng nguồn cung: <strong>{distinctHouseholds} hộ ({rows.length} thửa nguồn)</strong>
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
              <th>Thửa nguồn</th>
              <th>Thôn / Tổ</th>
              <th>Khối lượng (kg)</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {contribState.loading ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  Đang tải danh sách thửa nguồn đóng góp…
                </td>
              </tr>
            ) : contribState.error ? (
              <tr>
                <td colSpan={6} className="empty-state" style={{ color: "#b73c20" }}>
                  {contribState.error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  Chưa có thửa nguồn nào được ghi nhận trong lô này.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>{item.householdCode || `#${item.householdId}`}</td>
                  <td style={{ fontWeight: 500 }}>{item.householdName || "—"}</td>
                  <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 700, color: "#166534" }}>
                    {item.plotCode || "Chưa gán thửa"}
                  </td>
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
