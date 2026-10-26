"use client";

import { useEffect, useState } from "react";

interface ReportType {
  id: string;
  title: string;
  desc: string;
  formats: string[];
}

const reports: ReportType[] = [
  { id: "vietgap",     title: "Báo cáo VietGAP",         desc: "Mẫu báo cáo theo quy định Bộ NN&PTNT",                 formats: ["Excel", "PDF"] },
  { id: "gacc",        title: "Hồ sơ GACC (Trung Quốc)",  desc: "Báo cáo theo yêu cầu GACC xuất khẩu sang Trung Quốc",  formats: ["Excel", "PDF"] },
  { id: "spray",       title: "Nhật ký phun thuốc",       desc: "Tổng hợp lịch sử phun theo hộ và vùng trồng",          formats: ["Excel", "PDF"] },
  { id: "harvest_rpt", title: "Thống kê thu hoạch",       desc: "Sản lượng, doanh thu theo hộ và vùng trồng",           formats: ["Excel", "PDF"] },
  { id: "compliance",  title: "Báo cáo tuân thủ",         desc: "Tỷ lệ hộ đạt tiêu chuẩn theo thời gian",              formats: ["Excel", "PDF"] },
  { id: "testing_rpt", title: "Kết quả kiểm nghiệm",      desc: "Dư lượng, Cd, Vàng O tổng hợp theo đợt",              formats: ["Excel", "PDF"] },
  { id: "training_rpt",title: "Báo cáo tập huấn",         desc: "Số lượt tham dự, chứng nhận đã cấp",                   formats: ["Excel", "PDF"] },
  { id: "bvtv",        title: "Báo cáo BVTV tỉnh",        desc: "Gửi Chi cục Bảo vệ Thực vật Đắk Lắk định kỳ",         formats: ["Excel", "PDF"] },
];

export default function Reports() {
  const [modal, setModal] = useState<ReportType | null>(null);
  const [format, setFormat] = useState<"Excel" | "PDF">("Excel");

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Báo Cáo</h1>
          <div className="page-header-sub">Xuất báo cáo Excel / PDF theo mẫu chuẩn – gửi cơ quan, doanh nghiệp</div>
        </div>
      </div>

      <div className="report-grid">
        {reports.map((r) => (
          <div key={r.id} className="report-card" onClick={() => setModal(r)}>
            <div className="report-title">{r.title}</div>
            <div className="report-desc">{r.desc}</div>
            <div className="report-formats">
              {r.formats.map((f) => <span key={f}>{f}</span>)}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.title}</h3>
              <button onClick={() => setModal(null)}>Đóng</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Từ ngày</label>
                <input type="date" className="form-input" defaultValue="2024-10-01" />
              </div>
              <div className="form-group">
                <label>Đến ngày</label>
                <input type="date" className="form-input" defaultValue="2024-10-31" />
              </div>
              <div className="form-group">
                <label>Thôn / Tổ</label>
                <select className="form-input">
                  <option>Tất cả thôn</option>
                  {["Thôn 1","Thôn 2","Thôn 3","Thôn 4","Thôn 5","Thôn 6"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Định dạng xuất</label>
                <div className="format-btns">
                  {(["Excel", "PDF"] as const).map((f) => (
                    <button
                      key={f}
                      className={`fmt-btn ${format === f ? "active" : ""}`}
                      onClick={() => setFormat(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Hủy</button>
              <button className="btn btn-primary">Tải xuống {format}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
