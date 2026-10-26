"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { usePublic, type PublicOverview } from "./use-public";

const number = (value: number, digits = 0) => value.toLocaleString("vi-VN", { maximumFractionDigits: digits });

/** Thẻ bảng điều khiển nổi ở hero: số liệu tổng hợp lấy trực tiếp từ hệ thống (không gồm thông tin từng hộ). */
export default function HeroDash() {
  const { data, loading } = usePublic<PublicOverview>("overview");

  const items = [
    { label: "Hộ tham gia", value: data ? number(data.households) : "—" },
    { label: "Diện tích (ha)", value: data ? number(data.areaHa, 1) : "—" },
    { label: "Thửa đất", value: data ? number(data.plots) : "—" },
    { label: "Thôn tham gia", value: data ? number(data.villages) : "—" },
  ];
  const ratio = data && data.households > 0 ? Math.round((data.qualifiedHouseholds / data.households) * 100) : null;

  return (
    <div className="lp-dash" aria-live="polite">
      <div className="lp-dash-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span className="on">Tổng quan</span>
        <span>Bản đồ</span>
        <span>Nhật ký</span>
        <span>Kiểm nghiệm</span>
      </div>
      <div className="lp-dash-body">
        <p className="lp-label">
          Số liệu cập nhật trực tiếp
        </p>
        <h2 className="lp-dash-title">Con số của vùng trồng</h2>
        <dl className="lp-stats-grid">
          {items.map((item) => (
            <div key={item.label} className={loading ? "is-loading" : ""} aria-busy={loading}>
              <dd>{loading ? <Skeleton h="0.9em" w="58%" r={6} className="lp-sk-value" /> : item.value}</dd>
              <dt>{item.label}</dt>
            </div>
          ))}
        </dl>
        {ratio !== null && data && (
          <div className="lp-dash-meter">
            <div>
              <span>Đạt chuẩn xuất khẩu</span>
              <strong>
                {number(data.qualifiedHouseholds)}/{number(data.households)} hộ
              </strong>
            </div>
            <div className="lp-dash-track" role="img" aria-label={`${ratio}% hộ đạt chuẩn xuất khẩu`}>
              <b style={{ width: `${ratio}%` }} />
            </div>
          </div>
        )}
        {loading && (
          <div className="lp-dash-meter" aria-hidden="true">
            <Skeleton h={12} w="46%" />
            <Skeleton h={8} r={999} />
          </div>
        )}
      </div>
    </div>
  );
}
