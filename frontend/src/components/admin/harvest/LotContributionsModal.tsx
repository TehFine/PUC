"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import { formatVn, toNumber } from "@/components/admin/catalog/form-utils";
import { FormGrid, NumberField, SelectField, TextField } from "@/components/ui/form/fields";
import { ConfirmDialog, FormError, Modal } from "@/components/ui/Modal";
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
  const { can } = useAuth();
  const canEdit = can("harvest", "update");
  const households = useApiList<HouseholdOption>(canEdit ? "households" : null);
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

  const handleHouseholdChange = (nextId: string) => {
    setHouseholdId(nextId);
    setPlotOptions([]);
    setPlotCode("");
    setLoadingPlots(Boolean(canEdit && Number(nextId)));
  };

  useEffect(() => {
    const hId = Number(householdId);
    if (!canEdit || !hId) return;
    let active = true;
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
  }, [canEdit, householdId]);

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

  const [deletingItem, setDeletingItem] = useState<HarvestContributionRecord | null>(null);

  const handleDelete = async (cid: number) => {
    if (await removeMutation.run(cid)) {
      toast.success("Đã xóa đóng góp khỏi lô.");
      setDeletingItem(null);
      await contribState.refresh();
      onChanged();
    }
  };

  const totalKg = rows.reduce((sum, item) => sum + Number(item.weightKg || 0), 0);
  const distinctHouseholds = new Set(rows.map((item) => item.householdId)).size;

  return (
    <Modal
      title={`Thửa nguồn lô ${lot.code}`}
      onClose={onClose}
      width={740}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Đóng
        </button>
      }
    >
      {canEdit && (
        <div
          style={{
            marginBottom: 16,
            paddingBottom: 16,
            borderBottom: "1px solid rgba(20, 55, 47, 0.1)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "#14372f", marginBottom: 2 }}>
            Thêm hộ đóng góp
          </div>
          <div style={{ fontSize: 12.5, color: "#5f6d66", marginBottom: 12 }}>
            Chọn hộ dân, thửa vườn và khối lượng gom vào lô.
          </div>
          <FormGrid>
            <SelectField
              label="Hộ nông dân"
              required
              value={householdId}
              onChange={handleHouseholdChange}
              placeholder="Chọn hộ dân"
              options={households.rows.map((h) => ({
                value: String(h.id),
                label: `${h.code} - ${h.name}${h.villageName ? ` (${h.villageName})` : ""}`,
              }))}
            />
            {plotOptions.length > 0 ? (
              <SelectField
                label="Thửa đất"
                value={plotCode}
                onChange={setPlotCode}
                options={plotOptions.map((p) => ({
                  value: p.plotCode,
                  label: `${p.plotCode}${p.variety ? ` (${p.variety})` : ""}${p.zoneCode ? ` - ${p.zoneCode}` : ""}`,
                }))}
              />
            ) : (
              <TextField
                label={loadingPlots ? "Đang tải thửa…" : "Mã thửa"}
                value={plotCode}
                onChange={setPlotCode}
                placeholder="Tự chọn nếu để trống"
                maxLength={50}
              />
            )}
            <NumberField
              label="Khối lượng (kg)"
              required
              value={weightKg}
              onChange={setWeightKg}
              min={1}
              step={10}
              placeholder="VD: 1200"
            />
          </FormGrid>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={addMutation.pending}
              onClick={() => void handleAdd()}
            >
              {addMutation.pending ? "Đang lưu…" : "Thêm vào lô"}
            </button>
          </div>
          <FormError message={localError ?? addMutation.error ?? removeMutation.error} />
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>
          Nguồn thu mua: <strong>{distinctHouseholds} hộ ({rows.length} thửa)</strong>
        </span>
        <span>
          Tổng cộng: <strong>{formatVn(totalKg, 1)} kg</strong>
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã hộ</th>
              <th>Chủ hộ</th>
              <th>Mã thửa</th>
              <th>Thôn</th>
              <th>Khối lượng</th>
              {canEdit && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            <ListStatusRow
              colSpan={canEdit ? 6 : 5}
              loading={contribState.loading}
              error={contribState.error}
              empty={!contribState.loading && !contribState.error && rows.length === 0}
              emptyText="Chưa có hộ đóng góp nào trong lô này."
            />
            {!contribState.loading &&
              !contribState.error &&
              rows.map((item) => (
                <tr key={item.id}>
                  <td
                    style={{
                      fontFamily: "var(--font-num-stack)",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    {item.householdCode || `#${item.householdId}`}
                  </td>
                  <td style={{ fontWeight: 500 }}>{item.householdName || "-"}</td>
                  <td
                    style={{
                      fontFamily: "var(--font-num-stack)",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "#166534",
                    }}
                  >
                    {item.plotCode || "Chưa gán thửa"}
                  </td>
                  <td>{item.villageName || "-"}</td>
                  <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {formatVn(Number(item.weightKg), 1)} kg
                  </td>
                  {canEdit && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={removeMutation.pending}
                        onClick={() => setDeletingItem(item)}
                      >
                        Xóa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {deletingItem && (
        <ConfirmDialog
          title="Xóa đóng góp sản lượng"
          message={
            <>
              Xác nhận xóa khoản đóng góp{" "}
              <strong>{formatVn(Number(deletingItem.weightKg), 1)} kg</strong> của hộ{" "}
              <strong>{deletingItem.householdName || deletingItem.householdCode || `#${deletingItem.householdId}`}</strong> khỏi lô{" "}
              <strong>{lot.code}</strong>?
            </>
          }
          confirmLabel="Xóa"
          danger
          pending={removeMutation.pending}
          error={removeMutation.error}
          onConfirm={() => void handleDelete(deletingItem.id)}
          onClose={() => {
            if (!removeMutation.pending) setDeletingItem(null);
          }}
        />
      )}
    </Modal>
  );
}
