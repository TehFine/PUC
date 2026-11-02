"use client";

import { useMemo, useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { PESTICIDE_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { FertilizerDto, PesticideDto, TrainingDto, VarietyDto } from "@/types/api";
import {
  Check,
  ChevronRight,
  Clock,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { Card, EmptyState, Sheet, StateBlock } from "./ui";

const keepTraining = (item: TrainingDto) => item;
const keepPesticide = (item: PesticideDto) => item;
const keepVariety = (item: VarietyDto) => item;

type View = "training" | "pesticides" | "fertilizers" | "varieties";
type StatusFilter = "all" | "allowed" | "restricted" | "banned";
type FertilizerFilter = "all" | "organic" | "npk" | "foliar" | "microbial" | "restricted";

function getRelativeScheduleNote(dateStr: string | null): string {
  if (!dateStr) return "";
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tgt = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((tgt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Ngày mai";
  if (diffDays > 1 && diffDays <= 7) return `Còn ${diffDays} ngày`;
  if (diffDays > 7 && diffDays <= 30) return `Còn ${Math.round(diffDays / 7)} tuần`;
  if (diffDays > 30) return "Sắp diễn ra";
  if (diffDays === -1) return "Hôm qua";
  if (diffDays < -1) return "Đã diễn ra";
  return "";
}

export function getTrainingKicker(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("vietgap")) return "Quy chuẩn VietGAP";
  if (lower.includes("gacc") || lower.includes("xuất khẩu")) return "Tiêu chuẩn GACC";
  if (lower.includes("sâu bệnh") || lower.includes("phòng trừ")) return "Kỹ thuật phòng trừ";
  if (lower.includes("phần mềm") || lower.includes("quản lý")) return "Chuyển đổi số PUC";
  if (lower.includes("tưới tiêu")) return "Kỹ thuật canh tác";
  if (lower.includes("hữu cơ")) return "Nông nghiệp hữu cơ";
  return "Lớp tập huấn";
}

const TRAINING_THEMES = [
  {
    badgeBg: "#f59e0b",
    badgeColor: "#ffffff",
    capsuleBg: "linear-gradient(180deg, #f59e0b 0%, #fbbf24 100%)",
    tagBg: "#fef3c7",
    tagColor: "#b45309",
    titleColor: "#92400e",
  },
  {
    badgeBg: "#f43f5e",
    badgeColor: "#ffffff",
    capsuleBg: "linear-gradient(180deg, #f43f5e 0%, #fb7185 100%)",
    tagBg: "#ffe4e6",
    tagColor: "#be123c",
    titleColor: "#9f1239",
  },
  {
    badgeBg: "#10b981",
    badgeColor: "#ffffff",
    capsuleBg: "linear-gradient(180deg, #10b981 0%, #34d399 100%)",
    tagBg: "#d1fae5",
    tagColor: "#047857",
    titleColor: "#065f46",
  },
  {
    badgeBg: "#3b82f6",
    badgeColor: "#ffffff",
    capsuleBg: "linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%)",
    tagBg: "#dbeafe",
    tagColor: "#1d4ed8",
    titleColor: "#1e40af",
  },
];

function getTrainingDetailedInfo(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("vietgap")) {
    return {
      summary: "Khóa tập huấn tiêu chuẩn canh tác VietGAP cho cây sầu riêng xuất khẩu, đảm bảo an toàn sinh học và truy xuất nguồn gốc.",
      modules: [
        {
          title: "Quy chuẩn đất đai, nguồn nước và vùng đệm an toàn",
          desc: "Đánh giá các chỉ tiêu kim loại nặng trong đất, vi sinh vật trong nước tưới và bảo vệ môi trường sinh thái vườn sầu riêng.",
        },
        {
          title: "Hướng dẫn lập và số hóa nhật ký canh tác PUC",
          desc: "Thực hành ghi nhận định kỳ 7 ngày/lần các công đoạn bón phân, tưới nước, bao trái và cắt tỉa cành trên điện thoại.",
        },
        {
          title: "Thực hành tuân thủ thời gian cách ly thuốc BVTV (PHI)",
          desc: "Kỹ thuật tính toán ngày thu hoạch an toàn sau lần phun thuốc cuối cùng, đảm bảo dư lượng đạt mức MRL cho phép.",
        },
      ],
      note: "Bà con vui lòng mang theo điện thoại thông minh và sổ ghi chép nhật ký canh tác của gia đình. Ban tổ chức HTX hỗ trợ tài liệu học tập và nước uống miễn phí.",
    };
  }
  if (lower.includes("gacc") || lower.includes("xuất khẩu") || lower.includes("trung quốc")) {
    return {
      summary: "Phổ biến các quy định nghiêm ngặt theo Lệnh 248, 249 của Tổng cục Hải quan Trung Quốc (GACC) đối với sầu riêng tươi xuất khẩu.",
      modules: [
        {
          title: "Kiểm soát 6 đối tượng kiểm dịch thực vật bắt buộc",
          desc: "Nhận diện và biện pháp triệt tiêu rệp sáp, mọt đục cành, ruồi đục quả trước khi đóng gói xuất khẩu.",
        },
        {
          title: "Dán tem điện tử truy xuất nguồn gốc niêm phong quả",
          desc: "Quy trình kích hoạt tem mã hóa PUC, kiểm tra tính toàn vẹn của mã QR khi container qua cửa khẩu thông quan.",
        },
        {
          title: "Chuẩn hóa hồ sơ vùng trồng và cơ sở đóng gói",
          desc: "Hoàn thiện biên bản thẩm định KCS, giấy kiểm nghiệm tồn dư Cadimi và chứng thư kiểm dịch thực vật hợp chuẩn.",
        },
      ],
      note: "Khóa học có giá trị pháp lý bắt buộc đối với tất cả các hộ đã đăng ký mã vùng trồng xuất khẩu sầu riêng chính ngạch sang thị trường Trung Quốc.",
    };
  }
  if (lower.includes("sâu bệnh") || lower.includes("phòng trừ")) {
    return {
      summary: "Kỹ thuật nhận biết sớm các bệnh hại nguy hiểm trên cây sầu riêng (Phytophthora, thán thư, mọt đục thân) và biện pháp sinh học phòng ngừa.",
      modules: [
        {
          title: "Nhận diện sớm nấm Phytophthora gây xì mủ thối thân",
          desc: "Phát hiện vết thâm vỏ, nứt thân ứa mủ vàng và kỹ thuật cạo quét thuốc gốc đồng xử lý triệt để mầm bệnh.",
        },
        {
          title: "Nguyên tắc luân phiên hoạt chất và thời gian cách ly",
          desc: "Tránh sâu rầy kháng thuốc, tuyệt đối không dùng hoạt chất cấm (Chlorpyrifos, Carbaryl, Vàng O) theo danh mục BVTV.",
        },
        {
          title: "Thực hành tại vườn mẫu mô hình nông hộ",
          desc: "Kỹ sư hướng dẫn tỉa cành tạo tán thông thoáng, khử trùng dụng cụ cắt tỉa và xử lý gốc mùa mưa.",
        },
      ],
      note: "Tập trung tại vườn mẫu Thôn 3 lúc 7:45 sáng. Bà con nên mặc trang phục làm vườn gọn gàng, ủng và nón lá để tiện di chuyển thực địa.",
    };
  }
  if (lower.includes("phần mềm") || lower.includes("quản lý") || lower.includes("hướng dẫn")) {
    return {
      summary: "Hướng dẫn chi tiết cách cài đặt, đăng nhập và sử dụng hệ thống số hóa nhật ký canh tác PUC Krông Búk trên điện thoại.",
      modules: [
        {
          title: "Cài đặt & đăng nhập tài khoản nông hộ",
          desc: "Kích hoạt tài khoản theo số điện thoại đã cấp mã, quản lý thông tin thửa đất và phân quyền thành viên trong hộ.",
        },
        {
          title: "Thao tác ghi nhật ký canh tác có đính kèm GPS",
          desc: "Cách nhập thông tin phun thuốc, bón phân, chụp ảnh hiện trường và gửi đề xuất cập nhật diện tích.",
        },
        {
          title: "Tra cứu lịch kiểm tra và kết quả kiểm nghiệm Lab",
          desc: "Nhận thông báo lịch thanh tra định kỳ, kết quả phân tích chỉ tiêu an toàn và danh mục thuốc BVTV được phép.",
        },
      ],
      note: "Bà con chuẩn bị điện thoại thông minh còn pin trên 50%, có kết nối 4G/Wifi. Đội ngũ kỹ sư CNTT sẽ hỗ trợ cài đặt tận tay cho từng bà con.",
    };
  }
  return {
    summary: "Chương trình tập huấn nâng cao năng lực canh tác, chất lượng nông sản và ứng dụng khoa học kỹ thuật cho nông dân HTX Krông Búk.",
    modules: [
      {
        title: "Tổng quan tiêu chuẩn kỹ thuật & quy định mới",
        desc: "Cập nhật các chính sách, quy chuẩn mới nhất của ngành nông nghiệp về canh tác và tiêu thụ sầu riêng.",
      },
      {
        title: "Hướng dẫn thực hành các kỹ thuật trọng tâm",
        desc: "Từng bước thao tác kỹ thuật chuẩn xác theo sổ tay khuyến nông của tỉnh Đắk Lắk.",
      },
      {
        title: "Hỏi đáp & trao đổi trực tiếp cùng chuyên gia",
        desc: "Giải đáp thắc mắc về sâu bệnh, dinh dưỡng cây trồng và thủ tục liên kết chuỗi giá trị.",
      },
    ],
    note: "Khóa tập huấn mở cửa tự do cho toàn thể thành viên HTX và bà con nông dân trong vùng trồng liên kết.",
  };
}

export function TrainingDetailModal({
  item,
  onClose,
}: {
  item: TrainingDto;
  onClose: () => void;
}) {
  const [registered, setRegistered] = useState(false);
  const enrolledCount = registered ? item.enrolled + 1 : item.enrolled;
  const percent = Math.min(100, Math.round((enrolledCount / (item.capacity || 1)) * 100));
  const remaining = Math.max(0, item.capacity - enrolledCount);
  const info = getTrainingDetailedInfo(item.title);

  return (
    <div className="pt-training-detail-body">
      {/* 1. Phần Hero đầu popup */}
      <div className="pt-training-hero">
        <div className="pt-training-hero-info">
          <div className="pt-training-hero-badges">
            <span className="pt-training-status-pill">
              {item.completed ? "Đã kết thúc" : "Đang mở đăng ký"}
            </span>
            <span className="pt-training-code-pill">Mã khóa: #TH-{item.id}</span>
          </div>
          <h3 className="pt-training-hero-title">{item.title}</h3>
          <p className="pt-training-hero-sub">{info.summary}</p>
        </div>
      </div>

      {/* 2. Thanh tiến trình sĩ số lớp */}
      <div className="pt-training-progress-box">
        <div className="pt-training-progress-head">
          <span className="pt-training-progress-label">
            Tình trạng ghi danh: <strong>{enrolledCount}/{item.capacity} học viên</strong>
          </span>
          <span className="pt-training-progress-percent">
            {percent}% lấp đầy ({remaining > 0 ? `Còn ${remaining} chỗ` : "Đã hết chỗ"})
          </span>
        </div>
        <div className="pt-training-progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="pt-training-progress-fill"
            style={{
              width: `${percent}%`,
              background: remaining === 0 ? "#ef4444" : "linear-gradient(90deg, #16a34a, #22c55e)",
            }}
          />
        </div>
      </div>

      {/* 3. Lưới thông tin trọng tâm (Thời gian, Địa điểm, Giảng viên, Chứng chỉ) */}
      <div className="pt-training-grid">
        <div className="pt-training-cell">
          <span className="pt-training-cell-label">
            Thời gian tổ chức
          </span>
          <span className="pt-training-cell-value pt-training-time-val">
            8:00 – 11:30 (Buổi sáng)
          </span>
          {item.heldOn && formatDate(item.heldOn) !== "—" && (
            <span className="pt-training-cell-sub">Ngày: {formatDate(item.heldOn)}</span>
          )}
        </div>

        <div className="pt-training-cell">
          <span className="pt-training-cell-label">
            Địa điểm tập trung
          </span>
          <span className="pt-training-cell-value">{item.location ?? "UBND xã Krông Búk"}</span>
          <span className="pt-training-cell-sub">Hội trường tập trung HTX</span>
        </div>

        <div className="pt-training-cell">
          <span className="pt-training-cell-label">
            Giảng viên phụ trách
          </span>
          <span className="pt-training-cell-value">{item.trainer ?? "Chuyên gia nông nghiệp"}</span>
          <span className="pt-training-cell-sub">Cán bộ chuyên môn Chi cục BVTV</span>
        </div>

        <div className="pt-training-cell">
          <span className="pt-training-cell-label">
            Quyền lợi chứng chỉ
          </span>
          <span className="pt-training-cell-value">Cấp chứng nhận VietGAP</span>
          <span className="pt-training-cell-sub">Phục vụ hồ sơ mã vùng trồng</span>
        </div>
      </div>

      {/* 4. Nội dung bài giảng & thực hành chi tiết */}
      <div className="pt-training-detail-section">
        <h4 className="pt-training-section-title">
          Chương trình đào tạo & nội dung thực hành
        </h4>
        <div className="pt-training-modules">
          {info.modules.map((mod, idx) => (
            <div key={idx} className="pt-training-module-item">
              <span className="pt-training-module-idx">{idx + 1}</span>
              <div className="pt-training-module-text">
                <strong>{mod.title}</strong>
                <p>{mod.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Lưu ý cho bà con nông hộ */}
      <div className="pt-training-alert-box">
        <strong>Lưu ý cho bà con xã viên:</strong>
        <p>{info.note}</p>
      </div>

      {/* 6. Hàng nút hành động theo đúng chuẩn phong cách mới */}
      <div className="pt-training-modal-actions">
        <button
          type="button"
          className="pt-btn pt-btn-ghost"
          onClick={onClose}
        >
          Đóng
        </button>
        {!item.completed && (
          <button
            type="button"
            className="pt-btn pt-btn-primary"
            onClick={() => setRegistered(true)}
            disabled={registered || remaining === 0}
          >
            {registered ? (
              <>
                <Check size={16} /> Đã đăng ký thành công
              </>
            ) : remaining === 0 ? (
              "Lớp đã đủ sĩ số"
            ) : (
              "Đăng ký tham gia ngay"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function TrainingList() {
  const { data, loading, error } = useResource<TrainingDto, TrainingDto>("training", keepTraining);
  const [selectedTraining, setSelectedTraining] = useState<TrainingDto | null>(null);
  const upcoming = data.filter((item) => !item.completed);
  const done = data.filter((item) => item.completed);

  return (
    <div className="pt-stack">
      {/* 1. LỚP TẬP HUẤN SẮP DIỄN RA: NẰM TRỰC TIẾP TRÊN BACKGROUND (KHÔNG CARD BAO NGOÀI), THEO STYLE LỊCH KIỂM TRA TRANG CHỦ */}
      <section className="pt-schedule-section pt-training-section" aria-labelledby="training-schedule-heading">
        <div className="pt-schedule-header">
          <h2 id="training-schedule-heading" className="pt-schedule-title">
            Lớp tập huấn sắp diễn ra
          </h2>
        </div>

        <StateBlock loading={loading} error={error} />
        {!loading && !error && upcoming.length === 0 && (
          <EmptyState icon="learn">Hiện chưa có lớp tập huấn nào sắp diễn ra.</EmptyState>
        )}

        {!loading && !error && upcoming.length > 0 && (
          <div className="pt-transit-timeline" role="list">
            {upcoming.map((item, idx, arr) => {
              const theme = TRAINING_THEMES[idx % TRAINING_THEMES.length];
              const isLast = idx === arr.length - 1;
              const rel = getRelativeScheduleNote(item.heldOn);
              const kicker = getTrainingKicker(item.title);
              const formattedDate = formatDate(item.heldOn);

              return (
                <div key={item.id} className="pt-transit-step">
                  <div className="pt-transit-segment">
                    {/* Cột Trục Timeline dải capsule dày + 2 chấm trắng nhỏ */}
                    <div className="pt-transit-track-col" aria-hidden="true">
                      <div
                        className="pt-transit-capsule"
                        style={{ background: theme.capsuleBg }}
                      >
                        <div className="pt-transit-dot" />
                        <div className="pt-transit-dot" />
                      </div>
                    </div>

                    {/* Khối nội dung thẻ thiết kế y như phần lịch kiểm tra (Image 1): chỉ có tiêu đề và thời gian */}
                    <div
                      className="pt-training-clean-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTraining(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedTraining(item);
                        }
                      }}
                      title="Bấm để xem chi tiết khóa tập huấn và đăng ký"
                    >
                      <div className="pt-timeline-content">
                        <span className="pt-timeline-kicker">{kicker}</span>
                        <h3 className="pt-timeline-title">{item.title}</h3>
                      </div>
                      <div className="pt-timeline-meta">
                        <span className="pt-timeline-date">{formattedDate}</span>
                        {rel && <span className="pt-timeline-rel">{rel.startsWith("(") ? rel : `(${rel})`}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Đoạn nối chuyển tiếp giữa 2 chặng (Dotted line với các dấu chấm mini chuẩn VietGAP) */}
                  {!isLast && (
                    <div className="pt-transit-transfer" aria-hidden="true">
                      <div className="pt-transit-transfer-track">
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. CÁC LỚP ĐÃ HOÀN THÀNH */}
      {done.length > 0 && (
        <Card title="Khóa tập huấn đã hoàn thành">
          <ul className="pt-list">
            {done.map((item) => (
              <li
                key={item.id}
                className="pt-row pt-training-done-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTraining(item)}
                title="Bấm để xem thông tin khóa đã học"
              >
                <div className="pt-row-main">
                  <strong>{item.title}</strong>
                  <span>
                    {item.location ? `${item.location} · ` : ""}
                    Giảng viên: {item.trainer ?? "—"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 3. POPUP CHI TIẾT KHÓA TẬP HUẤN */}
      {selectedTraining && (
        <Sheet
          title="Thông tin lớp tập huấn"
          onClose={() => setSelectedTraining(null)}
        >
          <TrainingDetailModal
            item={selectedTraining}
            onClose={() => setSelectedTraining(null)}
          />
        </Sheet>
      )}
    </div>
  );
}

export function getPesticideImage(item: { status: string; name?: string; id?: number }): string {
  if (item.status === "banned") return "/pesticides/red.png";
  if (item.status === "restricted") return "/pesticides/amber.png";
  const name = (item.name ?? "").toLowerCase();
  if (name.includes("buprofezin") || name.includes("imidacloprid")) {
    return "/pesticides/green.png";
  }
  return "/pesticides/blue.png";
}

export interface PesticideEfficacy {
  usage: string;
  targets: string[];
  stage?: string;
}

export function getPesticideEfficacy(item: PesticideDto): PesticideEfficacy {
  const name = (item.name || "").toLowerCase();
  const active = (item.activeIngredient || "").toLowerCase();

  if (active.includes("buprofezin") || name.includes("buprofezin")) {
    return {
      usage: "Ức chế lột xác, chống rầy đẻ trứng và kìm hãm quần thể chích hút nở rộ.",
      targets: ["Rầy phấn trắng", "Rệp sáp bông", "Rầy bông sầu riêng", "Rệp dính"],
      stage: "Phun khi rầy non mới nở, giai đoạn cây nhú đọt non hoặc mắt cua",
    };
  }
  if (active.includes("abamectin") || name.includes("abamectin")) {
    return {
      usage: "Trừ sâu sinh học phổ rộng, tác động vị độc & tiếp xúc, thấm sâu cực nhanh vào lá.",
      targets: ["Nhện đỏ", "Bọ trĩ hại hoa", "Sâu đục trái non", "Sâu vẽ bùa"],
      stage: "Phun sớm khi nhện bùng phát mùa khô hoặc phát hiện vết cắn sâu non",
    };
  }
  if (active.includes("imidacloprid") || name.includes("imidacloprid")) {
    return {
      usage: "Thuốc lưu dẫn nội hấp cực mạnh, hấp thu qua rễ và tán lá bảo vệ đọt non toàn diện.",
      targets: ["Rầy nhảy", "Bọ trĩ", "Rệp sáp đọt non", "Rầy chổng cánh"],
      stage: "Phun phòng ngừa khi cây bung đọt mới hoặc giai đoạn xả nhụy",
    };
  }
  if (active.includes("emamectin") || name.includes("emamectin")) {
    return {
      usage: "Thuốc sinh học diệt sâu miệng nhai kháng thuốc, độc tính thấp, đạt chuẩn xuất khẩu.",
      targets: ["Sâu đục quả", "Sâu đục cuống", "Sâu ăn bông", "Sâu lông"],
      stage: "Phun khi phát hiện sâu non hoặc thời điểm trái bằng quả trứng gà",
    };
  }
  if (active.includes("chlorpyrifos") || name.includes("chlorpyrifos")) {
    return {
      usage: "Tác động tiếp xúc và xông hơi mạnh (Kiểm soát đặc biệt / Chỉ dùng khi có dịch nặng).",
      targets: ["Rệp sáp rễ", "Tuyến trùng hại rễ", "Mối hại gốc sầu riêng"],
      stage: "Tưới vùng rễ khi dịch hại nặng; ngưng trước thu hoạch tối thiểu 21 ngày",
    };
  }
  if (active.includes("carbaryl") || name.includes("carbaryl") || item.status === "banned") {
    return {
      usage: "Hoạt chất độc hại đã bị cấm hoàn toàn theo Nghị định thư GACC và Bộ NN-PTNT.",
      targets: ["Chất cấm – Tuyệt đối không dùng cho sầu riêng"],
      stage: "Nghiêm cấm tuyệt đối ở mọi giai đoạn sinh trưởng của cây",
    };
  }

  return {
    usage: "Đặc trị sâu hại và côn trùng chích hút theo danh mục BVTV được phép sử dụng.",
    targets: ["Sâu đục thân", "Rầy chích hút", "Bọ trĩ", "Nhện đỏ"],
    stage: "Phun theo đúng hướng dẫn trên nhãn thuốc và đảm bảo thời gian cách ly PHI",
  };
}

export function PesticideDetailModal({
  item,
  onClose,
}: {
  item: PesticideDto;
  onClose: () => void;
}) {
  const status = PESTICIDE_STATUS[item.status];
  const isAllowed = item.status === "allowed";
  const isRestricted = item.status === "restricted";
  const isBanned = item.status === "banned";
  const imgSrc = getPesticideImage(item);
  const efficacy = getPesticideEfficacy(item);

  return (
    <div className="pt-pesticide-modal-body">
      {/* 1. Hình ảnh chai thuốc lớn, đứng trực tiếp trên nền không khung bao quanh */}
      <div className="pt-pesticide-showcase-wrap">
        <img
          src={imgSrc}
          alt={item.name}
          className="pt-pesticide-showcase-img"
        />
      </div>

      {/* 2. Thông tin đưa ra ngoài và đặt ở bên dưới khung */}
      <div className="pt-pesticide-header-info">
        <div className={`pt-pest-status-badge pt-pest-status-${item.status}`}>
          <span>{status.label}</span>
        </div>
        <h3 className="pt-pesticide-modal-title">{item.name}</h3>
        <p className="pt-pesticide-modal-mfg">
          Nhà sản xuất: <strong>{item.manufacturer ?? "Map Pacific / Cục BVTV"}</strong>
        </p>
      </div>

      {/* 3. Công dụng & Đối tượng phòng trừ (Cô đọng, súc tích) */}
      <div className="pt-pesticide-efficacy-card">
        <div className="pt-efficacy-row">
          <span className="pt-efficacy-label">Công dụng chính</span>
          <p className="pt-efficacy-desc">{efficacy.usage}</p>
        </div>

        <div className="pt-efficacy-row">
          <span className="pt-efficacy-label">Đối tượng phòng trừ & Bệnh hại</span>
          <div className="pt-efficacy-targets">
            {efficacy.targets.map((target) => (
              <span key={target} className="pt-efficacy-tag">
                {target}
              </span>
            ))}
          </div>
        </div>

        {efficacy.stage && (
          <div className="pt-efficacy-timing">
            <span>Thời điểm khuyến nghị:</span>
            <strong>{efficacy.stage}</strong>
          </div>
        )}
      </div>

      {/* 4. Lưới thông số kỹ thuật (Hoạt chất, Nồng độ, Cách ly PHI, MRL) */}
      <div className="pt-pesticide-modal-specs">
        <h4 className="pt-pesticide-modal-section-title">Thông số kỹ thuật & Tiêu chuẩn</h4>
        <div className="pt-pesticide-specs-grid">
          <div className="pt-pesticide-spec-card">
            <span className="pt-pesticide-spec-label">Hoạt chất chính</span>
            <strong className="pt-pesticide-spec-value">{item.activeIngredient}</strong>
            <span className="pt-pesticide-spec-hint">Hàm lượng: {item.concentration ?? "Đạt chuẩn đăng ký"}</span>
          </div>

          <div className="pt-pesticide-spec-card">
            <span className="pt-pesticide-spec-label">Thời gian cách ly (PHI)</span>
            <strong className="pt-pesticide-spec-value pt-spec-highlight">
              {item.isolationDays != null ? `${item.isolationDays} ngày` : "Không áp dụng"}
            </strong>
            <span className="pt-pesticide-spec-hint">Ngừng phun trước khi thu hoạch</span>
          </div>

          <div className="pt-pesticide-spec-card">
            <span className="pt-pesticide-spec-label">Mức dư lượng tối đa (MRL)</span>
            <strong className="pt-pesticide-spec-value">
              {item.mrlMgKg != null ? `${item.mrlMgKg} mg/kg` : "—"}
            </strong>
            <span className="pt-pesticide-spec-hint">Chuẩn VietGAP & Nghị định thư GACC</span>
          </div>

          <div className="pt-pesticide-spec-card">
            <span className="pt-pesticide-spec-label">Tình trạng kiểm soát</span>
            <strong className="pt-pesticide-spec-value">
              {isAllowed ? "Được phép sử dụng" : isRestricted ? "Kiểm soát đặc biệt" : "Cấm lưu hành"}
            </strong>
            <span className="pt-pesticide-spec-hint">Thông tư 10/2024/TT-BNNPTNT</span>
          </div>
        </div>
      </div>

      {/* 3. Cảnh báo & Hướng dẫn quy định chuyên môn */}
      <div className={`pt-pesticide-alert-box pt-pesticide-alert-${item.status}`}>
        <div className="pt-pesticide-alert-content">
          <strong>
            {isAllowed
              ? "Quy định canh tác an toàn sinh học VietGAP"
              : isRestricted
              ? "Cảnh báo kiểm soát dư lượng nghiêm ngặt"
              : "Cảnh báo đỏ: Nghiêm cấm tuyệt đối"}
          </strong>
          <p>
            {isAllowed
              ? "Thuốc nằm trong danh mục được phép sử dụng phòng trừ sâu rầy trên sầu riêng. Bà con cần tuân thủ đúng liều lượng khuyến cáo, ghi chép nhật ký phun và đảm bảo đủ thời gian cách ly trước ngày thu hoạch."
              : isRestricted
              ? "Hoạt chất có nguy cơ tồn dư kéo dài. Chỉ sử dụng khi dịch hại bùng phát mạnh và có sự đồng ý của cán bộ kỹ thuật HTX hoặc Chi cục Trồng trọt & BVTV."
              : "Hoạt chất Carbaryl đã bị Hải quan Trung Quốc (GACC) và Bộ Nông nghiệp & PTNT cấm hoàn toàn. Bất kỳ lô hàng nào phát hiện tồn dư sẽ bị tiêu hủy và đình chỉ mã vùng trồng."}
          </p>
        </div>
      </div>

      {/* 4. Quy tắc an toàn lao động & bảo vệ môi trường */}
      <div className="pt-pesticide-safety-tips">
        <h4 className="pt-pesticide-modal-section-title">Nguyên tắc an toàn & bảo vệ môi trường</h4>
        <ul className="pt-pesticide-safety-list">
          <li>Trang bị đầy đủ khẩu trang, kính chắn giọt bắn, găng tay và ủng bảo hộ khi pha chế và phun thuốc.</li>
          <li>Không phun ngược hướng gió, không phun vào những ngày nắng gắt trên 35°C hoặc khi trời sắp có mưa.</li>
          <li>Vỏ chai, bao bì sau khi dùng phải súc rửa 3 lần, thu gom về đúng bể chứa rác nguy hại của thôn/xã.</li>
        </ul>
      </div>

      {/* 5. Nút đóng popup */}
      <div className="pt-training-modal-actions">
        <button
          type="button"
          className="pt-btn pt-btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={onClose}
        >
          Đã hiểu & Đóng
        </button>
      </div>
    </div>
  );
}

function PesticideList() {
  const { data, loading, error } = useResource<PesticideDto, PesticideDto>("pesticides", keepPesticide);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedPesticide, setSelectedPesticide] = useState<PesticideDto | null>(null);

  const counts = useMemo(() => {
    return {
      all: data.length,
      allowed: data.filter((d) => d.status === "allowed").length,
      restricted: data.filter((d) => d.status === "restricted").length,
      banned: data.filter((d) => d.status === "banned").length,
    };
  }, [data]);

  const shown = useMemo(() => {
    return data.filter((item) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        `${item.name} ${item.activeIngredient} ${item.manufacturer ?? ""}`
          .toLowerCase()
          .includes(q);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [data, query, statusFilter]);

  return (
    <section className="pt-pest-section" aria-labelledby="pesticide-heading">
      <div className="pt-pest-header">
        <h2 id="pesticide-heading" className="pt-pest-title">
          Danh mục thuốc BVTV
        </h2>
      </div>

      <div className="pt-pest-wrap">
        {/* Hộp tìm kiếm */}
        <div className="pt-pest-search-box">
          <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
          <input
            className="pt-pest-search-input"
            type="search"
            placeholder="Tìm theo tên thuốc, hoạt chất hoặc hãng..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm kiếm thuốc bảo vệ thực vật"
          />
          {query && (
            <button
              type="button"
              className="pt-pest-search-clear"
              onClick={() => setQuery("")}
              aria-label="Xóa từ khóa tìm kiếm"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Thanh filter trạng thái */}
        <div className="pt-pest-filter-bar" role="tablist" aria-label="Lọc theo trạng thái thuốc">
          <button
            type="button"
            className={`pt-pest-filter-chip ${statusFilter === "all" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            Tất cả <span className="pt-pest-filter-count">{counts.all}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-allowed ${statusFilter === "allowed" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("allowed")}
          >
            Được phép <span className="pt-pest-filter-count">{counts.allowed}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-restricted ${statusFilter === "restricted" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("restricted")}
          >
            Hạn chế <span className="pt-pest-filter-count">{counts.restricted}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-banned ${statusFilter === "banned" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("banned")}
          >
            Bị cấm <span className="pt-pest-filter-count">{counts.banned}</span>
          </button>
        </div>

        <StateBlock loading={loading} error={error} />

        {/* Danh sách thẻ thuốc trực quan theo phong cách Ảnh 1 */}
        <div className="pt-pest-list">
          {shown.map((item) => {
            const imgSrc = getPesticideImage(item);

            return (
              <article
                key={item.id}
                className={`pt-pest-card pt-pest-card-${item.status}`}
                onClick={() => setSelectedPesticide(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedPesticide(item);
                  }
                }}
                title="Bấm để xem chi tiết thuốc BVTV"
              >
                {/* Bên trái: Ảnh của loại thuốc */}
                <div className="pt-pest-card-img-wrap">
                  <img
                    src={imgSrc}
                    alt={item.name}
                    className="pt-pest-card-img"
                    loading="lazy"
                  />
                </div>

                {/* Bên phải: Tên thuốc và thông tin */}
                <div className="pt-pest-card-content">
                  <h3 className="pt-pest-card-name">{item.name}</h3>

                  <p className="pt-pest-card-sub">
                    Hoạt chất: <strong>{item.activeIngredient}</strong>
                    {item.concentration ? ` (${item.concentration})` : ""}
                    {item.manufacturer ? ` · ${item.manufacturer}` : ""}
                  </p>

                  <div className="pt-pest-card-metric">
                    <Clock size={12} className="pt-pest-card-metric-icon" aria-hidden="true" />
                    <span>Cách ly: <strong>{item.isolationDays != null ? `${item.isolationDays} ngày` : "Không áp dụng"}</strong></span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!loading && !error && shown.length === 0 && (
          <EmptyState icon="search">Không tìm thấy thuốc phù hợp với tiêu chí lọc.</EmptyState>
        )}

        {/* Popup chi tiết về loại thuốc được chọn */}
        {selectedPesticide && (
          <Sheet
            title="Chi tiết thuốc BVTV"
            onClose={() => setSelectedPesticide(null)}
          >
            <PesticideDetailModal
              item={selectedPesticide}
              onClose={() => setSelectedPesticide(null)}
            />
          </Sheet>
        )}
      </div>
    </section>
  );
}

export const DEFAULT_FERTILIZERS: FertilizerDto[] = [
  {
    id: 1,
    name: "Hữu cơ Vi sinh Đất Mẹ 70% OM",
    category: "organic",
    formula: "Chất hữu cơ: 70% · Axit Humic: 12% · Nấm Trichoderma: 1×10⁶ CFU/g",
    manufacturer: "Công ty CP Nông Nghiệp Xanh Đất Mẹ",
    dosage: "5 – 10 kg/gốc/lần (Tùy tuổi cây)",
    applicationMethod: "Bón gốc theo mép tán lá",
    status: "encouraged",
    timing: "Sau thu hoạch & đầu mùa mưa",
    image: "/fertilizers/organic.png",
    description: "Phân bón hữu cơ vi sinh cao cấp chuyên dùng cho sầu riêng, cung cấp dinh dưỡng thiết yếu và tăng cường hệ vi sinh đất.",
  },
  {
    id: 2,
    name: "NPK 12-12-17+TE Gốc Sunfat (Bio-Agri)",
    category: "npk",
    formula: "Đạm (N): 12% · Lân (P₂O₅): 12% · Kali Sunfat (K₂SO₄): 17% · TE (Bo, Mg, Zn)",
    manufacturer: "Bio-Agri Systems International",
    dosage: "0.8 – 1.5 kg/cây/đợt nuôi trái",
    applicationMethod: "Rải đều quanh tán & tưới đẫm nước",
    status: "allowed",
    timing: "Giai đoạn nuôi trái non & thúc trái lớn",
    image: "/fertilizers/npk.png",
    description: "Dinh dưỡng khoáng cân đối 100% gốc Kali Sunfat không chứa Clo, giúp cơm vàng óng, dày cơm và đạt chuẩn xuất khẩu GACC.",
  },
  {
    id: 3,
    name: "Phân bón lá Canxi Bo Sữa Bo Amino Kẽm",
    category: "foliar",
    formula: "Canxi (CaO): 12% · Bo hữu hiệu: 35.000 ppm · Kẽm (Zn): 15.000 ppm · Amino Acid: 10%",
    manufacturer: "Agri-Green Nutrition Ltd.",
    dosage: "Pha 750ml cho 400 – 600 lít nước",
    applicationMethod: "Phun ướt đều 2 mặt lá & chùm hoa/trái",
    status: "allowed",
    timing: "Nhú mắt cua, trước xả nhụy & trái non 3-7 tuần",
    image: "/fertilizers/foliar.png",
    description: "Đặc trị rụng hoa, tăng tỷ lệ đậu trái, chống nứt gai, dai cuống và hỗ trợ trái lớn nhanh đồng đều.",
  },
  {
    id: 4,
    name: "Gói Axit Humic Đậm Đặc & Trichoderma (Duri-Root)",
    category: "microbial",
    formula: "Axit Humic: 85% · Axit Fulvic: 10% · Kali hữu hiệu: 10% · Trichoderma: 2×10⁹ CFU/g",
    manufacturer: "Duri-Root Bio Sciences",
    dosage: "1 kg pha 500 – 800 lít nước tưới gốc",
    applicationMethod: "Tưới vùng rễ tơ hoặc hòa qua hệ thống nhỏ giọt",
    status: "encouraged",
    timing: "Kích rễ đầu vụ & phục hồi sau đợt bệnh",
    image: "/fertilizers/humic.png",
    description: "Kích rễ phát triển cực mạnh, cải thiện độ phì nhiêu của đất và đối kháng nấm bệnh Phytophthora gây xì mủ.",
  },
  {
    id: 5,
    name: "NPK 20-20-15+TE Đầu Trâu Chuyên Đọt",
    category: "npk",
    formula: "Đạm (N): 20% · Lân (P₂O₅): 20% · Kali (K₂O): 15% · Vi lượng Bo, Kẽm, Đồng",
    manufacturer: "Công ty CP Phân bón Bình Điền",
    dosage: "0.5 – 1.0 kg/cây/đợt cơi đọt",
    applicationMethod: "Bón gốc khi đất ẩm sau cơn mưa",
    status: "allowed",
    timing: "Giai đoạn bung cơi đọt & cơi lá mới",
    image: "/fertilizers/npk.png",
    description: "Cung cấp đạm và lân cao giúp cơi đọt bung mập khỏe, phiến lá dày bóng, tăng diện tích quang hợp nuôi cây sung mãn.",
  },
  {
    id: 6,
    name: "Kali Clorua (KCl / Muối Ớt Đỏ) — Cảnh báo cấm",
    category: "restricted",
    formula: "Kali (K₂O): 60% · Hàm lượng Clo (Cl⁻): > 45%",
    manufacturer: "Nhập khẩu Belarus / Canada",
    dosage: "0 kg/cây (Tuyệt đối không dùng cho sầu riêng)",
    applicationMethod: "CẤM SỬ DỤNG CHO CÂY SẦU RIÊNG",
    status: "warning",
    timing: "Nghiêm cấm tuyệt đối ở mọi thời điểm",
    image: "/fertilizers/npk.png",
    description: "Hàm lượng Clo cực cao gây sượng múi, nhão cơm, cháy chóp lá và tích tụ muối hại đất; bị cấm trong tiêu chuẩn VietGAP sầu riêng.",
  },
];

export function getFertilizerImage(item: FertilizerDto): string {
  if (item.image) return item.image;
  if (item.category === "organic") return "/fertilizers/organic.png";
  if (item.category === "npk") return "/fertilizers/npk.png";
  if (item.category === "foliar") return "/fertilizers/foliar.png";
  if (item.category === "microbial") return "/fertilizers/humic.png";
  return "/fertilizers/npk.png";
}

export interface FertilizerEfficacy {
  usage: string;
  targets: string[];
  timing: string;
  dosageAdvice: string;
}

export function getFertilizerEfficacy(item: FertilizerDto): FertilizerEfficacy {
  const name = item.name.toLowerCase();
  const cat = item.category;

  if (cat === "organic" || name.includes("đất mẹ") || name.includes("hữu cơ")) {
    return {
      usage: "Cải tạo đất tơi xốp, kích hoạt vi sinh vật bản địa có lợi và tái tạo mạng lưới rễ tơ sau vụ thu hoạch.",
      targets: ["Phục hồi sau thu hoạch", "Tái tạo rễ tơ", "Đất tơi xốp phì nhiêu", "Kháng nấm hại rễ", "VietGAP khuyến khích"],
      timing: "Bón vào đầu mùa mưa hoặc ngay sau khi dọn vườn sau thu hoạch",
      dosageAdvice: "5 – 10 kg/gốc rải đều theo mép tán lá, xới nhẹ lấp đất và tưới đủ ẩm.",
    };
  }

  if (name.includes("canxi bo") || cat === "foliar") {
    return {
      usage: "Chống rụng hoa và trái non, tăng sức sống hạt phấn, dẻo dai cuống trái và ngăn ngừa nứt gai, thối đít trái.",
      targets: ["Chống rụng hoa sinh lý", "Tăng đậu trái chùm", "Dai cuống dẻo trái", "Chống nứt gai, teo trái", "Dưỡng lá xanh dày"],
      timing: "Giai đoạn nhú mắt cua, trước và sau khi xả nhụy, trái non 3-7 tuần tuổi",
      dosageAdvice: "Pha 750ml với 400 – 600 lít nước, phun sương ướt đều tán lá và chùm bông/trái.",
    };
  }

  if (cat === "microbial" || name.includes("humic") || name.includes("trichoderma")) {
    return {
      usage: "Kích thích ra rễ cực mạnh, giải độc phèn đất, ức chế nấm Phytophthora và Fusarium gây thối rễ xì mủ.",
      targets: ["Kích rễ tơ bung đọt", "Giải độc phèn & hữu cơ", "Đối kháng nấm xì mủ", "Hạ phèn cân bằng pH đất"],
      timing: "Đầu mùa mưa, khi cây nhú đọt non hoặc khi phục hồi cây suy kiệt",
      dosageAdvice: "Hòa 1 kg vào 500 – 800 lít nước, tưới 10 – 15 lít dung dịch quanh gốc vùng rễ tơ.",
    };
  }

  if (name.includes("12-12-17") || (cat === "npk" && name.includes("sunfat"))) {
    return {
      usage: "Cung cấp dinh dưỡng đa lượng cân đối 100% gốc Sunfat (SOP không Clo), nuôi múi vàng óng, ráo cơm và nâng độ ngọt Brix.",
      targets: ["Nuôi trái non 40-80 ngày", "Cơm vàng óng dày múi", "Tăng độ ngọt Brix", "Không sượng cơm (Gốc SOP)", "Chuẩn GACC xuất khẩu"],
      timing: "Giai đoạn trái lớn nhanh đến trước thu hoạch 20 ngày",
      dosageAdvice: "0.8 – 1.5 kg/cây chia làm 2-3 lần bón rải đều quanh tán, tưới ẩm ngay sau bón.",
    };
  }

  if (cat === "restricted" || item.status === "warning" || name.includes("clorua") || name.includes("kcl")) {
    return {
      usage: "CẢNH BÁO NGUY HIỂM: Ion Clo (Cl⁻) làm tích nước tế bào múi gây sượng cơm hoàn toàn, cháy rìa lá và chai cứng đất.",
      targets: ["Cảnh báo sượng múi cực nặng", "Cháy chóp lá, rụng lá", "GACC từ chối thông quan", "Nghiêm cấm trên sầu riêng"],
      timing: "CẤM SỬ DỤNG trong toàn bộ chu kỳ sinh trưởng của sầu riêng",
      dosageAdvice: "TUYỆT ĐỐI KHÔNG DÙNG. Thay thế bằng Kali Sunfat (K₂SO₄) hoặc phân bón lá hữu cơ.",
    };
  }

  return {
    usage: "Thúc cây bung cơi đọt mập khỏe đồng loạt, lá xanh bóng dồi dào diệp lục, tích lũy dinh dưỡng nuôi thân cành sung mãn.",
    targets: ["Nuôi cơi đọt sung mãn", "Phiến lá to xanh dày", "Phát triển cành cấp 1-2", "Chuẩn bị lực làm bông"],
    timing: "Đầu mỗi đợt cơi đọt mới hoặc sau khi tỉa cành tạo tán",
    dosageAdvice: "Bón 0.5 – 1.0 kg/cây khi đất có độ ẩm tốt, bón theo mép tán lá.",
  };
}

export function FertilizerDetailModal({
  item,
  onClose,
}: {
  item: FertilizerDto;
  onClose: () => void;
}) {
  const imgSrc = getFertilizerImage(item);
  const efficacy = getFertilizerEfficacy(item);
  const isEncouraged = item.status === "encouraged";
  const isWarning = item.status === "warning";

  return (
    <div className="pt-pesticide-modal-body">
      {/* 1. Ảnh bao bì / chai phân bón cắt nền nằm trực tiếp trên nền modal */}
      <div className="pt-pesticide-showcase-wrap">
        <img
          src={imgSrc}
          alt={item.name}
          className="pt-pesticide-showcase-img"
        />
      </div>

      {/* 2. Tiêu đề, phân loại & trạng thái */}
      <div className="pt-pesticide-header-info">
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          <span className={`pt-fert-status-badge pt-fert-status-${item.status}`}>
            {isEncouraged ? "Khuyến khích VietGAP" : isWarning ? "Cảnh báo: Không sử dụng" : "Được phép sử dụng"}
          </span>
          <span className="pt-training-code-pill">
            {item.category === "organic"
              ? "Hữu cơ vi sinh"
              : item.category === "npk"
              ? "Khoáng NPK cao cấp"
              : item.category === "foliar"
              ? "Trung vi lượng qua lá"
              : item.category === "microbial"
              ? "Vi sinh & Rễ"
              : "Kiểm soát đặc biệt"}
          </span>
        </div>
        <h3 className="pt-pesticide-modal-title">{item.name}</h3>
        <p className="pt-pesticide-modal-mfg">Nhà sản xuất: {item.manufacturer}</p>
      </div>

      {/* 3. Công dụng & Giai đoạn áp dụng (Cô đọng, súc tích) */}
      <div className="pt-pesticide-efficacy-card">
        <div className="pt-efficacy-row">
          <span className="pt-efficacy-label">Công dụng chính</span>
          <p className="pt-efficacy-desc">{efficacy.usage}</p>
        </div>

        <div className="pt-efficacy-row">
          <span className="pt-efficacy-label">Giai đoạn cây trồng & Hiệu quả trọng tâm</span>
          <div className="pt-efficacy-targets">
            {efficacy.targets.map((target) => (
              <span key={target} className="pt-efficacy-tag">
                {target}
              </span>
            ))}
          </div>
        </div>

        <div className="pt-efficacy-timing">
          <span>Thời điểm bón khuyến nghị:</span>
          <strong>{efficacy.timing}</strong>
        </div>

        <div className="pt-efficacy-timing">
          <span>Liều lượng khuyến cáo:</span>
          <strong style={{ color: "#2563eb" }}>{efficacy.dosageAdvice}</strong>
        </div>
      </div>

      {/* 4. Lưới thông số kỹ thuật & Tiêu chuẩn */}
      <div className="pt-pesticide-modal-specs">
        <h4 className="pt-pesticide-modal-section-title">Thông số kỹ thuật & Tiêu chuẩn</h4>
        <div className="pt-pesticide-specs-grid">
          <div className="pt-pesticide-spec-card">
            <span className="pt-pesticide-spec-label">Thành phần / Công thức</span>
            <strong className="pt-pesticide-spec-value">{item.formula}</strong>
            <span className="pt-pesticide-spec-hint">Hàm lượng dinh dưỡng đăng ký</span>
          </div>

          <div className="pt-pesticide-spec-card">
            <span className="pt-pesticide-spec-label">Phương thức bón</span>
            <strong className="pt-pesticide-spec-value pt-spec-highlight">
              {item.applicationMethod}
            </strong>
            <span className="pt-pesticide-spec-hint">Bón theo hình chiếu mép tán</span>
          </div>

          <div className="pt-pesticide-spec-card">
            <span className="pt-pesticide-spec-label">Định mức sử dụng</span>
            <strong className="pt-pesticide-spec-value">
              {item.dosage}
            </strong>
            <span className="pt-pesticide-spec-hint">Chuẩn VietGAP Krông Búk</span>
          </div>

          <div className="pt-pesticide-spec-card">
            <span className="pt-pesticide-spec-label">Tiêu chuẩn áp dụng</span>
            <strong className="pt-pesticide-spec-value">
              {isEncouraged ? "VietGAP & Hữu cơ GACC" : isWarning ? "Nghiêm cấm theo GACC" : "QCVN 01-189:2019/BNNPTNT"}
            </strong>
            <span className="pt-pesticide-spec-hint">Bộ Nông nghiệp & PTNT</span>
          </div>
        </div>
      </div>

      {/* 5. Cảnh báo & Lưu ý canh tác */}
      <div className={`pt-pesticide-alert-box pt-pesticide-alert-${isWarning ? "banned" : isEncouraged ? "allowed" : "restricted"}`}>
        <div className="pt-pesticide-alert-content">
          <strong>
            {isWarning
              ? "Cảnh báo đỏ: Nghiêm cấm bón phân chứa Clo trên sầu riêng"
              : isEncouraged
              ? "Khuyến khích canh tác hữu cơ bền vững VietGAP"
              : "Quy chuẩn bón phân cân đối & Quản lý dinh dưỡng"}
          </strong>
          <p>
            {isWarning
              ? "Phân Kali đỏ (KCl) chứa hàm lượng ion Clorua trên 45% làm tế bào cơm sầu riêng ngậm nước, gây hiện tượng sượng cơm, nhão thịt và làm chua đất. Toàn bộ sầu riêng phục vụ xuất khẩu bắt buộc phải dùng Kali Sunfat (K2SO4)."
              : isEncouraged
              ? "Khuyến khích tăng cường bón phân hữu cơ vi sinh và Axit Humic hàng năm giúp đất tơi xốp, kích thích giun đất và vi sinh vật đối kháng tự nhiên bảo vệ bộ rễ sầu riêng bền lực qua nhiều mùa vụ."
              : "Bón phân đúng thời điểm sinh trưởng của cây, kết hợp tưới đủ ẩm. Bắt buộc ghi chép ngày bón, tên phân và khối lượng vào Cổng nhật ký điện tử PUC Krông Búk."}
          </p>
        </div>
      </div>

      {/* 6. Nguyên tắc an toàn & bảo vệ môi trường */}
      <div className="pt-pesticide-safety-tips">
        <h4 className="pt-pesticide-modal-section-title">Nguyên tắc canh tác an toàn sinh học</h4>
        <ul className="pt-pesticide-safety-list">
          <li>Phân chuồng bón cho sầu riêng bắt buộc phải được ủ hoai mục bằng nấm Trichoderma tối thiểu 45 ngày.</li>
          <li>Không bón phân hóa học sát gốc cây; rải phân theo mép tán nơi có nhiều đầu rễ tơ hút dinh dưỡng nhất.</li>
          <li>Sau khi bón phân hạt cần tưới nước nhẹ để phân tan dần, tránh bón vào lúc trời nắng gắt làm bốc hơi đạm.</li>
        </ul>
      </div>

      {/* 7. Nút đóng popup */}
      <div className="pt-training-modal-actions">
        <button
          type="button"
          className="pt-btn pt-btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={onClose}
        >
          Đã hiểu & Đóng
        </button>
      </div>
    </div>
  );
}

function FertilizerList() {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<FertilizerFilter>("all");
  const [selectedFertilizer, setSelectedFertilizer] = useState<FertilizerDto | null>(null);

  const counts = useMemo(() => {
    return {
      all: DEFAULT_FERTILIZERS.length,
      organic: DEFAULT_FERTILIZERS.filter((d) => d.category === "organic").length,
      npk: DEFAULT_FERTILIZERS.filter((d) => d.category === "npk").length,
      foliar: DEFAULT_FERTILIZERS.filter((d) => d.category === "foliar").length,
      microbial: DEFAULT_FERTILIZERS.filter((d) => d.category === "microbial").length,
      restricted: DEFAULT_FERTILIZERS.filter((d) => d.category === "restricted").length,
    };
  }, []);

  const shown = useMemo(() => {
    return DEFAULT_FERTILIZERS.filter((item) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        `${item.name} ${item.formula} ${item.manufacturer} ${item.applicationMethod}`
          .toLowerCase()
          .includes(q);
      const matchesCategory =
        categoryFilter === "all" || item.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [query, categoryFilter]);

  return (
    <section className="pt-pest-section" aria-labelledby="fertilizer-heading">
      <div className="pt-pest-header">
        <h2 id="fertilizer-heading" className="pt-pest-title">
          Danh mục phân bón chuẩn VietGAP
        </h2>
      </div>

      <div className="pt-pest-wrap">
        {/* Hộp tìm kiếm */}
        <div className="pt-pest-search-box">
          <Search size={16} className="pt-pest-search-icon" aria-hidden="true" />
          <input
            className="pt-pest-search-input"
            type="search"
            placeholder="Tìm theo tên phân bón, thành phần dinh dưỡng hoặc hãng..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm kiếm phân bón"
          />
          {query && (
            <button
              type="button"
              className="pt-pest-search-clear"
              onClick={() => setQuery("")}
              aria-label="Xóa từ khóa tìm kiếm"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Thanh filter phân loại phân bón */}
        <div className="pt-pest-filter-bar" role="tablist" aria-label="Lọc theo phân loại phân bón">
          <button
            type="button"
            className={`pt-pest-filter-chip ${categoryFilter === "all" ? "is-active" : ""}`}
            onClick={() => setCategoryFilter("all")}
          >
            Tất cả <span className="pt-pest-filter-count">{counts.all}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-organic ${categoryFilter === "organic" ? "is-active" : ""}`}
            onClick={() => setCategoryFilter("organic")}
          >
            Hữu cơ vi sinh <span className="pt-pest-filter-count">{counts.organic}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-npk ${categoryFilter === "npk" ? "is-active" : ""}`}
            onClick={() => setCategoryFilter("npk")}
          >
            NPK đa lượng <span className="pt-pest-filter-count">{counts.npk}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-foliar ${categoryFilter === "foliar" ? "is-active" : ""}`}
            onClick={() => setCategoryFilter("foliar")}
          >
            Trung vi lượng <span className="pt-pest-filter-count">{counts.foliar}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-organic ${categoryFilter === "microbial" ? "is-active" : ""}`}
            onClick={() => setCategoryFilter("microbial")}
          >
            Cải tạo đất & Rễ <span className="pt-pest-filter-count">{counts.microbial}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-warning ${categoryFilter === "restricted" ? "is-active" : ""}`}
            onClick={() => setCategoryFilter("restricted")}
          >
            Kiểm soát Clo <span className="pt-pest-filter-count">{counts.restricted}</span>
          </button>
        </div>

        {/* Danh sách thẻ phân bón trực quan giống hệt thuốc BVTV */}
        <div className="pt-pest-list">
          {shown.map((item) => {
            const imgSrc = getFertilizerImage(item);
            const isEncouraged = item.status === "encouraged";
            const isWarning = item.status === "warning";

            return (
              <article
                key={item.id}
                className={`pt-pest-card pt-pest-card-${item.status}`}
                onClick={() => setSelectedFertilizer(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedFertilizer(item);
                  }
                }}
                title="Bấm để xem chi tiết phân bón"
              >
                {/* Bên trái: Ảnh của bao/chai phân bón */}
                <div className="pt-pest-card-img-wrap">
                  <img
                    src={imgSrc}
                    alt={item.name}
                    className="pt-pest-card-img"
                    loading="lazy"
                  />
                </div>

                {/* Bên phải: Tên phân bón và thông tin */}
                <div className="pt-pest-card-content">
                  <div className="pt-pest-card-top-row">
                    <h3 className="pt-pest-card-name">{item.name}</h3>
                    <span className={`pt-pest-mini-status ${isEncouraged ? "pt-pest-status-allowed" : isWarning ? "pt-pest-status-banned" : "pt-pest-status-restricted"}`}>
                      {isEncouraged ? "VietGAP" : isWarning ? "Cảnh báo" : "Được phép"}
                    </span>
                  </div>

                  <p className="pt-pest-card-sub">
                    Thành phần: <strong>{item.formula}</strong>
                    {item.manufacturer ? ` · ${item.manufacturer}` : ""}
                  </p>

                  <div className="pt-pest-card-metric">
                    <Clock size={12} className="pt-pest-card-metric-icon" aria-hidden="true" />
                    <span>Thời điểm: <strong>{item.timing}</strong></span>
                    <span style={{ margin: "0 4px", color: "#cbd5e1" }}>•</span>
                    <span>Cách bón: <strong>{item.applicationMethod}</strong></span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {shown.length === 0 && (
          <EmptyState icon="search">Không tìm thấy phân bón phù hợp với tiêu chí lọc.</EmptyState>
        )}

        {/* Popup chi tiết về loại phân bón được chọn */}
        {selectedFertilizer && (
          <Sheet
            title="Chi tiết phân bón"
            onClose={() => setSelectedFertilizer(null)}
          >
            <FertilizerDetailModal
              item={selectedFertilizer}
              onClose={() => setSelectedFertilizer(null)}
            />
          </Sheet>
        )}
      </div>
    </section>
  );
}

function VarietyList() {
  const { data, loading, error } = useResource<VarietyDto, VarietyDto>("varieties", keepVariety);
  return (
    <section className="pt-variety-section" aria-labelledby="variety-heading">
      <div className="pt-variety-header">
        <h2 id="variety-heading" className="pt-variety-title">
          Giống sầu riêng
        </h2>
      </div>
      <StateBlock loading={loading} error={error} />
      <div className="pt-pest-list">
        {data.map((item) => (
          <article key={item.id} className="pt-variety-card">
            <div className="pt-variety-head">
              <h3 className="pt-variety-name">{item.name}</h3>
              {item.origin && (
                <span className="pt-variety-origin">
                  <MapPin size={11} /> {item.origin}
                </span>
              )}
            </div>
            <div className="pt-variety-specs">
              {item.weightRange && (
                <div className="pt-variety-spec">
                  <span>Trọng lượng:</span> <strong>{item.weightRange}</strong>
                </div>
              )}
              {item.harvestYears && (
                <div className="pt-variety-spec">
                  <span>Thu hoạch sau:</span> <strong>{item.harvestYears}</strong>
                </div>
              )}
            </div>
            {item.description && <p className="pt-variety-desc">{item.description}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function LearnTab() {
  const [view, setView] = useState<View>("training");
  const items: { id: View; label: string }[] = [
    { id: "training", label: "Tập huấn" },
    { id: "pesticides", label: "Thuốc BVTV" },
    { id: "fertilizers", label: "Phân bón" },
    { id: "varieties", label: "Giống cây" },
  ];

  return (
    <div className="pt-stack">
      <div className="pt-segmented" role="tablist" aria-label="Kiến thức">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {view === "training" && <TrainingList />}
      {view === "pesticides" && <PesticideList />}
      {view === "fertilizers" && <FertilizerList />}
      {view === "varieties" && <VarietyList />}
    </div>
  );
}
