"use client";

import { startTransition, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  useEffect(() => {
    console.error("Application error:", error);
    if (process.env.NODE_ENV === "development" && !autoRetriedRef.current) {
      const msg = error?.message ?? "";
      if (
        msg.includes("is not defined") ||
        msg.includes("Failed to construct") ||
        msg.includes("ChunkLoadError")
      ) {
        autoRetriedRef.current = true;
        const timer = window.setTimeout(() => {
          startTransition(() => {
            router.refresh();
            reset();
          });
        }, 250);
        return () => window.clearTimeout(timer);
      }
    }
  }, [error, reset, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        background: "linear-gradient(180deg, #fef2f2 0%, #ffffff 100%)",
        color: "#14372f",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 500,
          width: "100%",
          background: "#ffffff",
          borderRadius: 20,
          border: "1px solid #fecaca",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
          padding: "36px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "#fef2f2",
            marginBottom: 16,
          }}
        >
          <Image src="/newlogo.png" alt="HTX Cư Né" width={44} height={44} />
        </div>

        <span
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#b91c1c",
            marginBottom: 8,
          }}
        >
          Sự cố gián đoạn tạm thời
        </span>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#0f172a",
            margin: "0 0 10px",
            lineHeight: 1.3,
          }}
        >
          Đã xảy ra lỗi khi hiển thị trang này
        </h1>

        <p
          style={{
            fontSize: 14.5,
            color: "#475569",
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}
        >
          Hệ thống gặp sự cố bất ngờ trong quá trình tải dữ liệu. Vui lòng thử tải lại trang hoặc quay về màn hình chính.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={handleRecover}
            style={{
              padding: "11px 20px",
              borderRadius: 12,
              border: "none",
              background: "#14372f",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Thử tải lại trang
          </button>
          <Link
            href="/"
            style={{
              padding: "11px 18px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Về trang chủ HTX
          </Link>
        </div>
      </div>
    </div>
  );
}

