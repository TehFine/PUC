"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { translateViToZh, usePortalLang } from "./i18n";
import type { PortalTabId } from "./PortalApp";
import { RadialPngIcon } from "./RadialIcons";
import { Sheet, useSheetClose } from "./ui";

/**
 * Tìm kiếm "chức năng" cho bà con: gõ bất kỳ chữ nào (có dấu hay không dấu đều được) để được gợi ý
 * đúng tab và thao tác cần làm, ví dụ "bón phân" → Ghi nhật ký canh tác, "tem" → Lô hàng & mã QR.
 * Chạy hoàn toàn trên máy (không gọi API) nên phản hồi tức thì kể cả khi mạng yếu.
 */

/** Thao tác cụ thể bên trong một tab (tab tự mở đúng màn hình / biểu mẫu khi nhận được). */
export type PortalAction =
  | "journal-add"
  | "spray-add"
  | "spray-list"
  | "decl-add"
  | "harvest-lots"
  | "learn-pesticides"
  | "learn-fertilizers"
  | "learn-varieties";

/** Thao tác ở cấp toàn cổng (mở hộp thoại trên thanh đầu trang). */
export type PortalGlobalAction = "notifications" | "profile" | "password" | "support";

export type PortalSearchTarget =
  | { kind: "tab"; tab: PortalTabId; action?: PortalAction }
  | { kind: "global"; action: PortalGlobalAction };

interface SearchEntry {
  id: string;
  title: string;
  /** Tên mục hiển thị bên dưới, giúp bà con biết sẽ được đưa tới đâu. */
  where: string;
  keywords: string;
  target: PortalSearchTarget;
  /** Hiện trong "Gợi ý thường dùng" khi chưa gõ gì. */
  popular?: boolean;
}

const ENTRIES: SearchEntry[] = [
  {
    id: "journal-add",
    title: "Ghi nhật ký canh tác",
    where: "Nhật ký › Canh tác",
    keywords: "ghi nhat ky canh tac cong viec bon phan tuoi nuoc lam co cat tia cham soc vuon chup anh them moi",
    target: { kind: "tab", tab: "diary", action: "journal-add" },
    popular: true,
  },
  {
    id: "spray-add",
    title: "Ghi phun thuốc",
    where: "Nhật ký › Phun thuốc",
    keywords: "phun thuoc xit sau benh bvtv bao ve thuc vat tru sau nam benh ghi them moi",
    target: { kind: "tab", tab: "diary", action: "spray-add" },
    popular: true,
  },
  {
    id: "journal-list",
    title: "Xem nhật ký đã ghi",
    where: "Nhật ký",
    keywords: "xem lich su nhat ky da ghi danh sach xoa sua",
    target: { kind: "tab", tab: "diary" },
  },
  {
    id: "spray-list",
    title: "Lịch sử phun thuốc & thời gian cách ly",
    where: "Nhật ký › Phun thuốc",
    keywords: "lich su phun thuoc cach ly ngay thu hoach an toan",
    target: { kind: "tab", tab: "diary", action: "spray-list" },
  },
  {
    id: "violations",
    title: "Vi phạm & báo đã khắc phục",
    where: "Nhật ký",
    keywords: "vi pham canh bao khac phuc nhac nho loi phan hoi",
    target: { kind: "tab", tab: "diary" },
    popular: true,
  },
  {
    id: "decl-add",
    title: "Khai báo thu hái",
    where: "Thu hoạch › Khai báo",
    keywords: "khai bao thu hai thu hoach hai trai san luong kg can trong luong loai a b ban",
    target: { kind: "tab", tab: "stamps", action: "decl-add" },
    popular: true,
  },
  {
    id: "harvest-lots",
    title: "Lô hàng, tem & mã QR",
    where: "Thu hoạch › Lô hàng",
    keywords: "lo hang tem ma qr truy xuat nguon goc kich hoat xuat khau",
    target: { kind: "tab", tab: "stamps", action: "harvest-lots" },
  },
  {
    id: "plots",
    title: "Xem thửa đất trên bản đồ",
    where: "Thửa đất",
    keywords: "thua dat ban do vuon dien tich ranh gioi vi tri dinh vi gps ve tinh",
    target: { kind: "tab", tab: "plots" },
    popular: true,
  },
  {
    id: "signboard",
    title: "Bảng tên vườn & mã QR thửa",
    where: "Thửa đất",
    keywords: "bang ten bien vuon ma qr thua in",
    target: { kind: "tab", tab: "plots" },
  },
  {
    id: "lab-tests",
    title: "Kết quả kiểm nghiệm, in phiếu",
    where: "Kiểm nghiệm",
    keywords: "ket qua kiem nghiem xet nghiem du luong mau phieu chung nhan dat in pdf",
    target: { kind: "tab", tab: "inspection" },
    popular: true,
  },
  {
    id: "schedule",
    title: "Lịch kiểm tra, lấy mẫu",
    where: "Kiểm nghiệm",
    keywords: "lich kiem tra lay mau can bo den ngay hen phuc tra",
    target: { kind: "tab", tab: "inspection" },
  },
  {
    id: "pesticides",
    title: "Thuốc được phép / bị cấm",
    where: "Kiến thức › Thuốc BVTV",
    keywords: "danh muc thuoc bvtv duoc phep bi cam han che hoat chat mrl",
    target: { kind: "tab", tab: "learn", action: "learn-pesticides" },
  },
  {
    id: "fertilizers",
    title: "Phân bón khuyến cáo",
    where: "Kiến thức › Phân bón",
    keywords: "phan bon npk huu co la vi sinh lieu luong",
    target: { kind: "tab", tab: "learn", action: "learn-fertilizers" },
  },
  {
    id: "varieties",
    title: "Giống sầu riêng",
    where: "Kiến thức › Giống cây",
    keywords: "giong sau rieng cay musang king ri6 monthong dona",
    target: { kind: "tab", tab: "learn", action: "learn-varieties" },
  },
  {
    id: "home",
    title: "Trang chủ, nhắc việc",
    where: "Trang chủ",
    keywords: "trang chu tong quan nhac viec nhac nho thong ke",
    target: { kind: "tab", tab: "home" },
  },
  {
    id: "notifications",
    title: "Xem thông báo từ HTX",
    where: "Thông báo",
    keywords: "thong bao tin nhan chuong moi",
    target: { kind: "global", action: "notifications" },
  },
  {
    id: "profile",
    title: "Thông tin tài khoản, hộ",
    where: "Tài khoản",
    keywords: "tai khoan ho so ca nhan ten so dien thoai cccd thong tin ho",
    target: { kind: "global", action: "profile" },
  },
  {
    id: "password",
    title: "Đổi mật khẩu",
    where: "Tài khoản",
    keywords: "doi mat khau quen bao mat dang nhap 密码 修改密码",
    target: { kind: "global", action: "password" },
  },
  {
    id: "language",
    title: "Đổi ngôn ngữ (Tiếng Việt / 中文)",
    where: "Tài khoản",
    keywords: "doi ngon ngu tieng trung tieng viet chinese zhongwen yuyan 中文 语言 切换语言",
    target: { kind: "global", action: "profile" },
  },
  {
    id: "support",
    title: "Gọi hỗ trợ, hotline HTX",
    where: "Hỗ trợ",
    keywords: "ho tro giup do goi dien hotline lien he can bo thac mac 帮助 支持 热线",
    target: { kind: "global", action: "support" },
    popular: true,
  },
];

/** Bỏ dấu tiếng Việt, chữ thường: "Bón phân" → "bon phan". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX = ENTRIES.map((entry) => {
  const zhTitle = translateViToZh(entry.title);
  const zhWhere = translateViToZh(entry.where);
  const haystack = normalize(`${entry.title} ${entry.where} ${zhTitle} ${zhWhere} ${entry.keywords}`);
  return { entry, haystack, words: haystack.split(" ") };
});

/**
 * Chấm điểm: mỗi chữ gõ vào phải xuất hiện trong mục (ở đầu một từ được điểm cao hơn giữa từ).
 * Không đòi hỏi gõ đúng thứ tự hay đủ dấu, gõ 1 chữ cái vẫn có gợi ý.
 */
function searchEntries(query: string): SearchEntry[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const titleOf = (e: SearchEntry) => normalize(e.title);

  return INDEX.map(({ entry, haystack, words }) => {
    let score = 0;
    for (const token of tokens) {
      if (words.some((w) => w === token)) score += 3;
      else if (words.some((w) => w.startsWith(token))) score += 2;
      else if (haystack.includes(token)) score += 1;
      else return { entry, score: 0 };
    }
    if (titleOf(entry).includes(tokens.join(" "))) score += 2;
    return { entry, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.entry);
}

const POPULAR = ENTRIES.filter((e) => e.popular);

function ResultList({ items, onPick }: { items: SearchEntry[]; onPick: (target: PortalSearchTarget) => void }) {
  const { t } = usePortalLang();
  return (
    <ul className="pt-search-results">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" className="pt-search-result" onClick={() => onPick(item.target)}>
            <span className="pt-search-result-text">
              <strong>{t(item.title)}</strong>
              <span>{t(item.where)}</span>
            </span>
            <DetailArrowIcon className="pt-search-result-arrow" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchPanel({ onPick }: { onPick: (target: PortalSearchTarget) => void }) {
  const close = useSheetClose();
  const { isZh, t } = usePortalLang();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartY = useRef<number | null>(null);
  const results = useMemo(() => searchEntries(query), [query]);
  const hasQuery = query.trim().length > 0;

  // Máy tính có chuột: tự đặt con trỏ vào ô nhập sau khi popup trượt lên xong.
  // Điện thoại: KHÔNG tự focus — bàn phím chỉ hiện khi bà con chạm vào ô nhập,
  // tránh bàn phím bật lên giữa lúc popup đang trượt gây giật / khựng khung hình.
  useEffect(() => {
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!canHover) return;
    const timer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 360);
    return () => clearTimeout(timer);
  }, []);

  const hideKeyboard = () => {
    if (inputRef.current && document.activeElement === inputRef.current) inputRef.current.blur();
  };

  // Ghi nhận lựa chọn rồi đóng popup; thao tác thật chạy sau khi popup đóng hẳn (xem PortalSearchButton)
  const pick = (target: PortalSearchTarget) => {
    hideKeyboard();
    onPick(target);
    if (close) close();
  };

  return (
    <div
      className="pt-search-panel"
      // Vuốt danh sách gợi ý thì cụp bàn phím (như ứng dụng gốc) để xem được nhiều gợi ý hơn
      onTouchStart={(e) => {
        touchStartY.current = e.target === inputRef.current ? null : e.touches[0]?.clientY ?? null;
      }}
      onTouchMove={(e) => {
        const startY = touchStartY.current;
        const y = e.touches[0]?.clientY;
        if (startY !== null && y !== undefined && Math.abs(y - startY) > 10) {
          touchStartY.current = null;
          hideKeyboard();
        }
      }}
    >
      <label className="pt-search-field">
        <RadialPngIcon src="/search.png" size={18} />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("Bạn muốn làm gì?")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              pick(results[0].target);
            }
          }}
          aria-label={t("Tìm chức năng")}
        />
        {hasQuery && (
          <button
            type="button"
            className="pt-search-clear-btn"
            onClick={(e) => {
              e.preventDefault();
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label={t("Xóa từ khóa tìm kiếm")}
          >
            <CloseCircleIcon size={20} />
          </button>
        )}
      </label>

      {hasQuery && results.length === 0 && (
        <p className="pt-search-empty-note">
          {isZh ? (
            <>
              未找到与“<strong>{query.trim()}</strong>”匹配的功能。请尝试其他关键词，或从下方推荐中选择：
            </>
          ) : (
            <>
              Chưa tìm thấy “<strong>{query.trim()}</strong>”. Bà con thử gõ chữ khác, hoặc chọn gợi ý bên dưới:
            </>
          )}
        </p>
      )}

      <h3 className="pt-search-heading">{t("Gợi ý")}</h3>

      <div className="pt-search-scroll">
        {!hasQuery && <ResultList items={POPULAR} onPick={pick} />}

        {hasQuery && results.length > 0 && <ResultList items={results} onPick={pick} />}

        {hasQuery && results.length === 0 && (
          <ResultList
            items={[...ENTRIES.filter((e) => e.id === "support"), ...POPULAR.filter((e) => e.id !== "support")]}
            onPick={pick}
          />
        )}
      </div>
    </div>
  );
}

/** Nút kính lúp trên thanh đầu trang + popup tìm kiếm chức năng. */
export function PortalSearchButton({
  onPick,
  id,
  className = "",
}: {
  onPick: (target: PortalSearchTarget) => void;
  id?: string;
  /** Lớp bổ sung để chọn vị trí hiển thị (desktop / mobile). */
  className?: string;
}) {
  const { t } = usePortalLang();
  const [open, setOpen] = useState(false);
  // Chỉ thực hiện thao tác sau khi popup tìm kiếm đã trượt xuống xong: tránh mở chồng popup khác
  // (hồ sơ, đổi mật khẩu…) khi popup này chưa đóng, làm lệch khóa cuộn trang.
  const pendingRef = useRef<PortalSearchTarget | null>(null);
  const handleClosed = () => {
    setOpen(false);
    const target = pendingRef.current;
    pendingRef.current = null;
    if (target) onPick(target);
  };
  return (
    <>
      <button
        id={id}
        type="button"
        className={`pt-notif-btn pt-search-btn ${className}`.trim()}
        onClick={() => setOpen(true)}
        aria-label={t("Tìm chức năng")}
        title={t("Tìm chức năng")}
      >
        <RadialPngIcon src="/search.png" size={18} />
      </button>
      {open && (
        <Sheet title={t("Tìm chức năng")} onClose={handleClosed} className="pt-search-sheet">
          <SearchPanel
            onPick={(target) => {
              pendingRef.current = target;
            }}
          />
        </Sheet>
      )}
    </>
  );
}
