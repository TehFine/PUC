"use client";

import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { mapPesticide, mapVariety, mapVillage } from "@/lib/mappers";
import { DEFAULT_FERTILIZERS, DEFAULT_VARIETIES, getVarietyImage } from "@/components/portal/LearnTab";

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
        <>
          <div className="filter-bar">
            <div style={{ flex: 1, minWidth: 200 }}>
              <input type="text" className="filter-input" placeholder="Tìm tên phân bón, thành phần, hãng…" />
            </div>
            <select className="filter-select">
              <option>Mọi phân loại</option>
              <option>Hữu cơ vi sinh</option>
              <option>NPK đa lượng</option>
              <option>Trung vi lượng</option>
              <option>Cải tạo rễ</option>
              <option>Kiểm soát Clo</option>
            </select>
            <button className="btn btn-primary" style={{ marginLeft: "auto" }}>Thêm phân bón</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên thương phẩm</th>
                  <th>Phân loại</th>
                  <th>Thành phần / Công thức</th>
                  <th>Nhà sản xuất</th>
                  <th>Định mức khuyến cáo</th>
                  <th>Phương thức bón</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_FERTILIZERS.map((f) => {
                  const badgeType = f.status === "encouraged" ? "badge-green" : f.status === "allowed" ? "badge-gold" : "badge-red";
                  const statusLabel = f.status === "encouraged" ? "Khuyến khích" : f.status === "allowed" ? "Được phép" : "Cảnh báo cấm";
                  const catLabel = f.category === "organic" ? "Hữu cơ vi sinh" : f.category === "npk" ? "NPK đa lượng" : f.category === "foliar" ? "Trung vi lượng" : f.category === "microbial" ? "Cải tạo rễ" : "Kiểm soát đặc biệt";
                  return (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{f.name}</td>
                      <td><span style={{ fontSize: 12, color: "#047857", fontWeight: 600 }}>{catLabel}</span></td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f.formula}</td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f.manufacturer}</td>
                      <td style={{ textAlign: "center", fontWeight: 500, fontSize: 12 }}>{f.dosage}</td>
                      <td style={{ fontSize: 12 }}>{f.applicationMethod}</td>
                      <td><span className={`badge ${badgeType}`}>{statusLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "variety" && (
        <>
          <div className="filter-bar">
            <div style={{ flex: 1, minWidth: 200 }}>
              <input type="text" className="filter-input" placeholder="Tìm tên giống sầu riêng, xuất xứ, đặc tính…" />
            </div>
            <select className="filter-select">
              <option>Mọi phân loại</option>
              <option>Xuất khẩu chủ lực</option>
              <option>Bản địa chất lượng</option>
              <option>Nhập khẩu cao cấp</option>
              <option>Giống mới tiềm năng</option>
            </select>
            <button className="btn btn-primary" style={{ marginLeft: "auto" }}>Thêm giống cây</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 55, textAlign: "center" }}>Hình ảnh</th>
                  <th>Tên giống sầu riêng</th>
                  <th>Phân loại</th>
                  <th>Xuất xứ</th>
                  <th>Trọng lượng trái</th>
                  <th>Thời gian sinh trưởng</th>
                  <th>Đặc tính cơm & Múi</th>
                  <th>Năng suất</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_VARIETIES.map((v) => {
                  const imgSrc = getVarietyImage(v);
                  const catLabel =
                    v.category === "export"
                      ? "Xuất khẩu chủ lực"
                      : v.category === "native"
                      ? "Bản địa chất lượng"
                      : v.category === "premium"
                      ? "Nhập khẩu cao cấp"
                      : "Giống mới";
                  const badgeType = v.status === "allowed" ? "badge-green" : "badge-gold";
                  const statusLabel = v.status === "allowed" ? "Đạt chuẩn GACC" : "Khuyến khích";

                  return (
                    <tr key={v.id}>
                      <td style={{ textAlign: "center", padding: "6px" }}>
                        <img
                          src={imgSrc}
                          alt={v.name}
                          style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 8, background: "#f5f3fc" }}
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{v.name}</td>
                      <td><span style={{ fontSize: 12, color: "#047857", fontWeight: 600 }}>{catLabel}</span></td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v.origin}</td>
                      <td style={{ fontSize: 12, textAlign: "center", fontWeight: 500 }}>{v.weightRange}</td>
                      <td style={{ fontSize: 12, textAlign: "center", color: "var(--text-secondary)" }}>{v.harvestYears}</td>
                      <td style={{ fontSize: 12 }}>{v.fleshColor}, {v.seedRate}</td>
                      <td style={{ fontSize: 12, textAlign: "center", fontWeight: 600, color: "#2563eb" }}>{v.yieldPerHa}</td>
                      <td><span className={`badge ${badgeType}`}>{statusLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
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
