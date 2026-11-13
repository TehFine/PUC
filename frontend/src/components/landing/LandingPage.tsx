import AutoEnter from "./AutoEnter";
import Catalog from "./Catalog";
import DwellSlideshow, { type DwellSlide } from "./DwellSlideshow";
import EditorialHero from "./EditorialHero";
import Faq from "./Faq";
import LandingFooter from "./LandingFooter";
import News from "./News";
import TrainingGallery from "./TrainingGallery";
import "./landing.css";
import "./swiss-landing.css";

const MAP_SURVEY_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/real-map-survey.jpg",
    alt: "Cán bộ kỹ thuật HTX đo đạc tọa độ GPS và đối chiếu bản đồ ranh giới từng thửa vườn sầu riêng tại Krông Búk, Đắk Lắk",
    objectPosition: "center 38%",
    mobileObjectPosition: "54% 38%",
  },
  {
    src: "/landing/lux-map-atelier.jpg",
    alt: "Sầu riêng xuất khẩu đặt cạnh bản vẽ địa hình thửa vườn và compa đồng trên bàn đá travertine bên vách gỗ sồi",
    objectPosition: "center 56%",
    mobileObjectPosition: "52% 58%",
  },
  {
    src: "/landing/lux-estate-dawn.jpg",
    alt: "Toàn cảnh đồi sầu riêng Cư Né phân thửa trong sương sớm nhìn từ không gian kiến trúc gỗ đá hiện đại",
    objectPosition: "center 48%",
    mobileObjectPosition: "36% 48%",
  },
];

const BLOSSOM_CARE_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/real-blossom-care.jpg",
    alt: "Nhà vườn kiểm tra chùm hoa sầu riêng đang nở và ghi chép lịch chăm sóc mùa vụ tại vườn",
    objectPosition: "center 36%",
    mobileObjectPosition: "66% 36%",
  },
  {
    src: "/landing/real-seasonal-care-orchard.jpg",
    alt: "Cán bộ kỹ thuật HTX cùng nhà vườn kiểm tra chùm mắt cua trên cành, điều tiết béc tưới giữ ẩm dưới gốc và đối chiếu nhật ký mùa vụ",
    objectPosition: "center 40%",
    mobileObjectPosition: "62% 38%",
  },
  {
    src: "/landing/real-orchard-blossom-cluster.jpg",
    alt: "Chùm hoa sầu riêng trắng ngà và nụ hoa bung nở tự nhiên từ mặt dưới cành gỗ lớn trong nắng sớm vùng đồi Đắk Lắk",
    objectPosition: "center 38%",
    mobileObjectPosition: "50% 38%",
  },
];

const HARVEST_STANDARD_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/lux-harvest.jpg",
    alt: "Người nông dân đội nón lá nâng niu trái sầu riêng vừa thu hoạch bên giỏ mây trong sương sớm",
    objectPosition: "center 16%",
    mobileObjectPosition: "40% 24%",
  },
  {
    src: "/stages/stage-06-thu-hoach.jpg",
    alt: "Thu hoạch sầu riêng đúng độ chín bằng kéo sạch và xếp trái vào sọt nhựa lót xốp đặt trên bạt sạch tại vườn",
    objectPosition: "center 52%",
    mobileObjectPosition: "52% 48%",
  },
  {
    src: "/landing/lux-harvest-atelier.jpg",
    alt: "Cặp trái sầu riêng vừa cắt cuống chuẩn độ già đặt trong khay mây đan cùng kéo thu hoạch thủ công trên bệ đá travertine",
    objectPosition: "center 56%",
    mobileObjectPosition: "52% 58%",
  },
];

const LAB_PURITY_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/real-lab-test.jpg",
    alt: "Kỹ thuật viên kiểm nghiệm mẫu cơm sầu riêng trên khay inox cùng cân phân tích và dụng cụ đo an toàn thực phẩm",
    objectPosition: "center 48%",
    mobileObjectPosition: "55% 48%",
  },
  {
    src: "/landing/lux-arils-square.jpg",
    alt: "Múi sầu riêng vàng ươm tự nhiên đặt trên đĩa gốm thủ công trong không gian nan gỗ sáng thoáng",
    objectPosition: "center 52%",
    mobileObjectPosition: "50% 52%",
  },
  {
    src: "/landing/lux-lab-purity-square.jpg",
    alt: "Mẫu múi sầu riêng tinh khiết đặt trên đĩa sứ trắng cạnh lồng kính thẩm định và bệ đá travertine",
    objectPosition: "center 54%",
    mobileObjectPosition: "50% 54%",
  },
];

const EXPORT_SELECT_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/real-export-packhouse.jpg",
    alt: "Nhân viên kho đóng gói phân loại sầu riêng gắn thẻ cuống đồng bộ vào thùng xuất khẩu chính ngạch",
    objectPosition: "center 46%",
    mobileObjectPosition: "50% 46%",
  },
  {
    src: "/landing/lux-export-bench.jpg",
    alt: "Ba trái sầu riêng đồng đều đạt chuẩn xuất khẩu cùng sổ theo dõi đặt trên băng ghế gỗ sồi kiến trúc",
    objectPosition: "center 54%",
    mobileObjectPosition: "50% 56%",
  },
  {
    src: "/landing/lux-export-crate.jpg",
    alt: "Sầu riêng tuyển chọn xuất khẩu và múi vàng ươm bên hộp gỗ lót vải lanh trên quầy đá travertine",
    objectPosition: "center 56%",
    mobileObjectPosition: "52% 58%",
  },
];

const PUC_VERTICAL_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/real-puc-orchard-vertical.jpg",
    alt: "Cây sầu riêng trưởng thành sai trái trên nền đất đỏ bazan lắp hệ thống tưới nhỏ giọt tại vùng trồng Cư Né, Đắk Lắk",
    objectPosition: "center 44%",
    mobileObjectPosition: "center 48%",
  },
  {
    src: "/landing/lux-branch-vertical.jpg",
    alt: "Cành sầu riêng sai trái nổi bật giữa không gian kiến trúc đá tự nhiên và hệ lam gỗ ấm áp",
    objectPosition: "center 48%",
    mobileObjectPosition: "center 48%",
  },
  {
    src: "/landing/lux-puc-pedestal-vertical.jpg",
    alt: "Sầu riêng Cư Né định danh trưng bày trên trụ đá travertine nguyên khối giữa hốc kiến trúc nan gỗ sồi",
    objectPosition: "center 46%",
    mobileObjectPosition: "center 46%",
  },
];

const QR_LOT_WIDE_SLIDES: readonly DwellSlide[] = [
  {
    src: "/landing/real-qr-trace-lot.jpg",
    alt: "Quét mã QR truy xuất nguồn gốc gắn trên cuống trái sầu riêng vừa thu hoạch tại nhà đóng gói",
    objectPosition: "center 52%",
    mobileObjectPosition: "62% 52%",
  },
  {
    src: "/stages/stage-07-sau-thu.jpg",
    alt: "Nhân viên kiểm định gắn tem mã QR truy xuất lên cuống trái sầu riêng và bọc lưới xốp đóng thùng xuất khẩu",
    objectPosition: "center 44%",
    mobileObjectPosition: "46% 42%",
  },
  {
    src: "/landing/lux-qr-lot-atelier.jpg",
    alt: "Lô trái sầu riêng đồng bộ gắn thẻ QR truy xuất nguồn gốc tinh gọn trên kệ đá travertine và vách nan gỗ",
    objectPosition: "center 52%",
    mobileObjectPosition: "47% 52%",
  },
];

function MobileSpreadNote({ prose }: { prose: string }) {
  return (
    <div className="sw-mob-spread-note">
      <p className="sw-mob-spread-prose">{prose}</p>
    </div>
  );
}

/**
 * Trang giới thiệu công khai theo lưới kiến trúc Thụy Sĩ 4 cột tinh gọn, dễ theo dõi:
 * - Mỗi bức ảnh chỉ đi kèm DUY NHẤT 1 ô tiêu đề rõ ràng ngay bên cạnh + khoảng trắng thoáng.
 * - Phần Tập huấn và Bản tin mở rộng khung hình để thấy trọn vẹn cán bộ & nhà vườn,
 *   khi bấm vào trượt ngăn chi tiết mượt từ cạnh phải màn hình.
 * - Danh mục thuốc BVTV & Khuyến cáo trình bày dạng dải thẻ hình vuông cuộn ngang tối giản.
 * - Chân trang 4 cột tối giản đồng trục với khoảng nghỉ thoáng mắt phía trên.
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

          {/* Hàng 1: Ảnh 2 cột trái | 1 ô nội dung Cột 3 | Khoảng thở trắng Cột 4 (Di động: Tạp chí chia đôi dọc ├) */}
          <div className="sw-grid sw-checker-row is-mob-spread">
            <div className="sw-media sw-col-1-2 is-pos-estate">
              <DwellSlideshow
                slides={MAP_SURVEY_SLIDES}
                mobileCollage={false}
                sizes="(max-width: 768px) 46vw, (max-width: 960px) 100vw, 50vw"
              />
            </div>
            <div className="sw-cell sw-col-3 sw-between">
              <span className="sw-micro">Bản đồ số</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Bản đồ vùng trồng</h3>
                <p className="sw-caption-meta">
                  <span>Bản đồ số + Định vị GPS</span>
                  <span>Krông Búk, Đắk Lắk</span>
                </p>
              </div>
              <MobileSpreadNote prose="Mỗi thửa vườn tại Krông Búk được đo vẽ ranh giới thực địa, cấp mã định danh riêng và quản lý tập trung trên bản đồ số." />
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </div>

          {/* Hàng 2: Khoảng thở trắng Cột 1 | 1 ô nội dung Cột 2 | Ảnh 2 cột phải (Di động: Ghép 3 ảnh sang trọng) */}
          <div className="sw-grid sw-checker-row">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2 sw-between">
              <span className="sw-micro">Nhật ký mùa vụ</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Chăm sóc & ra hoa</h3>
                <p className="sw-caption-meta">
                  <span>Lịch chăm bón · Ngày cách ly</span>
                  <span>Cảnh báo an toàn tự động</span>
                </p>
              </div>
            </div>
            <div className="sw-media sw-col-3-4 is-pos-blossom">
              <DwellSlideshow
                slides={BLOSSOM_CARE_SLIDES}
                staggerMs={350}
                sizes="(max-width: 768px) calc(100vw - 24px), (max-width: 960px) 100vw, 50vw"
              />
            </div>
          </div>

          {/* Hàng 3: Ảnh 2 cột trái | 1 ô nội dung Cột 3 | Khoảng thở trắng Cột 4 (Di động: Tạp chí chia đôi dọc ├) */}
          <div className="sw-grid sw-checker-row is-mob-spread">
            <div className="sw-media sw-col-1-2 is-pos-harvest">
              <DwellSlideshow
                slides={HARVEST_STANDARD_SLIDES}
                mobileCollage={false}
                sizes="(max-width: 768px) 46vw, (max-width: 960px) 100vw, 50vw"
              />
            </div>
            <div className="sw-cell sw-col-3 sw-between">
              <span className="sw-micro">Cổng hộ dân</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Thu hoạch đúng chuẩn</h3>
                <p className="sw-caption-meta">
                  <span>Độ chín + Ngày cách ly</span>
                  <span>Ngay trên điện thoại nhà vườn</span>
                </p>
              </div>
              <MobileSpreadNote prose="Chỉ cắt trái khi đủ tuổi chín tự nhiên và qua thời gian cách ly an toàn, tập kết trên bạt sạch kèm phiếu ghi mã thửa." />
            </div>
            <div className="sw-cell sw-col-4 sw-empty-cell" aria-hidden="true" />
          </div>

          {/* Hàng 4: 2 ô trắng Cột 1–2 | Ảnh vuông 1 cột Cột 3 | 1 ô nội dung Cột 4 (Di động: Ghép 3 ảnh sang trọng) */}
          <div className="sw-grid sw-checker-row">
            <div className="sw-cell sw-col-1 sw-empty-cell" aria-hidden="true" />
            <div className="sw-cell sw-col-2 sw-empty-cell" aria-hidden="true" />
            <div className="sw-media sw-col-3 is-pos-arils">
              <DwellSlideshow
                slides={LAB_PURITY_SLIDES}
                staggerMs={350}
                sizes="(max-width: 768px) calc(100vw - 24px), (max-width: 960px) 50vw, 25vw"
              />
            </div>
            <div className="sw-cell sw-col-4 sw-between">
              <span className="sw-micro">An toàn thực phẩm</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Kiểm nghiệm mẫu trái</h3>
                <p className="sw-caption-meta">
                  <span>Kiểm soát Cadimi · Không Vàng O</span>
                  <span>Đạt chuẩn an toàn xuất khẩu</span>
                </p>
              </div>
            </div>
          </div>

          {/* Hàng 5: Ảnh 2 cột trái | 1 ô nội dung Cột 3 | Khoảng thở trắng Cột 4 (Di động: Tạp chí chia đôi dọc ├) */}
          <div className="sw-grid sw-checker-row is-mob-spread">
            <div className="sw-media sw-col-1-2 is-pos-export">
              <DwellSlideshow
                slides={EXPORT_SELECT_SLIDES}
                mobileCollage={false}
                sizes="(max-width: 768px) 46vw, (max-width: 960px) 100vw, 50vw"
              />
            </div>
            <div className="sw-cell sw-col-3 sw-between">
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Tuyển chọn xuất khẩu</h3>
                <p className="sw-caption-meta">
                  <span>Đóng gói + Kiểm định lô</span>
                  <span>Xuất khẩu chính ngạch GACC</span>
                </p>
              </div>
              <MobileSpreadNote prose="Đồng bộ quy chuẩn từ nhà vườn đến cơ sở đóng gói được cấp mã số, lưu trữ trọn vẹn hồ sơ truy xuất khi xuất khẩu." />
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
            <div className="sw-bento-mob-rule" aria-hidden="true" />

            {/* Cột 1 xuyên 2 hàng: Ảnh cây sầu riêng thực tế lồng ghép ảnh bệ đá nghệ thuật */}
            <div className="sw-bento-tall-photo">
              <DwellSlideshow
                slides={PUC_VERTICAL_SLIDES}
                mobileCollage={false}
                staggerMs={0}
                sizes="(max-width: 768px) 46vw, (max-width: 960px) 50vw, 25vw"
              />
            </div>

            {/* Hàng 1 – Cột 2: Thông tin mã vùng ngắn gọn (Di động: Tạp chí chia đôi dọc ├) */}
            <div className="sw-cell sw-bento-top-info sw-between">
              <span className="sw-micro">Định danh PUC</span>
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Mã số vùng trồng</h3>
                <p className="sw-caption-meta">
                  <span>Hồ sơ vùng + Thửa vườn</span>
                  <span>Xã Cư Né, Krông Búk, Đắk Lắk</span>
                  <span>Định danh riêng từng nông hộ</span>
                </p>
              </div>
              <MobileSpreadNote prose="Vùng trồng xã Cư Né, huyện Krông Búk được chuẩn hóa canh tác trên đất đỏ bazan và gắn mã định danh riêng từng nông hộ." />
            </div>

            {/* Hàng 1 – Cột 3 & 4: Ảnh tem QR thực tế lồng ghép ảnh lô sầu riêng nghệ thuật */}
            <div className="sw-bento-wide-photo">
              <DwellSlideshow
                slides={QR_LOT_WIDE_SLIDES}
                staggerMs={650}
                sizes="(max-width: 768px) calc(100vw - 44px), (max-width: 960px) 100vw, 50vw"
              />
            </div>

            {/* Hàng 2 – Cột 2: Khoảng thở trắng tinh khiết */}
            <div className="sw-bento-bot-empty" aria-hidden="true" />

            {/* Hàng 2 – Cột 3: Thẩm định tại vườn */}
            <div className="sw-cell sw-bento-bot-col3">
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Cấp mã tại vườn</h3>
                <p className="sw-caption-meta">
                  <span>Đo đạc GPS · Hồ sơ thửa</span>
                  <span>Thẩm định giống & nhật ký</span>
                </p>
              </div>
            </div>

            {/* Hàng 2 – Cột 4: Dán tem QR xuất kho */}
            <div className="sw-cell sw-bento-bot-col4">
              <div className="sw-caption-block">
                <h3 className="sw-caption-title">Tem QR xuất kho</h3>
                <p className="sw-caption-meta">
                  <span>Kiểm định mẫu · Dán tem lô</span>
                  <span>Truy xuất rõ từng nông hộ</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 03. TẬP HUẤN THỰC ĐỊA (Khung hình mở rộng + Ngăn chi tiết trượt từ cạnh phải) ─── */}
        <TrainingGallery />

        {/* ─── 04. BẢN TIN NHÀ NÔNG (Khung hình mở rộng + Ngăn chi tiết trượt từ cạnh phải) ─── */}
        <News />

        {/* ─── 05. THUỐC BVTV & KHUYẾN CÁO (Dải thẻ vuông cuộn ngang tối giản) ─── */}
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

      <LandingFooter />
    </div>
  );
}
