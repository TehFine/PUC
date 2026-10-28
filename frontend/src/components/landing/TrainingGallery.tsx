"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./training.css";

export interface TrainingItem {
  id: number;
  src: string;
  category: "vietgap" | "policy";
  categoryLabel: string;
  tagTone: "green" | "blue" | "gold";
  title: string;
  speaker: string;
  location: string;
  date: string;
  description: string;
  highlights: string[];
  aspectRatio: "4/3" | "3/4";
}

export const TRAINING_ITEMS: TrainingItem[] = [
  {
    id: 1,
    src: "/training/1.jpg",
    category: "policy",
    categoryLabel: "Chỉ đạo & Chính sách",
    tagTone: "blue",
    title: "Hội nghị triển khai thí điểm truy xuất nguồn gốc sầu riêng Đắk Lắk",
    speaker: "Sở Nông nghiệp & Môi trường phối hợp cùng UBND Huyện & HTX Krông Búk",
    location: "Hội trường Hội nghị Huyện Krông Búk",
    date: "Đợt 1 / Vụ mùa xuất khẩu",
    description:
      "Hội nghị cấp Tỉnh triển khai mô hình quản lý số hóa, giám sát chuỗi giá trị và gắn mã số vùng trồng phục vụ kiểm dịch xuất khẩu chính ngạch.",
    highlights: ["Thí điểm truy xuất nguồn gốc", "Gắn mã vùng trồng GACC", "Chỉ đạo liên ngành"],
    aspectRatio: "4/3",
  },
  {
    id: 2,
    src: "/training/2.jpg",
    category: "policy",
    categoryLabel: "Quy chuẩn xuất khẩu",
    tagTone: "blue",
    title: "Phổ biến quy chuẩn kiểm nghiệm và hàng rào kỹ thuật kiểm dịch",
    speaker: "Đại diện Cơ quan Bảo vệ Thực vật & Kiểm nghiệm chuyên ngành",
    location: "Hội trường Hội nghị Huyện Krông Búk",
    date: "Chuyên đề pháp lý & kiểm dịch",
    description:
      "Đại diện cơ quan chuyên môn hướng dẫn chi tiết quy chuẩn kiểm tra mã vùng trồng, mức dư lượng thuốc BVTV (MRL) và các quy định an toàn thực phẩm.",
    highlights: ["Mức giới hạn MRL", "Quy trình kiểm dịch thực vật", "Bảo vệ thương hiệu"],
    aspectRatio: "4/3",
  },
  {
    id: 3,
    src: "/training/3.jpg",
    category: "policy",
    categoryLabel: "Số hóa dữ liệu",
    tagTone: "gold",
    title: "Làm việc bàn tròn & hướng dẫn phần mềm quản lý vùng trồng",
    speaker: "Tổ kỹ thuật số HTX & Chuyên viên quản trị dữ liệu",
    location: "Phòng họp kỹ thuật HTX Krông Búk",
    date: "Tập huấn cán bộ thôn & tổ trưởng",
    description:
      "Cán bộ HTX và chuyên viên hướng dẫn đại diện các thôn thực hành thao tác trên phần mềm: quản lý bản đồ thửa đất, gắn hộ dân và kiểm tra chéo nhật ký.",
    highlights: ["Phần mềm quản lý PUC", "Vẽ ranh thửa trên bản đồ", "Kiểm tra chéo nhật ký"],
    aspectRatio: "4/3",
  },
  {
    id: 4,
    src: "/training/4.jpg",
    category: "vietgap",
    categoryLabel: "Tiêu chuẩn VietGAP",
    tagTone: "green",
    title: "Khóa tập huấn kỹ thuật quản lý dịch hại tổng hợp (IPM) trên sầu riêng",
    speaker: "Chuyên gia Chi cục Trồng trọt & Bảo vệ Thực vật tỉnh Đắk Lắk",
    location: "Nhà văn hóa cộng đồng buôn/thôn Krông Búk",
    date: "Tập huấn thường kỳ cho hộ dân",
    description:
      "Đông đảo bà con xã viên tham dự lớp tập huấn kỹ thuật phòng trừ sâu đục quả, rệp sáp, nấm Phytophthora bằng giải pháp sinh học đạt chuẩn VietGAP.",
    highlights: ["Kỹ thuật quản lý dịch hại IPM", "Danh mục thuốc được phép", "An toàn thời gian cách ly"],
    aspectRatio: "4/3",
  },
  {
    id: 5,
    src: "/training/5.jpg",
    category: "vietgap",
    categoryLabel: "Đối thoại thực tế",
    tagTone: "green",
    title: "Chuyên gia đối thoại & giải đáp vướng mắc canh tác cùng bà con",
    speaker: "Kỹ sư nông nghiệp đầu ngành & Cán bộ kỹ thuật HTX",
    location: "Hội trường tập huấn kỹ thuật HTX",
    date: "Tọa đàm kỹ thuật nhà nông",
    description:
      "Giải đáp chi tiết từng vướng mắc thực tế của bà con: nhận biết thời điểm xiết nước làm bông, xử lý rụng trái non và nguyên tắc bón phân cân đối.",
    highlights: ["Đối thoại hỏi đáp trực tiếp", "Kỹ thuật xiết nước làm bông", "Bón phân đúng thời điểm"],
    aspectRatio: "4/3",
  },
  {
    id: 6,
    src: "/training/6.jpg",
    category: "vietgap",
    categoryLabel: "Chuỗi giá trị BLF",
    tagTone: "gold",
    title: "Chuyển giao mô hình sản xuất sầu riêng bền vững (Better Life Farming)",
    speaker: "Chuyên gia Nông học Better Life Farming (BLF / Bayer)",
    location: "Trung tâm chuyển giao tiến bộ kỹ thuật",
    date: "Chuyên đề chuỗi liên kết",
    description:
      "Giới thiệu các giải pháp sản xuất bền vững trong toàn chuỗi giá trị ngành hàng sầu riêng: liên kết giữa nông học, công nghệ số và kết nối thị trường tiêu thụ.",
    highlights: ["Mô hình Better Life Farming", "Nông nghiệp bền vững", "Liên kết chuỗi cung ứng"],
    aspectRatio: "3/4",
  },
  {
    id: 7,
    src: "/training/7.jpg",
    category: "vietgap",
    categoryLabel: "Dinh dưỡng chuyên sâu",
    tagTone: "green",
    title: "Giải pháp nông học toàn diện: Phục hồi rễ, dưỡng cơi đọt & nuôi trái",
    speaker: "Chuyên gia dinh dưỡng cây trồng nhiệt đới",
    location: "Lớp đào tạo chuyên sâu cán bộ & nhà vườn",
    date: "Kỹ thuật chuyên sâu vụ mùa",
    description:
      "Hướng dẫn chi tiết phác đồ dinh dưỡng theo chu kỳ sinh trưởng của cây: bảo vệ rễ chống nghẽn rễ, dưỡng cơi đọt dày bóng, nuôi hoa và chống rụng múi.",
    highlights: ["Sơ đồ dinh dưỡng phục hồi rễ", "Kỹ thuật nuôi cơi đọt khỏe", "Chống thối cuống, nứt gai"],
    aspectRatio: "3/4",
  },
];

const TRUST_METRICS = [
  {
    num: "100%",
    label: "Hộ liên kết được tập huấn",
    desc: "Cầm tay chỉ việc theo sổ tay quy trình VietGAP",
  },
  {
    num: "Chuyên gia",
    label: "Đồng hành thực địa",
    desc: "Sở Nông nghiệp, WASI và kỹ sư đầu ngành",
  },
  {
    num: "VietGAP",
    label: "Kiểm soát dịch hại IPM",
    desc: "Tuân thủ nghiêm ngặt danh mục & cách ly",
  },
  {
    num: "Số hóa",
    label: "Nhật ký vườn điện tử",
    desc: "Ghi chép minh bạch từ gốc cây đến thị trường",
  },
];

type CategoryFilter = "all" | "vietgap" | "policy";

export default function TrainingGallery() {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filteredItems = TRAINING_ITEMS.filter((item) => {
    if (filter === "all") return true;
    return item.category === filter;
  });

  const activeLightboxItem = lightboxIndex !== null ? TRAINING_ITEMS[lightboxIndex] : null;

  const openLightbox = (indexInAll: number) => {
    setLightboxIndex(indexInAll);
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
  };

  const nextLightbox = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex + 1) % TRAINING_ITEMS.length);
  };

  const prevLightbox = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex - 1 + TRAINING_ITEMS.length) % TRAINING_ITEMS.length);
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") nextLightbox();
      if (e.key === "ArrowLeft") prevLightbox();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex]);

  return (
    <div className="lp-training">
      {/* 4 Thẻ chỉ số tin cậy hàng đầu */}
      <div className="lp-training-metrics">
        {TRUST_METRICS.map((m, idx) => (
          <div key={idx} className="lp-training-metric lp-glass">
            <div className="lp-training-metric-num">{m.num}</div>
            <strong className="lp-training-metric-label">{m.label}</strong>
            <small className="lp-training-metric-desc">{m.desc}</small>
          </div>
        ))}
      </div>

      {/* Bộ lọc phân loại */}
      <div className="lp-training-nav">
        <div className="lp-training-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={`lp-training-tab ${filter === "all" ? "is-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            Tất cả tư liệu ({TRAINING_ITEMS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "vietgap"}
            className={`lp-training-tab ${filter === "vietgap" ? "is-active" : ""}`}
            onClick={() => setFilter("vietgap")}
          >
            Kỹ thuật VietGAP & Dinh dưỡng ({TRAINING_ITEMS.filter((i) => i.category === "vietgap").length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "policy"}
            className={`lp-training-tab ${filter === "policy" ? "is-active" : ""}`}
            onClick={() => setFilter("policy")}
          >
            Hội nghị & Truy xuất nguồn gốc ({TRAINING_ITEMS.filter((i) => i.category === "policy").length})
          </button>
        </div>
      </div>

      {/* Grid thư viện ảnh tư liệu */}
      <div className="lp-training-grid">
        {filteredItems.map((item, idx) => {
          const originalIndex = TRAINING_ITEMS.findIndex((it) => it.id === item.id);
          
          // Tính toán cột span cân đối 100% dòng (Row 1: 6+6, Row 2: 4+4+4, Row 3: 6+6)
          let colClass = "lp-col-4";
          if (filter === "all") {
            if (idx === 0 || idx === 1) colClass = "lp-col-6 is-featured";
            else if (idx >= 2 && idx <= 4) colClass = "lp-col-4";
            else colClass = "lp-col-6";
          } else if (filter === "vietgap") {
            colClass = "lp-col-6 is-featured";
          } else if (filter === "policy") {
            colClass = "lp-col-4";
          }

          const isFeatured = colClass.includes("is-featured");

          return (
            <article
              key={item.id}
              className={`lp-training-card lp-glass ${colClass} is-${item.aspectRatio.replace("/", "-")}`}
              onClick={() => openLightbox(originalIndex)}
            >
              <div className="lp-training-photo-wrap">
                <Image
                  src={item.src}
                  alt={item.title}
                  fill
                  sizes={isFeatured ? "(max-width: 900px) 100vw, 680px" : "(max-width: 900px) 100vw, 420px"}
                  className="lp-training-photo"
                />
                <div className="lp-training-overlay">
                  <span className="lp-training-zoom" aria-label="Xem ảnh phóng to">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                      <path d="M11 8v6M8 11h6" />
                    </svg>
                  </span>
                </div>
                <div className="lp-training-badge">
                  <span className={`lp-pill lp-pill-${item.tagTone}`}>{item.categoryLabel}</span>
                </div>
              </div>

              <div className="lp-training-content">
                <div className="lp-training-meta">
                  <span className="lp-training-speaker">{item.speaker}</span>
                  <span className="lp-training-date">{item.date}</span>
                </div>

                <h3 className="lp-training-title">{item.title}</h3>
                <p className="lp-training-desc">{item.description}</p>

                <div className="lp-training-highlights">
                  {item.highlights.map((h, i) => (
                    <span key={i} className="lp-training-highlight-tag">
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Banner cam kết chất lượng & Đăng ký tham gia */}
      <div className="lp-training-cta lp-glass">
        <div className="lp-training-cta-info">
          <h3>Bà con xã viên muốn đăng ký tham gia các khóa tập huấn tiếp theo?</h3>
          <p>
            HTX Krông Búk tổ chức các buổi hướng dẫn thực tế định kỳ theo mùa vụ. Cán bộ HTX sẽ thông báo lịch cụ thể qua nhóm Zalo thôn và tài khoản ứng dụng của từng hộ.
          </p>
        </div>
        <div className="lp-training-cta-actions">
          <a
            href="#tra-cuu"
            className="lp-btn lp-btn-ghost"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("lp:catalog-tab", { detail: "training" }));
              }
            }}
          >
            Xem lịch tập huấn sắp tới
          </a>
          <Link href="/register" className="lp-btn lp-btn-solid">
            Đăng ký tài khoản hộ dân
          </Link>
        </div>
      </div>

      {/* Lightbox Modal phóng to hình ảnh */}
      {activeLightboxItem && (
        <div className="lp-lightbox" role="dialog" aria-modal="true" onClick={closeLightbox}>
          <div className="lp-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="lp-lightbox-head">
              <div className="lp-lightbox-title-group">
                <span className={`lp-pill lp-pill-${activeLightboxItem.tagTone}`}>
                  {activeLightboxItem.categoryLabel}
                </span>
                <span className="lp-lightbox-counter">
                  {(lightboxIndex ?? 0) + 1} / {TRAINING_ITEMS.length}
                </span>
              </div>
              <button type="button" className="lp-lightbox-close" onClick={closeLightbox} aria-label="Đóng ảnh phóng to">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="lp-lightbox-media">
              <Image
                src={activeLightboxItem.src}
                alt={activeLightboxItem.title}
                width={1276}
                height={956}
                className="lp-lightbox-img"
                priority
              />

              <button
                type="button"
                className="lp-lightbox-arrow prev"
                onClick={(e) => {
                  e.stopPropagation();
                  prevLightbox();
                }}
                aria-label="Ảnh trước đó"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>

              <button
                type="button"
                className="lp-lightbox-arrow next"
                onClick={(e) => {
                  e.stopPropagation();
                  nextLightbox();
                }}
                aria-label="Ảnh tiếp theo"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>

            <div className="lp-lightbox-foot">
              <h3>{activeLightboxItem.title}</h3>
              <p className="lp-lightbox-speaker">
                <strong>Diễn giả / Đơn vị tổ chức:</strong> {activeLightboxItem.speaker} · <em>{activeLightboxItem.location}</em>
              </p>
              <p className="lp-lightbox-desc">{activeLightboxItem.description}</p>
              <div className="lp-lightbox-tags">
                {activeLightboxItem.highlights.map((h, i) => (
                  <span key={i} className="lp-training-highlight-tag">
                    ✓ {h}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
