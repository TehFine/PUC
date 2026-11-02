"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import type { VillageDto } from "@/types/api";
import type { HouseholdImportResult, HouseholdInput, HouseholdStatus } from "@/types/households";

const SAMPLE_CSV = `code,name,cccd,phone,villageId,plotCount,areaHa,status
KB-250,Nguyễn Văn Minh,260123456780,0912345670,1,2,1.5,qualified
KB-251,Trần Thị Lan,260123456781,0912345671,2,1,0.8,pending`;

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

const VALID_STATUSES = new Set<HouseholdStatus>(["qualified", "improve", "pending", "violation"]);

function resolveStatus(val: string | undefined): HouseholdStatus | undefined {
  if (!val) return undefined;
  const clean = val.trim().toLowerCase();
  if (VALID_STATUSES.has(clean as HouseholdStatus)) return clean as HouseholdStatus;
  if (clean.includes("du chuan") || clean.includes("đủ chuẩn")) return "qualified";
  if (clean.includes("cai thien") || clean.includes("cải thiện")) return "improve";
  if (clean.includes("vi pham") || clean.includes("vi phạm")) return "violation";
  if (clean.includes("cho duyet") || clean.includes("chờ duyệt")) return "pending";
  return undefined;
}

export function parseHouseholdsCsv(text: string, villages: VillageDto[]): Partial<HouseholdInput>[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const first = lines[0];
  const delimiter = first.includes("\t") ? "\t" : first.includes(";") && !first.includes(",") ? ";" : ",";
  const headers = splitCsvLine(first, delimiter).map(normalizeHeader);

  const idxOf = (...candidates: string[]) => headers.findIndex((h) => candidates.includes(h));
  const codeIdx = idxOf("code", "maho", "mavung", "mavungtrong", "ma");
  const nameIdx = idxOf("name", "hoten", "tenchuho", "ten", "hovaten");
  const cccdIdx = idxOf("cccd", "socccd", "cmnd");
  const phoneIdx = idxOf("phone", "sdt", "sodienthoai", "dienthoai", "sodt");
  const villageIdx = idxOf("villageid", "village", "thon", "thonto", "mathon");
  const plotIdx = idxOf("plotcount", "plots", "sothua");
  const areaIdx = idxOf("areaha", "area", "dientich", "dientichha");
  const statusIdx = idxOf("status", "trangthai");

  const rows: Partial<HouseholdInput>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    if (cols.every((c) => !c)) continue;

    const get = (idx: number, fallbackIdx: number) => (idx >= 0 ? cols[idx] : cols[fallbackIdx])?.trim() ?? "";
    const code = get(codeIdx, 0);
    const name = get(nameIdx, 1);
    const cccd = get(cccdIdx, 2).replace(/\s+/g, "");
    const phone = get(phoneIdx, 3).replace(/[\s.-]/g, "");
    const rawVillage = get(villageIdx, 4);

    let villageId = Number(rawVillage);
    if (!Number.isFinite(villageId) || villageId <= 0) {
      const matched = villages.find((v) => v.name.toLowerCase() === rawVillage.toLowerCase());
      if (matched) {
        villageId = matched.id;
      } else {
        const digits = rawVillage.match(/\d+/)?.[0];
        villageId = digits ? Number(digits) : 1;
      }
    }

    const rawPlots = plotIdx >= 0 ? cols[plotIdx]?.trim() : cols[5]?.trim();
    const rawArea = areaIdx >= 0 ? cols[areaIdx]?.trim() : cols[6]?.trim();
    const rawStatus = statusIdx >= 0 ? cols[statusIdx]?.trim() : cols[7]?.trim();

    const row: Partial<HouseholdInput> = {
      code,
      name,
      cccd,
      phone,
      villageId,
    };
    if (rawPlots) {
      const n = Number(rawPlots.replace(",", "."));
      if (Number.isFinite(n)) row.plotCount = Math.round(n);
    }
    if (rawArea) {
      const n = Number(rawArea.replace(",", "."));
      if (Number.isFinite(n)) row.areaHa = n;
    }
    const st = resolveStatus(rawStatus);
    if (st) row.status = st;

    rows.push(row);
  }
  return rows;
}

export default function HouseholdImportModal({
  villages,
  onClose,
  onImported,
}: {
  villages: VillageDto[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<HouseholdImportResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const parsedRows = csvText.trim() ? parseHouseholdsCsv(csvText, villages) : [];

  const uploader = useMutation(async (rows: Partial<HouseholdInput>[]) => {
    return api.post<HouseholdImportResult>("/households/import", { rows });
  });

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setLocalError(null);
    const text = await file.text();
    setCsvText(text);
  };

  const downloadSample = () => {
    const blob = new Blob(["\uFEFF" + SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mau-nhap-ho-nong-dan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    setLocalError(null);
    if (parsedRows.length === 0) {
      setLocalError("Chưa có dòng dữ liệu hợp lệ nào. Vui lòng chọn tệp CSV hoặc dán nội dung kèm dòng tiêu đề.");
      return;
    }
    const res = await uploader.run(parsedRows);
    if (!res) return;
    setResult(res);
    toast.success(`Nhập hộ hoàn tất: tạo mới ${res.created}, cập nhật ${res.updated}.`);
    notifyCountsChanged();
    onImported();
  };

  return (
    <Modal
      title="Import danh sách hộ nông dân (CSV / Excel)"
      onClose={uploader.pending ? () => undefined : onClose}
      width={640}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={downloadSample} disabled={uploader.pending}>
            Tải file CSV mẫu
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={uploader.pending}>
            Đóng
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runImport()}
            disabled={uploader.pending || parsedRows.length === 0}
          >
            {uploader.pending ? "Đang nhập…" : `Nhập ${parsedRows.length} hộ`}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 12 }}>
        Hỗ trợ tệp <strong>.csv</strong> (xuất từ Excel với mã UTF-8). Cột bắt buộc:{" "}
        <code>code, name, cccd, phone, villageId</code> (hoặc tên thôn). Nếu trùng <code>code</code> hệ thống sẽ cập nhật hộ đó.
      </p>

      <div className="form-group">
        <label htmlFor="household-csv-file">Chọn tệp CSV từ máy tính</label>
        <input
          id="household-csv-file"
          type="file"
          accept=".csv,.txt,text/csv"
          className="form-input"
          onChange={(e) => void handleFile(e)}
        />
        {fileName && (
          <small style={{ display: "block", marginTop: 4, color: "var(--text-secondary)" }}>
            Đã tải: <strong>{fileName}</strong> ({parsedRows.length} dòng)
          </small>
        )}
      </div>

      <div className="form-group">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label htmlFor="household-csv-text" style={{ margin: 0 }}>
            Hoặc dán trực tiếp dữ liệu CSV
          </label>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ padding: "4px 10px", fontSize: 11.5 }}
            onClick={() => {
              setCsvText(SAMPLE_CSV);
              setResult(null);
              setLocalError(null);
            }}
          >
            Điền dữ liệu mẫu
          </button>
        </div>
        <textarea
          id="household-csv-text"
          className="form-input mono"
          rows={6}
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setResult(null);
            setLocalError(null);
          }}
          placeholder={SAMPLE_CSV}
        />
        <small style={{ display: "block", marginTop: 4, color: "var(--text-muted)" }}>
          Đã nhận diện: <strong>{parsedRows.length}</strong> dòng dữ liệu.
        </small>
      </div>

      {result && (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: "12px 16px",
            borderRadius: 14,
            background: result.errors.length > 0 ? "#fdf4e8" : "#eef8e3",
            border: "1px solid var(--border)",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Kết quả nhập: Tạo mới <span style={{ color: "#277a48" }}>{result.created}</span> · Cập nhật{" "}
            <span style={{ color: "#235f92" }}>{result.updated}</span> · Lỗi{" "}
            <span style={{ color: result.errors.length > 0 ? "#b73c20" : "inherit" }}>{result.errors.length}</span>
          </div>
          {result.errors.length > 0 && (
            <ul style={{ margin: "6px 0 0 18px", maxHeight: 140, overflowY: "auto", color: "#9a2f17", fontSize: 12.5 }}>
              {result.errors.map((err, idx) => (
                <li key={idx}>
                  Dòng {err.row}: {err.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <FormError message={localError || uploader.error} />
    </Modal>
  );
}
