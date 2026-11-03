import Image from "next/image";

/** Ảnh nền tĩnh cho màn hình đăng nhập và đăng ký trên thiết bị di động / máy tính bảng. */
const SLIDES = [
  { src: "/landing/durian-landscape-real.jpg", alt: "Vườn sầu riêng trên đất đỏ bazan Krông Búk" },
  { src: "/landing/harvest.jpg", alt: "Bà con thu hoạch sầu riêng" },
];

/**
 * Nền ảnh cố định phía sau cho giao diện điện thoại / máy tính bảng (không chạy hiệu ứng chuyển cảnh hay zoom).
 */
export default function AuthSlides({ start = 0 }: { start?: number }) {
  const slide = SLIDES[start % SLIDES.length] ?? SLIDES[0];

  return (
    <div className="auth-slides" aria-hidden="true">
      <div className="auth-slide is-active">
        <Image src={slide.src} alt="" fill sizes="100vw" priority />
      </div>
    </div>
  );
}
