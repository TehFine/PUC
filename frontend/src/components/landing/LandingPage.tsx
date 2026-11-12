import Image from "next/image";
import Link from "next/link";
import AutoEnter from "./AutoEnter";
import Catalog from "./Catalog";
import EditorialHero from "./EditorialHero";
import Faq from "./Faq";
import News from "./News";
import TrainingGallery from "./TrainingGallery";
import "./landing.css";
import "./swiss-landing.css";

/**
 * Trang giới thiệu công khai theo lưới kiến trúc Thụy Sĩ 4 cột tinh gọn, dễ theo dõi:
 * - Mỗi bức ảnh chỉ đi kèm DUY NHẤT 1 ô tiêu đề rõ ràng ngay bên cạnh + khoảng trắng thoáng.
 * - Phần Tập huấn và Bản tin mở rộng khung hình để thấy trọn vẹn cán bộ & nhà vườn,
 *   khi bấm vào trượt ngăn chi tiết mượt từ cạnh phải màn hình.
 * - Danh mục thuốc BVTV & Khuyến cáo gộp thành 1 bảng đơn giản chuyển đổi bằng nút bấm.
 * - Chân trang đồng bộ khung lưới 4 cột với đầy đủ thông tin liên hệ, hỗ trợ và dịch vụ.
 */
export default function LandingPage({ autoEnter = false }: { autoEnter?: boolean }) {
  return (
    <div className="lp sw-page" id="top">
      {autoEnter && <AutoEnter />}

      <EditorialHero />

      <main>
        {/* ─── 01. HỆ THỐNG VÙNG TRỒNG (1 Ảnh = 1 Ô nội dung bên cạnh + Khoảng trắng thoáng) ─── */}
        <section id="he-thong" className="sw-section" aria-labelledby="hethong-title">
          <header className="sw-grid sw-sec-head">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2-3 sw-head-main">
              <span className="sw-sec-index">01 / Hệ thống</span>
              <h2 id="hethong-title" className="sw-sec-title">
                Chuỗi canh tác sầu riêng
              </h2>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </header>

          {/* Hàng 1: Ảnh 2 cột trái | 1 ô nội dung Cột 3 | Khoảng thở trắng Cột 4 */}
          <div className="sw-grid sw-checker-row">
            <div className="sw-media sw-col-1-2 is-pos-estate">
              <Image
                src="/landing/lux-estate-dawn.jpg"
                alt="Toàn cảnh triền đồi sầu riêng trong sương sớm cùng nhà trạm kiến trúc tối giản tại Đắk Lắk"
                fill
                sizes="(max-width: 960px) 100vw, 50vw"
                style={{ objectFit: "cover", objectPosition: "var(--mob-pos, center 56%)" }}
              />
            </div>
            <div className="sw-cell sw-col-3 sw-between">
              <span className="sw-micro">Bản đồ số</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Bản đồ vùng trồng</h3>
                <p className="sw-caption-meta">
                  <span>Đo đạc tọa độ từng thửa vườn</span>
                  <span>Krông Búk, Đắk Lắk</span>
                </p>
              </div>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </div>

          {/* Hàng 2: Khoảng thở trắng Cột 1 | 1 ô nội dung Cột 2 | Ảnh 2 cột phải */}
          <div className="sw-grid sw-checker-row">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2 sw-between">
              <span className="sw-micro">Nhật ký mùa vụ</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Chăm sóc & ra hoa</h3>
                <p className="sw-caption-meta">
                  <span>Ghi lịch bón phân, phun thuốc</span>
                  <span>Tự động tính ngày cách ly</span>
                </p>
              </div>
            </div>
            <div className="sw-media sw-col-3-4">
              <Image
                src="/landing/lux-blossom.jpg"
                alt="Chùm hoa sầu riêng màu kem ngà bung nở trên cành gỗ mộc trong nắng sớm"
                fill
                sizes="(max-width: 960px) 100vw, 50vw"
                style={{ objectFit: "cover", objectPosition: "center 52%" }}
              />
            </div>
          </div>

          {/* Hàng 3: Ảnh 2 cột trái | 1 ô nội dung Cột 3 | Khoảng thở trắng Cột 4 */}
          <div className="sw-grid sw-checker-row">
            <div className="sw-media sw-col-1-2 is-pos-harvest">
              <Image
                src="/landing/lux-harvest.jpg"
                alt="Người nông dân đội nón lá nâng niu trái sầu riêng vừa thu hoạch bên giỏ mây trong sương sớm"
                fill
                sizes="(max-width: 960px) 100vw, 50vw"
                style={{ objectFit: "cover", objectPosition: "var(--mob-pos, center 16%)" }}
              />
            </div>
            <div className="sw-cell sw-col-3 sw-between">
              <span className="sw-micro">Cổng hộ dân</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Thu hoạch đúng chuẩn</h3>
                <p className="sw-caption-meta">
                  <span>Theo dõi lịch cắt trái & sản lượng</span>
                  <span>Ngay trên điện thoại nhà vườn</span>
                </p>
              </div>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </div>

          {/* Hàng 4: 2 ô trắng Cột 1–2 | Ảnh vuông 1 cột Cột 3 | 1 ô nội dung Cột 4 */}
          <div className="sw-grid sw-checker-row">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2 sw-empty-cell" aria-hidden="true" />
            <div className="sw-media sw-col-3 is-pos-arils">
              <Image
                src="/landing/lux-arils-square.jpg"
                alt="Múi sầu riêng chín vàng đặt trên đĩa gốm thủ công bên trái sầu riêng tách vỏ trên bàn gỗ sồi"
                fill
                sizes="(max-width: 960px) 100vw, 25vw"
                style={{ objectFit: "cover", objectPosition: "var(--mob-pos, center 62%)" }}
              />
            </div>
            <div className="sw-cell sw-col-4 sw-between">
              <span className="sw-micro">An toàn thực phẩm</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Kiểm nghiệm mẫu trái</h3>
                <p className="sw-caption-meta">
                  <span>Kiểm soát dư lượng & Cadimi</span>
                  <span>Tuyệt đối không Vàng O</span>
                </p>
              </div>
            </div>
          </div>

          {/* Hàng 5: Ảnh 2 cột trái | 1 ô nội dung Cột 3 | Khoảng thở trắng Cột 4 */}
          <div className="sw-grid sw-checker-row">
            <div className="sw-media sw-col-1-2 is-pos-export">
              <Image
                src="/landing/lux-export-bench.jpg"
                alt="Ba trái sầu riêng tuyển chọn đồng đều đặt cùng sổ tay vải lanh trên bàn gỗ sồi trong không gian kiến trúc tối giản"
                fill
                sizes="(max-width: 960px) 100vw, 50vw"
                style={{ objectFit: "cover", objectPosition: "var(--mob-pos, center 68%)" }}
              />
            </div>
            <div className="sw-cell sw-col-3 sw-between">
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Tuyển chọn xuất khẩu</h3>
                <p className="sw-caption-meta">
                  <span>Đồng bộ từ nhà vườn đến kho</span>
                  <span>Xuất khẩu chính ngạch GACC</span>
                </p>
              </div>
              <span className="sw-micro">HTX Nông nghiệp Cư Né</span>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </div>
        </section>

        {/* ─── 02. MÃ VÙNG ĐỊNH DANH (Bố cục bất đối xứng gọn gàng, đúng mẫu Hình 3) ─── */}
        <section id="ma-vung" className="sw-section" aria-labelledby="mavung-title">
          <header className="sw-grid sw-sec-head">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2-3 sw-head-main">
              <span className="sw-sec-index">02 / Vùng trồng</span>
              <h2 id="mavung-title" className="sw-sec-title">
                Mã vùng định danh
              </h2>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </header>

          <div className="sw-asymmetric-bento">
            {/* Cột 1 xuyên 2 hàng: Ảnh cành sầu riêng khổ dọc */}
            <div className="sw-bento-tall-photo">
              <Image
                src="/landing/lux-branch-vertical.jpg"
                alt="Cành sầu riêng trưởng thành mang ba trái chín treo tự nhiên bên hệ lam gỗ sồi và tường đá vôi ấm"
                fill
                sizes="(max-width: 960px) 100vw, 25vw"
                style={{ objectFit: "cover", objectPosition: "center 50%" }}
              />
            </div>

            {/* Hàng 1 – Cột 2: Thông tin mã vùng ngắn gọn */}
            <div className="sw-cell sw-bento-top-info sw-between">
              <span className="sw-micro">Định danh PUC</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Mã số vùng trồng</h3>
                <p className="sw-caption-meta">
                  <span>Xã Cư Né, Huyện Krông Búk</span>
                  <span>Tỉnh Đắk Lắk, Tây Nguyên</span>
                  <span>Định danh riêng từng thửa vườn</span>
                </p>
              </div>
            </div>

            {/* Hàng 1 – Cột 3 & 4: Ảnh ngang trái sầu riêng gắn thẻ QR */}
            <div className="sw-bento-wide-photo">
              <Image
                src="/landing/lux-qr-atelier.jpg"
                alt="Trái sầu riêng gắn thẻ mã QR tối giản đặt trên mặt bàn đá travertine bên hệ lam gỗ sồi"
                fill
                sizes="(max-width: 960px) 100vw, 50vw"
                style={{ objectFit: "cover", objectPosition: "var(--mob-pos, center 66%)" }}
              />
            </div>

            {/* Hàng 2 – Cột 2: Khoảng thở trắng tinh khiết */}
            <div className="sw-bento-bot-empty" aria-hidden="true" />

            {/* Hàng 2 – Cột 3: Thẩm định tại vườn */}
            <div className="sw-cell sw-bento-bot-col3">
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Cấp mã tại vườn</h3>
                <p className="sw-caption-meta">
                  <span>Đo vẽ bản đồ ranh giới GPS</span>
                  <span>Kiểm tra giống cây & nhật ký</span>
                </p>
              </div>
            </div>

            {/* Hàng 2 – Cột 4: Dán tem QR xuất kho */}
            <div className="sw-cell sw-bento-bot-col4">
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Tem QR xuất kho</h3>
                <p className="sw-caption-meta">
                  <span>Kiểm nghiệm mẫu trước cắt trái</span>
                  <span>Gắn tem riêng từng lô thu hoạch</span>
                  <span>Truy xuất minh bạch đến từng hộ</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 03. TẬP HUẤN THỰC ĐỊA (Khung hình mở rộng + Ngăn chi tiết trượt từ cạnh phải) ─── */}
        <TrainingGallery />

        {/* ─── 04. BẢN TIN NHÀ NÔNG (Khung hình mở rộng + Ngăn chi tiết trượt từ cạnh phải) ─── */}
        <News />

        {/* ─── 05. THUỐC BVTV & KHUYẾN CÁO (Bảng đơn giản bấm chuyển mục) ─── */}
        <Catalog />

        {/* ─── 06. HỎI ĐÁP THƯỜNG GẶP ─── */}
        <section id="hoi-dap" className="sw-section" aria-labelledby="hoidap-title">
          <header className="sw-grid sw-sec-head">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2-3 sw-head-main">
              <span className="sw-sec-index">06 / Hỏi đáp</span>
              <h2 id="hoidap-title" className="sw-sec-title">
                Câu hỏi thường gặp
              </h2>
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </header>

          <Faq />
        </section>
      </main>

      {/* ─── CHÂN TRANG KIẾN TRÚC 4 CỘT ĐẦY ĐỦ NỘI DUNG ─── */}
      <footer className="sw-section sw-footer" aria-label="Thông tin liên hệ HTX Nông nghiệp Cư Né">
        <div className="sw-grid sw-footer-main">
          {/* Cột 1: Giới thiệu đơn vị vận hành */}
          <div className="sw-cell sw-col-1 sw-between">
            <div>
              <a href="#top" className="eh-brand sw-footer-brand">
                <Image src="/newlogo.png" alt="" width={24} height={24} className="eh-brand-logo" />
                <span>HTX Nông nghiệp Cư Né</span>
              </a>
              <p className="sw-muted-sm sw-footer-desc">
                <span className="sw-hide-mobile">
                  Nền tảng số hóa quản lý mã vùng trồng, nhật ký canh tác, kiểm nghiệm an toàn thực phẩm và truy xuất nguồn gốc sầu riêng Đắk Lắk xuất khẩu chính ngạch.
                </span>
                <span className="sw-only-mobile">
                  Số hóa mã vùng trồng, nhật ký canh tác và truy xuất sầu riêng Đắk Lắk xuất khẩu.
                </span>
              </p>
            </div>
            <div className="sw-meta-pair">
              <span>Quy mô liên kết</span>
              <strong>5 thôn · Xã Cư Né, Krông Búk</strong>
            </div>
          </div>

          {/* Cột 2: Địa chỉ & Hỗ trợ nhà vườn */}
          <div className="sw-cell sw-col-2 sw-between">
            <div>
              <h3 className="sw-footer-heading">Liên hệ & Hỗ trợ</h3>
              <ul className="sw-footer-info">
                <li>
                  <span>Địa chỉ</span>
                  <strong>Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk</strong>
                </li>
                <li>
                  <span>Lịch làm việc</span>
                  <strong>Thứ Hai – Thứ Bảy (07:30 – 17:00)</strong>
                </li>
                <li>
                  <span>Hỗ trợ kỹ thuật</span>
                  <strong>Ban Kỹ thuật HTX & Cán bộ phụ trách thôn</strong>
                </li>
                <li>
                  <span>Giám sát vùng trồng</span>
                  <strong>Tổ Bảo vệ Thực vật & Kiểm tra nội bộ</strong>
                </li>
              </ul>
            </div>
            <Link href="/trace" className="sw-action-inline">
              Tra cứu tem nguồn gốc QR
            </Link>
          </div>

          {/* Cột 3: Cổng dịch vụ hệ thống */}
          <div className="sw-cell sw-col-3 sw-between">
            <div>
              <h3 className="sw-footer-heading">Cổng dịch vụ số</h3>
              <ul className="sw-footer-links">
                <li>
                  <Link href="/login">Đăng nhập Cổng hộ dân & Cán bộ</Link>
                </li>
                <li>
                  <Link href="/register">Đăng ký tài khoản hộ thành viên</Link>
                </li>
                <li>
                  <Link href="/trace">Kiểm tra mã lô & tem truy xuất QR</Link>
                </li>
                <li>
                  <a href="#tra-cuu">Tra cứu danh mục thuốc BVTV</a>
                </li>
                <li>
                  <a href="#quy-trinh">Xem khuyến cáo chăm sóc theo vụ</a>
                </li>
              </ul>
            </div>
            <span className="sw-micro">Hỗ trợ trực tiếp trên điện thoại & máy tính</span>
          </div>

          {/* Cột 4: Chuyên mục trang & Tiêu chuẩn */}
          <div className="sw-cell sw-col-4 sw-between sw-hide-mobile">
            <div>
              <h3 className="sw-footer-heading">Chuyên mục trang</h3>
              <ul className="sw-footer-links">
                <li>
                  <a href="#he-thong">01. Chuỗi canh tác sầu riêng</a>
                </li>
                <li>
                  <a href="#ma-vung">02. Mã số vùng trồng định danh</a>
                </li>
                <li>
                  <a href="#tap-huan">03. Tập huấn canh tác</a>
                </li>
                <li>
                  <a href="#tin-tuc">04. Bản tin & Khuyến nông</a>
                </li>
                <li>
                  <a href="#hoi-dap">06. Giải đáp câu hỏi thường gặp</a>
                </li>
              </ul>
            </div>
            <a href="#top" className="sw-action-inline">
              Về đầu trang
            </a>
          </div>
        </div>

        {/* Hàng đáy chân trang đồng bộ 4 cột */}
        <div className="sw-grid sw-footer-bar">
          <div className="sw-cell sw-col-1">
            <span className="sw-micro">© 2026 HTX Nông nghiệp Cư Né · Đắk Lắk</span>
          </div>
          <div className="sw-cell sw-col-2 sw-hide-mobile">
            <span className="sw-micro">Tiêu chuẩn: VietGAP · Nghị định thư GACC · An toàn MRL</span>
          </div>
          <div className="sw-cell sw-col-3 sw-hide-mobile">
            <span className="sw-micro">Bảo mật thông tin hộ dân · Lưu vết kiểm tra minh bạch</span>
          </div>
          <div className="sw-cell sw-col-4 sw-footer-bar-end">
            <span className="sw-micro">Hệ thống Quản lý Vùng trồng PUC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
