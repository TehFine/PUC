"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { homePathFor } from "@/lib/routes";
import { NAV_LINKS } from "./data";
import { display } from "./fonts";

export default function Nav() {
  const { status, session, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);
  const [activeHref, setActiveHref] = useState("");
  const activeHrefRef = useRef("");
  const clickLockRef = useRef<{ href: string; until: number } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sectionIds = NAV_LINKS.map((link) => link.href.slice(1));
    let rafId: number | null = null;

    const updateNavState = () => {
      rafId = null;
      const isPast = window.scrollY > 24;
      if (scrolledRef.current !== isPast) {
        scrolledRef.current = isPast;
        setScrolled(isPast);
      }

      const now = performance.now();
      const lock = clickLockRef.current;
      if (lock) {
        if (now < lock.until) {
          const targetEl = lock.href ? document.getElementById(lock.href.slice(1)) : null;
          const arrived = !lock.href
            ? window.scrollY <= 24
            : targetEl
              ? Math.abs(targetEl.getBoundingClientRect().top - 72) <= 20
              : true;
          if (!arrived) return;
        }
        clickLockRef.current = null;
      }

      const triggerY = Math.round(Math.max(120, Math.min(240, window.innerHeight * 0.25)));
      let nextHref = "";
      let lastMatchedEl: HTMLElement | null = null;

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= triggerY) {
          nextHref = `#${id}`;
          lastMatchedEl = el;
        } else {
          break;
        }
      }

      // Khi đã cuộn qua hết phần Hỏi đáp xuống vùng CTA / chân trang thì tắt gạch chân
      if (lastMatchedEl && lastMatchedEl.getBoundingClientRect().bottom <= 88) {
        nextHref = "";
      }

      if (activeHrefRef.current !== nextHref) {
        activeHrefRef.current = nextHref;
        setActiveHref(nextHref);
      }
    };

    const onScrollOrResize = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateNavState);
      }
    };

    const clearClickLockOnUserInput = () => {
      clickLockRef.current = null;
    };

    updateNavState();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    window.addEventListener("wheel", clearClickLockOnUserInput, { passive: true });
    window.addEventListener("touchmove", clearClickLockOnUserInput, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("wheel", clearClickLockOnUserInput);
      window.removeEventListener("touchmove", clearClickLockOnUserInput);
    };
  }, []);

  const handleLinkClick = (href: string) => {
    setOpen(false);
    clickLockRef.current = { href, until: performance.now() + 800 };
    if (activeHrefRef.current !== href) {
      activeHrefRef.current = href;
      setActiveHref(href);
    }
  };

  const authenticated = status === "authenticated";

  return (
    <header className={`lp-nav ${scrolled || open ? "is-solid" : ""}`}>
      <div className="lp-nav-inner">
        <a
          href="#top"
          className="lp-logo"
          aria-label="HTX Cư Né – về đầu trang"
          onClick={() => handleLinkClick("")}
        >
          <Image className="lp-logo-mark" src="/logo.png" alt="" width={40} height={40} priority />
          <strong>Cư Né</strong>
        </a>

        <nav className={`lp-links ${display.className} ${open ? "is-open" : ""}`} aria-label="Điều hướng chính">
          {NAV_LINKS.map((link) => {
            const isActive = activeHref === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                className={isActive ? "active" : undefined}
                aria-current={isActive ? "location" : undefined}
                onClick={() => handleLinkClick(link.href)}
              >
                <span>{link.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="lp-auth">
          {authenticated ? (
            <>
              <Link id="landing-enter" href={homePathFor(session?.user.role)} className="lp-btn lp-btn-solid">
                Vào hệ thống
              </Link>
              <button id="landing-logout" type="button" className="lp-btn lp-btn-ghost" onClick={() => void logout()}>
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link id="landing-login" href="/login" className="lp-btn lp-btn-ghost">
                Đăng nhập
              </Link>
              <Link id="landing-register" href="/register" className="lp-btn lp-btn-solid">
                Đăng ký
              </Link>
            </>
          )}
        </div>

        <button type="button" className="lp-burger" aria-label="Mở menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
