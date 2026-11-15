import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { safeDecodeURIComponent } from "@/utils/url-safety";
import TraceView from "./TraceView";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const decoded = safeDecodeURIComponent(code);
  return {
    title: `Truy xuất nguồn gốc ${decoded} | HTX Sầu Riêng Cư Né`,
    description: `Hồ sơ truy xuất nguồn gốc ${decoded}: mã số vùng trồng PUC, cơ sở đóng gói, dòng thời gian 5 bước và kết quả kiểm nghiệm Cadimi, Vàng O.`,
    openGraph: {
      title: `Chứng thực nguồn gốc sầu riêng ${decoded} - HTX Cư Né`,
      description: "Quét mã QR truy xuất nguồn gốc theo lô/thùng chuẩn VietGAP, GACC và Cổng Truy xuất Quốc gia.",
    },
  };
}

async function DynamicMarker() {
  await connection();
  return null;
}

export default function TracePage() {
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
          }}
        >
          Đang nạp hồ sơ xác thực truy xuất nguồn gốc…
        </div>
      }
    >
      <DynamicMarker />
      <TraceView />
    </Suspense>
  );
}
