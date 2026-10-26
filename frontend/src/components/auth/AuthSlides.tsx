"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Ảnh nền chạy luân phiên trên điện thoại, dùng chính các ảnh thật của trang giới thiệu. */
const SLIDES = [
  { src: "/landing/durian-landscape-real.jpg", alt: "Vườn sầu riêng trên đất đỏ bazan Krông Búk" },
  { src: "/landing/harvest.jpg", alt: "Bà con thu hoạch sầu riêng" },
  { src: "/landing/durian-tree.jpg", alt: "Cây sầu riêng đang mang trái" },
  { src: "/landing/durian-flower.jpg", alt: "Hoa sầu riêng" },
  { src: "/landing/traceability.jpg", alt: "Kiểm tra mã vùng trồng" },
  { src: "/landing/durian-open.jpg", alt: "Trái sầu riêng chín" },
];

const INTERVAL_MS = 6000;
const MOBILE_QUERY = "(max-width: 900px)";

function isWeakNetwork() {
  const net = document.documentElement.dataset.net;
  return net === "slow" || net === "offline";
}

/**
 * Nền trượt toàn màn hình chỉ dùng cho giao diện điện thoại. Chạy liên tục trong lúc người dùng nhập liệu.
 * Chỉ tải ảnh kế tiếp khi cần, và đứng yên ở ảnh đầu khi mạng yếu hoặc người dùng bật giảm chuyển động.
 */
export default function AuthSlides({ start = 0 }: { start?: number }) {
  const [active, setActive] = useState(start % SLIDES.length);
  const [reached, setReached] = useState(1);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;

    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const tick = () => {
      if (document.hidden || isWeakNetwork()) return;
      setActive((current) => (current + 1) % SLIDES.length);
      setReached((count) => Math.min(SLIDES.length, count + 1));
    };
    const sync = () => {
      stop();
      if (media.matches && !reduce.matches) timer = window.setInterval(tick, INTERVAL_MS);
    };

    sync();
    media.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      stop();
      media.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
    };
  }, []);

  // Chỉ gắn ảnh đã tới lượt (cộng ảnh kế tiếp) để không tải cả 6 ảnh cùng lúc.
  const mounted = (index: number) => {
    const offset = (index - start + SLIDES.length) % SLIDES.length;
    return offset <= reached;
  };

  return (
    <div className="auth-slides" aria-hidden="true">
      {SLIDES.map((slide, index) =>
        mounted(index) ? (
          <div key={slide.src} className={`auth-slide${index === active ? " is-active" : ""}`}>
            <Image src={slide.src} alt="" fill sizes="100vw" priority={index === start % SLIDES.length} />
          </div>
        ) : null,
      )}
    </div>
  );
}
