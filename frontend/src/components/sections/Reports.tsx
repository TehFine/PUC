"use client";

import { useState } from "react";
import { todayIso } from "@/components/admin/catalog/form-utils";
import { FormGrid, SelectField, TextField } from "@/components/ui/form/fields";
import { FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useApiList } from "@/hooks/use-api";
import type { VillageRecord } from "@/types/catalog";

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
    title: "Báo cáo đăng ký & Tham dự tập huấn",
    desc: "Danh sách nông hộ đăng ký và điểm danh các lớp tập huấn kỹ thuật",
    formats: ["CSV (Excel)", "In / PDF"],
  },
];

function firstDayOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export default function Reports() {
  const villages = useApiList<VillageRecord>("villages");
  const [selectedReport, setSelectedReport] = useState<ReportSpec | null>(null);
  const [from, setFrom] = useState<string>(firstDayOfYear);
  const [to, setTo] = useState<string>(todayIso);
  const [villageId, setVillageId] = useState<string>("");
  const [format, setFormat] = useState<"CSV" | "PDF">("CSV");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadReport = async (report: ReportSpec) => {
    if (from && to && from > to) {
      setError("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }
    setError(null);
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (villageId) params.set("villageId", villageId);
      const query = params.toString();
      const url = `/api/reports/${report.type}${query ? `?${query}` : ""}`;

      const response = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || "Không xuất được báo cáo.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `bao-cao-${report.type}-${to || todayIso()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      toast.success(`Đã tải xuống báo cáo "${report.title}".`);
      setSelectedReport(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không tải được báo cáo.";
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
              setSelectedReport(r);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setError(null);
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
          width={500}
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
                disabled={downloading}
                onClick={() => void downloadReport(selectedReport)}
              >
                {downloading ? "Đang xuất tệp…" : "Tải xuống CSV"}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0, fontSize: 13.5, color: "var(--text-secondary)" }}>{selectedReport.desc}</p>
          <FormGrid>
            <TextField label="Từ ngày" type="date" value={from} onChange={setFrom} />
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
                  {f === "CSV" ? "CSV (Excel UTF-8)" : "CSV chuẩn in"}
                </button>
              ))}
            </div>
          </div>
          <FormError message={error} />
        </Modal>
      )}
    </>
  );
}
