"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { QrCode } from "@/components/ui/PublicIcon";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import { useDebounced } from "@/components/admin/shared/use-debounced";
import { dateText, hasErrors, numberText, parseNumber, requireFields, todayIso } from "@/components/admin/shared/form-utils";
import { useHouseholdOptions } from "@/components/admin/shared/options";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, NumberField, SelectField, TextField } from "@/components/ui/form/fields";
import { useApi, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { PlotSeasonQuotaDto } from "@/types/api";
import type { PortalPlot } from "@/types/portal";

const GardenSignboardModal = dynamic(() => import("@/components/portal/GardenSignboardModal"), {
  ssr: false,
});

interface PlotQuotasResponse {
  seasonYear: number;
  summary: {
    plotCount: number;
    totalMaxQuotaKg: number;
    totalUsedKg: number;
    totalRemainingKg: number;
    utilizationPct: number;
  };
  data: PlotSeasonQuotaDto[];
}

export default function PlotQuotasModal({
  canEdit,
  onClose,
}: {
  canEdit: boolean;
  onClose: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [seasonYear, setSeasonYear] = useState(String(currentYear));
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q);
  const [editingQuota, setEditingQuota] = useState<PlotSeasonQuotaDto | "new" | null>(null);
  const [signboardTarget, setSignboardTarget] = useState<{
    plot: PortalPlot;
    householdName: string;
  } | null>(null);

  const queryParams = new URLSearchParams();
  queryParams.set("seasonYear", seasonYear);
  if (debouncedQ.trim()) queryParams.set("q", debouncedQ.trim());

  const quotasApi = useApi<PlotQuotasResponse>(`/harvest/plot-quotas?${queryParams.toString()}`);
  const rows = quotasApi.data?.data ?? [];
  const summary = quotasApi.data?.summary;
  const { options: householdOptions } = useHouseholdOptions(Boolean(editingQuota) && canEdit);

  const [householdId, setHouseholdId] = useState("");
  const [plotCode, setPlotCode] = useState("");
  const [zoneCode, setZoneCode] = useState("VN-DLOR-0086");
  const [areaHa, setAreaHa] = useState("1.0");
  const [treeCount, setTreeCount] = useState("150");
  const [maxQuotaKg, setMaxQuotaKg] = useState("18000");
  const [assessedBy, setAssessedBy] = useState("Tổ Giám sát Cộng đồng Xã Cư Né & Ban Kỹ thuật HTX");
  const [assessedOn, setAssessedOn] = useState(todayIso());
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const openForm = (target: PlotSeasonQuotaDto | "new") => {
    setFieldErrors({});
    if (target === "new") {
      setHouseholdId(householdOptions[0]?.value ?? "");
      setPlotCode("");
      setZoneCode("VN-DLOR-0086");
      setAreaHa("1.0");
      setTreeCount("150");
      setMaxQuotaKg("18000");
      setAssessedBy("Tổ Giám sát Cộng đồng Xã Cư Né & Ban Kỹ thuật HTX");
      setAssessedOn(todayIso());
      setNote("");
    } else {
      setHouseholdId(String(target.householdId));
      setPlotCode(target.plotCode);
      setZoneCode(target.zoneCode || "VN-DLOR-0086");
      setAreaHa(numberText(target.areaHa));
      setTreeCount(String(target.treeCount));
      setMaxQuotaKg(numberText(target.maxQuotaKg));
      setAssessedBy(target.assessedBy || "Tổ Giám sát Cộng đồng Xã Cư Né & Ban Kỹ thuật HTX");
      setAssessedOn(dateText(target.assessedOn) || todayIso());
      setNote(target.note ?? "");
    }
    setEditingQuota(target);
  };

  const saveQuota = useMutation(async (payload: Record<string, unknown>) => {
    return api.put<PlotSeasonQuotaDto>("/harvest/plot-quotas", payload);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveHhId = householdId || householdOptions[0]?.value || "";
    const errs = requireFields(
      { householdId: effectiveHhId, plotCode, areaHa, treeCount, maxQuotaKg },
      {
        householdId: "hộ nông dân",
        plotCode: "mã thửa",
        areaHa: "diện tích (ha)",
        treeCount: "số cây kinh doanh",
        maxQuotaKg: "trần sản lượng đầu vụ (kg)",
      },
    );
    const parsedArea = parseNumber(areaHa);
    const parsedTrees = parseNumber(treeCount);
    const parsedMax = parseNumber(maxQuotaKg);
    if (parsedArea === undefined || parsedArea <= 0) errs.areaHa = "Diện tích phải lớn hơn 0.";
    if (parsedTrees === undefined || parsedTrees < 1) errs.treeCount = "Số cây phải từ 1 trở lên.";
    if (parsedMax === undefined || parsedMax <= 0) errs.maxQuotaKg = "Trần sản lượng phải lớn hơn 0.";

    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const res = await saveQuota.run({
      seasonYear: Number(seasonYear) || currentYear,
      householdId: Number(effectiveHhId),
      plotCode: plotCode.trim().toUpperCase(),
      zoneCode: zoneCode.trim() || "VN-DLOR-0086",
      areaHa: parsedArea,
      treeCount: Math.round(parsedTrees ?? 1),
      maxQuotaKg: parsedMax,
      assessedBy: assessedBy.trim() || undefined,
      assessedOn: assessedOn || undefined,
      note: note.trim() || undefined,
    });
    if (!res) return;
    toast.success(`Đã lưu trần sản lượng thẩm định cho thửa ${plotCode.trim().toUpperCase()}.`);
    setEditingQuota(null);
    void quotasApi.refresh();
  };

  return (
    <>
      <Modal
        title="Hạn ngạch và biển QR vườn"
        onClose={onClose}
        width={940}
        footer={
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
        }
      >
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "#f4f9f5",
            border: "1px solid #d4d4d2",
            fontSize: 12.5,
            lineHeight: 1.5,
            color: "#1e293b",
            marginBottom: 14,
          }}
        >
          Mỗi thửa đất GIS được Tổ Giám sát Cộng đồng Xã và Ban Kỹ thuật HTX kiểm đếm số cây cho trái đầu vụ để khóa trần sản lượng tối đa. Khi sản lượng góp vào các lô xuất khẩu chạm trần này, máy chủ tự động từ chối đóng góp vượt mức để ngăn chặn triệt để việc trà trộn sầu riêng ngoài vùng vào mã PUC.
        </div>

        {summary && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
              marginBottom: 14,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <div style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Thửa đã thẩm định</div>
              <strong style={{ fontSize: 16 }}>{summary.plotCount} thửa</strong>
            </div>
            <div style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Tổng trần sản lượng vụ</div>
              <strong style={{ fontSize: 16, color: "#15803d" }}>
                {(summary.totalMaxQuotaKg / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tấn
              </strong>
            </div>
            <div style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Lũy kế đã xuất lô</div>
              <strong style={{ fontSize: 16 }}>
                {(summary.totalUsedKg / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tấn ({summary.utilizationPct}%)
              </strong>
            </div>
            <div style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Hạn ngạch còn lại</div>
              <strong style={{ fontSize: 16 }}>
                {(summary.totalRemainingKg / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tấn
              </strong>
            </div>
          </div>
        )}

        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              className="filter-input"
              placeholder="Tìm theo mã thửa, tên hộ, mã hộ hoặc mã vùng PUC…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={seasonYear}
            onChange={(e) => setSeasonYear(e.target.value)}
          >
            {[currentYear + 1, currentYear, currentYear - 1].map((yr) => (
              <option key={yr} value={String(yr)}>
                Mùa vụ {yr}
              </option>
            ))}
          </select>
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => openForm("new")}>
              Thẩm định thửa mới
            </button>
          )}
        </div>

        {editingQuota && canEdit && (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            style={{
              padding: 14,
              marginBottom: 14,
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>
              {editingQuota === "new"
                ? `Thẩm định hạn ngạch sản lượng thửa mới (Vụ ${seasonYear})`
                : `Cập nhật hạn ngạch thửa ${editingQuota.plotCode} (Vụ ${seasonYear})`}
            </div>
            <FormGrid>
              <SelectField
                label="Hộ thành viên"
                required
                value={householdId || householdOptions[0]?.value || ""}
                onChange={setHouseholdId}
                options={householdOptions}
                error={fieldErrors.householdId}
              />
              <TextField
                label="Mã thửa đất (plotCode)"
                required
                value={plotCode}
                onChange={setPlotCode}
                placeholder="VD: TH1-001"
                maxLength={40}
                error={fieldErrors.plotCode}
              />
            </FormGrid>
            <FormGrid>
              <TextField
                label="Mã số vùng trồng (PUC)"
                value={zoneCode}
                onChange={setZoneCode}
                maxLength={50}
              />
              <NumberField
                label="Diện tích thửa (ha)"
                required
                value={areaHa}
                onChange={setAreaHa}
                min={0.05}
                step={0.01}
                error={fieldErrors.areaHa}
              />
            </FormGrid>
            <FormGrid>
              <NumberField
                label="Số cây đang cho trái"
                required
                value={treeCount}
                onChange={setTreeCount}
                min={1}
                step={1}
                error={fieldErrors.treeCount}
              />
              <NumberField
                label="Trần sản lượng tối đa cả vụ (kg)"
                required
                value={maxQuotaKg}
                onChange={setMaxQuotaKg}
                min={50}
                step={50}
                hint="Gợi ý: ~100 - 130 kg/cây trưởng thành"
                error={fieldErrors.maxQuotaKg}
              />
            </FormGrid>
            <FormGrid>
              <TextField
                label="Đơn vị thẩm định thực địa"
                value={assessedBy}
                onChange={setAssessedBy}
                maxLength={150}
              />
              <TextField
                label="Ngày lập biên bản thẩm định"
                type="date"
                value={assessedOn}
                onChange={setAssessedOn}
              />
            </FormGrid>
            <TextField
              label="Ghi chú thẩm định"
              value={note}
              onChange={setNote}
              placeholder="VD: Kiểm đếm thực tế vườn sầu riêng năm thứ 7, cây khỏe đồng đều"
              maxLength={280}
            />
            <FormError message={saveQuota.error} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setEditingQuota(null)}
                disabled={saveQuota.pending}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saveQuota.pending}>
                {saveQuota.pending ? "Đang lưu…" : "Lưu hạn ngạch thửa"}
              </button>
            </div>
          </form>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã thửa</th>
                <th>Hộ canh tác</th>
                <th>Mã vùng PUC</th>
                <th>Quy mô</th>
                <th>Đã xuất / Trần vụ</th>
                <th>Tỷ lệ dùng</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <ListStatusRow
                colSpan={7}
                loading={quotasApi.loading}
                error={quotasApi.error}
                empty={rows.length === 0}
                onRetry={quotasApi.refresh}
              />
              {rows.map((r) => {
                const over = r.usedKg > r.maxQuotaKg;
                const high = r.utilizationPct >= 85;
                return (
                  <tr key={`${r.seasonYear}-${r.plotCode}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                    <td style={{ fontWeight: 700, fontFamily: "monospace" }}>{r.plotCode}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r.householdName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {r.householdCode} {r.villageName ? `- ${r.villageName}` : ""}
                      </div>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.zoneCode}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {r.areaHa} ha ({r.treeCount} cây)
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      <strong>{r.usedKg.toLocaleString("vi-VN")}</strong> /{" "}
                      {r.maxQuotaKg.toLocaleString("vi-VN")} kg
                    </td>
                    <td>
                      <span className={`badge ${over ? "badge-red" : high ? "badge-gold" : "badge-green"}`}>
                        {r.utilizationPct}%
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                          onClick={() =>
                            setSignboardTarget({
                              householdName: r.householdName,
                              plot: {
                                code: r.plotCode,
                                village: r.villageName,
                                zoneCode: r.zoneCode,
                                variety: "Monthong (Dona) & Ri6",
                                plantedYear: 2019,
                                areaHa: r.areaHa,
                                source: "cadastral",
                                status: "approved",
                                qrToken: r.plotQrToken,
                                treeCount: r.treeCount,
                                maxQuotaKg: r.maxQuotaKg,
                              },
                            })
                          }
                        >
                          <QrCode size={13} />
                          <span>Biển QR Vườn</span>
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => openForm(r)}
                          >
                            Sửa trần
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Modal>

      {signboardTarget && (
        <GardenSignboardModal
          plot={signboardTarget.plot}
          householdName={signboardTarget.householdName}
          onClose={() => setSignboardTarget(null)}
        />
      )}
    </>
  );
}

