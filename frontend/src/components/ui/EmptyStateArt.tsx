"use client";

import { isValidElement, useId, type ReactElement, type ReactNode } from "react";

export type EmptyArtVariant =
  | "box"
  | "notify"
  | "folder"
  | "envelope"
  | "tickets"
  | "journal"
  | "clipboard"
  | "vault"
  | "cards";

export function extractPlainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractPlainText).join(" ");
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return extractPlainText(el.props.children);
  }
  return "";
}

/**
 * Tự động chọn đúng hình minh họa 3D tông xám-trắng tối giản phù hợp với ngữ cảnh tiêu đề / nội dung mục đang trống.
 */
export function resolveEmptyArtVariant(
  textHint?: string | null,
  iconHint?: string | null,
): EmptyArtVariant {
  const t = (textHint || "").toLowerCase();
  const ic = (iconHint || "").toLowerCase();

  // 1. Thông báo / Hộp tin
  if (
    t.includes("thông báo") ||
    t.includes("notification") ||
    t.includes("通知") ||
    ic === "none" ||
    ic === "ok"
  ) {
    return "notify";
  }

  // 2. Bảo mật / Kiểm toán / Thẻ đoàn thẩm định / Phiên đăng nhập
  if (
    t.includes("kiểm toán") ||
    t.includes("audit") ||
    t.includes("lượt truy cập") ||
    t.includes("nhật ký truy cập") ||
    t.includes("thẻ thẩm định") ||
    t.includes("thẻ đoàn") ||
    t.includes("phiên đăng nhập") ||
    t.includes("bảo mật")
  ) {
    return "vault";
  }

  // 3. Tem truy xuất / Phiếu / Hạn mức trần sản lượng
  if (
    t.includes("tem ") ||
    t.includes("tem.") ||
    t.includes("dữ liệu tem") ||
    t.includes("cấp phát tem") ||
    t.includes("dải tem") ||
    t.includes("hạn mức") ||
    t.includes("chỉ tiêu") ||
    t.includes("định mức") ||
    t.includes("khai báo thu")
  ) {
    return "tickets";
  }

  // 4. Kiểm nghiệm / Lịch kiểm tra / Biên bản / Vi phạm / Việc cần làm / Báo cáo
  if (
    t.includes("kiểm nghiệm") ||
    t.includes("lịch kiểm tra") ||
    t.includes("biên bản") ||
    t.includes("vi phạm") ||
    t.includes("việc cần làm") ||
    t.includes("báo cáo") ||
    t.includes("chỉ tiêu phân tích") ||
    ic === "lab" ||
    ic === "calendar"
  ) {
    return "clipboard";
  }

  // 5. Nhật ký canh tác / Phun thuốc / Quy trình 2026-2027 / Tập huấn & Kiến thức
  if (
    t.includes("nhật ký") ||
    t.includes("phun thuốc") ||
    t.includes("canh tác") ||
    t.includes("quy trình") ||
    t.includes("giai đoạn") ||
    t.includes("lộ trình") ||
    t.includes("tập huấn") ||
    t.includes("sâu bệnh") ||
    ic === "diary" ||
    ic === "spray" ||
    ic === "learn"
  ) {
    return "journal";
  }

  // 6. Hồ sơ chờ duyệt / Yêu cầu cấp quyền / Yêu cầu xóa / Bản tin
  if (
    t.includes("chờ duyệt") ||
    t.includes("hồ sơ duyệt") ||
    t.includes("yêu cầu") ||
    t.includes("phê duyệt") ||
    t.includes("bài viết") ||
    t.includes("bản tin") ||
    t.includes("tin tức") ||
    ic === "request"
  ) {
    return "envelope";
  }

  // 7. Tài khoản / Đăng ký / Doanh nghiệp thu mua / Hợp đồng
  if (
    t.includes("tài khoản") ||
    t.includes("đăng ký") ||
    t.includes("doanh nghiệp") ||
    t.includes("đối tác") ||
    t.includes("hợp đồng")
  ) {
    return "cards";
  }

  // 8. Hồ sơ hộ dân / Thửa đất / Vùng trồng / Thôn
  if (
    t.includes("hộ nông dân") ||
    t.includes("hộ dân") ||
    t.includes("hộ hoặc thửa") ||
    t.includes("hộ thành viên") ||
    t.includes("thửa") ||
    t.includes("bản đồ") ||
    t.includes("vùng trồng") ||
    t.includes("thôn") ||
    ic === "plot" ||
    ic === "map"
  ) {
    return "folder";
  }

  // 9. Mặc định chung (Lô thu hoạch, sản phẩm, thuốc, phân bón, giống, lịch trình rỗng...) -> Hộp mở 3D
  return "box";
}

export function EmptyStateArt({
  variant,
  compact = false,
}: {
  variant: EmptyArtVariant;
  compact?: boolean;
}) {
  const rawId = useId().replace(/:/g, "");
  const id = (suffix: string) => `esa-${rawId}-${suffix}`;

  return (
    <svg
      viewBox="0 0 180 136"
      fill="none"
      aria-hidden="true"
      className={`puc-empty-art${compact ? " is-compact" : ""}`}
    >
      <defs>
        <radialGradient id={id("shadow")} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9aa8c0" stopOpacity="0.28" />
          <stop offset="62%" stopColor="#aebbd0" stopOpacity="0.11" />
          <stop offset="100%" stopColor="#c5d0e0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("cast")} x1="0%" y1="0%" x2="100%" y2="35%">
          <stop offset="0%" stopColor="#9ba9c2" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#cfd8e6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("light")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5f8fd" />
          <stop offset="100%" stopColor="#e2e9f4" />
        </linearGradient>
        <linearGradient id={id("mid")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e4ebf6" />
          <stop offset="100%" stopColor="#cfd9ea" />
        </linearGradient>
        <linearGradient id={id("shade")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d3ddec" />
          <stop offset="100%" stopColor="#bcc9de" />
        </linearGradient>
        <linearGradient id={id("deep")} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#b5c4db" />
          <stop offset="100%" stopColor="#cdd8e9" />
        </linearGradient>
        <linearGradient id={id("paper")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#edf2fa" />
        </linearGradient>
        <linearGradient id={id("curlPaper")} x1="15%" y1="0%" x2="75%" y2="100%">
          <stop offset="0%" stopColor="#eef2fa" />
          <stop offset="48%" stopColor="#f8fafe" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id={id("slip")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dfe5f3" />
          <stop offset="100%" stopColor="#eef2fa" />
        </linearGradient>
        <linearGradient id={id("cloudBack")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#eaedf2" stopOpacity="0.92" />
          <stop offset="68%" stopColor="#f3f5f8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("cloudFront")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#eef1f5" stopOpacity="0.95" />
          <stop offset="72%" stopColor="#f7f8fa" stopOpacity="0.52" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("bellBody")} x1="26%" y1="10%" x2="78%" y2="94%">
          <stop offset="0%" stopColor="#f3f5f8" />
          <stop offset="46%" stopColor="#e5e8ee" />
          <stop offset="100%" stopColor="#d4d9e2" />
        </linearGradient>
        <linearGradient id={id("bellRim")} x1="18%" y1="0%" x2="84%" y2="100%">
          <stop offset="0%" stopColor="#eceff4" />
          <stop offset="55%" stopColor="#dfe3eb" />
          <stop offset="100%" stopColor="#cfd4df" />
        </linearGradient>
        <linearGradient id={id("bellClapper")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#c6ccd7" />
          <stop offset="45%" stopColor="#d8dde6" />
          <stop offset="100%" stopColor="#e5e8ef" />
        </linearGradient>
        <radialGradient id={id("bellShadow")} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#b8c0ce" stopOpacity="0.28" />
          <stop offset="62%" stopColor="#cfd5e0" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {variant === "box" && (
        <g>
          <path d="M88 98 L162 118 L124 126 L56 104 Z" fill={`url(#${id("cast")})`} />
          <ellipse cx="90" cy="100" rx="46" ry="11" fill={`url(#${id("shadow")})`} />
          {/* Lòng hộp phía sau */}
          <polygon points="52,54 90,40 90,74 52,84" fill={`url(#${id("deep")})`} />
          <polygon points="90,40 128,54 128,84 90,74" fill={`url(#${id("shade")})`} />
          {/* Nắp mở phía sau */}
          <polygon points="52,54 90,40 76,30 38,44" fill={`url(#${id("light")})`} />
          <polygon points="90,40 128,54 142,44 104,30" fill="#eef3fb" />
          {/* Thân hộp phía trước */}
          <polygon points="52,54 90,69 90,104 52,89" fill={`url(#${id("mid")})`} />
          <polygon points="90,69 128,54 128,89 90,104" fill={`url(#${id("shade")})`} />
          {/* Bóng đổ dưới cánh nắp trước */}
          <polygon points="52,58 90,73 90,78 52,63" fill="#aebdd5" opacity="0.28" />
          <polygon points="90,73 128,58 128,63 90,78" fill="#9fb0cb" opacity="0.28" />
          {/* Hai cánh nắp mở phía trước */}
          <polygon points="52,54 90,69 78,83 38,67" fill={`url(#${id("paper")})`} />
          <polygon points="90,69 128,54 142,67 102,83" fill={`url(#${id("light")})`} />
        </g>
      )}

      {variant === "notify" && (
        <g>
          {/* Lớp mây mờ phía sau trải hai bên chân chuông */}
          <path
            d="M12 102 C14 91 23 85 33 86 C36 75 47 68 59 71 C65 62 77 58 89 62 C101 57 115 61 122 71 C134 69 145 76 148 86 C158 86 166 92 168 102 Z"
            fill={`url(#${id("cloudBack")})`}
          />
          <path
            d="M22 106 C26 96 36 91 46 93 C52 84 64 81 74 86 C84 79 98 79 108 86 C118 81 130 84 136 93 C146 91 155 96 159 106 Z"
            fill={`url(#${id("cloudFront")})`}
          />

          {/* Ô thoại nhỏ mờ góc trên bên trái quả chuông */}
          <path
            d="M49 16 H64.5 A3.5 3.5 0 0 1 68 19.5 V27.5 A3.5 3.5 0 0 1 64.5 31 H61.2 L58.4 34.2 L57.6 31 H49 A3.5 3.5 0 0 1 45.5 27.5 V19.5 A3.5 3.5 0 0 1 49 16 Z"
            fill="#ebeff4"
          />
          <path
            d="M50.2 21.3 H55.2 L50.4 25.8 H55.4"
            stroke="#fbfcfd"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M58.2 21.3 H63 L58.4 25.8 H63.2"
            stroke="#fbfcfd"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Bóng đổ dịu dưới chân chuông */}
          <ellipse cx="90" cy="110" rx="38" ry="7.5" fill={`url(#${id("bellShadow")})`} />

          {/* Quả lắc tròn dưới đáy chuông */}
          <ellipse cx="90" cy="96.5" rx="10.2" ry="8.8" fill={`url(#${id("bellClapper")})`} />

          {/* Núm đỉnh chuông 3D */}
          <circle cx="90" cy="34.5" r="6" fill={`url(#${id("bellBody")})`} />

          {/* Thân chuông 3D bo tròn mềm mại */}
          <path
            d="M90 36.5 C74.5 36.5 65.5 47.5 64.5 64.5 C63.9 75.2 61.2 83.2 54.2 89.6 C52.2 91.4 53.3 95 56.4 95.3 Q90 98.2 123.6 95.3 C126.7 95 127.8 91.4 125.8 89.6 C118.8 83.2 116.1 75.2 115.5 64.5 C114.5 47.5 105.5 36.5 90 36.5 Z"
            fill={`url(#${id("bellBody")})`}
          />

          {/* Ánh sáng khối mềm bên sườn trái quả chuông */}
          <path
            d="M83 42.5 C73.8 45.2 69.2 53.8 68.4 66.8 C67.9 74.2 66.2 80.4 62 85.8"
            stroke="#f8f9fb"
            strokeWidth="3.2"
            strokeLinecap="round"
            opacity="0.72"
          />

          {/* Vành miệng chuông dưới dày mịn */}
          <path
            d="M55 91.4 Q90 94.6 125 91.4 C126.8 92.8 126.1 95.2 123.5 95.5 Q90 98.6 56.5 95.5 C53.9 95.2 53.2 92.8 55 91.4 Z"
            fill={`url(#${id("bellRim")})`}
          />
        </g>
      )}

      {variant === "folder" && (
        <g>
          <ellipse cx="92" cy="108" rx="52" ry="12" fill={`url(#${id("shadow")})`} />
          {/* Mảnh giấy phụ nhẹ 2 bên */}
          <polygon points="24,84 42,76 50,83 31,91" fill="#eaeff8" />
          <polygon points="134,58 156,67 146,76 125,67" fill="#e6ecf6" />
          {/* Bìa sổ mở bên trái */}
          <polygon points="48,30 84,24 84,98 48,105" fill={`url(#${id("mid")})`} />
          <line
            x1="53"
            y1="34"
            x2="80"
            y2="29"
            stroke="#f5f8fd"
            strokeWidth="1.2"
            strokeDasharray="2.5 2.5"
          />
          <line x1="52" y1="66" x2="81" y2="61" stroke="#cad5e7" strokeWidth="1" />
          {/* Gáy gấp giữa */}
          <polygon points="84,24 93,26 93,100 84,98" fill={`url(#${id("deep")})`} />
          {/* Bìa sổ mở bên phải kèm ngăn hồ sơ */}
          <polygon points="93,26 130,32 130,106 93,100" fill={`url(#${id("light")})`} />
          <line
            x1="97"
            y1="31"
            x2="125"
            y2="36"
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeDasharray="2.5 2.5"
          />
          <polygon points="98,40 124,44 124,53 98,49" fill="#ffffff" opacity="0.9" />
          <polygon points="98,56 124,60 124,69 98,65" fill="#ffffff" opacity="0.9" />
          <polygon points="98,73 124,77 124,99 98,95" fill="#d3deee" />
        </g>
      )}

      {variant === "envelope" && (
        <g>
          <ellipse cx="90" cy="108" rx="50" ry="11" fill={`url(#${id("shadow")})`} />
          <polygon points="22,90 40,83 47,89 29,96" fill="#eaeff8" />
          <polygon points="136,84 154,90 147,97 129,91" fill="#eaeff8" />
          {/* Nắp phong bì mở phía sau */}
          <path
            d="M48 56 L86 31 C88.5 29.4 91.5 29.4 94 31 L132 56 Z"
            fill={`url(#${id("deep")})`}
          />
          {/* Tờ thư trắng nghiêng bên trong */}
          <g transform="rotate(-6 90 64)">
            <rect x="57" y="38" width="66" height="50" rx="3" fill={`url(#${id("paper")})`} />
            <rect x="65" y="46" width="12" height="9" rx="1.5" fill="#dbe4f2" />
            <rect x="65" y="61" width="46" height="3.2" rx="1.6" fill="#e3eaf5" />
            <rect x="65" y="69" width="34" height="3.2" rx="1.6" fill="#e8eef8" />
          </g>
          {/* Hai cánh bên và đáy phong bì */}
          <polygon points="48,56 90,82 48,104" fill={`url(#${id("mid")})`} />
          <polygon points="132,56 90,82 132,104" fill={`url(#${id("shade")})`} />
          <path
            d="M48 104 L84 79 C87.6 76.6 92.4 76.6 96 79 L132 104 Z"
            fill={`url(#${id("light")})`}
          />
        </g>
      )}

      {variant === "tickets" && (
        <g>
          <ellipse cx="90" cy="109" rx="52" ry="11" fill={`url(#${id("shadow")})`} />
          <polygon points="22,92 39,85 46,91 29,98" fill="#eaeff8" />
          <polygon points="137,85 155,91 148,97 130,91" fill="#eaeff8" />
          {/* Phiếu bên trái */}
          <g transform="rotate(-16 68 74)">
            <rect x="48" y="34" width="40" height="72" rx="4" fill={`url(#${id("shade")})`} />
            <line
              x1="52"
              y1="52"
              x2="84"
              y2="52"
              stroke="#eef3fb"
              strokeWidth="1.3"
              strokeDasharray="3 3"
            />
          </g>
          {/* Phiếu bên phải */}
          <g transform="rotate(15 112 74)">
            <rect x="92" y="34" width="40" height="72" rx="4" fill={`url(#${id("mid")})`} />
            <line
              x1="96"
              y1="52"
              x2="128"
              y2="52"
              stroke="#f5f8fd"
              strokeWidth="1.3"
              strokeDasharray="3 3"
            />
          </g>
          {/* Phiếu / Tem chính giữa */}
          <path
            d="M68 26 H112 A4 4 0 0 1 116 30 V46 A5 5 0 0 0 116 56 V102 A4 4 0 0 1 112 106 H68 A4 4 0 0 1 64 102 V56 A5 5 0 0 0 64 46 V30 A4 4 0 0 1 68 26 Z"
            fill={`url(#${id("paper")})`}
            stroke="#dce5f2"
            strokeWidth="1"
          />
          <line
            x1="69"
            y1="51"
            x2="111"
            y2="51"
            stroke="#cad6e8"
            strokeWidth="1.3"
            strokeDasharray="3 3"
          />
          {/* Ký hiệu khung mã tem tối giản */}
          <rect x="81" y="65" width="7" height="7" rx="1.5" stroke="#bccadd" strokeWidth="1.8" />
          <rect x="92" y="65" width="7" height="7" rx="1.5" stroke="#bccadd" strokeWidth="1.8" />
          <rect x="81" y="76" width="7" height="7" rx="1.5" stroke="#bccadd" strokeWidth="1.8" />
          <rect x="92" y="76" width="7" height="7" rx="1.5" fill="#cbd6e7" />
        </g>
      )}

      {variant === "journal" && (
        <g>
          <ellipse cx="92" cy="109" rx="44" ry="10" fill={`url(#${id("shadow")})`} />
          {/* Mũi tên chỉ dẫn mờ 2 bên như mẫu sổ tay */}
          <path d="M32 68 H43 V64 L50 70.5 L43 77 V73 H32 Z" fill="#e6ecf6" />
          <path d="M130 74 H143 V69 L151 77 L143 85 V80 H130 Z" fill="#e6ecf6" />
          {/* Độ dày trang giấy trên đỉnh sổ */}
          <path d="M62 24 H116 A4 4 0 0 1 120 28 V33 H62 Z" fill="#d5dfee" />
          <path d="M64 26 H116 V31 H64 Z" fill="#f7f9fd" />
          {/* Bìa sổ chính */}
          <rect x="58" y="29" width="62" height="78" rx="4" fill={`url(#${id("light")})`} />
          {/* Gáy sổ bo tròn bên trái */}
          <path
            d="M62 24 C59.8 24 58 25.8 58 28 V103 C58 105.2 59.8 107 62 107 H66 V29 C63 29 61 27 62 24 Z"
            fill={`url(#${id("shade")})`}
          />
          {/* Nhãn giữa bìa sổ */}
          <path
            d="M77 58 H96 L104 66 L96 74 H77 A2.5 2.5 0 0 1 74.5 71.5 V60.5 A2.5 2.5 0 0 1 77 58 Z"
            fill="#d3deee"
          />
          <line x1="81" y1="64" x2="93" y2="64" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="81" y1="68.5" x2="89" y2="68.5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}

      {variant === "clipboard" && (
        <g>
          {/* Bóng đổ mềm dưới chân bảng kẹp */}
          <ellipse cx="94" cy="112" rx="48" ry="10.5" fill={`url(#${id("shadow")})`} />
          {/* Hai mảnh giấy bay nhẹ hai bên đúng bố cục hình mẫu */}
          <path d="M16 77 Q28 73 39 71 L45 84 Q33 87 21 89 Z" fill={`url(#${id("slip")})`} />
          <path d="M134 62 L146 57 L154 63 L142 68 Z" fill="#e7ecf7" />
          {/* Thân bảng kẹp hồ sơ 3D cạnh dày mềm mại */}
          <rect x="55" y="26" width="70" height="84" rx="5.5" fill="#cfd5e6" />
          <rect x="55" y="24.5" width="70" height="83.5" rx="5.5" fill={`url(#${id("mid")})`} />
          {/* Lòng khay bảng kẹp lộ nhẹ phía dưới tờ giấy cong */}
          <rect x="60.5" y="31" width="59" height="72" rx="3" fill="#c3cbe0" />
          {/* Tờ giấy lót bên dưới và bóng đổ của mép giấy cong */}
          <path d="M60.5 32 H119.5 L122.5 97 Q91 100 62 97.5 Z" fill="#e5eaf5" />
          <path d="M62 94 Q94 102 120 96.5 L119.5 103 H60.5 Z" fill="#b7c0d8" opacity="0.58" />
          {/* Tờ giấy kiểm nghiệm chính uốn cong nổi 3D sang góc dưới phải */}
          <path
            d="M60.5 31 H119.5 C119.5 58 121.5 79 128.5 92 Q96 97 63 95 C61.3 82 60.5 60 60.5 31 Z"
            fill={`url(#${id("curlPaper")})`}
          />
          {/* Bóng mềm ngay dưới kẹp giấy */}
          <rect x="71" y="33.5" width="38" height="3" rx="1.5" fill="#c5cee2" opacity="0.38" />
          {/* Kẹp đầu bảng bậc thang 3D có rãnh ngang */}
          <path
            d="M74.5 22.5 H82.5 C83 18.6 85.8 16.8 90 16.8 C94.2 16.8 97 18.6 97.5 22.5 H105.5 A3.2 3.2 0 0 1 108.7 25.7 V32.2 A2.3 2.3 0 0 1 106.4 34.5 H73.6 A2.3 2.3 0 0 1 71.3 32.2 V25.7 A3.2 3.2 0 0 1 74.5 22.5 Z"
            fill="#c3cce0"
          />
          <path
            d="M74.5 21.5 H82.5 C83 17.8 85.8 16 90 16 C94.2 16 97 17.8 97.5 21.5 H105.5 A3.2 3.2 0 0 1 108.7 24.7 V31 A2.3 2.3 0 0 1 106.4 33.3 H73.6 A2.3 2.3 0 0 1 71.3 31 V24.7 A3.2 3.2 0 0 1 74.5 21.5 Z"
            fill={`url(#${id("shade")})`}
          />
          <line x1="77.5" y1="29.2" x2="102.5" y2="29.2" stroke="#b3bcd4" strokeWidth="1.5" strokeLinecap="round" />
          {/* Hai dòng mục kiểm nghiệm tối giản ở nửa trên tờ giấy */}
          <path
            d="M70 48.5 L73.6 52 L80.5 45"
            stroke="#c1cadf"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="87" y1="49" x2="111" y2="49" stroke="#cfd7e8" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="70.5" y="59" width="8.5" height="8.5" rx="1.6" stroke="#c5cee2" strokeWidth="1.8" />
          <line x1="87" y1="63.3" x2="111" y2="63.3" stroke="#d3dbe9" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {variant === "vault" && (
        <g>
          <ellipse cx="92" cy="107" rx="50" ry="11" fill={`url(#${id("shadow")})`} />
          <ellipse cx="42" cy="94" rx="7" ry="3.5" fill="#dfe7f3" />
          <ellipse cx="144" cy="91" rx="5" ry="2.5" fill="#e3eaf5" />
          {/* Nắp hòm bảo mật mở lên */}
          <polygon points="58,52 64,28 116,28 122,52" fill={`url(#${id("light")})`} />
          <polygon points="62,49 66,32 114,32 118,49" fill="#d8e2f0" />
          {/* Khoang bên trong */}
          <polygon points="54,66 60,52 120,52 126,66" fill={`url(#${id("deep")})`} />
          {/* Gờ viền mặt trước */}
          <rect x="52" y="65" width="76" height="6" rx="2" fill="#e8eef8" />
          {/* Thân hòm khóa */}
          <polygon points="55,71 125,71 120,104 60,104" fill={`url(#${id("mid")})`} />
          <polygon points="61,74 119,74 115,101 65,101" fill="#edf2fa" />
          {/* Ổ khóa chính giữa */}
          <path d="M82 71 H98 L96 87 H84 Z" fill="#cfd9ea" />
          <circle cx="90" cy="77.5" r="2.6" fill="#9fb0cb" />
          <path d="M88.8 79.5 H91.2 L91.8 84 H88.2 Z" fill="#9fb0cb" />
        </g>
      )}

      {variant === "cards" && (
        <g>
          <ellipse cx="90" cy="108" rx="52" ry="11" fill={`url(#${id("shadow")})`} />
          <polygon points="22,93 40,86 47,92 29,99" fill="#eaeff8" />
          <polygon points="138,87 154,93 147,98 131,92" fill="#eaeff8" />
          {/* Thẻ nghiêng phía sau */}
          <g transform="rotate(24 102 64)">
            <rect x="66" y="38" width="68" height="44" rx="5" fill={`url(#${id("shade")})`} />
            <rect x="66" y="47" width="68" height="8" fill="#b7c6dc" />
          </g>
          {/* Thẻ chính phía trước */}
          <rect
            x="52"
            y="54"
            width="72"
            height="48"
            rx="5"
            fill={`url(#${id("light")})`}
            stroke="#e8eef8"
            strokeWidth="1"
          />
          <circle cx="64" cy="66" r="5" fill="#cbd6e8" />
          <rect x="59" y="77" width="12" height="5" rx="1.5" fill="#ffffff" />
          <rect x="74" y="77" width="12" height="5" rx="1.5" fill="#ffffff" />
          <rect x="89" y="77" width="12" height="5" rx="1.5" fill="#ffffff" />
          <rect x="104" y="77" width="12" height="5" rx="1.5" fill="#ffffff" />
          <rect x="59" y="88" width="22" height="3.5" rx="1.5" fill="#cfd9ea" />
        </g>
      )}
    </svg>
  );
}

/**
 * Khối hiển thị trạng thái rỗng đồng nhất toàn hệ thống (bảng, danh sách thẻ, ngăn kéo thông báo).
 */
export function ContextualEmptyBox({
  children,
  variant,
  iconHint,
  compact = false,
  className = "",
}: {
  children: ReactNode;
  variant?: EmptyArtVariant;
  iconHint?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const plainText = extractPlainText(children);
  const resolvedVariant = variant ?? resolveEmptyArtVariant(plainText, iconHint);

  return (
    <div className={`puc-empty-box${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}>
      <EmptyStateArt variant={resolvedVariant} compact={compact} />
      <div className="puc-empty-label">{children}</div>
    </div>
  );
}

