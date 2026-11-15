"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, QrCode, Search } from "lucide-react";
import { formatVn } from "@/components/admin/catalog/form-utils";
import { FormError, Modal } from "@/components/ui/Modal";
import { api, errorMessage } from "@/lib/api-client";

interface AffectedLotRow {
  lotId: number;
  lotCode: string;
  qrToken?: string | null;
  variety?: string | null;
  harvestedOn?: string | null;
  packedOn?: string | null;
  exportedOn?: string | null;
  weightTons: number;
  market: string;
  status: string;
  packhouseCode: string;
  packhouseName?: string | null;
  contributedKg: number;
  recordedPlotCode?: string | null;
  householdCode: string;
  householdName: string;
  villageName: string;
  boxCount: number;
  fruitStampCount: number;
}

interface SourceParcelRow {
  contributionId: number;
  householdId: number;
  plotCode?: string | null;
  zoneCode?: string | null;
  variety?: string | null;
  areaHa?: number | null;
  plotStatus?: string | null;
  weightKg: number;
  householdCode: string;
  householdName: string;
  phone?: string | null;
  householdStatus?: string | null;
  villageName: string;
  latestLabCode?: string | null;
  latestLabOn?: string | null;
  latestCdMgKg?: number | null;
  latestYellowO?: boolean | null;
  latestResidueMgKg?: number | null;
  latestLabResult?: string | null;
}

interface PlotIncidentResponse {
  direction: "plot_to_lots";
  queryCode: string;
  plotInfo: {
    plotCode: string;
    zoneCode?: string | null;
    variety?: string | null;
    areaHa?: number | null;
    plotStatus?: string | null;
    householdCode?: string | null;
    householdName?: string | null;
    villageName?: string | null;
  } | null;
  labTests: Array<{
    code: string;
    sampledOn: string;
    cdMgKg: number;
    yellowOPositive: boolean;
    residueMgKg: number;
    result: string;
    lab: string;
  }>;
  affectedLots: AffectedLotRow[];
}

interface LotIncidentResponse {
  direction: "lot_to_plots";
  queryCode: string;
  lotInfo: {
    id: number;
    code: string;
    qrToken?: string | null;
    variety?: string | null;
    harvestedOn?: string | null;
    weightTons: number;
    market: string;
    status: string;
    packhouseCode: string;
  };
  sourceParcels: SourceParcelRow[];
}

export default function IncidentTraceModal({
  initialLotCode,
  onClose,
}: {
  initialLotCode?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"plot" | "lot">(initialLotCode ? "lot" : "plot");
  const [queryInput, setQueryInput] = useState(initialLotCode ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plotResult, setPlotResult] = useState<PlotIncidentResponse | null>(null);
  const [lotResult, setLotResult] = useState<LotIncidentResponse | null>(null);

  const runSearch = async (overrideMode?: "plot" | "lot", overrideCode?: string) => {
    const activeMode = overrideMode ?? mode;
    const clean = (overrideCode ?? queryInput).trim();
    if (!clean) {
      setError(
        activeMode === "plot"
          ? "Vui lòng nhập mã thửa nguồn (ví dụ: TH1-001) để kiểm tra các lô bị ảnh hưởng."
          : "Vui lòng nhập mã lô hàng, mã thùng hoặc token QR để truy ngược thửa nguồn.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const param = activeMode === "plot" ? `plotCode=${encodeURIComponent(clean)}` : `lotCode=${encodeURIComponent(clean)}`;
      const res = await api.get<PlotIncidentResponse | LotIncidentResponse>(`/harvest/incident-trace?${param}`);
      if (res.direction === "plot_to_lots") {
        setPlotResult(res);
        setLotResult(null);
      } else {
        setLotResult(res);
        setPlotResult(null);
      }
    } catch (err) {
      setError(errorMessage(err, "Không thể thực hiện truy vết sự cố."));
      setPlotResult(null);
      setLotResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Truy vết sự cố hai chiều: Lô hàng và Thửa nguồn"
      onClose={onClose}
      width={840}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div
        style={{
          padding: 14,
          borderRadius: 12,
          background: "var(--bg-input, #f6f8f5)",
          border: "1px solid var(--border)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn btn-sm ${mode === "plot" ? "btn-primary" : "btn-outline"}`}
            onClick={() => {
              setMode("plot");
              setError(null);
            }}
          >
            <AlertTriangle size={14} />
            <span>Truy xuôi: Thửa nguồn sang Lô bị ảnh hưởng</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === "lot" ? "btn-primary" : "btn-outline"}`}
            onClick={() => {
              setMode("lot");
              setError(null);
            }}
          >
            <ArrowLeftRight size={14} />
            <span>Truy ngược: Lô / Thùng / Token sang Thửa nguồn</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            type="text"
            className="filter-input"
            style={{ flex: 1, minWidth: 240 }}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={
              mode === "plot"
                ? "Nhập mã thửa phát hiện sự cố (VD: TH1-001, EK10-04)…"
                : "Nhập mã lô, mã thùng hoặc token QR (VD: LH-2024-038)…"
            }
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Search size={15} />
            <span>{loading ? "Đang truy vết…" : "Truy vết ngay"}</span>
          </button>
        </form>
        <FormError message={error} />
      </div>

      {plotResult && (
        <div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: plotResult.affectedLots.length > 0 ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${plotResult.affectedLots.length > 0 ? "#fecaca" : "#bbf7d0"}`,
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            <strong>Thửa tra cứu: {plotResult.queryCode}</strong>
            {plotResult.plotInfo?.householdName && (
              <span>
                {" "}
                - Chủ hộ: <strong>{plotResult.plotInfo.householdName}</strong> ({plotResult.plotInfo.villageName || "HTX Cư Né"})
              </span>
            )}
            <div style={{ marginTop: 4, color: plotResult.affectedLots.length > 0 ? "#991b1b" : "#166534", fontWeight: 600 }}>
              {plotResult.affectedLots.length > 0
                ? `Phát hiện ${plotResult.affectedLots.length} lô thu hoạch có chứa nguyên liệu từ thửa này.`
                : "Chưa có lô thu hoạch nào nhận nguyên liệu từ thửa đất này."}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã lô bị ảnh hưởng</th>
                  <th>Ngày thu</th>
                  <th>SL đóng góp</th>
                  <th>Tổng cỡ lô</th>
                  <th>Thị trường</th>
                  <th>Tem đã in</th>
                  <th>Trạng thái lô</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {plotResult.affectedLots.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      Không có lô hàng nào bị ảnh hưởng.
                    </td>
                  </tr>
                ) : (
                  plotResult.affectedLots.map((l) => (
                    <tr key={`${l.lotId}-${l.recordedPlotCode || ""}`}>
                      <td style={{ fontWeight: 700, color: "#14372f", fontFamily: "var(--font-num-stack)" }}>{l.lotCode}</td>
                      <td>{l.harvestedOn ? String(l.harvestedOn).slice(0, 10) : "—"}</td>
                      <td style={{ fontWeight: 600 }}>{formatVn(l.contributedKg, 1)} kg</td>
                      <td>{formatVn(l.weightTons, 2)} tấn</td>
                      <td>{l.market}</td>
                      <td style={{ fontSize: 12 }}>
                        {l.boxCount} thùng / {l.fruitStampCount} quả
                      </td>
                      <td>
                        <span className={`badge ${l.status === "revoked" ? "badge-red" : "badge-green"}`}>
                          {l.status === "revoked" ? "Đã thu hồi" : l.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setMode("lot");
                              setQueryInput(l.lotCode);
                              void runSearch("lot", l.lotCode);
                            }}
                          >
                            Xem mọi thửa
                          </button>
                          <a
                            href={l.qrToken ? `/t/${encodeURIComponent(l.qrToken)}` : `/trace/${encodeURIComponent(l.lotCode)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm"
                            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            <QrCode size={13} />
                            <span>QR</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lotResult && (
        <div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            <strong>
              Lô hàng: {lotResult.lotInfo.code} ({formatVn(lotResult.lotInfo.weightTons, 2)} tấn - {lotResult.lotInfo.market})
            </strong>
            <div style={{ marginTop: 4, color: "#166534" }}>
              Cơ sở đóng gói: <strong>{lotResult.lotInfo.packhouseCode}</strong> - Tổng cộng{" "}
              <strong>{lotResult.sourceParcels.length} thửa nguồn</strong> tham gia cấu thành lô hàng.
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thửa nguồn</th>
                  <th>Mã vùng PUC</th>
                  <th>Hộ canh tác</th>
                  <th>Thôn</th>
                  <th>SL góp</th>
                  <th>Kiểm nghiệm Cd / Vàng O gần nhất</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {lotResult.sourceParcels.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      Lô hàng này chưa ghi nhận chi tiết thửa nguồn đóng góp.
                    </td>
                  </tr>
                ) : (
                  lotResult.sourceParcels.map((p) => (
                    <tr key={p.contributionId}>
                      <td style={{ fontWeight: 700, color: "#166534", fontFamily: "var(--font-num-stack)" }}>
                        {p.plotCode || "Chưa gán mã thửa"}
                      </td>
                      <td style={{ fontSize: 12, fontFamily: "var(--font-num-stack)" }}>{p.zoneCode || "VN-DLOR-0086"}</td>
                      <td>
                        <strong>{p.householdName}</strong>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.householdCode}</div>
                      </td>
                      <td>{p.villageName}</td>
                      <td style={{ fontWeight: 600 }}>{formatVn(p.weightKg, 1)} kg</td>
                      <td style={{ fontSize: 12 }}>
                        {p.latestLabCode ? (
                          <span style={{ color: p.latestLabResult === "fail" ? "#b91c1c" : "#166534", fontWeight: 600 }}>
                            Cd: {p.latestCdMgKg ?? "—"} mg/kg | Vàng O: {p.latestYellowO ? "Dương tính" : "Âm tính"} (
                            {p.latestLabResult === "fail" ? "Không đạt" : "Đạt"})
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Chưa có mẫu riêng</span>
                        )}
                      </td>
                      <td>
                        {p.plotCode && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setMode("plot");
                              setQueryInput(p.plotCode || "");
                              void runSearch("plot", p.plotCode || "");
                            }}
                          >
                            Truy xuôi thửa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
