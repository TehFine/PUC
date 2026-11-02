import type { Option } from "@/components/ui/form/fields";
import type { FertilizerCategory, FertilizerStatus, PesticideStatus, VarietyCategory, VarietyStatus } from "@/types/catalog";

interface Label {
  label: string;
  badge: string;
}

export const PESTICIDE_STATUS: Record<PesticideStatus, Label> = {
  allowed: { label: "Được phép", badge: "badge-green" },
  restricted: { label: "Hạn chế", badge: "badge-gold" },
  banned: { label: "Bị cấm", badge: "badge-red" },
};

export const FERTILIZER_CATEGORY: Record<FertilizerCategory, string> = {
  organic: "Hữu cơ vi sinh",
  npk: "NPK đa lượng",
  foliar: "Trung vi lượng",
  microbial: "Cải tạo rễ",
  restricted: "Kiểm soát đặc biệt",
};

export const FERTILIZER_STATUS: Record<FertilizerStatus, Label> = {
  encouraged: { label: "Khuyến khích", badge: "badge-green" },
  allowed: { label: "Được phép", badge: "badge-gold" },
  warning: { label: "Cảnh báo", badge: "badge-red" },
};

export const VARIETY_CATEGORY: Record<VarietyCategory, string> = {
  export: "Xuất khẩu chủ lực",
  native: "Bản địa chất lượng",
  premium: "Nhập khẩu cao cấp",
  new: "Giống mới tiềm năng",
};

export const VARIETY_STATUS: Record<VarietyStatus, Label> = {
  allowed: { label: "Đạt chuẩn GACC", badge: "badge-green" },
  encouraged: { label: "Khuyến khích", badge: "badge-gold" },
  trial: { label: "Trồng thử nghiệm", badge: "badge-blue" },
};

export const toOptions = <K extends string>(map: Record<K, string | Label>): Option[] =>
  (Object.entries(map) as [K, string | Label][]).map(([value, label]) => ({
    value,
    label: typeof label === "string" ? label : label.label,
  }));
