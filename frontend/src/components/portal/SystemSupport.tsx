import { Sheet } from "./ui";
import type { PortalOverview } from "@/types/portal";

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
          <h3 className="pt-support-sec-title">Hướng dẫn thường gặp</h3>
          <ul className="pt-support-faq">
            <li>
              <strong>Ghi nhật ký khi mất kết nối mạng</strong>
              <p>Hệ thống tự động lưu trên điện thoại và đồng bộ ngay khi có lại kết nối mạng 4G/Wifi.</p>
            </li>
            <li>
              <strong>Cần điều chỉnh diện tích, mã số thửa đất</strong>
              <p>Vui lòng chuyển sang tab Hồ sơ để gửi yêu cầu cập nhật hoặc liên hệ trực tiếp cán bộ HTX.</p>
            </li>
            <li>
              <strong>Quên mật khẩu hoặc đổi số điện thoại</strong>
              <p>Liên hệ Ban quản trị HTX hoặc Trưởng thôn để được kiểm tra và cấp lại mật khẩu đăng nhập.</p>
            </li>
          </ul>
        </section>

        <div className="pt-support-system-info">
          Hệ thống Quản lý Vùng trồng & Nhật ký số PUC Krông Búk · Phiên bản 2.4.0
        </div>
      </div>
    </Sheet>
  );
}
