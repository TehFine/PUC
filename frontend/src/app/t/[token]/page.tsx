import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import TraceView from "@/app/trace/[code]/TraceView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const shortRef = (token || "").slice(0, 18);
  return {
    title: `Xác thực QR ${shortRef} | Durian Traceability - HTX Cư Né`,
    description:
      "Cổng xác thực nguồn gốc sầu riêng theo lô/thùng thời gian thực (Tiếng Việt / English / 简体中文) - HTX Cư Né, Đắk Lắk.",
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: "Xác thực nguồn gốc sầu riêng - HTX Cư Né (Durian Traceability)",
      description:
        "Kiểm tra trực tiếp trạng thái mã số vùng trồng PUC, cơ sở đóng gói PHC và phiếu kiểm nghiệm an toàn thực phẩm.",
    },
  };
}

async function DynamicMarker() {
  await connection();
  return null;
}

export default function AntiCounterfeitQrTokenPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100dvh",
            background: "#fafaf9",
            textAlign: "center",
            padding: "96px 20px",
            color: "#666662",
            fontSize: 14.5,
            fontWeight: 500,
            fontFamily:
              'var(--font-bai-jamjuree), "Bai Jamjuree", "PingFang SC", "Microsoft YaHei", Arial, Helvetica, sans-serif',
          }}
        >
          Đang xác thực mã QR thời gian thực / Verifying QR / 正在实时核验溯源码…
        </div>
      }
    >
      <DynamicMarker />
      <TraceView />
    </Suspense>
  );
}
