"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Tag,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Package,
  Plus,
  Scale,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Calendar,
  Lock,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { usePortal } from "@/hooks/use-portal";
import type { PortalOverview, PortalPlot, PortalPlots } from "@/types/portal";

interface StampStats {
  totalAllocated: number;
  totalActivated: number;
  remaining: number;
}

interface FarmerStamp {
  id: number;
  allocationId: number;
  plotCode: string | null;
  serialCode: string;
  status: "allocated" | "activated" | "revoked";
  activatedAt: string | null;
  fruitWeightKg: number | null;
  grade: "A" | "B" | "C" | null;
  photoUrl: string | null;
  harvestDate: string | null;
}

interface HarvestDeclaration {
  id: number;
  plotCode: string;
  harvestedOn: string;
  weightKg: number;
  gradeAKg: number;
  gradeBKg: number;
  qualityRating: string;
  note: string | null;
  createdAt: string;
}

interface Props {
  overview?: PortalOverview | null;
  plots?: PortalPlot[];
}

export default function StampsTab({ overview, plots = [] }: Props) {
  const plotsData = usePortal<PortalPlots>("plots");
  const effectivePlots = plots.length > 0 ? plots : (plotsData.data?.data || []);
  const [subTab, setSubTab] = useState<"activate" | "harvest_decl" | "inventory">("activate");
  const [stats, setStats] = useState<StampStats>({ totalAllocated: 0, totalActivated: 0, remaining: 0 });
  const [stamps, setStamps] = useState<FarmerStamp[]>([]);
  const [declarations, setDeclarations] = useState<HarvestDeclaration[]>([]);
  const [loading, setLoading] = useState(true);

  // Form kích hoạt tem quả
  const [selectedSerial, setSelectedSerial] = useState("");
  const [activatePlot, setActivatePlot] = useState(() => effectivePlots[0]?.code ?? "KB-VT-001");
  const [fruitWeight, setFruitWeight] = useState(3.5);
  const [grade, setGrade] = useState<"A" | "B" | "C">("A");
  const [activating, startActivating] = useTransition();
  const [activateMsg, setActivateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form khai báo thu hái
  const [showDeclForm, setShowDeclForm] = useState(false);
  const [declPlot, setDeclPlot] = useState(() => effectivePlots[0]?.code ?? "KB-VT-001");
  const [declDate, setDeclDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [declWeight, setDeclWeight] = useState(1200);
  const [declGradeA, setDeclGradeA] = useState(900);
  const [declGradeB, setDeclGradeB] = useState(300);
  const [declRating, setDeclRating] = useState("Loại 1 (VIP)");
  const [declNote, setDeclNote] = useState("");
  const [savingDecl, startSavingDecl] = useTransition();

  useEffect(() => {
    if (effectivePlots.length > 0) {
      if (!activatePlot || activatePlot === "KB-VT-001") {
        setActivatePlot(effectivePlots[0].code);
      }
      if (!declPlot || declPlot === "KB-VT-001") {
        setDeclPlot(effectivePlots[0].code);
      }
    }
  }, [effectivePlots, activatePlot, declPlot]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stampsRes, declRes] = await Promise.all([
        api.get<{ stats: StampStats; stamps: FarmerStamp[] }>("/portal/stamps"),
        api.get<{ data: HarvestDeclaration[] }>("/portal/harvest-declarations"),
      ]);
      setStats(stampsRes.stats);
      setStamps(stampsRes.stamps);
      setDeclarations(declRes.data);

      // Tự chọn 1 tem chưa kích hoạt đầu tiên
      const firstAllocated = stampsRes.stamps.find((s) => s.status === "allocated");
      if (firstAllocated) setSelectedSerial(firstAllocated.serialCode);
    } catch {
      // Bỏ qua lỗi mạng
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Xử lý kích hoạt tem quả
  const handleActivate = () => {
    if (!selectedSerial.trim()) {
      setActivateMsg({ type: "error", text: "Vui lòng chọn hoặc nhập mã tem serial cần kích hoạt." });
      return;
    }
    setActivateMsg(null);

    startActivating(async () => {
      try {
        await api.post("/portal/stamps/activate", {
          serialCode: selectedSerial.trim(),
          plotCode: activatePlot,
          fruitWeightKg: fruitWeight,
          grade,
        });
        setActivateMsg({
          type: "success",
          text: `Đã kích hoạt thành công tem quả [${selectedSerial.trim()}]! Thông tin đã được đồng bộ lên cổng truy xuất nguồn gốc CheckVN.`,
        });
        await loadData();
      } catch (e) {
        setActivateMsg({
          type: "error",
          text: e instanceof Error ? e.message : "Không thể kích hoạt tem.",
        });
      }
    });
  };

  // Xử lý lưu khai báo thu hái
  const handleSaveDecl = (e: React.FormEvent) => {
    e.preventDefault();
    startSavingDecl(async () => {
      try {
        await api.post("/portal/harvest-declarations", {
          plotCode: declPlot,
          harvestedOn: declDate,
          weightKg: declWeight,
          gradeAKg: declGradeA,
          gradeBKg: declGradeB,
          qualityRating: declRating,
          note: declNote,
        });
        setShowDeclForm(false);
        setDeclNote("");
        await loadData();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Có lỗi khi lưu khai báo thu hái.");
      }
    });
  };

  const unactivatedStamps = stamps.filter((s) => s.status === "allocated");

  return (
    <div className="portal-tab-content">
      {/* ─── THỐNG KÊ KHO TEM THEO CCCD & DIỆN TÍCH (QUY TRÌNH 2) ─── */}
      <div className="stamp-stats-card">
        <div className="stamp-stats-badge">
          <ShieldCheck size={15} />
          <span>KIỂM SOÁT TEM CHECKVN · CẤP THEO CCCD DUY NHẤT</span>
        </div>
        <div className="stamp-household-meta">
          <strong>Hộ: {overview?.household.name || "Nguyễn Văn An"}</strong>
          <span>Mã hộ: {overview?.household.code || "KB-VT-001-H001"} · Diện tích: {overview?.household.areaHa || 2.4} ha</span>
        </div>

        <div className="stamp-stats-grid">
          <div className="stamp-stat-item">
            <span className="lbl">Tổng tem được cấp</span>
            <strong className="val">{stats.totalAllocated} tem</strong>
            <small className="sub">Định mức theo diện tích vườn</small>
          </div>
          <div className="stamp-stat-item active-stat">
            <span className="lbl">Đã dán &amp; kích hoạt</span>
            <strong className="val color-green">{stats.totalActivated} tem</strong>
            <small className="sub">Có giá trị truy xuất chính ngạch</small>
          </div>
          <div className="stamp-stat-item">
            <span className="lbl">Tem tồn trong kho</span>
            <strong className="val color-gold">{stats.remaining} tem</strong>
            <small className="sub">Sẵn sàng dán lên quả</small>
          </div>
        </div>
      </div>

      {/* ─── THANH ĐIỀU HƯỚNG CHẾ ĐỘ ─── */}
      <div className="stamp-nav-tabs">
        <button
          type="button"
          className={`stamp-tab-btn ${subTab === "activate" ? "active" : ""}`}
          onClick={() => setSubTab("activate")}
        >
          <Tag size={15} />
          <span>Kích hoạt tem quả</span>
        </button>
        <button
          type="button"
          className={`stamp-tab-btn ${subTab === "harvest_decl" ? "active" : ""}`}
          onClick={() => setSubTab("harvest_decl")}
        >
          <Scale size={15} />
          <span>Nhật ký thu hái tại vườn ({declarations.length})</span>
        </button>
        <button
          type="button"
          className={`stamp-tab-btn ${subTab === "inventory" ? "active" : ""}`}
          onClick={() => setSubTab("inventory")}
        >
          <Package size={15} />
          <span>Kho tem của tôi ({stamps.length})</span>
        </button>
      </div>

      {/* ─── CHẾ ĐỘ 1: KÍCH HOẠT TEM QUẢ (HÌNH 1 - BƯỚC 5 & HÌNH 2 - NGUYÊN TẮC 3, 4) ─── */}
      {subTab === "activate" && (
        <div className="portal-card">
          <div className="portal-card-head">
            <div>
              <h3 className="portal-card-title">Khai báo dán tem lên quả sầu riêng</h3>
              <p className="portal-card-sub">
                Dán tem lên quả và xác nhận kích hoạt bằng tài khoản của chính hộ mình để tránh hoán đổi tem.
              </p>
            </div>
            <div className="stamp-sec-icon">
              <Lock size={18} color="#15803d" />
            </div>
          </div>

          {activateMsg && (
            <div className={`portal-alert ${activateMsg.type === "success" ? "portal-alert-success" : "portal-alert-error"}`}>
              {activateMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <span>{activateMsg.text}</span>
            </div>
          )}

          <div className="stamp-form">
            <div className="portal-form-group">
              <label className="portal-label">Chọn mã tem serial (tem chưa kích hoạt trong kho)</label>
              {unactivatedStamps.length > 0 ? (
                <select
                  className="portal-input"
                  value={selectedSerial}
                  onChange={(e) => setSelectedSerial(e.target.value)}
                >
                  {unactivatedStamps.map((s) => (
                    <option key={s.id} value={s.serialCode}>
                      {s.serialCode} – Chưa kích hoạt
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="portal-input"
                  placeholder="Nhập mã tem serial trên con tem (ví dụ: KB-H001-000004)..."
                  value={selectedSerial}
                  onChange={(e) => setSelectedSerial(e.target.value)}
                />
              )}
            </div>

            <div className="portal-form-grid-2">
              <div className="portal-form-group">
                <label className="portal-label">Lô canh tác vừa hái</label>
                <select
                  className="portal-input"
                  value={activatePlot}
                  onChange={(e) => setActivatePlot(e.target.value)}
                >
                  {effectivePlots.length > 0 ? (
                    effectivePlots.map((p) => (
                      <option key={p.code} value={p.code}>
                        Lô {p.code} – {p.variety || "Sầu riêng"} ({p.areaHa} ha)
                      </option>
                    ))
                  ) : (
                    <option value="KB-VT-001">Lô KB-VT-001 – Monthong</option>
                  )}
                </select>
              </div>

              <div className="portal-form-group">
                <label className="portal-label">Khối lượng quả (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="12"
                  className="portal-input"
                  value={fruitWeight}
                  onChange={(e) => setFruitWeight(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="portal-form-grid-2">
              <div className="portal-form-group">
                <label className="portal-label">Phân hạng chất lượng</label>
                <select
                  className="portal-input"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value as "A" | "B" | "C")}
                >
                  <option value="A">Hạng A (VIP xuất khẩu – Tròn đều, ≥ 4 hộc)</option>
                  <option value="B">Hạng B (Loại 2 – Trọng lượng chuẩn)</option>
                  <option value="C">Hạng C (Nội địa)</option>
                </select>
              </div>

              <div className="portal-form-group">
                <label className="portal-label">Ngày dán tem</label>
                <input
                  type="date"
                  className="portal-input"
                  disabled
                  value={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            <div className="stamp-action-row">
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: "14.5px" }}
                onClick={handleActivate}
                disabled={activating || !selectedSerial}
              >
                {activating ? <RefreshCw size={16} className="spin" /> : <CheckCircle2 size={16} />}
                <span>{activating ? "Đang xác thực và kích hoạt tem..." : "Xác nhận dán & Kích hoạt tem quả"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CHẾ ĐỘ 2: NHẬT KÝ THU HÁI TẠI VƯỜN (HÌNH 1 - BƯỚC 3) ─── */}
      {subTab === "harvest_decl" && (
        <div className="portal-card">
          <div className="portal-card-head">
            <div>
              <h3 className="portal-card-title">Nhật ký thu hái tại vườn</h3>
              <p className="portal-card-sub">
                Ghi nhận các đợt hái sầu riêng tại vườn (ngày hái, sản lượng kg, tỷ lệ loại 1/loại 2).
              </p>
            </div>
            {!showDeclForm && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowDeclForm(true)}
              >
                <Plus size={15} />
                <span>Khai báo đợt hái mới</span>
              </button>
            )}
          </div>

          {showDeclForm && (
            <form onSubmit={handleSaveDecl} className="harvest-decl-form">
              <div className="form-legend">
                <Calendar size={16} />
                <span>Khai báo đợt thu hái sầu riêng</span>
              </div>

              <div className="portal-form-grid-2">
                <div className="portal-form-group">
                  <label className="portal-label">Lô đất thu hái</label>
                  <select
                    className="portal-input"
                    value={declPlot}
                    onChange={(e) => setDeclPlot(e.target.value)}
                  >
                    {effectivePlots.length > 0 ? (
                      effectivePlots.map((p) => (
                        <option key={p.code} value={p.code}>
                          Lô {p.code} – {p.variety || "Sầu riêng"}
                        </option>
                      ))
                    ) : (
                      <option value="KB-VT-001">Lô KB-VT-001 – Monthong</option>
                    )}
                  </select>
                </div>

                <div className="portal-form-group">
                  <label className="portal-label">Ngày thu hái</label>
                  <input
                    type="date"
                    className="portal-input"
                    value={declDate}
                    onChange={(e) => setDeclDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="portal-form-grid-3">
                <div className="portal-form-group">
                  <label className="portal-label">Tổng sản lượng (kg)</label>
                  <input
                    type="number"
                    min="10"
                    className="portal-input"
                    value={declWeight}
                    onChange={(e) => setDeclWeight(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label">Loại 1 / VIP (kg)</label>
                  <input
                    type="number"
                    min="0"
                    className="portal-input"
                    value={declGradeA}
                    onChange={(e) => setDeclGradeA(Number(e.target.value))}
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label">Loại 2 (kg)</label>
                  <input
                    type="number"
                    min="0"
                    className="portal-input"
                    value={declGradeB}
                    onChange={(e) => setDeclGradeB(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="portal-form-group">
                <label className="portal-label">Đánh giá phẩm chất &amp; Ghi chú</label>
                <input
                  type="text"
                  className="portal-input"
                  placeholder="Ví dụ: Trái già đủ ngày, cơm vàng, hộc đều, đóng sọt giao HTX..."
                  value={declNote}
                  onChange={(e) => setDeclNote(e.target.value)}
                />
              </div>

              <div className="form-btn-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowDeclForm(false)}
                >
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingDecl}>
                  {savingDecl ? "Đang lưu..." : "Lưu nhật ký thu hái"}
                </button>
              </div>
            </form>
          )}

          <div className="decl-list">
            {declarations.length === 0 ? (
              <div className="portal-empty">Chưa có đợt thu hái nào được khai báo.</div>
            ) : (
              declarations.map((d) => (
                <div key={d.id} className="decl-card">
                  <div className="decl-head">
                    <div>
                      <strong className="decl-plot">Lô {d.plotCode}</strong>
                      <span className="decl-date">Ngày hái: {d.harvestedOn}</span>
                    </div>
                    <span className="badge badge-green">{d.qualityRating || "Loại 1"}</span>
                  </div>
                  <div className="decl-weights">
                    <span className="decl-total">Tổng: {Number(d.weightKg).toLocaleString("vi-VN")} kg</span>
                    <span className="decl-detail">Loại 1: {d.gradeAKg} kg · Loại 2: {d.gradeBKg} kg</span>
                  </div>
                  {d.note && <p className="decl-note">{d.note}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── CHẾ ĐỘ 3: KHO TEM CỦA TÔI (HÌNH 1 - BƯỚC 4) ─── */}
      {subTab === "inventory" && (
        <div className="portal-card">
          <div className="portal-card-head">
            <div>
              <h3 className="portal-card-title">Danh sách tem điện tử được cấp</h3>
              <p className="portal-card-sub">
                Mỗi con tem được quản lý trạng thái riêng biệt (Đã kích hoạt gắn quả / Chưa kích hoạt trong kho).
              </p>
            </div>
          </div>

          <div className="stamp-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Mã tem Serial</th>
                  <th>Trạng thái</th>
                  <th>Lô vườn</th>
                  <th>Khối lượng quả</th>
                  <th>Phân hạng</th>
                  <th>Ngày hái</th>
                  <th>Tra cứu</th>
                </tr>
              </thead>
              <tbody>
                {stamps.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700, color: "#166534" }}>{s.serialCode}</td>
                    <td>
                      <span className={`badge ${s.status === "activated" ? "badge-green" : "badge-gold"}`}>
                        {s.status === "activated" ? "✔ Đã kích hoạt" : "Trong kho"}
                      </span>
                    </td>
                    <td>{s.plotCode || "—"}</td>
                    <td>{s.fruitWeightKg ? `${s.fruitWeightKg} kg` : "—"}</td>
                    <td>{s.grade ? `Hạng ${s.grade}` : "—"}</td>
                    <td>{s.harvestDate || "—"}</td>
                    <td>
                      <a
                        href={`/trace/${s.serialCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline btn-sm"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <QrCode size={13} />
                        <span>Xem QR</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style jsx>{`
        .stamp-stats-card {
          background: linear-gradient(135deg, #0d3829 0%, #15573f 100%);
          color: #ffffff;
          padding: 18px 20px;
          border-radius: 16px;
          margin-bottom: 16px;
          border: 1px solid #16a34a;
          box-shadow: 0 10px 25px -5px rgba(22, 101, 52, 0.35);
        }

        .stamp-stats-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          color: #86efac;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .stamp-household-meta {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.15);
          padding-bottom: 8px;
        }
        .stamp-household-meta strong {
          color: #facc15;
          font-size: 14px;
        }
        .stamp-household-meta span {
          color: #cbd5e1;
        }

        .stamp-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .stamp-stat-item {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
        }
        .stamp-stat-item .lbl {
          font-size: 11px;
          color: #cbd5e1;
        }
        .stamp-stat-item .val {
          font-size: 18px;
          font-weight: 800;
          margin: 2px 0;
        }
        .stamp-stat-item .sub {
          font-size: 10px;
          color: #94a3b8;
        }
        .color-green {
          color: #4ade80 !important;
        }
        .color-gold {
          color: #fde047 !important;
        }

        .stamp-nav-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          background: #ffffff;
          padding: 6px;
          border-radius: 12px;
          border: 1px solid #e2e8e5;
          overflow-x: auto;
        }

        .stamp-tab-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          background: transparent;
          color: #475569;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .stamp-tab-btn.active {
          background: #ecfdf5;
          color: #15803d;
          font-weight: 700;
        }

        .portal-card {
          background: #ffffff;
          border-radius: 14px;
          padding: 18px 20px;
          border: 1px solid #e2e8e5;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          margin-bottom: 16px;
        }

        .portal-card-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .portal-card-title {
          font-size: 16px;
          font-weight: 800;
          color: #14372f;
          margin: 0;
        }
        .portal-card-sub {
          font-size: 12.5px;
          color: #64748b;
          margin: 3px 0 0;
        }

        .portal-form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-bottom: 14px;
        }
        .portal-label {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
        }
        .portal-input {
          padding: 9px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 13.5px;
          color: #0f172a;
          background: #fff;
        }

        .portal-form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .portal-form-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .portal-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .portal-alert-success {
          background: #ecfdf5;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }
        .portal-alert-error {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .harvest-decl-form {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 18px;
        }
        .form-legend {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 700;
          color: #15803d;
          margin-bottom: 12px;
        }
        .form-btn-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 10px;
        }

        .decl-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .decl-card {
          background: #fcfdfc;
          border: 1px solid #e2e8f0;
          border-left: 4px solid #16a34a;
          border-radius: 0 10px 10px 0;
          padding: 12px 14px;
        }
        .decl-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .decl-plot {
          font-size: 14px;
          color: #0f172a;
          display: block;
        }
        .decl-date {
          font-size: 11.5px;
          color: #64748b;
        }
        .decl-weights {
          display: flex;
          justify-content: space-between;
          font-size: 12.5px;
        }
        .decl-total {
          font-weight: 800;
          color: #15803d;
        }
        .decl-detail {
          color: #475569;
        }
        .decl-note {
          font-size: 12px;
          color: #64748b;
          margin: 4px 0 0;
        }

        .stamp-table-wrap {
          overflow-x: auto;
        }
        .portal-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }
        .portal-table th {
          text-align: left;
          padding: 9px 10px;
          background: #f8fafc;
          color: #475569;
          font-weight: 700;
          border-bottom: 1px solid #e2e8f0;
        }
        .portal-table td {
          padding: 10px;
          border-bottom: 1px solid #f1f5f9;
        }

        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
