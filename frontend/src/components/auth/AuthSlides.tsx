"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/** Ảnh nền tĩnh cho màn hình đăng nhập và đăng ký trên thiết bị di động / máy tính bảng. */
const SLIDES = [
  { src: "/landing/durian-landscape-real.jpg", alt: "Vườn sầu riêng trên đất đỏ bazan Krông Búk" },
  { src: "/landing/harvest.jpg", alt: "Bà con thu hoạch sầu riêng" },
];

/**
 * Nền ảnh cố định phía sau cho giao diện điện thoại / máy tính bảng (<= 900px).
 * Không mount trên Laptop/Desktop để tránh tải & giải mã trùng lặp 2 ảnh toàn màn hình cùng lúc.
 */
export default function AuthSlides({ start = 0 }: { start?: number }) {
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!isMobileViewport) return null;

  const slide = SLIDES[start % SLIDES.length] ?? SLIDES[0];

  return (
    <div className="auth-slides" aria-hidden="true">
      <div className="auth-slide is-active">
        <Image src={slide.src} alt="" fill sizes="100vw" quality={75} />
      </div>
    </div>
  );
}
