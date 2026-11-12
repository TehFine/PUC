import { RadialPngIcon } from "./RadialIcons";
import { Sheet } from "./ui";

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
    desc: "Chọn 'Quên mật khẩu?' tại màn hình đăng nhập để đặt lại ngay bằng số CCCD 12 số hoặc gửi yêu cầu nhờ cán bộ HTX phê duyệt.",
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
        <span className="pt-support-icon" aria-hidden="true" />
        <span>Bạn cần hỗ trợ ?</span>
      </button>
    </div>
  );
}

export function SystemSupportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <Sheet title="Hỗ trợ hệ thống" onClose={onClose}>
      <div className="pt-support-content">
        <section className="pt-support-sec">
          <h3 className="pt-support-sec-title">Kênh liên hệ trực tiếp</h3>
          <div className="pt-support-box">
            <div className="pt-support-row pt-support-row-call">
              <span className="pt-support-label">Hotline kỹ thuật HTX</span>
              <strong className="pt-support-val">
                <a
                  href="tel:0366663778"
                  className="pt-support-call-pill"
                  title="Bấm để gọi trực tiếp Hotline kỹ thuật HTX"
                >
                  <RadialPngIcon src="/call.png" size={14} />
                  <span>0366 663 778</span>
                </a>
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
          </div>
        </section>

        <section className="pt-support-sec">
          <h3 className="pt-support-sec-title">Thắc mắc thường gặp</h3>
          <div className="pt-vietgap-timeline" role="list">
            {FAQ_ITEMS.map((item) => (
              <div key={item.id} className="pt-vietgap-step" role="listitem">
                <div className="pt-vietgap-segment">
                  <div className={`pt-vietgap-content pt-vietgap-card ${item.cardClass}`}>
                    <span className="pt-timeline-kicker">{item.kicker}</span>
                    <h4 className="pt-timeline-title">{item.title}</h4>
                    <p className="pt-timeline-desc">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="pt-support-system-info">
          Hệ thống Quản lý Vùng trồng & Nhật ký số PUC HTX Cư Né · Phiên bản 2.4.0
        </div>
      </div>
    </Sheet>
  );
}
