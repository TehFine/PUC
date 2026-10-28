import type { Metadata } from "next";
import { Suspense } from "react";
import TraceView from "./TraceView";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const decoded = decodeURIComponent(code);
  return {
    title: `Truy xuất nguồn gốc Lô hàng ${decoded} | HTX Sầu Riêng Krông Búk`,
    description: `Hồ sơ kiểm định minh bạch, mã số vùng trồng PUC, kết quả kiểm nghiệm Cadimi, Vàng O và nhật ký canh tác cho lô sầu riêng ${decoded}.`,
    openGraph: {
      title: `Chứng nhận xuất xứ Lô sầu riêng ${decoded} – HTX Krông Búk`,
      description: "Quét mã QR truy xuất nguồn gốc nông sản chính ngạch theo chuẩn GACC và VietGAP.",
    },
  };
}

export default function TracePage() {
  return (
    <Suspense
      fallback={
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#14372f", fontWeight: 700 }}>
          Đang nạp hồ sơ xác thực truy xuất nguồn gốc...
        </div>
      }
    >
      <TraceView />
    </Suspense>
  );
}
