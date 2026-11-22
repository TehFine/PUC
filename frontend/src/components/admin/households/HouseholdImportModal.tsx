"use client";

import { useMemo, useRef, useState } from "react";
import { FormError, Modal, ModalDismissButton } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { triggerBlobDownload } from "@/utils/download";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import type { VillageDto } from "@/types/api";
import type { HouseholdImportResult, HouseholdInput, HouseholdStatus } from "@/types/households";

const SAMPLE_CSV = `Mã hộ,Họ tên,CCCD,Số ĐT,Địa bàn,Số thửa,Diện tích,Trạng thái
KB-250,Nguyễn Văn Minh,260123456780,0912345670,1,2,1.5,Đủ chuẩn
KB-251,Trần Thị Lan,260123456781,0912345671,2,1,0.8,Chờ duyệt`;

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

const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;

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
  const villageIdx = idxOf("villageid", "village", "thon", "thonto", "mathon", "diaban");
  const plotIdx = idxOf("plotcount", "plots", "sothua");
  const areaIdx = idxOf("areaha", "area", "dientich", "dientichha");
  const statusIdx = idxOf("status", "trangthai");

  const rows: Partial<HouseholdInput>[] = [];
  for (let i = 1; i < lines.length && rows.length < MAX_IMPORT_ROWS; i++) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<HouseholdImportResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const parsedRows = useMemo(
    () => (csvText.trim() ? parseHouseholdsCsv(csvText, villages) : []),
    [csvText, villages],
  );

  const uploader = useMutation(async (rows: Partial<HouseholdInput>[]) => {
    return api.post<HouseholdImportResult>("/households/import", { rows: rows.slice(0, MAX_IMPORT_ROWS) });
  });

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_CSV_FILE_BYTES) {
      setFileName(null);
      setResult(null);
      setLocalError("Tệp CSV không được vượt quá 5 MB.");
      return;
    }
    setFileName(file.name);
    setResult(null);
    setLocalError(null);
    const text = await file.text();
    setCsvText(text);
  };

  const downloadSample = () => {
    const normalizedCsv = SAMPLE_CSV.replace(/\r?\n/g, "\r\n");
    const blob = new Blob([`\uFEFF${normalizedCsv}\r\n`], { type: "text/csv;charset=utf-8;" });
    triggerBlobDownload(blob, "mau-nhap-ho-nong-dan.csv");
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
      title="Nhập danh sách hộ dân"
      onClose={uploader.pending ? () => undefined : onClose}
      width={600}
      footer={
        <>
          <ModalDismissButton
            className="btn btn-outline"
            onFallbackClose={onClose}
            disabled={uploader.pending}
          >
            Hủy
          </ModalDismissButton>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runImport()}
            disabled={uploader.pending || parsedRows.length === 0}
          >
            {uploader.pending
              ? "Đang nhập…"
              : parsedRows.length > 0
                ? `Nhập ${parsedRows.length} hộ`
                : "Nhập dữ liệu"}
          </button>
        </>
      }
    >
      <p className="hh-import-lead">
        Hỗ trợ tệp CSV xuất từ Excel (mã UTF-8). Hộ trùng mã sẽ tự động cập nhật.
      </p>

      <div className="form-group">
        <label htmlFor="household-csv-file">Tệp dữ liệu CSV</label>
        <input
          ref={fileInputRef}
          id="household-csv-file"
          type="file"
          accept=".csv,.txt,text/csv"
          hidden
          onChange={(e) => void handleFile(e)}
        />
        <div className="hh-import-file-box">
          <span className={`hh-import-file-name ${fileName ? "has-file" : ""}`}>
            {fileName ? `${fileName} (${parsedRows.length} hộ)` : "Chưa chọn tệp nào"}
          </span>
          <button
            type="button"
            className="hh-import-primary-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploader.pending}
          >
            Chọn tệp
          </button>
        </div>
      </div>

      <div className="hh-import-tools">
        <button
          type="button"
          className="hh-import-tool-btn"
          onClick={downloadSample}
          disabled={uploader.pending}
        >
          Tải tệp mẫu
        </button>
        <button
          type="button"
          className="hh-import-tool-btn"
          onClick={() => {
            setFileName(null);
            setCsvText(SAMPLE_CSV);
            setResult(null);
            setLocalError(null);
          }}
          disabled={uploader.pending}
        >
          Điền dữ liệu mẫu
        </button>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <div className="hh-import-text-head">
          <label htmlFor="household-csv-text">Dán trực tiếp dữ liệu CSV</label>
          {csvText && (
            <button
              type="button"
              className="hh-import-clear-btn"
              onClick={() => {
                setFileName(null);
                setCsvText("");
                setResult(null);
                setLocalError(null);
              }}
              disabled={uploader.pending}
            >
              Xóa nội dung
            </button>
          )}
        </div>
        <textarea
          id="household-csv-text"
          className="form-input mono hh-import-textarea"
          rows={5}
          wrap="off"
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setResult(null);
            setLocalError(null);
          }}
          placeholder={"Mã hộ, Họ tên, CCCD, Số ĐT, Địa bàn\nKB-250, Nguyễn Văn Minh, 260123456780, 0912345670, 1"}
        />
        <small className="hh-import-count">
          Nhận diện: <strong>{parsedRows.length}</strong> hộ hợp lệ (tối đa {MAX_IMPORT_ROWS.toLocaleString("vi-VN")} hộ mỗi lần).
        </small>
      </div>

      {result && (
        <div role="status" className="hh-import-result">
          <div className="hh-import-result-summary">
            Kết quả: tạo mới <span className="is-ok">{result.created}</span>, cập nhật{" "}
            <span className="is-info">{result.updated}</span>, lỗi{" "}
            <span className={result.errors.length > 0 ? "is-err" : ""}>{result.errors.length}</span>
          </div>
          {result.errors.length > 0 && (
            <ul className="hh-import-result-errors">
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
