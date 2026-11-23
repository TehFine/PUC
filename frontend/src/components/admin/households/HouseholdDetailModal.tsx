"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { extractSafeMediaUrls, MediaBottomSheet } from "@/components/ui/MediaBottomSheet";
import { Modal, ModalDismissButton } from "@/components/ui/Modal";
import { useApiList } from "@/hooks/use-api";
import { usePlots } from "@/hooks/use-plots";
import TabBar, { type TabItem } from "@/components/admin/shared/TabBar";
import TableState from "@/components/admin/shared/TableState";
import { requestEditPlotShape } from "@/components/admin/shared/counts-events";
import { formatVn } from "@/components/admin/shared/form-utils";
import { badgeOf, HOUSEHOLD_STATUS, LAB_RESULT, SEVERITY, VIOLATION_STATUS } from "@/components/admin/shared/labels";
import { getZoneColor } from "@/components/zones/zone-data";
import { formatDate, formatDiaryEditor } from "@/utils/format";
import { formatCoords, plotCenterCoords } from "@/utils/plot-utils";
import type { HouseholdRow } from "@/types/households";
import type { JournalRow, ViolationRow } from "@/types/journal";
import type { LabTestRow } from "@/types/testing";

type DetailTab = "plots" | "journal" | "violations" | "testing";

export default function HouseholdDetailModal({
  household,
  onClose,
  onEdit,
  onIssueAccount,
  onDelete,
  hasPendingDeletion = false,
  onViewPendingDeletion,
}: {
  household: HouseholdRow;
  onClose: () => void;
  onEdit?: () => void;
  onIssueAccount?: () => void;
  onDelete?: () => void;
  hasPendingDeletion?: boolean;
  onViewPendingDeletion?: () => void;
}) {
  const { can } = useAuth();
  const canReadViolations = can("violations", "read");
  const [tab, setTab] = useState<DetailTab>("plots");
  const [previewMedia, setPreviewMedia] = useState<{
    urls: string[];
    title: string;
    subtitle?: string;
  } | null>(null);

  const { plots: allPlots, loading: plotsLoading, error: plotsError, refresh: refreshPlots } = usePlots();
  const householdPlots = useMemo(() => {
    const features = allPlots?.features ?? [];
    const zonePrefix = household.code.replace(/-H\d+$/i, "");
    return features.filter(
      (f) =>
        f.properties.householdId === household.id ||
        (f.properties.householdId == null && f.properties.owner === household.name && f.properties.zone === zonePrefix),
    );
  }, [allPlots, household.id, household.name, household.code]);

  const journal = useApiList<JournalRow>("journal", { householdId: household.id, pageSize: 20 });
  const violations = useApiList<ViolationRow>(canReadViolations ? "violations" : null, {
    householdId: household.id,
    pageSize: 20,
  });
  const labTests = useApiList<LabTestRow>("testing", { householdId: household.id, pageSize: 20 });

  const statusBadge = badgeOf(HOUSEHOLD_STATUS, household.status);
  const zc = getZoneColor(household.code);
  const areaLabel = (household.villageName || `Thôn #${household.villageId}`).replace(/\s*[—–]\s*/g, ", ");

  const tabs: TabItem<DetailTab>[] = [
    { id: "plots", label: "Thửa đất", badge: householdPlots.length },
    { id: "journal", label: "Nhật ký", badge: journal.total },
    ...(canReadViolations ? [{ id: "violations" as const, label: "Vi phạm", badge: violations.total }] : []),
    { id: "testing", label: "Kiểm nghiệm", badge: labTests.total },
  ];

  return (
    <Modal
      title={household.name}
      onClose={onClose}
      width={780}
      footer={
        <>
          {hasPendingDeletion && onViewPendingDeletion ? (
            <button type="button" className="btn btn-outline" onClick={onViewPendingDeletion}>
              Xem yêu cầu xóa
            </button>
          ) : (
            onDelete && (
              <button type="button" className="btn btn-danger" onClick={onDelete}>
                Yêu cầu xóa
              </button>
            )
          )}
          {onEdit && (
            <button type="button" className="btn btn-outline" onClick={onEdit}>
              Sửa
            </button>
          )}
          <ModalDismissButton className="btn btn-primary" onFallbackClose={onClose}>
            Đóng
          </ModalDismissButton>
        </>
      }
    >
      <div className="admin-detail-list-card" style={{ marginBottom: 18 }}>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Mã vùng trồng, mã hộ</span>
          <div
            className="admin-detail-list-value"
            style={{
              fontWeight: 700,
              fontFamily: "var(--font-num-stack)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.015em",
              color: zc.text,
            }}
          >
            {household.code}
          </div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Số CCCD</span>
          <div
            className="admin-detail-list-value"
            style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", letterSpacing: "0.015em" }}
          >
            {household.cccd}
          </div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Số điện thoại</span>
          <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {household.phone}
          </div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Địa bàn</span>
          <div className="admin-detail-list-value">{areaLabel}</div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Quy mô canh tác</span>
          <div className="admin-detail-list-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {household.plotCount} thửa, {formatVn(household.areaHa, 2)} ha
          </div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Tài khoản hộ dân</span>
          <div
            className="admin-detail-list-value"
            style={{
              fontVariantNumeric: "tabular-nums",
              color: household.accountId ? "#14372f" : "#9a6712",
              fontWeight: 600,
            }}
          >
            {household.accountId ? household.accountUsername || "Đã cấp tài khoản" : "Chưa cấp tài khoản"}
          </div>
        </div>
        <div className="admin-detail-list-row">
          <span className="admin-detail-list-label">Trạng thái</span>
          <div className="admin-detail-list-value">
            <span className={`badge ${statusBadge.badge}`}>{statusBadge.label}</span>
          </div>
        </div>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === "plots" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã thửa</th>
                <th>Số thửa</th>
                <th>Số tờ</th>
                <th>Diện tích</th>
                <th>Giống</th>
                <th>Tọa độ</th>
                <th>Bản đồ</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                loading={plotsLoading}
                error={plotsError}
                empty={householdPlots.length === 0}
                emptyText="Chưa có thửa đất nào được gán cho hộ này."
                onRetry={() => void refreshPlots()}
              />
              {householdPlots.map((f) => {
                const p = f.properties;
                const center = plotCenterCoords(f);
                return (
                  <tr key={p.code}>
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: zc.text, whiteSpace: "nowrap" }}>{p.code}</td>
                    <td>{p.parcel || "-"}</td>
                    <td>{p.sheet || "-"}</td>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatVn(p.areaHa, 2)} ha</td>
                    <td>{p.variety || "-"}</td>
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {formatCoords(center?.lat, center?.lng)}
                    </td>
                    <td>
                      <div style={{ display: "inline-flex", gap: 6, flexWrap: "nowrap", alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            onClose();
                            requestEditPlotShape(p.code);
                          }}
                          title="Mở bản đồ để kéo chỉnh sửa hình dạng ranh giới mảnh đất này"
                        >
                          Ranh giới
                        </button>
                        {center && (
                          <a
                            href={`https://www.google.com/maps?q=${center.lat},${center.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="badge badge-blue"
                          >
                            Vị trí
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "journal" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày ghi</th>
                <th>Mã thửa</th>
                <th>Công việc</th>
                <th>Chi tiết</th>
                <th>Người ghi</th>
                <th>Hình ảnh</th>
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
                  <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#256b45", whiteSpace: "nowrap" }}>{j.plotCode}</td>
                  <td>{j.activity}</td>
                  <td className="cell-wrap" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{j.detail || "-"}</td>
                  <td style={{ fontSize: 12.5 }}>
                    <div>{j.recorder}</div>
                    {j.updatedByName && (
                      <div style={{ fontSize: 11.5, color: "#9a6712", fontWeight: 500, marginTop: 2 }}>
                        Đã sửa: {formatDiaryEditor(j.updatedByName, j.updatedByRole)}
                      </div>
                    )}
                  </td>
                  <td>
                    {(() => {
                      const rowUrls = extractSafeMediaUrls(j.photoUrls, j.photoUrl);
                      if (rowUrls.length > 0) {
                        return (
                          <button
                            type="button"
                            className="badge badge-blue"
                            style={{ cursor: "pointer", border: "none", fontFamily: "inherit" }}
                            onClick={() =>
                              setPreviewMedia({
                                urls: rowUrls,
                                title: household.name,
                                subtitle: `${formatDate(j.entryOn)}, ${j.plotCode}, ${j.activity}`,
                              })
                            }
                          >
                            {rowUrls.length > 1 ? `Xem ảnh (${rowUrls.length})` : "Xem ảnh"}
                          </button>
                        );
                      }
                      if (j.hasPhoto) {
                        return <span className="badge badge-blue">Có ảnh</span>;
                      }
                      return <span style={{ color: "var(--text-muted)" }}>-</span>;
                    })()}
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
                <th>Ngày ghi</th>
                <th>Mức độ</th>
                <th>Nội dung</th>
                <th>Mã thửa</th>
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
                    <td className="cell-wrap">
                      <div style={{ fontWeight: 600 }}>{v.title}</div>
                      {v.description && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{v.description}</div>
                      )}
                      {(() => {
                        const respUrls = extractSafeMediaUrls(v.farmerResponsePhotoUrls, v.farmerResponsePhotoUrl);
                        if (respUrls.length === 0) return null;
                        return (
                          <div style={{ marginTop: 6 }}>
                            <button
                              type="button"
                              className="badge badge-blue"
                              style={{ cursor: "pointer", border: "none", fontFamily: "inherit" }}
                              onClick={() =>
                                setPreviewMedia({
                                  urls: respUrls,
                                  title: household.name,
                                  subtitle: `Ảnh giải trình ngày ${formatDate(v.detectedOn)}`,
                                })
                              }
                            >
                              {respUrls.length > 1 ? `Xem ảnh (${respUrls.length})` : "Xem ảnh"}
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{v.plotCode || "-"}</td>
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
                <th>Mã thửa</th>
                <th>Ngày mẫu</th>
                <th>Cadimi</th>
                <th>Dư lượng</th>
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
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#256b45", whiteSpace: "nowrap" }}>{t.code}</td>
                    <td style={{ fontFamily: "var(--font-num-stack)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{t.plotCode}</td>
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

      {onIssueAccount && (
        <div className="hh-detail-account-action">
          <button
            type="button"
            className={`btn ${household.accountId ? "btn-outline" : "btn-primary"} hh-detail-account-btn`}
            onClick={onIssueAccount}
          >
            {household.accountId ? "Cấp lại tài khoản" : "Cấp tài khoản mới"}
          </button>
        </div>
      )}

      {previewMedia && (
        <MediaBottomSheet
          urls={previewMedia.urls}
          title={previewMedia.title}
          subtitle={previewMedia.subtitle}
          onClose={() => setPreviewMedia(null)}
        />
      )}
    </Modal>
  );
}
