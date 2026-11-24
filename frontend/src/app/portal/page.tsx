import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PortalApp from "@/components/portal/PortalApp";
import { resolveValidPortalRoute } from "@/lib/route-validation";

export const metadata: Metadata = {
  title: "Cổng hộ dân",
  description: "Hộ dân xem thửa đất, ghi nhật ký canh tác, nhận thông báo và gửi hồ sơ tới HTX Cư Né.",
  robots: { index: false, follow: false },
};

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const resolved = resolveValidPortalRoute(params);
  if (!resolved) {
    notFound();
  }
  return <PortalApp initialTab={resolved.tab} />;
}
