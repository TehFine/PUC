"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import TableState from "@/components/admin/shared/TableState";
import { badgeOf, REGISTRATION_STATUS } from "@/components/admin/shared/labels";
import { formatDate, formatDateTime } from "@/utils/format";
import type { RegistrationStatus, TrainingCourseRecord, TrainingRegistration } from "@/types/training";

const STATUS_BUTTONS: { status: RegistrationStatus; label: string; className: string }[] = [
  { status: "attended", label: "Có mặt", className: "btn btn-primary btn-sm" },
  { status: "absent", label: "Vắng", className: "btn btn-danger btn-sm" },
  { status: "registered", label: "Đã ĐK", className: "btn btn-outline btn-sm" },
  { status: "cancelled", label: "Hủy", className: "btn btn-outline btn-sm" },
];

export default function TrainingRegistrationsModal({
  course,
  canUpdate,
  onClose,
  onChanged,
}: {
  course: TrainingCourseRecord;
  canUpdate: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, loading, error, refresh } = useApi<TrainingRegistration[] | { data?: TrainingRegistration[] }>(
    `/training/${course.id}/registrations`,
  );
  const rows: TrainingRegistration[] = Array.isArray(data) ? data : (data?.data ?? []);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const updateStatus = async (reg: TrainingRegistration, status: RegistrationStatus) => {
    if (busyId !== null) return;
    setBusyId(reg.id);
    setActionError(null);
    try {
      await api.patch(`/training/${course.id}/registrations/${reg.id}`, { status });
      toast.success(`Đã cập nhật trạng thái tham dự: ${REGISTRATION_STATUS[status].label}.`);
      await refresh();
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      title={`Danh sách đăng ký: ${course.title}`}
      onClose={onClose}
      width={780}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          padding: "12px 16px",
          borderRadius: 14,
          background: "var(--mist)",
          marginBottom: 14,
          fontSize: 13,
        }}
      >
        <span>
          Ngày học: <strong>{formatDate(course.heldOn)}</strong>
          {course.location ? ` · ${course.location}` : ""}
        </span>
        <span>
          Sĩ số đăng ký: <strong>{rows.length}</strong> / {course.capacity} người
        </span>
      </div>

      <FormError message={actionError} />

      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Mã hộ</th>
              <th>Hộ nông dân</th>
              <th>Thôn</th>
              <th>Số ĐT</th>
              <th>Ngày ĐK</th>
              <th>Trạng thái</th>
              {canUpdate && <th>Điểm danh / Cập nhật</th>}
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={canUpdate ? 7 : 6}
              loading={loading}
              error={error}
              empty={rows.length === 0}
              emptyText="Chưa có hộ nông dân nào đăng ký khóa tập huấn này."
              onRetry={() => void refresh()}
            />
            {rows.map((reg) => {
              const st = badgeOf(REGISTRATION_STATUS, reg.status);
              return (
                <tr key={reg.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#256b45" }}>
                    {reg.householdCode || `#${reg.householdId}`}
                  </td>
                  <td style={{ fontWeight: 500 }}>{reg.householdName || `Hộ #${reg.householdId}`}</td>
                  <td>{reg.villageName || "—"}</td>
                  <td style={{ fontSize: 12 }}>{reg.phone || "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {formatDateTime(reg.registeredAt)}
                  </td>
                  <td>
                    <span className={`badge ${st.badge}`}>{st.label}</span>
                  </td>
                  {canUpdate && (
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {STATUS_BUTTONS.map((btn) => (
                          <button
                            key={btn.status}
                            type="button"
                            className={btn.className}
                            disabled={busyId === reg.id || reg.status === btn.status}
                            onClick={() => void updateStatus(reg, btn.status)}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
