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
          padding: 3px 9px;
          border-radius: 4px;
          border: 1px solid #d4d4d2;
          background: #f7f7f5;
          color: #14372f;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-variant-numeric: tabular-nums;
          margin-bottom: 10px;
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
          max-width: 320px;
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
          border: 1px solid #45ad8e;
          background: #48b293;
          color: #ffffff;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: background-color 160ms ease, border-color 160ms ease;
        }
        .puc-nf-btn-primary:hover {
          background: #39997c;
          border-color: #39997c;
        }
        .puc-nf-btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 40px;
          padding: 0 18px;
          border-radius: 6px;
          border: 1px solid #d4d4d2;
          background: #ffffff;
          color: #374151;
          font-family: inherit;
          font-size: 13.5px;
          font-weight: 500;
          text-decoration: none;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }
        .puc-nf-btn-secondary:hover {
          background: #f7f7f5;
          border-color: #b8b8b4;
          color: #121212;
        }
      `}</style>

      <div className="puc-nf-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/error-scene.svg"
          alt=""
          width={236}
          height={186}
          className="puc-nf-art"
        />

        <span className="puc-nf-code">Mã lỗi 404</span>

        <h1 className="puc-nf-title">Không tìm thấy trang</h1>

        <p className="puc-nf-desc">
          Đường dẫn hoặc tham số truy cập không hợp lệ trên hệ thống vùng trồng HTX Cư Né.
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
