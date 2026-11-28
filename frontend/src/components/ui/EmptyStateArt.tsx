"use client";

import { isValidElement, useId, type ReactElement, type ReactNode } from "react";

export type EmptyArtVariant =
  | "box"
  | "notify"
  | "folder"
  | "envelope"
  | "tickets"
  | "journal"
  | "schedule"
  | "clipboard"
  | "vault"
  | "cards"
  | "qrNotFound"
  | "qrOffline"
  | "qrLocked"
  | "qrCamera"
  | "searchLens"
  | "catalogLens"
  | "protocol"
  | "pesticide"
  | "fertilizer"
  | "seedling"
  | "ipmShield"
  | "villageMap"
  | "trainingCap"
  | "mapCompass"
  | "parcelGrid"
  | "zonePin"
  | "sprayer"
  | "warningFlag"
  | "taskCheck"
  | "labFlask"
  | "fieldCalendar"
  | "stampSeal"
  | "keyReset"
  | "userBadge"
  | "harvestCalendar"
  | "contractDoc"
  | "pucSignboard"
  | "packhouse"
  | "newspaper"
  | "memberRemove"
  | "megaphone"
  | "inboxRead"
  | "reportChart"
  | "sessionDevices";

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
 * Tự động chọn đúng hình minh họa 3D tông xám-xanh tối giản phù hợp với ngữ cảnh khi nơi gọi không truyền `variant` tường minh.
 */
export function resolveEmptyArtVariant(
  textHint?: string | null,
  iconHint?: string | null,
): EmptyArtVariant {
  const t = (textHint || "").toLowerCase();
  const ic = (iconHint || "").toLowerCase();

  if (t.includes("đã đọc") || t.includes("no read notifications") || t.includes("已读通知")) {
    return "inboxRead";
  }

  if (
    t.includes("thông báo sự cố") ||
    t.includes("bảo trì")
  ) {
    return "megaphone";
  }

  if (
    t.includes("thông báo") ||
    t.includes("notification") ||
    t.includes("通知") ||
    ic === "none" ||
    ic === "ok"
  ) {
    return "notify";
  }

  if (t.includes("phiên hoạt động") || t.includes("phiên đăng nhập") || t.includes("thiết bị")) {
    return "sessionDevices";
  }

  if (
    t.includes("kiểm toán") ||
    t.includes("audit") ||
    t.includes("nhật ký thao tác") ||
    t.includes("bảo mật")
  ) {
    return "vault";
  }

  if (t.includes("lượt truy cập") || t.includes("nhật ký quét qr")) {
    return "qrNotFound";
  }

  if (t.includes("thẻ thẩm định") || t.includes("thẻ đoàn")) {
    return "userBadge";
  }

  if (
    t.includes("tem ") ||
    t.includes("tem.") ||
    t.includes("dữ liệu tem") ||
    t.includes("cấp phát tem") ||
    t.includes("dải tem")
  ) {
    return "tickets";
  }

  if (t.includes("hạn ngạch") || t.includes("hạn mức") || t.includes("mã số vùng trồng")) {
    return "pucSignboard";
  }

  if (ic === "map" || t.includes("bản đồ thửa đất chưa được bật")) {
    return "mapCompass";
  }

  if (ic === "plot" || t.includes("thửa đất nào")) {
    return "parcelGrid";
  }

  if (
    t.includes("lịch kiểm tra") ||
    t.includes("đợt kiểm tra") ||
    t.includes("upcoming inspection") ||
    t.includes("inspection schedule") ||
    t.includes("巡检") ||
    ic === "calendar"
  ) {
    return "schedule";
  }

  if (t.includes("việc cần làm")) {
    return "taskCheck";
  }

  if (t.includes("kiểm nghiệm") || ic === "lab") {
    return "labFlask";
  }

  if (t.includes("vi phạm")) {
    return "warningFlag";
  }

  if (t.includes("biên bản")) {
    return "clipboard";
  }

  if (t.includes("báo cáo") || t.includes("khoảng thời gian")) {
    return "reportChart";
  }

  if (t.includes("phun thuốc") || ic === "spray") {
    return "sprayer";
  }

  if (t.includes("tập huấn") || ic === "learn") {
    return "trainingCap";
  }

  if (t.includes("quy trình") || t.includes("giai đoạn")) {
    return "protocol";
  }

  if (t.includes("sâu bệnh")) {
    return "ipmShield";
  }

  if (t.includes("thuốc bvtv") || t.includes("tìm thấy thuốc")) {
    return "pesticide";
  }

  if (t.includes("phân bón")) {
    return "fertilizer";
  }

  if (t.includes("giống sầu riêng") || t.includes("giống cây")) {
    return "seedling";
  }

  if (t.includes("nhật ký") || t.includes("canh tác") || ic === "diary") {
    return "journal";
  }

  if (t.includes("mật khẩu")) {
    return "keyReset";
  }

  if (t.includes("đăng ký tài khoản")) {
    return "userBadge";
  }

  if (t.includes("yêu cầu xóa")) {
    return "memberRemove";
  }

  if (t.includes("bài viết") || t.includes("bản tin")) {
    return "newspaper";
  }

  if (t.includes("hồ sơ nào") || t.includes("chờ duyệt") || t.includes("phê duyệt")) {
    return "stampSeal";
  }

  if (t.includes("cấp quyền") || t.includes("yêu cầu") || ic === "request") {
    return "envelope";
  }

  if (t.includes("hợp đồng")) {
    return "contractDoc";
  }

  if (t.includes("doanh nghiệp") || t.includes("packhouse")) {
    return "packhouse";
  }

  if (t.includes("tài khoản")) {
    return "cards";
  }

  if (t.includes("thôn")) {
    return "villageMap";
  }

  if (
    t.includes("hộ nông dân") ||
    t.includes("hộ dân") ||
    t.includes("hộ đóng góp") ||
    t.includes("hộ thành viên")
  ) {
    return "folder";
  }

  if (ic === "search") {
    return "searchLens";
  }

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
          <stop offset="0%" stopColor="#dde2eb" stopOpacity="0.68" />
          <stop offset="68%" stopColor="#e3e7ef" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#e3e7ef" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("cloudFront")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#e3e7ef" stopOpacity="0.78" />
          <stop offset="72%" stopColor="#e8ecf3" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#e8ecf3" stopOpacity="0" />
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
          <stop offset="100%" stopColor="#cfd5e0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("cityBack")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#dbe4f3" stopOpacity="0.74" />
          <stop offset="70%" stopColor="#e3ebf8" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#e3ebf8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("cityFront")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#cfd9ec" stopOpacity="0.82" />
          <stop offset="72%" stopColor="#dce5f5" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#dce5f5" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("scrollSheet")} x1="35%" y1="0%" x2="65%" y2="100%">
          <stop offset="0%" stopColor="#fafcff" />
          <stop offset="62%" stopColor="#edf2fb" />
          <stop offset="88%" stopColor="#dde6f4" />
          <stop offset="100%" stopColor="#cfd9ec" />
        </linearGradient>
        <linearGradient id={id("scrollCurl")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b9c6df" />
          <stop offset="100%" stopColor="#cfd9ec" />
        </linearGradient>
        <linearGradient id={id("scrollLip")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#edf2fb" />
          <stop offset="55%" stopColor="#dbe4f3" />
          <stop offset="100%" stopColor="#c7d3e7" />
        </linearGradient>
      </defs>

      {variant === "box" && (
        <g>
          <path d="M88 98 L162 118 L124 126 L56 104 Z" fill={`url(#${id("cast")})`} />
          <ellipse cx="90" cy="100" rx="46" ry="11" fill={`url(#${id("shadow")})`} />
          <polygon points="52,54 90,40 90,74 52,84" fill={`url(#${id("deep")})`} />
          <polygon points="90,40 128,54 128,84 90,74" fill={`url(#${id("shade")})`} />
          <polygon points="52,54 90,40 76,30 38,44" fill={`url(#${id("light")})`} />
          <polygon points="90,40 128,54 142,44 104,30" fill="#eef3fb" />
          <polygon points="52,54 90,69 90,104 52,89" fill={`url(#${id("mid")})`} />
          <polygon points="90,69 128,54 128,89 90,104" fill={`url(#${id("shade")})`} />
          <polygon points="52,58 90,73 90,78 52,63" fill="#aebdd5" opacity="0.28" />
          <polygon points="90,73 128,58 128,63 90,78" fill="#9fb0cb" opacity="0.28" />
          <polygon points="52,54 90,69 78,83 38,67" fill={`url(#${id("paper")})`} />
          <polygon points="90,69 128,54 142,67 102,83" fill={`url(#${id("light")})`} />
        </g>
      )}

      {variant === "notify" && (
        <g>
          <path
            d="M12 102 C14 91 23 85 33 86 C36 75 47 68 59 71 C65 62 77 58 89 62 C101 57 115 61 122 71 C134 69 145 76 148 86 C158 86 166 92 168 102 Z"
            fill={`url(#${id("cloudBack")})`}
          />
          <path
            d="M22 106 C26 96 36 91 46 93 C52 84 64 81 74 86 C84 79 98 79 108 86 C118 81 130 84 136 93 C146 91 155 96 159 106 Z"
            fill={`url(#${id("cloudFront")})`}
          />
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
          <ellipse cx="90" cy="110" rx="38" ry="7.5" fill={`url(#${id("bellShadow")})`} />
          <ellipse cx="90" cy="96.5" rx="10.2" ry="8.8" fill={`url(#${id("bellClapper")})`} />
          <circle cx="90" cy="34.5" r="6" fill={`url(#${id("bellBody")})`} />
          <path
            d="M90 36.5 C74.5 36.5 65.5 47.5 64.5 64.5 C63.9 75.2 61.2 83.2 54.2 89.6 C52.2 91.4 53.3 95 56.4 95.3 Q90 98.2 123.6 95.3 C126.7 95 127.8 91.4 125.8 89.6 C118.8 83.2 116.1 75.2 115.5 64.5 C114.5 47.5 105.5 36.5 90 36.5 Z"
            fill={`url(#${id("bellBody")})`}
          />
          <path
            d="M83 42.5 C73.8 45.2 69.2 53.8 68.4 66.8 C67.9 74.2 66.2 80.4 62 85.8"
            stroke="#f8f9fb"
            strokeWidth="3.2"
            strokeLinecap="round"
            opacity="0.72"
          />
          <path
            d="M55 91.4 Q90 94.6 125 91.4 C126.8 92.8 126.1 95.2 123.5 95.5 Q90 98.6 56.5 95.5 C53.9 95.2 53.2 92.8 55 91.4 Z"
            fill={`url(#${id("bellRim")})`}
          />
        </g>
      )}

      {variant === "folder" && (
        <g>
          <ellipse cx="92" cy="108" rx="52" ry="12" fill={`url(#${id("shadow")})`} />
          <polygon points="24,84 42,76 50,83 31,91" fill="#eaeff8" />
          <polygon points="134,58 156,67 146,76 125,67" fill="#e6ecf6" />
          <polygon points="48,30 84,24 84,98 48,105" fill={`url(#${id("mid")})`} />
          <line x1="53" y1="34" x2="80" y2="29" stroke="#f5f8fd" strokeWidth="1.2" strokeDasharray="2.5 2.5" />
          <line x1="52" y1="66" x2="81" y2="61" stroke="#cad5e7" strokeWidth="1" />
          <polygon points="84,24 93,26 93,100 84,98" fill={`url(#${id("deep")})`} />
          <polygon points="93,26 130,32 130,106 93,100" fill={`url(#${id("light")})`} />
          <line x1="97" y1="31" x2="125" y2="36" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="2.5 2.5" />
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
          <path d="M48 56 L86 31 C88.5 29.4 91.5 29.4 94 31 L132 56 Z" fill={`url(#${id("deep")})`} />
          <g transform="rotate(-6 90 64)">
            <rect x="57" y="38" width="66" height="50" rx="3" fill={`url(#${id("paper")})`} />
            <rect x="65" y="46" width="12" height="9" rx="1.5" fill="#dbe4f2" />
            <rect x="65" y="61" width="46" height="3.2" rx="1.6" fill="#e3eaf5" />
            <rect x="65" y="69" width="34" height="3.2" rx="1.6" fill="#e8eef8" />
          </g>
          <polygon points="48,56 90,82 48,104" fill={`url(#${id("mid")})`} />
          <polygon points="132,56 90,82 132,104" fill={`url(#${id("shade")})`} />
          <path d="M48 104 L84 79 C87.6 76.6 92.4 76.6 96 79 L132 104 Z" fill={`url(#${id("light")})`} />
        </g>
      )}

      {variant === "tickets" && (
        <g>
          <ellipse cx="90" cy="109" rx="52" ry="11" fill={`url(#${id("shadow")})`} />
          <polygon points="22,92 39,85 46,91 29,98" fill="#eaeff8" />
          <polygon points="137,85 155,91 148,97 130,91" fill="#eaeff8" />
          <g transform="rotate(-16 68 74)">
            <rect x="48" y="34" width="40" height="72" rx="4" fill={`url(#${id("shade")})`} />
            <line x1="52" y1="52" x2="84" y2="52" stroke="#eef3fb" strokeWidth="1.3" strokeDasharray="3 3" />
          </g>
          <g transform="rotate(15 112 74)">
            <rect x="92" y="34" width="40" height="72" rx="4" fill={`url(#${id("mid")})`} />
            <line x1="96" y1="52" x2="128" y2="52" stroke="#f5f8fd" strokeWidth="1.3" strokeDasharray="3 3" />
          </g>
          <path
            d="M68 26 H112 A4 4 0 0 1 116 30 V46 A5 5 0 0 0 116 56 V102 A4 4 0 0 1 112 106 H68 A4 4 0 0 1 64 102 V56 A5 5 0 0 0 64 46 V30 A4 4 0 0 1 68 26 Z"
            fill={`url(#${id("paper")})`}
            stroke="#dce5f2"
            strokeWidth="1"
          />
          <line x1="69" y1="51" x2="111" y2="51" stroke="#cad6e8" strokeWidth="1.3" strokeDasharray="3 3" />
          <rect x="81" y="65" width="7" height="7" rx="1.5" stroke="#bccadd" strokeWidth="1.8" />
          <rect x="92" y="65" width="7" height="7" rx="1.5" stroke="#bccadd" strokeWidth="1.8" />
          <rect x="81" y="76" width="7" height="7" rx="1.5" stroke="#bccadd" strokeWidth="1.8" />
          <rect x="92" y="76" width="7" height="7" rx="1.5" fill="#cbd6e7" />
        </g>
      )}

      {variant === "journal" && (
        <g>
          <ellipse cx="92" cy="109" rx="44" ry="10" fill={`url(#${id("shadow")})`} />
          <path d="M32 68 H43 V64 L50 70.5 L43 77 V73 H32 Z" fill="#e6ecf6" />
          <path d="M130 74 H143 V69 L151 77 L143 85 V80 H130 Z" fill="#e6ecf6" />
          <path d="M62 24 H116 A4 4 0 0 1 120 28 V33 H62 Z" fill="#d5dfee" />
          <path d="M64 26 H116 V31 H64 Z" fill="#f7f9fd" />
          <rect x="58" y="29" width="62" height="78" rx="4" fill={`url(#${id("light")})`} />
          <path
            d="M62 24 C59.8 24 58 25.8 58 28 V103 C58 105.2 59.8 107 62 107 H66 V29 C63 29 61 27 62 24 Z"
            fill={`url(#${id("shade")})`}
          />
          <path
            d="M77 58 H96 L104 66 L96 74 H77 A2.5 2.5 0 0 1 74.5 71.5 V60.5 A2.5 2.5 0 0 1 77 58 Z"
            fill="#d3deee"
          />
          <line x1="81" y1="64" x2="93" y2="64" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="81" y1="68.5" x2="89" y2="68.5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}

      {variant === "schedule" && (
        <g>
          <path d="M28 106 V94 H41 V78 H54 V66 H72 V106 Z" fill={`url(#${id("cityBack")})`} />
          <path d="M45 106 V83 H59 V71 H72 V106 Z" fill={`url(#${id("cityFront")})`} />
          <rect x="49" y="87" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.86" />
          <rect x="54" y="87" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.86" />
          <rect x="61" y="76" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.88" />
          <rect x="66" y="76" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.88" />
          <rect x="61" y="82" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.76" />
          <rect x="66" y="82" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.76" />
          <path d="M108 106 V58 H114 V52 H127 V58 H133 V68 H147 V93 H155 V106 Z" fill={`url(#${id("cityBack")})`} />
          <path d="M111 106 V62 H132 V73 H145 V106 Z" fill={`url(#${id("cityFront")})`} />
          <rect x="115" y="67" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.9" />
          <rect x="120.5" y="67" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.9" />
          <rect x="126" y="67" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.9" />
          <rect x="115" y="73.5" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.82" />
          <rect x="120.5" y="73.5" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.82" />
          <rect x="126" y="73.5" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.82" />
          <rect x="115" y="80" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.7" />
          <rect x="120.5" y="80" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.7" />
          <rect x="126" y="80" width="3.4" height="3.4" rx="0.7" fill="#f6f9fe" opacity="0.7" />
          <rect x="135" y="78" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.8" />
          <rect x="140" y="78" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.8" />
          <rect x="135" y="84" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.68" />
          <rect x="140" y="84" width="3.2" height="3.2" rx="0.7" fill="#f6f9fe" opacity="0.68" />
          <ellipse cx="90" cy="108.5" rx="46" ry="9.5" fill={`url(#${id("shadow")})`} />
          <path
            d="M109 22 H115.5 C120.2 22 123.5 25.8 123.5 31.2 V44.8 C123.5 46.8 122 48.2 120 48.2 H109 Z"
            fill={`url(#${id("scrollCurl")})`}
          />
          <path
            d="M110 31.5 C110 27.2 112.8 24.5 116.5 24.5 C120.2 24.5 123.5 27.4 123.5 31.8 V45 C123.5 46.8 122.1 48.2 120.2 48.2 H110 Z"
            fill="#c3cfe5"
          />
          <path
            d="M70 30.5 C70 25.4 73.8 22 79 22 H115.5 C111.6 22 110 25.6 110 30.8 V95.5 C110 99.8 107.2 103 103.2 103 H70 Z"
            fill={`url(#${id("scrollSheet")})`}
          />
          <rect x="77.5" y="39" width="25" height="4.2" rx="2.1" fill="#c7d2e6" />
          <rect x="77.5" y="49" width="25" height="4.2" rx="2.1" fill="#cbd5e8" />
          <rect x="77.5" y="59" width="25" height="4.2" rx="2.1" fill="#cfd9ea" />
          <rect x="77.5" y="69" width="20.5" height="4.2" rx="2.1" fill="#d3ddec" />
          <rect x="70" y="81" width="40" height="8" fill="#cbd6ea" opacity="0.36" />
          <path
            d="M61.5 87.5 C61.5 86.1 62.6 85 64 85 H97.8 C98.8 85 99.6 85.8 99.6 86.8 V94.5 C99.6 99.2 101.6 103 104.8 103 H69 C64.4 103 61.5 98.8 61.5 93.2 Z"
            fill={`url(#${id("scrollLip")})`}
          />
          <path
            d="M99.4 94.2 C99.4 90.2 101.8 87.6 104.7 87.6 C107.6 87.6 110 90.4 110 95.2 C110 99.8 107.6 103 104.5 103 C101.5 103 99.4 99.2 99.4 94.2 Z"
            fill="#bcc9df"
          />
        </g>
      )}

      {variant === "clipboard" && (
        <g>
          <ellipse cx="94" cy="112" rx="48" ry="10.5" fill={`url(#${id("shadow")})`} />
          <path d="M16 77 Q28 73 39 71 L45 84 Q33 87 21 89 Z" fill={`url(#${id("slip")})`} />
          <path d="M134 62 L146 57 L154 63 L142 68 Z" fill="#e7ecf7" />
          <rect x="55" y="26" width="70" height="84" rx="5.5" fill="#cfd5e6" />
          <rect x="55" y="24.5" width="70" height="83.5" rx="5.5" fill={`url(#${id("mid")})`} />
          <rect x="60.5" y="31" width="59" height="72" rx="3" fill="#c3cbe0" />
          <path d="M60.5 32 H119.5 L122.5 97 Q91 100 62 97.5 Z" fill="#e5eaf5" />
          <path d="M62 94 Q94 102 120 96.5 L119.5 103 H60.5 Z" fill="#b7c0d8" opacity="0.58" />
          <path
            d="M60.5 31 H119.5 C119.5 58 121.5 79 128.5 92 Q96 97 63 95 C61.3 82 60.5 60 60.5 31 Z"
            fill={`url(#${id("curlPaper")})`}
          />
          <rect x="71" y="33.5" width="38" height="3" rx="1.5" fill="#c5cee2" opacity="0.38" />
          <path
            d="M74.5 22.5 H82.5 C83 18.6 85.8 16.8 90 16.8 C94.2 16.8 97 18.6 97.5 22.5 H105.5 A3.2 3.2 0 0 1 108.7 25.7 V32.2 A2.3 2.3 0 0 1 106.4 34.5 H73.6 A2.3 2.3 0 0 1 71.3 32.2 V25.7 A3.2 3.2 0 0 1 74.5 22.5 Z"
            fill="#c3cce0"
          />
          <path
            d="M74.5 21.5 H82.5 C83 17.8 85.8 16 90 16 C94.2 16 97 17.8 97.5 21.5 H105.5 A3.2 3.2 0 0 1 108.7 24.7 V31 A2.3 2.3 0 0 1 106.4 33.3 H73.6 A2.3 2.3 0 0 1 71.3 31 V24.7 A3.2 3.2 0 0 1 74.5 21.5 Z"
            fill={`url(#${id("shade")})`}
          />
          <line x1="77.5" y1="29.2" x2="102.5" y2="29.2" stroke="#b3bcd4" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M70 48.5 L73.6 52 L80.5 45" stroke="#c1cadf" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
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
          <polygon points="58,52 64,28 116,28 122,52" fill={`url(#${id("light")})`} />
          <polygon points="62,49 66,32 114,32 118,49" fill="#d8e2f0" />
          <polygon points="54,66 60,52 120,52 126,66" fill={`url(#${id("deep")})`} />
          <rect x="52" y="65" width="76" height="6" rx="2" fill="#e8eef8" />
          <polygon points="55,71 125,71 120,104 60,104" fill={`url(#${id("mid")})`} />
          <polygon points="61,74 119,74 115,101 65,101" fill="#edf2fa" />
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
          <g transform="rotate(24 102 64)">
            <rect x="66" y="38" width="68" height="44" rx="5" fill={`url(#${id("shade")})`} />
            <rect x="66" y="47" width="68" height="8" fill="#b7c6dc" />
          </g>
          <rect x="52" y="54" width="72" height="48" rx="5" fill={`url(#${id("light")})`} stroke="#e8eef8" strokeWidth="1" />
          <circle cx="64" cy="66" r="5" fill="#cbd6e8" />
          <rect x="59" y="77" width="12" height="5" rx="1.5" fill="#ffffff" />
          <rect x="74" y="77" width="12" height="5" rx="1.5" fill="#ffffff" />
          <rect x="89" y="77" width="12" height="5" rx="1.5" fill="#ffffff" />
          <rect x="104" y="77" width="12" height="5" rx="1.5" fill="#ffffff" />
          <rect x="59" y="88" width="22" height="3.5" rx="1.5" fill="#cfd9ea" />
        </g>
      )}

      {/* ── 11. Quét / Tra cứu QR không ra thông tin ── */}
      {variant === "qrNotFound" && (
        <g>
          <ellipse cx="88" cy="110" rx="52" ry="11" fill={`url(#${id("shadow")})`} />
          {/* 4 góc khung quét mờ phía ngoài */}
          <path d="M40 36 V26 H50" stroke="#cad6e8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M126 26 H136 V36" stroke="#cad6e8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M40 90 V100 H50" stroke="#cad6e8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {/* Bảng tem QR nổi 3D */}
          <rect x="49" y="31" width="68" height="68" rx="7" fill={`url(#${id("shade")})`} />
          <rect x="49" y="28" width="68" height="68" rx="7" fill={`url(#${id("paper")})`} stroke="#dde6f3" strokeWidth="1" />
          <rect x="58" y="37" width="17" height="17" rx="3" stroke="#b9c8de" strokeWidth="2.6" />
          <rect x="63.5" y="42.5" width="6" height="6" rx="1.2" fill="#cbd6e8" />
          <rect x="91" y="37" width="17" height="17" rx="3" stroke="#b9c8de" strokeWidth="2.6" />
          <rect x="96.5" y="42.5" width="6" height="6" rx="1.2" fill="#cbd6e8" />
          <rect x="58" y="70" width="17" height="17" rx="3" stroke="#b9c8de" strokeWidth="2.6" />
          <rect x="63.5" y="75.5" width="6" height="6" rx="1.2" fill="#cbd6e8" />
          <rect x="82" y="61" width="7" height="7" rx="1.5" fill="#dce5f2" />
          <rect x="82" y="72" width="7" height="7" rx="1.5" fill="#dce5f2" />
          {/* Kính lúp 3D đặt chéo góc dưới phải */}
          <line x1="122" y1="84" x2="141" y2="103" stroke="#b5c4db" strokeWidth="7" strokeLinecap="round" />
          <line x1="121" y1="83" x2="140" y2="102" stroke="#dce5f3" strokeWidth="4.4" strokeLinecap="round" />
          <circle cx="110" cy="72" r="18" fill="#eef3fb" fillOpacity="0.86" stroke={`url(#${id("shade")})`} strokeWidth="5.2" />
          <path d="M101 64 A11 11 0 0 1 116 61" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {/* ── 12. Gián đoạn mạng khi tra cứu QR ── */}
      {variant === "qrOffline" && (
        <g>
          <ellipse cx="90" cy="109" rx="48" ry="10" fill={`url(#${id("shadow")})`} />
          <path
            d="M44 86 C34 86 28 79 29 70 C30 61 38 55 47 56 C52 43 66 36 81 39 C93 30 112 34 119 48 C131 48 140 57 140 69 C140 79 132 86 121 86 Z"
            fill={`url(#${id("light")})`}
          />
          <path
            d="M52 92 C44 92 38 86 39 79 C40 72 46 67 54 68 C59 58 71 54 83 57 C93 50 108 53 114 64 C123 64 130 71 130 80 C130 87 124 92 115 92 Z"
            fill={`url(#${id("paper")})`}
          />
          <path d="M74 69 A22 22 0 0 1 106 69" stroke="#bccadd" strokeWidth="2.8" strokeLinecap="round" strokeDasharray="4 4" />
          <path d="M80 77 A13 13 0 0 1 100 77" stroke="#c7d4e6" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="90" cy="85" r="3.8" fill="#b4c3db" />
        </g>
      )}

      {/* ── 13. Tạm khóa truy cập tra cứu 5 phút ── */}
      {variant === "qrLocked" && (
        <g>
          <ellipse cx="90" cy="110" rx="46" ry="10" fill={`url(#${id("shadow")})`} />
          <path
            d="M90 22 L126 35 V64 C126 84 111 99 90 106 C69 99 54 84 54 64 V35 Z"
            fill={`url(#${id("mid")})`}
          />
          <path
            d="M90 27 L120 38 V63 C120 80 107 93 90 99.5 C73 93 60 80 60 63 V38 Z"
            fill={`url(#${id("paper")})`}
          />
          <circle cx="90" cy="63" r="18" fill={`url(#${id("light")})`} stroke="#c5d2e6" strokeWidth="2.6" />
          <rect x="86" y="40" width="8" height="4" rx="2" fill="#bccadd" />
          <polyline points="90,53 90,63 97,67" stroke="#9fb0cb" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* ── 14. Máy ảnh quét mã QR ── */}
      {variant === "qrCamera" && (
        <g>
          <ellipse cx="90" cy="109" rx="48" ry="10" fill={`url(#${id("shadow")})`} />
          <path d="M36 40 V30 H46" stroke="#c8d4e7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M134 30 H144 V40" stroke="#c8d4e7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M36 88 V98 H46" stroke="#c8d4e7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M134 98 H144 V88" stroke="#c8d4e7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M56 45 H71 L76 37 H104 L109 45 H124 A6 6 0 0 1 130 51 V89 A6 6 0 0 1 124 95 H56 A6 6 0 0 1 50 89 V51 A6 6 0 0 1 56 45 Z"
            fill={`url(#${id("mid")})`}
          />
          <circle cx="90" cy="70" r="17" fill={`url(#${id("paper")})`} stroke="#bccadd" strokeWidth="2.5" />
          <circle cx="90" cy="70" r="9.5" fill={`url(#${id("shade")})`} />
          <circle cx="86.5" cy="66.5" r="2.6" fill="#ffffff" />
          <circle cx="117" cy="54" r="3" fill="#eef3fb" />
        </g>
      )}

      {/* ── 15. Tìm kiếm chức năng không khớp ── */}
      {variant === "searchLens" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          <g transform="rotate(-10 74 66)">
            <rect x="44" y="34" width="60" height="62" rx="5" fill={`url(#${id("mid")})`} />
          </g>
          <rect x="52" y="32" width="64" height="64" rx="5" fill={`url(#${id("paper")})`} stroke="#dde6f3" strokeWidth="1" />
          <rect x="62" y="45" width="36" height="4" rx="2" fill="#d5dfee" />
          <rect x="62" y="55" width="44" height="4" rx="2" fill="#dfe7f4" />
          <rect x="62" y="65" width="28" height="4" rx="2" fill="#e5ecf7" />
          <line x1="118" y1="81" x2="138" y2="101" stroke="#b5c4db" strokeWidth="7.5" strokeLinecap="round" />
          <line x1="117" y1="80" x2="137" y2="100" stroke="#e4ebf6" strokeWidth="4.6" strokeLinecap="round" />
          <circle cx="104" cy="67" r="19" fill="#f5f8fd" fillOpacity="0.88" stroke={`url(#${id("shade")})`} strokeWidth="5.4" />
          <path d="M95 59 A12 12 0 0 1 111 56" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {/* ── 16. Chọn vật tư bằng hình ảnh không khớp ── */}
      {variant === "catalogLens" && (
        <g>
          <ellipse cx="90" cy="109" rx="48" ry="10" fill={`url(#${id("shadow")})`} />
          <rect x="46" y="30" width="76" height="66" rx="6" fill={`url(#${id("paper")})`} stroke="#d8e2f0" strokeWidth="1.2" />
          <rect x="54" y="38" width="60" height="38" rx="4" fill={`url(#${id("light")})`} />
          <circle cx="68" cy="50" r="5" fill="#cbd6e8" />
          <polygon points="56,74 76,56 92,70 102,61 112,74" fill={`url(#${id("shade")})`} />
          <rect x="56" y="82" width="38" height="4" rx="2" fill="#d5dfee" />
          <circle cx="122" cy="78" r="14" fill="#f7f9fd" stroke="#bcc9de" strokeWidth="4.4" />
          <line x1="132" y1="88" x2="143" y2="99" stroke="#b5c4db" strokeWidth="5.5" strokeLinecap="round" />
        </g>
      )}

      {/* ── 17. Quy trình chăm sóc theo giai đoạn ── */}
      {variant === "protocol" && (
        <g>
          <ellipse cx="90" cy="109" rx="52" ry="10.5" fill={`url(#${id("shadow")})`} />
          <rect x="42" y="74" width="26" height="28" rx="3.5" fill={`url(#${id("shade")})`} />
          <rect x="76" y="56" width="26" height="46" rx="3.5" fill={`url(#${id("mid")})`} />
          <rect x="110" y="38" width="26" height="64" rx="3.5" fill={`url(#${id("light")})`} stroke="#dce5f2" strokeWidth="1" />
          <line x1="123" y1="18" x2="123" y2="38" stroke="#aebdd5" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M123 19 L141 25 L123 31 Z" fill="#c3d0e5" />
          <path d="M50 66 C65 66 68 48 88 48" stroke="#cad6e8" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
        </g>
      )}

      {/* ── 18. Thuốc BVTV ── */}
      {variant === "pesticide" && (
        <g>
          <ellipse cx="90" cy="109" rx="48" ry="10.5" fill={`url(#${id("shadow")})`} />
          {/* Chai thuốc 3D */}
          <rect x="64" y="24" width="22" height="10" rx="2.5" fill={`url(#${id("deep")})`} />
          <path d="M61 36 H89 L96 47 V98 A5 5 0 0 1 91 103 H59 A5 5 0 0 1 54 98 V47 Z" fill={`url(#${id("light")})`} />
          <rect x="59" y="56" width="32" height="30" rx="3" fill={`url(#${id("paper")})`} />
          <path d="M75 63 C79 68 81 71 81 74.5 A6 6 0 0 1 69 74.5 C69 71 71 68 75 63 Z" fill="#c7d4e8" />
          {/* Cốc đong định lượng bên cạnh */}
          <polygon points="103,66 129,66 125,103 107,103" fill={`url(#${id("mid")})`} />
          <line x1="109" y1="76" x2="122" y2="76" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="110" y1="84" x2="120" y2="84" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="111" y1="92" x2="119" y2="92" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}

      {/* ── 19. Phân bón ── */}
      {variant === "fertilizer" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="11" fill={`url(#${id("shadow")})`} />
          {/* Cổ bao phân buộc gọn */}
          <path d="M75 24 L82 36 H98 L105 24 Q90 29 75 24 Z" fill={`url(#${id("shade")})`} />
          <rect x="79" y="34" width="22" height="5" rx="2.5" fill="#b4c3db" />
          {/* Thân bao phân 3D */}
          <path
            d="M64 44 C64 39 74 37 90 37 C106 37 116 39 116 44 L121 96 C121 101 110 104 90 104 C70 104 59 101 59 96 Z"
            fill={`url(#${id("light")})`}
          />
          <rect x="70" y="54" width="40" height="32" rx="4" fill={`url(#${id("paper")})`} />
          <path d="M90 61 C97 61 100 68 95 75 C90 80 83 78 83 71 C83 65 86 61 90 61 Z" fill="#c6d3e7" />
          <circle cx="132" cy="98" r="4" fill="#d3deee" />
          <circle cx="140" cy="101" r="3" fill="#dfe7f4" />
          <circle cx="48" cy="100" r="3.5" fill="#d8e2f0" />
        </g>
      )}

      {/* ── 20. Giống cây sầu riêng ── */}
      {variant === "seedling" && (
        <g>
          <ellipse cx="90" cy="109" rx="44" ry="10" fill={`url(#${id("shadow")})`} />
          {/* Mầm lá đôi 3D */}
          <path d="M90 66 V36" stroke="#b6c5dc" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M90 48 C72 48 64 35 67 24 C79 23 89 32 90 48 Z" fill={`url(#${id("mid")})`} />
          <path d="M90 42 C108 42 116 29 113 18 C101 17 91 26 90 42 Z" fill={`url(#${id("shade")})`} />
          {/* Chậu ươm 3D */}
          <rect x="65" y="64" width="50" height="9" rx="3" fill={`url(#${id("light")})`} />
          <polygon points="69,73 111,73 105,104 75,104" fill={`url(#${id("mid")})`} />
          <polygon points="90,73 111,73 105,104 90,104" fill={`url(#${id("shade")})`} opacity="0.55" />
        </g>
      )}

      {/* ── 21. Sâu bệnh hại và IPM ── */}
      {variant === "ipmShield" && (
        <g>
          <ellipse cx="90" cy="109" rx="48" ry="10.5" fill={`url(#${id("shadow")})`} />
          <path
            d="M90 22 L125 34 V63 C125 83 110 98 90 105 C70 98 55 83 55 63 V34 Z"
            fill={`url(#${id("light")})`}
            stroke="#dce5f2"
            strokeWidth="1.2"
          />
          <path
            d="M90 42 C104 42 110 56 101 70 C93 81 79 80 76 68 C73 55 80 42 90 42 Z"
            fill={`url(#${id("shade")})`}
          />
          <path d="M82 77 Q90 63 97 49" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {/* ── 22. Thôn / Tổ bản đồ gấp ── */}
      {variant === "villageMap" && (
        <g>
          <ellipse cx="90" cy="110" rx="52" ry="10.5" fill={`url(#${id("shadow")})`} />
          <polygon points="40,44 68,36 68,96 40,104" fill={`url(#${id("mid")})`} />
          <polygon points="68,36 102,46 102,106 68,96" fill={`url(#${id("shade")})`} />
          <polygon points="102,46 134,36 134,96 102,106" fill={`url(#${id("light")})`} />
          <polyline points="48,74 68,66 102,78 126,64" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {/* Ghim vị trí 3D nổi phía trên */}
          <path
            d="M90 16 C80.6 16 73 23.6 73 33 C73 45.2 90 60 90 60 C90 60 107 45.2 107 33 C107 23.6 99.4 16 90 16 Z"
            fill={`url(#${id("deep")})`}
          />
          <circle cx="90" cy="33" r="6.5" fill="#ffffff" />
        </g>
      )}

      {/* ── 23. Lớp tập huấn ── */}
      {variant === "trainingCap" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          {/* Mũ học thuật / tập huấn */}
          <polygon points="90,26 138,46 90,66 42,46" fill={`url(#${id("mid")})`} />
          <path d="M62 55 V76 C62 84 75 90 90 90 C105 90 118 84 118 76 V55 L90 67 Z" fill={`url(#${id("shade")})`} />
          <line x1="132" y1="48" x2="132" y2="74" stroke="#b5c4db" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="132" cy="76" r="3.5" fill="#b5c4db" />
          {/* Cuộn chứng chỉ nhỏ phía trước */}
          <rect x="68" y="88" width="52" height="14" rx="7" fill={`url(#${id("paper")})`} stroke="#d5dfee" strokeWidth="1" />
          <rect x="90" y="88" width="8" height="14" fill="#cbd6e8" />
        </g>
      )}

      {/* ── 24. Bản đồ vùng / Địa bàn chưa bật ── */}
      {variant === "mapCompass" && (
        <g>
          <ellipse cx="90" cy="109" rx="52" ry="11" fill={`url(#${id("shadow")})`} />
          <polygon points="90,54 144,76 90,98 36,76" fill={`url(#${id("light")})`} />
          <polygon points="36,76 90,98 90,105 36,83" fill={`url(#${id("mid")})`} />
          <polygon points="144,76 90,98 90,105 144,83" fill={`url(#${id("shade")})`} />
          {/* La bàn nổi phía trên mặt địa hình */}
          <circle cx="90" cy="48" r="22" fill={`url(#${id("paper")})`} stroke="#ccd7e9" strokeWidth="2" />
          <polygon points="90,31 96,48 90,45 84,48" fill="#aebdd6" />
          <polygon points="90,65 96,48 90,51 84,48" fill="#dce5f2" />
        </g>
      )}

      {/* ── 25. Lưới thửa đất canh tác ── */}
      {variant === "parcelGrid" && (
        <g>
          <ellipse cx="90" cy="108" rx="54" ry="11" fill={`url(#${id("shadow")})`} />
          {/* 4 ô thửa đất phối cảnh isometric */}
          <polygon points="90,34 118,47 90,60 62,47" fill={`url(#${id("paper")})`} />
          <polygon points="58,50 86,63 58,76 30,63" fill={`url(#${id("light")})`} />
          <polygon points="122,50 150,63 122,76 94,63" fill={`url(#${id("mid")})`} />
          <polygon points="90,66 118,79 90,92 62,79" fill={`url(#${id("shade")})`} />
          <polygon points="62,79 90,92 90,99 62,86" fill="#bcc9de" />
          <polygon points="118,79 90,92 90,99 118,86" fill="#aebdd5" />
        </g>
      )}

      {/* ── 26. Ranh giới vùng trồng chi tiết ── */}
      {variant === "zonePin" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          <polygon
            points="52,68 78,52 122,58 134,84 96,100 46,90"
            fill={`url(#${id("light")})`}
            stroke="#c4d1e6"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <circle cx="52" cy="68" r="3.5" fill="#b7c6dc" />
          <circle cx="78" cy="52" r="3.5" fill="#b7c6dc" />
          <circle cx="122" cy="58" r="3.5" fill="#b7c6dc" />
          <circle cx="134" cy="84" r="3.5" fill="#b7c6dc" />
          <circle cx="96" cy="100" r="3.5" fill="#b7c6dc" />
          <path
            d="M90 22 C81.7 22 75 28.7 75 37 C75 47.8 90 61 90 61 C90 61 105 47.8 105 37 C105 28.7 98.3 22 90 22 Z"
            fill={`url(#${id("shade")})`}
          />
          <circle cx="90" cy="37" r="5.5" fill="#ffffff" />
        </g>
      )}

      {/* ── 27. Nhật ký phun thuốc ── */}
      {variant === "sprayer" && (
        <g>
          <ellipse cx="88" cy="109" rx="48" ry="10.5" fill={`url(#${id("shadow")})`} />
          {/* Cần bơm chữ T */}
          <line x1="78" y1="22" x2="78" y2="36" stroke="#b5c4db" strokeWidth="3.2" strokeLinecap="round" />
          <rect x="66" y="19" width="24" height="5" rx="2.5" fill={`url(#${id("deep")})`} />
          {/* Bình phun 3D */}
          <rect x="58" y="36" width="40" height="66" rx="10" fill={`url(#${id("light")})`} />
          <rect x="64" y="54" width="28" height="28" rx="3" fill={`url(#${id("paper")})`} />
          <line x1="69" y1="63" x2="87" y2="63" stroke="#cbd6e8" strokeWidth="2" strokeLinecap="round" />
          <line x1="69" y1="71" x2="81" y2="71" stroke="#d5dfee" strokeWidth="2" strokeLinecap="round" />
          {/* Vòi phun và hạt sương */}
          <path d="M98 52 C112 52 114 38 126 36" stroke="#bccadd" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          <circle cx="136" cy="31" r="3" fill="#d5dfee" />
          <circle cx="144" cy="37" r="2.5" fill="#dfe7f4" />
          <circle cx="137" cy="42" r="2.5" fill="#dfe7f4" />
        </g>
      )}

      {/* ── 28. Cảnh báo / Vi phạm ── */}
      {variant === "warningFlag" && (
        <g>
          <ellipse cx="90" cy="109" rx="48" ry="10.5" fill={`url(#${id("shadow")})`} />
          <path
            d="M84.8 27 C87.1 23 92.9 23 95.2 27 L131 89 C133.3 93 130.4 98 125.8 98 H54.2 C49.6 98 46.7 93 49 89 Z"
            fill={`url(#${id("shade")})`}
          />
          <path
            d="M85.5 31 C87.5 27.5 92.5 27.5 94.5 31 L126 86 C128 89.5 125.5 94 121.5 94 H58.5 C54.5 94 52 89.5 54 86 Z"
            fill={`url(#${id("paper")})`}
          />
          <rect x="87.2" y="48" width="5.6" height="22" rx="2.8" fill="#b5c4db" />
          <circle cx="90" cy="78.5" r="3.2" fill="#b5c4db" />
        </g>
      )}

      {/* ── 29. Việc cần làm ngay (HomeTab) ── */}
      {variant === "taskCheck" && (
        <g>
          <ellipse cx="90" cy="109" rx="48" ry="10.5" fill={`url(#${id("shadow")})`} />
          <g transform="rotate(-6 88 64)">
            <rect x="52" y="28" width="68" height="72" rx="7" fill={`url(#${id("mid")})`} />
            <rect x="56" y="26" width="68" height="72" rx="7" fill={`url(#${id("paper")})`} stroke="#dde6f3" strokeWidth="1" />
            <line x1="70" y1="45" x2="108" y2="45" stroke="#d3deee" strokeWidth="3" strokeLinecap="round" />
            <line x1="70" y1="58" x2="102" y2="58" stroke="#dce5f2" strokeWidth="3" strokeLinecap="round" />
            <line x1="70" y1="71" x2="92" y2="71" stroke="#e4ebf6" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="118" cy="82" r="16" fill={`url(#${id("shade")})`} />
          <polyline points="110.5,82 116,87.5 126,76.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* ── 30. Kiểm nghiệm phòng Lab ── */}
      {variant === "labFlask" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          {/* Bình tam giác Erlenmeyer 3D */}
          <rect x="73" y="28" width="20" height="6" rx="3" fill={`url(#${id("shade")})`} />
          <path
            d="M77 34 H89 V52 L111 91 C113.6 95.6 110.3 101 105 101 H61 C55.7 101 52.4 95.6 55 91 L77 52 Z"
            fill={`url(#${id("paper")})`}
            stroke="#d5dfee"
            strokeWidth="1.3"
          />
          <path d="M68 75 H98 L106 90 C107.4 92.6 105.5 96 102.5 96 H63.5 C60.5 96 58.6 92.6 60 90 Z" fill={`url(#${id("mid")})`} />
          {/* Ống nghiệm đứng bên phải */}
          <rect x="118" y="42" width="14" height="54" rx="7" fill={`url(#${id("light")})`} stroke="#d3deee" strokeWidth="1.2" />
          <rect x="120.5" y="66" width="9" height="27" rx="4.5" fill={`url(#${id("shade")})`} />
          <circle cx="83" cy="20" r="3" fill="#dce5f2" />
          <circle cx="92" cy="15" r="2.2" fill="#e5ecf7" />
        </g>
      )}

      {/* ── 31. Lịch kiểm tra thực địa dạng lịch để bàn ── */}
      {variant === "fieldCalendar" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          <polygon points="52,36 128,36 134,100 46,100" fill={`url(#${id("shade")})`} />
          <rect x="50" y="32" width="80" height="68" rx="6" fill={`url(#${id("paper")})`} stroke="#dce5f2" strokeWidth="1" />
          <path d="M50 38 A6 6 0 0 1 56 32 H124 A6 6 0 0 1 130 38 V49 H50 Z" fill={`url(#${id("mid")})`} />
          <rect x="66" y="25" width="6" height="13" rx="3" fill="#b5c4db" />
          <rect x="108" y="25" width="6" height="13" rx="3" fill="#b5c4db" />
          <rect x="62" y="58" width="12" height="10" rx="2" fill="#dfe7f4" />
          <rect x="84" y="58" width="12" height="10" rx="2" fill="#cbd6e8" />
          <rect x="106" y="58" width="12" height="10" rx="2" fill="#dfe7f4" />
          <rect x="62" y="75" width="12" height="10" rx="2" fill="#e6ecf6" />
          <rect x="84" y="75" width="12" height="10" rx="2" fill="#e6ecf6" />
        </g>
      )}

      {/* ── 32. Hồ sơ chờ duyệt (Con dấu phê duyệt) ── */}
      {variant === "stampSeal" && (
        <g>
          <ellipse cx="90" cy="109" rx="52" ry="10.5" fill={`url(#${id("shadow")})`} />
          {/* Tờ hồ sơ dưới đế */}
          <polygon points="44,82 136,82 144,102 36,102" fill={`url(#${id("paper")})`} stroke="#dce5f2" strokeWidth="1" />
          <ellipse cx="90" cy="92" rx="22" ry="5" fill="#dfe7f4" />
          {/* Tay cầm và đế con dấu 3D */}
          <circle cx="90" cy="30" r="11" fill={`url(#${id("mid")})`} />
          <path d="M84 39 H96 L99 63 H81 Z" fill={`url(#${id("shade")})`} />
          <rect x="66" y="63" width="48" height="10" rx="4" fill={`url(#${id("light")})`} stroke="#cbd6e8" strokeWidth="1" />
          <rect x="70" y="73" width="40" height="4" rx="1.5" fill="#b5c4db" />
        </g>
      )}

      {/* ── 33. Cấp lại mật khẩu (Chìa khóa 3D) ── */}
      {variant === "keyReset" && (
        <g>
          <ellipse cx="90" cy="108" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          <g transform="rotate(-18 90 64)">
            <circle cx="64" cy="66" r="20" fill={`url(#${id("mid")})`} />
            <circle cx="60" cy="66" r="7" fill="#ffffff" />
            <rect x="82" y="61" width="52" height="10" rx="4" fill={`url(#${id("light")})`} stroke="#ccd7e8" strokeWidth="1" />
            <rect x="112" y="71" width="7" height="10" rx="2" fill={`url(#${id("shade")})`} />
            <rect x="124" y="71" width="7" height="13" rx="2" fill={`url(#${id("shade")})`} />
          </g>
        </g>
      )}

      {/* ── 34. Hồ sơ đăng ký gắn hộ / Thẻ định danh ── */}
      {variant === "userBadge" && (
        <g>
          <ellipse cx="90" cy="110" rx="46" ry="10" fill={`url(#${id("shadow")})`} />
          <rect x="82" y="18" width="16" height="14" rx="3" fill={`url(#${id("deep")})`} />
          <rect x="56" y="28" width="68" height="76" rx="7" fill={`url(#${id("paper")})`} stroke="#d8e2f0" strokeWidth="1.2" />
          <circle cx="90" cy="54" r="11" fill={`url(#${id("mid")})`} />
          <path d="M72 79 C72 70 80 66 90 66 C100 66 108 70 108 79 Z" fill={`url(#${id("shade")})`} />
          <rect x="70" y="87" width="40" height="4.5" rx="2.2" fill="#dce5f2" />
        </g>
      )}

      {/* ── 35. Tính lịch thu hoạch ── */}
      {variant === "harvestCalendar" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          <rect x="46" y="30" width="72" height="68" rx="6" fill={`url(#${id("paper")})`} stroke="#d8e2f0" strokeWidth="1.2" />
          <path d="M46 36 A6 6 0 0 1 52 30 H112 A6 6 0 0 1 118 36 V46 H46 Z" fill={`url(#${id("shade")})`} />
          <rect x="58" y="55" width="14" height="12" rx="2.5" fill="#e4ebf6" />
          <rect x="78" y="55" width="14" height="12" rx="2.5" fill="#cbd6e8" />
          <rect x="58" y="73" width="14" height="12" rx="2.5" fill="#e4ebf6" />
          {/* Biểu tượng trái cây thu hoạch nổi góc phải */}
          <circle cx="118" cy="80" r="16" fill={`url(#${id("mid")})`} />
          <path d="M118 60 V66" stroke="#aebdd5" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M112 80 L116.5 84.5 L125 75.5" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* ── 36. Hợp đồng liên kết bao tiêu ── */}
      {variant === "contractDoc" && (
        <g>
          <ellipse cx="90" cy="110" rx="48" ry="10.5" fill={`url(#${id("shadow")})`} />
          <g transform="rotate(-7 82 64)">
            <rect x="52" y="28" width="58" height="72" rx="4" fill={`url(#${id("mid")})`} />
          </g>
          <rect x="64" y="26" width="60" height="76" rx="4" fill={`url(#${id("paper")})`} stroke="#dce5f2" strokeWidth="1" />
          <line x1="74" y1="42" x2="112" y2="42" stroke="#cfd9ea" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="74" y1="52" x2="112" y2="52" stroke="#dce5f2" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="74" y1="62" x2="100" y2="62" stroke="#e4ebf6" strokeWidth="2.2" strokeLinecap="round" />
          {/* Huy hiệu niêm phong hợp đồng */}
          <polygon points="103,86 99,102 106,98 113,102 109,86" fill="#bcc9de" />
          <circle cx="106" cy="82" r="8.5" fill={`url(#${id("shade")})`} />
          <circle cx="106" cy="82" r="4" fill="#ffffff" />
        </g>
      )}

      {/* ── 37. Biển mã số vùng trồng PUC & Hạn ngạch ── */}
      {variant === "pucSignboard" && (
        <g>
          <ellipse cx="90" cy="109" rx="52" ry="10.5" fill={`url(#${id("shadow")})`} />
          <rect x="63" y="72" width="6" height="32" rx="2" fill="#bcc9de" />
          <rect x="111" y="72" width="6" height="32" rx="2" fill="#bcc9de" />
          <rect x="46" y="28" width="88" height="48" rx="5" fill={`url(#${id("paper")})`} stroke="#d3deee" strokeWidth="1.4" />
          <rect x="54" y="36" width="24" height="24" rx="3" fill={`url(#${id("mid")})`} />
          <rect x="59" y="41" width="6" height="6" rx="1" fill="#ffffff" />
          <rect x="67" y="41" width="6" height="6" rx="1" fill="#ffffff" />
          <rect x="59" y="49" width="6" height="6" rx="1" fill="#ffffff" />
          <line x1="86" y1="42" x2="122" y2="42" stroke="#c7d3e7" strokeWidth="3" strokeLinecap="round" />
          <line x1="86" y1="52" x2="114" y2="52" stroke="#dbe4f3" strokeWidth="2.6" strokeLinecap="round" />
          <line x1="86" y1="62" x2="106" y2="62" stroke="#e4ebf6" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}

      {/* ── 38. Doanh nghiệp & Cơ sở đóng gói Packhouse ── */}
      {variant === "packhouse" && (
        <g>
          <ellipse cx="90" cy="109" rx="54" ry="11" fill={`url(#${id("shadow")})`} />
          <polygon points="90,26 140,50 140,102 40,102 40,50" fill={`url(#${id("light")})`} />
          <polygon points="34,52 90,24 146,52 141,58 90,32 39,58" fill={`url(#${id("shade")})`} />
          <rect x="64" y="64" width="52" height="38" rx="2" fill={`url(#${id("paper")})`} />
          <line x1="64" y1="73" x2="116" y2="73" stroke="#dce5f2" strokeWidth="1.6" />
          <line x1="64" y1="82" x2="116" y2="82" stroke="#dce5f2" strokeWidth="1.6" />
          <rect x="81" y="44" width="18" height="8" rx="2" fill="#cbd6e8" />
        </g>
      )}

      {/* ── 39. Bản tin Hợp tác xã ── */}
      {variant === "newspaper" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          <path d="M116 38 H130 A4 4 0 0 1 134 42 V94 A8 8 0 0 1 126 102 H116 Z" fill={`url(#${id("shade")})`} />
          <path d="M48 28 H116 A4 4 0 0 1 120 32 V94 A8 8 0 0 0 126 102 H56 A8 8 0 0 1 48 94 Z" fill={`url(#${id("paper")})`} stroke="#dce5f2" strokeWidth="1" />
          <rect x="58" y="38" width="50" height="8" rx="2" fill="#cbd6e8" />
          <rect x="58" y="52" width="24" height="22" rx="2.5" fill={`url(#${id("mid")})`} />
          <line x1="88" y1="55" x2="108" y2="55" stroke="#d5dfee" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="88" y1="63" x2="108" y2="63" stroke="#dfe7f4" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="88" y1="71" x2="104" y2="71" stroke="#dfe7f4" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="58" y1="84" x2="108" y2="84" stroke="#e4ebf6" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {/* ── 40. Duyệt xóa thành viên / Kiểm soát chéo ── */}
      {variant === "memberRemove" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          <rect x="46" y="42" width="88" height="44" rx="5" fill={`url(#${id("light")})`} />
          <polygon points="40,68 140,68 132,102 48,102" fill={`url(#${id("mid")})`} />
          <rect x="58" y="28" width="64" height="36" rx="4" fill={`url(#${id("paper")})`} stroke="#dce5f2" strokeWidth="1" />
          <circle cx="76" cy="46" r="7" fill="#cbd6e8" />
          <line x1="90" y1="43" x2="110" y2="43" stroke="#d5dfee" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="90" y1="50" x2="104" y2="50" stroke="#e2e9f4" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="78" y="81" width="24" height="5" rx="2.5" fill="#ffffff" />
        </g>
      )}

      {/* ── 41. Phát thông báo hệ thống / Bảo trì ── */}
      {variant === "megaphone" && (
        <g>
          <ellipse cx="90" cy="109" rx="48" ry="10" fill={`url(#${id("shadow")})`} />
          <g transform="rotate(-12 88 64)">
            <rect x="46" y="56" width="16" height="20" rx="4" fill={`url(#${id("deep")})`} />
            <polygon points="60,54 118,34 118,98 60,78" fill={`url(#${id("light")})`} />
            <ellipse cx="118" cy="66" rx="6" ry="32" fill={`url(#${id("shade")})`} />
            <rect x="56" y="75" width="11" height="22" rx="4" fill={`url(#${id("mid")})`} />
          </g>
          <path d="M134 46 A20 20 0 0 1 138 68" stroke="#c5d2e6" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M143 40 A28 28 0 0 1 148 74" stroke="#d8e2f0" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {/* ── 42. Hộp thông báo đã đọc ── */}
      {variant === "inboxRead" && (
        <g>
          <ellipse cx="90" cy="109" rx="50" ry="10.5" fill={`url(#${id("shadow")})`} />
          <polygon points="48,54 60,34 120,34 132,54" fill={`url(#${id("deep")})`} />
          <rect x="62" y="24" width="56" height="38" rx="4" fill={`url(#${id("paper")})`} stroke="#dce5f2" strokeWidth="1" />
          <polyline points="82,42 88,48 99,36" stroke="#b9c8de" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M44 54 H72 C72 63 108 63 108 54 H136 L128 102 H52 Z" fill={`url(#${id("light")})`} />
          <path d="M48 76 H132 L128 102 H52 Z" fill={`url(#${id("mid")})`} opacity="0.55" />
        </g>
      )}

      {/* ── 43. Báo cáo thống kê trống ── */}
      {variant === "reportChart" && (
        <g>
          <ellipse cx="90" cy="109" rx="52" ry="10.5" fill={`url(#${id("shadow")})`} />
          <rect x="44" y="26" width="92" height="76" rx="6" fill={`url(#${id("paper")})`} stroke="#dce5f2" strokeWidth="1.2" />
          <rect x="60" y="68" width="14" height="22" rx="2.5" fill={`url(#${id("mid")})`} />
          <rect x="83" y="50" width="14" height="40" rx="2.5" fill={`url(#${id("shade")})`} />
          <rect x="106" y="38" width="14" height="52" rx="2.5" fill={`url(#${id("deep")})`} />
          <line x1="54" y1="90" x2="126" y2="90" stroke="#cfd9ea" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* ── 44. Phiên đăng nhập thiết bị ── */}
      {variant === "sessionDevices" && (
        <g>
          <ellipse cx="90" cy="109" rx="54" ry="10.5" fill={`url(#${id("shadow")})`} />
          {/* Màn hình máy tính */}
          <rect x="42" y="32" width="76" height="52" rx="5" fill={`url(#${id("mid")})`} />
          <rect x="47" y="37" width="66" height="40" rx="3" fill={`url(#${id("paper")})`} />
          <polygon points="34,84 126,84 132,92 28,92" fill={`url(#${id("shade")})`} />
          {/* Điện thoại di động ghép đôi */}
          <rect x="110" y="50" width="28" height="50" rx="5" fill={`url(#${id("light")})`} stroke="#cbd6e8" strokeWidth="1.4" />
          <rect x="114" y="56" width="20" height="36" rx="2.5" fill={`url(#${id("paper")})`} />
          <circle cx="124" cy="96" r="1.8" fill="#b5c4db" />
        </g>
      )}
    </svg>
  );
}

/**
 * Khối hiển thị trạng thái rỗng đồng nhất toàn hệ thống (bảng, danh sách thẻ, ngăn kéo thông báo, tra cứu QR).
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
