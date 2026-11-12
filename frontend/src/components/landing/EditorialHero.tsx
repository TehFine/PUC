"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { homePathFor } from "@/lib/routes";
import { NAV_LINKS } from "./data";
import { usePublic, type PublicOverview } from "./use-public";

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

  const handleSelectNav = (href: string) => {
    setActiveHref(href);
    clickLockUntilRef.current = Date.now() + 850;
  };

  useEffect(() => {
    const updateScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setShowStickyHeader(y > 60);

      if (Date.now() < clickLockUntilRef.current) return;

      if (y < 140) {
        setActiveHref("");
        return;
      }

      const viewportH = window.innerHeight || 800;
      const docH = document.documentElement.scrollHeight || 0;
      if (docH > 0 && y + viewportH >= docH - 32) {
        const last = NAV_LINKS[NAV_LINKS.length - 1];
        if (last) setActiveHref(last.href);
        return;
      }

      const probeY = y + Math.min(viewportH * 0.3, 220);
      let current = "";
      for (const link of NAV_LINKS) {
        const id = link.href.startsWith("#") ? link.href.slice(1) : "";
        if (!id) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top + y;
        if (top <= probeY) {
          current = link.href;
        } else {
          break;
        }
      }
      setActiveHref(current);
    };

    const onHashChange = () => {
      const hash = window.location.hash;
      if (hash && NAV_LINKS.some((item) => item.href === hash)) {
        setActiveHref(hash);
        clickLockUntilRef.current = Date.now() + 850;
      }
    };

    const rafId = window.requestAnimationFrame(updateScroll);
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateScroll, { passive: true });
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateScroll);
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
      {/* Thanh Header xuất hiện ngay khi người dùng bắt đầu cuộn xem trang */}
      <header
        className={`eh-sticky-bar ${showStickyHeader ? "is-visible" : ""}`}
        aria-hidden={!showStickyHeader}
      >
        <div className="eh-sticky-inner">
          <a
            href="#top"
            className="eh-brand"
            onClick={() => handleSelectNav("")}
          >
            <Image src="/newlogo.png" alt="" width={22} height={22} className="eh-brand-logo" />
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

      {/* Phần đầu trang: Lưới 4 cột × 3 hàng đan xen 2 khung ảnh sầu riêng đối xứng chéo */}
      <section className="eh-hero" aria-labelledby="hero-title">
        {/* Hàng 1 – Cột 1: Khung tên trang (trên di động chuyển thành nút Vào hệ thống / Đăng nhập) */}
        <div className="eh-cell eh-cell-brand">
          <a href="#top" className="eh-brand" aria-label="HTX Cư Né – Đắk Lắk">
            <Image src="/newlogo.png" alt="" width={26} height={26} className="eh-brand-logo" priority />
            <span>HTX Cư Né</span>
          </a>
          <div className="eh-mobile-left-slot">
            {authenticated ? (
              <Link href={workspaceHref} className="eh-sticky-btn is-solid">
                Vào hệ thống
              </Link>
            ) : (
              <Link href="/login" className="eh-sticky-btn is-solid">
                Đăng nhập
              </Link>
            )}
          </div>
        </div>

        {/* Hàng 1 – Cột 2 & 3: Tiêu đề chính dàn ngang nằm giữa 2 ô */}
        <div className="eh-cell eh-cell-headline">
          <h1 id="hero-title" className="eh-headline">
            Sầu riêng minh bạch
          </h1>
        </div>

        {/* Hàng 1 – Cột 4: Nút menu 2 nét ngang (trên di động kèm nút Đăng xuất / Đăng ký) */}
        <div className="eh-cell eh-cell-nav">
          <div className="eh-mobile-hero-auth">
            {authenticated ? (
              <button
                type="button"
                className="eh-sticky-btn"
                onClick={() => {
                  void logout();
                }}
              >
                Đăng xuất
              </button>
            ) : (
              <Link href="/register" className="eh-sticky-btn">
                Đăng ký
              </Link>
            )}
          </div>
          <button
            type="button"
            className="eh-menu-btn"
            aria-label="Mở menu điều hướng"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span />
            <span />
          </button>
        </div>

        {/* Hàng 2 – Cột 1 & 2: Ảnh sầu riêng tách múi thực tế ngay tại vùng trồng Cư Né */}
        <div className="eh-cell-media is-top-left">
          <Image
            src="/landing/real-hero-cune.jpg"
            alt="Sầu riêng Cư Né chín vàng tách múi đặt trên bàn gỗ mộc giữa triền đồi sầu riêng đất đỏ Đắk Lắk"
            fill
            priority
            sizes="(max-width: 960px) 100vw, 50vw"
            style={{ objectFit: "cover", objectPosition: "var(--mob-pos, center 62%)" }}
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

        {/* Hàng 3 – Cột 1: Khoảng thở trắng đối xứng */}
        <div className="eh-cell eh-cell-empty is-row3-col1" aria-hidden="true" />

        {/* Hàng 3 – Cột 2: Nội dung đi kèm ảnh Hàng 3 */}
        <div className="eh-cell eh-cell-story">
          <span className="eh-cell-tag">Truy xuất nguồn gốc</span>
          <div>
            <h2 className="eh-feature-title">Từ vườn đến xuất khẩu</h2>
            <p className="eh-story-text">
              <span className="eh-story-desktop">
                Bà con ghi nhật ký mùa vụ, theo dõi mã vùng và kiểm nghiệm ngay trên điện thoại để minh bạch từng lô hàng.
              </span>
              <span className="eh-story-mobile">
                Ghi nhật ký mùa vụ, theo dõi mã vùng và kiểm nghiệm an toàn ngay trên điện thoại.
              </span>
            </p>
          </div>
        </div>

        {/* Hàng 3 – Cột 3 & 4: Ảnh hộ dân và cán bộ HTX ghi nhật ký & kiểm tra tem QR tại vườn */}
        <div className="eh-cell-media is-bottom-right">
          <Image
            src="/landing/real-hero-diary-qr.jpg"
            alt="Nhà vườn và cán bộ kỹ thuật HTX Cư Né ghi nhật ký mùa vụ và kiểm tra tem QR lô sầu riêng ngay trên điện thoại tại vườn"
            fill
            priority
            sizes="(max-width: 960px) 100vw, 50vw"
            style={{ objectFit: "cover", objectPosition: "var(--mob-pos, center 38%)" }}
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
          onClick={() => setMenuOpen(false)}
        >
          <div className="eh-drawer-head">
            <span className="eh-brand">
              <Image src="/newlogo.png" alt="" width={22} height={22} className="eh-brand-logo" />
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
