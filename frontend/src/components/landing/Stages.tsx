"use client";

import Image from "next/image";
import { useState } from "react";
import { STAGES } from "./data";

const STAGE_PHOTOS: Record<string, { src: string; alt: string; pos?: string }> = {
  dat: {
    src: "/landing/lux-estate-dawn.jpg",
    alt: "Quy hoạch triền đồi sầu riêng thoát nước trong sương sớm tại Đắk Lắk",
    pos: "center 56%",
  },
  giong: {
    src: "/landing/durian-orchard-real.jpg",
    alt: "Hàng cây sầu riêng giống ghép khỏe mạnh trên đất đỏ bazan Đắk Lắk",
    pos: "center 48%",
  },
  phan: {
    src: "/landing/lux-branch-vertical.jpg",
    alt: "Cành sầu riêng nuôi trái đồng đều nhờ chế độ dinh dưỡng hữu cơ cân đối",
    pos: "center 50%",
  },
  nuoc: {
    src: "/landing/lux-blossom.jpg",
    alt: "Chùm hoa sầu riêng nở đều trên cành sau giai đoạn điều tiết nước làm bông",
    pos: "center 52%",
  },
  "sau-benh": {
    src: "/landing/durian-open.jpg",
    alt: "Múi sầu riêng vàng ươm không sâu bệnh nhờ quản lý dịch hại tổng hợp IPM",
    pos: "center 55%",
  },
  "thu-hoach": {
    src: "/landing/lux-harvest.jpg",
    alt: "Người nông dân đội nón lá nâng niu trái sầu riêng vừa thu hoạch đúng độ chín",
    pos: "38% 22%",
  },
  "sau-thu": {
    src: "/landing/lux-qr-atelier.jpg",
    alt: "Trái sầu riêng gắn thẻ mã QR truy xuất nguồn gốc đặt trên bàn đá travertine",
    pos: "28% 64%",
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
