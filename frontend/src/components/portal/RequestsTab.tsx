"use client";

import { FormEvent, useState } from "react";
import { usePortal } from "@/hooks/use-portal";
import { ApiError, api } from "@/lib/api-client";
import { APPROVAL_STATUS, REQUEST_TYPES } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalApproval, PortalList } from "@/types/portal";
import { Card, EmptyState, Field, Pill, Sheet, StateBlock } from "./ui";

function RequestForm({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [requestType, setRequestType] = useState(REQUEST_TYPES[0]);
  const [docsCount, setDocsCount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/portal/approvals", { requestType, docsCount: Number(docsCount) || 0 });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Không gửi được hồ sơ.");
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <Field label="Loại hồ sơ" htmlFor="pa-type">
        <select id="pa-type" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
          {REQUEST_TYPES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </Field>
      <Field label="Số giấy tờ đính kèm" htmlFor="pa-docs">
        <input id="pa-docs" type="number" inputMode="numeric" min="0" max="20" value={docsCount} onChange={(e) => setDocsCount(e.target.value)} />
      </Field>
      <p className="pt-hint">Sau khi gửi, cán bộ HTX sẽ liên hệ để nhận giấy tờ bản giấy và duyệt hồ sơ.</p>
      {error && <p className="pt-form-error" role="alert">{error}</p>}
      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button type="submit" className="pt-btn pt-btn-primary" disabled={saving}>
          {saving ? "Đang gửi…" : "Gửi hồ sơ"}
        </button>
      </div>
    </form>
  );
}

export default function RequestsTab() {
  const approvals = usePortal<PortalList<PortalApproval>>("approvals");
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-stack">
      <Card
        title="Hồ sơ đã gửi"
        action={
          <button type="button" className="pt-btn pt-btn-primary pt-btn-sm" onClick={() => setOpen(true)}>
            + Gửi hồ sơ
          </button>
        }
      >
        <StateBlock loading={approvals.loading} error={approvals.error} />
        {approvals.data && approvals.data.data.length === 0 && <EmptyState icon="request">Bạn chưa gửi hồ sơ nào.</EmptyState>}
        {approvals.data && approvals.data.data.length > 0 && (
          <ul className="pt-list">
            {approvals.data.data.map((item) => {
              const status = APPROVAL_STATUS[item.status];
              return (
                <li key={item.id} className="pt-row pt-row-wrap">
                  <div className="pt-row-main">
                    <strong>{item.requestType}</strong>
                    <span>
                      {item.code} · gửi {formatDate(item.submittedOn)} · {item.docsCount} giấy tờ
                    </span>
                  </div>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {open && (
        <Sheet title="Gửi hồ sơ xin duyệt" onClose={() => setOpen(false)}>
          <RequestForm
            onDone={() => {
              setOpen(false);
              void approvals.refresh();
            }}
            onClose={() => setOpen(false)}
          />
        </Sheet>
      )}
    </div>
  );
}
