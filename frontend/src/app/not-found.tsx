import Link from "next/link";
import { INTRO_PATH } from "@/lib/routes";

export default function NotFoundPage() {
  return (
    <main className="puc-err-state-screen">
      <picture className="puc-err-state-bg">
        <source
          media="(min-width: 901px)"
          srcSet="/error-404-v3-desktop.webp"
          type="image/webp"
          width={1920}
          height={1080}
        />
        <img
          src="/error-404-v3-mobile.webp"
          alt=""
          width={1080}
          height={1920}
          decoding="async"
          fetchPriority="high"
          className="puc-err-state-bg-img"
        />
      </picture>

      <section className="puc-err-state-overlay" aria-labelledby="puc-nf-heading">
        <h1 id="puc-nf-heading" className="puc-err-state-title">
          Không tìm thấy trang
        </h1>

        <div className="puc-err-state-actions">
          <Link href="/" className="puc-err-state-btn is-primary">
            Về trang chủ
          </Link>

          <Link href={INTRO_PATH} className="puc-err-state-btn is-secondary">
            Trang giới thiệu
          </Link>
        </div>
      </section>
    </main>
  );
}
