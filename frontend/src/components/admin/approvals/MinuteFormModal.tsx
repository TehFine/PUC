"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, SelectField, TextField } from "@/components/ui/form/fields";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { dateText, hasErrors, requireFields, todayIso } from "@/components/admin/shared/form-utils";
import { badgeOf, MINUTE_RESULT, optionsOf } from "@/components/admin/shared/labels";
import { formatDate } from "@/utils/format";
import type { MinuteResult, MinuteRow } from "@/types/approvals";

const RESULT_OPTIONS = optionsOf(MINUTE_RESULT);

export function MinuteDetailModal({
  minute,
  onClose,
  onEdit,
}: {
  minute: MinuteRow;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const resBadge = badgeOf(MINUTE_RESULT, minute.result);
  return (
    <Modal
      title={`Biên bản kiểm tra: ${minute.code}`}
      onClose={onClose}
      width={500}
      footer={
        <>
          {onEdit && (
            <button type="button" className="btn btn-outline" onClick={onEdit}>
              Sửa biên bản
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12, padding: 16, borderRadius: 16, background: "var(--mist)" }}>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Số biên bản</div>
          <div style={{ fontWeight: 700, fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", color: "#256b45" }}>{minute.code}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Ngày kiểm tra</div>
          <div style={{ fontWeight: 600 }}>{formatDate(minute.heldOn)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Địa điểm / Phạm vi</div>
          <div style={{ fontWeight: 600 }}>{minute.location}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Cán bộ kiểm tra</div>
          <div style={{ fontWeight: 600 }}>{minute.officer}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Kết luận</div>
          <div>
            <span className={`badge ${resBadge.badge}`}>{resBadge.label}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function MinuteFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: MinuteRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [code, setCode] = useState(initial?.code ?? "");
  const [heldOn, setHeldOn] = useState(dateText(initial?.heldOn) || todayIso());
  const [location, setLocation] = useState(initial?.location ?? "");
  const [officer, setOfficer] = useState(initial?.officer ?? "");
  const [result, setResult] = useState<MinuteResult>(initial?.result ?? "pass");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const save = useMutation(async (payload: Record<string, unknown>) => {
    if (initial) return api.patch<MinuteRow>(`/minutes/${initial.id}`, payload);
    return api.post<MinuteRow>("/minutes", payload);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errs = requireFields(
      { code, heldOn, location, officer },
      {
        code: "số biên bản",
        heldOn: "ngày kiểm tra",
        location: "địa điểm / phạm vi",
        officer: "cán bộ kiểm tra",
      },
    );
    setFieldErrors(errs);
    if (hasErrors(errs)) return;

    const payload = {
      code: code.trim(),
      heldOn,
      location: location.trim(),
      officer: officer.trim(),
      result,
    };

    const res = await save.run(payload);
    if (!res) return;
    toast.success(isEdit ? "Đã cập nhật biên bản kiểm tra." : "Đã tạo biên bản kiểm tra mới.");
    notifyCountsChanged();
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={isEdit ? `Sửa biên bản: ${initial?.code}` : "Tạo biên bản kiểm tra"}
      onClose={save.pending ? () => undefined : onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={save.pending}>
            Hủy
          </button>
          <button type="submit" form="minute-form" className="btn btn-primary" disabled={save.pending}>
            {save.pending ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo biên bản"}
          </button>
        </>
      }
    >
      <form id="minute-form" onSubmit={(e) => void submit(e)} noValidate>
        <FormGrid>
          <TextField
            label="Số biên bản"
            required
            value={code}
            onChange={setCode}
            maxLength={40}
            error={fieldErrors.code}
          />
          <TextField
            label="Ngày kiểm tra"
            required
            type="date"
            value={heldOn}
            onChange={setHeldOn}
            error={fieldErrors.heldOn}
          />
        </FormGrid>

        <TextField
          label="Địa điểm / Phạm vi"
          required
          value={location}
          onChange={setLocation}
          placeholder="VD: Thôn 2 – 12 hộ vùng trồng XK"
          maxLength={200}
          error={fieldErrors.location}
        />

        <FormGrid>
          <TextField
            label="Cán bộ kiểm tra"
            required
            value={officer}
            onChange={setOfficer}
            placeholder="KS. Trần Quốc Bảo"
            maxLength={100}
            error={fieldErrors.officer}
          />
          <SelectField
            label="Kết quả đánh giá"
            value={result}
            onChange={(val) => setResult(val as MinuteResult)}
            options={RESULT_OPTIONS}
          />
        </FormGrid>

        <FormError message={save.error} />
      </form>
    </Modal>
  );
}
