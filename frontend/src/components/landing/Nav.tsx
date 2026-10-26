"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { homePathFor } from "@/lib/routes";
import { NAV_LINKS } from "./data";
import { display } from "./fonts";

export default function Nav() {
  const { status, session, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const authenticated = status === "authenticated";

  return (
    <header className={`lp-nav ${scrolled || open ? "is-solid" : ""}`}>
      <div className="lp-nav-inner">
        <a href="#top" className="lp-logo" aria-label="HTX Krông Búk – về đầu trang">
          <Image className="lp-logo-mark" src="/logo.png" alt="" width={40} height={40} priority />
          <strong>Krông Búk</strong>
        </a>

        <nav className={`lp-links ${display.className} ${open ? "is-open" : ""}`} aria-label="Điều hướng chính">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
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
