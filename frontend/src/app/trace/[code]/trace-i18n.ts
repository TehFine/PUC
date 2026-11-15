export type TraceLang = "vi" | "en" | "zh";

const TRACE_LANG_STORAGE_KEY = "puc_trace_lang";

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
    passPromptTitle: string;
    passPromptDesc: string;
    passInputPlaceholder: string;
    passApplyBtn: string;
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
    loadingLabel: "Đang đối chiếu hồ sơ truy xuất nguồn gốc thời gian thực từ máy chủ…",
    errorState: {
      invalidCode: "Mã truy xuất không hợp lệ.",
      notFound: (code) =>
        `Không tìm thấy hồ sơ lô hàng, thùng đóng gói hoặc token QR "${code}". Quý khách vui lòng kiểm tra lại mã lô in trên nhãn thùng.`,
      serverError: "Có lỗi xảy ra khi truy vấn dữ liệu từ máy chủ. Quý khách vui lòng thử lại sau.",
      timeoutError: "Kết nối mạng quá chậm hoặc gián đoạn. Quý khách vui lòng thử tải lại trang.",
      networkError: "Không thể kết nối máy chủ để tra cứu. Quý khách vui lòng kiểm tra mạng và thử lại.",
      title: "Chưa tìm thấy thông tin",
      inputPlaceholder: "Nhập mã lô chữ dự phòng, mã thùng hoặc token QR...",
      searchBtn: "Tìm kiếm",
    },
    alerts: {
      revokedTitle: "CẢNH BÁO THU HỒI LÔ HÀNG TRÊN HỆ THỐNG",
      revokedDefaultDesc:
        "Lô hàng hoặc mã định danh này đã bị thu hồi trên máy chủ quản lý. Đề nghị dừng lưu thông và liên hệ HTX Cư Né để đối chiếu.",
      realtimeSuspendedTitle: "CẢNH BÁO TRẠNG THÁI THỜI GIAN THỰC (MÃ VÙNG TRỒNG / CƠ SỞ ĐÓNG GÓI)",
      realtimeSuspendedDesc: ({ pucCode, pucStatusText, packhouseCode, phcStatusText, note }) =>
        `Kiểm tra trực tiếp tại thời điểm quét: Mã vùng trồng ${pucCode} (${pucStatusText}) - Mã cơ sở đóng gói ${packhouseCode} (${phcStatusText}).${
          note ? ` Ghi chú quản lý: ${note}` : " Đề nghị đối chiếu hồ sơ pháp lý trước khi tiếp nhận lưu thông."
        }`,
      unverifiedTitle: "HỒ SƠ CHƯA KIỂM CHỨNG (BẢN KHAI ĐANG CHỜ DUYỆT)",
      unverifiedDesc:
        "Trang công khai chỉ hiển thị dữ liệu đã được HTX Cư Né kiểm chứng và phê duyệt; thông tin hộ dân tự khai ở trạng thái nháp được ẩn để bảo đảm tính xác thực.",
      multiCountryTitle: "CẢNH BÁO CHỐNG GIẢ: MÃ QUÉT TỪ NHIỀU QUỐC GIA",
      multiCountryDesc: (count, countries) =>
        `Mã định danh này được ghi nhận quét từ ${count} quốc gia khác nhau (${countries}) trong 24 giờ qua. Vui lòng đối chiếu mã lô dạng chữ in trên nhãn thùng và niêm phong hàng hóa.`,
      highFreqTitle: "CẢNH BÁO TẦN SUẤT QUÉT MÃ BẤT THƯỜNG",
      highFreqDesc: (scans24h, sources24h) =>
        `Phát hiện ${scans24h} lượt quét từ ${sources24h} nguồn mạng khác nhau trong 24 giờ qua. Vui lòng đối chiếu mã lô in trên nhãn thùng với đơn vị phân phối.`,
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
      qrCaption: "QR chống giả (Token ngẫu nhiên)",
      qrAlt: (code) => `Mã QR chống giả truy xuất lô ${code}`,
      scanStatFmt: (total, last24h, countriesText) =>
        `Số lần quét xác thực: ${total} lượt (${last24h} lượt trong 24 giờ qua${countriesText ? ` - ${countriesText}` : ""})`,
      countriesSuffixFmt: (countries) => `Quốc gia quét: ${countries}`,
      verifiedAtFmt: (dt) => `Kiểm tra trực tiếp lúc ${dt}`,
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
      statusRowLabel: "Trạng thái thời gian thực",
      validUntilFmt: (statusText, validUntil) => `${statusText} (Hiệu lực đến ${validUntil})`,
      coarseMapTitle: (pucCode) => `Bản đồ vùng trồng ở mức khái quát (${pucCode})`,
      coarseTabTerrain: "Địa hình vùng",
      coarseTabGrid: "Lưới tọa độ khái quát",
      coarseRadiusLabel: "Phạm vi khái quát R = 2.5 km",
      coarseCompassNorth: "B",
      coarseCenterTag: "Tâm vùng PUC (Làm tròn cấp xã)",
      coarsePrivacyNote:
        "Bản đồ vector nội tuyến tải tức thì (không phụ thuộc dịch vụ bản đồ bên ngoài), chỉ hiển thị phạm vi vùng trồng chung cấp xã, không lộ ranh giới từng thửa đất cá nhân.",
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
        `Tổng hợp: ${res} mg/kg - Chlorpyrifos: ${
          chlor !== null && chlor !== undefined ? `${chlor} mg/kg` : "KPH (Không phát hiện)"
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
      title: "Chứng nhận Toàn vẹn Sổ cái SHA-256 & Hạn ngạch Vùng trồng",
      badgeVerified: "Chuỗi băm nguyên vẹn",
      badgeAlert: "Phát hiện sai lệch chuỗi",
      sub: "Mỗi bản ghi canh tác, phun thuốc BVTV và biên bản kiểm tra đều bị khóa dấu thời gian máy chủ và nối chuỗi băm mật mã SHA-256 chống sửa lùi sau thu hoạch.",
      chainAlgorithmLabel: "Thuật toán niêm phong",
      sealedRecordsLabel: "Tổng bản ghi niêm phong",
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
      passBannerKicker: "Chế độ Đoàn Thẩm định Thực địa (Field Audit Mode)",
      passBannerActiveFmt: (delegation, org, expiresText) =>
        `${delegation} (${org}) - Thẻ hiệu lực đến ${expiresText}`,
      passBannerExitBtn: "Thoát thẻ thẩm định",
      passPromptTitle: "Dành cho Đoàn công tác Tỉnh & Đối tác Thu mua tại vườn",
      passPromptDesc:
        "Nhập Mã Thẻ Đoàn Thẩm định Thực địa do UBND Xã Cư Né hoặc Ban Quản trị HTX cấp để mở ranh giới thửa đất GIS, hạn ngạch sản lượng thửa và đối chứng GPS trực tiếp tại vườn (vẫn bảo mật CCCD & SĐT cá nhân nông hộ).",
      passInputPlaceholder: "Nhập mã thẻ đoàn (ví dụ: AUDIT-2026-CN01)...",
      passApplyBtn: "Kích hoạt thẻ thẩm định",
      passInvalidNote: "Mã thẻ thẩm định không tồn tại, đã hết hạn hoặc bị thu hồi.",
      cardKicker: "Hồ sơ Thẩm định Thực địa Thửa đất (Bảng QR Tại Vườn)",
      cardTitleFmt: (plotCode) => `Thửa canh tác định danh ${plotCode}`,
      privacyBadge: "Bảo mật CCCD & SĐT hộ dân",
      privacySub:
        "Hiển thị ranh giới đa giác GIS, định mức sản lượng đầu vụ và sổ cái SHA-256 của thửa đất để đối tác kiểm tra ngẫu nhiên ngoài thực địa.",
      plotSpecsTitle: "Thông số định danh thửa vườn",
      farmerRepLabel: "Chủ hộ canh tác",
      pucZoneLabel: "Mã vùng trồng (PUC)",
      areaTreesLabel: "Quy mô thửa",
      areaTreesFmt: (ha, trees) => `${ha} ha (${trees} cây kinh doanh)`,
      varietyYearLabel: "Giống & năm trồng",
      phiSafeBadge: "Đạt thời gian cách ly (PHI an toàn)",
      phiLockedFmt: (safeFrom) =>
        `Đang cách ly thuốc BVTV${safeFrom ? ` (An toàn từ ${safeFrom})` : ""}`,
      quotaTitle: "Trần sản lượng thẩm định của thửa (Mass-Balance)",
      quotaUsedFmt: (usedKg, capKg, pct) => `Đã xuất: ${usedKg} / ${capKg} kg (${pct}%)`,
      quotaAssessedFmt: (unit, dateText) => `Đơn vị thẩm định: ${unit} (${dateText})`,
      gpsMapTitle: "Bản đồ Ranh giới Thửa đất GIS & Đối chứng GPS Tại Vườn",
      gpsVerifyBtn: "Đối chứng vị trí GPS tại vườn",
      gpsVerifyingBtn: "Đang lấy tọa độ vệ tinh GPS...",
      gpsUnsupportedErr: "Thiết bị hoặc trình duyệt không hỗ trợ định vị GPS.",
      gpsPermissionErr: "Không thể lấy tọa độ GPS. Vui lòng bật quyền vị trí trên điện thoại và thử lại.",
      gpsInsideTitle: "XÁC THỰC THÀNH CÔNG: Đang đứng bên trong ranh giới thửa đất đã đăng ký",
      gpsNearTitle: (distM) =>
        `XÁC THỰC TIẾP GIÁP: Đang đứng sát bờ ranh thửa đất (Cách ranh ${distM} m, trong ngưỡng sai số GPS)`,
      gpsOutsideTitle: (distM) =>
        `NGOÀI RANH GIỚI THỬA: Vị trí hiện tại cách thửa đất này ${distM} m (Đang xem từ xa)`,
      gpsAccuracyFmt: (accM) => (accM ? `Sai số vệ tinh khoảng ±${Math.round(accM)} m` : "Định vị trực tiếp trên thiết bị"),
      recentCheckinsTitle: "Nhật ký Đoàn thẩm định đối chứng GPS tại thửa",
      noCheckinsYet: "Chưa có lượt bấm đối chứng GPS nào được ghi nhận tại thửa này.",
      sealedDiaryTitle: "Nhật ký canh tác niêm phong SHA-256 của thửa",
      sealedSprayTitle: "Nhật ký sử dụng thuốc BVTV & thời gian cách ly (PHI)",
      sealedMinutesTitle: "Biên bản kiểm tra thực địa của cán bộ xã / HTX",
      lateTag: "Ghi bổ sung muộn",
      onTimeTag: "Ghi đúng hạn",
      gpsVerifiedTag: "Khớp GPS tại vườn",
      emptyRecords: "Chưa có bản ghi nào trong mục này.",
    },
    processPhyto: {
      title: "Quy trình sản xuất, Mốc ngày & Kiểm dịch",
      harvestDateLabel: "Ngày thu hoạch",
      packDateLabel: "Ngày sơ chế / đóng gói",
      exportDateLabel: "Ngày xuất lô",
      standardLabel: "Tiêu chuẩn áp dụng",
      standardValue: "VietGAP & Nghị định thư Kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
      complianceLabel: "Xác nhận quy trình",
      complianceConfirmedText: "Tuân thủ quy trình canh tác & thời gian cách ly an toàn (Đã duyệt)",
      complianceReviewingText: "Đang rà soát bổ sung hồ sơ kỹ thuật trước xuất lô",
      inspectionLabel: "Giám sát vùng trồng",
      phytoLabel: "Chứng nhận kiểm dịch TV",
      phytoIssuedFmt: (certNo, dateText) =>
        dateText ? `${certNo} (Cấp ${dateText})` : certNo,
      phytoDefaultPending: "Cấp theo từng lô hàng xuất khẩu tại cơ sở đóng gói",
      nationalStandardNote:
        "Đường dẫn QR dùng token ngẫu nhiên chống giả, kiểm tra trực tiếp trạng thái PUC - PHC thời gian thực, chỉ hiển thị dữ liệu đã kiểm chứng và sẵn sàng liên thông Cổng Truy xuất nguồn gốc Quốc gia.",
    },
    authHint: {
      compactBtn: "Dành cho đối tác / cơ quan quản lý: Đăng nhập",
      text: "Dành cho Cơ sở đóng gói, Nhà phân phối và Cơ quan quản lý: Đăng nhập để xem hồ sơ truy xuất mở rộng theo phạm vi quản lý (mọi lượt xem đều ghi nhật ký kiểm toán).",
      loginBtn: "Dành cho đối tác / cơ quan quản lý: Đăng nhập",
    },
    scopeAccess: {
      deniedTitle: "Bạn không có quyền xem chi tiết lô này",
      deniedDesc: (viewerName, roleLabel, scopeReason) =>
        `Tài khoản ${viewerName} (${roleLabel}) đã đăng nhập nhưng lô hàng này nằm ngoài phạm vi được phân quyền.${
          scopeReason ? ` Lý do: ${scopeReason}` : ""
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
      line1: "Hệ thống quản lý mã số vùng trồng & truy xuất nguồn gốc sầu riêng theo lô",
      line2: "Hợp Tác Xã Kinh Doanh - Dịch Vụ Tổng Hợp Cư Né (Tỉnh Đắk Lắk, Việt Nam)",
      line3:
        "Chuẩn dữ liệu sẵn sàng liên thông Cổng Truy xuất nguồn gốc sản phẩm, hàng hóa Quốc gia (Bộ KH&CN) và Cục TT&BVTV.",
    },
  },

  en: {
    langBar: {
      label: "Language",
      liveVerifiedBadge: "Real-time PUC - PHC Status: Active",
      liveAlertBadge: "Real-time PUC - PHC Status Alert",
    },
    topbar: {
      brand: "Cu Ne Coop",
      lookupOther: "Lookup Code",
      home: "Home",
    },
    loadingLabel: "Verifying real-time lot traceability dossier from server…",
    errorState: {
      invalidCode: "Invalid traceability code.",
      notFound: (code) =>
        `No shipment lot, carton box, or QR token found for "${code}". Please verify the plain-text lot code printed on the carton label.`,
      serverError: "An error occurred while querying the traceability server. Please try again shortly.",
      timeoutError: "Network connection is slow or interrupted. Please reload the page.",
      networkError: "Unable to reach the traceability server. Please check your connection and try again.",
      title: "Record Not Found",
      inputPlaceholder: "Enter plain-text lot code, carton code, or QR token...",
      searchBtn: "Lookup",
    },
    alerts: {
      revokedTitle: "SHIPMENT LOT RECALL NOTICE",
      revokedDefaultDesc:
        "This lot or identification token has been revoked on the central server. Please halt distribution immediately and contact Cu Ne Cooperative for verification.",
      realtimeSuspendedTitle: "REAL-TIME STATUS ALERT (GROWING ZONE PUC / PACKHOUSE PHC)",
      realtimeSuspendedDesc: ({ pucCode, pucStatusText, packhouseCode, phcStatusText, note }) =>
        `Live check at scan time: Growing Zone ${pucCode} (${pucStatusText}) - Packhouse ${packhouseCode} (${phcStatusText}).${
          note ? ` Regulatory note: ${note}` : " Please verify regulatory clearance before distribution."
        }`,
      unverifiedTitle: "UNVERIFIED DRAFT RECORD",
      unverifiedDesc:
        "Public traceability only displays records verified and approved by Cu Ne Cooperative; unapproved farmer draft declarations are withheld.",
      multiCountryTitle: "ANTI-COUNTERFEIT ALERT: MULTI-COUNTRY SCANS DETECTED",
      multiCountryDesc: (count, countries) =>
        `This QR token was scanned from ${count} different countries (${countries}) within the past 24 hours. Please cross-check the plain-text lot code printed on the carton seal.`,
      highFreqTitle: "ABNORMAL SCAN FREQUENCY WARNING",
      highFreqDesc: (scans24h, sources24h) =>
        `Detected ${scans24h} scans across ${sources24h} distinct network sources in the past 24 hours. Please verify physical carton seals with the authorized distributor.`,
    },
    watermark: {
      top: "CU NE DURIAN COOP",
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
      qrCaption: "Anti-counterfeit Dynamic QR",
      qrAlt: (code) => `Anti-counterfeit traceability QR for ${code}`,
      scanStatFmt: (total, last24h, countriesText) =>
        `Authenticated scans: ${total} total (${last24h} in last 24h${countriesText ? ` - ${countriesText}` : ""})`,
      countriesSuffixFmt: (countries) => `Countries: ${countries}`,
      verifiedAtFmt: (dt) => `Live server check at ${dt}`,
    },
    timeline: {
      title: "End-to-End Lot Journey: Orchard to Export",
      badge: "5-Step Traceability",
      sub: "Full milestone timestamps and accountable entities recorded across orchard care, harvest, packing, lab testing, and export.",
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
      statusRowLabel: "Live PUC Status",
      validUntilFmt: (statusText, validUntil) => `${statusText} (Valid until ${validUntil})`,
      coarseMapTitle: (pucCode) => `Coarse Growing Zone Overview (${pucCode})`,
      coarseTabTerrain: "Topographic",
      coarseTabGrid: "Coordinate Grid",
      coarseRadiusLabel: "Overview radius R = 2.5 km",
      coarseCompassNorth: "N",
      coarseCenterTag: "PUC Zone Center (Commune-level rounded)",
      coarsePrivacyNote:
        "Zero-external-dependency inline vector map for instant loading worldwide; displays commune-level zone scope only without exposing individual household plot boundaries.",
    },
    producerPackhouse: {
      title: "Producer & Registered Packhouse",
      producerLabel: "Producer Organization",
      groupLabel: "Associated Orchard Group",
      householdsLabel: "Participating Growers (Public)",
      representedByCoop: "Represented by Cu Ne Cooperative",
      packhouseNameLabel: "Packing Facility",
      packhouseCodeLabel: "Packhouse Code (PHC)",
      packhouseStatusLabel: "Live Packhouse Status",
      packhouseAddressLabel: "Facility Address",
      consentNoteWithNames:
        "Only approved member growers who granted explicit public disclosure consent are listed by name.",
      consentNoteHidden:
        "In accordance with personal data protection rules, individual grower identities are represented by Cu Ne Cooperative.",
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
        `Total: ${res} mg/kg - Chlorpyrifos: ${
          chlor !== null && chlor !== undefined ? `${chlor} mg/kg` : "ND (Not Detected)"
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
      title: "SHA-256 Ledger Integrity Seal & Season Mass-Balance",
      badgeVerified: "Hash Chain Intact",
      badgeAlert: "Chain Mismatch Alert",
      sub: "Every orchard log, pesticide application, and inspection minute is server-timestamped and cryptographically chained with SHA-256 to prevent post-harvest backdating.",
      chainAlgorithmLabel: "Cryptographic Seal",
      sealedRecordsLabel: "Total Sealed Entries",
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
      passBannerKicker: "On-Site Delegation Field Audit Mode",
      passBannerActiveFmt: (delegation, org, expiresText) =>
        `${delegation} (${org}) - Pass valid until ${expiresText}`,
      passBannerExitBtn: "Exit Audit Pass",
      passPromptTitle: "For Visiting Buyer Delegations & Provincial Inspectors",
      passPromptDesc:
        "Enter the Field Audit Pass code issued by Cu Ne Commune People's Committee or Cu Ne Cooperative to unlock exact GIS parcel polygons, plot yield quotas, and live smartphone GPS verification on site (farmer national ID and phone remain protected).",
      passInputPlaceholder: "Enter delegation pass (e.g. AUDIT-2026-CN01)...",
      passApplyBtn: "Activate Audit Pass",
      passInvalidNote: "Field audit pass code was not found, expired, or has been revoked.",
      cardKicker: "On-Site Orchard Parcel Audit Dossier (Plot Signboard QR)",
      cardTitleFmt: (plotCode) => `Registered Orchard Parcel ${plotCode}`,
      privacyBadge: "Farmer ID & Phone Redacted",
      privacySub:
        "Displays registered GIS polygon boundaries, pre-season audited yield ceiling, and SHA-256 sealed cultivation logs for random on-site buyer inspections.",
      plotSpecsTitle: "Registered Parcel Specifications",
      farmerRepLabel: "Member Grower",
      pucZoneLabel: "Production Unit Code (PUC)",
      areaTreesLabel: "Parcel Scale",
      areaTreesFmt: (ha, trees) => `${ha} ha (${trees} fruiting trees)`,
      varietyYearLabel: "Variety & Planted Year",
      phiSafeBadge: "PHI Cleared (Safe to Harvest)",
      phiLockedFmt: (safeFrom) =>
        `Active PHI Isolation${safeFrom ? ` (Safe from ${safeFrom})` : ""}`,
      quotaTitle: "Audited Parcel Season Quota (Mass-Balance)",
      quotaUsedFmt: (usedKg, capKg, pct) => `Used: ${usedKg} / ${capKg} kg (${pct}%)`,
      quotaAssessedFmt: (unit, dateText) => `Assessed by: ${unit} (${dateText})`,
      gpsMapTitle: "GIS Parcel Boundary & Live On-Site Smartphone GPS Check-In",
      gpsVerifyBtn: "Verify Live GPS Position at Orchard",
      gpsVerifyingBtn: "Acquiring satellite GPS coordinates...",
      gpsUnsupportedErr: "Geolocation is not supported on this device or browser.",
      gpsPermissionErr: "Unable to read GPS location. Please grant location permission on your phone and retry.",
      gpsInsideTitle: "VERIFIED ON-SITE: Standing inside the registered GIS parcel polygon",
      gpsNearTitle: (distM) =>
        `BOUNDARY VERIFIED: Standing at parcel edge (${distM} m from polygon, within GPS tolerance)`,
      gpsOutsideTitle: (distM) =>
        `OUTSIDE PARCEL: Current location is ${distM} m away from this orchard (Remote inspection)`,
      gpsAccuracyFmt: (accM) => (accM ? `Satellite accuracy approx. ±${Math.round(accM)} m` : "Live device GPS fix"),
      recentCheckinsTitle: "On-Site GPS Audit Check-In Log",
      noCheckinsYet: "No on-site GPS check-ins recorded for this parcel yet.",
      sealedDiaryTitle: "SHA-256 Sealed Orchard Cultivation Log",
      sealedSprayTitle: "Pesticide Application & PHI Compliance Log",
      sealedMinutesTitle: "Commune / Cooperative Field Inspection Minutes",
      lateTag: "Late Entry",
      onTimeTag: "On-Time",
      gpsVerifiedTag: "GPS Matched",
      emptyRecords: "No records in this section.",
    },
    processPhyto: {
      title: "Production Standard, Key Dates & Phytosanitary",
      harvestDateLabel: "Harvest Date",
      packDateLabel: "Sorting & Packing Date",
      exportDateLabel: "Dispatch / Export Date",
      standardLabel: "Applied Standard",
      standardValue: "VietGAP & Vietnam - China Phytosanitary Protocol (GACC)",
      complianceLabel: "Process Verification",
      complianceConfirmedText: "Verified VietGAP cultivation & Pre-Harvest Interval (PHI) compliance",
      complianceReviewingText: "Technical compliance dossier under pre-dispatch review",
      inspectionLabel: "Orchard Supervision",
      phytoLabel: "Phytosanitary Certificate",
      phytoIssuedFmt: (certNo, dateText) =>
        dateText ? `${certNo} (Issued ${dateText})` : certNo,
      phytoDefaultPending: "Issued per export shipment lot at registered packhouse",
      nationalStandardNote:
        "Anti-counterfeit random QR token URL with live PUC - PHC status verification, displaying approved records only and aligned with the Vietnam National Traceability Portal.",
    },
    authHint: {
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
      line1: "Durian Production Unit Code (PUC) & Batch Traceability System",
      line2: "Cu Ne General Business & Agricultural Cooperative (Dak Lak Province, Vietnam)",
      line3:
        "Data schema ready for interoperability with the Vietnam National Product Traceability Portal (MOST) and Plant Protection Department.",
    },
  },

  zh: {
    langBar: {
      label: "显示语言",
      liveVerifiedBadge: "种植区与包装厂编码实时状态：有效",
      liveAlertBadge: "种植区 / 包装厂编码实时状态预警",
    },
    topbar: {
      brand: "居内合作社",
      lookupOther: "查询其他批次",
      home: "首页",
    },
    loadingLabel: "正在向服务器实时核验榴莲批次溯源档案…",
    errorState: {
      invalidCode: "溯源码无效。",
      notFound: (code) =>
        `未找到与 "${code}" 对应的批次、包装箱或防伪溯源码。请核对包装箱标签上印刷的明文批次号。`,
      serverError: "查询溯源服务器时出错，请稍后重试。",
      timeoutError: "网络连接缓慢或中断，请刷新页面重试。",
      networkError: "无法连接溯源服务器，请检查网络后重试。",
      title: "未找到溯源记录",
      inputPlaceholder: "输入箱标明文批次号、箱号或防伪码...",
      searchBtn: "立即查询",
    },
    alerts: {
      revokedTitle: "批次召回警告（禁止流通）",
      revokedDefaultDesc:
        "该批次或溯源标识已被管理服务器正式召回。请立即停止流通并联系越南居内榴莲合作社核实。",
      realtimeSuspendedTitle: "实时状态预警（注册果园 PUC / 注册包装厂 PHC）",
      realtimeSuspendedDesc: ({ pucCode, pucStatusText, packhouseCode, phcStatusText, note }) =>
        `扫码实时核验结果：种植区注册编码 ${pucCode}（${pucStatusText}） - 包装厂注册编码 ${packhouseCode}（${phcStatusText}）。${
          note ? ` 监管备注：${note}` : " 请在接收或通关流通前核实最新监管状态。"
        }`,
      unverifiedTitle: "待核验记录提示（仅展示已审核数据）",
      unverifiedDesc:
        "公开溯源页面仅展示经合作社审核认证的正式数据；农户草稿申报记录不予公开展示。",
      multiCountryTitle: "防伪预警：检测到跨国异常扫码",
      multiCountryDesc: (count, countries) =>
        `该防伪溯源码在过去 24 小时内从 ${count} 个不同国家/地区（${countries}）被扫描。请仔细核对外箱印刷的明文批次号与封签完整性。`,
      highFreqTitle: "防伪预警：扫码频率异常偏高",
      highFreqDesc: (scans24h, sources24h) =>
        `过去 24 小时内检测到来自 ${sources24h} 个网络源的 ${scans24h} 次高频扫描。请与授权进口分销商核对原箱封条与批次号。`,
    },
    watermark: {
      top: "越南居内榴莲合作社",
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
      qrCaption: "随机令牌防伪溯源码",
      qrAlt: (code) => `批次 ${code} 防伪溯源二维码`,
      scanStatFmt: (total, last24h, countriesText) =>
        `累计核验扫码：${total} 次（近24小时 ${last24h} 次${countriesText ? ` - ${countriesText}` : ""}）`,
      countriesSuffixFmt: (countries) => `扫码地区：${countries}`,
      verifiedAtFmt: (dt) => `服务器实时核验时间：${dt}`,
    },
    timeline: {
      title: "榴莲批次全链路溯源：果园至出口通关",
      badge: "五步全链路溯源",
      sub: "完整记录果园管理、采收、分级包装、实验室检测及植物检疫出口各环节日期与责任主体，符合输华溯源要求。",
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
      statusRowLabel: "编码实时有效状态",
      validUntilFmt: (statusText, validUntil) => `${statusText}（有效期至 ${validUntil}）`,
      coarseMapTitle: (pucCode) => `注册种植区概览示意图 (${pucCode})`,
      coarseTabTerrain: "产区地形概览",
      coarseTabGrid: "经纬坐标网格",
      coarseRadiusLabel: "产区概览半径 R = 2.5 公里",
      coarseCompassNorth: "北",
      coarseCenterTag: "PUC 产区中心（乡级模糊坐标）",
      coarsePrivacyNote:
        "采用零外部依赖内联矢量示意图，在中国大陆及弱网环境下均可秒开；仅展示乡级产区概览范围，不公开农户个人地块精确边界。",
    },
    producerPackhouse: {
      title: "生产合作社与注册包装厂",
      producerLabel: "生产组织",
      groupLabel: "联合果园生产组",
      householdsLabel: "授权公开农户",
      representedByCoop: "由居内农业合作社统一代表",
      packhouseNameLabel: "注册包装厂名称",
      packhouseCodeLabel: "包装厂注册编码 (PHC)",
      packhouseStatusLabel: "包装厂实时状态",
      packhouseAddressLabel: "包装厂地址",
      consentNoteWithNames: "仅展示已通过资质审核且本人授权同意公开姓名的合作社成员农户。",
      consentNoteHidden: "根据个人信息保护规范，未单独授权公开的农户信息由居内合作社统一代表。",
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
        `综合农残：${res} mg/kg - 毒死蜱 (Chlorpyrifos)：${
          chlor !== null && chlor !== undefined ? `${chlor} mg/kg` : "未检出 (ND)"
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
      title: "SHA-256 防篡改农事账本封签与产区总产量配额管控",
      badgeVerified: "哈希链完整无篡改",
      badgeAlert: "账本校验预警",
      sub: "每一笔农事记录、用药记录及现场检查纪要均由服务器锁定时间戳并生成 SHA-256 密码学哈希链，杜绝采后补录或事后篡改。",
      chainAlgorithmLabel: "防篡改算法",
      sealedRecordsLabel: "已封存记录总数",
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
      passBannerKicker: "采购商与考察团现场核验模式 (Field Audit Mode)",
      passBannerActiveFmt: (delegation, org, expiresText) =>
        `${delegation}（${org}） - 核验通行证有效至 ${expiresText}`,
      passBannerExitBtn: "退出核验通行证",
      passPromptTitle: "面向中国采购商考察团与政府实地抽检组",
      passPromptDesc:
        "输入由居内乡人民政府或合作社签发的“现场考察核验通行码”，即可现场查看该地块精确 GIS 边界、单地块产量配额上限，并使用手机 GPS 实时验证您正站在注册果园地块内（农户身份证与电话仍受隐私保护）。",
      passInputPlaceholder: "输入考察通行码（例如：AUDIT-2026-CN01）...",
      passApplyBtn: "启用现场核验通行码",
      passInvalidNote: "考察通行码不存在、已过期或已被撤销。",
      cardKicker: "果园地块现场抽检核验档案（果园立牌二维码）",
      cardTitleFmt: (plotCode) => `注册果园地块编号 ${plotCode}`,
      privacyBadge: "已脱敏保护农户隐私",
      privacySub:
        "展示注册果园 GIS 矢量边界、产季评估产量上限及 SHA-256 哈希封存农事台账，支持采购商在果园现场随机抽检。",
      plotSpecsTitle: "地块注册核定参数",
      farmerRepLabel: "种植成员户",
      pucZoneLabel: "注册果园编码 (PUC)",
      areaTreesLabel: "地块面积与树数",
      areaTreesFmt: (ha, trees) => `${ha} 公顷（${trees} 株挂果树）`,
      varietyYearLabel: "品种与定植年份",
      phiSafeBadge: "已过安全间隔期（准予采收）",
      phiLockedFmt: (safeFrom) =>
        `处于农残安全间隔期锁定期${safeFrom ? `（解封日期 ${safeFrom}）` : ""}`,
      quotaTitle: "单地块产季核定配额上限 (Mass-Balance)",
      quotaUsedFmt: (usedKg, capKg, pct) => `已归集出货：${usedKg} / ${capKg} 公斤（${pct}%）`,
      quotaAssessedFmt: (unit, dateText) => `核定单位：${unit}（${dateText}）`,
      gpsMapTitle: "注册地块 GIS 精确边界与手机 GPS 现场定位核验",
      gpsVerifyBtn: "使用手机 GPS 现场核验果园位置",
      gpsVerifyingBtn: "正在获取手机卫星定位坐标...",
      gpsUnsupportedErr: "当前设备或浏览器不支持 GPS 地理定位。",
      gpsPermissionErr: "无法获取 GPS 坐标，请在手机浏览器中允许位置权限后重试。",
      gpsInsideTitle: "现场核验通过：您当前正站在该注册果园 GIS 边界内部",
      gpsNearTitle: (distM) =>
        `边界核验通过：您位于地块边缘（距边界线 ${distM} 米，在卫星定位误差允许范围内）`,
      gpsOutsideTitle: (distM) =>
        `不在地块边界内：您当前位置距该果园地块 ${distM} 米（远程查阅模式）`,
      gpsAccuracyFmt: (accM) => (accM ? `卫星定位精度约 ±${Math.round(accM)} 米` : "手机实时卫星定位"),
      recentCheckinsTitle: "考察团现场 GPS 打卡核验记录",
      noCheckinsYet: "该地块暂无现场 GPS 打卡核验记录。",
      sealedDiaryTitle: "地块 SHA-256 封存农事作业台账",
      sealedSprayTitle: "植保用药与安全间隔期 (PHI) 台账",
      sealedMinutesTitle: "乡政府 / 合作社现场巡检纪要",
      lateTag: "事后补录",
      onTimeTag: "实时录入",
      gpsVerifiedTag: "GPS 现场实拍",
      emptyRecords: "暂无相关记录。",
    },
    processPhyto: {
      title: "生产标准、关键时间节点与植物检疫",
      harvestDateLabel: "采收日期",
      packDateLabel: "初加工 / 包装日期",
      exportDateLabel: "出厂 / 出口日期",
      standardLabel: "执行标准",
      standardValue: "越南良好农业规范 (VietGAP) 及中越输华榴莲植物检疫议定书 (GACC)",
      complianceLabel: "规程合规核验",
      complianceConfirmedText: "已核验符合农残安全间隔期 (PHI) 与标准化栽培规程",
      complianceReviewingText: "出货前技术档案复核中",
      inspectionLabel: "果园监管记录",
      phytoLabel: "植物检疫证书编号",
      phytoIssuedFmt: (certNo, dateText) =>
        dateText ? `${certNo}（签发日期 ${dateText}）` : certNo,
      phytoDefaultPending: "按出口发运批次由口岸/植物检疫机关签发",
      nationalStandardNote:
        "本溯源码采用非连续随机防伪令牌，扫码实时核验果园 PUC 与包装厂 PHC 有效状态，仅展示已审核正式数据，并对接越南国家产品溯源门户标准。",
    },
    authHint: {
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
      line1: "越南鲜食榴莲注册果园编码 (PUC) 与批次全链路溯源系统",
      line2: "越南多乐省居内综合经营与农业服务合作社 (HTX Cư Né, Đắk Lắk)",
      line3: "数据标准符合越南国家商品溯源门户（科技部）与植物保护局互联互通规范。",
    },
  },
};

/** Dịch các nhãn động trả về từ máy chủ sang EN / ZH trên giao diện công khai (giữ nguyên tiếng Việt gốc khi lang === 'vi'). */
export function localizeProductName(rawName: string, traceUnit: string, lang: TraceLang): string {
  if (lang === "vi") return rawName;
  if (traceUnit === "fruit") {
    return lang === "zh"
      ? "居内合作社严选鲜食榴莲 (Durio zibethinus)"
      : "Cu Ne Select Fresh Durian (Durio zibethinus)";
  }
  if (traceUnit === "puc_zone") {
    return lang === "zh"
      ? "注册果园鲜食榴莲原料 (Durio zibethinus)"
      : "Registered Orchard Fresh Durian (Durio zibethinus)";
  }
  return lang === "zh"
    ? "越南鲜食榴莲整果 (Durio zibethinus)"
    : "Fresh Whole Durian (Durio zibethinus)";
}

export function localizeTraceUnitLabel(traceUnit: string, rawLabel: string, lang: TraceLang): string {
  if (lang === "vi") return rawLabel;
  if (traceUnit === "box") {
    return lang === "zh" ? "批次溯源标准包装箱" : "Batch-Identified Carton Box";
  }
  if (traceUnit === "fruit") {
    return lang === "zh" ? "精品单果防伪溯源签" : "Premium Single-Fruit Tag";
  }
  if (traceUnit === "puc_zone") {
    return lang === "zh" ? "注册果园原料产区标识" : "Registered Growing Zone Signboard";
  }
  return lang === "zh" ? "出口标准商品批次" : "Export Shipment Lot";
}

export function localizeLotStatusLabel(status: string, rawLabel: string, lang: TraceLang): string {
  if (lang === "vi") return rawLabel;
  if (status === "revoked") {
    return lang === "zh" ? "已召回 - 禁止流通" : "Recalled - Do Not Distribute";
  }
  if (status === "unverified") {
    return lang === "zh" ? "待审核草稿 - 未认证" : "Unverified Draft Record";
  }
  if (status === "pending") {
    return lang === "zh" ? "出货前采样检验中" : "Pre-dispatch Sampling & Inspection";
  }
  return lang === "zh" ? "合格批次 - 准予流通" : "Valid Lot - Cleared for Distribution";
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
  if (lang === "vi") return rawMarket;
  const lower = (rawMarket || "").toLowerCase();
  if (lower.includes("trung quốc") || lower.includes("china") || lower.includes("gacc")) {
    return lang === "zh" ? "中国正贸出口 (GACC)" : "China Official Export (GACC)";
  }
  if (lower.includes("xuất khẩu")) {
    return lang === "zh" ? "正贸出口批次" : "Official Export";
  }
  return rawMarket;
}

export function localizeAdminLocation(rawLoc: string, lang: TraceLang): string {
  if (lang === "vi") return rawLoc;
  if (/ea\s*kh[aă]l/i.test(rawLoc)) {
    return lang === "zh"
      ? "越南多乐省亚赫辽县亚卡乡 (Ea Khăl, Ea H'Leo, Đắk Lắk)"
      : "Ea Khal Commune, Ea H'Leo District, Dak Lak Province, Vietnam";
  }
  return lang === "zh"
    ? "越南多乐省克容布县居内乡 (Cư Né, Krông Búk, Đắk Lắk)"
    : "Cu Ne Commune, Krong Buk District, Dak Lak Province, Vietnam";
}

export function localizeGrowingZoneName(rawName: string, lang: TraceLang): string {
  if (lang === "vi") return rawName;
  return lang === "zh"
    ? "居内农业合作社联合注册榴莲种植区"
    : "Cu Ne Cooperative Linked Durian Growing Zone";
}

export function localizeCoopName(rawName: string, lang: TraceLang): string {
  if (lang === "vi") return rawName;
  if (rawName.includes("Cư Né")) {
    return lang === "zh"
      ? "越南居内综合经营与农业服务合作社 (HTX Cư Né)"
      : "Cu Ne General Business & Agricultural Cooperative (HTX Cu Ne)";
  }
  return rawName;
}

export function localizeGroupName(rawGroup: string, householdCount: number, lang: TraceLang): string {
  if (lang === "vi") return rawGroup;
  if (householdCount > 1) {
    return lang === "zh"
      ? `居内乡 VietGAP 榴莲联合生产组（${householdCount} 户注册成员果园）`
      : `Cu Ne VietGAP Durian Producer Group (${householdCount} member orchards)`;
  }
  return lang === "zh" ? "居内合作社 VietGAP 注册果园组" : "Cu Ne VietGAP Registered Orchard Group";
}

export function localizeInspectionNote(rawNote: string, lang: TraceLang): string {
  if (lang === "vi") return rawNote;
  const m = /(\d{4}-\d{2}-\d{2})/.exec(rawNote);
  if (m?.[1]) {
    return lang === "zh"
      ? `种植区已完成定期现场核查（最近核查日期：${m[1]}）。`
      : `Growing zone periodically inspected (latest inspection: ${m[1]}).`;
  }
  return lang === "zh"
    ? "种植区已由合作社技术委员会完成定期农事与安全间隔期核查。"
    : "Growing zone inspected and supervised by Cu Ne Cooperative Technical Board.";
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
  },
): { title: string; responsibleUnit: string; detail: string } {
  const { lang, pucCode, packhouseCode, packhouseName, market } = context;
  if (lang === "vi") {
    return {
      title: step.title,
      responsibleUnit: step.responsibleUnit,
      detail: step.detail,
    };
  }

  const isWarn = step.status === "warning";
  const isDone = step.status === "completed";

  switch (step.key) {
    case "orchard":
      return lang === "zh"
        ? {
            title: "果园管理",
            responsibleUnit: "越南居内农业合作社 (HTX Cư Né)",
            detail: isWarn
              ? `预警：果园注册编码 ${pucCode} 当前处于暂停或撤销核查状态`
              : `注册果园 ${pucCode} - 全程执行 VietGAP 农事记录与采前安全间隔期 (PHI) 管控`,
          }
        : {
            title: "Orchard",
            responsibleUnit: "Cu Ne Agricultural Cooperative",
            detail: isWarn
              ? `Alert: Production Unit Code ${pucCode} is currently suspended or under review`
              : `PUC ${pucCode} - Monitored under VietGAP orchard logs & Pre-Harvest Interval (PHI) control`,
          };

    case "harvest":
      return lang === "zh"
        ? {
            title: "成熟采收",
            responsibleUnit: "居内合作社采收与技术品控组",
            detail: isDone
              ? "按生理成熟度与糖度（Brix）标准采收，果园现场初筛并按源头地块归集批次"
              : "待记录本批次商业采收时间节点",
          }
        : {
            title: "Harvest",
            responsibleUnit: "Cu Ne Coop Harvest & QC Team",
            detail: isDone
              ? "Harvested at physiological maturity (target Brix), field-sorted and aggregated by source plots"
              : "Commercial harvest milestone pending registration",
          };

    case "packing":
      return lang === "zh"
        ? {
            title: "分级包装",
            responsibleUnit: `${packhouseName} (${packhouseCode})`,
            detail: isWarn
              ? `预警：注册包装厂 ${packhouseCode} 当前处于暂停或停止运营状态`
              : isDone
                ? "完成清洁吹扫、等级分选、标准箱装盒并加贴随机防伪溯源二维码封签"
                : "正在等待注册包装厂接收初加工与装箱",
          }
        : {
            title: "Packing",
            responsibleUnit: `${packhouseName} (${packhouseCode})`,
            detail: isWarn
              ? `Alert: Registered Packhouse ${packhouseCode} is currently suspended or inactive`
              : isDone
                ? "Cleaned, graded, packed into batch-identified cartons and sealed with anti-counterfeit QR tokens"
                : "Awaiting sorting and carton packing at registered packhouse",
          };

    case "testing":
      return lang === "zh"
        ? {
            title: "安全检测",
            responsibleUnit: step.responsibleUnit.includes("Phòng kiểm nghiệm")
              ? "指定独立第三方检测实验室"
              : step.responsibleUnit,
            detail: isWarn
              ? "实验室检测发现安全指标超标 - 禁止出厂流通"
              : isDone
                ? "重金属镉 (Cd) 达标、碱性嫩黄 O（黄O）阴性未检出、农残符合安全限量"
                : "正在等待实验室正式审核检测报告同步",
          }
        : {
            title: "Lab Testing",
            responsibleUnit: step.responsibleUnit.includes("Phòng kiểm nghiệm")
              ? "Accredited Independent Testing Laboratory"
              : step.responsibleUnit,
            detail: isWarn
              ? "Laboratory analysis detected non-compliant safety parameter - Not cleared for dispatch"
              : isDone
                ? "Compliant Cadmium (Cd), Negative for Auramine O (Yellow O), and pesticide residues within MRL"
                : "Awaiting verified laboratory test certificate synchronization",
          };

    case "export":
    default: {
      const mkt = localizeMarket(market, lang);
      return lang === "zh"
        ? {
            title: "检疫出口",
            responsibleUnit: `${packhouseCode} 包装厂与官方植物检疫机关`,
            detail: isWarn
              ? "该批次已被系统召回并锁定流通权限"
              : isDone
                ? `已完成植物检疫单证核验并发运出库，目标市场：${mkt}`
                : "正在办理出厂前最终检疫核验手续",
          }
        : {
            title: "Export / Dispatch",
            responsibleUnit: `Packhouse ${packhouseCode} & Plant Quarantine Authority`,
            detail: isWarn
              ? "Shipment lot has been recalled and locked from circulation"
              : isDone
                ? `Completed phytosanitary clearance and dispatched for market: ${mkt}`
                : "Completing final pre-dispatch quarantine verification",
          };
    }
  }
}

export function localizeGovernmentEndorsement(
  gov: {
    programTitle: string;
    directiveNo: string;
    communeAuthority: string;
    provincialAuthority: string;
    inspectionUnit: string;
  },
  lang: TraceLang,
): {
  programTitle: string;
  directiveNo: string;
  communeAuthority: string;
  provincialAuthority: string;
  inspectionUnit: string;
} {
  if (lang === "vi") return gov;
  if (lang === "zh") {
    return {
      programTitle: "越南多乐省政府督办 - 乡级鲜食榴莲数字化全链路溯源先锋示范工程",
      directiveNo: "多乐省农业数字化转型与输华注册果园编码 (PUC) 标准化督办计划",
      communeAuthority: "越南多乐省克容布县居内乡人民政府 (UBND Xã Cư Né)",
      provincialAuthority: "越南多乐省人民委员会 - 农业与环境厅",
      inspectionUnit: "居内乡社区联合监督组与居内合作社技术委员会",
    };
  }
  return {
    programTitle: "Dak Lak Provincial Pioneer Commune-Level Durian Traceability Program",
    directiveNo: "Dak Lak Agricultural Digital Transformation & Export PUC Standardization Initiative",
    communeAuthority: "Cu Ne Commune People's Committee - Krong Buk District",
    provincialAuthority: "Dak Lak Provincial People's Committee - Dept. of Agriculture & Environment",
    inspectionUnit: "Cu Ne Commune Community Supervisory Board & Coop Technical Unit",
  };
}

export function localizeAttestationParty(
  party: {
    partyKey: string;
    roleLabel: string;
    actorName: string;
    summary: string;
  },
  lang: TraceLang,
): { roleLabel: string; actorName: string; summary: string } {
  if (lang === "vi") {
    return {
      roleLabel: party.roleLabel,
      actorName: party.actorName,
      summary: party.summary,
    };
  }

  if (party.partyKey === "producer") {
    return lang === "zh"
      ? {
          roleLabel: "第一方：注册农户与生产合作社",
          actorName: localizeCoopName(party.actorName, "zh"),
          summary: "全程记录电子农事与植保台账，服务器自动锁定时间戳并生成 SHA-256 哈希链",
        }
      : {
          roleLabel: "Party 1: Member Growers & Producer Coop",
          actorName: localizeCoopName(party.actorName, "en"),
          summary: "Electronic orchard & spray logs sealed with server timestamps and SHA-256 hash chain",
        };
  }

  if (party.partyKey === "commune_gov") {
    return lang === "zh"
      ? {
          roleLabel: "第二方：乡人民政府与社区监督组",
          actorName: "居内乡人民政府 (UBND Xã Cư Né) 与社区监督组",
          summary: "实地清点挂果树核定产季配额上限 (Mass-Balance)，开展不定期现场抽检与封签核验",
        }
      : {
          roleLabel: "Party 2: Commune Government & Supervisory Board",
          actorName: "Cu Ne Commune People's Committee & Supervisory Unit",
          summary: "Pre-season tree count & yield quota assessment (Mass-Balance) with periodic field inspections",
        };
  }

  return lang === "zh"
    ? {
        roleLabel: "第三方：ISO/IEC 17025 独立实验室与检疫机构",
        actorName: party.actorName,
        summary: "独立采样检测重金属镉 (Cd)、黄O及农残指标，支持外部实验室官网交叉核验与口岸植物检疫",
      }
    : {
        roleLabel: "Party 3: ISO/IEC 17025 Lab & Plant Quarantine",
        actorName: party.actorName,
        summary: "Independent sampling for Cadmium (Cd), Auramine O & MRLs with external lab cross-verification",
      };
}
