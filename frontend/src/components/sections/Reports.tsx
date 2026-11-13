"use client";

import { useEffect, useState } from "react";
import { todayIso } from "@/components/admin/catalog/form-utils";
import { FormGrid, SelectField, TextField } from "@/components/ui/form/fields";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useApiList } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import type { VillageRecord } from "@/types/catalog";
import { buildUtf8CsvBlob, triggerBlobDownload } from "@/utils/download";

type ReportBackendType =
  | "households"
  | "journal"
  | "spray"
  | "lab-tests"
  | "violations"
  | "harvest"
  | "training-registrations";

interface ReportSpec {
  id: string;
  type: ReportBackendType;
  title: string;
  desc: string;
  formats: string[];
}

interface ReportDataPayload {
  type: ReportBackendType;
  filename: string;
  headers: string[];
  rows: string[][];
  total: number;
}

const REPORTS: ReportSpec[] = [
  {
    id: "households",
    type: "households",
    title: "Báo cáo danh sách hộ vùng trồng (VietGAP / GACC)",
    desc: "Tổng hợp thông tin chủ hộ, thôn/tổ, số thửa, diện tích và trạng thái tuân thủ tiêu chuẩn",
    formats: ["CSV (Excel)", "In / PDF"],
  },
  {
    id: "journal",
    type: "journal",
    title: "Nhật ký canh tác điện tử",
    desc: "Tổng hợp các hoạt động chăm sóc, bón phân, tỉa cành theo hộ và khoảng thời gian",
    formats: ["CSV (Excel)", "In / PDF"],
  },
  {
    id: "spray",
    type: "spray",
    title: "Nhật ký phun thuốc BVTV",
    desc: "Tổng hợp lịch sử phun thuốc, hoạt chất, liều lượng, ngày cách ly và trạng thái MRL",
    formats: ["CSV (Excel)", "In / PDF"],
  },
  {
    id: "lab-tests",
    type: "lab-tests",
    title: "Kết quả kiểm nghiệm an toàn thực phẩm",
    desc: "Dư lượng thuốc BVTV, Cadimi (Cd), Vàng O tổng hợp theo các đợt lấy mẫu",
    formats: ["CSV (Excel)", "In / PDF"],
  },
  {
    id: "violations",
    type: "violations",
    title: "Báo cáo vi phạm & Khắc phục",
    desc: "Danh sách cảnh báo vi phạm, phản hồi từ nông hộ và kết quả xử lý của HTX",
    formats: ["CSV (Excel)", "In / PDF"],
  },
  {
    id: "harvest",
    type: "harvest",
    title: "Thống kê lô thu hoạch & Xuất khẩu",
    desc: "Sản lượng, thị trường tiêu thụ, đơn vị thu mua và trạng thái vận chuyển từng lô",
    formats: ["CSV (Excel)", "In / PDF"],
  },
  {
    id: "training-registrations",
    type: "training-registrations",
    title: "Báo cáo đăng ký & Điểm danh tập huấn",
    desc: "Danh sách hộ nông dân đăng ký tham gia các lớp tập huấn kỹ thuật và trạng thái điểm danh",
    formats: ["CSV (Excel)", "In / PDF"],
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatIsoToVn(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function buildPrintableReportHtml(
  report: ReportSpec,
  data: ReportDataPayload,
  meta: { from: string; to: string; villageName: string },
): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  const dateRangeLabel =
    meta.from && meta.to
      ? `Từ ngày ${formatIsoToVn(meta.from)} đến ngày ${formatIsoToVn(meta.to)}`
      : meta.from
        ? `Từ ngày ${formatIsoToVn(meta.from)} đến nay`
        : meta.to
          ? `Tính đến ngày ${formatIsoToVn(meta.to)}`
          : "Toàn bộ thời gian";

  const theadHtml = data.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const tbodyHtml =
    data.rows.length === 0
      ? `<tr><td colspan="${data.headers.length + 1}" style="text-align:center;padding:24px;color:#64748b;">Không có dữ liệu phù hợp trong khoảng lọc đã chọn.</td></tr>`
      : data.rows
          .map(
            (row, idx) =>
              `<tr><td style="text-align:center;font-weight:600;">${idx + 1}</td>${row
                .map((cell) => `<td>${escapeHtml(cell || "—")}</td>`)
                .join("")}</tr>`,
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)} - HTX Cư Né</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      color: #0f172a;
      margin: 0;
      padding: 20px 24px;
      background: #fff;
      font-size: 13px;
      line-height: 1.45;
    }
    .print-toolbar {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px dashed #cbd5e1;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .print-btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #14372f;
      background: #14372f;
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .print-btn.secondary {
      background: #fff;
      color: #14372f;
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 18px;
    }
    .doc-org, .doc-nation {
      text-align: center;
    }
    .doc-org strong, .doc-nation strong {
      display: block;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .doc-org span, .doc-nation span {
      display: inline-block;
      font-size: 12.5px;
      font-weight: 700;
      padding-bottom: 3px;
      border-bottom: 1px solid #0f172a;
      margin-top: 2px;
    }
    .doc-title-wrap {
      text-align: center;
      margin: 14px 0 16px;
    }
    .doc-title {
      font-size: 19px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 0 0 6px;
      color: #14372f;
    }
    .doc-meta {
      font-size: 13px;
      color: #334155;
      margin: 2px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #475569;
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: center;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .doc-summary {
      margin-top: 10px;
      font-size: 13px;
      font-weight: 700;
    }
    .doc-Validations {
      display: flex;
      justify-content: space-between;
      margin-top: 26px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sig-box {
      width: 42%;
      text-align: center;
    }
    .sig-date {
      font-style: italic;
      font-size: 12.5px;
      margin-bottom: 4px;
    }
    .sig-role {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 13px;
    }
    .sig-note {
      font-style: italic;
      font-size: 12px;
      color: #475569;
      margin-bottom: 64px;
    }
    @media print {
      .print-toolbar { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button type="button" id="report-btn-print" class="print-btn">In báo cáo / Lưu PDF</button>
    <button type="button" id="report-btn-close" class="print-btn secondary">Đóng cửa sổ</button>
  </div>
  <div class="doc-header">
    <div class="doc-org">
      <strong>HỢP TÁC XÃ NÔNG NGHIỆP CƯ NÉ</strong>
      <span>HỆ THỐNG QUẢN LÝ VÙNG TRỒNG PUC</span>
    </div>
    <div class="doc-nation">
      <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong>
      <span>Độc lập - Tự do - Hạnh phúc</span>
    </div>
  </div>
  <div class="doc-title-wrap">
    <h1 class="doc-title">${escapeHtml(report.title)}</h1>
    <div class="doc-meta"><strong>Phạm vi khu vực:</strong> ${escapeHtml(meta.villageName)} &nbsp;|&nbsp; <strong>Kỳ báo cáo:</strong> ${escapeHtml(dateRangeLabel)}</div>
    <div class="doc-meta">${escapeHtml(report.desc)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:42px;">STT</th>
        ${theadHtml}
      </tr>
    </thead>
    <tbody>
      ${tbodyHtml}
    </tbody>
  </table>
  <div class="doc-summary">Tổng số bản ghi: ${data.total}</div>
  <div class="doc-Validations">
    <div class="sig-box">
      <div class="sig-date">&nbsp;</div>
      <div class="sig-role">Người lập biểu</div>
      <div class="sig-note">(Ký, ghi rõ họ tên)</div>
    </div>
    <div class="sig-box">
      <div class="sig-date">Cư Né, ngày ${day} tháng ${month} năm ${year}</div>
      <div class="sig-role">TM. Ban Giám Đốc HTX Cư Né</div>
      <div class="sig-note">(Ký tên, đóng dấu)</div>
    </div>
  </div>
</body>
</html>`;
}

/** Dự phòng in qua iframe ẩn khi trình duyệt di động hoặc WebView chặn mở cửa sổ mới. */
function printHtmlViaHiddenIframe(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      iframe.remove();
    }, 60_000);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  };

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  } else {
    iframe.remove();
  }
}

function renderPrintableReport(
  win: Window | null,
  report: ReportSpec,
  data: ReportDataPayload,
  meta: { from: string; to: string; villageName: string },
): void {
  const html = buildPrintableReportHtml(report, data, meta);
  if (win && !win.closed) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.getElementById("report-btn-print")?.addEventListener("click", () => {
      win.focus();
      win.print();
    });
    win.document.getElementById("report-btn-close")?.addEventListener("click", () => {
      win.close();
    });
    setTimeout(() => {
      if (!win.closed) {
        win.focus();
        win.print();
      }
    }, 250);
    return;
  }
  printHtmlViaHiddenIframe(html);
}

export default function Reports() {
  const villages = useApiList<VillageRecord>("villages");
  const [selectedReport, setSelectedReport] = useState<ReportSpec | null>(null);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>(todayIso);
  const [villageId, setVillageId] = useState<string>("");
  const [format, setFormat] = useState<"CSV" | "PDF">("CSV");
  const [downloading, setDownloading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ReportDataPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildQueryString = (extra?: Record<string, string>) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (villageId) params.set("villageId", villageId);
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
      ? `${selectedReport.type}|${from}|${to}|${villageId}`
      : null;
  const [trackedPreviewKey, setTrackedPreviewKey] = useState<string | null>(previewKey);
  if (trackedPreviewKey !== previewKey) {
    setTrackedPreviewKey(previewKey);
    setPreviewData(null);
    setPreviewLoading(Boolean(previewKey));
    setError(null);
  }

  // Tự động tải dữ liệu xem trước khi mở modal hoặc đổi bộ lọc
  useEffect(() => {
    if (!selectedReport || dateRangeError) return;
    let active = true;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (villageId) params.set("villageId", villageId);
    params.set("format", "json");

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
  }, [selectedReport, from, to, villageId, dateRangeError]);

  const handleExport = async (report: ReportSpec, targetFormat: "CSV" | "PDF") => {
    if (from && to && from > to) {
      setError("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }
    setError(null);
    setDownloading(true);
    // Mở cửa sổ in đồng bộ ngay trong sự kiện click để trình duyệt Safari / Mobile không chặn popup
    const popupWin = targetFormat === "PDF" ? window.open("", "_blank", "width=1080,height=800") : null;
    try {
      // Luôn tải bản xuất đầy đủ (audit=1) thay vì tái sử dụng bản xem trước (vốn chỉ lấy tối đa 50 dòng & che CCCD).
      const data = await api.get<ReportDataPayload>(
        `/reports/${report.type}${buildQueryString({ format: "json", audit: "1" })}`,
      );

      const selectedVillageName =
        villages.rows.find((v) => String(v.id) === villageId)?.name || "Tất cả thôn / tổ";

      if (targetFormat === "PDF") {
        renderPrintableReport(popupWin, report, data, {
          from,
          to,
          villageName: selectedVillageName,
        });
        toast.success(`Đã mở bản in / PDF cho "${report.title}" (${data.total} bản ghi).`);
        setSelectedReport(null);
      } else {
        const blob = buildUtf8CsvBlob(data.headers, data.rows);
        triggerBlobDownload(blob, `bao-cao-${report.type}-${to || todayIso()}.csv`);

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
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Báo Cáo</h1>
        </div>
      </div>

      {/* Bộ lọc nhanh trên trang */}
      <div className="filter-bar report-filter-bar" style={{ marginBottom: 18 }}>
        <label className="report-filter-field">
          <span className="report-filter-label">Từ ngày</span>
          <input type="date" className="filter-select" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="report-filter-field">
          <span className="report-filter-label">Đến ngày</span>
          <input type="date" className="filter-select" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="report-filter-field report-filter-village">
          <span className="report-filter-label">Thôn / Tổ</span>
          <select className="filter-select" value={villageId} onChange={(e) => setVillageId(e.target.value)}>
            <option value="">Tất cả thôn / tổ</option>
            {villages.rows.map((v) => (
              <option key={v.id} value={String(v.id)}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="report-grid">
        {REPORTS.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            className="report-card"
            style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
            onClick={() => {
              setError(null);
              setFormat("CSV");
              setSelectedReport(r);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setError(null);
                setFormat("CSV");
                setSelectedReport(r);
              }
            }}
          >
            <div className="report-title">{r.title}</div>
            <div className="report-desc">{r.desc}</div>
            <div className="report-formats">
              {r.formats.map((f) => {
                const isPdf = f.toLowerCase().includes("pdf");
                return (
                  <button
                    key={f}
                    type="button"
                    className="report-format-btn"
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
                {downloading
                  ? "Đang xử lý…"
                  : format === "PDF"
                    ? `In báo cáo / Lưu PDF (${previewData?.total ?? 0})`
                    : `Tải xuống CSV (${previewData?.total ?? 0})`}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0, fontSize: 13.5, color: "var(--text-secondary)" }}>{selectedReport.desc}</p>
          <FormGrid>
            <TextField label="Từ ngày (để trống = tất cả)" type="date" value={from} onChange={setFrom} />
            <TextField label="Đến ngày" type="date" value={to} onChange={setTo} />
          </FormGrid>
          <SelectField
            label="Thôn / Tổ"
            value={villageId}
            onChange={setVillageId}
            placeholder="Tất cả thôn / tổ"
            options={villages.rows.map((v) => ({ value: String(v.id), label: v.name }))}
          />
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
                  {f === "CSV" ? "CSV (Excel UTF-8)" : "In / Xuất PDF (Mẫu A4 HTX Cư Né)"}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              background: "#f8faf9",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink)",
                background: "#f1f5f3",
              }}
            >
              <span>Xem trước dữ liệu báo cáo</span>
              <span>
                {previewLoading ? "Đang tải…" : `Tổng cộng: ${previewData?.total ?? 0} bản ghi`}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              {previewLoading ? (
                <div style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: "var(--text-muted)" }}>
                  Đang tổng hợp dữ liệu báo cáo…
                </div>
              ) : !previewData || previewData.rows.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: "var(--text-muted)" }}>
                  Chưa có bản ghi nào trong khoảng thời gian / thôn đã chọn.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
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
                          >
                            {cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <FormError message={dateRangeError || error} />
        </Modal>
      )}
    </>
  );
}
