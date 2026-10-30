"use client";

import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { X, Printer, Download, Sparkles, Tag, Package, Check, RefreshCw } from "lucide-react";
import type { HarvestLot, HarvestItem } from "@/types/entities";
import { api } from "@/lib/api-client";

interface Props {
  lot: HarvestLot;
  onClose: () => void;
}

interface ItemWithQr extends HarvestItem {
  qrDataUrl?: string;
}

export default function BatchQrModal({ lot, onClose }: Props) {
  const [itemType, setItemType] = useState<"fruit" | "box">("fruit");
  const [count, setCount] = useState<number>(12);
  const [grade, setGrade] = useState<"A" | "B" | "C">("A");
  const [weightKg, setWeightKg] = useState<number>(itemType === "fruit" ? 3.5 : 18.0);
  const [items, setItems] = useState<ItemWithQr[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, startGenerating] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Cập nhật trọng lượng mặc định khi đổi loại tem
  const handleTypeChange = (type: "fruit" | "box") => {
    setItemType(type);
    setWeightKg(type === "fruit" ? 3.5 : 18.0);
  };

  // Tải danh sách tem đã có của lô
  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!lot.id) return;
      const res = await api.get<{ data: HarvestItem[] }>(`/harvest/${lot.id}/items`);
      const rawItems = res.data;

      // Sinh mã QR Data URL cho từng tem
      const itemsWithQr = await Promise.all(
        rawItems.map(async (item) => {
          try {
            const url = `${window.location.origin}/trace/${encodeURIComponent(item.serialCode)}`;
            const qrDataUrl = await QRCode.toDataURL(url, {
              margin: 1,
              width: 160,
              color: { dark: "#0f372a", light: "#ffffff" },
            });
            return { ...item, qrDataUrl };
          } catch {
            return item;
          }
        }),
      );

      setItems(itemsWithQr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách tem.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, [lot.id]);

  // Sinh thêm dải tem mới
  const handleGenerate = () => {
    if (!lot.id) return;
    startGenerating(async () => {
      try {
        setError(null);
        await api.post(`/harvest/${lot.id}/generate-items`, {
          count,
          itemType,
          grade,
          weightKg,
        });
        await loadItems();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không thể sinh tem mới.");
      }
    });
  };

  // Lọc theo loại tem đang xem
  const filteredItems = items.filter((it) => it.itemType === itemType);

  // Xuất file CSV
  const handleExportCsv = () => {
    if (filteredItems.length === 0) return;
    const header = "Số thứ tự,Mã định danh Serial,Loại tem,Hạng,Khối lượng (kg),Đường dẫn truy xuất\n";
    const rows = filteredItems.map((item, idx) => {
      const url = `${window.location.origin}/trace/${encodeURIComponent(item.serialCode)}`;
      return `${idx + 1},${item.serialCode},${item.itemType === "fruit" ? "Quả" : "Thùng"},${item.grade ?? "A"},${item.weightKg ?? ""},${url}`;
    });
    const blob = new Blob(["\uFEFF" + header + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Danh_sach_tem_${lot.code}_${itemType}.csv`;
    link.click();
  };

  // In tem bằng window.print
  const handlePrint = () => {
    window.print();
  };

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="batch-qr-overlay">
      <div className="batch-qr-modal">
        {/* Header Modal */}
        <div className="batch-qr-header no-print">
          <div>
            <div className="batch-qr-subtitle">Truy xuất nguồn gốc CheckVN &amp; GACC</div>
            <h2 className="batch-qr-title">Bộ sinh &amp; In tem định danh – Lô {lot.code}</h2>
          </div>
          <button type="button" className="batch-qr-close" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {/* Cấu hình sinh tem */}
        <div className="batch-qr-toolbar no-print">
          <div className="batch-qr-type-switch">
            <button
              type="button"
              className={`type-btn ${itemType === "fruit" ? "active" : ""}`}
              onClick={() => handleTypeChange("fruit")}
            >
              <Tag size={16} />
              <span>Tem dán từng quả ({items.filter((i) => i.itemType === "fruit").length})</span>
            </button>
            <button
              type="button"
              className={`type-btn ${itemType === "box" ? "active" : ""}`}
              onClick={() => handleTypeChange("box")}
            >
              <Package size={16} />
              <span>Tem dán thùng Carton ({items.filter((i) => i.itemType === "box").length})</span>
            </button>
          </div>

          <div className="batch-qr-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleExportCsv}
              disabled={filteredItems.length === 0}
            >
              <Download size={14} />
              <span>Xuất CSV</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrint}
              disabled={filteredItems.length === 0}
            >
              <Printer size={15} />
              <span>In trang tem</span>
            </button>
          </div>
        </div>

        {/* Khung tạo mới tem con */}
        <div className="batch-qr-gen-panel no-print">
          <div className="gen-panel-title">
            <Sparkles size={16} color="#1b4d3e" />
            <span>Cấp thêm dải mã tem serial mới cho lô {lot.code}</span>
          </div>

          <div className="gen-panel-form">
            <div className="gen-form-group">
              <label>Số lượng tem</label>
              <select
                className="filter-select"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                <option value={6}>6 tem</option>
                <option value={12}>12 tem</option>
                <option value={24}>24 tem</option>
                <option value={48}>48 tem</option>
                <option value={100}>100 tem</option>
              </select>
            </div>

            <div className="gen-form-group">
              <label>Phân hạng</label>
              <select
                className="filter-select"
                value={grade}
                onChange={(e) => setGrade(e.target.value as "A" | "B" | "C")}
              >
                <option value="A">Hạng A (VIP Xuất khẩu)</option>
                <option value="B">Hạng B (Loại 2)</option>
                <option value="C">Hạng C (Nội địa)</option>
              </select>
            </div>

            <div className="gen-form-group">
              <label>{itemType === "fruit" ? "Cân nặng quả (kg)" : "Quy cách thùng (kg)"}</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                className="filter-input"
                style={{ width: 100 }}
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? <RefreshCw size={15} className="spin" /> : <Tag size={15} />}
              <span>{generating ? "Đang cấp mã..." : `Sinh ${count} tem ${itemType === "fruit" ? "quả" : "thùng"}`}</span>
            </button>
          </div>
          {error && <div className="batch-qr-error">{error}</div>}
        </div>

        {/* Khung xem trước & In tem nhãn */}
        <div className="batch-qr-preview-area">
          <div className="preview-header no-print">
            <div className="preview-note">
              <strong>Bản xem trước nhãn in ({filteredItems.length} tem {itemType === "fruit" ? "dán quả" : "dán thùng"})</strong>
              <span>Khổ in tối ưu cho decal bóc dán nhiệt hoặc in A4 văn phòng</span>
            </div>
            {filteredItems.length > 0 && (
              <span className="badge badge-green">Mã QR hợp lệ 100% · Quét trực tiếp bằng camera</span>
            )}
          </div>

          {loading ? (
            <div className="batch-qr-loading no-print">Đang nạp dải mã tem...</div>
          ) : filteredItems.length === 0 ? (
            <div className="batch-qr-empty no-print">
              Chưa có tem {itemType === "fruit" ? "dán quả" : "dán thùng"} nào được cấp cho lô này.
              <br />
              Vui lòng bấm nút <strong>Sinh tem</strong> ở trên để tạo dải mã định danh.
            </div>
          ) : (
            <div className={`print-sheet print-sheet-${itemType}`}>
              {filteredItems.map((item) => (
                <div key={item.id} className={`stamp-card stamp-${itemType}`}>
                  {itemType === "fruit" ? (
                    /* ─── Tem dán từng quả (Fruit Decal 40x30mm) ─── */
                    <div className="fruit-stamp-inner">
                      <div className="fruit-stamp-header">
                        <div className="fruit-stamp-brand">HTX KRÔNG BÚK</div>
                        <span className="fruit-stamp-grade">HẠNG {item.grade ?? "A"}</span>
                      </div>
                      <div className="fruit-stamp-body">
                        {item.qrDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.qrDataUrl} alt={item.serialCode} className="fruit-qr-img" />
                        ) : (
                          <div className="qr-placeholder" />
                        )}
                        <div className="fruit-stamp-details">
                          <div className="stamp-puc">PUC: VN-DLOR-0086</div>
                          <div className="stamp-crop">SẦU RIÊNG TƯƠI</div>
                          <div className="stamp-weight">{item.weightKg ? `${item.weightKg} kg` : "3.5 kg"}</div>
                        </div>
                      </div>
                      <div className="fruit-stamp-footer">
                        <span
                          className="fruit-serial-code"
                          title="Bấm để sao chép mã"
                          onClick={() => copyCode(item.serialCode)}
                        >
                          {item.serialCode}
                        </span>
                        {copiedCode === item.serialCode && <span className="copied-tag">✔ Đã chép</span>}
                      </div>
                    </div>
                  ) : (
                    /* ─── Tem dán thùng carton (Carton Box Label 100x75mm) ─── */
                    <div className="box-stamp-inner">
                      <div className="box-stamp-head">
                        <div className="box-brand">
                          <strong>HTX SẦU RIÊNG KRÔNG BÚK – ĐẮK LẮK</strong>
                          <small>TIÊU CHUẨN XUẤT KHẨU VIETGAP &amp; NGHỊ ĐỊNH THƯ GACC</small>
                        </div>
                        <div className="box-stamp-grade-box">
                          HẠNG {item.grade ?? "A"}
                        </div>
                      </div>

                      <div className="box-stamp-grid">
                        <div className="box-qr-col">
                          {item.qrDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.qrDataUrl} alt={item.serialCode} className="box-qr-img" />
                          ) : (
                            <div className="qr-placeholder" />
                          )}
                          <span className="box-qr-caption">QUÉT TRUY XUẤT NGUỒN GỐC</span>
                        </div>

                        <div className="box-info-col">
                          <div className="box-field">
                            <span className="lbl">Mã định danh thùng:</span>
                            <strong
                              className="val serial-highlight"
                              onClick={() => copyCode(item.serialCode)}
                              title="Bấm để chép mã"
                            >
                              {item.serialCode}
                            </strong>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Mã số vùng trồng (PUC):</span>
                            <strong className="val">VN-DLOR-0086</strong>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Mã cơ sở đóng gói (PHC):</span>
                            <strong className="val">{lot.packhouseCode || "VN-DLPH-0089"}</strong>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Quy cách tịnh:</span>
                            <strong className="val">{item.weightKg ? `${item.weightKg} kg / Thùng` : "18.0 kg / Thùng"}</strong>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Doanh nghiệp xuất khẩu:</span>
                            <span className="val">{lot.buyer}</span>
                          </div>
                          <div className="box-field">
                            <span className="lbl">Thị trường:</span>
                            <span className="val">{lot.market}</span>
                          </div>
                        </div>
                      </div>

                      <div className="box-stamp-foot">
                        <span>Lô hàng: {lot.code}</span>
                        <span>Ngày đóng gói: {lot.date}</span>
                        <span className="safe-mark">✔ Kiểm nghiệm Cadimi an toàn · Âm tính Vàng O</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        /* Overlay & Modal */
        .batch-qr-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(14, 28, 22, 0.65);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow-y: auto;
        }

        .batch-qr-modal {
          background: #ffffff;
          border-radius: 16px;
          max-width: 960px;
          width: 100%;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.3);
          border: 1px solid #e1e7e4;
          overflow: hidden;
        }

        .batch-qr-header {
          padding: 18px 24px;
          border-bottom: 1px solid #edf1ef;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fcfdfd;
        }

        .batch-qr-subtitle {
          font-size: 11.5px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: #2e7d32;
          font-weight: 700;
        }

        .batch-qr-title {
          font-size: 18px;
          font-weight: 700;
          color: #14372f;
          margin: 2px 0 0 0;
        }

        .batch-qr-close {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid #e2e8e5;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #556b63;
          transition: all 0.15s ease;
        }
        .batch-qr-close:hover {
          background: #f0f4f2;
          color: #111;
        }

        .batch-qr-toolbar {
          padding: 12px 24px;
          border-bottom: 1px solid #edf1ef;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: #ffffff;
          flex-wrap: wrap;
        }

        .batch-qr-type-switch {
          display: flex;
          gap: 8px;
          background: #f4f7f5;
          padding: 4px;
          border-radius: 10px;
        }

        .type-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          background: transparent;
          color: #4a6358;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .type-btn.active {
          background: #ffffff;
          color: #166534;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
        }

        .batch-qr-actions {
          display: flex;
          gap: 10px;
        }

        .batch-qr-gen-panel {
          padding: 16px 24px;
          background: #f7faf8;
          border-bottom: 1px solid #edf1ef;
        }

        .gen-panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #1b4d3e;
          margin-bottom: 12px;
        }

        .gen-panel-form {
          display: flex;
          align-items: flex-end;
          gap: 14px;
          flex-wrap: wrap;
        }

        .gen-form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .gen-form-group label {
          font-size: 11.5px;
          font-weight: 600;
          color: #556b63;
        }

        .batch-qr-error {
          margin-top: 10px;
          color: #c92a2a;
          font-size: 12.5px;
          font-weight: 500;
        }

        .batch-qr-preview-area {
          padding: 20px 24px;
          overflow-y: auto;
          flex: 1;
          background: #eef2ef;
        }

        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .preview-note strong {
          display: block;
          font-size: 13.5px;
          color: #14372f;
        }
        .preview-note span {
          font-size: 11.5px;
          color: #64746d;
        }

        .batch-qr-loading,
        .batch-qr-empty {
          text-align: center;
          padding: 50px 20px;
          color: #607d72;
          font-size: 13.5px;
        }

        /* ─── Bản in tem Quả (Fruit) ─── */
        .print-sheet-fruit {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
        }

        .stamp-fruit {
          background: #ffffff;
          border-radius: 10px;
          border: 1.5px solid #d4dfd9;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.04);
          padding: 10px;
          display: flex;
          flex-direction: column;
        }

        .fruit-stamp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed #d5ded9;
          padding-bottom: 5px;
          margin-bottom: 6px;
        }

        .fruit-stamp-brand {
          font-size: 11px;
          font-weight: 800;
          color: #1b4d3e;
          letter-spacing: 0.3px;
        }

        .fruit-stamp-grade {
          background: #e8f5e9;
          color: #1b5e20;
          border: 1px solid #c8e6c9;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 800;
          padding: 1px 5px;
        }

        .fruit-stamp-body {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .fruit-qr-img {
          width: 76px;
          height: 76px;
          display: block;
          border-radius: 4px;
          border: 1px solid #e0eae4;
        }

        .fruit-stamp-details {
          font-size: 10px;
          color: #3b5047;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stamp-puc {
          font-weight: 700;
          color: #0f372a;
          font-family: monospace;
          font-size: 9.5px;
        }
        .stamp-crop {
          font-weight: 600;
          color: #166534;
        }
        .stamp-weight {
          font-weight: 700;
          color: #222;
        }

        .fruit-stamp-footer {
          margin-top: 6px;
          padding-top: 5px;
          border-top: 1px dashed #d5ded9;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .fruit-serial-code {
          font-family: monospace;
          font-size: 10.5px;
          font-weight: 700;
          color: #1b4d3e;
          cursor: pointer;
        }
        .fruit-serial-code:hover {
          text-decoration: underline;
        }

        .copied-tag {
          font-size: 9.5px;
          color: #2e7d32;
          font-weight: 700;
        }

        /* ─── Bản in tem Thùng (Box) ─── */
        .print-sheet-box {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 18px;
        }

        .stamp-box {
          background: #ffffff;
          border: 2px solid #0f372a;
          border-radius: 8px;
          padding: 14px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
        }

        .box-stamp-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0f372a;
          padding-bottom: 8px;
          margin-bottom: 10px;
        }

        .box-brand strong {
          display: block;
          font-size: 12.5px;
          font-weight: 800;
          color: #0f372a;
        }
        .box-brand small {
          display: block;
          font-size: 9.5px;
          color: #465f54;
          font-weight: 600;
        }

        .box-stamp-grade-box {
          background: #0f372a;
          color: #ffffff;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .box-stamp-grid {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 12px;
          align-items: center;
        }

        .box-qr-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .box-qr-img {
          width: 104px;
          height: 104px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }

        .box-qr-caption {
          font-size: 8px;
          font-weight: 700;
          color: #0f372a;
          margin-top: 4px;
          text-transform: uppercase;
        }

        .box-info-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .box-field {
          font-size: 10.5px;
          display: flex;
          gap: 6px;
        }
        .box-field .lbl {
          color: #555;
          min-width: 125px;
        }
        .box-field .val {
          color: #111;
          font-weight: 500;
        }
        .box-field strong.val {
          font-weight: 700;
          color: #0f372a;
        }
        .serial-highlight {
          font-family: monospace;
          color: #b45309 !important;
          cursor: pointer;
        }

        .box-stamp-foot {
          margin-top: 10px;
          padding-top: 6px;
          border-top: 1px solid #d5ded9;
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          color: #4a6358;
          font-weight: 600;
          flex-wrap: wrap;
          gap: 6px;
        }
        .safe-mark {
          color: #15803d;
        }

        /* ─── CSS KHI IN ẤN (WINDOW.PRINT) ─── */
        @media print {
          body * {
            visibility: hidden !important;
          }
          .batch-qr-overlay,
          .batch-qr-modal,
          .batch-qr-preview-area,
          .print-sheet,
          .print-sheet * {
            visibility: visible !important;
          }

          .no-print {
            display: none !important;
          }

          .batch-qr-overlay {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .batch-qr-modal {
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          .batch-qr-preview-area {
            background: #ffffff !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .print-sheet-fruit {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 8mm !important;
            page-break-inside: auto;
          }

          .stamp-fruit {
            border: 1px solid #000 !important;
            box-shadow: none !important;
            page-break-inside: avoid;
          }

          .print-sheet-box {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10mm !important;
            page-break-inside: auto;
          }

          .stamp-box {
            border: 1.5px solid #000 !important;
            box-shadow: none !important;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
