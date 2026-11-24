export type TraceLang = "vi" | "en" | "zh";
export type TraceTargetKind = "lot" | "box" | "fruit" | "plot" | "household" | "generic";

const TRACE_LANG_STORAGE_KEY = "puc_trace_lang";
const TRACE_KIND_HINTS_STORAGE_KEY = "puc_trace_kind_hints";

const memoryTraceKindHints = new Map<string, Exclude<TraceTargetKind, "generic">>();

function normalizeHintKey(raw: string | null | undefined): string {
  return String(raw || "").trim().toUpperCase();
}

export function inferTraceKindFromCode(rawCode: string | null | undefined): TraceTargetKind {
  const cleaned = String(rawCode || "").trim();
  if (!cleaned) return "generic";
  if (/^(?:LH|LOT)-[A-Za-z0-9_-]*-T\d+$/i.test(cleaned) || /^(?:THUNG|BOX|CARTON)-/i.test(cleaned)) {
    return "box";
  }
  if (
    /^(?:LH|LOT)-[A-Za-z0-9_-]*-(?:Q|F)\d+$/i.test(cleaned) ||
    /^(?:SR|TEM|FR|QUA)-/i.test(cleaned)
  ) {
    return "fruit";
  }
  if (/^(?:LH|LOT|EVT)-/i.test(cleaned)) {
    return "lot";
  }
  if (/^[A-Za-z0-9_-]+-H\d{2,5}$/i.test(cleaned) || /^HO-[A-Za-z0-9_-]+$/i.test(cleaned)) {
    return "household";
  }
  if (/^(?:EK|CN|TH|KB|DL|VN-DLOR|\d{2}-PUC)[A-Za-z0-9_-]*$/i.test(cleaned)) {
    return "plot";
  }
  return "generic";
}

export function rememberTraceKindHint(
  codeOrToken: string | null | undefined,
  kind: Exclude<TraceTargetKind, "generic">,
): void {
  const key = normalizeHintKey(codeOrToken);
  if (!key) return;
  memoryTraceKindHints.set(key, kind);
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(TRACE_KIND_HINTS_STORAGE_KEY);
    const parsed: Record<string, Exclude<TraceTargetKind, "generic">> = raw ? JSON.parse(raw) : {};
    delete parsed[key];
    parsed[key] = kind;
    const entries = Object.entries(parsed);
    const trimmed = entries.length > 120 ? Object.fromEntries(entries.slice(-120)) : parsed;
    window.sessionStorage.setItem(TRACE_KIND_HINTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Bỏ qua nếu trình duyệt chặn sessionStorage
  }
}

export function resolveInitialTraceKind(rawCode: string | null | undefined): TraceTargetKind {
  const key = normalizeHintKey(rawCode);
  if (!key) return "generic";
  const inMem = memoryTraceKindHints.get(key);
  if (inMem) return inMem;
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(TRACE_KIND_HINTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        const saved = parsed[key];
        if (
          saved === "lot" ||
          saved === "box" ||
          saved === "fruit" ||
          saved === "plot" ||
          saved === "household"
        ) {
          memoryTraceKindHints.set(key, saved);
          return saved;
        }
      }
    } catch {
      // Bỏ qua nếu không đọc được sessionStorage
    }
  }
  return inferTraceKindFromCode(rawCode);
}

export function getTraceLoadingLabel(kind: TraceTargetKind, lang: TraceLang): string {
  if (lang === "zh") {
    switch (kind) {
      case "household":
        return "正在加载成员农户溯源档案...";
      case "plot":
        return "正在加载果园地块溯源档案...";
      case "box":
        return "正在加载包装箱溯源档案...";
      case "fruit":
        return "正在加载单果溯源档案...";
      case "lot":
        return "正在加载批次溯源档案...";
      default:
        return "正在加载溯源核验档案...";
    }
  }
  if (lang === "en") {
    switch (kind) {
      case "household":
        return "Loading member grower traceability dossier...";
      case "plot":
        return "Loading orchard plot traceability dossier...";
      case "box":
        return "Loading carton box traceability dossier...";
      case "fruit":
        return "Loading single-fruit traceability dossier...";
      case "lot":
        return "Loading shipment lot traceability dossier...";
      default:
        return "Loading origin traceability dossier...";
    }
  }
  switch (kind) {
    case "household":
      return "Đang tải hồ sơ truy xuất nông hộ...";
    case "plot":
      return "Đang tải hồ sơ truy xuất thửa đất...";
    case "box":
      return "Đang tải hồ sơ truy xuất thùng đóng gói...";
    case "fruit":
      return "Đang tải hồ sơ truy xuất trái sầu riêng...";
    case "lot":
      return "Đang tải hồ sơ truy xuất lô hàng...";
    default:
      return "Đang tải hồ sơ truy xuất nguồn gốc...";
  }
}

export function getRevokedAlertCopy(
  kind: TraceTargetKind,
  lang: TraceLang,
): { title: string; desc: string } {
  if (kind === "household") {
    if (lang === "zh") {
      return {
        title: "成员农户暂停采收通知",
        desc: "该农户果园当前由越南 Cư Né 合作社暂停商品果采收资格以进行技术复核。请联系合作社核实详情。",
      };
    }
    if (lang === "en") {
      return {
        title: "GROWER HOUSEHOLD SUSPENSION NOTICE",
        desc: "This member household is currently paused from commercial harvest intake by Cư Né Cooperative for technical review.",
      };
    }
    return {
      title: "THÔNG BÁO TẠM DỪNG LIÊN KẾT THU HOẠCH NÔNG HỘ",
      desc: "Hộ thành viên này đang tạm dừng tiếp nhận thu hoạch thương mại theo quyết định của Hợp tác xã Cư Né để rà soát kỹ thuật.",
    };
  }
  if (kind === "plot") {
    if (lang === "zh") {
      return {
        title: "果园地块暂停效用通知",
        desc: "该果园地块当前由越南 Cư Né 合作社暂停采收出货资格以进行技术复核。请联系合作社核实详情。",
      };
    }
    if (lang === "en") {
      return {
        title: "ORCHARD PLOT SUSPENSION NOTICE",
        desc: "This orchard plot is currently suspended from commercial harvest by Cư Né Cooperative for technical review.",
      };
    }
    return {
      title: "THÔNG BÁO TẠM DỪNG HIỆU LỰC THỬA ĐẤT",
      desc: "Thửa đất này đang tạm dừng thu hoạch thương mại theo quyết định của Hợp tác xã Cư Né để rà soát kỹ thuật. Đề nghị liên hệ Hợp tác xã để đối chiếu.",
    };
  }
  if (kind === "box") {
    if (lang === "zh") {
      return {
        title: "包装箱召回通知（停止流通）",
        desc: "该包装箱或所属批次已由越南 Cư Né 合作社通知召回。请立即停止流通并联系合作社核实。",
      };
    }
    if (lang === "en") {
      return {
        title: "CARTON BOX RECALL NOTICE",
        desc: "This carton box or its parent lot has been recalled by Cư Né Cooperative. Please halt distribution immediately and contact the Cooperative.",
      };
    }
    return {
      title: "THÔNG BÁO THU HỒI THÙNG ĐÓNG GÓI",
      desc: "Thùng đóng gói này hoặc lô hàng liên quan đã ngừng lưu thông theo quyết định của Hợp tác xã Cư Né. Đề nghị tạm dừng phân phối và liên hệ Hợp tác xã để đối chiếu.",
    };
  }
  if (kind === "fruit") {
    if (lang === "zh") {
      return {
        title: "单果溯源签召回通知",
        desc: "该单果溯源签已由越南 Cư Né 合作社停用或召回。请暂停销售并联系合作社核实。",
      };
    }
    if (lang === "en") {
      return {
        title: "FRUIT TAG RECALL NOTICE",
        desc: "This single-fruit traceability tag has been recalled or deactivated by Cư Né Cooperative. Please halt sale and contact the Cooperative.",
      };
    }
    return {
      title: "THÔNG BÁO THU HỒI TEM TRÁI SẦU RIÊNG",
      desc: "Tem định danh trái sầu riêng này đã ngừng hiệu lực theo quyết định của Hợp tác xã Cư Né. Đề nghị tạm dừng lưu thông và liên hệ Hợp tác xã để đối chiếu.",
    };
  }
  return {
    title: TRACE_UI_COPY[lang].alerts.revokedTitle,
    desc: TRACE_UI_COPY[lang].alerts.revokedDefaultDesc,
  };
}

export function getScanAnomalyAlertCopy(
  reason: "multi_country" | "high_frequency",
  kind: TraceTargetKind,
  lang: TraceLang,
): { title: string; desc: string } {
  if (kind === "plot" || kind === "household") {
    if (lang === "zh") {
      return reason === "multi_country"
        ? {
          title: "提示：该果园地块牌近期在多地被扫码查询",
          desc: "系统记录到该地块二维码在多个地区同时被访问。如需开展现场核查，请结合乡政府或合作社签发的考察通行码进行GPS边界核对。",
        }
        : {
          title: "提示：该果园地块二维码近期查询次数较多",
          desc: "该果园地块牌近期出现高频查询。现场考察人员可启用考察通行码验证果园实时位置。",
        };
    }
    if (lang === "en") {
      return reason === "multi_country"
        ? {
          title: "NOTICE: ORCHARD PLOT QR QUERIED ACROSS REGIONS",
          desc: "This orchard signboard code was queried across multiple regions simultaneously. Visiting delegations may activate an audit pass to verify live GPS parcel position.",
        }
        : {
          title: "NOTICE: REPEATED QUERIES ON ORCHARD PLOT QR",
          desc: "Frequent lookups were recorded on this orchard signboard code. Field inspectors may verify on-site parcel coordinates with an audit pass.",
        };
    }
    return reason === "multi_country"
      ? {
        title: "LƯU Ý TRA CỨU BẢNG QR THỬA ĐẤT TỪ NHIỀU KHU VỰC",
        desc: "Mã bảng QR thửa đất này được ghi nhận tra cứu đồng thời từ nhiều khu vực. Đoàn kiểm tra thực tế có thể nhập mã thẻ đoàn để đối chiếu tọa độ trực tiếp tại vườn.",
      }
      : {
        title: "LƯU Ý TRA CỨU LẶP LẠI BẢNG QR THỬA ĐẤT",
        desc: "Mã bảng QR thửa đất này đang có tần suất tra cứu cao. Đoàn công tác tại vườn có thể đối chiếu vị trí thực tế hoặc liên hệ Hợp tác xã Cư Né khi cần xác nhận.",
      };
  }

  if (kind === "fruit") {
    if (lang === "zh") {
      return reason === "multi_country"
        ? {
          title: "提示：请核对单果溯源签完整性",
          desc: "系统记录到该单果溯源码在多个地区同时被查询。请仔细检查果柄防伪溯源签是否完好无损。",
        }
        : {
          title: "提示：该单果溯源码近期查询次数较多",
          desc: "该单果溯源码近期出现多次重复查询。请检查果柄标签完整性，必要时联系授权门店或 Cư Né 合作社核实。",
        };
    }
    if (lang === "en") {
      return reason === "multi_country"
        ? {
          title: "NOTICE: PLEASE VERIFY FRUIT TAG INTEGRITY",
          desc: "This single-fruit code was looked up across multiple regions simultaneously. Please inspect the physical stem tag for tampering.",
        }
        : {
          title: "NOTICE: REPEATED FRUIT TAG LOOKUPS",
          desc: "Frequent lookups were recorded for this single-fruit tag. Please verify the physical stem seal with your authorized retailer or Cư Né Cooperative.",
        };
    }
    return reason === "multi_country"
      ? {
        title: "LƯU Ý KIỂM TRA TEM ĐỊNH DANH TRÊN TRÁI",
        desc: "Mã tem trái này được ghi nhận tra cứu đồng thời từ nhiều khu vực khác nhau. Quý khách vui lòng kiểm tra tình trạng nguyên vẹn của tem gắn trên cuống trái.",
      }
      : {
        title: "LƯU Ý TRA CỨU LẶP LẠI MÃ TEM TRÁI",
        desc: "Mã tem trái này đang có nhiều lượt tra cứu bất thường. Quý khách vui lòng kiểm tra tem vật lý trên trái và liên hệ điểm phân phối chính thức khi cần xác nhận.",
      };
  }

  return {
    title:
      reason === "multi_country"
        ? TRACE_UI_COPY[lang].alerts.multiCountryTitle
        : TRACE_UI_COPY[lang].alerts.highFreqTitle,
    desc:
      reason === "multi_country"
        ? TRACE_UI_COPY[lang].alerts.multiCountryDesc(2, "")
        : TRACE_UI_COPY[lang].alerts.highFreqDesc(1, 1),
  };
}

export function getScopeDeniedCopy(
  kind: TraceTargetKind,
  lang: TraceLang,
  viewerName: string,
  roleLabel: string,
  scopeReason: string | null,
): { title: string; desc: string } {
  if (lang === "zh") {
    const targetZh =
      kind === "household"
        ? "该成员农户"
        : kind === "plot"
          ? "该果园地块"
          : kind === "box"
            ? "该包装箱"
            : kind === "fruit"
              ? "该单果溯源签"
              : "该批次";
    return {
      title: `您无权查看${targetZh}的内部详细数据`,
      desc: `当前登录账号 ${viewerName}（${roleLabel}）不在${targetZh}所属企业或管辖范围内，系统仅显示公开溯源档案。`,
    };
  }
  if (lang === "en") {
    const targetEn =
      kind === "household"
        ? "this grower household"
        : kind === "plot"
          ? "this orchard plot"
          : kind === "box"
            ? "this carton box"
            : kind === "fruit"
              ? "this fruit tag"
              : "this shipment lot";
    return {
      title: `You do not have permission to view internal details for ${targetEn}`,
      desc: `Signed in as ${viewerName} (${roleLabel}), but ${targetEn} is outside your assigned company or regional scope. Showing the public dossier only.`,
    };
  }
  const targetVi =
    kind === "household"
      ? "nông hộ này"
      : kind === "plot"
        ? "thửa đất này"
        : kind === "box"
          ? "thùng đóng gói này"
          : kind === "fruit"
            ? "tem trái sầu riêng này"
            : "lô hàng này";
  return {
    title: `Bạn không có quyền xem chi tiết nội bộ của ${targetVi}`,
    desc: `Tài khoản ${viewerName} (${roleLabel}) đã đăng nhập nhưng ${targetVi} nằm ngoài phạm vi được phân quyền.${scopeReason ? ` Lý do: ${scopeReason}` : ""
      } Hệ thống chỉ hiển thị bản công khai.`,
  };
}

export function getTraceQrAlt(code: string, kind: TraceTargetKind, lang: TraceLang): string {
  if (lang === "zh") {
    switch (kind) {
      case "household":
        return `成员农户 ${code} 溯源二维码`;
      case "plot":
        return `果园地块 ${code} 溯源二维码`;
      case "box":
        return `包装箱 ${code} 溯源二维码`;
      case "fruit":
        return `单果 ${code} 溯源二维码`;
      default:
        return `批次 ${code} 溯源二维码`;
    }
  }
  if (lang === "en") {
    switch (kind) {
      case "household":
        return `Traceability QR for member grower ${code}`;
      case "plot":
        return `Traceability QR for orchard plot ${code}`;
      case "box":
        return `Traceability QR for carton ${code}`;
      case "fruit":
        return `Traceability QR for fruit tag ${code}`;
      default:
        return `Traceability QR for lot ${code}`;
    }
  }
  switch (kind) {
    case "household":
      return `Mã QR truy xuất nông hộ ${code}`;
    case "plot":
      return `Mã QR truy xuất thửa đất ${code}`;
    case "box":
      return `Mã QR truy xuất thùng đóng gói ${code}`;
    case "fruit":
      return `Mã QR truy xuất trái sầu riêng ${code}`;
    default:
      return `Mã QR truy xuất lô hàng ${code}`;
  }
}

export function detectInitialTraceLang(): TraceLang {
  if (typeof window === "undefined") return "vi";

  try {
    const queryLang = new URLSearchParams(window.location.search).get("lang")?.trim().toLowerCase();
    if (queryLang === "vi" || queryLang === "en" || queryLang === "zh") {
      return queryLang;
    }
    if (queryLang?.startsWith("zh")) return "zh";
  } catch {
    // Bỏ qua lỗi đọc query string
  }

  try {
    const saved = window.localStorage.getItem(TRACE_LANG_STORAGE_KEY)?.trim().toLowerCase();
    if (saved === "vi" || saved === "en" || saved === "zh") {
      return saved;
    }
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage (ví dụ chế độ WebView nghiêm ngặt)
  }

  const candidates: string[] = [];
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
  }

  for (const raw of candidates) {
    const norm = String(raw || "").trim().toLowerCase();
    if (!norm) continue;
    if (norm.startsWith("zh")) return "zh";
    if (norm.startsWith("vi")) return "vi";
    if (norm.startsWith("en")) return "en";
  }

  return "vi";
}

export function persistTraceLang(lang: TraceLang): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRACE_LANG_STORAGE_KEY, lang);
  } catch {
    // Không chặn hiển thị nếu WebView tắt bộ nhớ cục bộ
  }
}

export function formatTraceDate(dateStr: string | null | undefined, lang: TraceLang): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    if (lang === "zh") {
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(d);
    }
    if (lang === "en") {
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(d);
    }
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    });
  } catch {
    return dateStr;
  }
}

export function formatTraceDateTime(dateStr: string | null | undefined, lang: TraceLang): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const locale = lang === "zh" ? "zh-CN" : lang === "en" ? "en-GB" : "vi-VN";
    return d.toLocaleString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour12: false,
      timeZone: "Asia/Ho_Chi_Minh",
    });
  } catch {
    return dateStr;
  }
}

export function formatTraceNumber(num: number, lang: TraceLang): string {
  const locale = lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : "vi-VN";
  return Number(num || 0).toLocaleString(locale);
}

export interface TraceUiCopy {
  langBar: {
    label: string;
    liveVerifiedBadge: string;
    liveAlertBadge: string;
  };
  topbar: {
    brand: string;
    lookupOther: string;
    home: string;
  };
  loadingLabel: string;
  errorState: {
    invalidCode: string;
    notFound: (code: string) => string;
    serverError: string;
    timeoutError: string;
    networkError: string;
    title: string;
    inputPlaceholder: string;
    searchBtn: string;
  };
  alerts: {
    revokedTitle: string;
    revokedDefaultDesc: string;
    realtimeSuspendedTitle: string;
    realtimeSuspendedDesc: (params: {
      pucCode: string;
      pucStatusText: string;
      packhouseCode: string;
      phcStatusText: string;
      note: string | null;
    }) => string;
    unverifiedTitle: string;
    unverifiedDesc: string;
    multiCountryTitle: string;
    multiCountryDesc: (count: number, countries: string) => string;
    highFreqTitle: string;
    highFreqDesc: (scans24h: number, sources24h: number) => string;
  };
  watermark: {
    top: string;
    bottom: string;
    valid: string;
    revoked: string;
    pending: string;
    unverified: string;
  };
  hero: {
    lotCodeLabel: string;
    varietyLabel: string;
    fallbackCodeLabel: string;
    unitSpecLabel: string;
    lotScaleLabel: string;
    gradeFmt: (grade: string) => string;
    tonsFmt: (kgText: string, tons: number) => string;
    qrCaption: string;
    qrAlt: (code: string) => string;
    scanStatFmt: (total: string, last24h: string, countriesText: string | null) => string;
    countriesSuffixFmt: (countries: string) => string;
    verifiedAtFmt: (dt: string) => string;
  };
  timeline: {
    title: string;
    badge: string;
    sub: string;
    ariaLabel: string;
    responsibleLabel: string;
    statusCompleted: string;
    statusWarning: string;
    statusCurrent: string;
    statusUpcoming: string;
  };
  zone: {
    title: string;
    nameLabel: string;
    pucLabel: string;
    linkedZonesSuffix: (count: number) => string;
    adminLocationLabel: string;
    statusRowLabel: string;
    validUntilFmt: (statusText: string, validUntil: string) => string;
    coarseMapTitle: (pucCode: string) => string;
    coarseTabTerrain: string;
    coarseTabGrid: string;
    coarseRadiusLabel: string;
    coarseCompassNorth: string;
    coarseCenterTag: string;
    coarsePrivacyNote: string;
  };
  producerPackhouse: {
    title: string;
    producerLabel: string;
    groupLabel: string;
    householdsLabel: string;
    representedByCoop: string;
    packhouseNameLabel: string;
    packhouseCodeLabel: string;
    packhouseStatusLabel: string;
    packhouseAddressLabel: string;
    consentNoteWithNames: string;
    consentNoteHidden: string;
  };
  lab: {
    title: string;
    badgeUpdating: string;
    badgeFail: string;
    badgePass: string;
    emptyNote: string;
    certNoLabel: string;
    dateFmt: (d: string) => string;
    orgFmt: (org: string) => string;
    cdName: string;
    cdDetailFmt: (val: number) => string;
    yoName: string;
    yoPositive: string;
    yoNegative: string;
    resName: string;
    resDetailFmt: (res: number, chlor: number | null | undefined) => string;
    pillPass: string;
    pillFail: string;
    pillSafe: string;
    pillUnsafe: string;
    viewScanFmt: (code: string) => string;
    scanArchivedNote: string;
    accreditationFmt: (code: string) => string;
    externalCodeFmt: (code: string) => string;
    externalVerifyBtn: string;
  };
  governance: {
    kicker: string;
    portalLinkLabel: string;
    supervisoryLabel: string;
    attestationTitle: string;
    attestationBadge: string;
    partyStatusVerified: string;
    partyStatusWarning: string;
    partyStatusPending: string;
  };
  integrity: {
    title: string;
    badgeVerified: string;
    badgeAlert: string;
    sub: string;
    chainAlgorithmLabel: string;
    sealedRecordsLabel: string;
    sealedRecordsFmt: (total: number, journals: number, sprays: number, minutes: number) => string;
    onTimeRateLabel: string;
    onTimeRateFmt: (pct: number, lateCount: number) => string;
    gpsEvidenceLabel: string;
    gpsEvidenceFmt: (gpsCount: number) => string;
    merkleAnchorLabel: string;
    latestSealLabel: string;
    massBalanceTitle: string;
    massBalanceBadgeOk: string;
    massBalanceBadgeWarn: string;
    massBalanceSeasonFmt: (year: number, plots: number, trees: number) => string;
    massBalanceUsedFmt: (usedTons: number, capTons: number, pct: number) => string;
    massBalanceRemainFmt: (remainTons: number) => string;
    massBalanceNote: string;
  };
  fieldAudit: {
    passBannerKicker: string;
    passBannerActiveFmt: (delegation: string, org: string, expiresText: string) => string;
    passBannerExitBtn: string;
    passInvalidNote: string;
    cardKicker: string;
    cardTitleFmt: (plotCode: string) => string;
    privacyBadge: string;
    privacySub: string;
    plotSpecsTitle: string;
    farmerRepLabel: string;
    pucZoneLabel: string;
    areaTreesLabel: string;
    areaTreesFmt: (ha: number, trees: number) => string;
    varietyYearLabel: string;
    phiSafeBadge: string;
    phiLockedFmt: (safeFrom: string | null) => string;
    quotaTitle: string;
    quotaUsedFmt: (usedKg: string, capKg: string, pct: number) => string;
    quotaAssessedFmt: (unit: string, dateText: string) => string;
    gpsMapTitle: string;
    gpsVerifyBtn: string;
    gpsVerifyingBtn: string;
    gpsUnsupportedErr: string;
    gpsPermissionErr: string;
    gpsInsideTitle: string;
    gpsNearTitle: (distM: number) => string;
    gpsOutsideTitle: (distM: number) => string;
    gpsAccuracyFmt: (accM: number | null) => string;
    recentCheckinsTitle: string;
    noCheckinsYet: string;
    sealedDiaryTitle: string;
    sealedSprayTitle: string;
    sealedMinutesTitle: string;
    lateTag: string;
    onTimeTag: string;
    gpsVerifiedTag: string;
    emptyRecords: string;
  };
  processPhyto: {
    title: string;
    harvestDateLabel: string;
    packDateLabel: string;
    exportDateLabel: string;
    standardLabel: string;
    standardValue: string;
    complianceLabel: string;
    complianceConfirmedText: string;
    complianceReviewingText: string;
    inspectionLabel: string;
    phytoLabel: string;
    phytoIssuedFmt: (certNo: string, dateText: string | null) => string;
    phytoDefaultPending: string;
    nationalStandardNote: string;
  };
  authHint: {
    audienceLabel: string;
    actionLabel: string;
    compactBtn: string;
    text: string;
    loginBtn: string;
  };
  scopeAccess: {
    deniedTitle: string;
    deniedDesc: (viewerName: string, roleLabel: string, scopeReason: string | null) => string;
    switchAccountBtn: string;
  };
  actions: {
    home: string;
    print: string;
    copied: string;
    share: string;
  };
  footer: {
    line1: string;
    line2: string;
    line3: string;
  };
}

export const TRACE_UI_COPY: Record<TraceLang, TraceUiCopy> = {
  vi: {
    langBar: {
      label: "Ngôn ngữ",
      liveVerifiedBadge: "Trạng thái PUC - PHC thời gian thực: Hợp lệ",
      liveAlertBadge: "Cảnh báo trạng thái thời gian thực PUC - PHC",
    },
    topbar: {
      brand: "HTX Cư Né",
      lookupOther: "Tra cứu mã khác",
      home: "Trang chủ",
    },
    loadingLabel: "Đang tải hồ sơ truy xuất nguồn gốc...",
    errorState: {
      invalidCode: "Mã truy xuất không hợp lệ.",
      notFound: (code) =>
        `Không tìm thấy hồ sơ cho mã "${code}". Quý khách vui lòng kiểm tra lại mã lô hàng, mã thùng, tem trái, mã thửa đất hoặc mã hộ.`,
      serverError: "Chưa thể tải dữ liệu lúc này. Quý khách vui lòng thử lại sau.",
      timeoutError: "Kết nối mạng quá chậm hoặc gián đoạn. Quý khách vui lòng thử tải lại trang.",
      networkError: "Không thể kết nối mạng để tra cứu. Quý khách vui lòng kiểm tra kết nối và thử lại.",
      title: "Chưa tìm thấy thông tin",
      inputPlaceholder: "Nhập mã lô, mã thùng, tem trái, mã thửa hoặc mã hộ...",
      searchBtn: "Tìm kiếm",
    },
    alerts: {
      revokedTitle: "THÔNG BÁO THU HỒI LÔ HÀNG",
      revokedDefaultDesc:
        "Lô hàng hoặc tem truy xuất này đã ngừng lưu thông theo quyết định của Hợp tác xã Cư Né. Đề nghị tạm dừng phân phối và liên hệ Hợp tác xã để đối chiếu.",
      realtimeSuspendedTitle: "CẢNH BÁO TRẠNG THÁI VÙNG TRỒNG HOẶC CƠ SỞ ĐÓNG GÓI",
      realtimeSuspendedDesc: ({ pucCode, pucStatusText, packhouseCode, phcStatusText, note }) =>
        `Trạng thái hiện tại: Mã vùng trồng ${pucCode} (${pucStatusText}), Cơ sở đóng gói ${packhouseCode} (${phcStatusText}).${note ? ` Ghi chú quản lý: ${note}` : " Đề nghị đối chiếu hồ sơ pháp lý trước khi tiếp nhận lưu thông."
        }`,
      unverifiedTitle: "HỒ SƠ ĐANG CHỜ KIỂM CHỨNG",
      unverifiedDesc:
        "Trang công khai chỉ hiển thị dữ liệu đã được Hợp tác xã Cư Né kiểm tra và phê duyệt; thông tin tự khai chưa duyệt được ẩn để bảo đảm tính xác thực.",
      multiCountryTitle: "LƯU Ý KIỂM TRA TEM NIÊM PHONG HÀNG HÓA",
      multiCountryDesc: () =>
        "Mã truy xuất này được ghi nhận tra cứu đồng thời từ nhiều khu vực khác nhau. Quý khách vui lòng kiểm tra kỹ tình trạng nguyên vẹn của tem niêm phong và đối chiếu mã lô in trên nhãn thùng.",
      highFreqTitle: "LƯU Ý TRA CỨU LẶP LẠI NHIỀU LẦN",
      highFreqDesc: () =>
        "Mã truy xuất này đang có nhiều lượt tra cứu bất thường. Quý khách vui lòng kiểm tra tem nhãn trên bao bì và liên hệ đơn vị phân phối chính thức hoặc Hợp tác xã Cư Né khi cần xác nhận.",
    },
    watermark: {
      top: "HTX SẦU RIÊNG CƯ NÉ",
      bottom: "TRUY XUẤT NGUỒN GỐC",
      valid: "LÔ HỢP LỆ",
      revoked: "ĐÃ THU HỒI",
      pending: "ĐANG KIỂM ĐỊNH",
      unverified: "CHỜ KIỂM CHỨNG",
    },
    hero: {
      lotCodeLabel: "Mã lô truy xuất (In trên nhãn)",
      varietyLabel: "Giống sầu riêng",
      fallbackCodeLabel: "Mã thùng / tem chữ dự phòng",
      unitSpecLabel: "Quy cách đơn vị",
      lotScaleLabel: "Quy mô lô hàng",
      gradeFmt: (grade) => `Hạng ${grade}`,
      tonsFmt: (kgText, tons) => `${kgText} kg (${tons} tấn)`,
      qrCaption: "Mã QR truy xuất lô hàng",
      qrAlt: (code) => `Mã QR truy xuất nguồn gốc lô ${code}`,
      scanStatFmt: () => "",
      countriesSuffixFmt: (countries) => `Khu vực: ${countries}`,
      verifiedAtFmt: (dt) => `Thời điểm tra cứu: ${dt}`,
    },
    timeline: {
      title: "Hành trình lô hàng từ vùng trồng đến xuất khẩu",
      badge: "5 bước truy xuất",
      sub: "Ghi nhận đầy đủ mốc thời gian và đơn vị chịu trách nhiệm ở từng khâu theo yêu cầu truy xuất xuyên suốt.",
      ariaLabel: "Dòng thời gian 5 bước",
      responsibleLabel: "Đơn vị chịu trách nhiệm:",
      statusCompleted: "Đã xác nhận",
      statusWarning: "Cảnh báo",
      statusCurrent: "Đang thực hiện",
      statusUpcoming: "Chờ cập nhật",
    },
    zone: {
      title: "Vùng trồng nguyên liệu",
      nameLabel: "Tên vùng trồng",
      pucLabel: "Mã số vùng trồng (PUC)",
      linkedZonesSuffix: (count) => ` (kèm ${count} vùng liên kết)`,
      adminLocationLabel: "Xã / Huyện / Tỉnh",
      statusRowLabel: "Trạng thái hiệu lực",
      validUntilFmt: (statusText, validUntil) => `${statusText} (Hiệu lực đến ${validUntil})`,
      coarseMapTitle: (pucCode) => `Bản đồ vệ tinh vùng trồng (${pucCode})`,
      coarseTabTerrain: "Vệ tinh",
      coarseTabGrid: "Giao thông",
      coarseRadiusLabel: "Phạm vi vùng trồng khoảng 2.5 km",
      coarseCompassNorth: "B",
      coarseCenterTag: "Khu vực trung tâm vùng trồng",
      coarsePrivacyNote:
        "Ảnh vệ tinh thực địa khu vực vùng trồng đã đăng ký; không hiển thị ranh giới từng thửa đất cá nhân nhằm bảo mật thông tin nông hộ.",
    },
    producerPackhouse: {
      title: "Đơn vị sản xuất & Cơ sở đóng gói",
      producerLabel: "Đơn vị sản xuất",
      groupLabel: "Nhóm vườn liên kết",
      householdsLabel: "Hộ thành viên (công khai)",
      representedByCoop: "Đại diện bởi Hợp tác xã Cư Né",
      packhouseNameLabel: "Cơ sở đóng gói",
      packhouseCodeLabel: "Mã số cơ sở đóng gói (PHC)",
      packhouseStatusLabel: "Trạng thái CSĐG hiện tại",
      packhouseAddressLabel: "Địa chỉ đóng gói",
      consentNoteWithNames:
        "Chỉ hiển thị tên các hộ thành viên đã duyệt đủ điều kiện và xác nhận đồng ý công khai trên mã QR.",
      consentNoteHidden:
        "Theo quy định bảo vệ dữ liệu cá nhân, thông tin hộ canh tác được đại diện bởi Hợp tác xã Cư Né.",
    },
    lab: {
      title: "Kiểm nghiệm an toàn thực phẩm (Đã kiểm chứng)",
      badgeUpdating: "Đang cập nhật",
      badgeFail: "Cảnh báo chỉ tiêu",
      badgePass: "Đạt chuẩn",
      emptyNote:
        "Chỉ hiển thị phiếu kiểm nghiệm đã được duyệt xác thực. Hiện đang chờ đồng bộ phiếu kết quả chính thức của lô hàng.",
      certNoLabel: "Số phiếu kiểm nghiệm",
      dateFmt: (d) => `Ngày ${d}`,
      orgFmt: (org) => `Phòng kiểm nghiệm: ${org}`,
      cdName: "Cadimi (Cd)",
      cdDetailFmt: (val) => `Kết quả: ${val} mg/kg (Ngưỡng tối đa: 0.05 mg/kg)`,
      yoName: "Vàng O (Auramine O)",
      yoPositive: "Kết quả: Dương tính",
      yoNegative: "Kết quả: Âm tính (Không phát hiện)",
      resName: "Dư lượng thuốc BVTV",
      resDetailFmt: (res, chlor) =>
        `Tổng hợp: ${res} mg/kg - Chlorpyrifos: ${chlor !== null && chlor !== undefined ? `${chlor} mg/kg` : "KPH (Không phát hiện)"
        }`,
      pillPass: "ĐẠT CHUẨN",
      pillFail: "VƯỢT NGƯỠNG",
      pillSafe: "AN TOÀN",
      pillUnsafe: "KHÔNG ĐẠT",
      viewScanFmt: (code) => `Xem bản scan giấy kiểm nghiệm gốc (${code})`,
      scanArchivedNote: "Bản scan giấy kiểm nghiệm có dấu đỏ đang lưu trữ tại hồ sơ lô đã duyệt của HTX Cư Né.",
      accreditationFmt: (code) => `Chuẩn công nhận: ${code}`,
      externalCodeFmt: (code) => `Mã đối chiếu độc lập: ${code}`,
      externalVerifyBtn: "Đối chiếu trên cổng Phòng kiểm nghiệm",
    },
    governance: {
      kicker: "Mô hình điểm Truy xuất nguồn gốc Cấp Xã - Tỉnh Đắk Lắk",
      portalLinkLabel: "Xem cổng thông tin Tỉnh",
      supervisoryLabel: "Đơn vị giám sát nhà nước:",
      attestationTitle: "Cơ chế Bảo chứng Độc lập 3 Bên (3-Party Attestation)",
      attestationBadge: "3 lớp kiểm chứng",
      partyStatusVerified: "Đã xác nhận",
      partyStatusWarning: "Cảnh báo",
      partyStatusPending: "Đang rà soát",
    },
    integrity: {
      title: "Đối chiếu Nhật ký Canh tác và Hạn ngạch Vùng trồng",
      badgeVerified: "Hồ sơ hợp lệ",
      badgeAlert: "Cần rà soát hồ sơ",
      sub: "Toàn bộ nhật ký canh tác, phun thuốc BVTV và biên bản kiểm tra đều được hệ thống ghi nhận tự động thời điểm thực tế nhằm đảm bảo minh bạch trước thu hoạch.",
      chainAlgorithmLabel: "Phương thức kiểm soát",
      sealedRecordsLabel: "Tổng bản ghi nhật ký",
      sealedRecordsFmt: (total, journals, sprays, minutes) =>
        `${total} bản ghi (${journals} nhật ký, ${sprays} đợt phun, ${minutes} biên bản)`,
      onTimeRateLabel: "Tỷ lệ ghi đúng hạn (<= 48h)",
      onTimeRateFmt: (pct, lateCount) =>
        lateCount > 0 ? `${pct}% (${lateCount} bản ghi bổ sung muộn có giải trình)` : `${pct}% (Không có bản ghi trễ hạn)`,
      gpsEvidenceLabel: "Ảnh hiện trường khớp GPS",
      gpsEvidenceFmt: (gpsCount) => `${gpsCount} ảnh chụp xác thực tọa độ tại thửa`,
      merkleAnchorLabel: "Mã neo gốc lô (Anchor)",
      latestSealLabel: "Bản ghi niêm phong mới nhất",
      massBalanceTitle: "Đối soát Hạn ngạch Sản lượng Vùng trồng (Mass-Balance)",
      massBalanceBadgeOk: "Trong trần hạn ngạch",
      massBalanceBadgeWarn: "Chạm ngưỡng trần",
      massBalanceSeasonFmt: (year, plots, trees) =>
        `Vụ ${year}: ${plots} thửa định danh (${trees.toLocaleString("vi-VN")} cây đang cho trái)`,
      massBalanceUsedFmt: (usedTons, capTons, pct) =>
        `Đã xuất: ${usedTons} / ${capTons} tấn (${pct}%)`,
      massBalanceRemainFmt: (remainTons) => `Hạn ngạch còn lại: ${remainTons} tấn`,
      massBalanceNote:
        "Hệ thống tự động khóa xuất hàng khi tổng sản lượng thu mua chạm trần thẩm định đầu vụ của từng thửa GIS, ngăn chặn triệt để việc trà trộn sầu riêng ngoài vùng vào mã PUC.",
    },
    fieldAudit: {
      passBannerKicker: "Chế độ Đoàn Thẩm định Thực địa",
      passBannerActiveFmt: (delegation, org, expiresText) =>
        `${delegation} (${org}), hiệu lực đến ${expiresText}`,
      passBannerExitBtn: "Thoát thẻ thẩm định",
      passInvalidNote: "Mã thẻ thẩm định không tồn tại, đã hết hạn hoặc đã ngừng hiệu lực.",
      cardKicker: "Hồ sơ Kiểm tra Thực địa Thửa đất (Bảng QR Tại Vườn)",
      cardTitleFmt: (plotCode) => `Thửa canh tác định danh ${plotCode}`,
      privacyBadge: "Bảo mật thông tin cá nhân nông hộ",
      privacySub:
        "Hiển thị sơ đồ ranh giới thửa đất, định mức sản lượng đầu vụ và nhật ký canh tác của thửa vườn phục vụ kiểm tra thực tế.",
      plotSpecsTitle: "Thông số định danh thửa vườn",
      farmerRepLabel: "Chủ hộ canh tác",
      pucZoneLabel: "Mã vùng trồng (PUC)",
      areaTreesLabel: "Quy mô thửa",
      areaTreesFmt: (ha, trees) => `${ha} ha (${trees} cây kinh doanh)`,
      varietyYearLabel: "Giống và năm trồng",
      phiSafeBadge: "Đủ thời gian cách ly an toàn",
      phiLockedFmt: (safeFrom) =>
        `Đang cách ly thuốc BVTV${safeFrom ? ` (An toàn từ ${safeFrom})` : ""}`,
      quotaTitle: "Định mức sản lượng đầu vụ của thửa",
      quotaUsedFmt: (usedKg, capKg, pct) => `Đã xuất: ${usedKg} / ${capKg} kg (${pct}%)`,
      quotaAssessedFmt: (unit, dateText) => `Đơn vị thẩm định: ${unit} (${dateText})`,
      gpsMapTitle: "Sơ đồ ranh giới thửa vườn và đối chiếu vị trí thực tế",
      gpsVerifyBtn: "Đối chiếu vị trí hiện tại ở vườn",
      gpsVerifyingBtn: "Đang xác định vị trí tại vườn...",
      gpsUnsupportedErr: "Thiết bị hoặc trình duyệt không hỗ trợ định vị.",
      gpsPermissionErr: "Không thể lấy vị trí. Vui lòng bật quyền vị trí trên điện thoại và thử lại.",
      gpsInsideTitle: "XÁC NHẬN TẠI VƯỜN: Đang đứng bên trong ranh giới thửa đất đã đăng ký",
      gpsNearTitle: (distM) =>
        `XÁC NHẬN TIẾP GIÁP: Đang đứng sát bờ ranh thửa đất (Cách ranh ${distM} m)`,
      gpsOutsideTitle: (distM) =>
        `NGOÀI RANH GIỚI THỬA: Vị trí hiện tại cách thửa đất này ${distM} m (Đang xem từ xa)`,
      gpsAccuracyFmt: (accM) => (accM ? `Độ chính xác khoảng ±${Math.round(accM)} m` : "Định vị trực tiếp trên thiết bị"),
      recentCheckinsTitle: "Nhật ký đoàn kiểm tra thực địa tại thửa",
      noCheckinsYet: "Chưa có lượt kiểm tra vị trí nào được ghi nhận tại thửa này.",
      sealedDiaryTitle: "Nhật ký canh tác của thửa",
      sealedSprayTitle: "Nhật ký sử dụng thuốc BVTV và thời gian cách ly",
      sealedMinutesTitle: "Biên bản kiểm tra thực địa của cán bộ xã và HTX",
      lateTag: "Ghi bổ sung muộn",
      onTimeTag: "Ghi đúng hạn",
      gpsVerifiedTag: "Xác nhận tại vườn",
      emptyRecords: "Chưa có bản ghi nào trong mục này.",
    },
    processPhyto: {
      title: "Quy trình sản xuất, Mốc ngày và Kiểm dịch",
      harvestDateLabel: "Ngày thu hoạch",
      packDateLabel: "Ngày sơ chế và đóng gói",
      exportDateLabel: "Ngày xuất lô",
      standardLabel: "Tiêu chuẩn áp dụng",
      standardValue: "VietGAP và Nghị định thư Kiểm dịch thực vật xuất khẩu",
      complianceLabel: "Xác nhận quy trình",
      complianceConfirmedText: "Tuân thủ quy trình canh tác và thời gian cách ly an toàn",
      complianceReviewingText: "Đang rà soát bổ sung hồ sơ trước xuất lô",
      inspectionLabel: "Giám sát vùng trồng",
      phytoLabel: "Giấy kiểm dịch thực vật",
      phytoIssuedFmt: (certNo, dateText) =>
        dateText ? `${certNo} (Cấp ${dateText})` : certNo,
      phytoDefaultPending: "Cấp theo từng lô xuất khẩu",
      nationalStandardNote:
        "Chỉ hiển thị dữ liệu chính thức đã được Hợp tác xã Cư Né kiểm tra, đáp ứng yêu cầu truy xuất nguồn gốc nông sản xuất khẩu.",
    },
    authHint: {
      audienceLabel: "Dành cho đối tác và cơ quan quản lý:",
      actionLabel: "Đăng nhập",
      compactBtn: "Dành cho đối tác và cơ quan quản lý: Đăng nhập",
      text: "Dành cho Cơ sở đóng gói, Nhà phân phối và Cơ quan quản lý: Đăng nhập để xem hồ sơ truy xuất mở rộng theo phạm vi quản lý (mọi lượt xem đều ghi nhật ký kiểm toán).",
      loginBtn: "Dành cho đối tác và cơ quan quản lý: Đăng nhập",
    },
    scopeAccess: {
      deniedTitle: "Bạn không có quyền xem chi tiết lô này",
      deniedDesc: (viewerName, roleLabel, scopeReason) =>
        `Tài khoản ${viewerName} (${roleLabel}) đã đăng nhập nhưng lô hàng này nằm ngoài phạm vi được phân quyền.${scopeReason ? ` Lý do: ${scopeReason}` : ""
        } Hệ thống chỉ hiển thị bản công khai.`,
      switchAccountBtn: "Đổi tài khoản",
    },
    actions: {
      home: "Trang chủ",
      print: "In hồ sơ / Lưu PDF",
      copied: "Đã sao chép liên kết",
      share: "Sao chép đường dẫn QR",
    },
    footer: {
      line1: "Hệ thống quản lý vùng trồng và truy xuất nguồn gốc sầu riêng điện tử",
      line2: "Hợp Tác Xã Kinh Doanh - Dịch Vụ Tổng Hợp Cư Né (Tỉnh Đắk Lắk, Việt Nam)",
      line3:
        "Hồ sơ truy xuất nguồn gốc chính thức do Hợp tác xã Cư Né kiểm chứng và phát hành.",
    },
  },

  en: {
    langBar: {
      label: "Language",
      liveVerifiedBadge: "Growing Zone & Packhouse Status: Active",
      liveAlertBadge: "Growing Zone / Packhouse Status Alert",
    },
    topbar: {
      brand: "Cư Né Cooperative",
      lookupOther: "Lookup Code",
      home: "Home",
    },
    loadingLabel: "Loading origin traceability dossier...",
    errorState: {
      invalidCode: "Invalid traceability code.",
      notFound: (code) =>
        `No traceability record found for "${code}". Please check the lot, carton, fruit tag, orchard plot, or household code.`,
      serverError: "Unable to load traceability records right now. Please try again shortly.",
      timeoutError: "Network connection is slow or interrupted. Please reload the page.",
      networkError: "Unable to connect. Please check your internet connection and try again.",
      title: "Record Not Found",
      inputPlaceholder: "Enter lot, carton, fruit tag, plot, or household code...",
      searchBtn: "Lookup",
    },
    alerts: {
      revokedTitle: "SHIPMENT LOT RECALL NOTICE",
      revokedDefaultDesc:
        "This shipment lot or label has been recalled by Cư Né Cooperative. Please halt distribution immediately and contact the Cooperative for verification.",
      realtimeSuspendedTitle: "GROWING ZONE OR PACKHOUSE STATUS ALERT",
      realtimeSuspendedDesc: ({ pucCode, pucStatusText, packhouseCode, phcStatusText, note }) =>
        `Current status: Growing Zone ${pucCode} (${pucStatusText}), Packhouse ${packhouseCode} (${phcStatusText}).${note ? ` Management note: ${note}` : " Please verify regulatory clearance before distribution."
        }`,
      unverifiedTitle: "RECORD UNDER REVIEW",
      unverifiedDesc:
        "Public traceability only displays records verified and approved by Cư Né Cooperative; unapproved draft declarations are withheld.",
      multiCountryTitle: "NOTICE: PLEASE VERIFY CARTON SEAL INTEGRITY",
      multiCountryDesc: () =>
        "This traceability code has been looked up simultaneously across multiple regions. Please verify the physical seal on the carton and cross-check the printed lot code.",
      highFreqTitle: "NOTICE: REPEATED LOOKUPS DETECTED",
      highFreqDesc: () =>
        "Unusually frequent lookups were recorded for this code. Please inspect the physical packaging seal and confirm with your authorized distributor or Cư Né Cooperative if needed.",
    },
    watermark: {
      top: "CƯ NÉ DURIAN COOP",
      bottom: "ORIGIN TRACEABILITY",
      valid: "VERIFIED LOT",
      revoked: "RECALLED",
      pending: "INSPECTING",
      unverified: "UNVERIFIED",
    },
    hero: {
      lotCodeLabel: "Lot Code (Printed on Label)",
      varietyLabel: "Durian Variety",
      fallbackCodeLabel: "Carton / Unit Serial Code",
      unitSpecLabel: "Unit Specification",
      lotScaleLabel: "Batch Volume",
      gradeFmt: (grade) => `Grade ${grade}`,
      tonsFmt: (kgText, tons) => `${kgText} kg (${tons} t)`,
      qrCaption: "Lot Traceability QR",
      qrAlt: (code) => `Traceability QR for lot ${code}`,
      scanStatFmt: () => "",
      countriesSuffixFmt: (countries) => `Regions: ${countries}`,
      verifiedAtFmt: (dt) => `Checked on ${dt}`,
    },
    timeline: {
      title: "End-to-End Lot Journey: Orchard to Export",
      badge: "5-Step Traceability",
      sub: "Full milestone dates and responsible units recorded across orchard care, harvest, packing, safety testing, and dispatch.",
      ariaLabel: "5-step traceability timeline",
      responsibleLabel: "Accountable entity:",
      statusCompleted: "Verified",
      statusWarning: "Alert",
      statusCurrent: "In Progress",
      statusUpcoming: "Pending",
    },
    zone: {
      title: "Registered Growing Zone",
      nameLabel: "Growing Zone Name",
      pucLabel: "Production Unit Code (PUC)",
      linkedZonesSuffix: (count) => ` (with ${count} linked zones)`,
      adminLocationLabel: "Commune / District / Province",
      statusRowLabel: "Validity Status",
      validUntilFmt: (statusText, validUntil) => `${statusText} (Valid until ${validUntil})`,
      coarseMapTitle: (pucCode) => `Growing Zone Satellite Map (${pucCode})`,
      coarseTabTerrain: "Satellite",
      coarseTabGrid: "Streets",
      coarseRadiusLabel: "General zone scope approx. 2.5 km",
      coarseCompassNorth: "N",
      coarseCenterTag: "Growing zone center",
      coarsePrivacyNote:
        "Live satellite imagery of the registered growing zone area; individual household plot boundaries remain private.",
    },
    producerPackhouse: {
      title: "Producer & Registered Packhouse",
      producerLabel: "Producer Organization",
      groupLabel: "Associated Orchard Group",
      householdsLabel: "Participating Growers (Public)",
      representedByCoop: "Represented by Cư Né Cooperative",
      packhouseNameLabel: "Packing Facility",
      packhouseCodeLabel: "Packhouse Code (PHC)",
      packhouseStatusLabel: "Live Packhouse Status",
      packhouseAddressLabel: "Facility Address",
      consentNoteWithNames:
        "Only approved member growers who granted explicit public disclosure consent are listed by name.",
      consentNoteHidden:
        "In accordance with personal data protection rules, individual grower identities are represented by Cư Né Cooperative.",
    },
    lab: {
      title: "Verified Food Safety Lab Results",
      badgeUpdating: "Pending Sync",
      badgeFail: "Threshold Alert",
      badgePass: "Compliant",
      emptyNote:
        "Only verified lab certificates are published on the public page. Official test report synchronization is pending.",
      certNoLabel: "Certificate Number",
      dateFmt: (d) => `Sampled ${d}`,
      orgFmt: (org) => `Testing Laboratory: ${org}`,
      cdName: "Cadmium (Cd)",
      cdDetailFmt: (val) => `Result: ${val} mg/kg (Max limit: 0.05 mg/kg)`,
      yoName: "Auramine O (Yellow O)",
      yoPositive: "Result: Positive (Detected)",
      yoNegative: "Result: Negative (Not Detected)",
      resName: "Pesticide Residues (MRL)",
      resDetailFmt: (res, chlor) =>
        `Total: ${res} mg/kg - Chlorpyrifos: ${chlor !== null && chlor !== undefined ? `${chlor} mg/kg` : "ND (Not Detected)"
        }`,
      pillPass: "COMPLIANT",
      pillFail: "EXCEEDED",
      pillSafe: "NEGATIVE",
      pillUnsafe: "NON-COMPLIANT",
      viewScanFmt: (code) => `View Original Stamped Lab Certificate (${code})`,
      scanArchivedNote: "Original stamped lab report scan is archived in the approved lot dossier at Cu Ne Cooperative.",
      accreditationFmt: (code) => `Accreditation: ${code}`,
      externalCodeFmt: (code) => `Independent Verify ID: ${code}`,
      externalVerifyBtn: "Cross-check on External Lab Portal",
    },
    governance: {
      kicker: "Commune-Level Pioneer Traceability Model - Dak Lak Province",
      portalLinkLabel: "Official Provincial Portal",
      supervisoryLabel: "State Supervisory Authority:",
      attestationTitle: "Independent 3-Party Attestation Matrix",
      attestationBadge: "3-Tier Verification",
      partyStatusVerified: "Verified",
      partyStatusWarning: "Alert",
      partyStatusPending: "Under Review",
    },
    integrity: {
      title: "Orchard Cultivation Log & Season Mass-Balance",
      badgeVerified: "Verified Records",
      badgeAlert: "Review Required",
      sub: "Every orchard log, pesticide application, and inspection minute is automatically server-timestamped to ensure pre-harvest transparency.",
      chainAlgorithmLabel: "Verification Method",
      sealedRecordsLabel: "Total Recorded Entries",
      sealedRecordsFmt: (total, journals, sprays, minutes) =>
        `${total} records (${journals} logs, ${sprays} sprays, ${minutes} inspections)`,
      onTimeRateLabel: "On-time Entry Rate (<= 48h)",
      onTimeRateFmt: (pct, lateCount) =>
        lateCount > 0 ? `${pct}% (${lateCount} declared late entries)` : `${pct}% (Zero late backdated entries)`,
      gpsEvidenceLabel: "Geo-verified Field Photos",
      gpsEvidenceFmt: (gpsCount) => `${gpsCount} photos matched parcel GPS boundary`,
      merkleAnchorLabel: "Batch Anchor Digest",
      latestSealLabel: "Latest Sealed Timestamp",
      massBalanceTitle: "Growing Zone Season Quota Control (Mass-Balance)",
      massBalanceBadgeOk: "Within Audited Quota",
      massBalanceBadgeWarn: "Near Quota Ceiling",
      massBalanceSeasonFmt: (year, plots, trees) =>
        `Season ${year}: ${plots} registered plots (${trees.toLocaleString("en-US")} fruiting trees)`,
      massBalanceUsedFmt: (usedTons, capTons, pct) =>
        `Dispatched: ${usedTons} / ${capTons} t (${pct}%)`,
      massBalanceRemainFmt: (remainTons) => `Remaining ceiling: ${remainTons} t`,
      massBalanceNote:
        "Server-enforced Mass-Balance automatically blocks lot aggregation above each parcel's audited pre-harvest yield ceiling, preventing external fruit mixing under this PUC.",
    },
    fieldAudit: {
      passBannerKicker: "On-Site Delegation Field Inspection",
      passBannerActiveFmt: (delegation, org, expiresText) =>
        `${delegation} (${org}), valid until ${expiresText}`,
      passBannerExitBtn: "Exit Audit Pass",
      passInvalidNote: "Delegation pass code was not found, expired, or is no longer active.",
      cardKicker: "On-Site Orchard Parcel Inspection Dossier",
      cardTitleFmt: (plotCode) => `Registered Orchard Parcel ${plotCode}`,
      privacyBadge: "Grower Personal Info Protected",
      privacySub:
        "Displays parcel boundary map, pre-season assessed yield limit, and cultivation logs for on-site verification.",
      plotSpecsTitle: "Registered Parcel Specifications",
      farmerRepLabel: "Member Grower",
      pucZoneLabel: "Production Unit Code (PUC)",
      areaTreesLabel: "Parcel Scale",
      areaTreesFmt: (ha, trees) => `${ha} ha (${trees} fruiting trees)`,
      varietyYearLabel: "Variety and Planted Year",
      phiSafeBadge: "Safe Withdrawal Period Met",
      phiLockedFmt: (safeFrom) =>
        `Active Safety Isolation${safeFrom ? ` (Safe from ${safeFrom})` : ""}`,
      quotaTitle: "Assessed Parcel Season Yield Limit",
      quotaUsedFmt: (usedKg, capKg, pct) => `Used: ${usedKg} / ${capKg} kg (${pct}%)`,
      quotaAssessedFmt: (unit, dateText) => `Assessed by: ${unit} (${dateText})`,
      gpsMapTitle: "Orchard Parcel Boundary Map and On-Site Location Check",
      gpsVerifyBtn: "Verify Current Position at Orchard",
      gpsVerifyingBtn: "Checking on-site position...",
      gpsUnsupportedErr: "Location service is not supported on this device or browser.",
      gpsPermissionErr: "Unable to read location. Please allow location access on your phone and retry.",
      gpsInsideTitle: "VERIFIED ON-SITE: Standing inside the registered orchard parcel",
      gpsNearTitle: (distM) =>
        `BOUNDARY VERIFIED: Standing at parcel edge (${distM} m from boundary)`,
      gpsOutsideTitle: (distM) =>
        `OUTSIDE PARCEL: Current location is ${distM} m away from this orchard (Remote view)`,
      gpsAccuracyFmt: (accM) => (accM ? `Accuracy approx. ±${Math.round(accM)} m` : "Live device location"),
      recentCheckinsTitle: "On-Site Delegation Inspection Log",
      noCheckinsYet: "No on-site location checks recorded for this parcel yet.",
      sealedDiaryTitle: "Orchard Cultivation Log",
      sealedSprayTitle: "Plant Protection and Withdrawal Period Log",
      sealedMinutesTitle: "Commune and Cooperative Field Inspection Minutes",
      lateTag: "Late Entry",
      onTimeTag: "On-Time",
      gpsVerifiedTag: "On-Site Verified",
      emptyRecords: "No records in this section.",
    },
    processPhyto: {
      title: "Production Standard, Key Dates and Phytosanitary",
      harvestDateLabel: "Harvest Date",
      packDateLabel: "Sorting and Packing Date",
      exportDateLabel: "Dispatch / Export Date",
      standardLabel: "Applied Standard",
      standardValue: "VietGAP and Official Export Phytosanitary Protocol",
      complianceLabel: "Process Verification",
      complianceConfirmedText: "Verified VietGAP cultivation and safe pre-harvest withdrawal period",
      complianceReviewingText: "Compliance dossier under pre-dispatch review",
      inspectionLabel: "Orchard Supervision",
      phytoLabel: "Phytosanitary Certificate",
      phytoIssuedFmt: (certNo, dateText) =>
        dateText ? `${certNo} (Issued ${dateText})` : certNo,
      phytoDefaultPending: "Issued per export lot",
      nationalStandardNote:
        "Displays verified official records approved by Cư Né Cooperative in compliance with agricultural export traceability standards.",
    },
    authHint: {
      audienceLabel: "For partners & authorities:",
      actionLabel: "Sign in",
      compactBtn: "For partners / regulatory authorities: Sign in",
      text: "For Registered Packhouses, Distributors & Regulatory Inspectors: Sign in to view scoped extended traceability tiers (all views are audit-logged).",
      loginBtn: "For partners / regulatory authorities: Sign in",
    },
    scopeAccess: {
      deniedTitle: "You do not have permission to view detailed records for this lot",
      deniedDesc: (viewerName, roleLabel) =>
        `Signed in as ${viewerName} (${roleLabel}), but this lot is outside your assigned company or regional scope. Showing the public dossier only.`,
      switchAccountBtn: "Switch account",
    },
    actions: {
      home: "Home",
      print: "Print / Save PDF",
      copied: "QR Link Copied",
      share: "Copy QR Link",
    },
    footer: {
      line1: "Durian Growing Zone & Digital Origin Traceability System",
      line2: "Cư Né General Business & Service Cooperative (Đắk Lắk Province, Vietnam)",
      line3:
        "Official origin traceability dossier verified and published by Cư Né Cooperative.",
    },
  },

  zh: {
    langBar: {
      label: "显示语言",
      liveVerifiedBadge: "种植区与包装厂编码状态：有效",
      liveAlertBadge: "种植区 / 包装厂编码状态提示",
    },
    topbar: {
      brand: "Cư Né 合作社",
      lookupOther: "查询其他编码",
      home: "首页",
    },
    loadingLabel: "正在加载溯源核验档案...",
    errorState: {
      invalidCode: "溯源码无效。",
      notFound: (code) =>
        `未找到与 "${code}" 对应的溯源档案。请核对批次号、箱标号、单果签、地块编码或农户编码。`,
      serverError: "暂时无法加载溯源数据，请稍后重试。",
      timeoutError: "网络连接缓慢或中断，请刷新页面重试。",
      networkError: "无法连接网络，请检查网络设置后重试。",
      title: "未找到溯源记录",
      inputPlaceholder: "输入批次、包装箱、单果签、地块或农户编码...",
      searchBtn: "立即查询",
    },
    alerts: {
      revokedTitle: "批次召回通知（停止流通）",
      revokedDefaultDesc:
        "该批次或溯源标签已由越南 Cư Né 合作社通知召回。请立即停止流通并联系合作社核实。",
      realtimeSuspendedTitle: "种植区或包装厂状态提示",
      realtimeSuspendedDesc: ({ pucCode, pucStatusText, packhouseCode, phcStatusText, note }) =>
        `当前核实状态：种植区编码 ${pucCode}（${pucStatusText}），包装厂编码 ${packhouseCode}（${phcStatusText}）。${note ? ` 管理备注：${note}` : " 请在接收或流通前核对相关资质文件。"
        }`,
      unverifiedTitle: "待审核记录提示",
      unverifiedDesc:
        "公开溯源页面仅展示经 Cư Né 合作社审核确认的正式数据；未审核草稿记录不予公开展示。",
      multiCountryTitle: "提示：请核对包装箱封签完整性",
      multiCountryDesc: () =>
        "系统记录到该溯源码在多个地区同时被查询。请仔细检查外箱封签是否完好，并核对箱标印刷批次号。",
      highFreqTitle: "提示：该溯源码近期查询次数较多",
      highFreqDesc: () =>
        "该溯源码近期出现多次重复查询。请检查包装封条完整性，必要时与授权经销商或 Cư Né 合作社核实。",
    },
    watermark: {
      top: "越南 CƯ NÉ 榴莲合作社",
      bottom: "官方批次溯源认证",
      valid: "合格批次",
      revoked: "已召回",
      pending: "检验中",
      unverified: "待核验",
    },
    hero: {
      lotCodeLabel: "溯源批次号（箱标明文）",
      varietyLabel: "榴莲品种",
      fallbackCodeLabel: "包装箱 / 单果核对编号",
      unitSpecLabel: "包装单元规格",
      lotScaleLabel: "批次总规模",
      gradeFmt: (grade) => `${grade}级果`,
      tonsFmt: (kgText, tons) => `${kgText} 公斤（${tons} 吨）`,
      qrCaption: "批次溯源二维码",
      qrAlt: (code) => `批次 ${code} 溯源二维码`,
      scanStatFmt: () => "",
      countriesSuffixFmt: (countries) => `地区：${countries}`,
      verifiedAtFmt: (dt) => `查询时间：${dt}`,
    },
    timeline: {
      title: "榴莲批次全链路溯源：果园至出口通关",
      badge: "五步全链路溯源",
      sub: "完整记录果园管护、采收、分级包装、安全检测及检疫出厂各环节日期与责任单位。",
      ariaLabel: "五步溯源时间轴",
      responsibleLabel: "责任单位：",
      statusCompleted: "已核验",
      statusWarning: "异常预警",
      statusCurrent: "进行中",
      statusUpcoming: "待更新",
    },
    zone: {
      title: "注册出境水果果园信息",
      nameLabel: "种植区名称",
      pucLabel: "果园注册编码 (PUC)",
      linkedZonesSuffix: (count) => `（含 ${count} 个联合注册片区）`,
      adminLocationLabel: "所在乡 / 县 / 省",
      statusRowLabel: "资质有效状态",
      validUntilFmt: (statusText, validUntil) => `${statusText}（有效期至 ${validUntil}）`,
      coarseMapTitle: (pucCode) => `注册种植区卫星地图 (${pucCode})`,
      coarseTabTerrain: "卫星影像",
      coarseTabGrid: "道路地图",
      coarseRadiusLabel: "产区概览范围约 2.5 公里",
      coarseCompassNorth: "北",
      coarseCenterTag: "种植区中心位置",
      coarsePrivacyNote:
        "展示注册种植区实景卫星影像范围，不公开农户个人果园边界以保护农户隐私。",
    },
    producerPackhouse: {
      title: "生产合作社与注册包装厂",
      producerLabel: "生产组织",
      groupLabel: "联合果园生产组",
      householdsLabel: "授权公开农户",
      representedByCoop: "由 Cư Né 农业合作社统一代表",
      packhouseNameLabel: "注册包装厂名称",
      packhouseCodeLabel: "包装厂注册编码 (PHC)",
      packhouseStatusLabel: "包装厂实时状态",
      packhouseAddressLabel: "包装厂地址",
      consentNoteWithNames: "仅展示已通过资质审核且本人授权同意公开姓名的合作社成员农户。",
      consentNoteHidden: "根据个人信息保护规范，未单独授权公开的农户信息由 Cư Né 合作社统一代表。",
    },
    lab: {
      title: "食品安全实验室检测报告（已审核认证）",
      badgeUpdating: "同步中",
      badgeFail: "指标预警",
      badgePass: "检测合格",
      emptyNote: "公开页面仅展示已审核认证的正式检测报告，当前批次正式检测单正在同步中。",
      certNoLabel: "检测报告编号",
      dateFmt: (d) => `采样日期 ${d}`,
      orgFmt: (org) => `检测机构：${org}`,
      cdName: "重金属镉 (Cd)",
      cdDetailFmt: (val) => `实测值：${val} mg/kg（限量标准：≤ 0.05 mg/kg）`,
      yoName: "碱性嫩黄 O（黄O / Auramine O）",
      yoPositive: "检测结果：阳性（检出）",
      yoNegative: "检测结果：阴性（未检出）",
      resName: "农药残留指标",
      resDetailFmt: (res, chlor) =>
        `综合农残：${res} mg/kg - 毒死蜱 (Chlorpyrifos)：${chlor !== null && chlor !== undefined ? `${chlor} mg/kg` : "未检出 (ND)"
        }`,
      pillPass: "合格",
      pillFail: "超标",
      pillSafe: "阴性安全",
      pillUnsafe: "不合格",
      viewScanFmt: (code) => `查看盖章检测报告扫描件原件 (${code})`,
      scanArchivedNote: "加盖红章的纸质检测报告扫描件已归档保存于居内合作社已审核批次卷宗中。",
      accreditationFmt: (code) => `实验室认可资质：${code}`,
      externalCodeFmt: (code) => `第三方核验编码：${code}`,
      externalVerifyBtn: "前往检测机构官网核验真伪",
    },
    governance: {
      kicker: "越南多乐省乡级数字化溯源示范项目 - 居内乡人民政府督办",
      portalLinkLabel: "访问多乐省政府门户",
      supervisoryLabel: "政府监督指导单位：",
      attestationTitle: "三方独立交叉背书机制（农户合作社 - 乡政府监管 - 独立实验室）",
      attestationBadge: "三方独立核证",
      partyStatusVerified: "已核验背书",
      partyStatusWarning: "异常预警",
      partyStatusPending: "复核中",
    },
    integrity: {
      title: "果园农事记录核验与产区总产量配额管控",
      badgeVerified: "记录核验合规",
      badgeAlert: "记录待复核",
      sub: "每一笔农事记录、用药记录及现场检查纪要均由系统自动记录服务器时间，确保采前全程可追溯。",
      chainAlgorithmLabel: "核验方式",
      sealedRecordsLabel: "农事与巡检记录总数",
      sealedRecordsFmt: (total, journals, sprays, minutes) =>
        `共 ${total} 条（农事 ${journals} 条，用药 ${sprays} 条，巡检 ${minutes} 条）`,
      onTimeRateLabel: "48小时内及时录入率",
      onTimeRateFmt: (pct, lateCount) =>
        lateCount > 0 ? `${pct}%（含 ${lateCount} 条已说明原因的补录记录）` : `${pct}%（全部按时实时录入）`,
      gpsEvidenceLabel: "GPS 地理围栏核验照片",
      gpsEvidenceFmt: (gpsCount) => `${gpsCount} 张现场实拍图已匹配地块坐标`,
      merkleAnchorLabel: "批次根哈希锚点",
      latestSealLabel: "最新封存时间",
      massBalanceTitle: "注册果园产季配额总量平衡管控 (Mass-Balance)",
      massBalanceBadgeOk: "配额范围内合规",
      massBalanceBadgeWarn: "接近配额上限",
      massBalanceSeasonFmt: (year, plots, trees) =>
        `${year} 产季：${plots} 个注册地块（共 ${trees.toLocaleString("zh-CN")} 株结果树）`,
      massBalanceUsedFmt: (usedTons, capTons, pct) =>
        `累计出货：${usedTons} / ${capTons} 吨（${pct}%）`,
      massBalanceRemainFmt: (remainTons) => `剩余可用配额：${remainTons} 吨`,
      massBalanceNote:
        "系统按各地块产前实地清点树数与评估上限自动锁定出货配额，严防非注册果园（外地货源）混入本 PUC 编码出口。",
    },
    fieldAudit: {
      passBannerKicker: "采购商与考察团现场核查模式",
      passBannerActiveFmt: (delegation, org, expiresText) =>
        `${delegation}（${org}），有效至 ${expiresText}`,
      passBannerExitBtn: "退出核验通行证",
      passInvalidNote: "考察通行码不存在、已过期或已停用。",
      cardKicker: "果园地块现场核查档案",
      cardTitleFmt: (plotCode) => `注册果园地块编号 ${plotCode}`,
      privacyBadge: "农户个人信息保护中",
      privacySub:
        "展示果园地块边界示意图、产季核定产量上限及农事作业台账，供现场实地核对。",
      plotSpecsTitle: "地块注册核定参数",
      farmerRepLabel: "种植成员户",
      pucZoneLabel: "注册果园编码 (PUC)",
      areaTreesLabel: "地块面积与树数",
      areaTreesFmt: (ha, trees) => `${ha} 公顷（${trees} 株挂果树）`,
      varietyYearLabel: "品种与定植年份",
      phiSafeBadge: "已满安全间隔期（准予采收）",
      phiLockedFmt: (safeFrom) =>
        `处于采前安全隔离期${safeFrom ? `（安全日期 ${safeFrom}）` : ""}`,
      quotaTitle: "单地块产季核定产量上限",
      quotaUsedFmt: (usedKg, capKg, pct) => `已归集出货：${usedKg} / ${capKg} 公斤（${pct}%）`,
      quotaAssessedFmt: (unit, dateText) => `核定单位：${unit}（${dateText}）`,
      gpsMapTitle: "果园地块边界示意图与现场位置核对",
      gpsVerifyBtn: "现场核对当前果园位置",
      gpsVerifyingBtn: "正在定位当前果园位置...",
      gpsUnsupportedErr: "当前设备或浏览器不支持定位功能。",
      gpsPermissionErr: "无法获取当前位置，请在手机浏览器中允许定位权限后重试。",
      gpsInsideTitle: "现场核对通过：当前位于该注册果园边界范围内",
      gpsNearTitle: (distM) =>
        `边界核对通过：当前位于地块边缘（距边界约 ${distM} 米）`,
      gpsOutsideTitle: (distM) =>
        `不在地块范围内：当前位置距该果园地块 ${distM} 米（远程查阅）`,
      gpsAccuracyFmt: (accM) => (accM ? `定位精度约 ±${Math.round(accM)} 米` : "设备实时定位"),
      recentCheckinsTitle: "考察团现场核查记录",
      noCheckinsYet: "该地块暂无现场位置核对记录。",
      sealedDiaryTitle: "地块农事作业台账",
      sealedSprayTitle: "植保用药与安全间隔期台账",
      sealedMinutesTitle: "乡政府与合作社现场巡检纪要",
      lateTag: "事后补录",
      onTimeTag: "按时记录",
      gpsVerifiedTag: "现场实拍确认",
      emptyRecords: "暂无相关记录。",
    },
    processPhyto: {
      title: "生产标准、关键时间节点与植物检疫",
      harvestDateLabel: "采收日期",
      packDateLabel: "初加工与包装日期",
      exportDateLabel: "出厂 / 出口日期",
      standardLabel: "执行标准",
      standardValue: "越南良好农业规范 (VietGAP) 与出口植物检疫议定书",
      complianceLabel: "规程合规核验",
      complianceConfirmedText: "已核实符合标准化栽培规程与采前安全间隔期要求",
      complianceReviewingText: "出货前档案复核中",
      inspectionLabel: "果园监管记录",
      phytoLabel: "植物检疫证书编号",
      phytoIssuedFmt: (certNo, dateText) =>
        dateText ? `${certNo}（签发日期 ${dateText}）` : certNo,
      phytoDefaultPending: "按出口批次签发",
      nationalStandardNote:
        "仅展示经 Cư Né 合作社审核确认的正式溯源信息，符合出口农产品产地溯源规范。",
    },
    authHint: {
      audienceLabel: "合作企业与监管机构：",
      actionLabel: "登录",
      compactBtn: "合作企业 / 监管机构入口：登录",
      text: "包装厂、进口分销商及监管机构人员：登录后可按授权范围查看二级/三级扩展溯源档案（所有查阅均记录审计日志）。",
      loginBtn: "合作企业 / 监管机构入口：登录",
    },
    scopeAccess: {
      deniedTitle: "您无权查看该批次的内部详细数据",
      deniedDesc: (viewerName, roleLabel) =>
        `当前登录账号 ${viewerName}（${roleLabel}）不在该批次所属企业或管辖范围内，系统仅显示公开溯源档案。`,
      switchAccountBtn: "切换账号",
    },
    actions: {
      home: "返回首页",
      print: "打印 / 保存 PDF",
      copied: "溯源链接已复制",
      share: "复制溯源链接",
    },
    footer: {
      line1: "越南鲜食榴莲种植区与数字化产地溯源系统",
      line2: "越南 Đắk Lắk 省 Cư Né 综合经营与服务合作社",
      line3: "由 Cư Né 合作社审核发布的官方产地溯源档案。",
    },
  },
};

/**
 * Nguyên tắc ngôn ngữ xuyên suốt:
 * - Giữ nguyên TÊN RIÊNG tiếng Việt (Cư Né, Krông Búk, Đắk Lắk, Vĩnh Phát, Rồng Đỏ, Tây Nguyên Xanh, tên đường, tên hộ...)
 * - Dịch chuẩn xác TỪ NGỮ CHUNG (Cơ sở đóng gói, Nông sản xuất khẩu, Hợp tác xã, Xã, Huyện, Tỉnh, Quốc lộ, Phòng kiểm nghiệm...) sang EN / ZH.
 */
export function localizeProductName(rawName: string, traceUnit: string, lang: TraceLang): string {
  if (lang === "vi") {
    return rawName.replace(/\s*\(Durio\s+zibethinus\)/i, "").trim() || "Sầu riêng tươi nguyên trái";
  }
  if (traceUnit === "fruit") {
    return lang === "zh" ? "Cư Né 合作社精选鲜食榴莲" : "Cư Né Select Fresh Durian";
  }
  if (traceUnit === "puc_zone") {
    return lang === "zh" ? "注册果园鲜食榴莲原料" : "Registered Orchard Fresh Durian";
  }
  return lang === "zh" ? "越南鲜食整果榴莲" : "Fresh Whole Durian";
}

export function localizeVariety(rawVariety: string, lang: TraceLang): string {
  const cleaned = (rawVariety || "").trim();
  if (!cleaned) return lang === "zh" ? "Ri6 与 Monthong" : lang === "en" ? "Ri6 & Monthong" : "Ri6 và Monthong";
  if (lang === "vi") {
    return cleaned.replace(/\s*&\s*/g, " và ");
  }
  let out = cleaned
    .replace(/^Sầu\s+riêng\s+/i, "")
    .replace(/^Giống\s+/i, "");
  if (lang === "zh") {
    out = out
      .replace(/\s*(?:&|và)\s*/gi, " 与 ")
      .replace(/cơm\s+vàng\s+hạt\s+lép/gi, "金肉小核")
      .replace(/chín\s+tự\s+nhiên/gi, "自然成熟");
  } else {
    out = out
      .replace(/\s+và\s+/gi, " & ")
      .replace(/cơm\s+vàng\s+hạt\s+lép/gi, "golden aril, flat seed")
      .replace(/chín\s+tự\s+nhiên/gi, "tree-ripened");
  }
  return out.trim();
}

export function localizeTraceUnitLabel(traceUnit: string, rawLabel: string, lang: TraceLang): string {
  if (lang === "vi") return rawLabel;
  if (traceUnit === "box") {
    return lang === "zh" ? "批次溯源标准包装箱" : "Batch-Identified Carton Box";
  }
  if (traceUnit === "fruit") {
    return lang === "zh" ? "精品单果溯源签" : "Premium Single-Fruit Tag";
  }
  if (traceUnit === "puc_zone") {
    return lang === "zh" ? "注册果园产区标识" : "Registered Growing Zone Signboard";
  }
  return lang === "zh" ? "出口标准商品批次" : "Export Shipment Lot";
}

export function localizeLotStatusLabel(
  status: string,
  _rawLabel: string,
  lang: TraceLang,
  kind: TraceTargetKind = "lot",
  rawLotStatus?: string | null,
): string {
  if (status === "revoked" || rawLotStatus === "revoked") {
    if (lang === "vi") return "Đã thu hồi, ngừng lưu thông";
    return lang === "zh" ? "已召回，停止流通" : "Recalled, Halted";
  }
  if (status === "unverified") {
    if (lang === "vi") return "Đang chờ kiểm chứng";
    return lang === "zh" ? "待审核记录" : "Pending Verification";
  }
  if (status === "pending" || rawLotStatus === "sampling") {
    if (lang === "vi") return "Đang lấy mẫu kiểm định";
    return lang === "zh" ? "出货前采样检验中" : "Pre-dispatch Inspection";
  }
  if (kind === "box") {
    if (lang === "vi") return "Thùng hàng hợp lệ, đủ điều kiện";
    return lang === "zh" ? "合格包装箱，准予流通" : "Valid Carton, Cleared";
  }
  if (kind === "fruit") {
    if (lang === "vi") return "Tem trái hợp lệ, đủ điều kiện";
    return lang === "zh" ? "合格单果签，准予流通" : "Valid Fruit Tag, Cleared";
  }
  if (kind === "household") {
    if (lang === "vi") return "Nông hộ liên kết đủ điều kiện";
    return lang === "zh" ? "合规联营成员农户" : "Verified Active Member Grower";
  }
  if (kind === "plot") {
    if (lang === "vi") return "Thửa đất đủ điều kiện canh tác";
    return lang === "zh" ? "合规在产果园地块" : "Verified Active Orchard Plot";
  }
  if (rawLotStatus === "in_transit") {
    if (lang === "vi") return "Lô hợp lệ, đang vận chuyển";
    return lang === "zh" ? "合格批次，冷链运输中" : "Valid Lot, In Transit";
  }
  if (rawLotStatus === "delivered") {
    if (lang === "vi") return "Lô hợp lệ, đã bàn giao";
    return lang === "zh" ? "合格批次，已完成交付" : "Valid Lot, Delivered";
  }
  if (rawLotStatus === "exported") {
    if (lang === "vi") return "Lô hợp lệ, đã xuất khẩu";
    return lang === "zh" ? "合格批次，已检疫出口" : "Valid Lot, Exported";
  }
  if (lang === "vi") return "Lô hợp lệ, đủ điều kiện";
  return lang === "zh" ? "合格批次，准予流通" : "Valid Lot, Cleared";
}

export function localizeZoneStatusLabel(status: string, rawLabel: string, lang: TraceLang): string {
  if (lang === "vi") return rawLabel;
  if (status === "active") {
    return lang === "zh" ? "有效（正常监管中）" : "Active & Valid";
  }
  if (status === "suspended") {
    return lang === "zh" ? "暂停资格" : "Suspended";
  }
  if (status === "revoked") {
    return lang === "zh" ? "已撤销编码" : "Revoked";
  }
  return lang === "zh" ? "审核评定中" : "Under Review";
}

export function localizePackhouseStatusLabel(status: string | undefined, rawLabel: string | undefined, lang: TraceLang): string {
  if (lang === "vi") return rawLabel || "Đang hoạt động hợp lệ";
  if (status === "suspended") {
    return lang === "zh" ? "暂停包装资格" : "Suspended";
  }
  if (status === "revoked") {
    return lang === "zh" ? "已撤销包装厂编码" : "Revoked";
  }
  if (status === "inactive") {
    return lang === "zh" ? "暂停运营" : "Inactive";
  }
  return lang === "zh" ? "正常有效运营" : "Active & Valid";
}

export function localizeMarket(rawMarket: string, lang: TraceLang): string {
  const trimmed = (rawMarket || "").trim();
  if (lang === "vi") return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.includes("trung quốc") || lower.includes("china") || lower.includes("gacc")) {
    return lang === "zh" ? "出口中国市场" : "China Export";
  }
  if (lower.includes("nội địa") || lower.includes("trong nước") || lower.includes("siêu thị")) {
    return lang === "zh" ? "越南国内市场" : "Domestic Market (Vietnam)";
  }
  if (lower.includes("nhật bản") || lower.includes("japan")) {
    return lang === "zh" ? "出口日本市场" : "Japan Export";
  }
  if (lower.includes("hàn quốc") || lower.includes("korea")) {
    return lang === "zh" ? "出口韩国市场" : "South Korea Export";
  }
  if (lower.includes("đài loan") || lower.includes("taiwan")) {
    return lang === "zh" ? "出口中国台湾市场" : "Taiwan Export";
  }
  if (lower.includes("thái lan") || lower.includes("thailand")) {
    return lang === "zh" ? "出口泰国市场" : "Thailand Export";
  }
  if (lower.includes("xuất khẩu")) {
    return lang === "zh" ? "正贸出口" : "Official Export";
  }
  return trimmed;
}

/** Dịch một cụm địa giới / đường phố tiếng Việt sang EN/ZH trong khi giữ nguyên tuyệt đối tên riêng tiếng Việt. */
function localizeGeoSegment(rawSeg: string, lang: "en" | "zh", isLastSegment = false): string {
  const seg = rawSeg.trim();
  if (!seg) return "";

  if (/^(?:Việt\s+Nam|Vietnam)$/i.test(seg)) {
    return lang === "zh" ? "越南" : "Vietnam";
  }
  if (/^(?:TP\.?\s*HCM|TP\.?\s*Hồ\s+Chí\s+Minh|Thành\s+phố\s+Hồ\s+Chí\s+Minh)$/i.test(seg)) {
    return lang === "zh" ? "Hồ Chí Minh 市" : "Hồ Chí Minh City";
  }
  if (/^(?:TP\.?\s*Hà\s+Nội|Thành\s+phố\s+Hà\s+Nội|Hà\s+Nội)$/i.test(seg)) {
    return lang === "zh" ? "Hà Nội 市" : "Hà Nội City";
  }

  // Cụm kết hợp Km + Quốc lộ trong cùng 1 vế
  const kmQlInline = /^Km\s*(\d+(?:\+\d+)?)\s*(?:-|,)?\s*(?:Quốc\s+lộ|QL\.?)\s*(\d+[A-Za-z]?)$/i.exec(seg);
  if (kmQlInline) {
    return lang === "zh"
      ? `${kmQlInline[2]}号国道 Km ${kmQlInline[1]}`
      : `Km ${kmQlInline[1]}, National Highway ${kmQlInline[2]}`;
  }

  const qlMatch = /^(?:Quốc\s+lộ|QL\.?)\s*(\d+[A-Za-z]?)$/i.exec(seg);
  if (qlMatch) {
    return lang === "zh" ? `${qlMatch[1]}号国道` : `National Highway ${qlMatch[1]}`;
  }

  const tlMatch = /^(?:Tỉnh\s+lộ|TL\.?|ĐT\.?)\s*(\d+[A-Za-z]?)$/i.exec(seg);
  if (tlMatch) {
    return lang === "zh" ? `${tlMatch[1]}号省道` : `Provincial Road ${tlMatch[1]}`;
  }

  const kmMatch = /^Km\s*(\d+(?:\+\d+)?)$/i.exec(seg);
  if (kmMatch) {
    return `Km ${kmMatch[1]}`;
  }

  const kcnMatch = /^(?:Khu\s+công\s+nghiệp|KCN)\s+(.+)$/i.exec(seg);
  if (kcnMatch) {
    return lang === "zh" ? `${kcnMatch[1].trim()} 工业园` : `${kcnMatch[1].trim()} Industrial Park`;
  }

  const ccnMatch = /^(?:Cụm\s+công\s+nghiệp|CCN)\s+(.+)$/i.exec(seg);
  if (ccnMatch) {
    return lang === "zh" ? `${ccnMatch[1].trim()} 产业园` : `${ccnMatch[1].trim()} Industrial Cluster`;
  }

  const buildingMatch = /^Tòa\s+nhà\s+(.+)$/i.exec(seg);
  if (buildingMatch) {
    return lang === "zh" ? `${buildingMatch[1].trim()} 大厦` : `${buildingMatch[1].trim()} Building`;
  }

  const lotMatch = /^Lô\s+([A-Za-z0-9-]+)$/i.exec(seg);
  if (lotMatch) {
    return lang === "zh" ? `${lotMatch[1]}号地块` : `Plot ${lotMatch[1]}`;
  }

  const houseNoMatch = /^Số\s+(\d+[A-Za-z/-]*)\s*(?:Đường\s+)?(.+)$/i.exec(seg);
  if (houseNoMatch) {
    const num = houseNoMatch[1];
    const street = houseNoMatch[2].trim();
    return lang === "zh" ? `${street} ${num}号` : `No. ${num} ${street}`;
  }

  const streetPrefixMatch = /^(\d+[A-Za-z/-]*)\s+Đường\s+(.+)$/i.exec(seg);
  if (streetPrefixMatch) {
    return lang === "zh"
      ? `${streetPrefixMatch[2].trim()} 路 ${streetPrefixMatch[1]}号`
      : `${streetPrefixMatch[1]} ${streetPrefixMatch[2].trim()} Street`;
  }

  const streetMatch = /^Đường\s+(.+)$/i.exec(seg);
  if (streetMatch) {
    return lang === "zh" ? `${streetMatch[1].trim()} 路` : `${streetMatch[1].trim()} Street`;
  }

  const hamletMatch = /^(?:Thôn|Ấp)\s+(.+)$/i.exec(seg);
  if (hamletMatch) {
    const val = hamletMatch[1].trim();
    if (/^\d+$/.test(val)) {
      return lang === "zh" ? `第${val}村` : `Hamlet ${val}`;
    }
    return lang === "zh" ? `${val} 村` : `${val} Hamlet`;
  }

  const buonMatch = /^Buôn\s+(.+)$/i.exec(seg);
  if (buonMatch) {
    return lang === "zh" ? `${buonMatch[1].trim()} 村` : `${buonMatch[1].trim()} Village`;
  }

  const xaMatch = /^Xã\s+(.+)$/i.exec(seg);
  if (xaMatch) {
    return lang === "zh" ? `${xaMatch[1].trim()} 乡` : `${xaMatch[1].trim()} Commune`;
  }

  const phuongMatch = /^(?:Phường|P\.)\s*(.+)$/i.exec(seg);
  if (phuongMatch) {
    const val = phuongMatch[1].trim();
    if (/^\d+$/.test(val)) {
      return lang === "zh" ? `第${val}坊` : `Ward ${val}`;
    }
    return lang === "zh" ? `${val} 坊` : `${val} Ward`;
  }

  const thiTranMatch = /^(?:Thị\s+trấn|TT\.)\s*(.+)$/i.exec(seg);
  if (thiTranMatch) {
    return lang === "zh" ? `${thiTranMatch[1].trim()} 镇` : `${thiTranMatch[1].trim()} Town`;
  }

  const huyenMatch = /^Huyện\s+(.+)$/i.exec(seg);
  if (huyenMatch) {
    return lang === "zh" ? `${huyenMatch[1].trim()} 县` : `${huyenMatch[1].trim()} District`;
  }

  const quanMatch = /^(?:Quận|Q\.)\s*(.+)$/i.exec(seg);
  if (quanMatch) {
    const val = quanMatch[1].trim();
    if (/^\d+$/.test(val)) {
      return lang === "zh" ? `第${val}郡` : `District ${val}`;
    }
    return lang === "zh" ? `${val} 郡` : `${val} District`;
  }

  const thiXaMatch = /^(?:Thị\s+xã|TX\.)\s*(.+)$/i.exec(seg);
  if (thiXaMatch) {
    return lang === "zh" ? `${thiXaMatch[1].trim()} 市社` : `${thiXaMatch[1].trim()} Town`;
  }

  const tpMatch = /^(?:Thành\s+phố|TP\.?)\s+(.+)$/i.exec(seg);
  if (tpMatch) {
    return lang === "zh" ? `${tpMatch[1].trim()} 市` : `${tpMatch[1].trim()} City`;
  }

  const tinhMatch = /^Tỉnh\s+(.+)$/i.exec(seg);
  if (tinhMatch) {
    return lang === "zh" ? `${tinhMatch[1].trim()} 省` : `${tinhMatch[1].trim()} Province`;
  }

  if (isLastSegment && /^(?:Đắk\s+Lắk|Đắk\s+Nông|Gia\s+Lai|Lâm\s+Đồng|Bình\s+Phước|Tiền\s+Giang|Đồng\s+Nai)$/i.test(seg)) {
    return lang === "zh" ? `${seg} 省` : `${seg} Province`;
  }

  return seg;
}

export function localizeAddress(rawAddress: string, lang: TraceLang): string {
  const trimmed = (rawAddress || "").trim();
  if (!trimmed || lang === "vi") return trimmed;
  const parts = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return trimmed;

  const hasCountry = parts.some((p) => /^(?:Việt\s+Nam|Vietnam|越南)$/i.test(p));
  const localized = parts.map((p, idx) =>
    localizeGeoSegment(p, lang, !hasCountry && idx === parts.length - 1),
  );
  if (!hasCountry) {
    localized.push(lang === "zh" ? "越南" : "Vietnam");
  }
  return localized.join(", ");
}

export function localizeAdminLocation(rawLoc: string, lang: TraceLang): string {
  if (lang === "vi") return rawLoc;
  if (!rawLoc || !rawLoc.trim()) {
    return lang === "zh"
      ? "Cư Né 乡, Krông Búk 县, Đắk Lắk 省, 越南"
      : "Cư Né Commune, Krông Búk District, Đắk Lắk Province, Vietnam";
  }
  return localizeAddress(rawLoc, lang);
}

export function localizeCoopName(rawName: string, lang: TraceLang): string {
  const trimmed = (rawName || "").trim();
  if (!trimmed || lang === "vi") return trimmed;

  const genBizMatch =
    /^(?:Hợp\s+tác\s+xã|HTX)\s+Kinh\s+doanh\s*(?:-|và|&)?\s*Dịch\s+vụ\s+Tổng\s+hợp\s+(.+)$/i.exec(
      trimmed,
    );
  if (genBizMatch) {
    const proper = genBizMatch[1].trim();
    return lang === "zh"
      ? `${proper} 综合经营与服务合作社`
      : `${proper} General Business & Service Cooperative`;
  }

  const agriMatch =
    /^(?:Hợp\s+tác\s+xã|HTX)\s+Nông\s+nghiệp(?:\s+(?:Dịch\s+vụ|Tổng\s+hợp|Công\s+nghệ\s+cao|Bền\s+vững))?\s+(.+)$/i.exec(
      trimmed,
    );
  if (agriMatch) {
    const proper = agriMatch[1].trim();
    return lang === "zh" ? `${proper} 农业合作社` : `${proper} Agricultural Cooperative`;
  }

  const durianMatch = /^(?:Hợp\s+tác\s+xã|HTX)\s+Sầu\s+riêng\s+(.+)$/i.exec(trimmed);
  if (durianMatch) {
    const proper = durianMatch[1].trim();
    return lang === "zh" ? `${proper} 榴莲合作社` : `${proper} Durian Cooperative`;
  }

  const genericMatch = /^(?:Hợp\s+tác\s+xã|HTX)\s+(.+)$/i.exec(trimmed);
  if (genericMatch) {
    const proper = genericMatch[1].trim();
    return lang === "zh" ? `${proper} 合作社` : `${proper} Cooperative`;
  }

  return trimmed;
}

export function localizePackhouseName(rawName: string, lang: TraceLang): string {
  const trimmed = (rawName || "").trim();
  if (!trimmed || lang === "vi") return trimmed;

  // 1. Cơ sở đóng gói liên kết HTX <Tên riêng>
  const coopLinkedMatch =
    /^Cơ\s+sở\s+Đóng\s+gói(?:\s*(?:-|và|&)\s*Sơ\s+chế)?\s+Liên\s+kết\s+(?:Hợp\s+tác\s+xã|HTX)(?:\s+Nông\s+nghiệp)?\s+(.+)$/i.exec(
      trimmed,
    );
  if (coopLinkedMatch) {
    const proper = coopLinkedMatch[1].trim();
    return lang === "zh"
      ? `${proper} 合作社联营初加工与包装厂`
      : `${proper} Cooperative Linked Sorting & Packing Facility`;
  }

  // 2. Cơ sở / Nhà máy / Xưởng đóng gói nông sản xuất khẩu <Tên riêng> (vd: Vĩnh Phát)
  const expAgriPhMatch =
    /^(?:Cơ\s+sở|Nhà\s+máy|Xưởng|Trung\s+tâm)\s+(?:Đóng\s+gói(?:\s*(?:-|và|&)\s*Sơ\s+chế)?|Sơ\s+chế(?:\s*(?:-|và|&)\s*Đóng\s+gói)?|Chế\s+biến)\s+Nông\s+sản\s+Xuất\s+khẩu\s+(.+)$/i.exec(
      trimmed,
    );
  if (expAgriPhMatch) {
    const proper = expAgriPhMatch[1].trim();
    return lang === "zh"
      ? `${proper} 出口农产品包装厂`
      : `${proper} Export Agricultural Packhouse`;
  }

  // 3. Cơ sở / Nhà máy đóng gói trái cây xuất khẩu <Tên riêng>
  const expFruitPhMatch =
    /^(?:Cơ\s+sở|Nhà\s+máy|Xưởng)\s+(?:Đóng\s+gói(?:\s*(?:-|và|&)\s*Sơ\s+chế)?|Sơ\s+chế(?:\s*(?:-|và|&)\s*Đóng\s+gói)?|Chế\s+biến)\s+Trái\s+cây(?:\s+Xuất\s+khẩu)?\s+(.+)$/i.exec(
      trimmed,
    );
  if (expFruitPhMatch) {
    const proper = expFruitPhMatch[1].trim();
    return lang === "zh" ? `${proper} 出口水果包装厂` : `${proper} Export Fruit Packhouse`;
  }

  // 4. Cơ sở / Nhà máy đóng gói sầu riêng <Tên riêng>
  const durianPhMatch =
    /^(?:Cơ\s+sở|Nhà\s+máy|Xưởng)\s+(?:Đóng\s+gói(?:\s*(?:-|và|&)\s*Sơ\s+chế)?|Sơ\s+chế(?:\s*(?:-|và|&)\s*Đóng\s+gói)?|Chế\s+biến)\s+Sầu\s+riêng(?:\s+Xuất\s+khẩu)?\s+(.+)$/i.exec(
      trimmed,
    );
  if (durianPhMatch) {
    const proper = durianPhMatch[1].trim();
    return lang === "zh" ? `${proper} 榴莲包装厂` : `${proper} Durian Packhouse`;
  }

  // 5. Cơ sở / Nhà máy đóng gói nông sản <Tên riêng>
  const agriPhMatch =
    /^(?:Cơ\s+sở|Nhà\s+máy|Xưởng)\s+(?:Đóng\s+gói(?:\s*(?:-|và|&)\s*Sơ\s+chế)?|Sơ\s+chế(?:\s*(?:-|và|&)\s*Đóng\s+gói)?|Chế\s+biến)\s+Nông\s+sản\s+(.+)$/i.exec(
      trimmed,
    );
  if (agriPhMatch) {
    const proper = agriPhMatch[1].trim();
    return lang === "zh" ? `${proper} 农产品包装厂` : `${proper} Agricultural Packhouse`;
  }

  // 6. Cơ sở / Nhà máy đóng gói <Tên riêng>
  const genericPhMatch =
    /^(?:Cơ\s+sở|Nhà\s+máy|Xưởng)\s+(?:Đóng\s+gói(?:\s*(?:-|và|&)\s*Sơ\s+chế)?|Sơ\s+chế(?:\s*(?:-|và|&)\s*Đóng\s+gói)?)\s+(.+)$/i.exec(
      trimmed,
    );
  if (genericPhMatch) {
    const proper = genericPhMatch[1].trim();
    return lang === "zh" ? `${proper} 包装厂` : `${proper} Packing Facility`;
  }

  // 7. Công ty TNHH / Cổ phần (Xuất nhập khẩu / Nông sản / Thương mại) <Tên riêng>
  const companyMatch =
    /^(?:Công\s+ty|Cty)\s+(TNHH(?:\s+MTV)?|Cổ\s+phần|CP)\s+(.+)$/i.exec(trimmed);
  if (companyMatch) {
    const isJsc = /^(?:Cổ\s+phần|CP)$/i.test(companyMatch[1].trim());
    const enSuffix = isJsc ? "JSC" : "Co., Ltd.";
    const zhSuffix = isJsc ? "股份有限公司" : "有限公司";
    const rest = companyMatch[2].trim();

    const impExpMatch = /^Xuất\s+Nhập\s+Khẩu(?:\s+Nông\s+sản)?\s+(.+)$/i.exec(rest);
    if (impExpMatch) {
      const proper = impExpMatch[1].trim();
      return lang === "zh"
        ? `${proper} 进出口${zhSuffix}`
        : `${proper} Import-Export ${enSuffix}`;
    }

    const agriExpMatch = /^Nông\s+sản\s+Xuất\s+khẩu\s+(.+)$/i.exec(rest);
    if (agriExpMatch) {
      const proper = agriExpMatch[1].trim();
      return lang === "zh"
        ? `${proper} 出口农产品${zhSuffix}`
        : `${proper} Export Agricultural Products ${enSuffix}`;
    }

    const agriCoMatch = /^Nông\s+(?:sản|nghiệp)\s+(.+)$/i.exec(rest);
    if (agriCoMatch) {
      const proper = agriCoMatch[1].trim();
      return lang === "zh"
        ? `${proper} 农产品${zhSuffix}`
        : `${proper} Agricultural Products ${enSuffix}`;
    }

    const tradeMatch = /^Thương\s+mại(?:\s*(?:-|và|&)?\s*Dịch\s+vụ)?\s+(.+)$/i.exec(rest);
    if (tradeMatch) {
      const proper = tradeMatch[1].trim();
      return lang === "zh" ? `${proper} 贸易${zhSuffix}` : `${proper} Trading ${enSuffix}`;
    }

    return lang === "zh" ? `${rest} ${zhSuffix}` : `${rest} ${enSuffix}`;
  }

  if (/^(?:Hợp\s+tác\s+xã|HTX)\b/i.test(trimmed)) {
    return localizeCoopName(trimmed, lang);
  }

  return trimmed;
}

export function localizeGrowingZoneName(rawName: string, lang: TraceLang): string {
  const trimmed = (rawName || "").trim();
  if (!trimmed || lang === "vi") return trimmed;

  const coopZoneMatch =
    /^Vùng\s+trồng\s+sầu\s+riêng\s+liên\s+kết\s+(?:Hợp\s+tác\s+xã|HTX)(?:\s+Nông\s+nghiệp)?\s+(.+)$/i.exec(
      trimmed,
    );
  if (coopZoneMatch) {
    const proper = coopZoneMatch[1].trim();
    return lang === "zh"
      ? `${proper} 合作社联合榴莲种植区`
      : `${proper} Cooperative Linked Durian Growing Zone`;
  }

  const communeZoneMatch =
    /^Vùng\s+trồng\s+sầu\s+riêng(?:\s+xuất\s+khẩu)?\s+xã\s+(.+)$/i.exec(trimmed);
  if (communeZoneMatch) {
    const proper = communeZoneMatch[1].trim();
    return lang === "zh" ? `${proper} 乡榴莲种植区` : `${proper} Commune Durian Growing Zone`;
  }

  const durianZoneMatch =
    /^Vùng\s+trồng\s+sầu\s+riêng(?:\s+xuất\s+khẩu)?\s+(.+)$/i.exec(trimmed);
  if (durianZoneMatch) {
    const proper = durianZoneMatch[1].trim();
    return lang === "zh" ? `${proper} 榴莲种植区` : `${proper} Durian Growing Zone`;
  }

  const genericZoneMatch = /^Vùng\s+trồng\s+(.+)$/i.exec(trimmed);
  if (genericZoneMatch) {
    const proper = genericZoneMatch[1].trim();
    return lang === "zh" ? `${proper} 种植区` : `${proper} Growing Zone`;
  }

  return lang === "zh"
    ? "Cư Né 合作社联合榴莲种植区"
    : "Cư Né Cooperative Linked Durian Growing Zone";
}

export function localizeGroupName(rawGroup: string, householdCount: number, lang: TraceLang): string {
  if (lang === "vi") return rawGroup;
  const cleaned = (rawGroup || "").replace(/\([^)]*\)/g, "").trim();
  const placeMatch = /(?:xã|thôn|buôn|HTX)\s+(.+)$/i.exec(cleaned);
  const proper = placeMatch?.[1]?.trim() || "Cư Né";

  if (householdCount > 1) {
    return lang === "zh"
      ? `${proper} VietGAP 榴莲联合生产组（${householdCount} 户成员果园）`
      : `${proper} VietGAP Durian Producer Group (${householdCount} member households)`;
  }
  return lang === "zh"
    ? `${proper} VietGAP 榴莲生产组`
    : `${proper} VietGAP Durian Producer Group`;
}

export function localizeLabName(rawLab: string, lang: TraceLang): string {
  const trimmed = (rawLab || "").trim();
  if (!trimmed || lang === "vi") return trimmed;

  if (/Phòng\s+kiểm\s+nghiệm\s+độc\s+lập/i.test(trimmed)) {
    return lang === "zh" ? "指定独立第三方检测机构" : "Designated Independent Testing Laboratory";
  }

  if (/QUATEST\s*3|Kỹ\s+thuật\s+Tiêu\s+chuẩn\s+Đo\s+lường\s+Chất\s+lượng\s+3/i.test(trimmed)) {
    return lang === "zh"
      ? "第3质量计量标准技术中心 (QUATEST 3)"
      : "Quality Assurance & Testing Center 3 (QUATEST 3)";
  }

  const centerMatch =
    /^Trung\s+tâm\s+(?:Phân\s+tích\s*(?:-|và|&)?\s*)?Kiểm\s+nghiệm(?:\s+An\s+toàn\s+Thực\s+phẩm|\s+Chất\s+lượng\s+Nông\s+lâm\s+thủy\s+sản)?\s+(.+)$/i.exec(
      trimmed,
    );
  if (centerMatch) {
    const proper = centerMatch[1].trim();
    return lang === "zh" ? `${proper} 检测中心` : `${proper} Testing Center`;
  }

  const labPrefixMatch =
    /^Phòng\s+(?:Phân\s+tích\s*(?:-|và|&)?\s*)?Kiểm\s+nghiệm(?:\s+An\s+toàn\s+Thực\s+phẩm)?\s+(.+)$/i.exec(
      trimmed,
    );
  if (labPrefixMatch) {
    const proper = labPrefixMatch[1].trim();
    return lang === "zh" ? `${proper} 检测实验室` : `${proper} Testing Laboratory`;
  }

  const instMatch = /^Viện\s+Kiểm\s+nghiệm\s+(.+)$/i.exec(trimmed);
  if (instMatch) {
    const proper = instMatch[1].trim();
    return lang === "zh" ? `${proper} 检验研究院` : `${proper} Testing Institute`;
  }

  if (/^(?:Công\s+ty|Cty)\b/i.test(trimmed)) {
    return localizePackhouseName(trimmed, lang);
  }

  return trimmed
    .replace(/\bViệt\s+Nam\b/gi, lang === "zh" ? "越南" : "Vietnam");
}

export function localizeOwnerLabel(rawOwner: string, lang: TraceLang): string {
  const trimmed = (rawOwner || "").trim();
  if (!trimmed || lang === "vi") return trimmed;

  const memberMatch = /^Hộ\s+thành\s+viên\s+(.+)$/i.exec(trimmed);
  if (memberMatch) {
    const rest = memberMatch[1].trim();
    if (/^(?:HTX\s+)?Cư\s+Né$/i.test(rest)) {
      return lang === "zh" ? "Cư Né 合作社成员农户" : "Cư Né Cooperative Member Grower";
    }
    return lang === "zh" ? `合作社成员户 ${rest}` : `Member Household ${rest}`;
  }

  const hhPrefix = /^Hộ\s+(.+)$/i.exec(trimmed);
  if (hhPrefix) {
    const proper = hhPrefix[1].trim();
    return lang === "zh" ? `农户 ${proper}` : `Grower ${proper}`;
  }

  return trimmed;
}

export function localizeAssessedBy(rawUnit: string, lang: TraceLang): string {
  const trimmed = (rawUnit || "").trim();
  if (!trimmed || lang === "vi") return trimmed;

  const communeTeamMatch =
    /^Tổ\s+Giám\s+sát(?:\s+Kỹ\s+thuật|\s+Cộng\s+đồng)?\s+UBND\s+Xã\s+(.+)$/i.exec(trimmed);
  if (communeTeamMatch) {
    const proper = communeTeamMatch[1].trim();
    return lang === "zh"
      ? `${proper} 乡人民委员会技术监督组`
      : `${proper} Commune Technical Supervisory Team`;
  }

  return trimmed;
}

export function localizeVillageLabel(rawVillage: string, lang: TraceLang): string {
  const trimmed = (rawVillage || "").trim();
  if (!trimmed) return "";
  if (lang === "vi") return trimmed.replace(/\s*[—–-]\s*/g, ", ");

  const parts = trimmed
    .split(/\s*(?:,|—|–|-)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const mapped = parts.map((seg) => {
    const hamletNum = /^Thôn\s+(\d+[A-Za-z]?)$/i.exec(seg);
    if (hamletNum) {
      return lang === "zh" ? `第 ${hamletNum[1]} 村` : `Hamlet ${hamletNum[1]}`;
    }
    const hamletProper = /^Thôn\s+(.+)$/i.exec(seg);
    if (hamletProper) {
      return lang === "zh" ? `${hamletProper[1]} 村` : `${hamletProper[1]} Hamlet`;
    }
    const buonMatch = /^Buôn\s+(.+)$/i.exec(seg);
    if (buonMatch) {
      return lang === "zh" ? `Buôn ${buonMatch[1]} 村` : `Buôn ${buonMatch[1]} Village`;
    }
    const communeMatch = /^Xã\s+(.+)$/i.exec(seg);
    if (communeMatch) {
      return lang === "zh" ? `${communeMatch[1]} 乡` : `${communeMatch[1]} Commune`;
    }
    const districtMatch = /^Huyện\s+(.+)$/i.exec(seg);
    if (districtMatch) {
      return lang === "zh" ? `${districtMatch[1]} 县` : `${districtMatch[1]} District`;
    }
    const provinceMatch = /^Tỉnh\s+(.+)$/i.exec(seg);
    if (provinceMatch) {
      return lang === "zh" ? `${provinceMatch[1]} 省` : `${provinceMatch[1]} Province`;
    }
    return seg;
  });

  return lang === "zh" ? [...mapped].reverse().join(" ") : mapped.join(", ");
}

export function localizeInspectionNote(rawNote: string, lang: TraceLang): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(rawNote);
  if (m?.[1] && m[2] && m[3]) {
    if (lang === "vi") {
      return `Kiểm tra định kỳ tại vườn (gần nhất ngày ${m[3]}/${m[2]}/${m[1]}).`;
    }
    return lang === "zh"
      ? `种植区已完成定期现场核查（最近日期：${m[1]}-${m[2]}-${m[3]}）。`
      : `Growing zone periodically inspected (latest: ${m[1]}-${m[2]}-${m[3]}).`;
  }
  if (lang === "vi") {
    return "Vùng trồng được Ban Kỹ thuật Hợp tác xã Cư Né kiểm tra định kỳ trong vụ.";
  }
  return lang === "zh"
    ? "种植区已由 Cư Né 合作社技术委员会完成定期农事与安全间隔期核查。"
    : "Growing zone inspected and supervised by Cư Né Cooperative Technical Board.";
}

export function localizeTimelineStep(
  step: {
    key: string;
    title: string;
    responsibleUnit: string;
    detail: string;
    status: string;
  },
  context: {
    pucCode: string;
    packhouseCode: string;
    packhouseName: string;
    market: string;
    lang: TraceLang;
    participatingHouseholdCount?: number;
    weightTons?: number;
    avgBrix?: number | null;
    gradeAPct?: number | null;
    vehiclePlate?: string | null;
    temperatureC?: number | null;
    rawLotStatus?: string | null;
  },
): { title: string; responsibleUnit: string; detail: string } {
  const {
    lang,
    pucCode,
    packhouseCode,
    packhouseName,
    market,
    participatingHouseholdCount,
    weightTons,
    avgBrix,
    gradeAPct,
    vehiclePlate,
    temperatureC,
    rawLotStatus,
  } = context;

  // Tiếng Việt: hiển thị trực tiếp 100% nội dung động thực tế từ máy chủ (không ghi đè cứng)
  if (lang === "vi") {
    return {
      title: step.title.replace(/\s*&\s*/g, " và "),
      responsibleUnit: step.responsibleUnit.replace(/\s*&\s*/g, " và "),
      detail: step.detail.replace(/\s*&\s*/g, " và "),
    };
  }

  const isWarn = step.status === "warning";
  const isDone = step.status === "completed";
  const isCurrent = step.status === "current";
  const localizedPhName = localizePackhouseName(packhouseName, lang);

  switch (step.key) {
    case "orchard": {
      const hhEn =
        participatingHouseholdCount && participatingHouseholdCount > 0
          ? `, ${participatingHouseholdCount} member growers`
          : "";
      const hhZh =
        participatingHouseholdCount && participatingHouseholdCount > 0
          ? `（${participatingHouseholdCount} 户联营果农）`
          : "";
      return lang === "zh"
        ? {
          title: "果园管理",
          responsibleUnit: localizeCoopName(step.responsibleUnit, "zh") || "Cư Né 农业合作社",
          detail: isWarn
            ? `提示：果园注册编码 ${pucCode} 当前处于暂停或复核状态`
            : `注册果园 ${pucCode}${hhZh}，全程执行 VietGAP 栽培规程与采前安全间隔期管理`,
        }
        : {
          title: "Orchard",
          responsibleUnit: localizeCoopName(step.responsibleUnit, "en") || "Cư Né Agricultural Cooperative",
          detail: isWarn
            ? `Alert: Production Unit Code ${pucCode} is currently suspended or under review`
            : `PUC ${pucCode}${hhEn}, monitored under VietGAP orchard care logs and pre-harvest withdrawal safety`,
        };
    }

    case "harvest": {
      const enMetrics = [
        weightTons && weightTons > 0 ? `${Number(weightTons.toFixed(3))} t` : null,
        avgBrix && avgBrix > 0 ? `avg ${avgBrix}° Brix` : null,
      ].filter(Boolean);
      const zhMetrics = [
        weightTons && weightTons > 0 ? `${Number(weightTons.toFixed(3))} 吨` : null,
        avgBrix && avgBrix > 0 ? `平均糖度 ${avgBrix}° Brix` : null,
      ].filter(Boolean);
      return lang === "zh"
        ? {
          title: "成熟采收",
          responsibleUnit: "Cư Né 合作社采收与品控组",
          detail: isDone
            ? `按自然成熟度标准采收，果园现场初筛归集批次${zhMetrics.length ? `（${zhMetrics.join("，")}）` : ""}`
            : "待记录本批次商业采收日期",
        }
        : {
          title: "Harvest",
          responsibleUnit: "Cư Né Cooperative Harvest & Quality Team",
          detail: isDone
            ? `Harvested at natural maturity, field-sorted, and aggregated from member orchards${enMetrics.length ? ` (${enMetrics.join(", ")})` : ""}`
            : "Commercial harvest milestone pending registration",
        };
    }

    case "packing": {
      const gradeEn = gradeAPct && gradeAPct > 0 ? ` (Grade A: ${gradeAPct}%)` : "";
      const gradeZh = gradeAPct && gradeAPct > 0 ? `（A级果占比 ${gradeAPct}%）` : "";
      return lang === "zh"
        ? {
          title: "分级包装",
          responsibleUnit: `${localizedPhName} (${packhouseCode})`,
          detail: isWarn
            ? `提示：注册包装厂 ${packhouseCode} 当前处于暂停运营状态`
            : isDone
              ? `完成清洁吹扫、品质分级${gradeZh}、标准装箱并加贴批次溯源标签`
              : "正在等待注册包装厂接收初加工与装箱",
        }
        : {
          title: "Packing",
          responsibleUnit: `${localizedPhName} (${packhouseCode})`,
          detail: isWarn
            ? `Alert: Registered Packhouse ${packhouseCode} is currently suspended or inactive`
            : isDone
              ? `Cleaned, graded${gradeEn}, packed into batch-identified cartons, and labeled with origin traceability seals`
              : "Awaiting sorting and carton packing at registered packhouse",
        };
    }

    case "testing":
      return lang === "zh"
        ? {
          title: "安全检测",
          responsibleUnit: localizeLabName(step.responsibleUnit, "zh"),
          detail: isWarn
            ? "检测发现安全指标不达标，暂停出厂流通"
            : isDone
              ? "重金属指标合格、未检出碱性嫩黄O、农药残留符合安全标准"
              : "正在等待正式检测报告同步",
        }
        : {
          title: "Safety Testing",
          responsibleUnit: localizeLabName(step.responsibleUnit, "en"),
          detail: isWarn
            ? "Safety analysis detected a non-compliant parameter, held from dispatch"
            : isDone
              ? "Compliant heavy metal levels, negative for Yellow O, and pesticide residues within safe limits"
              : "Awaiting verified food safety test certificate",
        };

    case "export":
    default: {
      const mkt = localizeMarket(market, lang);
      const enChain = [
        vehiclePlate ? `vehicle ${vehiclePlate}` : null,
        temperatureC !== null && temperatureC !== undefined ? `${temperatureC}°C` : null,
      ].filter(Boolean);
      const zhChain = [
        vehiclePlate ? `车牌 ${vehiclePlate}` : null,
        temperatureC !== null && temperatureC !== undefined ? `冷链 ${temperatureC}°C` : null,
      ].filter(Boolean);
      return lang === "zh"
        ? {
          title: "检疫出厂",
          responsibleUnit: `${localizedPhName} 与植物检疫机关`,
          detail: isWarn
            ? "该批次已召回并停止流通"
            : isDone
              ? rawLotStatus === "delivered"
                ? `已完成交付验收，目标市场：${mkt}${zhChain.length ? `（${zhChain.join("，")}）` : ""}`
                : `已完成植物检疫单证核验并发运出库，目标市场：${mkt}${zhChain.length ? `（${zhChain.join("，")}）` : ""}`
              : isCurrent || rawLotStatus === "in_transit"
                ? `正在冷链发运途中，目标市场：${mkt}${zhChain.length ? `（${zhChain.join("，")}）` : ""}`
                : "正在办理出厂前最终检疫核验手续",
        }
        : {
          title: "Export / Dispatch",
          responsibleUnit: `${localizedPhName} & Plant Quarantine Authority`,
          detail: isWarn
            ? "Shipment lot has been recalled and halted from circulation"
            : isDone
              ? rawLotStatus === "delivered"
                ? `Completed delivery for market: ${mkt}${enChain.length ? ` (${enChain.join(", ")})` : ""}`
                : `Completed phytosanitary clearance and dispatched for market: ${mkt}${enChain.length ? ` (${enChain.join(", ")})` : ""}`
              : isCurrent || rawLotStatus === "in_transit"
                ? `In cold-chain transit for market: ${mkt}${enChain.length ? ` (${enChain.join(", ")})` : ""}`
                : "Completing final pre-dispatch quarantine verification",
        };
    }
  }
}
