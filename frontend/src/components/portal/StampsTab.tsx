"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Plus,
  Calendar,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import QRCode from "qrcode";
import { api } from "@/lib/api-client";
import { usePortal } from "@/hooks/use-portal";
import { formatKg, HARVEST_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PortalHarvest, PortalList, PortalOverview, PortalPlot, PortalPlots } from "@/types/portal";
import { EmptyState, Sheet, StateBlock } from "./ui";



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

interface HarvestRule {
  id: string;
  kicker: string;
  title: string;
  desc: string;
  nodeType: "active" | "warn" | "danger";
  capsuleBg: string;
  cardClass: string;
}

const HARVEST_RULES: HarvestRule[] = [
  {
    id: "declaration",
    kicker: "QUY CHUẨN 1 · KHAI BÁO VƯỜN",
    title: "Đăng ký ngày cắt & sản lượng dự kiến",
    desc: "Bà con nông dân đăng ký ngày dự kiến thu hoạch và sản lượng ước tính trên cổng để HTX bố trí lịch kiểm định.",
    nodeType: "active",
    capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)",
    cardClass: "pt-vietgap-card-frequency",
  },
  {
    id: "kcs",
    kicker: "QUY CHUẨN 2 · KIỂM ĐỊNH KCS",
    title: "Thẩm định tồn dư BVTV & Phân loại quả",
    desc: "Cán bộ kỹ thuật HTX cùng Kiểm tra viên KCS trực tiếp về vườn kiểm tra cách ly thuốc BVTV (thời gian PHI) và cân đo phân loại.",
    nodeType: "warn",
    capsuleBg: "linear-gradient(180deg, #10b981 0%, #34d399 100%)",
    cardClass: "pt-vietgap-card-phi",
  },
  {
    id: "stamping",
    kicker: "QUY CHUẨN 3 · CẤP TEM NIÊM PHONG",
    title: "Kích hoạt tem niêm phong điện tử",
    desc: "HTX nghiệm thu xuất khẩu chính ngạch và kích hoạt tem niêm phong điện tử truy xuất nguồn gốc khi đóng gói xuất xưởng.",
    nodeType: "danger",
    capsuleBg: "linear-gradient(180deg, #f97316 0%, #fb923c 100%)",
    cardClass: "pt-vietgap-card-banned",
  },
];

interface Props {
  overview?: PortalOverview | null;
  plots?: PortalPlot[];
}

export default function StampsTab({ overview, plots = [] }: Props) {
  const plotsData = usePortal<PortalPlots>("plots");
  const harvest = usePortal<PortalList<PortalHarvest>>("harvest");
  const effectivePlots = plots.length > 0 ? plots : (plotsData.data?.data || []);

  const [subTab, setSubTab] = useState<"harvest_lots" | "harvest_decl">("harvest_lots");
  const [declarations, setDeclarations] = useState<HarvestDeclaration[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal xem chi tiết tem vé voucher lô hàng
  const [selectedLotForQr, setSelectedLotForQr] = useState<PortalHarvest | null>(null);

  // Form khai báo / đăng ký thu hái
  const [showDeclForm, setShowDeclForm] = useState(false);
  const [declPlot, setDeclPlot] = useState(() => effectivePlots[0]?.code ?? "KB-VT-001");
  const [declDate, setDeclDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [declWeight, setDeclWeight] = useState(1200);
  const [declGradeA, setDeclGradeA] = useState(900);
  const [declGradeB, setDeclGradeB] = useState(300);
  const [declRating, setDeclRating] = useState("Loại 1 (VIP)");
  const [declNote, setDeclNote] = useState("");
  const [savingDecl, startSavingDecl] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (effectivePlots.length > 0 && (!declPlot || declPlot === "KB-VT-001")) {
      setDeclPlot(effectivePlots[0].code);
    }
  }, [effectivePlots, declPlot]);

  const loadData = async () => {
    setLoading(true);
    try {
      const declRes = await api.get<{ data: HarvestDeclaration[] }>("/portal/harvest-declarations");
      setDeclarations(declRes.data);
    } catch {
      // Bỏ qua lỗi mạng
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Xử lý lưu khai báo thu hái
  const handleSaveDecl = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
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
        setSuccessMsg(`Đã gửi đăng ký thu hoạch cho Lô ${declPlot} thành công! HTX đã tiếp nhận thông tin.`);
        await loadData();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Có lỗi khi lưu khai báo thu hái.");
      }
    });
  };

  return (
    <div className="portal-tab-content">

      {/* ─── 2. QUY CHUẨN THU HOẠCH (THEO STYLE QUY CHUẨN VIETGAP) ─── */}
      <section className="pt-schedule-section pt-vietgap-section pt-harvest-rules-section" aria-labelledby="harvest-rules-heading">
        <div className="pt-schedule-header">
          <h2 id="harvest-rules-heading" className="pt-schedule-title">
            Quy chuẩn thu hoạch
          </h2>
        </div>
        <div className="pt-vietgap-timeline" role="list">
          {HARVEST_RULES.map((rule, idx, arr) => {
            const isLast = idx === arr.length - 1;

            return (
              <div key={rule.id} className="pt-vietgap-step">
                <div className="pt-vietgap-segment">
                  {/* Cột Trục Timeline dải capsule dày + chấm tròn trắng đồng bộ */}
                  <div className="pt-vietgap-track-col" aria-hidden="true">
                    <div
                      className="pt-vietgap-capsule"
                      style={{ background: rule.capsuleBg }}
                    >
                      <div className="pt-vietgap-dot" />
                      <div className="pt-vietgap-dot" />
                    </div>
                  </div>

                  {/* Khối nội dung thẻ quy chuẩn */}
                  <div className={`pt-vietgap-content pt-vietgap-card ${rule.cardClass}`}>
                    <span className="pt-timeline-kicker">{rule.kicker}</span>
                    <h3 className="pt-timeline-title">{rule.title}</h3>
                    <p className="pt-timeline-desc">{rule.desc}</p>
                  </div>
                </div>

                {/* Đoạn nối chuyển tiếp giữa các quy chuẩn (Dotted line với các dấu chấm mini) */}
                {!isLast && (
                  <div className="pt-vietgap-transfer" aria-hidden="true">
                    <div className="pt-vietgap-transfer-track">
                      <div className="pt-vietgap-mini-dot" />
                      <div className="pt-vietgap-mini-dot" />
                      <div className="pt-vietgap-mini-dot" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── 3. THANH ĐIỀU HƯỚNG CHỨC NĂNG (THEO STYLE THANH BAR TAB KIẾN THỨC) ─── */}
      <div className="pt-segmented pt-harvest-segmented" role="tablist" aria-label="Chế độ thu hoạch">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "harvest_lots"}
          className={subTab === "harvest_lots" ? "active" : ""}
          onClick={() => setSubTab("harvest_lots")}
        >
          <span className="tab-label-desktop">Lô hàng xuất kho ({harvest.data?.data.length ?? 0})</span>
          <span className="tab-label-mobile">Lô hàng ({harvest.data?.data.length ?? 0})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "harvest_decl"}
          className={subTab === "harvest_decl" ? "active" : ""}
          onClick={() => setSubTab("harvest_decl")}
        >
          <span className="tab-label-desktop">Kế hoạch thu hái ({declarations.length})</span>
          <span className="tab-label-mobile">Kế hoạch ({declarations.length})</span>
        </button>
      </div>

      {/* ─── CHẾ ĐỘ 1: LÔ HÀNG ĐÃ XUẤT KHO & TEM QR ─── */}
      {subTab === "harvest_lots" && (
        <div className="pt-harvest-lots-view">
          <StateBlock loading={harvest.loading} error={harvest.error} />
          {harvest.data && harvest.data.data.length === 0 && (
            <EmptyState icon="harvest">Chưa có lô thu hoạch nào của hộ bạn được xuất kho.</EmptyState>
          )}
          {harvest.data && harvest.data.data.length > 0 && (
            <div className="pt-asset-card-grid">
              {harvest.data.data.map((lot) => (
                <HarvestAssetTagCard
                  key={lot.id}
                  lot={lot}
                  pucCode="PUC-KRB-001"
                  onOpenModal={() => setSelectedLotForQr(lot)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── CHẾ ĐỘ 2: KẾ HOẠCH & ĐĂNG KÝ THU HÁI TẠI VƯỜN (NẰM DƯỚI NỀN) ─── */}
      {subTab === "harvest_decl" && (
        <div className="pt-harvest-decl-view">
          <div className="decl-topbar">
            <div className="decl-topbar-info">
              <h3 className="decl-topbar-title">Kế hoạch thu hái</h3>
              <p className="decl-topbar-sub">
                Khai báo ngày cắt để HTX kiểm định chất lượng &amp; cấp tem niêm phong.
              </p>
            </div>
            {!showDeclForm && (
              <button
                type="button"
                className="btn btn-primary btn-sm decl-add-btn"
                onClick={() => {
                  setShowDeclForm(true);
                  setSuccessMsg(null);
                }}
              >
                <Plus size={15} />
                <span>Báo lịch mới</span>
              </button>
            )}
          </div>

          {successMsg && (
            <div className="portal-alert portal-alert-success" style={{ marginBottom: "16px" }}>
              <CheckCircle2 size={18} />
              <span>{successMsg}</span>
            </div>
          )}

          {showDeclForm && (
            <form onSubmit={handleSaveDecl} className="harvest-decl-form">
              <div className="form-legend">
                <Calendar size={16} />
                <span>Đăng ký đợt thu hoạch sầu riêng gửi HTX</span>
              </div>

              <div className="portal-form-grid-2">
                <div className="portal-form-group">
                  <label className="portal-label">Lô đất canh tác thu hái</label>
                  <select
                    className="portal-input"
                    value={declPlot}
                    onChange={(e) => setDeclPlot(e.target.value)}
                  >
                    {effectivePlots.length > 0 ? (
                      effectivePlots.map((p) => (
                        <option key={p.code} value={p.code}>
                          Lô {p.code} – {p.variety || "Sầu riêng"} ({p.areaHa} ha)
                        </option>
                      ))
                    ) : (
                      <option value="KB-VT-001">Lô KB-VT-001 – Monthong (2.4 ha)</option>
                    )}
                  </select>
                </div>

                <div className="portal-form-group">
                  <label className="portal-label">Ngày dự kiến cắt trái</label>
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
                  <label className="portal-label">Sản lượng ước tính (kg)</label>
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
                  <label className="portal-label">Ước tính Loại 1 / VIP (kg)</label>
                  <input
                    type="number"
                    min="0"
                    className="portal-input"
                    value={declGradeA}
                    onChange={(e) => setDeclGradeA(Number(e.target.value))}
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label">Ước tính Loại 2 (kg)</label>
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
                <label className="portal-label">Ghi chú gửi Cán bộ HTX</label>
                <input
                  type="text"
                  className="portal-input"
                  placeholder="Ví dụ: Trái già đủ ngày, cơm vàng, hộc đều, nhờ HTX kiểm tra dư lượng và hỗ trợ dụng cụ cắt..."
                  value={declNote}
                  onChange={(e) => setDeclNote(e.target.value)}
                />
              </div>

              <div className="form-btn-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowDeclForm(false)}
                >
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingDecl}>
                  {savingDecl ? "Đang gửi đăng ký..." : "Gửi đăng ký thu hoạch cho HTX"}
                </button>
              </div>
            </form>
          )}

          <div className="decl-list">
            {declarations.length === 0 ? (
              <div className="decl-empty-state">
                <EmptyState icon="harvest">
                  Chưa có đợt thu hái nào được đăng ký. Bấm <strong>"+ Báo lịch thu hái mới"</strong> để gửi lịch cắt cho HTX.
                </EmptyState>
              </div>
            ) : (
              declarations.map((d) => (
                <div key={d.id} className="decl-card">
                  <div className="decl-head">
                    <strong className="decl-plot">Lô {d.plotCode}</strong>
                    <span className="decl-date">
                      <Clock size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
                      Ngày cắt: {d.harvestedOn}
                    </span>
                  </div>
                  <div className="decl-weights">
                    <span className="decl-total">Sản lượng: {Number(d.weightKg).toLocaleString("vi-VN")} kg</span>
                    <span className="decl-detail">Loại 1 (VIP): {d.gradeAKg} kg · Loại 2: {d.gradeBKg} kg</span>
                  </div>
                  {d.note && <p className="decl-note"><strong>Ghi chú:</strong> {d.note}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}



      {/* ─── MODAL TICKET VOUCHER CHI TIẾT TEM ĐIỆN TỬ (GIỮ NGUYÊN 100% STYLE CHUẨN) ─── */}
      {selectedLotForQr && (
        <Sheet
          title="Tem điện tử lô hàng"
          onClose={() => setSelectedLotForQr(null)}
        >
          <div className="pt-qr-modal-body">
            <div className="pt-ticket-container">
              <div className="pt-ticket-card">
                {/* ── 1. ĐẦU VÉ: ICON CHECK-MARK & TIÊU ĐỀ ── */}
                <div className="pt-ticket-head">
                  <div className="pt-ticket-popper-wrap" aria-hidden="true">
                    <img
                      src="/check-mark.png"
                      alt="Tem hợp lệ"
                      width={28}
                      height={28}
                      className="pt-ticket-check-icon"
                    />
                  </div>
                  <h3 className="pt-ticket-title">Tem điện tử hợp lệ!</h3>
                  <p className="pt-ticket-sub">
                    Lô sầu riêng đã được cấp mã truy xuất nguồn gốc chính thức
                  </p>
                </div>

                {/* Đường gạch đứt ngăn cách mờ */}
                <div className="pt-ticket-sub-divider" aria-hidden="true" />

                {/* ── 2. THÔNG TIN LÔ HÀNG (PHÍA TRÊN) ── */}
                <div className="pt-ticket-body">
                  <div className="pt-ticket-grid">
                    <div className="pt-ticket-col">
                      <span className="pt-ticket-label">MÃ LÔ HÀNG</span>
                      <strong className="pt-ticket-val">{selectedLotForQr.lotCode}</strong>
                    </div>
                    <div className="pt-ticket-col pt-ticket-col-right">
                      <span className="pt-ticket-label">KHỐI LƯỢNG TỊNH (KLT)</span>
                      <strong className="pt-ticket-val pt-ticket-val-accent">{formatKg(selectedLotForQr.weightKg)}</strong>
                    </div>

                    <div className="pt-ticket-col">
                      <span className="pt-ticket-label">NGÀY THU HOẠCH</span>
                      <strong className="pt-ticket-val">{formatDate(selectedLotForQr.harvestedOn)}</strong>
                    </div>
                    <div className="pt-ticket-col pt-ticket-col-right">
                      <span className="pt-ticket-label">THỊ TRƯỜNG</span>
                      <strong className="pt-ticket-val">{selectedLotForQr.market}</strong>
                    </div>
                  </div>

                  <div className="pt-ticket-entity-box">
                    <div className="pt-ticket-entity-badge" aria-hidden="true">
                      <span className="pt-ticket-badge-circle pt-badge-green">PUC</span>
                      <span className="pt-ticket-badge-circle pt-badge-gold">VG</span>
                    </div>
                    <div className="pt-ticket-entity-info">
                      <div className="pt-ticket-entity-name">{selectedLotForQr.buyer}</div>
                      <div className="pt-ticket-entity-meta">Vùng trồng PUC-KRB-001 · VietGAP</div>
                    </div>
                  </div>
                </div>

                {/* ── 3. ĐƯỜNG RÃNH XÉ VÉ (NOTCHES 2 BÊN & ĐƯỜNG ĐỨT NÉT) ── */}
                <div className="pt-ticket-perforation">
                  <div className="pt-ticket-notch pt-ticket-notch-l" aria-hidden="true" />
                  <div className="pt-ticket-dash-line" aria-hidden="true" />
                  <div className="pt-ticket-notch pt-ticket-notch-r" aria-hidden="true" />
                </div>

                {/* ── 4. CUỐNG VÉ: MÃ QR CODE ── */}
                <div className="pt-ticket-stub">
                  <div className="pt-ticket-qr-wrap">
                    <div className="pt-qr-frame">
                      <TicketQrImage lotCode={selectedLotForQr.lotCode} qrCode={selectedLotForQr.qrCode} />
                    </div>
                    <div className="pt-ticket-barcode-num">
                      <span>{selectedLotForQr.qrCode || selectedLotForQr.lotCode}</span>
                    </div>
                    <p className="pt-ticket-scan-hint">
                      Quét mã QR để kiểm tra nguồn gốc &amp; nhật ký canh tác
                    </p>
                  </div>
                </div>

                {/* ── 5. CẠNH RĂNG CƯA ĐÁY VÉ ── */}
                <div className="pt-ticket-scallop-bottom" aria-hidden="true">
                  <svg viewBox="0 0 320 14" preserveAspectRatio="none" className="pt-ticket-scallop-svg">
                    <path
                      d="M0,0 L320,0 L320,2 A20,12 0 0,1 280,2 A20,12 0 0,1 240,2 A20,12 0 0,1 200,2 A20,12 0 0,1 160,2 A20,12 0 0,1 120,2 A20,12 0 0,1 80,2 A20,12 0 0,1 40,2 A20,12 0 0,1 0,2 Z"
                      fill="#ffffff"
                    />
                  </svg>
                </div>
              </div>

              <a
                href={`/trace/${encodeURIComponent(selectedLotForQr.lotCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pt-btn pt-btn-primary pt-ticket-open-btn"
              >
                <span>Xem toàn bộ hồ sơ truy xuất</span>
                <ArrowUpRight size={17} strokeWidth={2.4} aria-hidden="true" />
              </a>
            </div>
          </div>
        </Sheet>
      )}

      <style jsx>{`
        .portal-tab-content {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
        }


        .pt-harvest-rules-section {
          max-width: 720px;
          margin-bottom: 22px;
          padding: 0 0 4px;
        }
        .pt-harvest-rules-section .pt-schedule-header {
          padding: 0 2px 10px;
        }
        .pt-harvest-rules-section .pt-schedule-title {
          font-size: 1.2rem;
          font-weight: 750;
          color: var(--ink);
          margin: 0;
          letter-spacing: -0.015em;
        }

        .pt-harvest-segmented {
          display: flex;
          width: 100%;
          max-width: 440px;
          gap: 4px;
          padding: 4px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 2px 10px rgba(20, 55, 47, 0.04);
          box-sizing: border-box;
          margin-bottom: 20px;
        }
        .pt-harvest-segmented button {
          flex: 1 1 0;
          min-width: 0;
          padding: 8px 12px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: var(--text-secondary);
          font: inherit;
          font-size: 13.5px;
          font-weight: 600;
          letter-spacing: -0.01em;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
        }
        .pt-harvest-segmented button:hover {
          background: rgba(20, 55, 47, 0.05);
          color: var(--ink);
        }
        .pt-harvest-segmented button.active {
          background: var(--ink);
          color: #fff;
          box-shadow: 0 4px 14px rgba(20, 55, 47, 0.2);
        }
        .pt-harvest-segmented button:focus-visible {
          outline: 2px solid var(--green-600);
          outline-offset: 2px;
        }
        .tab-label-mobile {
          display: none;
        }

        .portal-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
          box-sizing: border-box;
        }
        .portal-card-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .portal-card-title {
          font-size: 16.5px;
          font-weight: 750;
          color: var(--ink);
          margin: 0 0 4px;
        }
        .portal-card-sub {
          font-size: 12.5px;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.45;
        }

        .portal-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.4;
        }
        .portal-alert-success {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }

        .pt-harvest-decl-view {
          width: 100%;
        }

        .decl-topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 18px;
        }
        .decl-topbar-info {
          flex: 1 1 auto;
          min-width: 0;
        }
        .decl-topbar-title {
          font-size: 16.5px;
          font-weight: 750;
          color: var(--ink);
          margin: 0 0 3px;
          line-height: 1.25;
        }
        .decl-topbar-sub {
          font-size: 12.5px;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.4;
        }
        .decl-add-btn {
          flex-shrink: 0;
          white-space: nowrap;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 700;
          border-radius: 18px;
          border: none !important;
          outline: none !important;
          background: #e05326 !important;
          color: #ffffff !important;
          box-shadow: 0 3px 10px rgba(224, 83, 38, 0.28);
          margin-top: 1px;
        }
        .decl-add-btn:hover {
          background: #cf461b !important;
        }

        .harvest-decl-form {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 18px 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 18px rgba(20, 55, 47, 0.04);
        }
        .form-legend {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
          font-size: 14px;
          color: #0f172a;
          margin-bottom: 14px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 8px;
        }
        .portal-form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .portal-form-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
        }
        .portal-form-group {
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .portal-label {
          font-size: 12px;
          font-weight: 600;
          color: #334155;
        }
        .portal-input {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          font-size: 13.5px;
          background: #ffffff;
          color: var(--ink);
        }
        .portal-input:focus {
          outline: none;
          border-color: #16a34a;
          box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.15);
        }

        .form-btn-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 10px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          border: none !important;
          outline: none !important;
          text-decoration: none;
          user-select: none;
        }
        .btn-sm {
          padding: 9px 16px;
          font-size: 13px;
        }
        .btn-primary {
          background: #e05326;
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(224, 83, 38, 0.28);
        }
        .btn-primary:hover {
          background: #cf461b;
        }
        .btn-secondary {
          background: #f1f3f8;
          color: #475569;
        }
        .btn-secondary:hover {
          background: #e4e7ed;
          color: #0f172a;
        }

        .decl-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .decl-card {
          padding: 16px 18px;
          border-radius: 16px;
          background: #ffffff;
          border: 1px solid var(--border);
          box-shadow: 0 2px 10px rgba(20, 55, 47, 0.03);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .decl-card:hover {
          box-shadow: 0 4px 14px rgba(20, 55, 47, 0.06);
        }
        .decl-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .decl-plot {
          font-size: 14.5px;
          font-weight: 750;
          color: #0f172a;
          margin-right: 10px;
        }
        .decl-date {
          font-size: 12.5px;
          color: #64748b;
        }
        .decl-weights {
          display: flex;
          gap: 12px;
          font-size: 13px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        }
        .decl-total {
          font-weight: 700;
          color: #166534;
        }
        .decl-detail {
          color: #475569;
        }
        .decl-note {
          font-size: 12.5px;
          color: #475569;
          margin: 6px 0 0;
          background: #f8fafc;
          padding: 8px 12px;
          border-radius: 8px;
          border: none;
        }

        .decl-empty-state {
          background: #ffffff;
          border: 1px dashed var(--border);
          border-radius: 16px;
          padding: 24px 16px;
          text-align: center;
        }



        @media (max-width: 640px) {
          .pt-harvest-segmented {
            max-width: 100%;
            margin-bottom: 14px;
          }
          .pt-harvest-segmented button {
            padding: 7px 6px;
            font-size: 12.5px;
          }
          .decl-topbar {
            margin-bottom: 14px;
            gap: 10px;
          }
          .decl-topbar-title {
            font-size: 15.5px;
          }
          .decl-topbar-sub {
            font-size: 12px;
          }
          .decl-add-btn {
            padding: 6px 12px;
            font-size: 12px;
          }
          .portal-form-grid-2,
          .portal-form-grid-3 {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          .tab-label-desktop {
            display: none;
          }
          .tab-label-mobile {
            display: inline;
          }

        }
      `}</style>
    </div>
  );
}

/* ── COMPONENT THẺ TÀI SẢN LÔ HÀNG XUẤT KHẨU (CHUYỂN TỪ THỬA ĐẤT SANG) ── */
interface HarvestAssetTagCardProps {
  lot: PortalHarvest;
  pucCode?: string;
  onOpenModal: () => void;
}

function HarvestAssetTagCard({
  lot,
  pucCode = "PUC-KRB-001",
  onOpenModal,
}: HarvestAssetTagCardProps) {
  const [qrSrc, setQrSrc] = useState<string>("");
  const status = HARVEST_STATUS[lot.status];

  const watermarkTitle =
    lot.status === "exported" || lot.status === "delivered"
      ? "ĐÃ XUẤT KHO"
      : (status?.label || lot.status).toUpperCase();

  const watermarkSub =
    lot.status === "exported" || lot.status === "delivered"
      ? "HTX KRÔNG BÚK · ĐÃ KIỂM TRA"
      : "HTX KRÔNG BÚK · GIÁM SÁT";

  useEffect(() => {
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = `${origin}/trace/${encodeURIComponent(lot.qrCode || lot.lotCode)}`;

    QRCode.toDataURL(targetUrl, {
      margin: 0,
      width: 320,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setQrSrc(url);
      })
      .catch((err) => {
        console.error("Failed to generate asset QR code", err);
      });

    return () => {
      active = false;
    };
  }, [lot.qrCode, lot.lotCode]);

  return (
    <div className="pt-asset-card" data-status={lot.status}>
      {/* ── DẤU MỘC WATERMARK XUẤT HÀNG (DỜI SANG PHÍA PHẢI, MỜ NHẸ, KHÔNG ẢNH HƯỞNG CHỮ TEM) ── */}
      <div className="pt-asset-watermark" aria-hidden="true">
        <div className="pt-asset-watermark-inner">
          <span className="pt-asset-watermark-title">{watermarkTitle}</span>
          <span className="pt-asset-watermark-sub">{watermarkSub}</span>
        </div>
      </div>

      {/* ── BÊN TRÁI: THÔNG TIN TEM LÔ HÀNG ── */}
      <div className="pt-asset-left">
        {/* Dòng 1: Tên sản phẩm, Đơn vị & Mã số vùng trồng */}
        <div className="pt-asset-sub-title">
          <span>SẦU RIÊNG TƯƠI</span>
          <span className="pt-asset-dot">·</span>
          <span className="pt-asset-hide-mobile">HTX KRÔNG BÚK</span>
          <span className="pt-asset-dot pt-asset-hide-mobile">·</span>
          <span>{pucCode}</span>
        </div>

        {/* Dòng 2: Mã lô & Khối lượng tịnh (KLT) nằm trọn trên 1 dòng */}
        <div className="pt-asset-code-line">
          <span className="pt-asset-code-val">LÔ {lot.lotCode}</span>
          <span className="pt-asset-code-divider">·</span>
          <span className="pt-asset-weight-val">KLT: {formatKg(lot.weightKg)}</span>
        </div>

        {/* Dòng 3: Mã truy xuất nguồn gốc */}
        <div className="pt-asset-id-group">
          <span className="pt-asset-id-label">MÃ TRUY XUẤT</span>
          <strong className="pt-asset-id-val">{lot.qrCode || lot.lotCode}</strong>
        </div>

        {/* Dòng 4: Ngày thu hoạch & Nơi nhận */}
        <div className="pt-asset-meta">
          <span>Ngày thu: {formatDate(lot.harvestedOn)}</span>
          <span className="pt-asset-meta-dot">·</span>
          <span>{lot.buyer} ({lot.market === "Trung Quốc" ? "Xuất khẩu TQ" : lot.market})</span>
        </div>
      </div>

      {/* ── BÊN PHẢI: MÃ QR CODE TRUY XUẤT THEO CHUẨN THÔNG TƯ 02/2024/TT-BKHCN ── */}
      <div className="pt-asset-right">
        <button
          type="button"
          className="pt-asset-qr-btn"
          onClick={onOpenModal}
          title="Bấm để mở tem vé chi tiết hoặc dùng máy ảnh quét trực tiếp"
          aria-label={`Mã QR tra cứu nguồn gốc lô ${lot.lotCode} - Bấm để mở tem chi tiết`}
        >
          <div className="pt-asset-qr-box">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={`Mã QR tra cứu nguồn gốc lô ${lot.lotCode}`}
                className="pt-asset-qr-img"
              />
            ) : (
              <div className="pt-asset-qr-loading" aria-hidden="true">
                <QrCode size={110} strokeWidth={1.8} />
              </div>
            )}
            <div className="pt-asset-qr-overlay">
              <span className="pt-asset-qr-badge">
                <ArrowUpRight size={13} strokeWidth={2.5} aria-hidden="true" />
                <span>Bấm mở</span>
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

/* ── COMPONENT HÌNH ẢNH MÃ QR CỦA TEM VÉ VOUCHER (CĂN GIỮA HOÀN HẢO) ── */
function TicketQrImage({ lotCode, qrCode }: { lotCode: string; qrCode?: string | null }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = `${origin}/trace/${encodeURIComponent(qrCode || lotCode)}`;

    QRCode.toDataURL(targetUrl, {
      margin: 0,
      width: 320,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then((url) => {
      if (active) setSrc(url);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [lotCode, qrCode]);

  if (!src) {
    return <QrCode size={110} strokeWidth={1.8} className="pt-qr-code-icon" aria-hidden="true" />;
  }

  return <img src={src} alt={`Mã QR ${lotCode}`} className="pt-qr-frame-img" />;
}
