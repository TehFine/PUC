"use client";

import Image from "next/image";
import { useState } from "react";
import { STAGES } from "./data";

const STAGE_PHOTOS: Record<string, { src: string; alt: string; pos?: string }> = {
  dat: {
    src: "/stages/stage-01-dat.jpg",
    alt: "Kỹ thuật viên lấy mẫu kiểm tra độ pH đất đỏ bazan trên khu vườn đã lên mô cao và đào mương thoát nước trước khi trồng",
    pos: "center 58%",
  },
  giong: {
    src: "/stages/stage-02-giong.jpg",
    alt: "Cây giống sầu riêng ghép khỏe mạnh trồng trên mô đất đỏ bazan có cọc tre cố định, lưới che nắng và tủ rơm giữ ẩm gốc",
    pos: "center 56%",
  },
  phan: {
    src: "/stages/stage-03-phan.jpg",
    alt: "Nhà vườn bón phân hữu cơ ủ hoai vi sinh theo rãnh tròn chiếu mép tán quanh gốc sầu riêng",
    pos: "center 64%",
  },
  nuoc: {
    src: "/stages/stage-04-nuoc.jpg",
    alt: "Chùm nụ mắt cua và hoa sầu riêng bung nở dưới cành gỗ lớn cùng hệ thống béc tưới giữ ẩm đều dưới gốc",
    pos: "center 46%",
  },
  "sau-benh": {
    src: "/stages/stage-05-sau-benh.jpg",
    alt: "Cán bộ kỹ thuật dùng kính lúp kiểm tra mặt dưới lá và nhà vườn tỉa cành tạo độ thông thoáng phòng trừ sâu bệnh IPM",
    pos: "center 48%",
  },
  "thu-hoach": {
    src: "/stages/stage-06-thu-hoach.jpg",
    alt: "Thu hoạch sầu riêng đúng độ chín bằng kéo sạch và xếp trái vào sọt nhựa lót xốp trên bạt sạch gắn phiếu mã lô tại vườn",
    pos: "center 54%",
  },
  "sau-thu": {
    src: "/stages/stage-07-sau-thu.jpg",
    alt: "Phân loại sầu riêng tại cơ sở đóng gói đạt chuẩn, gắn tem mã QR truy xuất lên cuống trái và đóng thùng xuất khẩu",
    pos: "center 46%",
  },
};

export default function Stages() {
  const [activeId, setActiveId] = useState(STAGES[0].id);
  const index = Math.max(0, STAGES.findIndex((s) => s.id === activeId));
  const stage = STAGES[index];
  const photo = STAGE_PHOTOS[stage.id] ?? STAGE_PHOTOS.dat;

  const prev = () => setActiveId(STAGES[(index - 1 + STAGES.length) % STAGES.length].id);
  const next = () => setActiveId(STAGES[(index + 1) % STAGES.length].id);

  return (
    <div className="sw-grid sw-stages-band">
      {/* Cột 1: Danh sách 7 giai đoạn */}
      <div
        className="sw-cell sw-col-1 sw-stage-navlist"
        role="tablist"
        aria-label="Các giai đoạn chăm sóc sầu riêng"
      >
        {STAGES.map((item, pos) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`stage-tab-${item.id}`}
              aria-selected={active}
              aria-controls="stage-panel"
              className={`sw-stage-tab ${active ? "is-active" : ""}`}
              onClick={() => setActiveId(item.id)}
            >
              <span className="sw-stage-idx">{String(pos + 1).padStart(2, "0")}</span>
              <span className="sw-stage-name">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Cột 2–3: Chi tiết giai đoạn đang chọn */}
      <article
        id="stage-panel"
        role="tabpanel"
        aria-labelledby={`stage-tab-${stage.id}`}
        key={stage.id}
        className="sw-cell sw-col-2-3 sw-stage-detail eh-fade-block"
      >
        <div>
          <span className="sw-micro">{stage.tag}</span>
          <h3 className="sw-cell-title sw-mt-8">{stage.title}</h3>
          <ul className="sw-clean-list sw-mt-16">
            {stage.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="sw-stage-foot">
          <div className="sw-stage-logbox">
            <span className="sw-micro">Ghi vào nhật ký điện tử</span>
            <p>{stage.log}</p>
          </div>
          <div className="sw-stage-arrows">
            <button type="button" className="eh-step-btn is-prev" onClick={prev}>
              <svg className="eh-arrow-icon" width="22" height="10" viewBox="0 0 26 10" fill="none" aria-hidden="true">
                <path d="M25.25 5H1.25M5.25 1L1.25 5L5.25 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Trước</span>
            </button>
            <button type="button" className="eh-step-btn is-next" onClick={next}>
              <span>Tiếp</span>
              <svg className="eh-arrow-icon" width="22" height="10" viewBox="0 0 26 10" fill="none" aria-hidden="true">
                <path d="M0.75 5H24.75M20.75 1L24.75 5L20.75 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </article>

      {/* Cột 4: Ảnh thực tế minh họa theo từng giai đoạn */}
      <div className="sw-media sw-col-4 sw-stage-photo">
        <Image
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          fill
          sizes="(max-width: 960px) 100vw, 25vw"
          style={{ objectFit: "cover", objectPosition: photo.pos ?? "center" }}
        />
      </div>
    </div>
  );
}
