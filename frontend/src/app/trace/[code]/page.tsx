import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { safeDecodeURIComponent } from "@/utils/url-safety";
import { getTraceLoadingLabel, inferTraceKindFromCode } from "./trace-i18n";
import TraceView from "./TraceView";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const decoded = safeDecodeURIComponent(code);
  const kind = inferTraceKindFromCode(decoded);
  const entityLabel =
    kind === "plot"
      ? `thửa đất ${decoded}`
      : kind === "box"
        ? `thùng đóng gói ${decoded}`
        : kind === "fruit"
          ? `trái sầu riêng ${decoded}`
          : kind === "lot"
            ? `lô hàng ${decoded}`
            : `mã ${decoded}`;
  return {
    title: `Truy xuất ${entityLabel} | HTX Cư Né`,
    description: `Hồ sơ truy xuất nguồn gốc ${entityLabel}: mã số vùng trồng PUC, nhật ký canh tác, đơn vị chịu trách nhiệm và kết quả kiểm nghiệm an toàn thực phẩm.`,
    robots: {
      index: false,
      follow: false,
    },
    referrer: "no-referrer",
    openGraph: {
      title: `Hồ sơ truy xuất ${entityLabel} - HTX Cư Né`,
      description: "Cổng truy xuất nguồn gốc điện tử cho thửa vườn, lô hàng, thùng đóng gói và tem trái sầu riêng của HTX Cư Né.",
    },
  };
}

async function DynamicMarker() {
  await connection();
  return null;
}

export default function TracePage() {
  return (
    <Suspense fallback={<PageSkeleton label={getTraceLoadingLabel("generic", "vi")} />}>
      <DynamicMarker />
      <TraceView />
    </Suspense>
  );
}
