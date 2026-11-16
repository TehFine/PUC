"use client";

import { startTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { INTRO_PATH } from "@/lib/routes";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const autoRetriedRef = useRef(false);

  const handleRecover = () => {
    const msg = error?.message ?? "";
    if (
      typeof window !== "undefined" &&
      (msg.includes("is not defined") ||
        msg.includes("Failed to construct") ||
        msg.includes("ChunkLoadError") ||
        msg.includes("Loading chunk") ||
        msg.includes("Failed to fetch dynamically imported module"))
    ) {
      window.location.reload();
      return;
    }
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  useEffect(() => {
    console.error("Application error:", error);
    const msg = error?.message ?? "";
    const isChunkOrDeployMismatch =
      msg.includes("is not defined") ||
      msg.includes("Failed to construct") ||
      msg.includes("ChunkLoadError") ||
      msg.includes("Loading chunk") ||
      msg.includes("Failed to fetch dynamically imported module");

    if (!autoRetriedRef.current && isChunkOrDeployMismatch) {
      autoRetriedRef.current = true;
      const timer = window.setTimeout(() => {
        try {
          const key = "puc_chunk_reload_ts";
          const prev = Number(window.sessionStorage.getItem(key) || "0");
          const now = Date.now();
          if (now - prev > 15_000) {
            window.sessionStorage.setItem(key, String(now));
            window.location.reload();
            return;
          }
        } catch {
          // Bỏ qua nếu trình duyệt chặn sessionStorage
        }
        startTransition(() => {
          router.refresh();
          reset();
        });
      }, 450);
      return () => window.clearTimeout(timer);
    }
  }, [error, reset, router]);

  return (
    <main className="puc-err-screen">
      <style>{`
        .puc-err-screen {
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
        .puc-err-inner {
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .puc-err-art {
          width: 248px;
          height: auto;
          display: block;
          margin: 0 auto 14px;
          user-select: none;
          pointer-events: none;
        }
        .puc-err-title {
          font-size: 28px;
          font-weight: 800;
          line-height: 1.2;
          letter-spacing: -0.025em;
          color: #121212;
          margin: 0 0 8px;
        }
        .puc-err-desc {
          font-size: 14px;
          line-height: 1.55;
          color: #6b7280;
          margin: 0 0 26px;
          max-width: 300px;
        }
        .puc-err-actions {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
          width: 100%;
          max-width: 204px;
        }
        .puc-err-btn-primary {
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
          cursor: pointer;
          transition: background-color 160ms ease, border-color 160ms ease;
        }
        .puc-err-btn-primary:hover {
          background: #39997c;
          border-color: #39997c;
        }
        .puc-err-btn-secondary {
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
        .puc-err-btn-secondary:hover {
          background: #f7f7f5;
          border-color: #b8b8b4;
          color: #121212;
        }
      `}</style>

      <div className="puc-err-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/error-scene.svg"
          alt=""
          width={248}
          height={195}
          className="puc-err-art"
        />

        <h1 className="puc-err-title">Rất tiếc!</h1>

        <p className="puc-err-desc">
          Trang đang tạm gián đoạn. Chúng tôi sẽ khắc phục ngay.
        </p>

        <div className="puc-err-actions">
          <button
            type="button"
            onClick={handleRecover}
            className="puc-err-btn-primary"
          >
            Tải lại trang
          </button>

          <Link href={INTRO_PATH} className="puc-err-btn-secondary">
            Về trang giới thiệu
          </Link>
        </div>
      </div>
    </main>
  );
}
