import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageSkeleton } from "@/components/ui/Skeleton";
import TraceView from "@/app/trace/[code]/TraceView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const shortRef = (token || "").slice(0, 18);
  return {
    title: `Xác thực QR ${shortRef} | HTX Cư Né`,
    description:
      "Cổng xác thực nguồn gốc sầu riêng điện tử cho thửa đất, lô hàng, thùng đóng gói và tem trái (Tiếng Việt / English / 简体中文) - HTX Cư Né, Đắk Lắk.",
    robots: {
      index: false,
      follow: false,
    },
    referrer: "no-referrer",
    openGraph: {
      title: "Xác thực nguồn gốc sầu riêng - HTX Cư Né",
      description:
        "Kiểm tra trực tiếp hồ sơ vùng trồng PUC, thửa đất canh tác, cơ sở đóng gói PHC và phiếu kiểm nghiệm an toàn thực phẩm.",
    },
  };
}

async function DynamicMarker() {
  await connection();
  return null;
}

export default function AntiCounterfeitQrTokenPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Đang tải hồ sơ truy xuất nguồn gốc…" />}>
      <DynamicMarker />
      <TraceView />
    </Suspense>
  );
}
