"use client";

import { useResource } from "@/hooks/use-resource";
import { mapTraining } from "@/lib/mappers";

const KPIS = [
  { val: "6",     label: "Khóa học tổ chức",      sub: "Năm 2024"            },
  { val: "248",   label: "Lượt nông dân tham dự", sub: "82% tỷ lệ tham gia"  },
  { val: "183",   label: "Chứng nhận đã cấp",     sub: "VietGAP + GACC"      },
  { val: "4.7/5", label: "Đánh giá trung bình",   sub: "Từ nông dân tham dự" },
];

export default function Training() {
  const { data: trainingCourses } = useResource("training", mapTraining);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tập Huấn &amp; Đào Tạo</h1>
          <div className="page-header-sub">Nâng cao năng lực nông dân – điều kiện đạt tiêu chuẩn xuất khẩu</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline">Danh sách tham dự</button>
          <button className="btn btn-primary">Tạo lớp tập huấn</button>
        </div>
      </div>

      <div className="kpi-grid-4">
        {KPIS.map(({ val, label, sub }, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-val">{val}</div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-trend up">{sub}</div>
          </div>
        ))}
      </div>

      <div className="training-grid">
        {trainingCourses.map((c, i) => (
          <div key={i} className="training-card">
            <div className="training-card-top">
              <div className="training-card-title">{c.title}</div>
              <div className="training-card-date">
                {c.completed ? "Đã hoàn thành" : c.date}
              </div>
            </div>
            <div className="training-card-body">
              <div className="training-card-row">
                <span>Địa điểm</span>
                <strong>{c.location}</strong>
              </div>
              <div className="training-card-row">
                <span>Giảng viên</span>
                <strong>{c.trainer}</strong>
              </div>
              <div className="training-card-row">
                <span>Tham dự</span>
                <strong>{c.enrolled}/{c.capacity} người</strong>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 4 }}>
                  <span>Tỷ lệ đăng ký</span>
                  <span style={{ color: "var(--green-700)", fontWeight: 600 }}>{c.progress}%</span>
                </div>
                <div className="training-progress">
                  <div className="training-progress-fill" style={{ width: `${c.progress}%` }} />
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                  {c.completed ? "Chứng nhận" : "Danh sách"}
                </button>
                <button className="btn btn-outline btn-sm">Sửa</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
