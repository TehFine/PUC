"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { todayIso } from "@/components/admin/catalog/form-utils";
import { FormGrid, SelectField, TextField } from "@/components/ui/form/fields";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { isCoopStaffRole } from "@/constants/roles";
import { useApiList } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import { usePersistedRecordSelection, usePersistedState } from "@/lib/back-navigation";
import type { HouseholdDto } from "@/types/api";
import type { VillageRecord } from "@/types/catalog";
import { buildUtf8CsvBlob, triggerBlobDownload } from "@/utils/download";
import {
  openPrintProgressWindow,
  renderPrintableReportAsync,
  type ReportBackendType,
  type ReportDataPayload,
} from "@/utils/report-pdf";

interface ReportSpec {
  id: string;
  index: string;
  category: string;
  type: ReportBackendType;
  title: string;
  docTitle: string;
  desc: string;
  formats: string[];
  supportsPhotoAppendix?: boolean;
}

const REPORTS: ReportSpec[] = [
  {
    id: "household-logbook",
    index: "01",
    category: "Hồ sơ hộ dân",
    type: "household-logbook",
    title: "Sổ nhật ký hộ dân",
    docTitle: "Sổ nhật ký canh tác điện tử nông hộ (VietGAP / GACC)",
    desc: "Tổng hợp sổ nhật ký theo hộ kèm phụ lục ảnh thực địa chuẩn A4.",
    formats: ["Xuất CSV", "In / PDF"],
    supportsPhotoAppendix: true,
  },
  {
    id: "households",
    index: "02",
    category: "Vùng trồng",
    type: "households",
    title: "Hộ vùng trồng",
    docTitle: "Báo cáo danh sách hộ vùng trồng (VietGAP / GACC)",
    desc: "Danh sách chủ hộ, số thửa, diện tích và đường dẫn hồ sơ số.",
    formats: ["Xuất CSV", "In / PDF"],
  },
  {
    id: "journal",
    index: "03",
    category: "Canh tác",
    type: "journal",
    title: "Nhật ký canh tác",
    docTitle: "Báo cáo nhật ký canh tác điện tử",
    desc: "Lịch sử chăm sóc, bón phân, tưới nước và trạng thái xác minh.",
    formats: ["Xuất CSV", "In / PDF"],
    supportsPhotoAppendix: true,
  },
  {
    id: "spray",
    index: "04",
    category: "Bảo vệ thực vật",
    type: "spray",
    title: "Nhật ký phun thuốc",
    docTitle: "Báo cáo nhật ký phun thuốc BVTV",
    desc: "Thuốc sử dụng, liều pha, ngày cách ly và minh chứng tại vườn.",
    formats: ["Xuất CSV", "In / PDF"],
    supportsPhotoAppendix: true,
  },
  {
    id: "lab-tests",
    index: "05",
    category: "An toàn mẫu",
    type: "lab-tests",
    title: "Kiểm nghiệm mẫu",
    docTitle: "Báo cáo kết quả kiểm nghiệm an toàn thực phẩm",
    desc: "Kết quả tồn dư BVTV, Cadimi và Vàng O.",
    formats: ["Xuất CSV", "In / PDF"],
  },
  {
    id: "violations",
    index: "06",
    category: "Giám sát",
    type: "violations",
    title: "Vi phạm quy trình",
    docTitle: "Báo cáo vi phạm và kết quả khắc phục",
    desc: "Cảnh báo sai phạm, phản hồi hộ dân và ảnh khắc phục.",
    formats: ["Xuất CSV", "In / PDF"],
    supportsPhotoAppendix: true,
  },
  {
    id: "harvest",
    index: "07",
    category: "Truy xuất",
    type: "harvest",
    title: "Lô hàng xuất khẩu",
    docTitle: "Báo cáo thống kê lô thu hoạch và xuất khẩu",
    desc: "Sản lượng thu mua, đóng gói và xuất khẩu.",
    formats: ["Xuất CSV", "In / PDF"],
  },
  {
    id: "training-registrations",
    index: "08",
    category: "Đào tạo",
    type: "training-registrations",
    title: "Điểm danh tập huấn",
    docTitle: "Báo cáo đăng ký và điểm danh lớp tập huấn",
    desc: "Danh sách đăng ký và điểm danh tập huấn.",
    formats: ["Xuất CSV", "In / PDF"],
  },
];

export default function Reports() {
  const { session } = useAuth();
  const canExportAudit = isCoopStaffRole(session?.user.role);
  const villages = useApiList<VillageRecord>(session ? "villages" : null);
  const households = useApiList<HouseholdDto>(session ? "households" : null);

  const [selectedReport, setSelectedReport] = usePersistedRecordSelection(
    "admin:reports:selected",
    REPORTS,
    (r) => r.id,
  );
  const [from, setFrom] = usePersistedState<string>("admin:reports:from", "");
  const [to, setTo] = usePersistedState<string>("admin:reports:to", todayIso());
  const [villageId, setVillageId] = usePersistedState<string>("admin:reports:village", "");
  const [householdId, setHouseholdId] = usePersistedState<string>("admin:reports:household", "");
  const [includePhotos, setIncludePhotos] = usePersistedState<boolean>(
    "admin:reports:include-photos",
    true,
  );
  const [includeInvoices, setIncludeInvoices] = usePersistedState<boolean>(
    "admin:reports:include-invoices",
    false,
  );
  const [format, setFormat] = usePersistedState<"CSV" | "PDF">(
    "admin:reports:format",
    "CSV",
    (v): v is "CSV" | "PDF" => v === "CSV" || v === "PDF",
  );
  const [downloading, setDownloading] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ReportDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredHouseholds = useMemo(() => {
    if (!villageId) return households.rows;
    return households.rows.filter((h) => String(h.villageId) === villageId);
  }, [households.rows, villageId]);

  const effectiveHouseholdId = useMemo(() => {
    if (!householdId) return "";
    if (households.loading && households.rows.length === 0) return householdId;
    return filteredHouseholds.some((h) => String(h.id) === householdId) ? householdId : "";
  }, [householdId, filteredHouseholds, households.loading, households.rows.length]);

  const handleVillageChange = (nextVillageId: string) => {
    setVillageId(nextVillageId);
    if (
      nextVillageId &&
      householdId &&
      !households.rows.some(
        (h) => String(h.id) === householdId && String(h.villageId) === nextVillageId,
      )
    ) {
      setHouseholdId("");
    }
  };

  const buildQueryString = (extra?: Record<string, string>) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (villageId) params.set("villageId", villageId);
    if (effectiveHouseholdId) params.set("householdId", effectiveHouseholdId);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        params.set(k, v);
      }
    }
    const q = params.toString();
    return q ? `?${q}` : "";
  };

  const dateRangeError =
    from && to && from > to ? "Ngày bắt đầu không được lớn hơn ngày kết thúc." : null;

  const previewKey =
    selectedReport && !dateRangeError
      ? `${selectedReport.type}|${from}|${to}|${villageId}|${effectiveHouseholdId}`
      : null;
  const [trackedPreviewKey, setTrackedPreviewKey] = useState<string | null>(previewKey);
  if (trackedPreviewKey !== previewKey) {
    setTrackedPreviewKey(previewKey);
    setPreviewData(null);
    setPreviewLoading(Boolean(previewKey));
    setError(null);
  }

  // Tự động tải dữ liệu xem trước khi mở hộp thoại hoặc đổi bộ lọc (gắn preview=1 để không sinh nhật ký xuất thừa)
  useEffect(() => {
    if (!selectedReport || dateRangeError) return;
    let active = true;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (villageId) params.set("villageId", villageId);
    if (effectiveHouseholdId) params.set("householdId", effectiveHouseholdId);
    params.set("format", "json");
    params.set("preview", "1");

    api
      .get<ReportDataPayload>(`/reports/${selectedReport.type}?${params.toString()}`)
      .then((res) => {
        if (active) setPreviewData(res);
      })
      .catch((err) => {
        if (active) {
          setPreviewData(null);
          setError(errorMessage(err, "Không tải được dữ liệu báo cáo."));
        }
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedReport, from, to, villageId, effectiveHouseholdId, dateRangeError]);

  const handleExport = async (report: ReportSpec, targetFormat: "CSV" | "PDF") => {
    if (from && to && from > to) {
      setError("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }
    setError(null);
    setPhotoProgress(null);
    setDownloading(true);

    const popupWin = targetFormat === "PDF" ? openPrintProgressWindow(report.docTitle) : null;
    try {
      const exportParams: Record<string, string> = {
        format: "json",
        export: "1",
      };
      if (canExportAudit) {
        exportParams.audit = "1";
      }
      const wantPhotos =
        targetFormat === "PDF" &&
        Boolean(effectiveHouseholdId) &&
        Boolean(report.supportsPhotoAppendix) &&
        includePhotos;
      if (wantPhotos) {
        exportParams.includePhotos = "1";
        if (canExportAudit && report.type === "household-logbook" && includeInvoices) {
          exportParams.includeInvoices = "1";
        }
      }

      const data = await api.get<ReportDataPayload>(
        `/reports/${report.type}${buildQueryString(exportParams)}`,
      );

      const selectedVillageName =
        villages.rows.find((v) => String(v.id) === villageId)?.name || "Tất cả thôn / tổ";

      if (targetFormat === "PDF") {
        const totalPhotos = data.evidencePhotos?.length ?? 0;
        if (totalPhotos > 0) {
          setPhotoProgress({ done: 0, total: totalPhotos });
        }
        await renderPrintableReportAsync(
          popupWin,
          report,
          data,
          {
            from,
            to,
            villageName: selectedVillageName,
          },
          (done, total) => setPhotoProgress({ done, total }),
        );
        const photoNote = totalPhotos > 0 ? `, kèm ${totalPhotos} ảnh minh chứng` : "";
        toast.success(`Đã mở bản in PDF "${report.title}" (${data.total} bản ghi${photoNote}).`);
        setSelectedReport(null);
      } else {
        const hhSuffix = data.householdMeta ? `-${data.householdMeta.code.toLowerCase()}` : "";
        const blob = buildUtf8CsvBlob(data.headers, data.rows);
        triggerBlobDownload(blob, `bao-cao-${report.type}${hhSuffix}-${to || todayIso()}.csv`);

        toast.success(`Đã tải xuống CSV "${report.title}" (${data.total} bản ghi).`);
        setSelectedReport(null);
      }
    } catch (err) {
      if (popupWin && !popupWin.closed) popupWin.close();
      const msg = errorMessage(err, "Không xuất được báo cáo.");
      setError(msg);
      toast.error(msg);
    } finally {
      setDownloading(false);
      setPhotoProgress(null);
    }
  };

  const householdOptions = useMemo(
    () =>
      filteredHouseholds.map((h) => ({
        value: String(h.id),
        label: `${h.name} (${h.code})`,
      })),
    [filteredHouseholds],
  );

  const exportButtonLabel = () => {
    if (downloading) {
      if (photoProgress && photoProgress.total > 0) {
        return `Đang chuẩn bị ảnh (${photoProgress.done}/${photoProgress.total})...`;
      }
      return "Đang xuất...";
    }
    return format === "PDF" ? "Xuất PDF" : "Tải CSV";
  };

  return (
    <>
      {/* Bộ lọc nhanh trên trang */}
      <div className="filter-bar report-filter-bar">
        <label className="report-filter-field">
          <span className="report-filter-label">Từ ngày</span>
          <input
            type="date"
            className="filter-select"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="report-filter-field">
          <span className="report-filter-label">Đến ngày</span>
          <input
            type="date"
            className="filter-select"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="report-filter-field report-filter-village">
          <span className="report-filter-label">Thôn / Tổ</span>
          <select
            className="filter-select"
            value={villageId}
            onChange={(e) => handleVillageChange(e.target.value)}
          >
            <option value="">Tất cả thôn / tổ</option>
            {villages.rows.map((v) => (
              <option key={v.id} value={String(v.id)}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="report-filter-field report-filter-household">
          <span className="report-filter-label">Nông hộ</span>
          <select
            className="filter-select"
            value={effectiveHouseholdId}
            onChange={(e) => setHouseholdId(e.target.value)}
          >
            <option value="">Tất cả nông hộ (Tổng hợp)</option>
            {filteredHouseholds.map((h) => (
              <option key={h.id} value={String(h.id)}>
                {h.name} ({h.code})
              </option>
            ))}
          </select>
        </label>
        <div className="report-filter-meta">
          {(from || villageId || effectiveHouseholdId) && (
            <button
              type="button"
              className="report-reset-btn"
              onClick={() => {
                setFrom("");
                setTo(todayIso());
                setVillageId("");
                setHouseholdId("");
              }}
            >
              Đặt lại
            </button>
          )}
          <span className="report-filter-count">
            {String(REPORTS.length).padStart(2, "0")} biểu mẫu
          </span>
        </div>
      </div>

      <div className="report-grid">
        {REPORTS.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            className="report-card"
            onClick={() => {
              setError(null);
              setFormat(r.type === "household-logbook" && effectiveHouseholdId ? "PDF" : "CSV");
              setSelectedReport(r);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setError(null);
                setFormat(r.type === "household-logbook" && effectiveHouseholdId ? "PDF" : "CSV");
                setSelectedReport(r);
              }
            }}
          >
            <div className="report-card-eyebrow">
              <span className="report-card-index">{r.index}</span>
              <span className="report-card-cat">{r.category}</span>
            </div>
            <div className="report-card-body">
              <div className="report-title">{r.title}</div>
              <div className="report-desc">{r.desc}</div>
            </div>
            <div className="report-formats">
              {r.formats.map((f) => {
                const isPdf = f.toLowerCase().includes("pdf");
                return (
                  <button
                    key={f}
                    type="button"
                    className={`report-format-btn${isPdf ? " is-pdf" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setError(null);
                      setFormat(isPdf ? "PDF" : "CSV");
                      setSelectedReport(r);
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedReport && (
        <Modal
          title={selectedReport.title}
          onClose={() => !downloading && setSelectedReport(null)}
          width={680}
          footer={
            <>
              <button
                type="button"
                className="btn btn-outline"
                disabled={downloading}
                onClick={() => setSelectedReport(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={downloading || previewLoading}
                onClick={() => void handleExport(selectedReport, format)}
              >
                {exportButtonLabel()}
              </button>
            </>
          }
        >
          <p
            style={{
              marginTop: 0,
              marginBottom: 12,
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--text-secondary)",
            }}
          >
            {selectedReport.desc}
          </p>
          <div className="form-group">
            <label>Phạm vi thời gian</label>
            <div className="format-btns">
              <button
                type="button"
                className={`fmt-btn ${!from && !to ? "active" : ""}`}
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Toàn bộ lịch sử
              </button>
              <button
                type="button"
                className={`fmt-btn ${Boolean(from || to) ? "active" : ""}`}
                onClick={() => {
                  if (!from && !to) setTo(todayIso());
                }}
              >
                Tính đến thời điểm
              </button>
            </div>
          </div>
          {(from || to) && (
            <FormGrid>
              <TextField label="Từ ngày (để trống = từ đầu)" type="date" value={from} onChange={setFrom} />
              <TextField label="Tính đến ngày" type="date" value={to} onChange={setTo} />
            </FormGrid>
          )}
          <FormGrid>
            <SelectField
              label="Thôn / Tổ"
              value={villageId}
              onChange={handleVillageChange}
              placeholder="Tất cả thôn / tổ"
              options={villages.rows.map((v) => ({ value: String(v.id), label: v.name }))}
            />
            <SelectField
              label="Phạm vi nông hộ"
              value={effectiveHouseholdId}
              onChange={setHouseholdId}
              placeholder="Tất cả nông hộ (Báo cáo tổng hợp)"
              options={householdOptions}
            />
          </FormGrid>
          <div className="form-group">
            <label>Định dạng xuất</label>
            <div className="format-btns">
              {(["CSV", "PDF"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`fmt-btn ${format === f ? "active" : ""}`}
                  onClick={() => setFormat(f)}
                >
                  {f === "CSV" ? "Tệp CSV" : "Bản in PDF"}
                </button>
              ))}
            </div>
          </div>

          {format === "PDF" && selectedReport.supportsPhotoAppendix && (
            <div className="report-photo-options">
              {effectiveHouseholdId ? (
                <>
                  <label className="report-photo-check">
                    <input
                      type="checkbox"
                      checked={includePhotos}
                      onChange={(e) => setIncludePhotos(e.target.checked)}
                    />
                    <span>
                      Đính kèm phụ lục hình ảnh minh chứng thực địa (Phần II trên khổ giấy A4, tự động nén tối ưu dung lượng)
                    </span>
                  </label>
                  {canExportAudit && selectedReport.type === "household-logbook" && includePhotos && (
                    <label className="report-photo-check">
                      <input
                        type="checkbox"
                        checked={includeInvoices}
                        onChange={(e) => setIncludeInvoices(e.target.checked)}
                      />
                      <span>
                        Bao gồm ảnh chứng từ, hóa đơn vật tư lưu nội bộ HTX (chỉ dành cho kiểm toán nội bộ)
                      </span>
                    </label>
                  )}
                </>
              ) : (
                <div className="report-photo-mode-hint">
                  Đang ở chế độ tổng hợp nhiều hộ: tệp PDF giữ bố cục bảng gọn nhẹ kèm đường dẫn hồ sơ số của từng hộ. Chọn một nông hộ cụ thể ở ô Phạm vi nông hộ để xuất kèm phụ lục hình ảnh thực địa.
                </div>
              )}
            </div>
          )}

          <div
            style={{
              marginTop: 12,
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
              background: "#f8faf9",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink)",
                background: "#f1f5f3",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>
                {previewData?.householdMeta
                  ? `Xem trước hồ sơ hộ ${previewData.householdMeta.name} (${previewData.householdMeta.code})`
                  : "Xem trước dữ liệu báo cáo"}
              </span>
              <span>
                {previewLoading ? "Đang tải..." : `Tổng cộng: ${previewData?.total ?? 0} bản ghi`}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              {previewLoading ? (
                <div
                  style={{
                    padding: 20,
                    textAlign: "center",
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                  }}
                >
                  Đang tổng hợp dữ liệu báo cáo...
                </div>
              ) : !previewData || previewData.rows.length === 0 ? (
                <div
                  style={{
                    padding: 20,
                    textAlign: "center",
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                  }}
                >
                  Chưa có bản ghi nào trong khoảng thời gian và phạm vi đã chọn.
                </div>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <thead>
                    <tr>
                      {previewData.headers.map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "7px 10px",
                            textAlign: "left",
                            borderBottom: "1px solid var(--border)",
                            background: "#fff",
                            whiteSpace: "nowrap",
                            fontWeight: 600,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.slice(0, 8).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            style={{
                              padding: "6px 10px",
                              borderBottom: "1px solid rgba(20,55,47,0.06)",
                              whiteSpace: "nowrap",
                              maxWidth: 220,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={cell}
                          >
                            {cell || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {previewData && previewData.total > 8 && (
              <div
                style={{
                  padding: "6px 12px",
                  fontSize: 11.5,
                  color: "var(--text-muted)",
                  borderTop: "1px solid var(--border)",
                  background: "#fff",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                Hiển thị 8 dòng đầu tiên trên tổng số {previewData.total} bản ghi sẽ được xuất.
              </div>
            )}
          </div>

          <FormError message={dateRangeError ?? error} />
        </Modal>
      )}
    </>
  );
}
