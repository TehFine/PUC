"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useBackLayer } from "@/lib/back-navigation";
import { lockRootScroll } from "@/lib/scroll-lock";

interface LegalPageItem {
  id: string;
  pageLabel: string;
  shortTitle: string;
  title: string;
  subtitle: string;
  src: string;
  alt: string;
  lead: string;
  details: Array<{ label: string; value: string }>;
  highlights: string[];
}

const LEGAL_PAGES: readonly LegalPageItem[] = [
  {
    id: "front",
    pageLabel: "Trang 01",
    shortTitle: "Thông tin pháp nhân và ngành nghề",
    title: "Giấy chứng nhận đăng ký hợp tác xã (Mặt trước)",
    subtitle: "Mã số 4007E00008 do UBND Huyện Krông Búk cấp",
    src: "/landing/cune-coop-cert-front.jpg",
    alt: "Mặt trước Giấy chứng nhận đăng ký Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né, mã số 4007E00008",
    lead: "Xác nhận tư cách pháp nhân chính thức của Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né tại xã Cư Né, huyện Krông Búk, tỉnh Đắk Lắk cùng danh mục 10 ngành nghề đăng ký hoạt động.",
    details: [
      { label: "Mã số hợp tác xã", value: "4007E00008" },
      { label: "Đăng ký lần đầu", value: "27/10/2004" },
      { label: "Đăng ký thay đổi lần 05", value: "25/07/2023" },
      { label: "Tên viết tắt", value: "Hợp tác xã KDTH Cư Né" },
      {
        label: "Trụ sở chính",
        value: "Km 67, Thôn Ea Plai, xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk",
      },
      { label: "Điện thoại trụ sở", value: "0982.576.648" },
    ],
    highlights: [
      "Bán buôn nông, lâm sản nguyên liệu và thu mua nông sản (Mã ngành 4620)",
      "Cung ứng vật tư nông nghiệp và phân bón phục vụ vùng trồng (Mã ngành 4669)",
      "Trồng rừng và phát triển sinh thái nông lâm kết hợp (Mã ngành 0210)",
      "Hoạt động dịch vụ hỗ trợ kinh doanh và quản lý chợ nông sản (Mã ngành 8299)",
    ],
  },
  {
    id: "back",
    pageLabel: "Trang 02",
    shortTitle: "Vốn điều lệ và đại diện pháp luật",
    title: "Giấy chứng nhận đăng ký hợp tác xã (Mặt sau)",
    subtitle: "Xác nhận vốn điều lệ, người đại diện và con dấu cơ quan đăng ký",
    src: "/landing/cune-coop-cert-back.jpg",
    alt: "Mặt sau Giấy chứng nhận đăng ký Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né có dấu đỏ của Phòng Tài chính - Kế hoạch huyện Krông Búk",
    lead: "Công bố quy mô vốn điều lệ 1,2 tỷ đồng, thông tin người đại diện theo pháp luật và chữ ký, con dấu xác nhận của Phòng Tài chính - Kế hoạch thuộc UBND huyện Krông Búk.",
    details: [
      { label: "Vốn điều lệ", value: "1.200.000.000 đồng (Một tỷ hai trăm triệu đồng)" },
      { label: "Người đại diện pháp luật", value: "Ông Trần Đăng Sáu" },
      { label: "Chức danh", value: "Chủ tịch hội đồng quản trị kiêm Giám đốc" },
      { label: "Cơ quan cấp phép", value: "Phòng Tài chính - Kế hoạch UBND Huyện Krông Búk" },
      { label: "Người ký xác nhận", value: "Phó Trưởng phòng Trần Hữu Xuân" },
      { label: "Bảo mật dữ liệu cá nhân", value: "Đã ẩn số CCCD và ngày sinh cá nhân" },
    ],
    highlights: [
      "Đầy đủ chữ ký và con dấu đỏ pháp lý của Phòng Tài chính - Kế hoạch huyện Krông Búk",
      "Minh bạch năng lực vốn điều lệ phục vụ liên kết tiêu thụ và xuất khẩu chính ngạch",
      "Thông tin định danh cá nhân (số CCCD, ngày sinh, ngày cấp) đã được che bảo mật theo quy định",
    ],
  },
];

const LEGAL_SUMMARY_SPECS = [
  { label: "Mã số ĐKHTX", value: "4007E00008" },
  { label: "Đăng ký lần đầu", value: "27/10/2004" },
  { label: "Thay đổi lần 05", value: "25/07/2023" },
  { label: "Vốn điều lệ", value: "1.200.000.000 VNĐ" },
  { label: "Đại diện pháp luật", value: "Ông Trần Đăng Sáu" },
  { label: "Cơ quan cấp", value: "UBND Huyện Krông Búk" },
] as const;

export default function CoopLegalSection() {
  const [drawerIndex, setDrawerIndex] = useState<number | null>(null);

  const activeItem = drawerIndex !== null ? LEGAL_PAGES[drawerIndex] : null;

  const closeDrawer = useCallback(() => setDrawerIndex(null), []);
  useBackLayer(drawerIndex !== null, closeDrawer);

  const nextDrawer = useCallback(() => {
    setDrawerIndex((prev) => (prev === null ? null : (prev + 1) % LEGAL_PAGES.length));
  }, []);

  const prevDrawer = useCallback(() => {
    setDrawerIndex((prev) =>
      prev === null ? null : (prev - 1 + LEGAL_PAGES.length) % LEGAL_PAGES.length,
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
    <section id="phap-ly" className="sw-section" aria-labelledby="phaply-title">
      {/* Hàng tiêu đề căn giữa đồng bộ kích thước với các phần khác */}
      <header className="sw-grid sw-sec-head">
        <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
        <div className="sw-cell sw-col-2-3 sw-head-main">
          <span className="sw-sec-index">Pháp nhân Hợp tác xã</span>
          <h2 id="phaply-title" className="sw-sec-title">
            Chứng nhận đăng ký
          </h2>
        </div>
        <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
      </header>

      <div className="sw-grid sw-legal-row">
        {/* Cột 1: Lĩnh vực hoạt động ngắn gọn & nút mở hồ sơ (không lặp lại thông số bên phải) */}
        <div className="sw-cell sw-col-1 sw-between sw-legal-intro">
          <span className="sw-micro">Tư cách pháp nhân</span>
          <div className="sw-caption-block">
            <h3 className="sw-caption-title">Hợp tác xã Cư Né</h3>
            <p className="sw-caption-meta">
              <span>Liên kết sản xuất - Tiêu thụ</span>
              <span>Cung ứng vật tư vùng trồng</span>
            </p>
            <button
              type="button"
              className="sw-open-cue"
              onClick={() => setDrawerIndex(0)}
            >
              Xem giấy chứng nhận
            </button>
          </div>
          <span className="sw-micro">Xã Cư Né, Krông Búk, Đắk Lắk</span>
        </div>

        {/* Cột 2 & Cột 3: Hai mặt Giấy chứng nhận đăng ký HTX */}
        {LEGAL_PAGES.map((item, idx) => (
          <div
            key={item.id}
            className={`sw-cell sw-col-${idx + 2} sw-legal-card`}
            role="button"
            tabIndex={0}
            aria-label={`Xem chi tiết ${item.pageLabel}: ${item.shortTitle}`}
            onClick={() => setDrawerIndex(idx)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDrawerIndex(idx);
              }
            }}
          >
            <div className="sw-legal-doc-stage">
              <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes="(max-width: 768px) 46vw, (max-width: 960px) 46vw, 23vw"
                className="sw-legal-doc-img"
              />
            </div>
            <div className="sw-legal-doc-foot">
              <span className="sw-legal-doc-page sw-tabular">{item.pageLabel}</span>
              <span className="sw-legal-doc-label">{item.shortTitle}</span>
            </div>
          </div>
        ))}

        {/* Cột 4: Bảng thông số pháp lý trích yếu */}
        <div className="sw-cell sw-col-4 sw-between sw-legal-specs-cell">
          <span className="sw-micro">Thông tin đăng ký</span>
          <dl className="sw-legal-specs sw-tabular">
            {LEGAL_SUMMARY_SPECS.map((spec) => (
              <div key={spec.label} className="sw-legal-spec-item">
                <dt>{spec.label}</dt>
                <dd>{spec.value}</dd>
              </div>
            ))}
          </dl>
          <span className="sw-micro">Trụ sở: Km 67, Thôn Ea Plai, xã Cư Né</span>
        </div>
      </div>

      {/* Ngăn trượt xem chi tiết Giấy chứng nhận đăng ký HTX */}
      {activeItem && (
        <div
          className="sw-side-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-drawer-title"
          onClick={closeDrawer}
        >
          <aside className="sw-side-drawer" onClick={(e) => e.stopPropagation()}>
            <header className="sw-side-head">
              <div className="sw-modal-meta">
                <span>Hồ sơ pháp lý HTX</span>
                <span>-</span>
                <span>
                  {String((drawerIndex ?? 0) + 1).padStart(2, "0")} /{" "}
                  {String(LEGAL_PAGES.length).padStart(2, "0")}
                </span>
              </div>
              <button
                type="button"
                className="sw-side-close"
                aria-label="Đóng hồ sơ pháp lý"
                onClick={closeDrawer}
              >
                <span>Đóng</span>
                <span className="sw-side-close-x" aria-hidden="true">
                  ×
                </span>
              </button>
            </header>

            <div className="sw-side-scroll">
              <div className="sw-side-photo-stage sw-legal-drawer-stage">
                <Image
                  src={activeItem.src}
                  alt={activeItem.alt}
                  width={900}
                  height={1240}
                  className="sw-side-photo-full sw-legal-drawer-img"
                  priority
                />
              </div>

              <div className="sw-side-content">
                <span className="sw-micro sw-tabular">{activeItem.subtitle}</span>
                <h3 id="legal-drawer-title" className="sw-side-title">
                  {activeItem.title}
                </h3>
                <p className="sw-side-lead">{activeItem.lead}</p>

                <dl className="sw-detail-dl sw-tabular">
                  {activeItem.details.map((d) => (
                    <div key={d.label}>
                      <dt>{d.label}</dt>
                      <dd>{d.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="sw-side-section">
                  <h4>Nội dung xác nhận</h4>
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
                <span>Trang trước</span>
              </button>
              <button type="button" className="eh-step-btn" onClick={nextDrawer}>
                <span>Trang tiếp</span>
              </button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  );
}
