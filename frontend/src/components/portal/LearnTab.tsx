"use client";

import { useMemo, useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { PESTICIDE_STATUS } from "@/lib/portal-labels";
import { formatDate } from "@/utils/format";
import type { PesticideDto, TrainingDto, VarietyDto } from "@/types/api";
import {
  AlertTriangle,
  Ban,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  GraduationCap,
  MapPin,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Card, EmptyState, Pill, Sheet, StateBlock } from "./ui";

const keepTraining = (item: TrainingDto) => item;
const keepPesticide = (item: PesticideDto) => item;
const keepVariety = (item: VarietyDto) => item;

type View = "training" | "pesticides" | "varieties";
type StatusFilter = "all" | "allowed" | "restricted" | "banned";

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
        <div className="pt-training-hero-icon" aria-hidden="true">
          <GraduationCap size={28} />
        </div>
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
            <Users size={14} style={{ display: "inline", marginRight: 5 }} />
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
            <Calendar size={13} style={{ display: "inline", marginRight: 4 }} />
            Thời gian tổ chức
          </span>
          <span className="pt-training-cell-value">{formatDate(item.heldOn)}</span>
          <span className="pt-training-cell-sub">8:00 – 11:30 (Buổi sáng)</span>
        </div>

        <div className="pt-training-cell">
          <span className="pt-training-cell-label">
            <MapPin size={13} style={{ display: "inline", marginRight: 4 }} />
            Địa điểm tập trung
          </span>
          <span className="pt-training-cell-value">{item.location ?? "UBND xã Krông Búk"}</span>
          <span className="pt-training-cell-sub">Hội trường tập trung HTX</span>
        </div>

        <div className="pt-training-cell">
          <span className="pt-training-cell-label">
            <UserCheck size={13} style={{ display: "inline", marginRight: 4 }} />
            Giảng viên phụ trách
          </span>
          <span className="pt-training-cell-value">{item.trainer ?? "Chuyên gia nông nghiệp"}</span>
          <span className="pt-training-cell-sub">Cán bộ chuyên môn Chi cục BVTV</span>
        </div>

        <div className="pt-training-cell">
          <span className="pt-training-cell-label">
            <ShieldCheck size={13} style={{ display: "inline", marginRight: 4 }} />
            Quyền lợi chứng chỉ
          </span>
          <span className="pt-training-cell-value">Cấp chứng nhận VietGAP</span>
          <span className="pt-training-cell-sub">Phục vụ hồ sơ mã vùng trồng</span>
        </div>
      </div>

      {/* 4. Nội dung bài giảng & thực hành chi tiết */}
      <div className="pt-training-detail-section">
        <h4 className="pt-training-section-title">
          <BookOpen size={15} style={{ display: "inline", marginRight: 6 }} />
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

                  {/* Đoạn nối chuyển tiếp giữa 2 chặng (Dotted line với các dấu chấm bình thường) */}
                  {!isLast && (
                    <div className="pt-transit-transfer" aria-hidden="true">
                      <div className="pt-transit-transfer-track">
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                        <div className="pt-transit-mini-dot" />
                      </div>
                      <div className="pt-transit-transfer-text">
                        <span>Khóa đào tạo kế tiếp</span>
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
                <Pill tone="gray">Đã diễn ra</Pill>
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

function PesticideList() {
  const { data, loading, error } = useResource<PesticideDto, PesticideDto>("pesticides", keepPesticide);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
    <Card
      title="Danh mục thuốc BVTV"
      action={
        <span className="pt-badge-alert" style={{ background: "rgba(22, 163, 74, 0.12)", color: "#15803d" }}>
          {shown.length} loại
        </span>
      }
    >
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
            <CheckCircle2 size={13} aria-hidden="true" />
            Được phép <span className="pt-pest-filter-count">{counts.allowed}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-restricted ${statusFilter === "restricted" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("restricted")}
          >
            <AlertTriangle size={13} aria-hidden="true" />
            Hạn chế <span className="pt-pest-filter-count">{counts.restricted}</span>
          </button>
          <button
            type="button"
            className={`pt-pest-filter-chip is-banned ${statusFilter === "banned" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("banned")}
          >
            <Ban size={13} aria-hidden="true" />
            Bị cấm <span className="pt-pest-filter-count">{counts.banned}</span>
          </button>
        </div>

        {/* Dòng trạng thái lọc */}
        {(statusFilter !== "all" || query.trim()) && (
          <div className="pt-pest-summary-bar">
            <span>
              Đang hiển thị <strong>{shown.length}</strong> / {data.length} loại thuốc
            </span>
            <button
              type="button"
              className="pt-pest-reset-btn"
              onClick={() => {
                setStatusFilter("all");
                setQuery("");
              }}
            >
              Đặt lại bộ lọc
            </button>
          </div>
        )}

        <StateBlock loading={loading} error={error} />

        {/* Danh sách thẻ thuốc trực quan */}
        <div className="pt-pest-list">
          {shown.map((item) => {
            const status = PESTICIDE_STATUS[item.status];
            const isAllowed = item.status === "allowed";
            const isRestricted = item.status === "restricted";
            const isBanned = item.status === "banned";

            return (
              <article key={item.id} className={`pt-pest-card pt-pest-card-${item.status}`}>
                {/* Phần trên: Tên thương phẩm + Huy hiệu trạng thái */}
                <div className="pt-pest-card-top">
                  <div className="pt-pest-card-identity">
                    <h3 className="pt-pest-card-name">{item.name}</h3>
                    <div className="pt-pest-card-ing-wrap">
                      <span className="pt-pest-card-ing-label">Hoạt chất:</span>
                      <strong className="pt-pest-card-ing-val">{item.activeIngredient}</strong>
                      {item.concentration && <span className="pt-pest-card-conc">{item.concentration}</span>}
                      {item.manufacturer && <span className="pt-pest-card-mfg">· {item.manufacturer}</span>}
                    </div>
                  </div>

                  <div className={`pt-pest-status-badge pt-pest-status-${item.status}`}>
                    {isAllowed && <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden="true" />}
                    {isRestricted && <AlertTriangle size={13} strokeWidth={2.4} aria-hidden="true" />}
                    {isBanned && <Ban size={13} strokeWidth={2.4} aria-hidden="true" />}
                    <span>{status.label}</span>
                  </div>
                </div>

                {/* Phần dưới: Lưới 2 ô thông số kỹ thuật (Cách ly & MRL) */}
                <div className="pt-pest-specs-grid">
                  <div className="pt-pest-spec-box">
                    <div className="pt-pest-spec-head">
                      <Clock size={12} className="pt-pest-spec-icon" aria-hidden="true" />
                      <span>Thời gian cách ly</span>
                    </div>
                    <div className="pt-pest-spec-body">
                      {item.isolationDays != null ? (
                        <div className="pt-pest-spec-metric">
                          <span className="pt-pest-spec-val">{item.isolationDays}</span>
                          <span className="pt-pest-spec-unit">ngày</span>
                        </div>
                      ) : (
                        <span className="pt-pest-spec-empty">Không áp dụng</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-pest-spec-box">
                    <div className="pt-pest-spec-head">
                      <ShieldCheck size={12} className="pt-pest-spec-icon" aria-hidden="true" />
                      <span>Dư lượng tối đa (MRL)</span>
                    </div>
                    <div className="pt-pest-spec-body">
                      {item.mrlMgKg != null ? (
                        <div className="pt-pest-spec-metric">
                          <span className="pt-pest-spec-val">{item.mrlMgKg}</span>
                          <span className="pt-pest-spec-unit">mg/kg</span>
                        </div>
                      ) : (
                        <span className="pt-pest-spec-empty">Không áp dụng</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!loading && !error && shown.length === 0 && (
          <EmptyState icon="search">Không tìm thấy thuốc phù hợp với tiêu chí lọc.</EmptyState>
        )}
      </div>
    </Card>
  );
}

function VarietyList() {
  const { data, loading, error } = useResource<VarietyDto, VarietyDto>("varieties", keepVariety);
  return (
    <Card title="Giống sầu riêng">
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
    </Card>
  );
}

export default function LearnTab() {
  const [view, setView] = useState<View>("training");
  const items: { id: View; label: string }[] = [
    { id: "training", label: "Tập huấn" },
    { id: "pesticides", label: "Thuốc BVTV" },
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
      {view === "varieties" && <VarietyList />}
    </div>
  );
}
