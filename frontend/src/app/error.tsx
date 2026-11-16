"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { isChunkLoadFailure } from "@/lib/lazy-chunk";
import { INTRO_PATH } from "@/lib/routes";

const CHUNK_RELOAD_KEY = "puc_chunk_reload_ts";
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

function isDeployOrChunkMismatchError(error: Error | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    isChunkLoadFailure(error) ||
    msg.includes("is not defined") ||
    msg.includes("Failed to construct") ||
    msg.includes("Server Action")
  );
}

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const autoRetriedRef = useRef(false);

  const [canSilentReload] = useState(() => {
    if (!isDeployOrChunkMismatchError(error) || typeof window === "undefined") return false;
    try {
      const prev = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
      return Date.now() - prev > CHUNK_RELOAD_COOLDOWN_MS;
    } catch {
      return false;
    }
  });

  const handleRecover = () => {
    if (typeof window !== "undefined" && isDeployOrChunkMismatchError(error)) {
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
    if (!autoRetriedRef.current && isDeployOrChunkMismatchError(error)) {
      autoRetriedRef.current = true;
      try {
        const prev = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
        const now = Date.now();
        if (now - prev > CHUNK_RELOAD_COOLDOWN_MS) {
          window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
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
    }
  }, [error, reset, router]);

  // Khi đang tự đồng bộ bản triển khai mới, hiển thị khung chờ mượt thay vì chớp hình minh họa lỗi 1 giây.
  if (canSilentReload) {
    return <PageSkeleton label="Đang đồng bộ phiên bản hệ thống mới…" />;
  }

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
