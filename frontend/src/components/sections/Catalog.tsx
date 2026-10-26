"use client";

import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { mapPesticide, mapVariety, mapVillage } from "@/lib/mappers";

const statusClass: Record<string, string> = { green: "badge-green", gold: "badge-gold", red: "badge-red" };

type Tab = "pesticide" | "fertilizer" | "variety" | "village" | "standards";

const STANDARDS = [
  { title: "VietGAP – Rau quả tươi",                   desc: "TCVN 11892-1:2017 – Quy trình thực hành nông nghiệp tốt cho rau quả tươi tại Việt Nam. Áp dụng bắt buộc với tất cả hộ xuất khẩu.", tags: ["Bắt buộc", "Bộ NN&PTNT", "Cập nhật 2023"] },
  { title: "GACC – General Administration of Customs China", desc: "Yêu cầu của Tổng cục Hải quan Trung Quốc về kiểm dịch, truy xuất nguồn gốc, mã vùng trồng đăng ký GACC. Có hiệu lực từ 01/01/2024.", tags: ["Xuất khẩu TQ", "Bắt buộc", "Mã GACC"] },
  { title: "GlobalGAP – Tiêu chuẩn nông nghiệp toàn cầu", desc: "Tiêu chuẩn tư nhân quốc tế về an toàn thực phẩm, truy xuất nguồn gốc và bền vững. Ưu tiên cho thị trường EU, Nhật Bản.", tags: ["Tự nguyện", "EU/Nhật", "Đang triển khai"] },
  { title: "Kiểm dịch thực vật – BVTV",                 desc: "Quy trình kiểm dịch theo Thông tư 34/2018/TT-BNNPTNT. Kiểm tra vùng trồng, mã cơ sở đóng gói trước khi xuất khẩu.", tags: ["Bắt buộc", "BVTV", "Tỉnh Đắk Lắk"] },
  { title: "Danh mục thuốc BVTV được phép",             desc: "Danh mục thuốc BVTV được phép sử dụng tại Việt Nam theo Thông tư 10/2024/TT-BNNPTNT. Cập nhật hàng năm.", tags: ["Bắt buộc", "Thông tư 10/2024", "BVTV"] },
];

export default function Catalog() {
  const { data: pesticides } = useResource("pesticides", mapPesticide);
  const { data: varieties } = useResource("varieties", mapVariety);
  const { data: villages } = useResource("villages", mapVillage);
  const [tab, setTab] = useState<Tab>("pesticide");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Danh Mục Hệ Thống</h1>
          <div className="page-header-sub">Dữ liệu cấu hình – thuốc BVTV, phân bón, giống, địa bàn, tiêu chuẩn</div>
        </div>
      </div>

      <div className="tab-bar">
        {[
          { id: "pesticide",  label: "Thuốc BVTV"     },
          { id: "fertilizer", label: "Phân bón"       },
          { id: "variety",    label: "Giống sầu riêng"},
          { id: "village",    label: "Thôn / Tổ"      },
          { id: "standards",  label: "Tiêu chuẩn"     },
        ].map(({ id, label }) => (
          <button
            key={id}
            className={`tab-btn ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id as Tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pesticide" && (
        <>
          <div className="filter-bar">
            <div style={{ flex: 1, minWidth: 200 }}>
              <input type="text" className="filter-input" placeholder="Tìm tên thuốc, hoạt chất…" />
            </div>
            <select className="filter-select">
              <option>Mọi trạng thái</option>
              <option>Được phép</option>
              <option>Hạn chế</option>
              <option>Bị cấm</option>
            </select>
            <button className="btn btn-primary" style={{ marginLeft: "auto" }}>Thêm thuốc</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên thương phẩm</th><th>Hoạt chất</th><th>Hàm lượng</th>
                  <th>Nhà sản xuất</th><th>MRL (mg/kg)</th><th>Thời gian cách ly</th><th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {pesticides.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "#256b45" }}>{p.activeIngredient}</td>
                    <td>{p.concentration}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{p.manufacturer}</td>
                    <td style={{ textAlign: "center", fontWeight: 500 }}>{p.mrl}</td>
                    <td style={{ textAlign: "center", color: "#8a6415", fontWeight: 500 }}>{p.isolation}</td>
                    <td><span className={`badge ${statusClass[p.statusType]}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "fertilizer" && (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: "56px 20px" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 13 }}>
              Danh mục phân bón chưa có dữ liệu.
            </div>
            <button className="btn btn-primary">Thêm phân bón</button>
          </div>
        </div>
      )}

      {tab === "variety" && (
        <div className="catalog-cards">
          {varieties.map((v, i) => (
            <div key={i} className="variety-card">
              <div className="variety-card-name">{v.name}</div>
              <div className="variety-card-info">
                <div><strong>Xuất xứ:</strong> {v.origin}</div>
                <div><strong>Trọng lượng:</strong> {v.weight}</div>
                <div><strong>Tuổi cho trái:</strong> {v.year}</div>
                <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 11 }}>{v.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "village" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tên thôn / tổ</th><th>Trưởng thôn</th><th>Số hộ đăng ký</th>
                <th>Số thửa</th><th>Diện tích</th><th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {villages.map((v, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{v.name}</td>
                  <td>{v.leader}</td>
                  <td style={{ textAlign: "center" }}>{v.households} hộ</td>
                  <td style={{ textAlign: "center" }}>{v.plots} thửa</td>
                  <td>{v.area}</td>
                  <td>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-outline btn-sm">Xem</button>
                      <button className="btn btn-outline btn-sm">Sửa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "standards" && (
        <div className="standards-list">
          {STANDARDS.map((s, i) => (
            <div key={i} className="standard-item">
              <div style={{ flex: 1 }}>
                <div className="std-item-title">{s.title}</div>
                <div className="std-item-desc">{s.desc}</div>
                <div className="std-item-tags">
                  {s.tags.map((t, j) => <span key={j} className="std-item-tag">{t}</span>)}
                </div>
              </div>
              <button className="btn btn-outline btn-sm" style={{ flexShrink: 0 }}>Xem tài liệu</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
