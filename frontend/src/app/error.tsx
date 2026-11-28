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

  if (canSilentReload) {
    return <PageSkeleton label="Đang đồng bộ phiên bản hệ thống mới…" />;
  }

  return (
    <main className="puc-err-state-screen">
      <picture className="puc-err-state-bg">
        <source
          media="(min-width: 901px)"
          srcSet="/error-conn-v3-desktop.webp"
          type="image/webp"
          width={1920}
          height={1080}
        />
        <img
          src="/error-conn-v3-mobile.webp"
          alt=""
          width={1080}
          height={1920}
          decoding="async"
          fetchPriority="high"
          className="puc-err-state-bg-img"
        />
      </picture>

      <section className="puc-err-state-overlay" aria-labelledby="puc-err-heading">
        <h1 id="puc-err-heading" className="puc-err-state-title">
          Tạm gián đoạn kết nối
        </h1>

        <p className="puc-err-state-desc">
          Vui lòng tải lại trang sau ít giây.
        </p>

        <div className="puc-err-state-actions">
          <button
            type="button"
            onClick={handleRecover}
            className="puc-err-state-btn is-primary"
          >
            Tải lại trang
          </button>

          <Link href={INTRO_PATH} className="puc-err-state-btn is-secondary">
            Trang giới thiệu
          </Link>
        </div>
      </section>
    </main>
  );
}
