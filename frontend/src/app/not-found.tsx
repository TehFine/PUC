import Link from "next/link";
import { INTRO_PATH } from "@/lib/routes";

export default function NotFoundPage() {
  return (
    <main className="puc-nf-screen">
      <style>{`
        .puc-nf-screen {
          min-height: 100dvh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          background: #ffffff;
          color: #121212;
          font-family: var(--font-sans), system-ui, -apple-system, sans-serif;
          box-sizing: border-box;
        }
        .puc-nf-inner {
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .puc-nf-art {
          width: 236px;
          height: auto;
          display: block;
          margin: 0 auto 12px;
          user-select: none;
          pointer-events: none;
        }
        .puc-nf-code {
          display: inline-block;
          padding: 0;
          border: none;
          background: transparent;
          color: #2b866e;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.06em;
          font-variant-numeric: tabular-nums;
          margin-bottom: 4px;
        }
        .puc-nf-title {
          font-size: 26px;
          font-weight: 800;
          line-height: 1.22;
          letter-spacing: -0.025em;
          color: #121212;
          margin: 0 0 8px;
        }
        .puc-nf-desc {
          font-size: 14px;
          line-height: 1.55;
          color: #5f6d66;
          margin: 0 0 24px;
          max-width: 310px;
        }
        .puc-nf-actions {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
          width: 100%;
          max-width: 216px;
        }
        .puc-nf-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 42px;
          padding: 0 22px;
          border-radius: 6px;
          border: none;
          outline: none;
          background: #48b293;
          color: #ffffff;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: background-color 160ms ease;
        }
        .puc-nf-btn-primary:hover {
          background: #39997c;
        }
        .puc-nf-btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 40px;
          padding: 0 18px;
          border-radius: 6px;
          border: none;
          outline: none;
          background: #f3f5f4;
          color: #1f2937;
          font-family: inherit;
          font-size: 13.5px;
          font-weight: 500;
          text-decoration: none;
          transition: background-color 160ms ease, color 160ms ease;
        }
        .puc-nf-btn-secondary:hover {
          background: #e7ece9;
          color: #121212;
        }
      `}</style>

      <div className="puc-nf-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/error-scene.svg?v=2"
          alt=""
          width={236}
          height={186}
          className="puc-nf-art"
        />

        <span className="puc-nf-code">404</span>

        <h1 className="puc-nf-title">Không tìm thấy trang</h1>

        <p className="puc-nf-desc">
          Trang bạn mở không tồn tại hoặc đã được chuyển sang địa chỉ khác.
        </p>

        <div className="puc-nf-actions">
          <Link href="/" className="puc-nf-btn-primary">
            Về trang chính
          </Link>

          <Link href={INTRO_PATH} className="puc-nf-btn-secondary">
            Về trang giới thiệu
          </Link>
        </div>
      </div>
    </main>
  );
}
