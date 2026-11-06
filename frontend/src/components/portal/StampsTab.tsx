"use client";

import { FormEvent, useState } from "react";
import { Calendar, CheckCircle2, Clock, Plus } from "lucide-react";
import { RadialPngIcon } from "./RadialIcons";
import { api, errorMessage } from "@/lib/api-client";
import { invalidatePortal, usePortal } from "@/hooks/use-portal";
import { DECLARATION_STATUS, todayIso, toNumber } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type {
  CreateHarvestDeclarationBody,
  PortalHarvest,
  PortalHarvestDeclaration,
  PortalList,
  PortalOverview,
  PortalPlot,
  PortalPlots,
} from "@/types/portal";
import { HarvestAssetTagCard, HarvestLotQrModal } from "./harvest/HarvestLotTicket";
import { BusyButton, ConfirmButton, InlineError, PhotoField, StoredPhoto, usePhotoPicker } from "./shared/controls";
import { EmptyState, Pill, SectionDivider, StateBlock } from "./ui";

import type { PortalAction } from "./PortalSearch";
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
  /** Thao tác chọn từ ô tìm kiếm: mở sẵn biểu mẫu khai báo hoặc danh sách lô hàng. */
  initialAction?: PortalAction;
}

export default function StampsTab({ plots = [], initialAction }: Props) {
  const plotsData = usePortal<PortalPlots>("plots");
  const harvest = usePortal<PortalList<PortalHarvest>>("harvest");
  const declarationsQuery = usePortal<PortalList<PortalHarvestDeclaration>>("harvest-declarations");

  const effectivePlots = plots.length > 0 ? plots : (plotsData.data?.data ?? []);
  const declarations = declarationsQuery.data?.data ?? [];

  const [subTab, setSubTab] = useState<"harvest_decl" | "harvest_lots">(() =>
    initialAction === "harvest-lots" ? "harvest_lots" : "harvest_decl",
  );
  const [selectedLotForQr, setSelectedLotForQr] = useState<PortalHarvest | null>(null);

  // Form khai báo / đăng ký thu hái
  const [showDeclForm, setShowDeclForm] = useState(() => initialAction === "decl-add");
  const [declPlot, setDeclPlot] = useState("");
  const [declDate, setDeclDate] = useState(() => todayIso());
  const [declWeight, setDeclWeight] = useState("1200");
  const [declGradeA, setDeclGradeA] = useState("900");
  const [declGradeB, setDeclGradeB] = useState("300");
  const [declRating, setDeclRating] = useState("Loại 1 (VIP)");
  const [declNote, setDeclNote] = useState("");
  const declPhoto = usePhotoPicker("harvest");
  const [savingDecl, setSavingDecl] = useState(false);
  const [declError, setDeclError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const effectiveDeclPlot = declPlot || effectivePlots[0]?.code || "";

  const handleSaveDecl = async (e: FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setDeclError(null);

    const plotCode = effectiveDeclPlot.trim();
    if (!plotCode) {
      setDeclError("Vui lòng chọn hoặc nhập mã thửa đất thu hái.");
      return;
    }
    const weight = Number(declWeight);
    const gradeA = Number(declGradeA || 0);
    const gradeB = Number(declGradeB || 0);

    if (!Number.isFinite(weight) || weight <= 0) {
      setDeclError("Tổng sản lượng thu hái phải lớn hơn 0 kg.");
      return;
    }
    if (gradeA < 0 || gradeB < 0) {
      setDeclError("Khối lượng phân loại không được âm.");
      return;
    }
    if (gradeA + gradeB > weight + 1e-6) {
      setDeclError("Tổng khối lượng Loại 1 (A) và Loại 2 (B) không được vượt quá tổng sản lượng.");
      return;
    }
    if (declDate > todayIso()) {
      setDeclError("Ngày khai báo thu hái không được ở tương lai.");
      return;
    }

    setSavingDecl(true);
    try {
      const photoId = await declPhoto.ensureUploaded();
      const body: CreateHarvestDeclarationBody = {
        plotCode,
        harvestedOn: declDate,
        weightKg: weight,
        gradeAKg: gradeA,
        gradeBKg: gradeB,
        qualityRating: declRating || undefined,
        note: declNote.trim() || undefined,
        photoId,
      };
      await api.post("/portal/harvest-declarations", body);
      setShowDeclForm(false);
      setDeclNote("");
      declPhoto.clear();
      setSuccessMsg(`Đã gửi khai báo thu hái cho Thửa ${plotCode} thành công! HTX đã tiếp nhận thông tin.`);
      invalidatePortal("harvest-declarations", "harvest", "overview");
    } catch (err) {
      setDeclError(errorMessage(err, "Có lỗi khi lưu khai báo thu hái."));
    } finally {
      setSavingDecl(false);
    }
  };

  const handleDeleteDecl = async (id: number) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await api.delete(`/portal/harvest-declarations/${id}`);
      invalidatePortal("harvest-declarations", "overview");
    } catch (err) {
      setDeleteError(errorMessage(err, "Không xóa được bản khai báo thu hái."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="portal-tab-content">
      {/* ─── 1. QUY CHUẨN THU HOẠCH ─── */}
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
                  <div className="pt-vietgap-track-col" aria-hidden="true">
                    <div className="pt-vietgap-capsule" style={{ background: rule.capsuleBg }}>
                      <div className="pt-vietgap-dot" />
                      <div className="pt-vietgap-dot" />
                    </div>
                  </div>
                  <div className={`pt-vietgap-content pt-vietgap-card ${rule.cardClass}`}>
                    <span className="pt-timeline-kicker">{rule.kicker}</span>
                    <h3 className="pt-timeline-title">{rule.title}</h3>
                    <p className="pt-timeline-desc">{rule.desc}</p>
                  </div>
                </div>
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

      <SectionDivider />

      {/* ─── 2. THANH ĐIỀU HƯỚNG CHỨC NĂNG ─── */}
      <div className="pt-segmented pt-harvest-segmented" role="tablist" aria-label="Chế độ thu hoạch">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "harvest_decl"}
          className={subTab === "harvest_decl" ? "active" : ""}
          onClick={() => setSubTab("harvest_decl")}
        >
          <span className="tab-label-desktop">Khai báo thu hái ({declarations.length})</span>
          <span className="tab-label-mobile">Khai báo ({declarations.length})</span>
        </button>
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

      {/* ─── CHẾ ĐỘ 2: KẾ HOẠCH & KHAI BÁO THU HÁI TẠI VƯỜN ─── */}
      {subTab === "harvest_decl" && (
        <div className="pt-harvest-decl-view">
          <div className="decl-topbar">
            <div className="decl-topbar-info">
              <h3 className="decl-topbar-title">Khai báo thu hái tại vườn</h3>
              <p className="decl-topbar-sub">
                Gửi thông tin sản lượng thu hái để HTX kiểm định chất lượng &amp; xác nhận vào lô xuất khẩu.
              </p>
            </div>
            {!showDeclForm && (
              <button
                type="button"
                className="btn btn-primary btn-sm decl-add-btn"
                onClick={() => {
                  setShowDeclForm(true);
                  setSuccessMsg(null);
                  setDeclError(null);
                }}
              >
                <Plus size={15} />
                <span>Khai báo mới</span>
              </button>
            )}
          </div>

          {successMsg && (
            <div className="portal-alert portal-alert-success" style={{ marginBottom: "16px" }}>
              <CheckCircle2 size={18} />
              <span>{successMsg}</span>
            </div>
          )}

          <InlineError message={deleteError} />

          {showDeclForm && (
            <form onSubmit={handleSaveDecl} className="harvest-decl-form">
              <div className="form-legend">
                <Calendar size={16} />
                <span>Khai báo đợt thu hái sầu riêng gửi HTX</span>
              </div>

              <div className="portal-form-grid-2">
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="hd-plot">
                    Thửa đất canh tác thu hái
                  </label>
                  {effectivePlots.length > 0 ? (
                    <select
                      id="hd-plot"
                      className="portal-input"
                      value={effectiveDeclPlot}
                      onChange={(e) => setDeclPlot(e.target.value)}
                      required
                    >
                      {effectivePlots.map((p) => (
                        <option key={p.code} value={p.code}>
                          Thửa {p.code} – {p.variety || "Sầu riêng"} ({p.areaHa} ha)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="hd-plot"
                      type="text"
                      className="portal-input"
                      placeholder="Nhập mã thửa đất"
                      value={effectiveDeclPlot}
                      onChange={(e) => setDeclPlot(e.target.value)}
                      required
                    />
                  )}
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="hd-date">
                    Ngày cắt trái
                  </label>
                  <input
                    id="hd-date"
                    type="date"
                    className="portal-input"
                    max={todayIso()}
                    value={declDate}
                    onChange={(e) => setDeclDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="portal-form-grid-3">
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="hd-weight">
                    Tổng sản lượng (kg)
                  </label>
                  <input
                    id="hd-weight"
                    type="number"
                    min="1"
                    step="0.1"
                    className="portal-input"
                    value={declWeight}
                    onChange={(e) => setDeclWeight(e.target.value)}
                    required
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="hd-grade-a">
                    Loại 1 / VIP (kg)
                  </label>
                  <input
                    id="hd-grade-a"
                    type="number"
                    min="0"
                    step="0.1"
                    className="portal-input"
                    value={declGradeA}
                    onChange={(e) => setDeclGradeA(e.target.value)}
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="hd-grade-b">
                    Loại 2 (kg)
                  </label>
                  <input
                    id="hd-grade-b"
                    type="number"
                    min="0"
                    step="0.1"
                    className="portal-input"
                    value={declGradeB}
                    onChange={(e) => setDeclGradeB(e.target.value)}
                  />
                </div>
              </div>

              <div className="portal-form-grid-2">
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="hd-rating">
                    Đánh giá chất lượng dự kiến
                  </label>
                  <select
                    id="hd-rating"
                    className="portal-input"
                    value={declRating}
                    onChange={(e) => setDeclRating(e.target.value)}
                  >
                    <option value="Loại 1 (VIP)">Loại 1 (VIP xuất khẩu)</option>
                    <option value="Loại 2 (Chuẩn)">Loại 2 (Chuẩn VietGAP)</option>
                    <option value="Xô / Nội địa">Hàng xô / Tiêu thụ nội địa</option>
                  </select>
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="hd-note">
                    Ghi chú gửi Cán bộ HTX
                  </label>
                  <input
                    id="hd-note"
                    type="text"
                    className="portal-input"
                    placeholder="Ví dụ: Trái già đủ ngày, cơm vàng, nhờ HTX kiểm định..."
                    value={declNote}
                    onChange={(e) => setDeclNote(e.target.value)}
                  />
                </div>
              </div>

              <PhotoField
                id="hd-photo"
                label="Ảnh lô sầu riêng thu hái tại vườn"
                picker={declPhoto}
                title="Chụp ảnh hoặc tải ảnh lô sầu riêng"
                description="Đính kèm ảnh thực tế giúp cán bộ HTX duyệt xác nhận nhanh hơn"
                disabled={savingDecl}
              />

              <InlineError message={declError} />

              <div className="form-btn-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowDeclForm(false)}
                  disabled={savingDecl}
                >
                  Hủy bỏ
                </button>
                <BusyButton
                  type="submit"
                  className="btn btn-primary btn-sm"
                  busy={savingDecl}
                  busyLabel="Đang gửi khai báo…"
                >
                  Gửi khai báo thu hái cho HTX
                </BusyButton>
              </div>
            </form>
          )}

          <StateBlock loading={declarationsQuery.loading} error={declarationsQuery.error} />

          {!declarationsQuery.loading && (
            <div className="decl-list">
              {declarations.length === 0 ? (
                <div className="decl-empty-state">
                  <EmptyState icon="harvest">
                    Chưa có đợt thu hái nào được đăng ký. Bấm <strong>“+ Khai báo mới”</strong> để gửi thông tin thu hái cho HTX.
                  </EmptyState>
                </div>
              ) : (
                declarations.map((d) => {
                  const statusInfo = DECLARATION_STATUS[d.status] ?? DECLARATION_STATUS.submitted;
                  const weight = toNumber(d.weightKg) ?? 0;
                  const gradeA = toNumber(d.gradeAKg) ?? 0;
                  const gradeB = toNumber(d.gradeBKg) ?? 0;
                  return (
                    <div key={d.id} className="decl-card">
                      <div className="decl-head">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong className="decl-plot">Thửa {d.plotCode}</strong>
                          <Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>
                        </div>
                        <span className="decl-date">
                          <Clock size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
                          Ngày cắt: {formatDate(d.harvestedOn)}
                        </span>
                      </div>

                      <div className="decl-weights">
                        <span className="decl-total">Tổng sản lượng: {weight.toLocaleString("vi-VN")} kg</span>
                        <span className="decl-detail">
                          Loại 1 (VIP): {gradeA.toLocaleString("vi-VN")} kg · Loại 2: {gradeB.toLocaleString("vi-VN")} kg
                          {d.qualityRating ? ` · ${d.qualityRating}` : ""}
                        </span>
                      </div>

                      {d.note && (
                        <p className="decl-note">
                          <strong>Ghi chú của hộ:</strong> {d.note}
                        </p>
                      )}

                      {d.reviewNote && (
                        <p
                          className="decl-note"
                          style={{
                            background: d.status === "rejected" ? "#fef2f2" : "#ecfdf5",
                            color: d.status === "rejected" ? "#991b1b" : "#065f46",
                            border: `1px solid ${d.status === "rejected" ? "#fecaca" : "#a7f3d0"}`,
                          }}
                        >
                          <strong>Phản hồi từ HTX:</strong> {d.reviewNote}
                        </p>
                      )}

                      {d.photoUrl && (
                        <div style={{ marginTop: 10 }}>
                          <StoredPhoto
                            url={d.photoUrl}
                            alt={`Ảnh thu hái thửa ${d.plotCode}`}
                            caption={`Thửa ${d.plotCode} · ${formatDate(d.harvestedOn)}`}
                          />
                        </div>
                      )}

                      {d.status === "submitted" && (
                        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                          <ConfirmButton
                            label={
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <RadialPngIcon src="/trash.png" size={14} />
                                <span>Xóa khai báo</span>
                              </span>
                            }
                            question="Xác nhận xóa bản khai báo thu hái đang chờ xác nhận này?"
                            confirmLabel="Xóa khai báo"
                            busy={deletingId === d.id}
                            onConfirm={() => void handleDeleteDecl(d.id)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL TICKET VOUCHER CHI TIẾT TEM ĐIỆN TỬ ─── */}
      {selectedLotForQr && (
        <HarvestLotQrModal
          lot={selectedLotForQr}
          onClose={() => setSelectedLotForQr(null)}
        />
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
        .portal-tab-content > :global(.pt-section-divider) {
          margin: 0 auto 22px;
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
          max-width: 640px;
          gap: 4px;
          padding: 4px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: #fff;
          box-shadow: 0 2px 10px rgba(20, 55, 47, 0.04);
          box-sizing: border-box;
          margin-bottom: 20px;
        }
        .pt-harvest-segmented button {
          flex: 1 1 0;
          min-width: 0;
          padding: 8px 10px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: var(--text-secondary);
          font: inherit;
          font-size: 13px;
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
          box-shadow: none;
        }
        .pt-harvest-segmented button:focus-visible {
          outline: 2px solid var(--green-600);
          outline-offset: 2px;
        }
        .tab-label-mobile {
          display: none;
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
          padding: 10.5px 16px 8px;
          line-height: 1;
          text-align: center;
          font-size: 13px;
          font-weight: 700;
          border-radius: 7px !important;
          border: none !important;
          outline: none !important;
          background: #dfe9f8 !important;
          color: #0084ff !important;
          box-shadow: none !important;
          margin-top: 1px;
        }
        .decl-add-btn:hover {
          background: #d0dff5 !important;
          color: #006ee6 !important;
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
          border-radius: 12px;
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
          border-radius: 10px;
        }
        .btn-primary {
          background: #dfe9f8;
          color: #0084ff;
          box-shadow: none;
        }
        .btn-primary:hover {
          background: #d0dff5;
          color: #006ee6;
        }
        .btn-secondary {
          background: #dfe9f8;
          color: #0084ff;
          border: none !important;
          box-shadow: none;
        }
        .btn-secondary:hover {
          background: #d0dff5;
          color: #006ee6;
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
          flex-wrap: wrap;
          gap: 6px;
        }
        .decl-plot {
          font-size: 14.5px;
          font-weight: 750;
          color: #0f172a;
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
            font-size: 12px;
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
            padding: 9.5px 15px 7px;
            line-height: 1;
            font-size: 12.5px;
            border-radius: 7px !important;
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
