import { Sheet } from "./ui";
import type { PortalOverview } from "@/types/portal";

interface FaqItem {
  id: string;
  kicker: string;
  title: string;
  desc: string;
  nodeType: "active" | "warn" | "danger";
  cardClass: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "frequency",
    kicker: "HỖ TRỢ 1 · NGOẠI TUYẾN",
    title: "Ghi nhật ký khi mất kết nối mạng",
    desc: "Hệ thống tự động lưu trên điện thoại và đồng bộ ngay khi có lại kết nối mạng 4G/Wifi.",
    nodeType: "active",
    cardClass: "pt-vietgap-card-frequency",
  },
  {
    id: "phi",
    kicker: "HỖ TRỢ 2 · THÔNG TIN THỬA",
    title: "Cần điều chỉnh diện tích, mã số thửa đất",
    desc: "Vui lòng liên hệ trực tiếp cán bộ HTX hoặc Trưởng thôn để được hỗ trợ cập nhật thông tin thửa đất.",
    nodeType: "warn",
    cardClass: "pt-vietgap-card-phi",
  },
  {
    id: "banned",
    kicker: "HỖ TRỢ 3 · TÀI KHOẢN",
    title: "Quên mật khẩu hoặc đổi số điện thoại",
    desc: "Liên hệ Ban quản trị HTX hoặc Trưởng thôn để được kiểm tra và cấp lại mật khẩu đăng nhập.",
    nodeType: "danger",
    cardClass: "pt-vietgap-card-banned",
  },
];

export function SupportFooter({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="pt-support-footer">
      <button
        type="button"
        className="pt-support-btn"
        onClick={onOpen}
      >
        Bạn cần hỗ trợ ?
      </button>
    </div>
  );
}

export function SystemSupportModal({
  open,
  onClose,
  household,
}: {
  open: boolean;
  onClose: () => void;
  household?: PortalOverview["household"];
}) {
  if (!open) return null;

  return (
    <Sheet title="Hỗ trợ hệ thống" onClose={onClose}>
      <div className="pt-support-content">
        <section className="pt-support-sec">
          <h3 className="pt-support-sec-title">Kênh liên hệ trực tiếp</h3>
          <div className="pt-support-box">
            <div className="pt-support-row">
              <span className="pt-support-label">Hotline kỹ thuật HTX</span>
              <strong className="pt-support-val">
                <a href="tel:0914123456">0914 123 456</a>
              </strong>
            </div>
            <div className="pt-support-row">
              <span className="pt-support-label">Văn phòng HTX</span>
              <strong className="pt-support-val">Krông Búk, Đắk Lắk</strong>
            </div>
            <div className="pt-support-row">
              <span className="pt-support-label">Giờ hỗ trợ</span>
              <strong className="pt-support-val">7:30 – 17:00 (Thứ 2 – Thứ 7)</strong>
            </div>
            {household?.villageLeader && (
              <div className="pt-support-row">
                <span className="pt-support-label">Trưởng thôn ({household.villageName})</span>
                <strong className="pt-support-val">{household.villageLeader}</strong>
              </div>
            )}
          </div>
        </section>

        <section className="pt-support-sec">
          <h3 className="pt-support-sec-title">Thắc mắc thường gặp</h3>
          <div className="pt-timeline pt-vietgap-timeline" role="list">
            {FAQ_ITEMS.map((item, idx, arr) => {
              const isFirst = idx === 0;
              const isLast = idx === arr.length - 1;
              const nodeClass =
                item.nodeType === "active"
                  ? "is-active"
                  : item.nodeType === "warn"
                  ? "is-warn"
                  : "is-danger";

              return (
                <div
                  key={item.id}
                  className={`pt-timeline-item pt-vietgap-item ${isFirst ? "is-first" : ""} ${isLast ? "is-last" : ""}`}
                >
                  <div className="pt-timeline-track" aria-hidden="true">
                    <div className={`pt-timeline-node ${nodeClass}`} />
                  </div>
                  <div className={`pt-timeline-content pt-vietgap-card ${item.cardClass}`}>
                    <span className="pt-timeline-kicker">{item.kicker}</span>
                    <h4 className="pt-timeline-title">{item.title}</h4>
                    <p className="pt-timeline-desc">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="pt-support-system-info">
          Hệ thống Quản lý Vùng trồng & Nhật ký số PUC Krông Búk · Phiên bản 2.4.0
        </div>
      </div>
    </Sheet>
  );
}
