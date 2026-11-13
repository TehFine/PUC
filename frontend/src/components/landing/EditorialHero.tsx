"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { homePathFor } from "@/lib/routes";
import { NAV_LINKS } from "./data";
import DwellSlideshow, { type DwellSlide } from "./DwellSlideshow";
import { usePublic, type PublicOverview } from "./use-public";

const HERO_TOP_LEFT_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/real-hero-cune.jpg",
    alt: "Sầu riêng Cư Né chín vàng tách múi đặt trên bàn gỗ mộc giữa triền đồi sầu riêng đất đỏ Đắk Lắk",
    objectPosition: "center 62%",
    mobileObjectPosition: "49% 62%",
  },
  {
    src: "/landing/durian-editorial-hero.jpg",
    alt: "Sầu riêng nguyên trái và múi sầu riêng vàng ươm trưng bày nghệ thuật trên kệ gỗ sồi và nền đá travertine",
    objectPosition: "center 56%",
    mobileObjectPosition: "46% 58%",
  },
  {
    src: "/landing/lux-hero-plinth.jpg",
    alt: "Sầu riêng tuyển chọn và múi vàng ươm đặt trên bệ đá travertine bên vách nan gỗ sồi ấm áp",
    objectPosition: "center 54%",
    mobileObjectPosition: "55% 56%",
  },
];

const HERO_BOTTOM_RIGHT_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/real-hero-diary-qr.jpg",
    alt: "Nhà vườn và cán bộ kỹ thuật HTX Cư Né ghi nhật ký mùa vụ và kiểm tra tem QR lô sầu riêng ngay trên điện thoại tại vườn",
    objectPosition: "center 38%",
    mobileObjectPosition: "58% 38%",
  },
  {
    src: "/landing/lux-hero-trace-gallery.jpg",
    alt: "Sầu riêng gắn tem QR và sổ nhật ký mùa vụ cùng điện thoại trên bàn gỗ sồi đá tự nhiên sang trọng",
    objectPosition: "center 54%",
    mobileObjectPosition: "55% 56%",
  },
  {
    src: "/landing/lux-qr-atelier.jpg",
    alt: "Sầu riêng gắn thẻ truy xuất nguồn gốc QR tối giản đặt trên quầy đá travertine và vách nan gỗ sồi",
    objectPosition: "center 54%",
    mobileObjectPosition: "25% 60%",
  },
];

const INITIAL_LEFT_LINKS = NAV_LINKS.slice(0, 4);
const INITIAL_RIGHT_LINKS = NAV_LINKS.slice(4);

const fmt = (value: number, digits = 0) =>
  value.toLocaleString("vi-VN", { maximumFractionDigits: digits });

export default function EditorialHero() {
  const { status, session, logout } = useAuth();
  const { data } = usePublic<PublicOverview>("overview");

  const [menuOpen, setMenuOpen] = useState(false);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [activeHref, setActiveHref] = useState("");
  const clickLockUntilRef = useRef(0);

  const authenticated = status === "authenticated";
  const workspaceHref = homePathFor(session?.user.role);

  const householdsStr = data ? fmt(data.households) : "49";
  const qualifiedStr = data ? fmt(data.qualifiedHouseholds) : "49";
  const areaStr = data ? fmt(data.areaHa, 1) : "80,5";
  const plotsStr = data ? fmt(data.plots) : "50";
  const villagesStr = data ? fmt(data.villages) : "5";

  const handleSelectNav = useCallback((href: string) => {
    setActiveHref(href);
    clickLockUntilRef.current = Date.now() + 850;
  }, []);

  useEffect(() => {
    let sectionTops: Array<{ href: string; top: number }> = [];
    let viewportH = window.innerHeight || 800;
    let docH = document.documentElement.scrollHeight || 0;
    let isDesktopNav = window.innerWidth > 960;
    let rafId = 0;
    let measureRafId = 0;

    const measureLayout = () => {
      measureRafId = 0;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      viewportH = window.innerHeight || 800;
      docH = document.documentElement.scrollHeight || 0;
      isDesktopNav = window.innerWidth > 960;
      if (!isDesktopNav) {
        sectionTops = [];
        return;
      }
      const next: Array<{ href: string; top: number }> = [];
      for (const link of NAV_LINKS) {
        const id = link.href.startsWith("#") ? link.href.slice(1) : "";
        if (!id) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        next.push({ href: link.href, top: el.getBoundingClientRect().top + y });
      }
      sectionTops = next;
    };

    const updateScroll = () => {
      rafId = 0;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const nextSticky = isDesktopNav && y > 28;
      setShowStickyHeader((prev) => (prev === nextSticky ? prev : nextSticky));

      if (!isDesktopNav || Date.now() < clickLockUntilRef.current) return;

      if (y < 140) {
        setActiveHref((prev) => (prev === "" ? prev : ""));
        return;
      }

      if (docH > 0 && y + viewportH >= docH - 32) {
        const last = NAV_LINKS[NAV_LINKS.length - 1];
        if (last) {
          setActiveHref((prev) => (prev === last.href ? prev : last.href));
        }
        return;
      }

      const probeY = y + Math.min(viewportH * 0.3, 220);
      let current = "";
      for (let i = 0; i < sectionTops.length; i += 1) {
        if (sectionTops[i].top <= probeY) {
          current = sectionTops[i].href;
        } else {
          break;
        }
      }
      setActiveHref((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (rafId === 0) {
        rafId = window.requestAnimationFrame(updateScroll);
      }
    };

    const scheduleMeasure = () => {
      if (measureRafId === 0) {
        measureRafId = window.requestAnimationFrame(() => {
          measureLayout();
          updateScroll();
        });
      }
    };

    const onHashChange = () => {
      const hash = window.location.hash;
      if (hash && NAV_LINKS.some((item) => item.href === hash)) {
        setActiveHref(hash);
        clickLockUntilRef.current = Date.now() + 850;
      }
    };

    scheduleMeasure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(scheduleMeasure);
      ro.observe(document.body);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    window.addEventListener("hashchange", onHashChange);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (measureRafId) window.cancelAnimationFrame(measureRafId);
      ro?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      {/* Thanh Header chuyển đổi 2 trạng thái: khi mới vào trang (logo giữa, tab 2 bên) -> khi bắt đầu cuộn (thanh điều hướng cố định) */}
      <header
        className={`eh-sticky-bar ${showStickyHeader ? "is-visible" : "is-initial"}`}
      >
        {/* Trạng thái 1: Khi người dùng mới vào trang, chưa bắt đầu cuộn */}
        <div className="eh-initial-inner" aria-hidden={showStickyHeader}>
          <div className="eh-init-cell is-left">
            <nav className="eh-init-nav" aria-label="Chuyên mục bên trái">
              {INITIAL_LEFT_LINKS.map((link) => {
                const isActive = activeHref === link.href;
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className={`eh-init-link ${isActive ? "is-active" : ""}`}
                    tabIndex={showStickyHeader ? -1 : 0}
                    onClick={() => handleSelectNav(link.href)}
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>
            <div className="eh-init-mobile-left">
              {authenticated ? (
                <Link
                  href={workspaceHref}
                  className="eh-init-link is-emphasis"
                  tabIndex={showStickyHeader ? -1 : 0}
                >
                  Vào hệ thống
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="eh-init-link is-emphasis"
                  tabIndex={showStickyHeader ? -1 : 0}
                >
                  Đăng nhập
                </Link>
              )}
            </div>
          </div>

          <div className="eh-init-cell is-center">
            <a
              href="#top"
              className="eh-brand eh-init-brand"
              aria-label="HTX Cư Né – Đắk Lắk"
              tabIndex={showStickyHeader ? -1 : 0}
              onClick={() => handleSelectNav("")}
            >
              <span>HTX Cư Né</span>
            </a>

            <div className="eh-init-mobile-center">
              {authenticated ? (
                <button
                  type="button"
                  className="eh-init-link eh-init-logout-btn"
                  tabIndex={showStickyHeader ? -1 : 0}
                  onClick={() => {
                    void logout();
                  }}
                >
                  Đăng xuất
                </button>
              ) : (
                <Link
                  href="/register"
                  className="eh-init-link"
                  tabIndex={showStickyHeader ? -1 : 0}
                >
                  Đăng ký
                </Link>
              )}
            </div>
          </div>

          <div className="eh-init-cell is-right">
            <nav className="eh-init-nav is-right" aria-label="Chuyên mục & truy cập">
              {INITIAL_RIGHT_LINKS.map((link) => {
                const isActive = activeHref === link.href;
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className={`eh-init-link ${isActive ? "is-active" : ""}`}
                    tabIndex={showStickyHeader ? -1 : 0}
                    onClick={() => handleSelectNav(link.href)}
                  >
                    {link.label}
                  </a>
                );
              })}
              <Link
                href="/trace"
                className="eh-init-link"
                tabIndex={showStickyHeader ? -1 : 0}
              >
                Tra cứu QR
              </Link>
              {authenticated ? (
                <Link
                  href={workspaceHref}
                  className="eh-init-link is-emphasis"
                  tabIndex={showStickyHeader ? -1 : 0}
                >
                  Vào hệ thống
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="eh-init-link is-emphasis"
                  tabIndex={showStickyHeader ? -1 : 0}
                >
                  Đăng nhập
                </Link>
              )}
            </nav>
            <div className="eh-init-mobile-right">
              <button
                type="button"
                className="eh-menu-btn"
                aria-label="Mở menu điều hướng"
                aria-expanded={menuOpen}
                tabIndex={showStickyHeader ? -1 : 0}
                onClick={() => setMenuOpen(true)}
              >
                <span />
                <span />
              </button>
            </div>
          </div>
        </div>

        {/* Trạng thái 2: Khi người dùng bắt đầu cuộn trang */}
        <div className="eh-sticky-inner" aria-hidden={!showStickyHeader}>
          <a
            href="#top"
            className="eh-brand"
            tabIndex={showStickyHeader ? 0 : -1}
            onClick={() => handleSelectNav("")}
          >
            <span>HTX Cư Né</span>
          </a>
          <div className="eh-mobile-left-slot">
            {authenticated ? (
              <Link
                href={workspaceHref}
                className="eh-sticky-btn is-solid"
                tabIndex={showStickyHeader ? 0 : -1}
              >
                Vào hệ thống
              </Link>
            ) : (
              <Link
                href="/login"
                className="eh-sticky-btn is-solid"
                tabIndex={showStickyHeader ? 0 : -1}
              >
                Đăng nhập
              </Link>
            )}
          </div>
          <nav className="eh-sticky-links" aria-label="Điều hướng trang">
            {NAV_LINKS.map((link) => {
              const isActive = activeHref === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={isActive ? "is-active" : undefined}
                  aria-current={isActive ? "location" : undefined}
                  tabIndex={showStickyHeader ? 0 : -1}
                  onClick={() => handleSelectNav(link.href)}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>
          <div className="eh-sticky-right">
            <Link
              href="/trace"
              className="eh-sticky-action"
              tabIndex={showStickyHeader ? 0 : -1}
            >
              Tra cứu QR
            </Link>
            <span className="eh-sticky-sep" aria-hidden="true" />
            {authenticated ? (
              <>
                <Link
                  id="landing-enter"
                  href={workspaceHref}
                  className="eh-sticky-btn is-solid"
                  tabIndex={showStickyHeader ? 0 : -1}
                >
                  Vào hệ thống
                </Link>
                <button
                  type="button"
                  className="eh-sticky-btn"
                  tabIndex={showStickyHeader ? 0 : -1}
                  onClick={() => {
                    void logout();
                  }}
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="eh-sticky-btn"
                  tabIndex={showStickyHeader ? 0 : -1}
                >
                  Đăng ký
                </Link>
                <Link
                  id="landing-login"
                  href="/login"
                  className="eh-sticky-btn is-solid"
                  tabIndex={showStickyHeader ? 0 : -1}
                >
                  Đăng nhập
                </Link>
              </>
            )}
            <button
              type="button"
              className="eh-menu-btn eh-sticky-menu-btn"
              aria-label="Mở menu điều hướng"
              aria-expanded={menuOpen}
              tabIndex={showStickyHeader ? 0 : -1}
              onClick={() => setMenuOpen(true)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div className="eh-header-spacer" aria-hidden="true" />

      {/* Phần đầu trang: Lưới 4 cột × 3 hàng đan xen 2 khung ảnh sầu riêng đối xứng chéo */}
      <section className="eh-hero" aria-labelledby="hero-title">
        {/* Hàng 1: Tiêu đề chính căn giữa thoáng đãng xuyên suốt */}
        <div className="eh-cell eh-cell-headline">
          <h1 id="hero-title" className="eh-headline">
            Sầu riêng minh bạch
          </h1>
        </div>

        {/* Hàng 2 – Cột 1 & 2: Ảnh sầu riêng vùng trồng Cư Né lồng ghép bộ ảnh nghệ thuật sang trọng */}
        <div className="eh-cell-media is-top-left">
          <DwellSlideshow
            slides={HERO_TOP_LEFT_SLIDES}
            priorityFirst
            staggerMs={0}
            sizes="(max-width: 768px) calc(100vw - 44px), (max-width: 960px) 100vw, 50vw"
          />
        </div>

        {/* Hàng 2 – Cột 3: Nội dung chính đi kèm ảnh Hàng 2 (trên di động hiển thị bảng số liệu 2×2 tinh gọn) */}
        <div className="eh-cell eh-cell-feature">
          <span className="eh-cell-tag eh-feature-desktop-tag">
            Đạt chuẩn xuất khẩu · {qualifiedStr}/{householdsStr} hộ
          </span>
          <div>
            <h2 className="eh-feature-title">Vùng trồng Cư Né</h2>
            <p className="eh-feature-sub eh-feature-desktop-sub">
              <span>
                {areaStr} ha · {plotsStr} thửa · {villagesStr} thôn
              </span>
              <span>Krông Búk, Đắk Lắk</span>
            </p>
            <p className="eh-feature-mobile-lead">
              Liên kết canh tác chuẩn VietGAP &amp; xuất khẩu chính ngạch tại Krông Búk, Đắk Lắk.
            </p>
          </div>
          <div className="eh-mobile-numbers" aria-label="Quy mô vùng trồng Cư Né">
            <div className="eh-num-item">
              <strong>{qualifiedStr}</strong>
              <span>hộ thành viên đạt chuẩn</span>
            </div>
            <div className="eh-num-item">
              <strong>{areaStr}</strong>
              <span>ha diện tích canh tác</span>
            </div>
            <div className="eh-num-item">
              <strong>{plotsStr}</strong>
              <span>thửa vườn định danh</span>
            </div>
            <div className="eh-num-item">
              <strong>{villagesStr}</strong>
              <span>thôn liên kết Cư Né</span>
            </div>
          </div>
        </div>

        {/* Hàng 2 – Cột 4: Khoảng thở trắng thoáng mắt */}
        <div className="eh-cell eh-cell-empty is-row2-col4" aria-hidden="true" />

        {/* Đường kẻ ngang mở đầu cụm tạp chí chia đôi trên di động */}
        <div className="eh-mob-spread-rule" aria-hidden="true" />

        {/* Hàng 3 – Cột 1: Khoảng thở trắng đối xứng */}
        <div className="eh-cell eh-cell-empty is-row3-col1" aria-hidden="true" />

        {/* Hàng 3 – Cột 2: Nội dung đi kèm ảnh Hàng 3 (trên di động tạo bố cục chữ 2 tầng đường kẻ chữ ├) */}
        <div className="eh-cell eh-cell-story">
          <span className="eh-cell-tag">Truy xuất nguồn gốc</span>
          <div className="eh-story-upper">
            <h2 className="eh-feature-title">Từ vườn đến xuất khẩu</h2>
            <p className="eh-story-sub-mob">Truy xuất + Nhật ký số</p>
            <p className="eh-story-text">
              <span className="eh-story-desktop">
                Bà con ghi nhật ký mùa vụ, theo dõi mã vùng và kiểm nghiệm ngay trên điện thoại để minh bạch từng lô hàng.
              </span>
              <span className="eh-story-mobile">
                Ghi nhật ký mùa vụ, theo dõi mã vùng và kiểm nghiệm an toàn ngay trên điện thoại.
              </span>
            </p>
          </div>
          <div className="eh-story-spread-note">
            <p className="eh-story-spread-prose">
              Bà con ghi chép lịch chăm bón, theo dõi mã số vùng trồng và đối chiếu kiểm nghiệm an toàn minh bạch cho từng lô thu hoạch.
            </p>
          </div>
        </div>

        {/* Hàng 3 – Cột 3 & 4: Ảnh nhật ký mùa vụ & tem QR (trên di động là ảnh dọc cao bên trái đường kẻ dọc) */}
        <div className="eh-cell-media is-bottom-right">
          <DwellSlideshow
            slides={HERO_BOTTOM_RIGHT_SLIDES}
            mobileCollage={false}
            staggerMs={650}
            sizes="(max-width: 768px) 46vw, (max-width: 960px) 100vw, 50vw"
          />
        </div>
      </section>

      {/* Ngăn kéo điều hướng khi bấm nút "=" ở đầu trang */}
      <div
        className={`eh-drawer-backdrop ${menuOpen ? "is-open" : ""}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      >
        <aside
          className="eh-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Danh mục trang giới thiệu"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="eh-drawer-head">
            <span className="eh-brand">
              <span>HTX Cư Né</span>
            </span>
            <button
              type="button"
              className="eh-close-btn"
              aria-label="Đóng menu"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
            >
              <span />
              <span />
            </button>
          </div>

          <nav className="eh-drawer-nav" aria-label="Tất cả chuyên mục">
            {NAV_LINKS.map((link) => (
              <div key={link.href} className="eh-drawer-item">
                <a
                  href={link.href}
                  className={`eh-drawer-link ${activeHref === link.href ? "is-active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectNav(link.href);
                    setMenuOpen(false);
                  }}
                >
                  <span>{link.label}</span>
                </a>
              </div>
            ))}
            <div className="eh-drawer-item">
              <Link
                href="/trace"
                className="eh-drawer-link"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              >
                <span>Tra cứu nguồn gốc QR</span>
              </Link>
            </div>
          </nav>

          <div className="eh-drawer-foot">
            {authenticated ? (
              <>
                <Link
                  href={workspaceHref}
                  className="eh-drawer-btn is-solid"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                >
                  Vào hệ thống
                </Link>
                <button
                  id="landing-logout"
                  type="button"
                  className="eh-drawer-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    void logout();
                  }}
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="eh-drawer-btn is-solid"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                >
                  Đăng nhập hệ thống
                </Link>
                <Link
                  id="landing-register"
                  href="/register"
                  className="eh-drawer-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                >
                  Đăng ký thành viên
                </Link>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
