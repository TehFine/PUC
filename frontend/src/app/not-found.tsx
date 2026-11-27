import Link from "next/link";
import { INTRO_PATH } from "@/lib/routes";

export default function NotFoundPage() {
  return (
    <main className="puc-err-state-screen">
      <section className="puc-err-state-card" aria-labelledby="puc-nf-heading">
        <picture className="puc-err-state-media">
          <source
            media="(min-width: 769px)"
            srcSet="/error-404-desktop.webp"
            type="image/webp"
          />
          <img
            src="/error-404-mobile.webp"
            alt=""
            width={1200}
            height={896}
            decoding="async"
            fetchPriority="high"
            className="puc-err-state-img"
          />
        </picture>

        <div className="puc-err-state-body">
          <span className="puc-err-state-code">404</span>

          <h1 id="puc-nf-heading" className="puc-err-state-title">
            Không tìm thấy trang
          </h1>

          <p className="puc-err-state-desc">
            Trang bạn mở không tồn tại hoặc đường dẫn đã thay đổi, vui lòng kiểm tra lại.
          </p>

          <div className="puc-err-state-actions">
            <Link href="/" className="puc-err-state-btn is-primary">
              Về trang chính
            </Link>

            <Link href={INTRO_PATH} className="puc-err-state-btn is-secondary">
              Về trang giới thiệu
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
