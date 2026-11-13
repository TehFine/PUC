"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { lockRootScroll } from "@/lib/scroll-lock";
import { useStripPagination } from "./use-strip-pagination";

export interface TrainingItem {
  id: number;
  src: string;
  category: "vietgap" | "policy";
  categoryLabel: string;
  title: string;
  shortNote: string;
  speaker: string;
  location: string;
  date: string;
  description: string;
  highlights: string[];
  aspectRatio: "4/3" | "3/4";
  objectPosition: string;
}

export const TRAINING_ITEMS: TrainingItem[] = [
  {
    id: 1,
    src: "/training/1.jpg",
    category: "policy",
    categoryLabel: "Chỉ đạo & Chính sách",
    title: "Thí điểm truy xuất nguồn gốc",
    shortNote: "Hội trường huyện Krông Búk\nGắn mã vùng trồng xuất khẩu",
    speaker: "Sở Nông nghiệp & Môi trường phối hợp UBND huyện & HTX Cư Né",
    location: "Hội trường huyện Krông Búk",
    date: "Đợt 1 · Vụ mùa xuất khẩu",
    description:
      "Triển khai mô hình quản lý số hóa, giám sát chuỗi giá trị và gắn mã số vùng trồng phục vụ kiểm dịch xuất khẩu chính ngạch cho các hộ trồng sầu riêng.",
    highlights: [
      "Thí điểm truy xuất nguồn gốc toàn vùng",
      "Đăng ký mã số vùng trồng chính ngạch GACC",
      "Phối hợp giám sát giữa cơ quan chuyên môn và HTX",
    ],
    aspectRatio: "4/3",
    objectPosition: "54% center",
  },
  {
    id: 2,
    src: "/training/2.jpg",
    category: "policy",
    categoryLabel: "Quy chuẩn xuất khẩu",
    title: "Quy chuẩn kiểm nghiệm & kiểm dịch",
    shortNote: "Cơ quan Bảo vệ Thực vật\nKiểm soát dư lượng MRL",
    speaker: "Cơ quan Bảo vệ Thực vật & Kiểm nghiệm chuyên ngành",
    location: "Hội trường huyện Krông Búk",
    date: "Chuyên đề pháp lý & kiểm dịch",
    description:
      "Hướng dẫn chi tiết quy chuẩn kiểm tra mã vùng trồng, giới hạn dư lượng thuốc bảo vệ thực vật (MRL) và quy định an toàn thực phẩm trước khi thu hoạch.",
    highlights: [
      "Tuân thủ giới hạn dư lượng thuốc MRL",
      "Kiểm dịch thực vật đối với sinh vật gây hại",
      "Giữ vững uy tín vùng trồng xuất khẩu",
    ],
    aspectRatio: "4/3",
    objectPosition: "62% center",
  },
  {
    id: 3,
    src: "/training/3.jpg",
    category: "policy",
    categoryLabel: "Số hóa dữ liệu",
    title: "Tập huấn phần mềm bản đồ số",
    shortNote: "Tổ kỹ thuật số HTX Cư Né\nHướng dẫn cán bộ phụ trách thôn",
    speaker: "Tổ kỹ thuật số HTX & Chuyên viên quản trị dữ liệu",
    location: "Phòng họp kỹ thuật HTX Cư Né",
    date: "Tập huấn cán bộ thôn",
    description:
      "Thực hành thao tác trực tiếp trên hệ thống: đo vẽ bản đồ thửa đất, gắn hồ sơ hộ thành viên và kiểm tra chéo nhật ký canh tác hàng tuần.",
    highlights: [
      "Đo vẽ tọa độ ranh giới thửa đất thực tế",
      "Gắn mã định danh riêng cho từng hộ dân",
      "Hỗ trợ bà con ghi chép nhật ký trên điện thoại",
    ],
    aspectRatio: "4/3",
    objectPosition: "center center",
  },
  {
    id: 4,
    src: "/training/4.jpg",
    category: "vietgap",
    categoryLabel: "Tiêu chuẩn VietGAP",
    title: "Quản lý dịch hại tổng hợp IPM",
    shortNote: "Chi cục Trồng trọt & BVTV\nPhòng trừ sâu bệnh an toàn",
    speaker: "Chi cục Trồng trọt & Bảo vệ Thực vật tỉnh Đắk Lắk",
    location: "Nhà văn hóa cộng đồng Krông Búk",
    date: "Tập huấn định kỳ hộ dân",
    description:
      "Phòng trừ sâu đục quả, rệp sáp và nấm Phytophthora bằng giải pháp sinh học an toàn, tuân thủ nghiêm ngặt danh mục cho phép và thời gian cách ly.",
    highlights: [
      "Ưu tiên chế phẩm sinh học và bảo vệ thiên địch",
      "Chỉ sử dụng thuốc trong danh mục được phép",
      "Đảm bảo đủ số ngày cách ly trước ngày cắt trái",
    ],
    aspectRatio: "4/3",
    objectPosition: "center center",
  },
  {
    id: 5,
    src: "/training/5.jpg",
    category: "vietgap",
    categoryLabel: "Đối thoại thực địa",
    title: "Kỹ thuật xiết nước làm bông",
    shortNote: "Kỹ sư nông nghiệp HTX\nGiải đáp trực tiếp mùa vụ",
    speaker: "Kỹ sư nông nghiệp & Cán bộ kỹ thuật HTX Cư Né",
    location: "Hội trường tập huấn HTX",
    date: "Tọa đàm kỹ thuật nhà nông",
    description:
      "Giải đáp trực tiếp vướng mắc mùa vụ của bà con: nhận biết thời điểm xiết nước tạo mầm hoa, hạn chế rụng trái non và bón phân cân đối theo tuổi cây.",
    highlights: [
      "Xác định đúng thời điểm xiết nước nhú mắt cua",
      "Chăm sóc hoa và hạn chế rụng trái non",
      "Bón phân cân đối theo từng giai đoạn sinh trưởng",
    ],
    aspectRatio: "4/3",
    objectPosition: "68% center",
  },
  {
    id: 6,
    src: "/training/6.jpg",
    category: "vietgap",
    categoryLabel: "Chuỗi giá trị bền vững",
    title: "Mô hình canh tác bền vững",
    shortNote: "Chuyên gia nông học\nLiên kết chuỗi tiêu thụ",
    speaker: "Chuyên gia Nông học Better Life Farming",
    location: "Trung tâm chuyển giao kỹ thuật",
    date: "Chuyên đề chuỗi liên kết",
    description:
      "Kết hợp quy trình nông học chuẩn mực, ghi chép nhật ký số minh bạch và liên kết đầu ra ổn định cho toàn chuỗi giá trị sầu riêng Đắk Lắk.",
    highlights: [
      "Áp dụng mô hình canh tác sầu riêng bền vững",
      "Đồng bộ quy trình kỹ thuật giữa các hộ thành viên",
      "Liên kết tiêu thụ chính ngạch ổn định lâu dài",
    ],
    aspectRatio: "3/4",
    objectPosition: "center 48%",
  },
  {
    id: 7,
    src: "/training/7.jpg",
    category: "vietgap",
    categoryLabel: "Dinh dưỡng cây trồng",
    title: "Phục hồi rễ & nuôi cơm vàng",
    shortNote: "Đào tạo chuyên sâu nhà vườn\nChống xì mủ và sượng múi",
    speaker: "Chuyên gia dinh dưỡng cây trồng nhiệt đới",
    location: "Lớp đào tạo chuyên sâu nhà vườn",
    date: "Kỹ thuật chuyên sâu vụ mùa",
    description:
      "Hướng dẫn phác đồ dinh dưỡng theo chu kỳ sinh trưởng: bảo vệ bộ rễ khỏe, dưỡng cơi đọt dày bóng, nuôi trái tròn đều và chống sượng múi.",
    highlights: [
      "Phục hồi hệ rễ khỏe mạnh sau thu hoạch",
      "Dưỡng cơi đọt đồng loạt trước mùa làm bông",
      "Nuôi trái tròn đều, cơm vàng dày múi",
    ],
    aspectRatio: "3/4",
    objectPosition: "center 48%",
  },
];

export default function TrainingGallery() {
  const [drawerIndex, setDrawerIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });

  const activeItem = drawerIndex !== null ? TRAINING_ITEMS[drawerIndex] : null;

  const {
    stopCount,
    activeStop,
    canPrev,
    canNext,
    handleStripScroll,
    cancelProgrammaticLock,
    scrollToStop,
    scrollByStep,
  } = useStripPagination(trackRef, TRAINING_ITEMS.length);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !trackRef.current) return;
    cancelProgrammaticLock();
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: trackRef.current.scrollLeft,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.active || !trackRef.current) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) > 6) {
      state.moved = true;
      setIsDragging(true);
    }
    if (state.moved) {
      e.preventDefault();
      trackRef.current.scrollLeft = state.startScrollLeft - dx;
    }
  };

  const stopDragging = () => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    setIsDragging(false);
  };

  const closeDrawer = useCallback(() => setDrawerIndex(null), []);
  const nextDrawer = useCallback(() => {
    setDrawerIndex((prev) => (prev === null ? null : (prev + 1) % TRAINING_ITEMS.length));
  }, []);
  const prevDrawer = useCallback(() => {
    setDrawerIndex((prev) =>
      prev === null ? null : (prev - 1 + TRAINING_ITEMS.length) % TRAINING_ITEMS.length,
    );
  }, []);

  useEffect(() => {
    if (drawerIndex === null) return;
    const unlock = lockRootScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
      if (e.key === "ArrowRight") nextDrawer();
      if (e.key === "ArrowLeft") prevDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerIndex, closeDrawer, nextDrawer, prevDrawer]);

  return (
    <section id="tap-huan" className="sw-section" aria-labelledby="taphuan-title">
      {/* Hàng tiêu đề mục tinh gọn */}
      <header className="sw-grid sw-sec-head">
        <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />

        <div className="sw-cell sw-col-2-3 sw-head-main">
          <span className="sw-sec-index">03 / Tập huấn</span>
          <h2 id="taphuan-title" className="sw-sec-title">
            Tập huấn canh tác
          </h2>
        </div>

        <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
      </header>

      {/* Dải danh sách nằm ngang cuộn mượt + dấu chấm phân trang + nút Trước / Tiếp ngay bên dưới */}
      <div className="sw-training-strip-shell">
        <div
          ref={trackRef}
          className={`sw-training-strip ${isDragging ? "is-dragging" : ""}`}
          onScroll={handleStripScroll}
          onTouchStart={cancelProgrammaticLock}
          onWheel={cancelProgrammaticLock}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
        >
          {TRAINING_ITEMS.map((item, idx) => (
            <article
              key={item.id}
              className="sw-training-slide"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (dragStateRef.current.moved) {
                  dragStateRef.current.moved = false;
                  return;
                }
                setDrawerIndex(idx);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDrawerIndex(idx);
                }
              }}
            >
              <div className="sw-training-photo">
                <Image
                  src={item.src}
                  alt={item.title}
                  fill
                  draggable={false}
                  sizes="(max-width: 560px) 84vw, (max-width: 960px) 46vw, 30vw"
                  style={{ objectFit: "cover", objectPosition: item.objectPosition }}
                />
              </div>

              <div className="sw-training-caption">
                <h3 className="sw-training-slide-title">{item.title}</h3>
                <p className="sw-training-slide-sub">
                  {item.categoryLabel} · {item.location}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="sw-training-strip-foot">
          {stopCount > 1 && (
            <div
              className="sw-strip-dots"
              role="tablist"
              aria-label="Chọn trang danh sách tập huấn"
            >
              {Array.from({ length: stopCount }, (_, i) => {
                const isCurrent = i === activeStop;
                return (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    aria-label={`Trang tập huấn ${i + 1} trên ${stopCount}`}
                    className={`sw-strip-dot ${isCurrent ? "is-active" : ""}`}
                    onClick={() => scrollToStop(i)}
                  >
                    <span className="sw-strip-dot-circle" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="sw-training-scroll-btns" aria-label="Cuộn danh sách tập huấn">
            <button
              type="button"
              className="eh-step-btn"
              disabled={!canPrev}
              onClick={() => scrollByStep(-1)}
            >
              Trước
            </button>
            <button
              type="button"
              className="eh-step-btn"
              disabled={!canNext}
              onClick={() => scrollByStep(1)}
            >
              Tiếp
            </button>
          </div>
        </div>
      </div>

      {/* Ngăn trượt từ cạnh phải màn hình hiển thị chi tiết buổi tập huấn */}
      {activeItem && (
        <div
          className="sw-side-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="training-drawer-title"
          onClick={closeDrawer}
        >
          <aside className="sw-side-drawer" onClick={(e) => e.stopPropagation()}>
            <header className="sw-side-head">
              <div className="sw-modal-meta">
                <span>{activeItem.categoryLabel}</span>
                <span>·</span>
                <span>
                  {String((drawerIndex ?? 0) + 1).padStart(2, "0")} /{" "}
                  {String(TRAINING_ITEMS.length).padStart(2, "0")}
                </span>
              </div>
              <button
                type="button"
                className="sw-side-close"
                aria-label="Đóng chi tiết tập huấn"
                onClick={closeDrawer}
              >
                <span>Đóng</span>
                <span className="sw-side-close-x" aria-hidden="true">
                  ×
                </span>
              </button>
            </header>

            <div className="sw-side-scroll">
              <div className="sw-side-photo-stage">
                <Image
                  src={activeItem.src}
                  alt={activeItem.title}
                  width={1200}
                  height={900}
                  className="sw-side-photo-full"
                  priority
                />
              </div>

              <div className="sw-side-content">
                <span className="sw-micro">{activeItem.date}</span>
                <h3 id="training-drawer-title" className="sw-side-title">
                  {activeItem.title}
                </h3>
                <p className="sw-side-lead">{activeItem.description}</p>

                <dl className="sw-detail-dl">
                  <div>
                    <dt>Đơn vị hướng dẫn</dt>
                    <dd>{activeItem.speaker}</dd>
                  </div>
                  <div>
                    <dt>Địa điểm tổ chức</dt>
                    <dd>{activeItem.location}</dd>
                  </div>
                </dl>

                <div className="sw-side-section">
                  <h4>Nội dung trọng tâm</h4>
                  <ul className="sw-clean-list">
                    {activeItem.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <footer className="sw-side-foot">
              <button type="button" className="eh-step-btn" onClick={prevDrawer}>
                <span>Tư liệu trước</span>
              </button>
              <button type="button" className="eh-step-btn" onClick={nextDrawer}>
                <span>Tiếp</span>
              </button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  );
}
