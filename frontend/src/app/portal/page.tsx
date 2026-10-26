import type { Metadata } from "next";
import PortalApp from "@/components/portal/PortalApp";

export const metadata: Metadata = {
  title: "Cổng hộ dân",
  description: "Hộ dân xem thửa đất, ghi nhật ký canh tác, nhận thông báo và gửi hồ sơ tới HTX Krông Búk.",
};

export default function PortalPage() {
  return <PortalApp />;
}
