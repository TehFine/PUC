"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Modal } from "@/components/ui/Modal";
import { useApiList } from "@/hooks/use-api";
import TabBar, { type TabItem } from "@/components/admin/shared/TabBar";
import TableState from "@/components/admin/shared/TableState";
import { formatVn } from "@/components/admin/shared/form-utils";
import { badgeOf, HOUSEHOLD_STATUS, LAB_RESULT, SEVERITY, VIOLATION_STATUS } from "@/components/admin/shared/labels";
import { formatDate } from "@/utils/format";
import type { HouseholdRow } from "@/types/households";
import type { JournalRow, ViolationRow } from "@/types/journal";
import type { LabTestRow } from "@/types/testing";

type DetailTab = "journal" | "violations" | "testing";

export default function HouseholdDetailModal({
  household,
  onClose,
  onEdit,
}: {
  household: HouseholdRow;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const { can } = useAuth();
  const canReadViolations = can("violations", "read");
  const [tab, setTab] = useState<DetailTab>("journal");

  const journal = useApiList<JournalRow>("journal", { householdId: household.id, pageSize: 20 });
  const violations = useApiList<ViolationRow>(canReadViolations ? "violations" : null, {
    householdId: household.id,
    pageSize: 20,
  });
  const labTests = useApiList<LabTestRow>("testing", { householdId: household.id, pageSize: 20 });

  const statusBadge = badgeOf(HOUSEHOLD_STATUS, household.status);

  const tabs: TabItem<DetailTab>[] = [
    { id: "journal", label: "Nhật ký canh tác", badge: journal.total },
    ...(canReadViolations ? [{ id: "violations" as const, label: "Vi phạm", badge: violations.total }] : []),
    { id: "testing", label: "Kiểm nghiệm", badge: labTests.total },
  ];

  return (
    <Modal
      title={`Hộ nông dân: ${household.name}`}
      onClose={onClose}
      width={780}
      footer={
        <>
          {onEdit && (
            <button type="button" className="btn btn-outline" onClick={onEdit}>
              Sửa thông tin hộ
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
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
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Mã vùng trồng / Mã hộ</div>
          <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14, color: "#166534" }}>{household.code}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Số CCCD</div>
          <div style={{ fontWeight: 600, fontFamily: "monospace" }}>{household.cccd}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Số điện thoại</div>
          <div style={{ fontWeight: 600 }}>{household.phone}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Thôn / Tổ</div>
          <div style={{ fontWeight: 600 }}>{household.villageName || `Thôn #${household.villageId}`}</div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Quy mô canh tác</div>
          <div style={{ fontWeight: 600 }}>
            {household.plotCount} thửa · {formatVn(household.areaHa, 2)} ha
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Trạng thái</div>
          <div>
            <span className={`badge ${statusBadge.badge}`}>{statusBadge.label}</span>
          </div>
        </div>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === "journal" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Thửa</th>
                <th>Hoạt động</th>
                <th>Chi tiết</th>
                <th>Người ghi</th>
                <th>Ảnh</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={6}
                loading={journal.loading}
                error={journal.error}
                empty={journal.rows.length === 0}
                emptyText="Chưa có nhật ký canh tác nào của hộ này."
                onRetry={() => void journal.refresh()}
              />
              {journal.rows.map((j) => (
                <tr key={j.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(j.entryOn)}</td>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, color: "#256b45" }}>{j.plotCode}</td>
                  <td>{j.activity}</td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{j.detail || "—"}</td>
                  <td style={{ fontSize: 12 }}>{j.recorder}</td>
                  <td>
                    {j.photoUrl ? (
                      <a href={j.photoUrl} target="_blank" rel="noopener noreferrer" className="badge badge-blue">
                        Xem ảnh
                      </a>
                    ) : j.hasPhoto ? (
                      <span className="badge badge-blue">Có</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "violations" && canReadViolations && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày phát hiện</th>
                <th>Mức độ</th>
                <th>Nội dung vi phạm</th>
                <th>Thửa</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                loading={violations.loading}
                error={violations.error}
                empty={violations.rows.length === 0}
                emptyText="Không có vi phạm nào được ghi nhận cho hộ này."
                onRetry={() => void violations.refresh()}
              />
              {violations.rows.map((v) => {
                const sev = badgeOf(SEVERITY, v.severity);
                const st = badgeOf(VIOLATION_STATUS, v.status);
                return (
                  <tr key={v.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(v.detectedOn)}</td>
                    <td>
                      <span className={`badge ${sev.badge}`}>{sev.label}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{v.title}</div>
                      {v.description && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{v.description}</div>
                      )}
                    </td>
                    <td style={{ fontFamily: "monospace" }}>{v.plotCode || "—"}</td>
                    <td>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "testing" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã mẫu</th>
                <th>Thửa</th>
                <th>Ngày lấy mẫu</th>
                <th>Cd (mg/kg)</th>
                <th>Dư lượng BVTV</th>
                <th>Vàng O</th>
                <th>Kết quả</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                loading={labTests.loading}
                error={labTests.error}
                empty={labTests.rows.length === 0}
                emptyText="Chưa có phiếu kiểm nghiệm nào của hộ này."
                onRetry={() => void labTests.refresh()}
              />
              {labTests.rows.map((t) => {
                const resBadge = badgeOf(LAB_RESULT, t.result);
                return (
                  <tr key={t.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 600, color: "#256b45" }}>{t.code}</td>
                    <td style={{ fontFamily: "monospace" }}>{t.plotCode}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(t.sampledOn)}</td>
                    <td>{formatVn(t.cdMgKg, 3)}</td>
                    <td>{formatVn(t.residueMgKg, 3)}</td>
                    <td>
                      <span className={`badge ${t.yellowOPositive ? "badge-red" : "badge-green"}`}>
                        {t.yellowOPositive ? "Dương tính" : "Âm tính"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${resBadge.badge}`}>{resBadge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
