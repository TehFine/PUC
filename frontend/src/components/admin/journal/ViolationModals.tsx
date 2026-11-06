"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, SelectField, TextAreaField, TextField, type Option } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, requireFields, textOrNull, todayIso } from "@/components/admin/shared/form-utils";
import { badgeOf, optionsOf, SEVERITY, VIOLATION_STATUS } from "@/components/admin/shared/labels";
import { formatDate, formatDateTime } from "@/utils/format";
import type { HouseholdRow } from "@/types/households";
import type { ViolationRow, ViolationSeverity, ViolationStatus } from "@/types/journal";

const SEVERITY_OPTIONS = optionsOf(SEVERITY);
const STATUS_OPTIONS = optionsOf(VIOLATION_STATUS);

export function ViolationDetailModal({
  violation,
  canUpdate,
  onClose,
  onResolve,
  onEdit,
}: {
  violation: ViolationRow;
  canUpdate: boolean;
  onClose: () => void;
  onResolve: () => void;
  onEdit: () => void;
}) {
  const sev = badgeOf(SEVERITY, violation.severity);
  const st = badgeOf(VIOLATION_STATUS, violation.status);

  return (
    <Modal
      title="Chi tiết cảnh báo vi phạm"
      onClose={onClose}
      width={600}
      footer={
        <>
          {canUpdate && (
            <button type="button" className="btn btn-outline" onClick={onEdit}>
              Sửa
            </button>
          )}
          {canUpdate && violation.status === "open" && (
            <button type="button" className="btn btn-primary" onClick={onResolve}>
              Xử lý vi phạm
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          padding: 16,
          borderRadius: 16,
          background: "var(--mist)",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Mức độ &amp; Trạng thái</div>
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <span className={`badge ${sev.badge}`}>{sev.label}</span>
            <span className={`badge ${st.badge}`}>{st.label}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Hộ nông dân</div>
          <div style={{ fontWeight: 600 }}>{violation.householdLabel}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Ngày phát hiện</div>
          <div style={{ fontWeight: 600 }}>{formatDate(violation.detectedOn)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Mã thửa</div>
          <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#256b45" }}>{violation.plotCode || "—"}</div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
          Nội dung vi phạm
        </div>
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "var(--bg-input)", fontSize: 13.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{violation.title}</div>
          <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {violation.description || "Không có mô tả chi tiết."}
          </div>
        </div>
      </div>

      <JournalEvidence violation={violation} />

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
          Phản hồi giải trình từ hộ nông dân
        </div>
        {violation.farmerResponse ? (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{violation.farmerResponse}</div>
            {violation.farmerResponseAt && (
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                Gửi lúc: {formatDateTime(violation.farmerResponseAt)}
              </div>
            )}
            {violation.farmerResponsePhotoUrl &&
              /^(\/api\/uploads\/\d+|\/[A-Za-z0-9._/-]+|https?:\/\/)/i.test(violation.farmerResponsePhotoUrl) && (
              <div style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={violation.farmerResponsePhotoUrl}
                  alt="Ảnh giải trình của hộ nông dân"
                  style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }}
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Hộ nông dân chưa gửi phản hồi giải trình.</div>
        )}
      </div>

      {(violation.resolutionNotes || violation.resolvedOn) && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            Kết quả xử lý ({formatDate(violation.resolvedOn)})
          </div>
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#eef8e3", fontSize: 13.5 }}>
            {violation.resolutionNotes || "Đã đánh dấu hoàn tất xử lý."}
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Đối chiếu bằng chứng cho vi phạm "chưa cập nhật nhật ký": cho cán bộ thấy hộ đã thực sự ghi nhật ký mới
 * (đúng thửa) kể từ ngày phát hiện hay chưa, thay vì chỉ dựa vào lời giải trình.
 */
function JournalEvidence({ violation }: { violation: ViolationRow }) {
  if (!violation.isJournalViolation) return null;
  const last = violation.lastJournalOn ?? null;
  const ok = !!last && last >= violation.detectedOn;
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        fontSize: 12.5,
        lineHeight: 1.5,
        marginBottom: 14,
        background: ok ? "#f0fdf4" : "#fff7ed",
        color: ok ? "#166534" : "#9a3412",
      }}
    >
      <strong>Đối chiếu nhật ký{violation.plotCode ? ` (thửa ${violation.plotCode})` : ""}: </strong>
      {ok
        ? `Hộ đã ghi nhật ký mới ngày ${formatDate(last)}, sau ngày phát hiện vi phạm.`
        : last
          ? `Lần ghi gần nhất ${formatDate(last)} — chưa có nhật ký mới kể từ ngày phát hiện (${formatDate(violation.detectedOn)}).`
          : "Hộ chưa có bản ghi nhật ký nào cho thửa này."}
    </div>
  );
}

export function ViolationResolveModal({
  violation,
  onClose,
  onResolved,
}: {
  violation: ViolationRow;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [resolutionNotes, setResolutionNotes] = useState(violation.resolutionNotes ?? "");
  const [notesError, setNotesError] = useState<string | null>(null);

  const resolve = useMutation(async (notes: string) => {
    return api.post(`/violations/${violation.id}/resolve`, { resolutionNotes: notes });
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resolutionNotes.trim()) {
      setNotesError("Vui lòng nhập nội dung / biện pháp xử lý vi phạm.");
      return;
    }
    setNotesError(null);
    const res = await resolve.run(resolutionNotes.trim());
    if (res === undefined) return;
    toast.success("Đã xử lý và đóng cảnh báo vi phạm.");
    notifyCountsChanged();
    onResolved();
    onClose();
  };

  return (
    <Modal
      title="Xử lý vi phạm"
      onClose={resolve.pending ? () => undefined : onClose}
      width={500}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={resolve.pending}>
            Hủy
          </button>
          <button type="submit" form="violation-resolve-form" className="btn btn-primary" disabled={resolve.pending}>
            {resolve.pending ? "Đang lưu…" : "Xác nhận đã xử lý"}
          </button>
        </>
      }
    >
      <form id="violation-resolve-form" onSubmit={(e) => void submit(e)} noValidate>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>
          Vi phạm: <strong>{violation.title}</strong> ({violation.householdLabel})
        </p>
        {violation.farmerResponse && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "var(--mist)",
              fontSize: 12.5,
              marginBottom: 14,
            }}
          >
            <strong>Giải trình của hộ:</strong> {violation.farmerResponse}
          </div>
        )}
        <JournalEvidence violation={violation} />
        <TextAreaField
          label="Biên bản / Biện pháp xử lý (resolutionNotes)"
          required
          value={resolutionNotes}
          onChange={setResolutionNotes}
          rows={4}
          maxLength={2000}
          placeholder="VD: Đã kiểm tra thực địa, hộ đã tiêu hủy thuốc ngoài danh mục và cam kết tuân thủ thời gian cách ly."
          error={notesError}
        />
        <FormError message={resolve.error} />
      </form>
    </Modal>
  );
}

export function ViolationFormModal({
  initial,
  households,
  householdOptions,
  onClose,
  onSaved,
}: {
  initial?: ViolationRow | null;
  households: HouseholdRow[];
  householdOptions: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [householdId, setHouseholdId] = useState(initial?.householdId ? String(initial.householdId) : "");
  const [householdLabel, setHouseholdLabel] = useState(initial?.householdLabel ?? "");
  const [severity, setSeverity] = useState<ViolationSeverity>(initial?.severity ?? "warning");
  const [status, setStatus] = useState<ViolationStatus>(initial?.status ?? "open");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [detectedOn, setDetectedOn] = useState(dateText(initial?.detectedOn) || todayIso());
  const [plotCode, setPlotCode] = useState(initial?.plotCode ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<ViolationRow>(`/violations/${initial.id}`, payload);
    return api.post<ViolationRow>("/violations", payload);
  });

  const handleHouseholdChange = (val: string) => {
    setHouseholdId(val);
    const found = households.find((h) => String(h.id) === val);
    if (found) {
      setHouseholdLabel(`${found.name}${found.villageName ? ` (${found.villageName})` : ""}`);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { title, householdLabel, detectedOn },
      {
        title: "tiêu đề vi phạm",
        householdLabel: "tên hộ vi phạm",
        detectedOn: "ngày phát hiện",
      },
    );
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload: Record<string, unknown> = {
      severity,
      title: title.trim(),
      householdLabel: householdLabel.trim(),
      detectedOn,
      plotCode: textOrNull(plotCode),
      description: textOrNull(description),
      status,
    };
    if (householdId) {
      payload.householdId = Number(householdId);
    }

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật cảnh báo vi phạm." : "Đã ghi nhận cảnh báo vi phạm.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? "Sửa cảnh báo vi phạm" : "Ghi nhận vi phạm"}
      onClose={save.pending ? () => undefined : onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="violation-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Ghi nhận vi phạm"}
          </button>
        </>
      }
    >
      <form id="violation-form" onSubmit={(e) => void submit(e)} noValidate>
        <SelectField
          label="Chọn hộ nông dân (để gửi thông báo trực tiếp)"
          value={householdId}
          onChange={handleHouseholdChange}
          options={householdOptions}
          placeholder="— Chọn hộ từ danh sách —"
        />

        <FormGrid>
          <TextField
            label="Nhãn hộ hiển thị"
            required
            value={householdLabel}
            onChange={setHouseholdLabel}
            placeholder="VD: Nguyễn Văn A (Thôn 3)"
            maxLength={200}
            error={fieldErrors.householdLabel}
          />
          <TextField
            label="Ngày phát hiện"
            required
            type="date"
            value={detectedOn}
            onChange={setDetectedOn}
            error={fieldErrors.detectedOn}
          />
        </FormGrid>

        <TextField
          label="Tiêu đề vi phạm"
          required
          value={title}
          onChange={setTitle}
          placeholder="VD: Sử dụng thuốc BVTV ngoài danh mục được phép"
          maxLength={300}
          error={fieldErrors.title}
        />

        <FormGrid>
          <SelectField
            label="Mức độ"
            value={severity}
            onChange={(val) => setSeverity(val as ViolationSeverity)}
            options={SEVERITY_OPTIONS}
          />
          <SelectField
            label="Trạng thái"
            value={status}
            onChange={(val) => setStatus(val as ViolationStatus)}
            options={STATUS_OPTIONS}
          />
        </FormGrid>

        <TextField
          label="Mã thửa (plotCode)"
          value={plotCode}
          onChange={setPlotCode}
          placeholder="VD: TH-03"
          maxLength={40}
        />

        <TextAreaField
          label="Mô tả chi tiết"
          value={description}
          onChange={setDescription}
          rows={3}
          maxLength={2000}
          placeholder="Chi tiết hiện trạng phát hiện, khuyến nghị khắc phục…"
        />

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
