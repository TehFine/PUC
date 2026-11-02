"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, QrCode, Tag } from "lucide-react";
import { invalidatePortal, usePortal } from "@/hooks/use-portal";
import { api, errorMessage } from "@/lib/api-client";
import { STAMP_STATUS, toNumber } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { ActivateStampBody, PortalPlot, PortalStamp, PortalStampsResponse } from "@/types/portal";
import { BusyButton, InlineError, PhotoField, StoredPhoto, usePhotoPicker } from "../shared/controls";
import { Card, EmptyState, Field, Pill, Sheet, StateBlock, useSheetClose } from "../ui";

function ActivateStampForm({
  plots,
  unactivatedStamps,
  initialSerial,
  initialPlot,
  onDone,
  onClose,
}: {
  plots: PortalPlot[];
  unactivatedStamps: PortalStamp[];
  initialSerial?: string;
  initialPlot?: string;
  onDone: (serial: string) => void;
  onClose: () => void;
}) {
  const sheetClose = useSheetClose();
  const [serialCode, setSerialCode] = useState(initialSerial ?? unactivatedStamps[0]?.serialCode ?? "");
  const [plotCode, setPlotCode] = useState(initialPlot ?? plots[0]?.code ?? "");
  const [fruitWeightKg, setFruitWeightKg] = useState("2.8");
  const [grade, setGrade] = useState<"A" | "B" | "C">("A");
  const photo = usePhotoPicker("stamp");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectivePlot = plotCode || plots[0]?.code || "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanSerial = serialCode.trim();
    const cleanPlot = effectivePlot.trim();
    const weight = Number(fruitWeightKg);

    if (!cleanSerial) {
      setError("Vui lòng nhập hoặc chọn mã serial tem cần kích hoạt.");
      return;
    }
    if (!cleanPlot) {
      setError("Vui lòng chọn hoặc nhập mã thửa đất thu hoạch.");
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 15) {
      setError("Khối lượng quả phải lớn hơn 0 và không vượt quá 15 kg.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const photoId = await photo.ensureUploaded();
      const body: ActivateStampBody = {
        serialCode: cleanSerial,
        plotCode: cleanPlot,
        fruitWeightKg: weight,
        grade,
        photoId,
      };
      await api.post("/portal/stamps/activate", body);
      invalidatePortal("stamps", "harvest-declarations", "harvest", "overview");
      onDone(cleanSerial);
    } catch (err) {
      setError(errorMessage(err, "Không kích hoạt được tem quả. Vui lòng kiểm tra lại mã serial."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <Field label="Mã serial tem quả" htmlFor="st-serial">
        <input
          id="st-serial"
          list="st-unactivated-list"
          placeholder="Nhập hoặc chọn mã serial tem (ví dụ: KB-2026-0001)"
          value={serialCode}
          onChange={(e) => setSerialCode(e.target.value)}
          required
        />
        {unactivatedStamps.length > 0 && (
          <datalist id="st-unactivated-list">
            {unactivatedStamps.map((s) => (
              <option key={s.id} value={s.serialCode}>
                {s.serialCode}
                {s.plotCode ? ` (Thửa ${s.plotCode})` : ""}
              </option>
            ))}
          </datalist>
        )}
      </Field>

      <div className="pt-field-row">
        <Field label="Thửa đất thu hoạch" htmlFor="st-plot">
          {plots.length > 0 ? (
            <select
              id="st-plot"
              value={effectivePlot}
              onChange={(e) => setPlotCode(e.target.value)}
              required
            >
              {plots.map((p) => (
                <option key={p.code} value={p.code}>
                  Thửa {p.code}{p.variety ? ` – ${p.variety}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="st-plot"
              placeholder="Nhập mã thửa đất"
              value={effectivePlot}
              onChange={(e) => setPlotCode(e.target.value)}
              required
            />
          )}
        </Field>

        <Field label="Phân hạng quả" htmlFor="st-grade">
          <select
            id="st-grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value as "A" | "B" | "C")}
          >
            <option value="A">Hạng A (Loại 1 VIP xuất khẩu)</option>
            <option value="B">Hạng B (Loại 2 đạt chuẩn)</option>
            <option value="C">Hạng C (Tiêu thụ nội địa)</option>
          </select>
        </Field>
      </div>

      <Field label="Khối lượng quả (kg, tối đa 15 kg)" htmlFor="st-weight">
        <input
          id="st-weight"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0.1"
          max="15"
          value={fruitWeightKg}
          onChange={(e) => setFruitWeightKg(e.target.value)}
          required
        />
      </Field>

      <PhotoField
        id="st-photo"
        label="Ảnh quả đã dán tem (tùy chọn)"
        picker={photo}
        title="Chụp ảnh quả sầu riêng đã dán tem"
        description="Lưu ảnh minh chứng truy xuất nguồn gốc từng quả"
        disabled={saving}
      />

      <InlineError message={error} />

      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton
          type="submit"
          className="pt-btn pt-btn-primary"
          busy={saving}
          busyLabel="Đang kích hoạt…"
          disabled={!serialCode.trim() || !plotCode.trim()}
        >
          Kích hoạt tem
        </BusyButton>
      </div>
    </form>
  );
}

export function FruitStampsView({ plots }: { plots: PortalPlot[] }) {
  const stampsQuery = usePortal<PortalStampsResponse>("stamps");
  const [activateModal, setActivateModal] = useState<{ serial?: string; plotCode?: string } | null>(null);
  const [selectedStamp, setSelectedStamp] = useState<PortalStamp | null>(null);
  const [activatedMsg, setActivatedMsg] = useState<string | null>(null);

  const stats = stampsQuery.data?.stats ?? { totalAllocated: 0, totalActivated: 0, remaining: 0 };
  const allocations = stampsQuery.data?.allocations ?? [];
  const stamps = stampsQuery.data?.stamps ?? [];
  const unactivatedStamps = stamps.filter((s) => s.status === "allocated");

  return (
    <div className="pt-stack">
      <div className="decl-topbar" style={{ marginBottom: 4 }}>
        <div className="decl-topbar-info">
          <h3 className="decl-topbar-title">Kích hoạt tem quả điện tử</h3>
          <p className="decl-topbar-sub">
            Quản lý hạn mức tem được HTX cấp và kích hoạt mã serial dán lên từng quả sầu riêng khi thu hoạch.
          </p>
        </div>
        <button
          type="button"
          className="pt-btn pt-btn-primary pt-btn-sm"
          onClick={() => {
            setActivatedMsg(null);
            setActivateModal({});
          }}
        >
          <QrCode size={15} aria-hidden="true" />
          <span>Kích hoạt tem quả</span>
        </button>
      </div>

      {activatedMsg && (
        <div className="portal-alert portal-alert-success">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{activatedMsg}</span>
        </div>
      )}

      <StateBlock loading={stampsQuery.loading} error={stampsQuery.error} variant="stats" />

      {stampsQuery.data && (
        <>
          <div className="pt-stamp-stats-grid">
            <div className="pt-stamp-stat-card">
              <span className="pt-stamp-stat-label">Tổng tem được cấp</span>
              <strong className="pt-stamp-stat-val">{stats.totalAllocated.toLocaleString("vi-VN")}</strong>
              <span className="pt-stamp-stat-sub">Hạn mức định danh hộ</span>
            </div>
            <div className="pt-stamp-stat-card is-green">
              <span className="pt-stamp-stat-label">Đã kích hoạt dán quả</span>
              <strong className="pt-stamp-stat-val">{stats.totalActivated.toLocaleString("vi-VN")}</strong>
              <span className="pt-stamp-stat-sub">Đã gắn mã truy xuất</span>
            </div>
            <div className="pt-stamp-stat-card is-blue">
              <span className="pt-stamp-stat-label">Tem còn lại khả dụng</span>
              <strong className="pt-stamp-stat-val">{stats.remaining.toLocaleString("vi-VN")}</strong>
              <span className="pt-stamp-stat-sub">Sẵn sàng kích hoạt</span>
            </div>
          </div>

          <div className="pt-grid-2">
            <Card title={`Đợt cấp phát tem (${allocations.length})`}>
              {allocations.length === 0 ? (
                <EmptyState icon="harvest">
                  Hộ của bạn chưa có đợt cấp tem quả nào. Sau khi khai báo thu hái được duyệt, HTX sẽ phân bổ dải serial tem.
                </EmptyState>
              ) : (
                <ul className="pt-list">
                  {allocations.map((alloc) => (
                    <li key={alloc.id} className="pt-row pt-row-wrap">
                      <div className="pt-row-main">
                        <strong>
                          {alloc.allocationCode}
                          {alloc.season ? ` · Vụ ${alloc.season}` : ""}
                        </strong>
                        <span>
                          Cấp ngày {formatDate(alloc.allocatedOn)} · SL:{" "}
                          <strong>{alloc.quantityAllocated.toLocaleString("vi-VN")} tem</strong>
                          {alloc.plotCode ? ` · Thửa ${alloc.plotCode}` : ""}
                        </span>
                        {(alloc.fromSerial || alloc.toSerial) && (
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            Dải serial: {alloc.fromSerial ?? "—"} &rarr; {alloc.toSerial ?? "—"}
                          </span>
                        )}
                        {alloc.notes && (
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{alloc.notes}</span>
                        )}
                      </div>
                      <Pill tone={alloc.status === "revoked" ? "red" : "green"}>
                        {alloc.status === "revoked" ? "Đã thu hồi" : "Hiệu lực"}
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title={`Danh sách tem gần đây (${stamps.length})`}
              action={
                unactivatedStamps.length > 0 ? (
                  <button
                    type="button"
                    className="pt-btn pt-btn-ghost pt-btn-sm"
                    onClick={() =>
                      setActivateModal({
                        serial: unactivatedStamps[0].serialCode,
                        plotCode: unactivatedStamps[0].plotCode ?? undefined,
                      })
                    }
                  >
                    Kích hoạt nhanh
                  </button>
                ) : undefined
              }
            >
              {stamps.length === 0 ? (
                <EmptyState icon="harvest">Chưa có tem quả nào trong danh sách của hộ.</EmptyState>
              ) : (
                <ul className="pt-list">
                  {stamps.map((stamp) => {
                    const st = STAMP_STATUS[stamp.status] ?? { label: stamp.status, tone: "gray" as const };
                    const weight = toNumber(stamp.fruitWeightKg);
                    return (
                      <li key={stamp.id} className="pt-row pt-row-wrap">
                        <div
                          className="pt-row-main"
                          style={{ cursor: stamp.status === "activated" ? "pointer" : undefined }}
                          onClick={() => {
                            if (stamp.status === "activated") setSelectedStamp(stamp);
                          }}
                        >
                          <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Tag size={14} aria-hidden="true" />
                            <span>{stamp.serialCode}</span>
                          </strong>
                          <span>
                            {stamp.plotCode ? `Thửa ${stamp.plotCode}` : "Chưa gắn thửa"}
                            {weight !== null ? ` · ${weight} kg` : ""}
                            {stamp.grade ? ` · Hạng ${stamp.grade}` : ""}
                            {stamp.harvestDate ? ` · ${formatDate(stamp.harvestDate)}` : ""}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Pill tone={st.tone}>{st.label}</Pill>
                          {stamp.status === "allocated" && (
                            <button
                              type="button"
                              className="pt-btn pt-btn-primary pt-btn-sm"
                              onClick={() =>
                                setActivateModal({
                                  serial: stamp.serialCode,
                                  plotCode: stamp.plotCode ?? undefined,
                                })
                              }
                            >
                              Kích hoạt
                            </button>
                          )}
                          {stamp.status === "activated" && stamp.photoUrl && (
                            <button
                              type="button"
                              className="pt-btn pt-btn-ghost pt-btn-sm"
                              onClick={() => setSelectedStamp(stamp)}
                            >
                              Xem ảnh
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {activateModal && (
        <Sheet title="Kích hoạt tem dán quả sầu riêng" onClose={() => setActivateModal(null)}>
          <ActivateStampForm
            plots={plots}
            unactivatedStamps={unactivatedStamps}
            initialSerial={activateModal.serial}
            initialPlot={activateModal.plotCode}
            onDone={(serial) => {
              setActivateModal(null);
              setActivatedMsg(`Đã kích hoạt thành công tem quả "${serial}".`);
            }}
            onClose={() => setActivateModal(null)}
          />
        </Sheet>
      )}

      {selectedStamp && (
        <Sheet title={`Chi tiết tem ${selectedStamp.serialCode}`} onClose={() => setSelectedStamp(null)}>
          <div className="pt-diary-detail-body">
            <div className="pt-detail-grid">
              <div className="pt-detail-cell">
                <span className="pt-detail-cell-label">Mã serial tem</span>
                <span className="pt-detail-cell-value">{selectedStamp.serialCode}</span>
              </div>
              <div className="pt-detail-cell">
                <span className="pt-detail-cell-label">Thửa thu hoạch</span>
                <span className="pt-detail-cell-value">
                  {selectedStamp.plotCode ? `Thửa ${selectedStamp.plotCode}` : "—"}
                </span>
              </div>
              <div className="pt-detail-cell">
                <span className="pt-detail-cell-label">Khối lượng & Phân hạng</span>
                <span className="pt-detail-cell-value">
                  {toNumber(selectedStamp.fruitWeightKg) ?? "—"} kg · Hạng {selectedStamp.grade ?? "A"}
                </span>
              </div>
              <div className="pt-detail-cell">
                <span className="pt-detail-cell-label">Ngày kích hoạt</span>
                <span className="pt-detail-cell-value">
                  {formatDate(selectedStamp.harvestDate || selectedStamp.activatedAt)}
                </span>
              </div>
            </div>

            {selectedStamp.photoUrl && (
              <div className="pt-detail-section">
                <h4 className="pt-detail-section-title">Ảnh quả sầu riêng đã dán tem</h4>
                <StoredPhoto
                  url={selectedStamp.photoUrl}
                  alt={`Tem quả ${selectedStamp.serialCode}`}
                  caption={`${selectedStamp.serialCode} · Thửa ${selectedStamp.plotCode ?? ""}`}
                />
              </div>
            )}

            <div className="pt-detail-footer">
              <button
                type="button"
                className="pt-btn pt-btn-primary pt-btn-block"
                onClick={() => setSelectedStamp(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
