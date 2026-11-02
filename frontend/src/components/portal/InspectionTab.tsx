"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePortal } from "@/hooks/use-portal";
import { formatDate } from "@/utils/format";
import type { PortalLabTest, PortalList, PortalScheduleItem, PortalViolation } from "@/types/portal";
import type { PortalTabId } from "./PortalApp";
import { Card, EmptyState, Pill, Sheet, StateBlock } from "./ui";

function getRelativeScheduleNote(dateStr: string): string {
  if (!dateStr) return "";
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return "";
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Ngày mai";
  if (diffDays > 1 && diffDays <= 30) return `Còn ${diffDays} ngày`;
  if (diffDays > 30) return "Tháng tới";
  if (diffDays === -1) return "Hôm qua";
  if (diffDays < -1) return "Đã diễn ra";
  return "";
}

const ROUTE_THEMES = [
  {
    capsuleBg: "linear-gradient(180deg, #f59e0b 0%, #fbbf24 100%)",
    tagBg: "#fef3c7",
    tagColor: "#b45309",
    titleColor: "#92400e",
    defaultNote: "Kiểm tra thực địa độ che phủ, hệ thống tưới và ghi chép nhật ký canh tác của hộ.",
  },
  {
    capsuleBg: "linear-gradient(180deg, #f43f5e 0%, #fb7185 100%)",
    tagBg: "#ffe4e6",
    tagColor: "#be123c",
    titleColor: "#9f1239",
    defaultNote: "Lấy mẫu quả và đất ngẫu nhiên gửi phòng Lab phân tích tồn dư hóa chất & kim loại nặng.",
  },
  {
    capsuleBg: "linear-gradient(180deg, #10b981 0%, #34d399 100%)",
    tagBg: "#d1fae5",
    tagColor: "#047857",
    titleColor: "#065f46",
    defaultNote: "Tái thẩm định điều kiện cơ sở hạ tầng, kho vật tư và nghiệm thu kết quả đánh giá vùng trồng.",
  },
  {
    capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)",
    tagBg: "#dbeafe",
    tagColor: "#1d4ed8",
    titleColor: "#1e40af",
    defaultNote: "Giám sát đột xuất tuân thủ thời gian cách ly trước ngày thu hoạch xuất khẩu.",
  },
];

export default function InspectionTab({ onNavigate }: { onNavigate?: (tab: PortalTabId) => void }) {
  const schedule = usePortal<PortalList<PortalScheduleItem>>("schedule");
  const tests = usePortal<PortalList<PortalLabTest>>("lab-tests");
  const violations = usePortal<PortalList<PortalViolation>>("violations");
  const [selectedTest, setSelectedTest] = useState<PortalLabTest | null>(null);

  // Hoàn toàn loại bỏ các cảnh báo về nhật ký canh tác khỏi tab Kiểm tra
  // (Mọi cảnh báo/nhắc nhở về nhật ký chỉ thuộc về tab Nhật ký canh tác)
  const inspectionViolations = useMemo(() => {
    if (!violations.data?.data) return [];
    return violations.data.data.filter((v) => {
      const lower = (v.title + " " + (v.description || "")).toLowerCase();
      return !lower.includes("nhật ký");
    });
  }, [violations.data]);

  return (
    <div className="pt-stack">
      {/* 1. KHỐI CẢNH BÁO VI PHẠM (CHỈ HIỂN THỊ VI PHẠM THỰC ĐỊA / QUY CHUẨN KIỂM TRA, KHÔNG CÓ NHẬT KÝ) */}
      {inspectionViolations.length > 0 && (
        <Card title="Cảnh báo & Vi phạm cần khắc phục">
          <ul className="pt-list">
            {inspectionViolations.map((v) => {
              const isOpen = v.status === "open";

              return (
                <li key={v.id} className="pt-notice" style={{ borderBottom: "1px solid var(--border-light, #f1f5f9)", paddingBottom: 14 }}>
                  <div className="pt-notice-head">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <AlertTriangle
                        size={18}
                        style={{ color: v.severity === "critical" ? "#dc2626" : "#f59e0b", flexShrink: 0 }}
                      />
                      <strong>{v.title}</strong>
                    </div>
                    <Pill tone={isOpen ? (v.severity === "critical" ? "red" : "gold") : "green"}>
                      {isOpen ? (v.severity === "critical" ? "Nghiêm trọng" : "Cần khắc phục") : "Đã xử lý"}
                    </Pill>
                  </div>

                  {v.description && <p style={{ margin: "4px 0 6px", color: "var(--text-primary)" }}>{v.description}</p>}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                    <p className="pt-notice-meta">
                      Phát hiện: {formatDate(v.detectedOn)}
                      {v.plotCode ? ` · Thửa ${v.plotCode}` : ""}
                    </p>
                  </div>

                  {v.resolvedOn && (
                    <p className="pt-notice-meta" style={{ color: "#059669", marginTop: 4 }}>
                      ✓ Đã khắc phục ngày: {formatDate(v.resolvedOn)}
                      {v.resolutionNotes ? ` (${v.resolutionNotes})` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* 2. LỊCH KIỂM TRA SẮP TỚI */}
      <section className="pt-schedule-section" aria-labelledby="inspection-schedule-heading">
        <div className="pt-schedule-header">
          <h2 id="inspection-schedule-heading" className="pt-schedule-title">
            Lịch kiểm tra
          </h2>
        </div>
        <StateBlock loading={schedule.loading} error={schedule.error} />
        {schedule.data && schedule.data.data.length === 0 && (
          <EmptyState icon="calendar">Hiện chưa có lịch kiểm tra nào sắp tới.</EmptyState>
        )}
        {schedule.data && schedule.data.data.length > 0 && (
          <div className="pt-transit-timeline" role="list">
            {schedule.data.data.map((item, idx, arr) => {
              const theme = ROUTE_THEMES[idx % ROUTE_THEMES.length];
              const isLast = idx === arr.length - 1;
              const rel = getRelativeScheduleNote(item.scheduledOn);

              return (
                <div key={item.id} className="pt-transit-step">
                  <div className="pt-transit-segment">
                    {/* Trục Timeline dải capsule dày + 2 chấm trắng nhỏ */}
                    <div className="pt-transit-track-col" aria-hidden="true">
                      <div
                        className="pt-transit-capsule"
                        style={{ background: theme.capsuleBg }}
                      >
                        <div className="pt-transit-dot" />
                        <div className="pt-transit-dot" />
                      </div>
                    </div>

                    {/* Khối nội dung màu sáng thanh lịch */}
                    <div className="pt-transit-content">
                      <div className="pt-transit-head">
                        <h3 className="pt-transit-title" style={{ color: theme.titleColor }}>
                          {item.title}
                        </h3>
                      </div>

                      <div className="pt-transit-meta-row">
                        <div className="pt-transit-meta-item">
                          <span className="pt-transit-date-highlight">{formatDate(item.scheduledOn)}</span>
                          {rel && <span className="pt-transit-rel-badge">({rel})</span>}
                        </div>
                        <div className="pt-transit-meta-item">
                          <span>Cán bộ:</span>
                          <strong>{item.officer}</strong>
                        </div>
                      </div>

                      <p className="pt-transit-desc">{theme.defaultNote}</p>
                    </div>
                  </div>

                  {/* Đoạn nối chuyển tiếp giữa 2 chặng (Dotted line với các dấu chấm mini chuẩn VietGAP) */}
                  {!isLast && (
                    <div className="pt-transit-transfer" aria-hidden="true">
                      <div className="pt-transit-transfer-track">
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Card title="Kết quả kiểm nghiệm">
        <StateBlock loading={tests.loading} error={tests.error} />
        {tests.data && tests.data.data.length === 0 && (
          <EmptyState icon="lab">Chưa có kết quả kiểm nghiệm nào.</EmptyState>
        )}
        {tests.data && tests.data.data.length > 0 && (
          <ul className="pt-list">
            {tests.data.data.map((test) => (
              <li
                key={test.id}
                className="pt-lab-test-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTest(test)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedTest(test);
                  }
                }}
                title="Bấm để xem chi tiết kết quả kiểm nghiệm"
              >
                <div className="pt-lab-test-title">
                  {test.code} · Thửa {test.plotCode}
                </div>
                <div className="pt-lab-test-time">
                  {formatDate(test.sampledOn)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Popup chi tiết kết quả kiểm nghiệm khi bấm vào dòng */}
      {selectedTest && (
        <Sheet
          title="Kết quả kiểm nghiệm"
          onClose={() => setSelectedTest(null)}
        >
          <LabTestDetailModal
            test={selectedTest}
            onClose={() => setSelectedTest(null)}
          />
        </Sheet>
      )}
    </div>
  );
}

/** Popup hiển thị toàn bộ chỉ số xét nghiệm và kết luận đánh giá của mẫu kiểm nghiệm */
function LabTestDetailModal({
  test,
  onClose,
}: {
  test: PortalLabTest;
  onClose: () => void;
}) {
  const isPass = test.result === "pass";

  return (
    <div className="pt-pesticide-modal-body">
      {/* 1. Header: Mã kiểm nghiệm, Thửa đất & Trạng thái */}
      <div className="pt-lab-modal-hero">
        <div className="pt-lab-modal-hero-top">
          <div>
            <span className="pt-lab-modal-sub">Mẫu kiểm nghiệm</span>
            <h3 className="pt-lab-modal-title">
              {test.code} · Thửa {test.plotCode}
            </h3>
          </div>
          <Pill tone={isPass ? "green" : "red"}>
            {isPass ? "Đạt chuẩn xuất khẩu" : "Không đạt chuẩn"}
          </Pill>
        </div>

        <div className="pt-lab-modal-meta">
          <span>
            Ngày lấy mẫu: <strong>{formatDate(test.sampledOn)}</strong>
          </span>
          <span>
            Đơn vị kiểm nghiệm (Lab): <strong>{test.lab}</strong>
          </span>
        </div>
      </div>

      {/* 2. Lưới 4 chỉ số xét nghiệm */}
      <div className="pt-lab-modal-section">
        <h4 className="pt-pesticide-modal-section-title">Chỉ số xét nghiệm phân tích</h4>
        <dl className="pt-test-grid">
          <div>
            <dt>Cadimi (Cd)</dt>
            <dd>{test.cdMgKg} mg/kg</dd>
            <span className="pt-pesticide-spec-hint">Ngưỡng GACC: ≤ 0.05 mg/kg</span>
          </div>
          <div>
            <dt>Tồn dư hóa chất</dt>
            <dd>{test.residueMgKg} mg/kg</dd>
            <span className="pt-pesticide-spec-hint">Chuẩn an toàn VietGAP</span>
          </div>
          <div>
            <dt>Chlorpyrifos</dt>
            <dd>{test.chlorpyrifosMgKg === null ? "KPH (Đạt chuẩn)" : `${test.chlorpyrifosMgKg} mg/kg`}</dd>
            <span className="pt-pesticide-spec-hint">Hoạt chất cấm hoàn toàn</span>
          </div>
          <div>
            <dt>Chất cấm Vàng O</dt>
            <dd>{test.yellowOPositive ? "Dương tính (Cấm)" : "Âm tính (Đạt chuẩn)"}</dd>
            <span className="pt-pesticide-spec-hint">Tuyệt đối không có</span>
          </div>
        </dl>
      </div>

      {/* 3. Đánh giá & Khuyến nghị kết luận */}
      <div className={`pt-pesticide-alert-box ${isPass ? "pt-pesticide-alert-allowed" : "pt-pesticide-alert-banned"}`}>
        <div className="pt-pesticide-alert-content">
          <strong>
            {isPass
              ? "Kết luận: Lô hàng đạt tiêu chuẩn xuất khẩu chính ngạch"
              : "Cảnh báo: Lô hàng chưa đủ điều kiện xuất khẩu"}
          </strong>
          <p>
            {isPass
              ? "Mẫu kiểm nghiệm tại thửa đất này đã vượt qua toàn bộ các chỉ tiêu về kim loại nặng và dư lượng thuốc BVTV theo Nghị định thư GACC và tiêu chuẩn VietGAP. Hộ thành viên đủ điều kiện được cấp tem truy xuất nguồn gốc khi thu hoạch."
              : "Mẫu kiểm nghiệm phát hiện chỉ số chưa đạt ngưỡng cho phép. Bà con cần tạm ngừng thu hoạch tại thửa đất này và thông báo ngay cho cán bộ phụ trách kỹ thuật của HTX để lấy mẫu kiểm tra lại."}
          </p>
        </div>
      </div>

      {/* 4. Nút đóng popup */}
      <div className="pt-training-modal-actions">
        <button
          type="button"
          className="pt-btn-secondary"
          onClick={onClose}
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
