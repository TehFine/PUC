"use client";

import { usePortal } from "@/hooks/use-portal";
import { formatDate } from "@/utils/format";
import type { PortalLabTest, PortalList, PortalScheduleItem } from "@/types/portal";
import { Card, EmptyState, Pill, StateBlock } from "./ui";

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
    badge: "L1",
    badgeBg: "#f59e0b",
    badgeColor: "#ffffff",
    capsuleBg: "linear-gradient(180deg, #f59e0b 0%, #fbbf24 100%)",
    tagBg: "#fef3c7",
    tagColor: "#b45309",
    titleColor: "#92400e",
    defaultNote: "Kiểm tra thực địa độ che phủ, hệ thống tưới và ghi chép nhật ký canh tác của hộ.",
  },
  {
    badge: "L2",
    badgeBg: "#f43f5e",
    badgeColor: "#ffffff",
    capsuleBg: "linear-gradient(180deg, #f43f5e 0%, #fb7185 100%)",
    tagBg: "#ffe4e6",
    tagColor: "#be123c",
    titleColor: "#9f1239",
    defaultNote: "Lấy mẫu quả và đất ngẫu nhiên gửi phòng Lab phân tích tồn dư hóa chất & kim loại nặng.",
  },
  {
    badge: "L3",
    badgeBg: "#10b981",
    badgeColor: "#ffffff",
    capsuleBg: "linear-gradient(180deg, #10b981 0%, #34d399 100%)",
    tagBg: "#d1fae5",
    tagColor: "#047857",
    titleColor: "#065f46",
    defaultNote: "Tái thẩm định điều kiện cơ sở hạ tầng, kho vật tư và nghiệm thu kết quả đánh giá vùng trồng.",
  },
  {
    badge: "L4",
    badgeBg: "#3b82f6",
    badgeColor: "#ffffff",
    capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)",
    tagBg: "#dbeafe",
    tagColor: "#1d4ed8",
    titleColor: "#1e40af",
    defaultNote: "Giám sát đột xuất tuân thủ thời gian cách ly trước ngày thu hoạch xuất khẩu.",
  },
];

export default function InspectionTab() {
  const schedule = usePortal<PortalList<PortalScheduleItem>>("schedule");
  const tests = usePortal<PortalList<PortalLabTest>>("lab-tests");

  return (
    <div className="pt-stack">
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
                    {/* Cột 1: Badge tròn chặng kiểm tra (L1, L2,...) */}
                    <div className="pt-transit-badge-col">
                      <div
                        className="pt-transit-badge"
                        style={{ backgroundColor: theme.badgeBg, color: theme.badgeColor }}
                        aria-hidden="true"
                      >
                        {theme.badge}
                      </div>
                    </div>

                    {/* Cột 2: Trục Timeline dải capsule dày + 2 chấm trắng nhỏ */}
                    <div className="pt-transit-track-col" aria-hidden="true">
                      <div
                        className="pt-transit-capsule"
                        style={{ background: theme.capsuleBg }}
                      >
                        <div className="pt-transit-dot" />
                        <div className="pt-transit-dot" />
                      </div>
                    </div>

                    {/* Cột 3: Khối nội dung màu sáng thanh lịch */}
                    <div className="pt-transit-content">
                      <div className="pt-transit-head">
                        <h3 className="pt-transit-title" style={{ color: theme.titleColor }}>
                          {item.title}
                        </h3>
                      </div>

                      <div className="pt-transit-meta-row">
                        <span className="pt-transit-meta-item">
                          <span className="pt-transit-date-highlight">{formatDate(item.scheduledOn)}</span>
                          {rel && <span className="pt-transit-rel-badge">({rel})</span>}
                        </span>
                        <span className="pt-transit-meta-item">
                          Cán bộ: <strong>{item.officer}</strong>
                        </span>
                      </div>

                      <p className="pt-transit-desc">{theme.defaultNote}</p>
                    </div>
                  </div>

                  {/* Đoạn nối chuyển tiếp giữa 2 chặng (Dotted line với các dấu chấm bình thường) */}
                  {!isLast && (
                    <div className="pt-transit-transfer" aria-hidden="true">
                      <div className="pt-transit-transfer-empty" />
                      <div className="pt-transit-transfer-track">
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                      </div>
                      <div className="pt-transit-transfer-text">
                        <span>Chuyển tiếp kỳ giám sát kế tiếp</span>
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
        {tests.data && tests.data.data.length === 0 && <EmptyState icon="lab">Chưa có kết quả kiểm nghiệm nào.</EmptyState>}
        {tests.data && tests.data.data.length > 0 && (
          <ul className="pt-list">
            {tests.data.data.map((test) => (
              <li key={test.id} className="pt-test">
                <div className="pt-notice-head">
                  <strong>
                    {test.code} · Thửa {test.plotCode}
                  </strong>
                  <Pill tone={test.result === "pass" ? "green" : "red"}>{test.result === "pass" ? "Đạt" : "Không đạt"}</Pill>
                </div>
                <p className="pt-notice-meta">
                  Lấy mẫu {formatDate(test.sampledOn)} · {test.lab}
                </p>
                <dl className="pt-test-grid">
                  <div>
                    <dt>Cadimi</dt>
                    <dd>{test.cdMgKg} mg/kg</dd>
                  </div>
                  <div>
                    <dt>Tồn dư</dt>
                    <dd>{test.residueMgKg} mg/kg</dd>
                  </div>
                  <div>
                    <dt>Chlorpyrifos</dt>
                    <dd>{test.chlorpyrifosMgKg === null ? "KPH" : `${test.chlorpyrifosMgKg} mg/kg`}</dd>
                  </div>
                  <div>
                    <dt>Vàng O</dt>
                    <dd>{test.yellowOPositive ? "Dương tính" : "Âm tính"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
