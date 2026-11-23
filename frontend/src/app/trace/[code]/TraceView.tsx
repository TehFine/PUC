"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { MediaBottomSheet } from "@/components/ui/MediaBottomSheet";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ROLE_LABELS } from "@/constants/roles";
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT } from "@/lib/api-client";
import {
  PUC_URL_SYNC_EVENT,
  pushUrlNavigation,
  replaceUrlPreservingState,
} from "@/lib/back-navigation";
import { reportRequestTime } from "@/lib/network";
import {
  isSafeExternalHttpsUrl,
  isSafeMediaUrl,
  isSafeTraceCode,
  safeDecodeURIComponent,
} from "@/utils/url-safety";
import type { Role } from "@/types/api";
import type { PlotStatus, PortalPlot } from "@/types/portal";
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  ShieldAlert,
  Lock,
  ShieldCheck,
} from "@/components/ui/PublicIcon";
import type { FieldAuditDataPayload } from "./FieldAuditGpsCheckCard";
import TraceAccessRequestBanner from "./TraceAccessRequestBanner";
import {
  TRACE_UI_COPY,
  detectInitialTraceLang,
  persistTraceLang,
  formatTraceDate,
  formatTraceDateTime,
  formatTraceNumber,
  getTraceLoadingLabel,
  getRevokedAlertCopy,
  getScanAnomalyAlertCopy,
  getScopeDeniedCopy,
  getTraceQrAlt,
  inferTraceKindFromCode,
  rememberTraceKindHint,
  resolveInitialTraceKind,
  localizeProductName,
  localizeVariety,
  localizeTraceUnitLabel,
  localizeLotStatusLabel,
  localizeZoneStatusLabel,
  localizePackhouseStatusLabel,
  localizeMarket,
  localizeAddress,
  localizeAdminLocation,
  localizeGrowingZoneName,
  localizeCoopName,
  localizePackhouseName,
  localizeLabName,
  localizeGroupName,
  localizeVillageLabel,
  localizeInspectionNote,
  localizeTimelineStep,
  type TraceLang,
  type TraceTargetKind,
} from "./trace-i18n";
import "./trace.css";

const CoarseZoneOverviewMap = dynamic(() => import("./CoarseZoneOverviewMap"), {
  ssr: false,
});
const PlotMapModal = dynamic(() => import("@/components/portal/PlotMapModal"), {
  ssr: false,
});
const FieldAuditGpsCheckCard = dynamic(() => import("./FieldAuditGpsCheckCard"), {
  ssr: false,
});

type ViewerTier = "public" | "enterprise" | "authority";
type ErrorKind = "invalid" | "not_found" | "server" | "timeout" | "network";

interface TraceFieldAuditPassStatus {
  active: boolean;
  code?: string;
  delegationName?: string;
  organization?: string;
  allowedZoneCode?: string | null;
  defaultLang?: "vi" | "en" | "zh";
  expiresAt?: string;
  issuedByName?: string;
  invalidReason?: string | null;
}

interface TraceTemporaryGrantStatus {
  active: boolean;
  requestCode: string;
  requesterName: string;
  organization: string;
  grantedTier: "enterprise" | "authority";
  scopeMode: string;
  expiresAt: string;
  reviewedByName: string | null;
}

interface TraceAccessControl {
  viewerTier: ViewerTier;
  actualTier: ViewerTier;
  roleBaseTier?: ViewerTier;
  viewerTierLabel: string;
  isAuthenticated: boolean;
  viewerRole: Role | null;
  viewerName: string | null;
  scopeDenied?: boolean;
  scopeDeniedMessage?: string | null;
  scopeReason?: string | null;
  auditLogged: boolean;
  fieldAuditPass?: TraceFieldAuditPassStatus | null;
  temporaryGrant?: TraceTemporaryGrantStatus | null;
}

interface TraceTimelineStep {
  step: number;
  key: string;
  title: string;
  date: string | null;
  responsibleUnit: string;
  detail: string;
  status: "completed" | "current" | "upcoming" | "warning" | string;
}

interface TracePublicLabTest {
  code: string;
  sampledOn: string;
  lab: string;
  labAccreditationCode?: string | null;
  externalVerifyCode?: string | null;
  externalVerifyUrl?: string | null;
  cdMgKg: number;
  yellowOPositive: boolean;
  residueMgKg: number;
  chlorpyrifosMgKg: number | null;
  result: string;
  scanUrl: string | null;
}

interface TraceIntegritySeal {
  hashAlgorithm: string;
  chainVerified: boolean;
  totalSealedRecords: number;
  journalCount?: number;
  sprayCount?: number;
  minuteCount?: number;
  verifiedRecords: number;
  tamperedRecords: number;
  onTimeRecords: number;
  lateRecordCount: number;
  onTimePct: number;
  avgDelayHours: number;
  gpsVerifiedRecords: number;
  latestLedgerHash: string | null;
  farmerBackdateCapDays: number;
  lateThresholdHours: number;
  phiAutoLockEnabled: boolean;
  massBalanceLockEnabled: boolean;
}

interface TraceMassBalanceSummary {
  seasonYear: number;
  pucCode: string;
  assessedPlotCount: number;
  totalAreaHa: number;
  totalTreeCount: number;
  zoneMaxQuotaKg: number;
  cumulativeUsedKg: number;
  remainingQuotaKg: number;
  utilizationPct: number;
  withinQuota: boolean;
  assessedBy: string;
  assessedOn: string | null;
}

interface TraceRealtimeStatus {
  checkedAt: string;
  allClear: boolean;
  hasSuspensionAlert: boolean;
  lotStatus: string;
  pucCode: string;
  pucStatus: "active" | "suspended" | "revoked" | "pending" | string;
  pucStatusLabel: string;
  pucNote: string | null;
  packhouseCode: string;
  packhouseStatus: "active" | "suspended" | "revoked" | "inactive" | string;
  packhouseStatusLabel: string;
}

interface TraceDossierContributor {
  index: number;
  visibilityLevel: "public" | "enterprise" | "authority";
  isAnonymized: boolean;
  displayName: string | null;
  householdCode: string | null;
  villageName: string;
  pucCode: string;
  sharePct: number;
  complianceStatus: "valid" | "review" | string;
  plotCode: string | null;
  areaHa: number | null;
  weightKg: number | null;
  phone: string | null;
  cccdMasked: string | null;
  cadastralLabel: string | null;
  publicConsent: boolean | null;
}

interface TracePublicData {
  lotIdentity: {
    productName: string;
    variety: string;
    lotCode: string;
    qrToken?: string | null;
    scannedCode: string;
    traceUnit: "lot" | "box" | "fruit" | "puc_zone" | string;
    traceUnitLabel: string;
    weightTons: number;
    itemWeightKg: number | null;
    itemGrade: string | null;
    market: string;
    status: "valid" | "revoked" | "pending" | "unverified" | string;
    rawLotStatus?: string | null;
    avgBrix?: number | null;
    gradeAPct?: number | null;
    treatmentMethod?: string | null;
    transporter?: string | null;
    vehiclePlate?: string | null;
    temperatureC?: number | null;
    statusLabel: string;
    revokedReason: string | null;
  };
  growingZone: {
    name: string;
    pucCode: string;
    additionalZoneCount: number;
    adminLocation: string;
    status: "active" | "suspended" | "revoked" | "pending" | string;
    statusLabel: string;
    statusNote?: string | null;
    validUntil: string;
    coarseMap: {
      centerLat: number;
      centerLng: number;
      radiusMeters: number;
      zoom: number;
      label: string;
      privacyNote: string;
    };
  };
  producer: {
    cooperativeName: string;
    groupName: string;
    participatingHouseholdCount: number;
    consentedHouseholds: string[];
    dossierContributorsTier?: "public" | "enterprise" | "authority";
    dossierContributors?: TraceDossierContributor[];
    consentNote: string;
  };
  packhouse: {
    name: string;
    code: string;
    address: string;
    status?: "active" | "suspended" | "revoked" | "inactive" | string;
    statusLabel?: string;
  };
  realtimeStatus?: TraceRealtimeStatus;
  milestones: {
    harvestedOn: string | null;
    packedOn: string | null;
    exportedOn: string | null;
    sampledOn: string | null;
  };
  timeline: TraceTimelineStep[];
  farmingProcess: {
    standard: string;
    complianceConfirmed: boolean;
    complianceNote: string;
    inspectionNote: string;
  };
  labTests: TracePublicLabTest[];
  phytosanitary: {
    certNo: string | null;
    issuedOn: string | null;
    authority: string;
    statusLabel: string;
  };
  integritySeal?: TraceIntegritySeal | null;
  massBalanceSummary?: TraceMassBalanceSummary | null;
  verification: {
    verifiedAt: string;
    totalScans: number;
    scansLast24h: number;
    distinctSources24h?: number;
    distinctCountries24h?: number;
    countries24h?: string[];
    isAbnormal: boolean;
    warningReason?: "revoked" | "realtime_suspended" | "multi_country" | "high_frequency" | null;
    warningMessage: string | null;
    nationalStandardNote: string;
  };
}

interface TraceEnterpriseSourceZone {
  zoneCode: string;
  villageName: string;
  householdCount: number;
  areaHa: number;
  weightKg: number;
  sharePct: number;
  status: string;
}

interface TraceEnterpriseDetailedLab {
  code: string;
  zoneCode: string;
  sampledOn: string;
  lab: string;
  labAccreditationCode?: string | null;
  externalVerifyCode?: string | null;
  externalVerifyUrl?: string | null;
  cdMgKg: number;
  cdThresholdMgKg: number;
  yellowOPositive: boolean;
  residueMgKg: number;
  residueThresholdMgKg: number;
  chlorpyrifosMgKg: number | null;
  result: string;
  scanUrl: string | null;
}

interface TraceEnterprisePlotQuotaRow {
  plotCode: string;
  zoneCode: string;
  areaHa: number;
  treeCount: number;
  maxQuotaKg: number;
  usedKg: number;
  remainingKg: number;
  utilizationPct: number;
  withinQuota: boolean;
  assessedOn: string | null;
}

interface TraceEnterpriseMassBalance extends TraceMassBalanceSummary {
  thisLotWeightKg: number;
  usedBeforeThisLotKg: number;
  plots: TraceEnterprisePlotQuotaRow[];
}

interface TraceFieldAuditSourcePlot {
  plotCode: string;
  qrToken: string | null;
  zoneCode: string;
  variety: string | null;
  areaHa: number;
  status: string;
}

interface TraceEnterpriseData {
  sourceZones: TraceEnterpriseSourceZone[];
  totalSourceWeightKg: number;
  massBalance?: TraceEnterpriseMassBalance | null;
  fieldAuditSourcePlots?: TraceFieldAuditSourcePlot[];
  detailedLabTests: TraceEnterpriseDetailedLab[];
  packingSpecs: {
    gradeAPct: number | null;
    gradeBPct: number | null;
    gradeCPct: number | null;
    avgBrix: number | null;
    treatmentMethod: string | null;
    transporter: string | null;
    vehiclePlate: string | null;
    temperatureC: number | null;
    departedAt: string | null;
    estimatedArrival: string | null;
  } | null;
}

interface TraceAuthorityPlot {
  plotCode: string;
  zoneCode: string | null;
  sheetNo: string | null;
  parcelNo: string | null;
  variety: string | null;
  plantedYear: number | null;
  areaHa: number;
  status: string;
  source: "declared" | "measured" | "cadastral" | "demo" | string | null;
  lat: number | null;
  lng: number | null;
  geometryJson: string | null;
}

interface TraceAuthorityHousehold {
  householdCode: string;
  householdName: string;
  villageName: string;
  phone: string;
  cccdMasked: string;
  status: string;
  publicTraceConsent: boolean;
  contributedKg: number | null;
  contributedPlotCode?: string | null;
  plots: TraceAuthorityPlot[];
}

interface TraceDiaryEntry {
  kind?: "spray" | "journal";
  entryOn: string;
  plotCode: string;
  activity: string;
  detail: string | null;
  recorder: string;
  householdName?: string;
  mrlStatus?: string | null;
  isolationDays?: number | null;
  serverRecordedAt?: string | null;
  entryDelayHours?: number;
  isLateEntry?: boolean;
  recordHash?: string | null;
  gpsVerified?: boolean;
  gpsDistanceM?: number | null;
  photoUrl?: string | null;
}

interface TraceInspectionMinute {
  code: string;
  heldOn: string;
  location: string;
  officer: string;
  result: string;
  plotCode?: string | null;
  gpsVerified?: boolean;
  gpsDistanceM?: number | null;
  recordHash?: string | null;
  photoUrl?: string | null;
}

interface TraceInternalViolation {
  severity: "critical" | "warning" | string;
  title: string;
  householdLabel?: string;
  detectedOn: string;
  plotCode?: string | null;
  description?: string | null;
  status?: string;
}

interface TraceAuthorityData {
  sourceHouseholds: TraceAuthorityHousehold[];
  cultivationDiaries: TraceDiaryEntry[];
  inspectionMinutes: TraceInspectionMinute[];
  internalViolations: TraceInternalViolation[];
}

interface TracePlotSignboardInfo {
  plotCode: string;
  qrToken?: string | null;
  zoneCode: string;
  villageName?: string | null;
  variety?: string | null;
  plantedYear?: number | null;
  areaHa: number;
  treeCount: number;
  plotStatus?: "approved" | "pending" | "violation" | string;
  lastCareOn?: string | null;
  lastInspectionOn?: string | null;
  latestMinuteCode?: string | null;
  latestMinuteOfficer?: string | null;
  linkedLotCode?: string | null;
}

interface TraceData {
  verifiedAt: string;
  accessControl: TraceAccessControl;
  isFarmerStamp?: boolean;
  isPlotSignboard?: boolean;
  plotSignboard?: TracePlotSignboardInfo | null;
  item?: {
    serialCode?: string;
    itemType?: string;
    weightKg?: number | null;
    grade?: string | null;
  } | null;
  farmerStamp?: {
    serialCode?: string;
    variety?: string;
  } | null;
  publicData: TracePublicData;
  enterpriseData?: TraceEnterpriseData;
  authorityData?: TraceAuthorityData;
  fieldAuditData?: FieldAuditDataPayload;
}

const DOSSIER_SHEET_COPY: Record<
  TraceLang,
  {
    docTitle: string;
    verifiedDatePrefix: string;
    originHeading: string;
    destinationHeading: string;
    farmersPrefix: string;
    marketPrefix: string;
    validUntilPrefix: string;
    productMetaPrefix: string;
    lotNoPrefix: string;
    unitSerialPrefix: string;
    colNo: string;
    colStage: string;
    colUnit: string;
    colDate: string;
    colResult: string;
    lotScaleHeading: string;
    unitWeightHeading: string;
    tonsUnit: string;
    rowHeavyMetalYellowO: string;
    rowPesticideSafety: string;
    rowFarmJournal: string;
    rowYieldCheck: string;
    rowPhytosanitary: string;
    rowFinalStatus: string;
    heavyMetalPassText: string;
    heavyMetalFailText: string;
    pesticidePassText: string;
    pesticideFailText: string;
    phiCompliantText: string;
    journalVerifiedText: string;
    journalReviewText: string;
    withinQuotaText: string;
    overQuotaText: string;
    labReportLineFmt: (code: string, passed: boolean) => string;
    viewLabScanLabel: string;
    verifyLabPortalLabel: string;
    certColHeading: string;
    labUnitPrefix: string;
    labCertPrefix: string;
    supervisionPrefix: string;
    showMapBtn: string;
    hideMapBtn: string;
    termsColHeading: string;
    assuranceLine1: string;
    assuranceLine2: string;
    issuerHeading: string;
    continuedLabel: string;
    pageIndicatorFmt: (cur: number, total: number) => string;
  }
> = {
  vi: {
    docTitle: "HỒ SƠ LÔ HÀNG",
    verifiedDatePrefix: "NGÀY XÁC THỰC:",
    originHeading: "VÙNG TRỒNG NGUỒN",
    destinationHeading: "ĐÓNG GÓI VÀ XUẤT KHẨU",
    farmersPrefix: "Hộ tham gia",
    marketPrefix: "Thị trường",
    validUntilPrefix: "Hiệu lực đến",
    productMetaPrefix: "SẢN PHẨM",
    lotNoPrefix: "MÃ LÔ",
    unitSerialPrefix: "MÃ ĐƠN VỊ",
    colNo: "STT",
    colStage: "QUY TRÌNH TRUY XUẤT",
    colUnit: "ĐƠN VỊ",
    colDate: "NGÀY",
    colResult: "KẾT QUẢ",
    lotScaleHeading: "KHỐI LƯỢNG LÔ HÀNG",
    unitWeightHeading: "QUY CÁCH ĐƠN VỊ",
    tonsUnit: "tấn",
    rowHeavyMetalYellowO: "KIM LOẠI NẶNG VÀ VÀNG O:",
    rowPesticideSafety: "DƯ LƯỢNG THUỐC BVTV:",
    rowFarmJournal: "NHẬT KÝ CANH TÁC:",
    rowYieldCheck: "SẢN LƯỢNG VÙNG TRỒNG:",
    rowPhytosanitary: "KIỂM DỊCH THỰC VẬT:",
    rowFinalStatus: "KẾT LUẬN XÁC THỰC:",
    heavyMetalPassText: "Đạt chuẩn, Không Vàng O",
    heavyMetalFailText: "Cần kiểm tra lại chỉ tiêu",
    pesticidePassText: "Trong ngưỡng an toàn",
    pesticideFailText: "Vượt ngưỡng cho phép",
    phiCompliantText: "Đủ thời gian cách ly",
    journalVerifiedText: "Đã kiểm tra đầy đủ",
    journalReviewText: "Đang rà soát bổ sung",
    withinQuotaText: "Đúng sản lượng vườn nguồn",
    overQuotaText: "Cần đối chiếu sản lượng",
    labReportLineFmt: (code, passed) =>
      passed
        ? `Phiếu ${code}: Đạt chuẩn Cadimi, Vàng O và dư lượng BVTV`
        : `Phiếu ${code}: Cần kiểm tra lại chỉ tiêu an toàn`,
    viewLabScanLabel: "Xem bản scan phiếu kiểm nghiệm",
    verifyLabPortalLabel: "Đối chiếu tại đơn vị kiểm nghiệm",
    certColHeading: "Hồ sơ Kiểm nghiệm và Vùng trồng:",
    labUnitPrefix: "Đơn vị kiểm nghiệm",
    labCertPrefix: "Mã phiếu",
    supervisionPrefix: "Giám sát",
    showMapBtn: "Xem bản đồ vệ tinh vùng trồng",
    hideMapBtn: "Thu gọn bản đồ vệ tinh",
    termsColHeading: "Cam kết Chất lượng và Xuất xứ:",
    assuranceLine1:
      "Sản phẩm thu hoạch đúng độ chín từ vùng trồng thành viên đã cấp mã số định danh, canh tác theo quy trình VietGAP và tuân thủ thời gian cách ly an toàn.",
    assuranceLine2:
      "Thông tin trên phiếu được công bố sau khi Hợp tác xã Cư Né đối chiếu nhật ký chăm sóc vườn, phiếu kiểm nghiệm an toàn thực phẩm và hồ sơ xuất xưởng.",
    issuerHeading: "ĐƠN VỊ XÁC THỰC",
    continuedLabel: "Xem tiếp trang sau",
    pageIndicatorFmt: (cur, total) =>
      `Trang ${String(cur).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
  },
  en: {
    docTitle: "LOT DOSSIER",
    verifiedDatePrefix: "VERIFIED.",
    originHeading: "ORIGIN GROWING ZONE",
    destinationHeading: "PACKHOUSE & DESTINATION",
    farmersPrefix: "Consented growers",
    marketPrefix: "Market",
    validUntilPrefix: "Valid until",
    productMetaPrefix: "PRODUCT",
    lotNoPrefix: "LOT NO",
    unitSerialPrefix: "UNIT ID",
    colNo: "NO",
    colStage: "TRACEABILITY STAGE",
    colUnit: "UNIT",
    colDate: "DATE",
    colResult: "STATUS",
    lotScaleHeading: "VERIFIED LOT VOLUME",
    unitWeightHeading: "VERIFIED UNIT SPEC",
    tonsUnit: "tons",
    rowHeavyMetalYellowO: "HEAVY METALS & YELLOW O:",
    rowPesticideSafety: "PESTICIDE SAFETY:",
    rowFarmJournal: "CULTIVATION LOG:",
    rowYieldCheck: "ORCHARD YIELD CHECK:",
    rowPhytosanitary: "PHYTOSANITARY CERT:",
    rowFinalStatus: "VERIFICATION STATUS:",
    heavyMetalPassText: "Compliant, Yellow O free",
    heavyMetalFailText: "Requires safety review",
    pesticidePassText: "Within safe limit",
    pesticideFailText: "Above safe limit",
    phiCompliantText: "Safe withdrawal period",
    journalVerifiedText: "Verified & complete",
    journalReviewText: "Under review",
    withinQuotaText: "Matches source orchard",
    overQuotaText: "Yield review required",
    labReportLineFmt: (code, passed) =>
      passed
        ? `Report ${code}: Heavy metals compliant, Yellow O not detected, pesticide residues safe`
        : `Report ${code}: Safety parameter requires review before circulation`,
    viewLabScanLabel: "View scanned lab certificate",
    verifyLabPortalLabel: "Verify with testing lab",
    certColHeading: "Testing & Zone Credentials:",
    labUnitPrefix: "Testing facility",
    labCertPrefix: "Certificate",
    supervisionPrefix: "Oversight",
    showMapBtn: "Show satellite growing zone map",
    hideMapBtn: "Hide satellite map",
    termsColHeading: "Origin & Quality Commitment:",
    assuranceLine1:
      "Harvested at proper maturity from registered member orchards cultivated under VietGAP standards and safe pre-harvest withdrawal periods.",
    assuranceLine2:
      "Information on this dossier is published after Cư Né Cooperative verifies orchard care logs, food safety test reports, and dispatch records.",
    issuerHeading: "ISSUING COOPERATIVE",
    continuedLabel: "Continued on next page",
    pageIndicatorFmt: (cur, total) =>
      `Page ${String(cur).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
  },
  zh: {
    docTitle: "批次溯源单",
    verifiedDatePrefix: "核验日期:",
    originHeading: "原产种植区",
    destinationHeading: "包装厂与出口市场",
    farmersPrefix: "公开农户",
    marketPrefix: "出口市场",
    validUntilPrefix: "有效期至",
    productMetaPrefix: "产品名称",
    lotNoPrefix: "批次编号",
    unitSerialPrefix: "单件编码",
    colNo: "序号",
    colStage: "溯源环节",
    colUnit: "责任单位",
    colDate: "日期",
    colResult: "结论",
    lotScaleHeading: "批次核定重量",
    unitWeightHeading: "单件核定规格",
    tonsUnit: "吨",
    rowHeavyMetalYellowO: "重金属与碱性嫩黄O:",
    rowPesticideSafety: "农药残留安全:",
    rowFarmJournal: "果园农事记录:",
    rowYieldCheck: "果园产量核对:",
    rowPhytosanitary: "植物检疫证书:",
    rowFinalStatus: "批次核验状态:",
    heavyMetalPassText: "检测合格，未检出黄O",
    heavyMetalFailText: "安全指标待复查",
    pesticidePassText: "符合安全标准",
    pesticideFailText: "超出安全标准",
    phiCompliantText: "符合安全间隔期",
    journalVerifiedText: "已完整核对",
    journalReviewText: "正在复核",
    withinQuotaText: "符合源头果园产量",
    overQuotaText: "产量需人工核对",
    labReportLineFmt: (code, passed) =>
      passed
        ? `报告 ${code}：重金属合格、未检出碱性嫩黄O、农药残留符合安全标准`
        : `报告 ${code}：发现安全指标需重新复核`,
    viewLabScanLabel: "查看检测报告扫描件",
    verifyLabPortalLabel: "检测机构官网核实",
    certColHeading: "检测机构与产区资质:",
    labUnitPrefix: "检测机构",
    labCertPrefix: "报告编号",
    supervisionPrefix: "果园监管",
    showMapBtn: "展开产区卫星地图",
    hideMapBtn: "收起卫星地图",
    termsColHeading: "原产地与品质承诺:",
    assuranceLine1:
      "采自已获注册编码的合作社成员果园，严格执行良好农业规范 (VietGAP) 与采前安全间隔期管理。",
    assuranceLine2:
      "本单所列信息均经 Cư Né 合作社核对果园管护台账、食品安全检测报告及出厂单证后正式发布。",
    issuerHeading: "签发合作社",
    continuedLabel: "续见下页",
    pageIndicatorFmt: (cur, total) =>
      `第 ${String(cur).padStart(2, "0")} / ${String(total).padStart(2, "0")} 页`,
  },
};

interface OrchardPlotStepCopy {
  stepNo: string;
  title: string;
  unit: string;
  detail: string;
  date: string | null;
  statusLabel: string;
  statusTone: "is-ok" | "is-danger" | "is-muted";
}

const PLOT_DOSSIER_COPY: Record<
  TraceLang,
  {
    docTitle: string;
    plotProfileHeading: string;
    zoneOversightHeading: string;
    plotTitleFmt: (code: string) => string;
    varietyYearFmt: (variety: string, year: number | null) => string;
    plotCodePrefix: string;
    cropMetaPrefix: string;
    cropName: string;
    colStage: string;
    plotScaleHeading: string;
    treesUnit: string;
    rowPucCode: string;
    rowCareJournal: string;
    rowPesticidePhi: string;
    rowPlotSampleTest: string;
    rowLatestLot: string;
    rowPlotFinalStatus: string;
    preHarvestSamplePending: string;
    noLinkedLotYet: string;
    linkedLotPrefix: string;
    plotStatusValid: string;
    plotStatusPending: string;
    plotStatusRevoked: string;
    fieldRecordPrefix: string;
    fieldScheduleFallback: string;
    certColHeading: string;
    termsColHeading: string;
    assuranceLine1: string;
    assuranceLine2: string;
    issuerHeading: string;
    buildSteps: (ctx: {
      plotCode: string;
      pucCode: string;
      coopName: string;
      areaText: string;
      treesText: string | null;
      assessedOn: string | null;
      lastCareOn: string | null;
      lastInspOn: string | null;
      minuteCode: string | null;
      minuteOfficer: string | null;
      firstLabCode: string | null;
      firstLabName: string | null;
      firstLabOn: string | null;
      anyLabFail: boolean;
      isSuspended: boolean;
      isPending: boolean;
      journalOk: boolean;
    }) => OrchardPlotStepCopy[];
  }
> = {
  vi: {
    docTitle: "HỒ SƠ THỬA ĐẤT",
    plotProfileHeading: "THÔNG TIN THỬA VƯỜN",
    zoneOversightHeading: "VÙNG TRỒNG ĐỊNH DANH VÀ GIÁM SÁT",
    plotTitleFmt: (code) => `Thửa canh tác ${code}`,
    varietyYearFmt: (v, yr) => (yr ? `Giống ${v}, trồng năm ${yr}` : `Giống canh tác: ${v}`),
    plotCodePrefix: "MÃ THỬA",
    cropMetaPrefix: "CÂY TRỒNG CANH TÁC",
    cropName: "Sầu riêng tại vườn",
    colStage: "QUY TRÌNH CANH TÁC",
    plotScaleHeading: "DIỆN TÍCH VÀ QUY MÔ THỬA",
    treesUnit: "cây",
    rowPucCode: "MÃ SỐ VÙNG TRỒNG:",
    rowCareJournal: "NHẬT KÝ CHĂM SÓC VƯỜN:",
    rowPesticidePhi: "AN TOÀN THUỐC BVTV:",
    rowPlotSampleTest: "MẪU KIỂM NGHIỆM THỬA:",
    rowLatestLot: "LÔ THU HOẠCH GẦN NHẤT:",
    rowPlotFinalStatus: "TRẠNG THÁI THỬA ĐẤT:",
    preHarvestSamplePending: "Lấy mẫu trước kỳ thu hoạch",
    noLinkedLotYet: "Đang chăm sóc tại vườn",
    linkedLotPrefix: "Lô thu hoạch gần nhất",
    plotStatusValid: "Thửa đất đủ điều kiện canh tác",
    plotStatusPending: "Hồ sơ thửa đang chờ thẩm định",
    plotStatusRevoked: "Tạm dừng để rà soát kỹ thuật",
    fieldRecordPrefix: "Biên bản thực địa",
    fieldScheduleFallback: "Theo lịch giám sát định kỳ HTX",
    certColHeading: "Hồ sơ Giám sát và Kiểm nghiệm vườn:",
    termsColHeading: "Cam kết Canh tác tại Thửa đất:",
    assuranceLine1:
      "Thửa đất nằm trong mạng lưới liên kết chính thức của Hợp tác xã Cư Né, canh tác theo quy trình VietGAP, tuân thủ danh mục vật tư được phép và thời gian cách ly an toàn.",
    assuranceLine2:
      "Mọi đợt thu hoạch thương mại từ thửa đất này đều được đối chiếu nhật ký chăm sóc và kiểm tra thực tế tại vườn trước khi đưa về cơ sở đóng gói.",
    issuerHeading: "ĐƠN VỊ QUẢN LÝ VÙNG TRỒNG",
    buildSteps: (ctx) => [
      {
        stepNo: "01.",
        title: "Định danh thửa đất và ranh giới canh tác",
        unit: ctx.coopName,
        detail: `Thửa ${ctx.plotCode} thuộc mã vùng trồng ${ctx.pucCode}, quy mô ${ctx.areaText}${ctx.treesText ? ` (${ctx.treesText})` : ""} đã đối chiếu hồ sơ vùng trồng`,
        date: ctx.assessedOn,
        statusLabel: ctx.isSuspended ? "Cảnh báo" : ctx.isPending ? "Chờ duyệt" : "Đã xác thực",
        statusTone: ctx.isSuspended ? "is-danger" : ctx.isPending ? "is-muted" : "is-ok",
      },
      {
        stepNo: "02.",
        title: "Nhật ký chăm sóc và dinh dưỡng tại vườn",
        unit: "Tổ kỹ thuật HTX Cư Né",
        detail: `Theo dõi lịch tưới nước, tỉa cành và bón phân định kỳ trên thửa ${ctx.plotCode} theo quy trình VietGAP`,
        date: ctx.lastCareOn || ctx.lastInspOn,
        statusLabel: ctx.journalOk ? "Đã xác thực" : "Đang rà soát",
        statusTone: ctx.journalOk ? "is-ok" : "is-muted",
      },
      {
        stepNo: "03.",
        title: "Kiểm soát thuốc BVTV và thời gian cách ly",
        unit: "Ban giám sát nội bộ HTX Cư Né",
        detail: ctx.isSuspended
          ? "Đang tạm dừng để kiểm tra lại nhật ký bảo vệ thực vật tại vườn"
          : "Sử dụng hoạt chất trong danh mục cho phép, đảm bảo thời gian cách ly an toàn trước thu hái",
        date: ctx.lastCareOn || ctx.lastInspOn,
        statusLabel: ctx.isSuspended ? "Cảnh báo" : "Đạt an toàn",
        statusTone: ctx.isSuspended ? "is-danger" : "is-ok",
      },
      {
        stepNo: "04.",
        title: "Kiểm tra thực địa hiện trường thửa vườn",
        unit: "Đoàn kiểm tra HTX và Cấp xã",
        detail: ctx.minuteCode
          ? `Biên bản kiểm tra thực địa ${ctx.minuteCode}${ctx.minuteOfficer ? `, cán bộ thực hiện: ${ctx.minuteOfficer}` : ""}`
          : "Thực hiện giám sát thực địa định kỳ tại thửa vườn theo kế hoạch mùa vụ của HTX",
        date: ctx.lastInspOn,
        statusLabel: ctx.minuteCode || !ctx.isPending ? "Đã kiểm tra" : "Theo lịch",
        statusTone: ctx.minuteCode || !ctx.isPending ? "is-ok" : "is-muted",
      },
      {
        stepNo: "05.",
        title: "Phân tích mẫu an toàn tại thửa vườn",
        unit: ctx.firstLabName || "Phòng kiểm nghiệm độc lập chỉ định",
        detail: ctx.firstLabCode
          ? `Phiếu ${ctx.firstLabCode}: Phân tích chỉ tiêu kim loại nặng Cadimi, Vàng O và dư lượng thuốc BVTV`
          : "Lấy mẫu phân tích an toàn thực phẩm định kỳ trước thời điểm mở cắt thu hoạch thương mại",
        date: ctx.firstLabOn,
        statusLabel: ctx.firstLabCode
          ? ctx.anyLabFail
            ? "Cảnh báo"
            : "Đạt chuẩn"
          : "Trước thu hoạch",
        statusTone: ctx.firstLabCode ? (ctx.anyLabFail ? "is-danger" : "is-ok") : "is-muted",
      },
    ],
  },
  en: {
    docTitle: "PLOT DOSSIER",
    plotProfileHeading: "ORCHARD PLOT PROFILE",
    zoneOversightHeading: "REGISTERED ZONE & OVERSIGHT",
    plotTitleFmt: (code) => `Orchard Plot ${code}`,
    varietyYearFmt: (v, yr) => (yr ? `Variety: ${v}, planted ${yr}` : `Cultivated variety: ${v}`),
    plotCodePrefix: "PLOT CODE",
    cropMetaPrefix: "CULTIVATED CROP",
    cropName: "Orchard Durian",
    colStage: "CULTIVATION STAGE",
    plotScaleHeading: "VERIFIED PLOT SCALE",
    treesUnit: "trees",
    rowPucCode: "GROWING ZONE CODE:",
    rowCareJournal: "ORCHARD CARE LOG:",
    rowPesticidePhi: "PESTICIDE SAFETY:",
    rowPlotSampleTest: "ORCHARD SAMPLE TEST:",
    rowLatestLot: "LATEST HARVEST LOT:",
    rowPlotFinalStatus: "ORCHARD PLOT STATUS:",
    preHarvestSamplePending: "Sampled prior to harvest",
    noLinkedLotYet: "In orchard cultivation",
    linkedLotPrefix: "Latest harvest lot",
    plotStatusValid: "Verified Active Orchard Plot",
    plotStatusPending: "Plot Dossier Pending Review",
    plotStatusRevoked: "Suspended for Technical Review",
    fieldRecordPrefix: "Field inspection",
    fieldScheduleFallback: "Scheduled cooperative inspection",
    certColHeading: "Orchard Oversight & Lab Records:",
    termsColHeading: "Orchard Cultivation Commitment:",
    assuranceLine1:
      "This orchard plot belongs to the official member network of Cư Né Cooperative, cultivated under VietGAP standards, approved inputs, and safe withdrawal periods.",
    assuranceLine2:
      "Every commercial harvest from this plot is cross-checked against orchard care logs and on-site inspection records prior to packhouse delivery.",
    issuerHeading: "MANAGING COOPERATIVE",
    buildSteps: (ctx) => [
      {
        stepNo: "01.",
        title: "Plot Registration & Boundary Verification",
        unit: ctx.coopName,
        detail: `Plot ${ctx.plotCode} registered under zone ${ctx.pucCode}, scale ${ctx.areaText}${ctx.treesText ? ` (${ctx.treesText})` : ""}`,
        date: ctx.assessedOn,
        statusLabel: ctx.isSuspended ? "Warning" : ctx.isPending ? "Pending" : "Verified",
        statusTone: ctx.isSuspended ? "is-danger" : ctx.isPending ? "is-muted" : "is-ok",
      },
      {
        stepNo: "02.",
        title: "Orchard Care & Nutrition Log",
        unit: "Cư Né Cooperative Technical Team",
        detail: `Scheduled irrigation, pruning, and fertilization tracked on plot ${ctx.plotCode} under VietGAP protocol`,
        date: ctx.lastCareOn || ctx.lastInspOn,
        statusLabel: ctx.journalOk ? "Verified" : "In Review",
        statusTone: ctx.journalOk ? "is-ok" : "is-muted",
      },
      {
        stepNo: "03.",
        title: "Crop Protection & Pre-Harvest Withdrawal",
        unit: "Cư Né Internal Supervisory Board",
        detail: ctx.isSuspended
          ? "Temporarily paused to review orchard crop protection records"
          : "Approved crop protection inputs only, enforcing safe pre-harvest withdrawal intervals",
        date: ctx.lastCareOn || ctx.lastInspOn,
        statusLabel: ctx.isSuspended ? "Warning" : "Compliant",
        statusTone: ctx.isSuspended ? "is-danger" : "is-ok",
      },
      {
        stepNo: "04.",
        title: "On-Site Orchard Field Inspection",
        unit: "Cooperative & Commune Inspection Team",
        detail: ctx.minuteCode
          ? `Field inspection record ${ctx.minuteCode}${ctx.minuteOfficer ? `, inspector: ${ctx.minuteOfficer}` : ""}`
          : "Periodic on-site orchard inspection conducted under seasonal cooperative schedule",
        date: ctx.lastInspOn,
        statusLabel: ctx.minuteCode || !ctx.isPending ? "Inspected" : "Scheduled",
        statusTone: ctx.minuteCode || !ctx.isPending ? "is-ok" : "is-muted",
      },
      {
        stepNo: "05.",
        title: "Orchard Sample Safety Testing",
        unit: ctx.firstLabName || "Designated Independent Testing Lab",
        detail: ctx.firstLabCode
          ? `Report ${ctx.firstLabCode}: Tested for heavy metal Cadmium, Yellow O, and pesticide residues`
          : "Pre-harvest food safety sample testing scheduled prior to commercial harvest opening",
        date: ctx.firstLabOn,
        statusLabel: ctx.firstLabCode
          ? ctx.anyLabFail
            ? "Warning"
            : "Compliant"
          : "Pre-harvest",
        statusTone: ctx.firstLabCode ? (ctx.anyLabFail ? "is-danger" : "is-ok") : "is-muted",
      },
    ],
  },
  zh: {
    docTitle: "果园地块档案",
    plotProfileHeading: "果园地块信息",
    zoneOversightHeading: "注册产区与技术监管",
    plotTitleFmt: (code) => `${code} 号果园地块`,
    varietyYearFmt: (v, yr) => (yr ? `栽培品种：${v}（${yr} 年定植）` : `栽培品种：${v}`),
    plotCodePrefix: "地块编号",
    cropMetaPrefix: "栽培作物",
    cropName: "在园鲜食榴莲",
    colStage: "果园管护与核查环节",
    plotScaleHeading: "地块核定面积与规模",
    treesUnit: "株",
    rowPucCode: "注册果园编码:",
    rowCareJournal: "果园管护台账:",
    rowPesticidePhi: "农药安全间隔期:",
    rowPlotSampleTest: "果园采样检测:",
    rowLatestLot: "最近采收批次:",
    rowPlotFinalStatus: "地块核验状态:",
    preHarvestSamplePending: "采前定期采样检测",
    noLinkedLotYet: "在园管护阶段",
    linkedLotPrefix: "最近采收批次",
    plotStatusValid: "合规在产果园地块",
    plotStatusPending: "地块档案审核中",
    plotStatusRevoked: "暂停效用待技术复核",
    fieldRecordPrefix: "实地巡检记录",
    fieldScheduleFallback: "按合作社产季计划巡检",
    certColHeading: "果园监管与检测凭证:",
    termsColHeading: "果园种植质量承诺:",
    assuranceLine1:
      "本地块隶属 Cư Né 合作社正式注册种植网络，严格按照良好农业规范 (VietGAP)、合规农资名录及采前安全间隔期进行管护。",
    assuranceLine2:
      "凡自本地块采收的商品果，均须核对果园管护台账并通过现场核验后方可运往包装厂。",
    issuerHeading: "产区管理合作社",
    buildSteps: (ctx) => [
      {
        stepNo: "01.",
        title: "地块登记与种植边界核查",
        unit: ctx.coopName,
        detail: `地块 ${ctx.plotCode} 隶属注册产区 ${ctx.pucCode}，核定规模 ${ctx.areaText}${ctx.treesText ? `（${ctx.treesText}）` : ""}`,
        date: ctx.assessedOn,
        statusLabel: ctx.isSuspended ? "警示" : ctx.isPending ? "待审" : "已核验",
        statusTone: ctx.isSuspended ? "is-danger" : ctx.isPending ? "is-muted" : "is-ok",
      },
      {
        stepNo: "02.",
        title: "果园日常管护与施肥台账",
        unit: "Cư Né 合作社技术组",
        detail: `按 VietGAP 规程全程记录地块 ${ctx.plotCode} 的灌溉、修剪及施肥作业`,
        date: ctx.lastCareOn || ctx.lastInspOn,
        statusLabel: ctx.journalOk ? "已核验" : "复核中",
        statusTone: ctx.journalOk ? "is-ok" : "is-muted",
      },
      {
        stepNo: "03.",
        title: "植保用药与安全间隔期管控",
        unit: "Cư Né 合作社内部监督组",
        detail: ctx.isSuspended
          ? "暂停待复查果园植保记录"
          : "严格使用准用农资名录，确保采收前达到安全间隔期要求",
        date: ctx.lastCareOn || ctx.lastInspOn,
        statusLabel: ctx.isSuspended ? "警示" : "安全合规",
        statusTone: ctx.isSuspended ? "is-danger" : "is-ok",
      },
      {
        stepNo: "04.",
        title: "果园现场巡检核验",
        unit: "合作社与乡级联合巡检组",
        detail: ctx.minuteCode
          ? `现场巡检记录编号 ${ctx.minuteCode}${ctx.minuteOfficer ? `，核查人员：${ctx.minuteOfficer}` : ""}`
          : "按合作社产季监管计划开展果园定期现场核查",
        date: ctx.lastInspOn,
        statusLabel: ctx.minuteCode || !ctx.isPending ? "已巡检" : "按计划",
        statusTone: ctx.minuteCode || !ctx.isPending ? "is-ok" : "is-muted",
      },
      {
        stepNo: "05.",
        title: "果园样本食品安全检测",
        unit: ctx.firstLabName || "指定独立检测实验室",
        detail: ctx.firstLabCode
          ? `报告 ${ctx.firstLabCode}：检测重金属镉 (Cd)、碱性嫩黄O及农药残留指标`
          : "商业开园采收前按规程开展食品安全抽样检测",
        date: ctx.firstLabOn,
        statusLabel: ctx.firstLabCode
          ? ctx.anyLabFail
            ? "待复查"
            : "检测合格"
          : "采前抽检",
        statusTone: ctx.firstLabCode ? (ctx.anyLabFail ? "is-danger" : "is-ok") : "is-muted",
      },
    ],
  },
};

const DOSSIER_CONTRIBUTORS_COPY: Record<
  TraceLang,
  {
    sectionTitle: string;
    continuedTitleFmt: (part: number, totalParts: number) => string;
    colNo: string;
    colHousehold: string;
    colZonePublic: string;
    colPlot: string;
    colSharePublic: string;
    colWeightShare: string;
    colCompliance: string;
    anonGrowerFmt: (idx: number) => string;
    memberByCodeFmt: (code: string) => string;
    outOfVillageFmt: (idx: number) => string;
    plotAreaFmt: (plotCode: string, areaText: string | null) => string;
    phonePrefix: string;
    cccdPrefix: string;
    statusValid: string;
    statusReview: string;
    emptyContributors: string;
  }
> = {
  vi: {
    sectionTitle: "HỘ THÀNH VIÊN ĐÓNG GÓP",
    continuedTitleFmt: (p, total) => `HỘ THÀNH VIÊN ĐÓNG GÓP (PHẦN ${p}/${total})`,
    colNo: "STT",
    colHousehold: "HỘ CANH TÁC",
    colZonePublic: "MÃ VÙNG (PUC)",
    colPlot: "THỬA ĐẤT",
    colSharePublic: "TỶ TRỌNG",
    colWeightShare: "SẢN LƯỢNG",
    colCompliance: "TRẠNG THÁI",
    anonGrowerFmt: (idx) => `Hộ thành viên #${String(idx).padStart(2, "0")}`,
    memberByCodeFmt: (code) => `Hộ thành viên ${code}`,
    outOfVillageFmt: (idx) => `Hộ liên kết #${String(idx).padStart(2, "0")}`,
    plotAreaFmt: (pCode, area) => (area ? `Thửa ${pCode} (${area} ha)` : `Thửa ${pCode}`),
    phonePrefix: "SĐT",
    cccdPrefix: "CCCD",
    statusValid: "Đủ điều kiện",
    statusReview: "Cần rà soát",
    emptyContributors: "Đang cập nhật danh sách hộ đóng góp.",
  },
  en: {
    sectionTitle: "CONTRIBUTING GROWERS",
    continuedTitleFmt: (p, total) => `CONTRIBUTING GROWERS (PART ${p}/${total})`,
    colNo: "NO",
    colHousehold: "GROWER",
    colZonePublic: "ZONE (PUC)",
    colPlot: "ORCHARD PLOT",
    colSharePublic: "SHARE",
    colWeightShare: "WEIGHT",
    colCompliance: "STATUS",
    anonGrowerFmt: (idx) => `Member Grower #${String(idx).padStart(2, "0")}`,
    memberByCodeFmt: (code) => `Member Household ${code}`,
    outOfVillageFmt: (idx) => `Linked Grower #${String(idx).padStart(2, "0")}`,
    plotAreaFmt: (pCode, area) => (area ? `Plot ${pCode} (${area} ha)` : `Plot ${pCode}`),
    phonePrefix: "Tel",
    cccdPrefix: "ID",
    statusValid: "Compliant",
    statusReview: "In Review",
    emptyContributors: "Updating contributing growers list.",
  },
  zh: {
    sectionTitle: "供货成员农户",
    continuedTitleFmt: (p, total) => `供货成员农户（第 ${p}/${total} 部分）`,
    colNo: "序号",
    colHousehold: "种植农户",
    colZonePublic: "产区编码",
    colPlot: "果园地块",
    colSharePublic: "占比",
    colWeightShare: "供货量",
    colCompliance: "状态",
    anonGrowerFmt: (idx) => `合作社农户 #${String(idx).padStart(2, "0")}`,
    memberByCodeFmt: (code) => `成员户 ${code}`,
    outOfVillageFmt: (idx) => `联营农户 #${String(idx).padStart(2, "0")}`,
    plotAreaFmt: (pCode, area) => (area ? `地块 ${pCode}（${area} 公顷）` : `地块 ${pCode}`),
    phonePrefix: "电话",
    cccdPrefix: "证件",
    statusValid: "合格",
    statusReview: "待复核",
    emptyContributors: "农户供货明细更新中。",
  },
};

const UNIT_DOSSIER_OVERRIDES: Record<
  TraceLang,
  {
    boxDocTitle: string;
    fruitDocTitle: string;
    boxCodePrefix: string;
    fruitCodePrefix: string;
    parentLotPrefix: string;
    boxScaleHeading: string;
    fruitScaleHeading: string;
    rowBoxFinalStatus: string;
    rowFruitFinalStatus: string;
  }
> = {
  vi: {
    boxDocTitle: "HỒ SƠ THÙNG ĐÓNG GÓI",
    fruitDocTitle: "HỒ SƠ TRÁI SẦU RIÊNG",
    boxCodePrefix: "MÃ THÙNG",
    fruitCodePrefix: "MÃ TEM TRÁI",
    parentLotPrefix: "THUỘC LÔ",
    boxScaleHeading: "KHỐI LƯỢNG THÙNG ĐÓNG GÓI",
    fruitScaleHeading: "KHỐI LƯỢNG TRÁI ĐỊNH DANH",
    rowBoxFinalStatus: "TRẠNG THÁI THÙNG HÀNG:",
    rowFruitFinalStatus: "TRẠNG THÁI TEM TRÁI:",
  },
  en: {
    boxDocTitle: "CARTON DOSSIER",
    fruitDocTitle: "FRUIT DOSSIER",
    boxCodePrefix: "CARTON ID",
    fruitCodePrefix: "FRUIT TAG",
    parentLotPrefix: "LOT NO",
    boxScaleHeading: "VERIFIED CARTON WEIGHT",
    fruitScaleHeading: "VERIFIED FRUIT WEIGHT",
    rowBoxFinalStatus: "CARTON STATUS:",
    rowFruitFinalStatus: "FRUIT TAG STATUS:",
  },
  zh: {
    boxDocTitle: "包装箱溯源单",
    fruitDocTitle: "单果溯源单",
    boxCodePrefix: "包装箱号",
    fruitCodePrefix: "单果签号",
    parentLotPrefix: "所属批次",
    boxScaleHeading: "包装箱核定净重",
    fruitScaleHeading: "单果核定净重",
    rowBoxFinalStatus: "包装箱核验状态:",
    rowFruitFinalStatus: "单果签核验状态:",
  },
};

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sanitizeTraceTextConnectors(raw: string): string {
  return raw
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s*\+\s*/g, ", ")
    .replace(/\s*[•·]\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .trim();
}

function formatCompactDiaryEntry(
  rawActivity: string,
  rawDetail: string | null | undefined,
  lang: TraceLang,
): { title: string; subtitle: string } {
  let title = sanitizeTraceTextConnectors(rawActivity || "");
  if (lang === "vi") {
    title = title
      .replace(/^Phun thuốc BVTV:\s*Chế phẩm\s+/i, "Phun chế phẩm ")
      .replace(/^Phun thuốc BVTV:\s*/i, "Phun thuốc: ");
  }

  if (!rawDetail) {
    return { title, subtitle: "" };
  }

  const titleLower = title.toLowerCase();
  const segments = rawDetail
    .split(/\s*\|\s*|\s*,\s*(?=(?:Hoạt chất|Liều lượng|Cách ly)\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const seg of segments) {
    const activeMatch = /^Hoạt chất:\s*(.+)$/i.exec(seg);
    if (activeMatch) {
      const cleanedActive = sanitizeTraceTextConnectors(activeMatch[1]).replace(/\bspp\./gi, "").replace(/\s{2,}/g, " ").trim();
      const mainTokens = cleanedActive
        .split(/[,\s/()-]+/)
        .map((tk) => tk.trim().toLowerCase())
        .filter((tk) => tk.length >= 5);
      const isRedundantWithTitle =
        mainTokens.length > 0 && mainTokens.every((tk) => titleLower.includes(tk));
      if (!isRedundantWithTitle && cleanedActive) {
        kept.push(lang === "vi" ? `Hoạt chất: ${cleanedActive}` : cleanedActive);
      }
      continue;
    }

    const doseMatch = /^Liều lượng:\s*(.+)$/i.exec(seg);
    if (doseMatch) {
      let cleanedDose = sanitizeTraceTextConnectors(doseMatch[1]);
      cleanedDose = cleanedDose
        .replace(/\s+(?:tưới quanh|phun ướt|phun đều|rải đều|bón quanh)\b.*$/i, "")
        .trim();
      if (cleanedDose) {
        kept.push(lang === "vi" ? `Liều: ${cleanedDose}` : cleanedDose);
      }
      continue;
    }

    const phiMatch = /^Cách ly(?:\s*PHI)?:\s*(\d+)\s*ngày$/i.exec(seg);
    if (phiMatch) {
      const days = Number(phiMatch[1]);
      if (days > 0) {
        kept.push(
          lang === "en"
            ? `Withdrawal: ${days}d`
            : lang === "zh"
              ? `间隔期 ${days} 天`
              : `Cách ly ${days} ngày`,
        );
      }
      continue;
    }

    kept.push(sanitizeTraceTextConnectors(seg));
  }

  return {
    title,
    subtitle: kept.join(", "),
  };
}

const DOSSIER_EXTENDED_COPY: Record<
  TraceLang,
  {
    zonesTitle: string;
    zonesTotalFmt: (kg: string) => string;
    partSuffixFmt: (cur: number, total: number) => string;
    colNo: string;
    colPuc: string;
    colVillage: string;
    colZoneScale: string;
    colContribWeight: string;
    colStatus: string;
    zoneScaleFmt: (hhCount: number, areaText: string | null) => string;
    statusQualified: string;
    statusReview: string;
    quotaTitleFmt: (year: number) => string;
    quotaWithin: string;
    quotaOver: string;
    zoneTotalLabel: string;
    colPlotCode: string;
    colOrchardScale: string;
    colMaxQuota: string;
    colUsed: string;
    colRemain: string;
    orchardScaleFmt: (areaText: string, treesText: string) => string;
    labsTitle: string;
    colLabCert: string;
    colSampleDate: string;
    colCd: string;
    colYellowO: string;
    colResidue: string;
    labVerifySubLink: string;
    yellowOPos: string;
    yellowONeg: string;
    labPass: string;
    labFail: string;
    packingTitle: string;
    specGradeRatio: string;
    specAvgBrix: string;
    specTreatment: string;
    specTransport: string;
    specTemp: string;
    specSchedule: string;
    notRecordedYet: string;
    authHhTitlePlot: string;
    colHhIdentity: string;
    colCadastralGis: string;
    hhCodePrefix: string;
    areaLocPrefix: string;
    phonePrefix: string;
    cccdPrefix: string;
    cadastralFmt: (sheet: string | null, parcel: string | null) => string;
    coordFmt: (lat: string, lng: string) => string;
    openGisBtn: string;
    emptyAuthHh: string;
    diariesTitle: string;
    colDate: string;
    colHhPlot: string;
    colDiaryActivity: string;
    plotRefFmt: (code: string) => string;
    recordedByFmt: (name: string) => string;
    diaryValid: string;
    diaryLate: string;
    diaryWarn: string;
    gpsShort: string;
    viewFieldPhotoBtn: string;
    emptyDiaries: string;
    minutesTitle: string;
    colMinuteCode: string;
    colInspectorLoc: string;
    colResult: string;
    viewMinutePhotoBtn: string;
    emptyMinutes: string;
    violationsTitle: string;
    colViolationDesc: string;
    colSeverity: string;
    sevCritical: string;
    sevWarning: string;
  }
> = {
  vi: {
    zonesTitle: "VÙNG TRỒNG THAM GIA",
    zonesTotalFmt: (kg) => `TỔNG: ${kg} KG`,
    partSuffixFmt: (c, t) => ` (PHẦN ${c}/${t})`,
    colNo: "STT",
    colPuc: "MÃ VÙNG (PUC)",
    colVillage: "KHU VỰC",
    colZoneScale: "QUY MÔ",
    colContribWeight: "SẢN LƯỢNG",
    colStatus: "TRẠNG THÁI",
    zoneScaleFmt: (hh, area) => (area ? `${hh} hộ, ${area} ha` : `${hh} hộ`),
    statusQualified: "Đủ điều kiện",
    statusReview: "Cần rà soát",
    quotaTitleFmt: (yr) => `ĐỊNH MỨC SẢN LƯỢNG VỤ ${yr}`,
    quotaWithin: "ĐẠT ĐỊNH MỨC",
    quotaOver: "VƯỢT ĐỊNH MỨC",
    zoneTotalLabel: "Tổng vùng nguồn",
    colPlotCode: "THỬA ĐẤT",
    colOrchardScale: "QUY MÔ",
    colMaxQuota: "TRẦN CẢ VỤ",
    colUsed: "ĐÃ XUẤT",
    colRemain: "CÒN LẠI",
    orchardScaleFmt: (area, trees) => `${area} ha, ${trees} cây`,
    labsTitle: "KẾT QUẢ KIỂM NGHIỆM MẪU",
    colLabCert: "SỐ PHIẾU",
    colSampleDate: "NGÀY MẪU",
    colCd: "CADIMI",
    colYellowO: "VÀNG O",
    colResidue: "DƯ LƯỢNG BVTV",
    labVerifySubLink: "Đối chiếu Lab",
    yellowOPos: "Dương tính",
    yellowONeg: "Âm tính",
    labPass: "Đạt",
    labFail: "Không đạt",
    packingTitle: "ĐÓNG GÓI VÀ VẬN CHUYỂN",
    specGradeRatio: "Tỷ lệ hạng A / B / C",
    specAvgBrix: "Độ ngọt bình quân",
    specTreatment: "Phương pháp sơ chế",
    specTransport: "Đơn vị vận tải",
    specTemp: "Nhiệt độ bảo quản",
    specSchedule: "Lịch xuất / dự kiến đến",
    notRecordedYet: "Chưa cập nhật",
    authHhTitlePlot: "CHỦ HỘ VÀ ĐỊA CHÍNH THỬA ĐẤT",
    colHhIdentity: "CHỦ HỘ",
    colCadastralGis: "ĐỊA CHÍNH VÀ TỌA ĐỘ",
    hhCodePrefix: "Mã hộ",
    areaLocPrefix: "Khu vực",
    phonePrefix: "SĐT",
    cccdPrefix: "CCCD",
    cadastralFmt: (s, p) => `Tờ ${s || "-"}, Thửa ${p || "-"}`,
    coordFmt: (lat, lng) => `${lat}°B, ${lng}°Đ`,
    openGisBtn: "Bản đồ GIS",
    emptyAuthHh: "Chưa có dữ liệu hộ canh tác.",
    diariesTitle: "NHẬT KÝ CANH TÁC",
    colDate: "NGÀY",
    colHhPlot: "HỘ VÀ THỬA",
    colDiaryActivity: "CÔNG VIỆC CANH TÁC",
    plotRefFmt: (c) => `Thửa ${c}`,
    recordedByFmt: (name) => `Ghi hộ: ${name}`,
    diaryValid: "Hợp lệ",
    diaryLate: "Bổ sung sau",
    diaryWarn: "Vượt ngưỡng",
    gpsShort: "Tại vườn",
    viewFieldPhotoBtn: "Xem ảnh",
    emptyDiaries: "Chưa có nhật ký canh tác.",
    minutesTitle: "BIÊN BẢN KIỂM TRA THỰC ĐỊA",
    colMinuteCode: "MÃ BIÊN BẢN",
    colInspectorLoc: "CÁN BỘ VÀ ĐỊA ĐIỂM",
    colResult: "KẾT LUẬN",
    viewMinutePhotoBtn: "Xem ảnh",
    emptyMinutes: "Chưa có biên bản kiểm tra.",
    violationsTitle: "CẢNH BÁO VI PHẠM",
    colViolationDesc: "NỘI DUNG",
    colSeverity: "MỨC ĐỘ",
    sevCritical: "Nghiêm trọng",
    sevWarning: "Nhắc nhở",
  },
  en: {
    zonesTitle: "SOURCE GROWING ZONES",
    zonesTotalFmt: (kg) => `TOTAL: ${kg} KG`,
    partSuffixFmt: (c, t) => ` (PART ${c}/${t})`,
    colNo: "NO",
    colPuc: "ZONE (PUC)",
    colVillage: "AREA",
    colZoneScale: "SCALE",
    colContribWeight: "WEIGHT",
    colStatus: "STATUS",
    zoneScaleFmt: (hh, area) => (area ? `${hh} growers, ${area} ha` : `${hh} growers`),
    statusQualified: "Qualified",
    statusReview: "In Review",
    quotaTitleFmt: (yr) => `SEASON ${yr} YIELD QUOTA`,
    quotaWithin: "WITHIN QUOTA",
    quotaOver: "OVER QUOTA",
    zoneTotalLabel: "Source zone total",
    colPlotCode: "PLOT",
    colOrchardScale: "SCALE",
    colMaxQuota: "SEASON CAP",
    colUsed: "USED",
    colRemain: "REMAINING",
    orchardScaleFmt: (area, trees) => `${area} ha, ${trees} trees`,
    labsTitle: "LAB TEST RESULTS",
    colLabCert: "REPORT NO",
    colSampleDate: "SAMPLED",
    colCd: "CADMIUM",
    colYellowO: "YELLOW O",
    colResidue: "RESIDUE",
    labVerifySubLink: "Lab Portal",
    yellowOPos: "Positive",
    yellowONeg: "Negative",
    labPass: "Pass",
    labFail: "Fail",
    packingTitle: "PACKING & COLD CHAIN",
    specGradeRatio: "Grade A / B / C",
    specAvgBrix: "Average Brix",
    specTreatment: "Post-harvest treatment",
    specTransport: "Carrier & plate",
    specTemp: "Cold storage temp",
    specSchedule: "Departure / ETA",
    notRecordedYet: "Not updated",
    authHhTitlePlot: "GROWER & CADASTRAL GIS",
    colHhIdentity: "GROWER",
    colCadastralGis: "CADASTRAL & GIS",
    hhCodePrefix: "ID",
    areaLocPrefix: "Area",
    phonePrefix: "Tel",
    cccdPrefix: "Citizen ID",
    cadastralFmt: (s, p) => `Sheet ${s || "-"}, Parcel ${p || "-"}`,
    coordFmt: (lat, lng) => `${lat}°N, ${lng}°E`,
    openGisBtn: "GIS Map",
    emptyAuthHh: "No grower records.",
    diariesTitle: "CULTIVATION LOG",
    colDate: "DATE",
    colHhPlot: "GROWER & PLOT",
    colDiaryActivity: "ACTIVITY",
    plotRefFmt: (c) => `Plot ${c}`,
    recordedByFmt: (name) => `By ${name}`,
    diaryValid: "Verified",
    diaryLate: "Logged later",
    diaryWarn: "Over limit",
    gpsShort: "On-site GPS",
    viewFieldPhotoBtn: "View photo",
    emptyDiaries: "No cultivation logs.",
    minutesTitle: "FIELD INSPECTION MINUTES",
    colMinuteCode: "MINUTE NO",
    colInspectorLoc: "INSPECTOR & SITE",
    colResult: "RESULT",
    viewMinutePhotoBtn: "View photo",
    emptyMinutes: "No inspection minutes.",
    violationsTitle: "COMPLIANCE WARNINGS",
    colViolationDesc: "DETAILS",
    colSeverity: "SEVERITY",
    sevCritical: "Critical",
    sevWarning: "Advisory",
  },
  zh: {
    zonesTitle: "供货种植产区",
    zonesTotalFmt: (kg) => `总重：${kg} KG`,
    partSuffixFmt: (c, t) => `（第 ${c}/${t} 部分）`,
    colNo: "序号",
    colPuc: "产区编码",
    colVillage: "所属村组",
    colZoneScale: "规模",
    colContribWeight: "供货量",
    colStatus: "状态",
    zoneScaleFmt: (hh, area) => (area ? `${hh} 户, ${area} 公顷` : `${hh} 户`),
    statusQualified: "合格",
    statusReview: "待复核",
    quotaTitleFmt: (yr) => `${yr} 产季产量定额`,
    quotaWithin: "符合定额",
    quotaOver: "超出定额",
    zoneTotalLabel: "产区汇总",
    colPlotCode: "地块",
    colOrchardScale: "规模",
    colMaxQuota: "产季上限",
    colUsed: "已出货",
    colRemain: "剩余额度",
    orchardScaleFmt: (area, trees) => `${area} 公顷, ${trees} 株`,
    labsTitle: "实验室检测结果",
    colLabCert: "报告编号",
    colSampleDate: "采样日期",
    colCd: "镉",
    colYellowO: "碱性嫩黄O",
    colResidue: "农残指标",
    labVerifySubLink: "机构核验",
    yellowOPos: "检出",
    yellowONeg: "未检出",
    labPass: "合格",
    labFail: "不合格",
    packingTitle: "分级包装与冷链运输",
    specGradeRatio: "A / B / C 级占比",
    specAvgBrix: "平均糖度",
    specTreatment: "采后处理",
    specTransport: "承运商与车牌",
    specTemp: "冷链温控",
    specSchedule: "发车 / 预计到达",
    notRecordedYet: "未更新",
    authHhTitlePlot: "种植户与地籍边界",
    colHhIdentity: "农户",
    colCadastralGis: "地籍与坐标",
    hhCodePrefix: "户号",
    areaLocPrefix: "村组",
    phonePrefix: "电话",
    cccdPrefix: "证件",
    cadastralFmt: (s, p) => `图幅 ${s || "-"}, 地籍 ${p || "-"}`,
    coordFmt: (lat, lng) => `${lat}°N, ${lng}°E`,
    openGisBtn: "GIS 边界",
    emptyAuthHh: "暂无农户记录。",
    diariesTitle: "果园农事台账",
    colDate: "日期",
    colHhPlot: "农户与地块",
    colDiaryActivity: "农事内容",
    plotRefFmt: (c) => `地块 ${c}`,
    recordedByFmt: (name) => `代录：${name}`,
    diaryValid: "合规",
    diaryLate: "事后补录",
    diaryWarn: "超标预警",
    gpsShort: "果园定位",
    viewFieldPhotoBtn: "查看照片",
    emptyDiaries: "暂无农事记录。",
    minutesTitle: "现场巡检笔录",
    colMinuteCode: "笔录编号",
    colInspectorLoc: "核查员与地点",
    colResult: "结论",
    viewMinutePhotoBtn: "查看照片",
    emptyMinutes: "暂无巡检笔录。",
    violationsTitle: "合规预警记录",
    colViolationDesc: "说明",
    colSeverity: "级别",
    sevCritical: "严重",
    sevWarning: "提示",
  },
};

const A4_SHEET_WIDTH_PX = 820;

function splitCoopHeaderLines(
  coopText: string,
  lang: TraceLang,
): { line1: string; line2: string | null } {
  const trimmed = coopText.trim();
  if (lang === "vi") {
    const m = /^(Hợp\s+tác\s+xã|HTX)\s+(.+)$/i.exec(trimmed);
    if (m?.[1] && m[2]) {
      return { line1: m[1].trim(), line2: m[2].trim() };
    }
  }
  if (lang === "en") {
    const m = /^(.+?)\s+((?:General\s+Business|Agricultural|Durian)\b.+)$/i.exec(trimmed);
    if (m?.[1] && m[2]) {
      return { line1: m[1].trim(), line2: m[2].trim() };
    }
  }
  return { line1: trimmed, line2: null };
}
const A4_SHEET_HEIGHT_PX = 1160; // Chuẩn tỷ lệ ISO A4 210 : 297 (820 * 297 / 210 ≈ 1160)
const A4_PAD_TOP_PX = 44;
const A4_PAD_BOTTOM_PX = 36;
const A4_INNER_HEIGHT_PX = A4_SHEET_HEIGHT_PX - A4_PAD_TOP_PX - A4_PAD_BOTTOM_PX; // 1080px
const A4_HEADER_GAP_PX = 24;
const A4_SECTION_GAP_PX = 30;
const A4_FOOTER_GAP_PX = 24;

interface A4DossierSectionItem {
  key: string;
  content: ReactNode;
}

const PaginatedA4Dossier = memo(function PaginatedA4Dossier({
  status,
  measureKey,
  headerFull,
  headerContinuation,
  sections,
  renderFooter,
}: {
  status: string;
  measureKey: string;
  headerFull: ReactNode;
  headerContinuation: ReactNode;
  sections: A4DossierSectionItem[];
  renderFooter: (pageIndex: number, totalPages: number) => ReactNode;
}) {
  const deckRef = useRef<HTMLDivElement>(null);
  const sandboxRef = useRef<HTMLDivElement>(null);
  const fullHeaderRef = useRef<HTMLDivElement>(null);
  const contHeaderRef = useRef<HTMLDivElement>(null);
  const lastFooterRef = useRef<HTMLDivElement>(null);
  const midFooterRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);

  const sectionCount = sections.length;
  const [scale, setScale] = useState<number>(1);
  const [pages, setPages] = useState<number[][]>(() => [
    Array.from({ length: sectionCount }, (_, idx) => idx),
  ]);

  useLayoutEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;

    let printing = false;

    const updateScale = () => {
      if (printing) return;
      const availWidth = deck.clientWidth;
      if (availWidth <= 0) return;
      const nextScale =
        availWidth >= A4_SHEET_WIDTH_PX
          ? 1
          : Number((availWidth / A4_SHEET_WIDTH_PX).toFixed(6));
      setScale((prev) => (Math.abs(prev - nextScale) < 0.0002 ? prev : nextScale));
    };

    const recomputePages = () => {
      const hFull = fullHeaderRef.current?.offsetHeight ?? 48;
      const hCont = contHeaderRef.current?.offsetHeight ?? 32;
      const hLastFoot = lastFooterRef.current?.offsetHeight ?? 78;
      const hMidFoot = midFooterRef.current?.offsetHeight ?? 34;

      const heights = Array.from(
        { length: sectionCount },
        (_, idx) => sectionRefs.current[idx]?.offsetHeight ?? 0,
      );
      if (heights.length === 0 || heights.every((h) => h === 0)) return;

      const sumAll =
        heights.reduce((acc, h) => acc + h, 0) +
        Math.max(0, heights.length - 1) * A4_SECTION_GAP_PX;
      const singlePageTotal =
        hFull + A4_HEADER_GAP_PX + sumAll + A4_FOOTER_GAP_PX + hLastFoot;

      let nextPages: number[][];
      if (singlePageTotal <= A4_INNER_HEIGHT_PX) {
        nextPages = [heights.map((_, i) => i)];
      } else {
        nextPages = [];
        let curPage: number[] = [];
        let usedH = 0;
        const reservedFoot = Math.max(hLastFoot, hMidFoot);

        for (let i = 0; i < heights.length; i += 1) {
          const isFirstPage = nextPages.length === 0;
          const headerH = isFirstPage ? hFull : hCont;
          const budget =
            A4_INNER_HEIGHT_PX - headerH - A4_HEADER_GAP_PX - A4_FOOTER_GAP_PX - reservedFoot;
          const addH = (curPage.length > 0 ? A4_SECTION_GAP_PX : 0) + heights[i];

          if (curPage.length > 0 && usedH + addH > budget) {
            nextPages.push(curPage);
            curPage = [i];
            usedH = heights[i];
          } else {
            curPage.push(i);
            usedH += addH;
          }
        }
        if (curPage.length > 0) {
          nextPages.push(curPage);
        }
      }

      setPages((prev) => {
        if (
          prev.length === nextPages.length &&
          prev.every(
            (pg, pIdx) =>
              pg.length === nextPages[pIdx]?.length &&
              pg.every((v, iIdx) => v === nextPages[pIdx]?.[iIdx]),
          )
        ) {
          return prev;
        }
        return nextPages;
      });
    };

    const onBeforePrint = () => {
      printing = true;
      setScale(1);
    };

    const onAfterPrint = () => {
      printing = false;
      updateScale();
    };

    updateScale();
    recomputePages();

    const hasResizeObserver = typeof ResizeObserver !== "undefined";
    const deckRo = hasResizeObserver ? new ResizeObserver(() => updateScale()) : null;
    const sandboxRo = hasResizeObserver ? new ResizeObserver(() => recomputePages()) : null;
    deckRo?.observe(deck);
    if (sandboxRef.current) {
      sandboxRo?.observe(sandboxRef.current);
    }

    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        recomputePages();
      });
    }

    if (!deckRo) {
      window.addEventListener("resize", updateScale);
    }
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    return () => {
      deckRo?.disconnect();
      sandboxRo?.disconnect();
      if (!deckRo) {
        window.removeEventListener("resize", updateScale);
      }
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [measureKey, sectionCount]);

  return (
    <div
      ref={deckRef}
      className="tr-doc-a4-deck"
      style={{ "--a4-scale": String(scale) } as React.CSSProperties}
    >
      {pages.map((sectionIndices, pageIdx) => (
        <div key={`a4-sheet-${pageIdx}`} className="tr-doc-a4-page-frame">
          <article className="tr-doc-sheet" data-status={status}>
            {pageIdx === 0 ? headerFull : headerContinuation}

            <div className="tr-doc-page-body">
              {sectionIndices.map((secIdx) => {
                const sec = sections[secIdx];
                if (!sec) return null;
                return (
                  <div key={sec.key} className="tr-doc-page-block">
                    {sec.content}
                  </div>
                );
              })}
            </div>

            {renderFooter(pageIdx, pages.length)}
          </article>
        </div>
      ))}

      {/* Khung đo kích thước ẩn chuẩn chiều rộng lòng tờ A4 (716px) để tự động ngắt trang chính xác */}
      <div ref={sandboxRef} className="tr-doc-measure-sandbox no-print" aria-hidden="true">
        <div ref={fullHeaderRef} className="tr-doc-measure-item">
          {headerFull}
        </div>
        <div ref={contHeaderRef} className="tr-doc-measure-item">
          {headerContinuation}
        </div>
        <div ref={lastFooterRef} className="tr-doc-measure-item">
          {renderFooter(0, 1)}
        </div>
        <div ref={midFooterRef} className="tr-doc-measure-item">
          {renderFooter(0, 2)}
        </div>
        {sections.map((sec, idx) => (
          <div
            key={`measure-${sec.key}`}
            ref={(el) => {
              sectionRefs.current[idx] = el;
            }}
            className="tr-doc-measure-item"
          >
            {sec.content}
          </div>
        ))}
      </div>
    </div>
  );
});

function extractPreservedUrlSuffix(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, "https://puc.local");
    const qs = new URLSearchParams();
    const lang = parsed.searchParams.get("lang");
    if (lang === "vi" || lang === "en" || lang === "zh") {
      qs.set("lang", lang);
    }
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const pass = hashParams.get("auditPass");
    const safeHash =
      pass && /^[A-Za-z0-9_-]{4,80}$/.test(pass.trim())
        ? `#auditPass=${encodeURIComponent(pass.trim())}`
        : "";
    return `${qs.toString() ? `?${qs.toString()}` : ""}${safeHash}`;
  } catch {
    return "";
  }
}

function normalizeLookupCandidate(raw: string): string {
  return safeDecodeURIComponent(raw)
    .trim()
    .replace(/^(?:thửa|thua|lô|lo|mã\s*lô|ma\s*lo|mã\s*thửa|ma\s*thua|mã\s*vùng|ma\s*vung|mã|ma|puc|phc|tem|thùng|thung)\s*[:#-]?\s*/iu, "")
    .replace(/\s+/g, "");
}

function resolveSearchNavigationHref(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed || /^\.+$/.test(trimmed)) return null;

  const preservedSuffix = /[?#]/.test(trimmed) ? extractPreservedUrlSuffix(trimmed) : "";

  const tokenPathMatch = /(?:^|\/)t\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/.exec(trimmed);
  if (tokenPathMatch?.[1] && !/^\.+$/.test(tokenPathMatch[1]) && isSafeTraceCode(tokenPathMatch[1])) {
    return `/t/${encodeURIComponent(tokenPathMatch[1])}${preservedSuffix}`;
  }

  const tracePathMatch = /(?:^|\/)trace\/([^/?#\s]+)(?:[/?#]|$)/.exec(trimmed);
  if (tracePathMatch?.[1]) {
    const extracted = normalizeLookupCandidate(tracePathMatch[1]);
    if (!extracted || /^\.+$/.test(extracted) || !isSafeTraceCode(extracted)) return null;
    return `/trace/${encodeURIComponent(extracted)}${preservedSuffix}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (!last) return null;
      const extracted = normalizeLookupCandidate(last);
      if (!extracted || /^\.+$/.test(extracted) || !isSafeTraceCode(extracted)) return null;
      return `/trace/${encodeURIComponent(extracted)}${preservedSuffix}`;
    } catch {
      return null;
    }
  }

  const candidate = normalizeLookupCandidate(trimmed);
  if (!candidate || /^\.+$/.test(candidate)) return null;

  if (/^[A-Za-z0-9]{12,24}$/.test(candidate) && /[a-z]/.test(candidate) && /[A-Z0-9]/.test(candidate)) {
    return isSafeTraceCode(candidate) ? `/t/${encodeURIComponent(candidate)}` : null;
  }

  if (!isSafeTraceCode(candidate)) return null;
  return `/trace/${encodeURIComponent(candidate)}`;
}

const AUDIT_PASS_SESSION_KEY = "puc_audit_pass";
const TRACE_BG_POLL_INTERVAL_MS = 20_000;
const TRACE_BG_MIN_GAP_MS = 1_500;

function buildStableTraceSignature(payload: TraceData | null): string {
  if (!payload) return "";
  return JSON.stringify(payload, (key, value) => {
    if (key === "verifiedAt" || key === "checkedAt") return undefined;
    return value;
  });
}

function readInitialViewParam(): ViewerTier | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("view");
  if (raw === "public" || raw === "enterprise" || raw === "authority") {
    return raw;
  }
  return null;
}

function readInitialAuditPass(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const fromHash = hashParams.get("auditPass")?.trim();
    if (fromHash && /^[A-Za-z0-9_-]{4,80}$/.test(fromHash)) {
      window.sessionStorage.setItem(AUDIT_PASS_SESSION_KEY, fromHash);
      return fromHash;
    }
    const fromSession = window.sessionStorage.getItem(AUDIT_PASS_SESSION_KEY)?.trim();
    if (fromSession && /^[A-Za-z0-9_-]{4,80}$/.test(fromSession)) {
      return fromSession;
    }
  } catch {
    // Bỏ qua nếu trình duyệt chặn sessionStorage
  }
  return null;
}

function scrubAuditPassFromBrowserUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const nextUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(nextUrl.hash.replace(/^#/, ""));
    const hadQuery = nextUrl.searchParams.has("auditPass");
    const hadHash = hashParams.has("auditPass");
    if (!hadQuery && !hadHash) return;
    nextUrl.searchParams.delete("auditPass");
    hashParams.delete("auditPass");
    const qs = nextUrl.searchParams.toString();
    const hs = hashParams.toString();
    replaceUrlPreservingState(`${nextUrl.pathname}${qs ? `?${qs}` : ""}${hs ? `#${hs}` : ""}`);
  } catch {
    // Bỏ qua nếu trình duyệt chặn History API
  }
}

export default function TraceView() {
  const params = useParams();
  const rawRouteParam =
    typeof params.token === "string"
      ? params.token
      : typeof params.code === "string"
        ? params.code
        : "";
  const decodedRouteParam = rawRouteParam ? safeDecodeURIComponent(rawRouteParam).trim() : "";
  const code =
    decodedRouteParam && !/^\.+$/.test(decodedRouteParam) && isSafeTraceCode(decodedRouteParam)
      ? decodedRouteParam
      : "";

  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus, logout } = useAuth();
  const [lang, setLang] = useState<TraceLang>("vi");
  const [hintedKind, setHintedKind] = useState<TraceTargetKind | null>(null);
  const [data, setData] = useState<TraceData | null>(null);
  const [selectedView, setSelectedView] = useState<ViewerTier | null>(() => readInitialViewParam());
  const [auditPass, setAuditPass] = useState<string | null>(() => readInitialAuditPass());
  const [suppressTempGrant, setSuppressTempGrant] = useState(false);
  const [auditPassInput, setAuditPassInput] = useState("");
  const [openAccessReqCount, setOpenAccessReqCount] = useState(0);
  const [loading, setLoading] = useState(() => Boolean(code));
  const [switchingTier, setSwitchingTier] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(() => (code ? null : "invalid"));
  const [searchCode, setSearchCode] = useState(code);
  const [copied, setCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [gisModalPlot, setGisModalPlot] = useState<{
    plot: PortalPlot;
    householdName: string;
  } | null>(null);

  // Tự động chọn ngôn ngữ theo trình duyệt người quét (4d) ngay sau khi mount và ẩn auditPass khỏi URL
  useEffect(() => {
    const syncFromUrl = () => {
      const detectedLang = detectInitialTraceLang();
      setLang((prev) => (prev === detectedLang ? prev : detectedLang));
      const nextKindHint = resolveInitialTraceKind(code);
      setHintedKind((prev) => (prev === nextKindHint ? prev : nextKindHint));
      const pass = readInitialAuditPass();
      setAuditPass((prev) => (prev === pass ? prev : pass));
      const nextView = readInitialViewParam();
      setSelectedView((prev) => (prev === nextView ? prev : nextView));
      scrubAuditPassFromBrowserUrl();
    };
    const rafId = window.requestAnimationFrame(syncFromUrl);
    scrubAuditPassFromBrowserUrl();

    const onAuthEnded = () => {
      setAuditPass(null);
      setSelectedView(null);
      setGisModalPlot(null);
    };

    const onPageHide = () => {
      setAuditPassInput("");
    };

    window.addEventListener(PUC_URL_SYNC_EVENT, syncFromUrl);
    window.addEventListener("hashchange", syncFromUrl);
    window.addEventListener(AUTH_LOGOUT_EVENT, onAuthEnded);
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthEnded);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener(PUC_URL_SYNC_EVENT, syncFromUrl);
      window.removeEventListener("hashchange", syncFromUrl);
      window.removeEventListener(AUTH_LOGOUT_EVENT, onAuthEnded);
      window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthEnded);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pathname, code]);

  const handleChangeLang = (nextLang: TraceLang) => {
    setLang(nextLang);
    persistTraceLang(nextLang);
  };

  const handleApplyAuditPass = (e: React.FormEvent) => {
    e.preventDefault();
    let cleaned = auditPassInput.trim();
    const urlMatch = /[?&#]auditPass=([A-Za-z0-9_-]{4,80})(?:[&#]|$)/.exec(cleaned);
    if (urlMatch?.[1]) {
      cleaned = urlMatch[1];
    }
    if (!cleaned || !/^[A-Za-z0-9_-]{4,80}$/.test(cleaned)) return;
    try {
      window.sessionStorage.setItem(AUDIT_PASS_SESSION_KEY, cleaned);
    } catch {
      // Bỏ qua lỗi lưu sessionStorage
    }
    setSwitchingTier(true);
    setSuppressTempGrant(false);
    setAuditPass(cleaned);
    setAuditPassInput("");
  };

  const handleGrantActivated = (
    passToken: string,
    grantedTier: "enterprise" | "authority",
  ) => {
    try {
      window.sessionStorage.setItem(AUDIT_PASS_SESSION_KEY, passToken);
    } catch {
      // Bỏ qua lỗi lưu sessionStorage
    }
    setSwitchingTier(true);
    setSuppressTempGrant(false);
    setAuditPass(passToken);
    setSelectedView(grantedTier);
  };

  const handleClearAuditPass = () => {
    try {
      window.sessionStorage.removeItem(AUDIT_PASS_SESSION_KEY);
      window.sessionStorage.removeItem("puc_trace_access_req_v1");
      if (typeof window !== "undefined") {
        const nextUrl = new URL(window.location.href);
        if (nextUrl.searchParams.has("auditPass") || nextUrl.searchParams.has("view")) {
          nextUrl.searchParams.delete("auditPass");
          nextUrl.searchParams.delete("view");
          replaceUrlPreservingState(nextUrl.pathname + nextUrl.search + nextUrl.hash);
        }
      }
    } catch {
      // Bỏ qua lỗi xóa sessionStorage
    }
    setSwitchingTier(true);
    setSuppressTempGrant(true);
    setAuditPass(null);
    setSelectedView(null);
  };

  const [prevCode, setPrevCode] = useState(code);
  const [showZoneMap, setShowZoneMap] = useState(false);
  const [tracePreviewMedia, setTracePreviewMedia] = useState<{
    urls: string[];
    title: string;
    subtitle?: string;
  } | null>(null);
  if (prevCode !== code) {
    setPrevCode(code);
    setHintedKind(null);
    setShowZoneMap(false);
    setData(null);
    setQrSrc("");
    setLoading(Boolean(code));
    setErrorKind(code ? null : "invalid");
    setSearchCode(code);
    setGisModalPlot(null);
  }

  const rawQrToken = data?.publicData?.lotIdentity?.qrToken || null;
  const resolvedQrToken =
    rawQrToken && !/^\.+$/.test(rawQrToken) && isSafeTraceCode(rawQrToken) ? rawQrToken : null;

  // (4b + Mục 5) Sinh mã QR đường dẫn token ngẫu nhiên chống giả /t/{token} với độ tương phản tuyệt đối và sửa lỗi mức Q
  useEffect(() => {
    if (!code) return;
    let active = true;
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "https://krongbuk.puc.vn";
    const targetUrl = resolvedQrToken
      ? `${origin}/t/${encodeURIComponent(resolvedQrToken)}`
      : `${origin}/trace/${encodeURIComponent(code)}`;

    void import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(targetUrl, {
          margin: 1,
          width: 320,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
          errorCorrectionLevel: "Q",
        }),
      )
      .then((url) => {
        if (active) setQrSrc(url);
      })
      .catch(() => { });

    return () => {
      active = false;
    };
  }, [code, resolvedQrToken]);

  const isAuthenticated = authStatus === "authenticated";
  const isAuthenticatedRef = useRef<boolean>(false);
  const lastStableSigRef = useRef<string | null>(null);
  useEffect(() => {
    isAuthenticatedRef.current =
      isAuthenticated || Boolean(data?.accessControl?.isAuthenticated);
  }, [isAuthenticated, data]);

  useEffect(() => {
    if (!code) return;
    let active = true;
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

    const qs = new URLSearchParams();
    if (selectedView) qs.set("view", selectedView);
    if (suppressTempGrant) qs.set("noGrant", "1");
    const querySuffix = qs.toString() ? `?${qs.toString()}` : "";
    const encodedCode = encodeURIComponent(code);
    const preferAuthenticatedEndpoint = isAuthenticated || isAuthenticatedRef.current;
    const primaryUrl = preferAuthenticatedEndpoint
      ? `/api/trace/${encodedCode}${querySuffix}`
      : `/api/public/trace/${encodedCode}${querySuffix}`;
    const reqHeaders: HeadersInit | undefined = auditPass
      ? { "x-audit-pass": auditPass }
      : undefined;

    fetch(primaryUrl, {
      credentials: "include",
      headers: reqHeaders,
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        if (res.status === 401 && preferAuthenticatedEndpoint) {
          return fetch(`/api/public/trace/${encodedCode}${querySuffix}`, {
            credentials: "include",
            headers: reqHeaders,
            cache: "no-store",
            signal: controller.signal,
          });
        }
        return res;
      })
      .then((res) => {
        reportRequestTime(performance.now() - start);
        if (!res.ok) {
          const httpErr = new Error(res.status === 404 ? "not_found" : "server");
          httpErr.name = "TraceHttpError";
          throw httpErr;
        }
        return res.json();
      })
      .then((payload: TraceData) => {
        if (active) {
          lastStableSigRef.current = buildStableTraceSignature(payload);
          setData(payload);
          setErrorKind(null);
          const passInfo = payload.accessControl?.fieldAuditPass;
          if (passInfo?.active && passInfo.defaultLang) {
            try {
              const hasManualLang = Boolean(window.localStorage.getItem("puc_trace_lang"));
              const hasUrlLang = Boolean(new URLSearchParams(window.location.search).get("lang"));
              if (!hasManualLang && !hasUrlLang) {
                setLang(passInfo.defaultLang);
              }
            } catch {
              // Bỏ qua nếu không đọc được localStorage
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof Error && err.name === "TraceHttpError") {
          setErrorKind(err.message === "not_found" ? "not_found" : "server");
        } else if (err instanceof Error && err.name === "AbortError") {
          setErrorKind("timeout");
        } else {
          setErrorKind("network");
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) {
          setLoading(false);
          setSwitchingTier(false);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [code, selectedView, auditPass, suppressTempGrant, isAuthenticated]);

  // Đồng bộ ngầm thời gian thực (SSE + khi quay lại tab / có mạng + kiểm tra định kỳ an toàn):
  // Tự động nạp lại dữ liệu mới nhất khi lô hàng, kiểm nghiệm, vùng trồng hoặc nhật ký thay đổi mà không nháy trang hay mất vị trí cuộn.
  useEffect(() => {
    if (!code || loading) return;
    let disposed = false;
    let inflightController: AbortController | null = null;
    let lastRefreshAt = 0;

    const refreshSilently = (forceApplyTimestamp = false) => {
      if (disposed || typeof window === "undefined") return;
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (inflightController || now - lastRefreshAt < TRACE_BG_MIN_GAP_MS) return;
      lastRefreshAt = now;

      const controller = new AbortController();
      inflightController = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

      const qs = new URLSearchParams();
      if (selectedView) qs.set("view", selectedView);
      if (suppressTempGrant) qs.set("noGrant", "1");
      qs.set("bg", "1");
      const querySuffix = `?${qs.toString()}`;
      const encodedCode = encodeURIComponent(code);
      const preferAuth = isAuthenticatedRef.current;
      const primaryUrl = preferAuth
        ? `/api/trace/${encodedCode}${querySuffix}`
        : `/api/public/trace/${encodedCode}${querySuffix}`;
      const reqHeaders: HeadersInit | undefined = auditPass
        ? { "x-audit-pass": auditPass }
        : undefined;

      fetch(primaryUrl, {
        credentials: "include",
        headers: reqHeaders,
        cache: "no-store",
        signal: controller.signal,
      })
        .then((res) => {
          if (res.status === 401 && preferAuth) {
            return fetch(`/api/public/trace/${encodedCode}${querySuffix}`, {
              credentials: "include",
              headers: reqHeaders,
              cache: "no-store",
              signal: controller.signal,
            });
          }
          return res;
        })
        .then((res) => (res.ok ? (res.json() as Promise<TraceData>) : null))
        .then((nextPayload) => {
          if (disposed || !nextPayload) return;
          const nextSig = buildStableTraceSignature(nextPayload);
          setData((prev) => {
            if (!forceApplyTimestamp && prev) {
              const prevSig = lastStableSigRef.current ?? buildStableTraceSignature(prev);
              lastStableSigRef.current = prevSig;
              if (prevSig === nextSig) {
                return prev;
              }
            }
            lastStableSigRef.current = nextSig;
            return nextPayload;
          });
          setErrorKind(null);
        })
        .catch(() => {
          // Làm mới ngầm: tuyệt đối không làm gián đoạn màn hình đang xem nếu mạng chập chờn
        })
        .finally(() => {
          window.clearTimeout(timeoutId);
          if (inflightController === controller) {
            inflightController = null;
          }
        });
    };

    let eventSource: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      try {
        eventSource = new EventSource("/api/public/trace-stream");
        eventSource.onmessage = () => {
          refreshSilently(true);
        };
      } catch {
        eventSource = null;
      }
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        refreshSilently(false);
      }
    };
    const handleOnline = () => refreshSilently(false);

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleOnline);

    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshSilently(false);
      }
    }, TRACE_BG_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      inflightController?.abort();
      eventSource?.close();
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [code, loading, selectedView, auditPass, suppressTempGrant]);

  const handleSelectTier = (tier: ViewerTier) => {
    if (!data) return;
    if (tier === data.accessControl.viewerTier && selectedView === tier) return;
    setSwitchingTier(true);
    setSelectedView(tier);
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("view", tier);
      pushUrlNavigation(nextUrl.pathname + nextUrl.search + nextUrl.hash);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const nextHref = resolveSearchNavigationHref(searchCode);
    if (nextHref) {
      router.push(nextHref);
    } else if (searchCode.trim()) {
      setErrorKind("invalid");
    }
  };

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const url = resolvedQrToken
      ? `${origin}/t/${encodeURIComponent(resolvedQrToken)}`
      : `${origin}/trace/${encodeURIComponent(code)}`;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const t = TRACE_UI_COPY[lang];
  const pub = data?.publicData;
  const ac = data?.accessControl;

  // Mã chữ dự phòng của đơn vị thùng / quả / thửa (để kiểm tra khi tem trầy xước - 4b)
  const fallbackUnitSerial = pub
    ? data?.item?.serialCode ||
    data?.farmerStamp?.serialCode ||
    (pub.lotIdentity.scannedCode.toUpperCase() !== pub.lotIdentity.lotCode.toUpperCase() &&
      pub.lotIdentity.scannedCode !== pub.lotIdentity.qrToken
      ? pub.lotIdentity.scannedCode
      : null)
    : null;

  const activeKind: TraceTargetKind =
    data && pub
      ? data.isPlotSignboard || pub.lotIdentity.traceUnit === "puc_zone"
        ? "plot"
        : data.isFarmerStamp ||
          pub.lotIdentity.traceUnit === "fruit" ||
          data.item?.itemType === "fruit"
          ? "fruit"
          : pub.lotIdentity.traceUnit === "box" || data.item?.itemType === "box"
            ? "box"
            : "lot"
      : hintedKind ?? inferTraceKindFromCode(code);

  useEffect(() => {
    if (!data || !pub || activeKind === "generic") return;
    rememberTraceKindHint(code, activeKind);
    rememberTraceKindHint(pub.lotIdentity.qrToken, activeKind);
    rememberTraceKindHint(pub.lotIdentity.scannedCode, activeKind);
    if (activeKind === "plot") {
      rememberTraceKindHint(data.plotSignboard?.plotCode, "plot");
    } else if (activeKind === "lot") {
      rememberTraceKindHint(pub.lotIdentity.lotCode, "lot");
    }
  }, [activeKind, code, data, pub]);

  useEffect(() => {
    if (typeof document === "undefined" || !code) return;
    const displayRef =
      activeKind === "plot"
        ? data?.plotSignboard?.plotCode || fallbackUnitSerial || pub?.lotIdentity.scannedCode || code
        : activeKind === "box" || activeKind === "fruit"
          ? fallbackUnitSerial || pub?.lotIdentity.scannedCode || pub?.lotIdentity.lotCode || code
          : pub?.lotIdentity.lotCode || code;
    if (lang === "zh") {
      const zhPrefix =
        activeKind === "plot"
          ? "果园地块溯源"
          : activeKind === "box"
            ? "包装箱溯源"
            : activeKind === "fruit"
              ? "单果溯源"
              : activeKind === "lot"
                ? "批次溯源"
                : "产地溯源";
      document.title = `${zhPrefix} ${displayRef} | Cư Né 合作社`;
      return;
    }
    if (lang === "en") {
      const enPrefix =
        activeKind === "plot"
          ? "Orchard Plot"
          : activeKind === "box"
            ? "Carton Box"
            : activeKind === "fruit"
              ? "Durian Fruit"
              : activeKind === "lot"
                ? "Shipment Lot"
                : "Traceability";
      document.title = `${enPrefix} ${displayRef} | Cư Né Cooperative`;
      return;
    }
    const viPrefix =
      activeKind === "plot"
        ? "Truy xuất thửa đất"
        : activeKind === "box"
          ? "Truy xuất thùng đóng gói"
          : activeKind === "fruit"
            ? "Truy xuất trái sầu riêng"
            : activeKind === "lot"
              ? "Truy xuất lô hàng"
              : "Truy xuất nguồn gốc";
    document.title = `${viPrefix} ${displayRef} | HTX Cư Né`;
  }, [activeKind, code, data, fallbackUnitSerial, lang, pub]);

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    const prevTitle = document.title;
    const refLabel =
      activeKind === "plot"
        ? data?.plotSignboard?.plotCode || fallbackUnitSerial || pub?.lotIdentity.scannedCode || code || "PUC"
        : activeKind === "box" || activeKind === "fruit"
          ? fallbackUnitSerial || pub?.lotIdentity.scannedCode || pub?.lotIdentity.lotCode || code || "PUC"
          : pub?.lotIdentity?.lotCode || code || "PUC";
    const safeCode = refLabel.replace(/[^a-zA-Z0-9_-]+/g, "-");
    const filePrefix =
      activeKind === "plot"
        ? "Ho-so-thua-dat"
        : activeKind === "box"
          ? "Ho-so-thung-dong-goi"
          : activeKind === "fruit"
            ? "Ho-so-trai-sau-rieng"
            : "Ho-so-lo-hang";
    document.title = `${filePrefix}-${safeCode}`;
    const restore = () => {
      document.title = prevTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
    setTimeout(restore, 1500);
  };

  const openAuthorityPlotGis = (household: TraceAuthorityHousehold, p: TraceAuthorityPlot) => {
    const validStatus: PlotStatus =
      p.status === "approved" ||
        p.status === "improve" ||
        p.status === "violation" ||
        p.status === "pending"
        ? p.status
        : "approved";

    const validSource: PortalPlot["source"] =
      p.source === "declared" ||
        p.source === "measured" ||
        p.source === "cadastral" ||
        p.source === "demo"
        ? p.source
        : "cadastral";

    setGisModalPlot({
      householdName: household.householdName,
      plot: {
        code: p.plotCode,
        sheet: p.sheetNo ?? null,
        parcel: p.parcelNo ?? null,
        village: household.villageName || null,
        zoneCode: p.zoneCode ?? null,
        variety: p.variety ?? null,
        plantedYear: p.plantedYear ?? null,
        areaHa: Number(p.areaHa || 0),
        source: validSource,
        status: validStatus,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        geometryJson: p.geometryJson ?? null,
      },
    });
  };

  const errorMessage = errorKind
    ? errorKind === "invalid"
      ? t.errorState.invalidCode
      : errorKind === "not_found"
        ? t.errorState.notFound(code)
        : errorKind === "timeout"
          ? t.errorState.timeoutError
          : errorKind === "network"
            ? t.errorState.networkError
            : t.errorState.serverError
    : null;

  const returnNextPath =
    pathname ||
    (resolvedQrToken
      ? `/t/${encodeURIComponent(resolvedQrToken)}`
      : `/trace/${encodeURIComponent(code)}`);
  const loginWithNextHref = `/login?next=${encodeURIComponent(returnNextPath)}`;

  const handleSwitchAccount = async () => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(AUDIT_PASS_SESSION_KEY);
      } catch {
        // Bỏ qua lỗi xóa sessionStorage
      }
    }
    try {
      await logout();
    } catch {
      // Bỏ qua lỗi mạng khi đăng xuất
    }
    router.replace(loginWithNextHref);
  };

  return (
    <div className="tr-root" lang={lang === "zh" ? "zh-CN" : lang}>
      {/* ─── Thanh đầu trang cố định Thụy Sĩ (Trên di động ẩn chữ HTX Cư Né, giữ đúng 2 nút ở 2 phía) ─── */}
      <header className="tr-topbar">
        <div className="tr-wrap tr-topbar-inner">
          <Link href="/" className="tr-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/newlogo.png" alt="" width={22} height={22} className="tr-brand-img" loading="lazy" decoding="async" />
            <span>{t.topbar.brand}</span>
          </Link>

          <div className="tr-topbar-actions">
            <Link href="/trace" className="tr-top-btn">
              {t.topbar.lookupOther}
            </Link>
            <Link href="/" className="tr-top-btn is-solid">
              {t.topbar.home}
            </Link>
          </div>
        </div>
      </header>

      <main className="tr-wrap tr-main">
        {/* ─── Dải chuyển ngôn ngữ VI / EN / 简体中文 & Nút đăng nhập Đối tác / Cơ quan quản lý ─── */}
        <div className="tr-lang-bar no-print">
          <div className="tr-lang-switch" role="group" aria-label={t.langBar.label}>
            <button
              type="button"
              aria-pressed={lang === "vi"}
              className={`tr-lang-btn ${lang === "vi" ? "is-active" : ""}`}
              onClick={() => handleChangeLang("vi")}
            >
              Tiếng Việt
            </button>
            <button
              type="button"
              aria-pressed={lang === "en"}
              className={`tr-lang-btn ${lang === "en" ? "is-active" : ""}`}
              onClick={() => handleChangeLang("en")}
            >
              English
            </button>
            <button
              type="button"
              aria-pressed={lang === "zh"}
              className={`tr-lang-btn ${lang === "zh" ? "is-active" : ""}`}
              onClick={() => handleChangeLang("zh")}
            >
              简体中文
            </button>
          </div>

          {!loading && data && pub && ac && !ac.isAuthenticated && (
            <div className="tr-partner-auth-bar">
              <span className="tr-partner-auth-label">{t.authHint.audienceLabel}</span>
              <Link href={loginWithNextHref} className="tr-partner-login-btn">
                <span>{t.authHint.actionLabel}</span>
              </Link>
            </div>
          )}
        </div>

        {loading ? (
          <SkeletonCards count={3} label={getTraceLoadingLabel(activeKind, lang)} />
        ) : errorMessage ? (
          <div className="tr-card tr-error-card">
            <h2 className="tr-error-title">{t.errorState.title}</h2>
            <p className="tr-error-desc">{errorMessage}</p>
            <form onSubmit={handleSearch} className="tr-search-form">
              <input
                className="tr-search-input"
                placeholder={t.errorState.inputPlaceholder}
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
              />
              <button type="submit" className="tr-search-btn">
                <Search size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>{t.errorState.searchBtn}</span>
              </button>
            </form>
            <div className="tr-error-actions">
              <Link href="/" className="tr-home-btn">
                <ArrowLeft size={17} strokeWidth={2.3} aria-hidden="true" />
                <span>{t.actions.home}</span>
              </Link>
            </div>
          </div>
        ) : data && pub && ac ? (
          <>
            {/* ─── Trụ cột 3: Dải trạng thái Thẻ Đoàn Thẩm định Thực địa (Field Audit Pass) dành cho Đối tác / Đoàn Tỉnh ─── */}
            {ac.fieldAuditPass?.active && (
              <section className="tr-pass-banner is-active no-print" role="status">
                <div className="tr-pass-banner-main">
                  <span className="tr-pass-banner-kicker">
                    <ShieldCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                    <span>{t.fieldAudit.passBannerKicker}</span>
                  </span>
                  <strong className="tr-pass-banner-title">
                    {t.fieldAudit.passBannerActiveFmt(
                      ac.fieldAuditPass.delegationName || "Đoàn thẩm định thực địa",
                      ac.fieldAuditPass.organization || ac.fieldAuditPass.code || "Đối tác",
                      ac.fieldAuditPass.expiresAt
                        ? formatTraceDateTime(ac.fieldAuditPass.expiresAt, lang)
                        : "-",
                    )}
                  </strong>
                </div>
                <button
                  type="button"
                  className="tr-pass-exit-btn"
                  onClick={handleClearAuditPass}
                >
                  {t.fieldAudit.passBannerExitBtn}
                </button>
              </section>
            )}

            {ac.fieldAuditPass && !ac.fieldAuditPass.active && (
              <section className="tr-alert-banner is-warn tr-scope-denied-banner no-print" role="alert">
                <div className="tr-scope-denied-main">
                  <div className="tr-alert-banner-head">
                    <AlertTriangle size={18} strokeWidth={2.2} aria-hidden="true" />
                    <strong>{t.fieldAudit.passBannerKicker}</strong>
                  </div>
                  <p className="tr-alert-banner-desc">
                    {lang === "vi" && ac.fieldAuditPass.invalidReason
                      ? ac.fieldAuditPass.invalidReason
                      : t.fieldAudit.passInvalidNote}
                  </p>
                </div>
                <button type="button" className="tr-scope-switch-btn" onClick={handleClearAuditPass}>
                  {t.fieldAudit.passBannerExitBtn}
                </button>
              </section>
            )}

            {/* ─── Thông báo từ chối chi tiết khi tài khoản đã đăng nhập nhưng hồ sơ nằm ngoài phạm vi quản lý (Mục 2 & Mục 5) ─── */}
            {ac.isAuthenticated && ac.scopeDenied && (() => {
              const scopeCopy = getScopeDeniedCopy(
                activeKind,
                lang,
                ac.viewerName || "Người dùng",
                ac.viewerRole ? ROLE_LABELS[ac.viewerRole] : ac.viewerTierLabel,
                lang === "vi" ? (ac.scopeReason ?? null) : null,
              );
              return (
                <section className="tr-alert-banner is-warn tr-scope-denied-banner no-print" role="status">
                  <div className="tr-scope-denied-main">
                    <div className="tr-alert-banner-head">
                      <Lock size={18} strokeWidth={2.3} aria-hidden="true" />
                      <strong>
                        {lang === "vi" && ac.scopeDeniedMessage
                          ? ac.scopeDeniedMessage
                          : scopeCopy.title}
                      </strong>
                    </div>
                    <p className="tr-alert-banner-desc">{scopeCopy.desc}</p>
                  </div>
                  <button type="button" className="tr-scope-switch-btn" onClick={() => void handleSwitchAccount()}>
                    {t.scopeAccess.switchAccountBtn}
                  </button>
                </section>
              );
            })()}

            {/* ─── Thanh định danh Vai trò đăng nhập, Đoàn được cấp quyền đột xuất & Chuyển đổi Cấp độ Truy xuất ─── */}
            {(ac.isAuthenticated || Boolean(ac.temporaryGrant?.active) || ac.actualTier !== "public") && (
              <section className="tr-tier-bar no-print" aria-label="Thông tin tài khoản và cấp độ truy xuất">
                <div className="tr-tier-bar-info">
                  {ac.isAuthenticated && (
                    <div className="tr-tier-role-line">
                      <span>
                        Tài khoản: <strong>{ac.viewerName || "Người dùng"}</strong> (
                        {ac.viewerRole ? ROLE_LABELS[ac.viewerRole] : ac.viewerTierLabel})
                      </span>
                    </div>
                  )}
                  {ac.temporaryGrant?.active && (
                    <div className="tr-tier-role-line is-tabular">
                      <span>
                        {ac.isAuthenticated ? "Quyền tạm thời: " : "Đoàn kiểm tra: "}
                        <strong>{ac.temporaryGrant.requesterName}</strong> ({ac.temporaryGrant.organization}, mã{" "}
                        {ac.temporaryGrant.requestCode})
                      </span>
                    </div>
                  )}
                  {ac.temporaryGrant?.active && (
                    <span className="tr-tier-audit-note is-tabular">
                      Hiệu lực đến {formatTraceDateTime(ac.temporaryGrant.expiresAt, lang)}
                      {ac.temporaryGrant.reviewedByName ? `, duyệt bởi ${ac.temporaryGrant.reviewedByName}` : ""}
                    </span>
                  )}
                </div>

                <div className="tr-tier-actions-right">
                  {ac.actualTier !== "public" ? (
                    <>
                      <div className="tr-tier-switch" role="tablist" aria-label="Chọn chế độ hiển thị">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={ac.viewerTier === "public"}
                          disabled={switchingTier}
                          className={`tr-tier-btn ${ac.viewerTier === "public" ? "is-active" : ""}`}
                          onClick={() => handleSelectTier("public")}
                        >
                          Công khai
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={ac.viewerTier === "enterprise"}
                          disabled={switchingTier}
                          className={`tr-tier-btn ${ac.viewerTier === "enterprise" ? "is-active" : ""}`}
                          onClick={() => handleSelectTier("enterprise")}
                        >
                          Đối tác
                        </button>
                        {ac.actualTier === "authority" && (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={ac.viewerTier === "authority"}
                            disabled={switchingTier}
                            className={`tr-tier-btn ${ac.viewerTier === "authority" ? "is-active" : ""}`}
                            onClick={() => handleSelectTier("authority")}
                          >
                            Quản lý
                          </button>
                        )}
                      </div>
                      {ac.temporaryGrant?.active && (
                        <button
                          type="button"
                          className="tr-tier-sub-action-btn"
                          onClick={handleClearAuditPass}
                        >
                          Thoát quyền tạm thời
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="tr-tier-sub-action-btn is-primary"
                        onClick={() => setOpenAccessReqCount((c) => c + 1)}
                      >
                        Yêu cầu cấp quyền
                      </button>
                      <button
                        type="button"
                        className="tr-tier-sub-action-btn"
                        onClick={() => void handleSwitchAccount()}
                      >
                        {t.scopeAccess.switchAccountBtn}
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* ─── Cảnh báo Thu hồi / Tạm dừng / Chống giả (nếu có) ─── */}
            {pub.lotIdentity.status === "revoked" && (() => {
              const revokedCopy = getRevokedAlertCopy(activeKind, lang);
              return (
                <section className="tr-alert-banner is-danger" role="alert">
                  <div className="tr-alert-banner-head">
                    <ShieldAlert size={19} strokeWidth={2.3} aria-hidden="true" />
                    <strong>{revokedCopy.title}</strong>
                  </div>
                  <p className="tr-alert-banner-desc">
                    {lang === "vi" && pub.lotIdentity.revokedReason
                      ? pub.lotIdentity.revokedReason
                      : revokedCopy.desc}
                  </p>
                </section>
              );
            })()}

            {pub.realtimeStatus?.hasSuspensionAlert && pub.lotIdentity.status !== "revoked" && (
              <section className="tr-alert-banner is-danger" role="alert">
                <div className="tr-alert-banner-head">
                  <ShieldAlert size={19} strokeWidth={2.3} aria-hidden="true" />
                  <strong>{t.alerts.realtimeSuspendedTitle}</strong>
                </div>
                <p className="tr-alert-banner-desc">
                  {t.alerts.realtimeSuspendedDesc({
                    pucCode: pub.realtimeStatus.pucCode,
                    pucStatusText: localizeZoneStatusLabel(
                      pub.realtimeStatus.pucStatus,
                      pub.realtimeStatus.pucStatusLabel,
                      lang,
                    ),
                    packhouseCode: pub.realtimeStatus.packhouseCode,
                    phcStatusText: localizePackhouseStatusLabel(
                      pub.realtimeStatus.packhouseStatus,
                      pub.realtimeStatus.packhouseStatusLabel,
                      lang,
                    ),
                    note: lang === "vi" ? pub.realtimeStatus.pucNote : null,
                  })}
                </p>
              </section>
            )}

            {pub.lotIdentity.status === "unverified" && (
              <section className="tr-alert-banner is-warn" role="status">
                <div className="tr-alert-banner-head">
                  <AlertTriangle size={19} strokeWidth={2.3} aria-hidden="true" />
                  <strong>{t.alerts.unverifiedTitle}</strong>
                </div>
                <p className="tr-alert-banner-desc">{t.alerts.unverifiedDesc}</p>
              </section>
            )}

            {(pub.verification.warningReason === "multi_country" ||
              pub.verification.warningReason === "high_frequency") && (() => {
                const anomalyCopy = getScanAnomalyAlertCopy(
                  pub.verification.warningReason,
                  activeKind,
                  lang,
                );
                return (
                  <section className="tr-alert-banner is-warn" role="alert">
                    <div className="tr-alert-banner-head">
                      <AlertTriangle size={19} strokeWidth={2.3} aria-hidden="true" />
                      <strong>{anomalyCopy.title}</strong>
                    </div>
                    <p className="tr-alert-banner-desc">{anomalyCopy.desc}</p>
                  </section>
                );
              })()}

            {/* ═══════════════════════════════════════════════════════════════════════════
               PHIẾU HỒ SƠ MINH BẠCH LÔ HÀNG (BỐ CỤC CHỨNG TỪ / HÓA ĐƠN CHUẨN THỤY SĨ)
               ═══════════════════════════════════════════════════════════════════════════ */}
            {(() => {
              const docCopy = DOSSIER_SHEET_COPY[lang];
              const plotCopy = PLOT_DOSSIER_COPY[lang];
              const unitCopy = UNIT_DOSSIER_OVERRIDES[lang];
              const extCopy = DOSSIER_EXTENDED_COPY[lang];
              const isPlotDossier = activeKind === "plot";
              const isBoxDossier = activeKind === "box";
              const isFruitDossier = activeKind === "fruit";
              const plotSb = data.plotSignboard ?? null;
              const labs = pub.labTests;
              const firstLab = labs[0] ?? null;
              const anyLabFail = labs.some(
                (lt) =>
                  lt.result !== "pass" ||
                  Number(lt.cdMgKg) > 0.05 ||
                  lt.yellowOPositive ||
                  (lt.chlorpyrifosMgKg ?? 0) > 0.01,
              );
              const mb = pub.massBalanceSummary;

              const localizedVariety = localizeVariety(
                (isPlotDossier ? plotSb?.variety : null) || pub.lotIdentity.variety,
                lang,
              );

              const plotCode =
                plotSb?.plotCode || fallbackUnitSerial || pub.lotIdentity.scannedCode;
              const plotAreaHa =
                plotSb && plotSb.areaHa > 0 ? plotSb.areaHa : (mb?.totalAreaHa ?? 0);
              const plotTreeCount =
                plotSb && plotSb.treeCount > 0 ? plotSb.treeCount : (mb?.totalTreeCount ?? 0);
              const plotVillageText = plotSb?.villageName
                ? localizeVillageLabel(plotSb.villageName, lang)
                : "";
              const plotPlantedYear = plotSb?.plantedYear ?? null;
              const plotLinkedLotCode =
                plotSb?.linkedLotCode ??
                (pub.lotIdentity.lotCode &&
                  pub.lotIdentity.lotCode.toUpperCase() !==
                  pub.growingZone.pucCode.toUpperCase()
                  ? pub.lotIdentity.lotCode
                  : null);

              const isPlotSuspended =
                pub.lotIdentity.status === "revoked" || plotSb?.plotStatus === "violation";
              const isPlotPending =
                pub.lotIdentity.status === "pending" ||
                pub.lotIdentity.status === "unverified" ||
                plotSb?.plotStatus === "pending";
              const journalOk = !(pub.integritySeal && !pub.integritySeal.chainVerified);

              const hasNumericScale = isPlotDossier
                ? plotAreaHa > 0
                : pub.lotIdentity.itemWeightKg !== null || pub.lotIdentity.weightTons > 0;

              const scaleDisplay = isPlotDossier
                ? plotAreaHa > 0
                  ? `${formatTraceNumber(plotAreaHa, lang)} ha`
                  : plotCode
                : pub.lotIdentity.itemWeightKg !== null
                  ? `${formatTraceNumber(pub.lotIdentity.itemWeightKg, lang)} kg${pub.lotIdentity.itemGrade
                    ? ` (${t.hero.gradeFmt(pub.lotIdentity.itemGrade)})`
                    : ""
                  }`
                  : pub.lotIdentity.weightTons > 0
                    ? `${formatTraceNumber(pub.lotIdentity.weightTons * 1000, lang)} kg`
                    : localizeTraceUnitLabel(
                      pub.lotIdentity.traceUnit,
                      pub.lotIdentity.traceUnitLabel,
                      lang,
                    );

              const scaleSubline = isPlotDossier
                ? plotTreeCount > 0
                  ? `${formatTraceNumber(plotTreeCount, lang)} ${plotCopy.treesUnit}, ${localizedVariety}`
                  : localizedVariety
                : pub.lotIdentity.itemWeightKg === null && pub.lotIdentity.weightTons > 0
                  ? `${formatTraceNumber(pub.lotIdentity.weightTons, lang)} ${docCopy.tonsUnit}, ${localizedVariety}`
                  : localizedVariety;

              const lotStatusTone =
                pub.lotIdentity.status === "revoked"
                  ? "is-danger"
                  : pub.lotIdentity.status === "pending" || pub.lotIdentity.status === "unverified"
                    ? "is-warn"
                    : "is-ok";

              const coopDisplay = localizeCoopName(pub.producer.cooperativeName, lang);
              const coopLines = splitCoopHeaderLines(coopDisplay, lang);

              const orchardSteps = isPlotDossier
                ? plotCopy.buildSteps({
                  plotCode,
                  pucCode: pub.growingZone.pucCode,
                  coopName: coopDisplay,
                  areaText:
                    plotAreaHa > 0 ? `${formatTraceNumber(plotAreaHa, lang)} ha` : plotCode,
                  treesText:
                    plotTreeCount > 0
                      ? `${formatTraceNumber(plotTreeCount, lang)} ${plotCopy.treesUnit}`
                      : null,
                  assessedOn: mb?.assessedOn ?? pub.growingZone.validUntil ?? null,
                  lastCareOn: plotSb?.lastCareOn ?? null,
                  lastInspOn: plotSb?.lastInspectionOn ?? null,
                  minuteCode: plotSb?.latestMinuteCode ?? null,
                  minuteOfficer: plotSb?.latestMinuteOfficer ?? null,
                  firstLabCode: firstLab?.code ?? null,
                  firstLabName: firstLab ? localizeLabName(firstLab.lab, lang) : null,
                  firstLabOn: firstLab?.sampledOn ?? null,
                  anyLabFail,
                  isSuspended: isPlotSuspended,
                  isPending: isPlotPending,
                  journalOk,
                })
                : [];

              const unitPrimaryCode =
                fallbackUnitSerial ||
                (pub.lotIdentity.scannedCode !== pub.lotIdentity.qrToken
                  ? pub.lotIdentity.scannedCode
                  : pub.lotIdentity.lotCode);
              const hasDistinctParentLot = Boolean(
                pub.lotIdentity.lotCode &&
                pub.lotIdentity.lotCode.toUpperCase() !== unitPrimaryCode.toUpperCase() &&
                pub.lotIdentity.lotCode.toUpperCase() !== pub.growingZone.pucCode.toUpperCase(),
              );

              const activeDocTitle = isPlotDossier
                ? plotCopy.docTitle
                : isBoxDossier
                  ? unitCopy.boxDocTitle
                  : isFruitDossier
                    ? unitCopy.fruitDocTitle
                    : docCopy.docTitle;
              const activePrimaryPrefix = isPlotDossier
                ? plotCopy.plotCodePrefix
                : isBoxDossier
                  ? unitCopy.boxCodePrefix
                  : isFruitDossier
                    ? unitCopy.fruitCodePrefix
                    : docCopy.lotNoPrefix;
              const activePrimaryCode = isPlotDossier
                ? plotCode
                : isBoxDossier || isFruitDossier
                  ? unitPrimaryCode
                  : pub.lotIdentity.lotCode;

              const contribCopy = DOSSIER_CONTRIBUTORS_COPY[lang];
              const contribRows = pub.producer.dossierContributors ?? [];
              const contribTier: "public" | "enterprise" | "authority" =
                pub.producer.dossierContributorsTier ??
                (ac.viewerTier === "authority"
                  ? "authority"
                  : ac.viewerTier === "enterprise" || ac.fieldAuditPass?.active
                    ? "enterprise"
                    : "public");
              const showContributorsTable = !isPlotDossier && !data.isFarmerStamp;
              const CONTRIB_ROWS_PER_CHUNK = 8;
              const contribChunks: TraceDossierContributor[][] = [];
              if (showContributorsTable) {
                if (contribRows.length === 0) {
                  contribChunks.push([]);
                } else {
                  for (let i = 0; i < contribRows.length; i += CONTRIB_ROWS_PER_CHUNK) {
                    contribChunks.push(contribRows.slice(i, i + CONTRIB_ROWS_PER_CHUNK));
                  }
                }
              }

              const entData = data.enterpriseData ?? null;
              const authData = data.authorityData ?? null;

              const plotLinkByCode = new Map<string, { href: string; qrToken: string | null }>();
              if (entData?.fieldAuditSourcePlots) {
                for (const sp of entData.fieldAuditSourcePlots) {
                  const key = sp.plotCode.trim().toUpperCase();
                  if (!key) continue;
                  const href =
                    sp.qrToken && !/^\.+$/.test(sp.qrToken) && isSafeTraceCode(sp.qrToken)
                      ? `/t/${encodeURIComponent(sp.qrToken)}`
                      : !/^\.+$/.test(sp.plotCode) && isSafeTraceCode(sp.plotCode)
                        ? `/trace/${encodeURIComponent(sp.plotCode)}`
                        : "";
                  if (href) {
                    plotLinkByCode.set(key, { href, qrToken: sp.qrToken ?? null });
                  }
                }
              }

              const authPlotByCode = new Map<
                string,
                { hh: TraceAuthorityHousehold; plot: TraceAuthorityPlot }
              >();
              if (authData) {
                for (const hh of authData.sourceHouseholds) {
                  for (const p of hh.plots) {
                    const key = p.plotCode.trim().toUpperCase();
                    if (key && !authPlotByCode.has(key)) {
                      authPlotByCode.set(key, { hh, plot: p });
                    }
                  }
                }
              }

              const showEntZones = Boolean(entData && entData.sourceZones.length > 1);
              const entZoneChunks =
                showEntZones && entData ? chunkArray(entData.sourceZones, 7) : [];
              const entQuotaPlotChunks = entData?.massBalance
                ? chunkArray(entData.massBalance.plots, 6)
                : [];
              const entLabChunks =
                entData && entData.detailedLabTests.length > 0
                  ? chunkArray(entData.detailedLabTests, 6)
                  : [];
              const hasRealPackingSpecs = Boolean(
                entData?.packingSpecs &&
                (entData.packingSpecs.gradeAPct !== null ||
                  entData.packingSpecs.avgBrix !== null ||
                  Boolean(entData.packingSpecs.treatmentMethod) ||
                  Boolean(entData.packingSpecs.transporter) ||
                  Boolean(entData.packingSpecs.vehiclePlate) ||
                  entData.packingSpecs.temperatureC !== null ||
                  Boolean(entData.packingSpecs.departedAt) ||
                  Boolean(entData.packingSpecs.estimatedArrival)),
              );

              type AuthHhSlice = {
                hh: TraceAuthorityHousehold;
                hhNumber: number;
                plotsSlice: TraceAuthorityPlot[];
                isContinuation: boolean;
              };
              const authHhSlices: AuthHhSlice[] = [];
              if (authData && !showContributorsTable && authData.sourceHouseholds.length > 0) {
                authData.sourceHouseholds.forEach((hh, idx) => {
                  if (hh.plots.length <= 3) {
                    authHhSlices.push({
                      hh,
                      hhNumber: idx + 1,
                      plotsSlice: hh.plots,
                      isContinuation: false,
                    });
                  } else {
                    for (let pIdx = 0; pIdx < hh.plots.length; pIdx += 3) {
                      authHhSlices.push({
                        hh,
                        hhNumber: idx + 1,
                        plotsSlice: hh.plots.slice(pIdx, pIdx + 3),
                        isContinuation: pIdx > 0,
                      });
                    }
                  }
                });
              }
              const authHhChunks = authHhSlices.length > 0 ? chunkArray(authHhSlices, 4) : [];
              const authDiaryChunks = authData ? chunkArray(authData.cultivationDiaries, 6) : [];
              const authMinuteChunks = authData ? chunkArray(authData.inspectionMinutes, 5) : [];
              const authViolationChunks =
                authData && authData.internalViolations.length > 0
                  ? chunkArray(authData.internalViolations, 5)
                  : [];

              const dossierMeasureKey = [
                activeKind,
                activePrimaryCode,
                lang,
                ac.viewerTier,
                isPlotDossier ? orchardSteps.length : pub.timeline.length,
                pub.timeline.map((s) => `${s.status}:${s.detail.length}`).join(","),
                labs.length,
                contribTier,
                contribRows.length,
                contribRows.map((r) => `${r.index}:${r.visibilityLevel}:${r.sharePct}`).join(","),
                pub.phytosanitary.certNo || "",
                pub.lotIdentity.rawLotStatus || pub.lotIdentity.status,
                Boolean(qrSrc),
                entData
                  ? [
                    showEntZones ? entData.sourceZones.length : 0,
                    entData.massBalance
                      ? `${entData.massBalance.cumulativeUsedKg}:${entData.massBalance.plots.length}`
                      : "no-mb",
                    entData.detailedLabTests.map((l) => `${l.code}:${l.result}`).join(","),
                    hasRealPackingSpecs && entData.packingSpecs
                      ? `${entData.packingSpecs.gradeAPct}:${entData.packingSpecs.avgBrix}:${entData.packingSpecs.temperatureC}:${entData.packingSpecs.vehiclePlate}`
                      : "no-pack",
                  ].join(";")
                  : "no-ent",
                authData
                  ? [
                    authHhSlices.length,
                    authData.cultivationDiaries.length,
                    authData.inspectionMinutes.length,
                    authData.internalViolations.length,
                  ].join(";")
                  : "no-auth",
              ].join("|");

              const headerFullNode = (
                <header className="tr-doc-head">
                  <div className="tr-doc-brand">
                    <div className="tr-doc-logo-box" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/newlogo.png"
                        alt=""
                        width={26}
                        height={26}
                        className="tr-doc-logo-img"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div className="tr-doc-brand-copy">
                      <strong className="tr-doc-org-name">
                        <span className="tr-doc-org-line">{coopLines.line1}</span>
                        {coopLines.line2 && (
                          <span className="tr-doc-org-line">{coopLines.line2}</span>
                        )}
                      </strong>
                      <span className="tr-doc-org-sub">
                        {localizeAdminLocation(pub.growingZone.adminLocation, lang)}
                      </span>
                    </div>
                  </div>

                  <div className="tr-doc-title-block">
                    <h1 className="tr-doc-main-title">{activeDocTitle}</h1>
                    <div className="tr-doc-date-line">
                      {docCopy.verifiedDatePrefix}{" "}
                      <span>{formatTraceDate(pub.verification.verifiedAt, lang)}</span>
                    </div>
                  </div>
                </header>
              );

              const headerContNode = (
                <header className="tr-doc-head-cont">
                  <strong className="tr-doc-cont-org">{coopDisplay}</strong>
                  <span className="tr-doc-cont-meta">
                    {activeDocTitle} / {activePrimaryPrefix}: {activePrimaryCode}
                  </span>
                </header>
              );

              const plotFinalStatusText = isPlotSuspended
                ? plotCopy.plotStatusRevoked
                : isPlotPending
                  ? plotCopy.plotStatusPending
                  : plotCopy.plotStatusValid;

              const dossierSections: A4DossierSectionItem[] = [
                {
                  key: "parties",
                  content: isPlotDossier ? (
                    <section className="tr-doc-parties" aria-label={t.zone.title}>
                      <div className="tr-doc-party-col">
                        <span className="tr-doc-party-kicker">{plotCopy.plotProfileHeading}</span>
                        <strong className="tr-doc-party-name">
                          {plotCopy.plotTitleFmt(plotCode)}
                        </strong>
                        <div className="tr-doc-party-lines">
                          <span>
                            {plotVillageText ||
                              localizeAdminLocation(pub.growingZone.adminLocation, lang)}
                          </span>
                          <span>
                            {localizeGroupName(
                              pub.producer.groupName,
                              pub.producer.participatingHouseholdCount,
                              lang,
                            )}
                          </span>
                          <span>
                            {pub.producer.consentedHouseholds.length > 0
                              ? `${docCopy.farmersPrefix}: ${pub.producer.consentedHouseholds.join(", ")}`
                              : t.producerPackhouse.representedByCoop}
                          </span>
                          <span>{plotCopy.varietyYearFmt(localizedVariety, plotPlantedYear)}</span>
                        </div>
                        <div className="tr-doc-party-code">
                          {plotCopy.plotCodePrefix}: {plotCode} ({plotFinalStatusText})
                        </div>
                      </div>

                      <div className="tr-doc-party-col">
                        <span className="tr-doc-party-kicker">{plotCopy.zoneOversightHeading}</span>
                        <strong className="tr-doc-party-name">
                          {localizeGrowingZoneName(pub.growingZone.name, lang)}
                        </strong>
                        <div className="tr-doc-party-lines">
                          <span>{localizeAdminLocation(pub.growingZone.adminLocation, lang)}</span>
                          <span>{t.processPhyto.standardValue}</span>
                          <span>
                            {docCopy.validUntilPrefix}:{" "}
                            {formatTraceDate(pub.growingZone.validUntil, lang)}
                          </span>
                          <span>
                            {plotCopy.linkedLotPrefix}:{" "}
                            {plotLinkedLotCode || plotCopy.noLinkedLotYet}
                          </span>
                        </div>
                        <div className="tr-doc-party-code">
                          PUC: {pub.growingZone.pucCode} (
                          {localizeZoneStatusLabel(
                            pub.growingZone.status,
                            pub.growingZone.statusLabel,
                            lang,
                          )}
                          )
                        </div>
                      </div>
                    </section>
                  ) : (
                    <section className="tr-doc-parties" aria-label={t.zone.title}>
                      <div className="tr-doc-party-col">
                        <span className="tr-doc-party-kicker">{docCopy.originHeading}</span>
                        <strong className="tr-doc-party-name">
                          {localizeGrowingZoneName(pub.growingZone.name, lang)}
                        </strong>
                        <div className="tr-doc-party-lines">
                          <span>{localizeAdminLocation(pub.growingZone.adminLocation, lang)}</span>
                          <span>
                            {localizeGroupName(
                              pub.producer.groupName,
                              pub.producer.participatingHouseholdCount,
                              lang,
                            )}
                          </span>
                          <span>
                            {docCopy.validUntilPrefix}:{" "}
                            {formatTraceDate(pub.growingZone.validUntil, lang)}
                          </span>
                        </div>
                        <div className="tr-doc-party-code">
                          PUC: {pub.growingZone.pucCode}
                          {pub.growingZone.additionalZoneCount > 0
                            ? t.zone.linkedZonesSuffix(pub.growingZone.additionalZoneCount)
                            : ""}{" "}
                          (
                          {localizeZoneStatusLabel(
                            pub.growingZone.status,
                            pub.growingZone.statusLabel,
                            lang,
                          )}
                          )
                        </div>
                      </div>

                      <div className="tr-doc-party-col">
                        <span className="tr-doc-party-kicker">{docCopy.destinationHeading}</span>
                        <strong className="tr-doc-party-name">
                          {localizePackhouseName(pub.packhouse.name, lang)}
                        </strong>
                        <div className="tr-doc-party-lines">
                          <span>{localizeAddress(pub.packhouse.address, lang)}</span>
                          <span>
                            {docCopy.marketPrefix}: {localizeMarket(pub.lotIdentity.market, lang)}
                          </span>
                          <span>{t.processPhyto.standardValue}</span>
                        </div>
                        <div className="tr-doc-party-code">
                          PHC: {pub.packhouse.code} (
                          {localizePackhouseStatusLabel(
                            pub.packhouse.status,
                            pub.packhouse.statusLabel,
                            lang,
                          )}
                          )
                        </div>
                      </div>
                    </section>
                  ),
                },
                ...contribChunks.map((chunk, chunkIdx): A4DossierSectionItem => {
                  const totalChunks = contribChunks.length;

                  return {
                    key: `contributors-${chunkIdx}`,
                    content: (
                      <section
                        className="tr-doc-ledger tr-doc-contributors"
                        aria-label={contribCopy.sectionTitle}
                      >
                        <div className="tr-doc-meta-strip">
                          <span className="tr-doc-meta-left">
                            {chunkIdx === 0
                              ? contribCopy.sectionTitle
                              : contribCopy.continuedTitleFmt(chunkIdx + 1, totalChunks)}
                          </span>
                        </div>

                        <div className="tr-doc-table-wrap">
                          <table className={`tr-doc-table is-contributors is-tier-${contribTier}`}>
                            <thead>
                              <tr>
                                <th className="col-no">{contribCopy.colNo}</th>
                                <th className="col-hh">{contribCopy.colHousehold}</th>
                                <th className="col-plot">
                                  {contribTier === "public"
                                    ? contribCopy.colZonePublic
                                    : contribCopy.colPlot}
                                </th>
                                <th className="col-share">
                                  {contribTier === "public"
                                    ? contribCopy.colSharePublic
                                    : contribCopy.colWeightShare}
                                </th>
                                <th className="col-status">{contribCopy.colCompliance}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {chunk.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="tr-doc-contrib-empty">
                                    {contribCopy.emptyContributors}
                                  </td>
                                </tr>
                              ) : (
                                chunk.map((row) => {
                                  const villageText = localizeVillageLabel(row.villageName, lang);
                                  const areaText =
                                    row.areaHa !== null && row.areaHa > 0
                                      ? formatTraceNumber(row.areaHa, lang)
                                      : null;
                                  const isCompliant = row.complianceStatus !== "review";
                                  const plotKey = row.plotCode ? row.plotCode.trim().toUpperCase() : "";
                                  const plotLink = plotKey ? plotLinkByCode.get(plotKey) : undefined;
                                  const authPlotEntry =
                                    contribTier === "authority" && plotKey
                                      ? authPlotByCode.get(plotKey)
                                      : undefined;
                                  const hasAuthGis = Boolean(
                                    authPlotEntry &&
                                    (authPlotEntry.plot.geometryJson ||
                                      (authPlotEntry.plot.lat !== null &&
                                        authPlotEntry.plot.lng !== null)),
                                  );

                                  let primaryHhTitle: string;
                                  let secondaryHhLine: string;

                                  if (contribTier === "authority") {
                                    if (row.visibilityLevel === "authority" && row.displayName) {
                                      primaryHhTitle = row.householdCode
                                        ? `${row.displayName} (${row.householdCode})`
                                        : row.displayName;
                                      const idParts = [
                                        row.phone ? `${contribCopy.phonePrefix}: ${row.phone}` : null,
                                        row.cccdMasked
                                          ? `${contribCopy.cccdPrefix}: ${row.cccdMasked}`
                                          : null,
                                        villageText || null,
                                      ].filter(Boolean);
                                      secondaryHhLine = idParts.join(", ");
                                    } else {
                                      primaryHhTitle = contribCopy.outOfVillageFmt(row.index);
                                      secondaryHhLine = villageText;
                                    }
                                  } else if (contribTier === "enterprise") {
                                    if (row.displayName && row.householdCode) {
                                      primaryHhTitle = `${row.displayName} (${row.householdCode})`;
                                    } else if (row.householdCode) {
                                      primaryHhTitle = contribCopy.memberByCodeFmt(row.householdCode);
                                    } else {
                                      primaryHhTitle =
                                        row.displayName || contribCopy.anonGrowerFmt(row.index);
                                    }
                                    secondaryHhLine = villageText;
                                  } else {
                                    primaryHhTitle =
                                      row.displayName || contribCopy.anonGrowerFmt(row.index);
                                    secondaryHhLine = villageText;
                                  }

                                  const plotTitleLabel = row.plotCode
                                    ? contribCopy.plotAreaFmt(row.plotCode, areaText)
                                    : "";

                                  return (
                                    <tr key={`contrib-${row.index}`}>
                                      <td className="col-no">
                                        {String(row.index).padStart(2, "0")}.
                                      </td>
                                      <td className="col-hh">
                                        <strong className="tr-doc-item-title">
                                          {primaryHhTitle}
                                        </strong>
                                        {secondaryHhLine && (
                                          <span className="tr-doc-item-sub">{secondaryHhLine}</span>
                                        )}
                                      </td>
                                      <td className="col-plot">
                                        {contribTier === "public" || !row.plotCode ? (
                                          <span className="tr-doc-contrib-mono">{row.pucCode}</span>
                                        ) : (
                                          <>
                                            {plotLink ? (
                                              <Link
                                                href={plotLink.href}
                                                className="tr-doc-item-title tr-doc-inline-link"
                                                onClick={() => {
                                                  rememberTraceKindHint(row.plotCode, "plot");
                                                  rememberTraceKindHint(plotLink.qrToken, "plot");
                                                }}
                                              >
                                                {plotTitleLabel}
                                              </Link>
                                            ) : (
                                              <strong className="tr-doc-item-title">
                                                {plotTitleLabel}
                                              </strong>
                                            )}
                                            <span className="tr-doc-item-sub">
                                              {row.cadastralLabel
                                                ? `${row.cadastralLabel}, PUC: ${row.pucCode}`
                                                : `PUC: ${row.pucCode}`}
                                            </span>
                                            {hasAuthGis && authPlotEntry && (
                                              <button
                                                type="button"
                                                className="tr-doc-sub-btn no-print"
                                                onClick={() =>
                                                  openAuthorityPlotGis(
                                                    authPlotEntry.hh,
                                                    authPlotEntry.plot,
                                                  )
                                                }
                                              >
                                                {extCopy.openGisBtn}
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </td>
                                      <td className="col-share">
                                        {row.weightKg !== null && contribTier !== "public" ? (
                                          <>
                                            <strong className="tr-doc-contrib-wt">
                                              {formatTraceNumber(row.weightKg, lang)} kg
                                            </strong>
                                            <span className="tr-doc-item-sub">{row.sharePct}%</span>
                                          </>
                                        ) : (
                                          <strong className="tr-doc-contrib-wt">
                                            {row.sharePct}%
                                          </strong>
                                        )}
                                      </td>
                                      <td
                                        className={`col-status ${isCompliant ? "is-ok" : "is-danger"
                                          }`}
                                      >
                                        {isCompliant
                                          ? contribCopy.statusValid
                                          : contribCopy.statusReview}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ),
                  };
                }),
                {
                  key: "ledger",
                  content: (
                    <section className="tr-doc-ledger" aria-label={t.timeline.ariaLabel}>
                      <div className="tr-doc-meta-strip">
                        <span className="tr-doc-meta-left">
                          {isPlotDossier
                            ? `${plotCopy.cropMetaPrefix}: ${plotCopy.cropName} (${localizedVariety})`
                            : `${docCopy.productMetaPrefix}: ${localizeProductName(
                              pub.lotIdentity.productName,
                              pub.lotIdentity.traceUnit,
                              lang,
                            )} (${localizedVariety})`}
                        </span>
                        <strong className="tr-doc-meta-right">
                          {isPlotDossier
                            ? `${plotCopy.plotCodePrefix}: ${plotCode} / PUC: ${pub.growingZone.pucCode}`
                            : isBoxDossier || isFruitDossier
                              ? `${activePrimaryPrefix}: ${unitPrimaryCode}${hasDistinctParentLot
                                ? ` / ${unitCopy.parentLotPrefix}: ${pub.lotIdentity.lotCode}`
                                : ""
                              }`
                              : `${docCopy.lotNoPrefix}: ${pub.lotIdentity.lotCode}${fallbackUnitSerial &&
                                fallbackUnitSerial.toUpperCase() !==
                                pub.lotIdentity.lotCode.toUpperCase()
                                ? ` / ${docCopy.unitSerialPrefix}: ${fallbackUnitSerial}`
                                : ""
                              }`}
                        </strong>
                      </div>

                      <div className="tr-doc-table-wrap">
                        <table className="tr-doc-table">
                          <thead>
                            <tr>
                              <th className="col-no">{docCopy.colNo}</th>
                              <th className="col-desc">
                                {isPlotDossier ? plotCopy.colStage : docCopy.colStage}
                              </th>
                              <th className="col-unit">{docCopy.colUnit}</th>
                              <th className="col-date">{docCopy.colDate}</th>
                              <th className="col-status">{docCopy.colResult}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {isPlotDossier
                              ? orchardSteps.map((st) => (
                                <tr key={st.stepNo}>
                                  <td className="col-no">{st.stepNo}</td>
                                  <td className="col-desc">
                                    <strong className="tr-doc-item-title">{st.title}</strong>
                                    <span className="tr-doc-item-sub">{st.detail}</span>
                                  </td>
                                  <td className="col-unit">{st.unit}</td>
                                  <td className="col-date">{formatTraceDate(st.date, lang)}</td>
                                  <td className={`col-status ${st.statusTone}`}>
                                    {st.statusLabel}
                                  </td>
                                </tr>
                              ))
                              : pub.timeline.map((st) => {
                                const statusLabel =
                                  st.status === "completed"
                                    ? t.timeline.statusCompleted
                                    : st.status === "warning"
                                      ? t.timeline.statusWarning
                                      : st.status === "current"
                                        ? t.timeline.statusCurrent
                                        : t.timeline.statusUpcoming;
                                const statusTone =
                                  st.status === "completed"
                                    ? "is-ok"
                                    : st.status === "warning"
                                      ? "is-danger"
                                      : "is-muted";
                                const localizedStep = localizeTimelineStep(st, {
                                  pucCode: pub.growingZone.pucCode,
                                  packhouseCode: pub.packhouse.code,
                                  packhouseName: pub.packhouse.name,
                                  market: pub.lotIdentity.market,
                                  lang,
                                  participatingHouseholdCount: pub.producer.participatingHouseholdCount,
                                  weightTons: pub.lotIdentity.weightTons,
                                  avgBrix: pub.lotIdentity.avgBrix,
                                  gradeAPct: pub.lotIdentity.gradeAPct,
                                  vehiclePlate: pub.lotIdentity.vehiclePlate,
                                  temperatureC: pub.lotIdentity.temperatureC,
                                  rawLotStatus: pub.lotIdentity.rawLotStatus,
                                });
                                const isLabStep =
                                  st.step === 4 ||
                                  st.key.includes("lab") ||
                                  st.key.includes("test");
                                const isExportStep =
                                  st.step === 5 ||
                                  st.key.includes("export") ||
                                  st.key.includes("phyto");

                                return (
                                  <tr key={st.key}>
                                    <td className="col-no">
                                      {String(st.step).padStart(2, "0")}.
                                    </td>
                                    <td className="col-desc">
                                      <strong className="tr-doc-item-title">
                                        {localizedStep.title}
                                      </strong>
                                      <span className="tr-doc-item-sub">
                                        {localizedStep.detail}
                                      </span>

                                      {isLabStep && labs.length > 0 && (
                                        <div className="tr-doc-lab-proofs">
                                          {labs.map((lt) => {
                                            const ltPassed =
                                              lt.result === "pass" &&
                                              !lt.yellowOPositive &&
                                              Number(lt.cdMgKg) <= 0.05 &&
                                              (lt.chlorpyrifosMgKg ?? 0) <= 0.01;
                                            return (
                                              <div key={lt.code} className="tr-doc-lab-line">
                                                <span>
                                                  {docCopy.labReportLineFmt(lt.code, ltPassed)}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {isExportStep && pub.phytosanitary.certNo && (
                                        <span className="tr-doc-item-proof">
                                          {t.processPhyto.phytoLabel}: {pub.phytosanitary.certNo}
                                          {pub.phytosanitary.issuedOn
                                            ? ` (${formatTraceDate(pub.phytosanitary.issuedOn, lang)})`
                                            : ""}
                                        </span>
                                      )}
                                    </td>
                                    <td className="col-unit">{localizedStep.responsibleUnit}</td>
                                    <td className="col-date">
                                      {formatTraceDate(st.date, lang)}
                                    </td>
                                    <td className={`col-status ${statusTone}`}>{statusLabel}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ),
                },
                {
                  key: "summary",
                  content: (
                    <section className="tr-doc-summary-split">
                      <div className="tr-doc-total-box">
                        <span className="tr-doc-total-label">
                          {isPlotDossier
                            ? plotCopy.plotScaleHeading
                            : isBoxDossier
                              ? unitCopy.boxScaleHeading
                              : isFruitDossier
                                ? unitCopy.fruitScaleHeading
                                : pub.lotIdentity.itemWeightKg !== null
                                  ? docCopy.unitWeightHeading
                                  : docCopy.lotScaleHeading}
                        </span>
                        <div className="tr-doc-hatch-box">
                          <strong
                            className={`tr-doc-hatch-val${hasNumericScale ? "" : " is-label-mode"}`}
                          >
                            {scaleDisplay}
                          </strong>
                          <span className="tr-doc-hatch-sub">{scaleSubline}</span>
                        </div>
                      </div>

                      {isPlotDossier ? (
                        <dl className="tr-doc-kv-totals">
                          <div className="tr-doc-kv-row">
                            <dt>{plotCopy.rowPucCode}</dt>
                            <dd>{pub.growingZone.pucCode}</dd>
                          </div>
                          <div className="tr-doc-kv-row">
                            <dt>{plotCopy.rowCareJournal}</dt>
                            <dd>
                              {journalOk ? docCopy.journalVerifiedText : docCopy.journalReviewText}
                            </dd>
                          </div>
                          <div className="tr-doc-kv-row">
                            <dt>{plotCopy.rowPesticidePhi}</dt>
                            <dd className={isPlotSuspended ? "is-danger" : ""}>
                              {isPlotSuspended
                                ? docCopy.heavyMetalFailText
                                : docCopy.phiCompliantText}
                            </dd>
                          </div>
                          <div className="tr-doc-kv-row">
                            <dt>{plotCopy.rowPlotSampleTest}</dt>
                            <dd className={anyLabFail ? "is-danger" : ""}>
                              {firstLab
                                ? anyLabFail
                                  ? docCopy.heavyMetalFailText
                                  : docCopy.heavyMetalPassText
                                : plotCopy.preHarvestSamplePending}
                            </dd>
                          </div>
                          <div className="tr-doc-kv-row">
                            <dt>{plotCopy.rowLatestLot}</dt>
                            <dd>{plotLinkedLotCode || plotCopy.noLinkedLotYet}</dd>
                          </div>
                          <div className="tr-doc-kv-row is-grand">
                            <dt>{plotCopy.rowPlotFinalStatus}</dt>
                            <dd className={lotStatusTone}>{plotFinalStatusText}</dd>
                          </div>
                        </dl>
                      ) : (
                        <dl className="tr-doc-kv-totals">
                          <div className="tr-doc-kv-row">
                            <dt>{docCopy.rowHeavyMetalYellowO}</dt>
                            <dd className={anyLabFail ? "is-danger" : ""}>
                              {firstLab
                                ? firstLab.yellowOPositive || Number(firstLab.cdMgKg) > 0.05
                                  ? docCopy.heavyMetalFailText
                                  : docCopy.heavyMetalPassText
                                : t.lab.badgeUpdating}
                            </dd>
                          </div>
                          <div className="tr-doc-kv-row">
                            <dt>{docCopy.rowPesticideSafety}</dt>
                            <dd className={anyLabFail ? "is-danger" : ""}>
                              {firstLab
                                ? firstLab.result !== "pass" ||
                                  (firstLab.chlorpyrifosMgKg ?? 0) > 0.01
                                  ? docCopy.pesticideFailText
                                  : docCopy.pesticidePassText
                                : docCopy.phiCompliantText}
                            </dd>
                          </div>
                          <div className="tr-doc-kv-row">
                            <dt>{docCopy.rowFarmJournal}</dt>
                            <dd>
                              {pub.integritySeal && !pub.integritySeal.chainVerified
                                ? docCopy.journalReviewText
                                : docCopy.journalVerifiedText}
                            </dd>
                          </div>
                          <div className="tr-doc-kv-row">
                            <dt>{docCopy.rowYieldCheck}</dt>
                            <dd className={mb && !mb.withinQuota ? "is-danger" : ""}>
                              {mb && !mb.withinQuota
                                ? docCopy.overQuotaText
                                : docCopy.withinQuotaText}
                            </dd>
                          </div>
                          <div className="tr-doc-kv-row">
                            <dt>{docCopy.rowPhytosanitary}</dt>
                            <dd>
                              {pub.phytosanitary.certNo || t.processPhyto.phytoDefaultPending}
                            </dd>
                          </div>
                          <div className="tr-doc-kv-row is-grand">
                            <dt>
                              {isBoxDossier
                                ? unitCopy.rowBoxFinalStatus
                                : isFruitDossier
                                  ? unitCopy.rowFruitFinalStatus
                                  : docCopy.rowFinalStatus}
                            </dt>
                            <dd className={lotStatusTone}>
                              {localizeLotStatusLabel(
                                pub.lotIdentity.status,
                                pub.lotIdentity.statusLabel,
                                lang,
                                activeKind,
                                pub.lotIdentity.rawLotStatus,
                              )}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </section>
                  ),
                },
                ...(entData
                  ? [
                    ...entZoneChunks.map((zChunk, zIdx): A4DossierSectionItem => ({
                      key: `ent-zones-${zIdx}`,
                      content: (
                        <section className="tr-doc-ledger tr-doc-ext-block">
                          <div className="tr-doc-meta-strip">
                            <span className="tr-doc-meta-left">
                              {extCopy.zonesTitle}
                              {entZoneChunks.length > 1
                                ? extCopy.partSuffixFmt(zIdx + 1, entZoneChunks.length)
                                : ""}
                            </span>
                            <strong className="tr-doc-meta-right">
                              {extCopy.zonesTotalFmt(
                                formatTraceNumber(entData.totalSourceWeightKg, lang),
                              )}
                            </strong>
                          </div>
                          <div className="tr-doc-table-wrap">
                            <table className="tr-doc-table is-ent-zones">
                              <thead>
                                <tr>
                                  <th className="col-no">{extCopy.colNo}</th>
                                  <th className="col-puc">{extCopy.colPuc}</th>
                                  <th className="col-area-name">{extCopy.colVillage}</th>
                                  <th className="col-scale">{extCopy.colZoneScale}</th>
                                  <th className="col-wt">{extCopy.colContribWeight}</th>
                                  <th className="col-status">{extCopy.colStatus}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {zChunk.map((z, idx) => {
                                  const rowNum = zIdx * 7 + idx + 1;
                                  const isQual = z.status === "Đủ điều kiện";
                                  return (
                                    <tr key={`${z.zoneCode}-${rowNum}`}>
                                      <td className="col-no">
                                        {String(rowNum).padStart(2, "0")}.
                                      </td>
                                      <td className="col-puc is-tabular">
                                        <strong>{z.zoneCode}</strong>
                                      </td>
                                      <td className="col-area-name">
                                        {localizeVillageLabel(z.villageName, lang)}
                                      </td>
                                      <td className="col-scale is-tabular">
                                        {extCopy.zoneScaleFmt(
                                          z.householdCount,
                                          z.areaHa > 0 ? formatTraceNumber(z.areaHa, lang) : null,
                                        )}
                                      </td>
                                      <td className="col-wt is-tabular">
                                        <strong className="tr-doc-contrib-wt">
                                          {formatTraceNumber(z.weightKg, lang)} kg
                                        </strong>
                                        <span className="tr-doc-item-sub">{z.sharePct}%</span>
                                      </td>
                                      <td
                                        className={`col-status ${isQual ? "is-ok" : "is-danger"}`}
                                      >
                                        {isQual ? extCopy.statusQualified : extCopy.statusReview}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ),
                    })),
                    ...(entData.massBalance
                      ? entQuotaPlotChunks.map((qChunk, qIdx): A4DossierSectionItem => {
                        const emb = entData.massBalance!;
                        return {
                          key: `ent-quota-${qIdx}`,
                          content: (
                            <section className="tr-doc-ledger tr-doc-ext-block">
                              <div className="tr-doc-meta-strip">
                                <span className="tr-doc-meta-left">
                                  {extCopy.quotaTitleFmt(emb.seasonYear)}
                                  {entQuotaPlotChunks.length > 1
                                    ? extCopy.partSuffixFmt(
                                      qIdx + 1,
                                      entQuotaPlotChunks.length,
                                    )
                                    : ""}
                                </span>
                                <strong
                                  className={`tr-doc-meta-right ${emb.withinQuota ? "is-ok-text" : "is-danger-text"}`}
                                >
                                  {emb.withinQuota ? extCopy.quotaWithin : extCopy.quotaOver}
                                </strong>
                              </div>

                              <div className="tr-doc-table-wrap">
                                <table className="tr-doc-table is-ent-quota">
                                  <thead>
                                    <tr>
                                      <th className="col-plot-code">{extCopy.colPlotCode}</th>
                                      <th className="col-orchard">{extCopy.colOrchardScale}</th>
                                      <th className="col-cap">{extCopy.colMaxQuota}</th>
                                      <th className="col-used">{extCopy.colUsed}</th>
                                      <th className="col-remain">{extCopy.colRemain}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {qChunk.length === 0 ? (
                                      <tr>
                                        <td className="col-plot-code is-tabular">
                                          <strong>{pub.growingZone.pucCode}</strong>
                                        </td>
                                        <td className="col-orchard">
                                          {extCopy.zoneTotalLabel}
                                        </td>
                                        <td className="col-cap is-tabular">
                                          {formatTraceNumber(emb.zoneMaxQuotaKg, lang)} kg
                                        </td>
                                        <td className="col-used is-tabular">
                                          <strong>
                                            {formatTraceNumber(emb.cumulativeUsedKg, lang)} kg
                                          </strong>{" "}
                                          <span className="tr-doc-inline-pct">
                                            ({emb.utilizationPct}%)
                                          </span>
                                        </td>
                                        <td
                                          className={`col-remain is-tabular ${emb.withinQuota ? "is-ok" : "is-danger"}`}
                                        >
                                          {formatTraceNumber(emb.remainingQuotaKg, lang)} kg
                                        </td>
                                      </tr>
                                    ) : (
                                      qChunk.map((pq) => {
                                        const pLink = plotLinkByCode.get(
                                          pq.plotCode.trim().toUpperCase(),
                                        );
                                        return (
                                          <tr key={pq.plotCode}>
                                            <td className="col-plot-code is-tabular">
                                              {pLink && !isPlotDossier ? (
                                                <Link
                                                  href={pLink.href}
                                                  className="tr-doc-inline-link"
                                                  onClick={() => {
                                                    rememberTraceKindHint(pq.plotCode, "plot");
                                                    rememberTraceKindHint(
                                                      pLink.qrToken,
                                                      "plot",
                                                    );
                                                  }}
                                                >
                                                  {pq.plotCode}
                                                </Link>
                                              ) : (
                                                <strong>{pq.plotCode}</strong>
                                              )}
                                              {showEntZones && (
                                                <span className="tr-doc-item-sub">
                                                  {pq.zoneCode}
                                                </span>
                                              )}
                                            </td>
                                            <td className="col-orchard is-tabular">
                                              {extCopy.orchardScaleFmt(
                                                formatTraceNumber(pq.areaHa, lang),
                                                formatTraceNumber(pq.treeCount, lang),
                                              )}
                                            </td>
                                            <td className="col-cap is-tabular">
                                              {formatTraceNumber(pq.maxQuotaKg, lang)} kg
                                            </td>
                                            <td className="col-used is-tabular">
                                              <strong>
                                                {formatTraceNumber(pq.usedKg, lang)} kg
                                              </strong>{" "}
                                              <span className="tr-doc-inline-pct">
                                                ({pq.utilizationPct}%)
                                              </span>
                                            </td>
                                            <td
                                              className={`col-remain is-tabular ${pq.withinQuota ? "is-ok" : "is-danger"}`}
                                            >
                                              {formatTraceNumber(pq.remainingKg, lang)} kg
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </section>
                          ),
                        };
                      })
                      : []),
                    ...entLabChunks.map((lChunk, lIdx): A4DossierSectionItem => ({
                      key: `ent-labs-${lIdx}`,
                      content: (
                        <section className="tr-doc-ledger tr-doc-ext-block">
                          <div className="tr-doc-meta-strip">
                            <span className="tr-doc-meta-left">
                              {extCopy.labsTitle}
                              {entLabChunks.length > 1
                                ? extCopy.partSuffixFmt(lIdx + 1, entLabChunks.length)
                                : ""}
                            </span>
                          </div>
                          <div className="tr-doc-table-wrap">
                            <table className="tr-doc-table is-ent-labs">
                              <thead>
                                <tr>
                                  <th className="col-cert">{extCopy.colLabCert}</th>
                                  <th className="col-date">{extCopy.colSampleDate}</th>
                                  <th className="col-num">{extCopy.colCd}</th>
                                  <th className="col-yo">{extCopy.colYellowO}</th>
                                  <th className="col-res">{extCopy.colResidue}</th>
                                  <th className="col-status">{docCopy.colResult}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lChunk.map((lt) => {
                                  const passed = lt.result === "pass" && !lt.yellowOPositive;
                                  return (
                                    <tr key={lt.code}>
                                      <td className="col-cert is-tabular">
                                        {isSafeMediaUrl(lt.scanUrl) ? (
                                          <a
                                            href={lt.scanUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="tr-doc-inline-link"
                                          >
                                            {lt.code}
                                          </a>
                                        ) : (
                                          <strong>{lt.code}</strong>
                                        )}
                                        {isSafeExternalHttpsUrl(lt.externalVerifyUrl) && (
                                          <a
                                            href={lt.externalVerifyUrl.trim()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            referrerPolicy="no-referrer"
                                            className="tr-doc-sub-link"
                                          >
                                            {extCopy.labVerifySubLink}
                                          </a>
                                        )}
                                      </td>
                                      <td className="col-date is-tabular">
                                        {formatTraceDate(lt.sampledOn, lang)}
                                      </td>
                                      <td className="col-num is-tabular">{lt.cdMgKg} mg/kg</td>
                                      <td className="col-yo">
                                        {lt.yellowOPositive
                                          ? extCopy.yellowOPos
                                          : extCopy.yellowONeg}
                                      </td>
                                      <td className="col-res is-tabular">
                                        {lt.residueMgKg} mg/kg
                                      </td>
                                      <td
                                        className={`col-status ${passed ? "is-ok" : "is-danger"}`}
                                      >
                                        {passed ? extCopy.labPass : extCopy.labFail}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ),
                    })),
                    ...(hasRealPackingSpecs && entData.packingSpecs
                      ? [
                        {
                          key: "ent-packing",
                          content: (() => {
                            const ps = entData.packingSpecs!;
                            const scheduleParts = [
                              ps.departedAt ? formatTraceDateTime(ps.departedAt, lang) : null,
                              ps.estimatedArrival
                                ? formatTraceDateTime(ps.estimatedArrival, lang)
                                : null,
                            ].filter(Boolean);
                            return (
                              <section className="tr-doc-ledger tr-doc-ext-block">
                                <div className="tr-doc-meta-strip">
                                  <span className="tr-doc-meta-left">
                                    {extCopy.packingTitle}
                                  </span>
                                </div>
                                <div className="tr-doc-spec-grid">
                                  <div className="tr-doc-spec-cell">
                                    <span>{extCopy.specGradeRatio}</span>
                                    <strong className="is-tabular">
                                      {ps.gradeAPct !== null
                                        ? `${ps.gradeAPct}% / ${ps.gradeBPct ?? 0}% / ${ps.gradeCPct ?? 0}%`
                                        : extCopy.notRecordedYet}
                                    </strong>
                                  </div>
                                  <div className="tr-doc-spec-cell">
                                    <span>{extCopy.specAvgBrix}</span>
                                    <strong className="is-tabular">
                                      {ps.avgBrix !== null
                                        ? `${ps.avgBrix}° Brix`
                                        : extCopy.notRecordedYet}
                                    </strong>
                                  </div>
                                  <div className="tr-doc-spec-cell">
                                    <span>{extCopy.specTreatment}</span>
                                    <strong>
                                      {ps.treatmentMethod || extCopy.notRecordedYet}
                                    </strong>
                                  </div>
                                  <div className="tr-doc-spec-cell">
                                    <span>{extCopy.specTransport}</span>
                                    <strong className="is-tabular">
                                      {ps.transporter || ps.vehiclePlate
                                        ? `${ps.transporter || ""}${ps.transporter && ps.vehiclePlate ? " - " : ""}${ps.vehiclePlate || ""}`
                                        : extCopy.notRecordedYet}
                                    </strong>
                                  </div>
                                  <div className="tr-doc-spec-cell">
                                    <span>{extCopy.specTemp}</span>
                                    <strong className="is-tabular">
                                      {ps.temperatureC !== null
                                        ? `${ps.temperatureC}°C`
                                        : extCopy.notRecordedYet}
                                    </strong>
                                  </div>
                                  <div className="tr-doc-spec-cell">
                                    <span>{extCopy.specSchedule}</span>
                                    <strong className="is-tabular">
                                      {scheduleParts.length > 0
                                        ? scheduleParts.join(" / ")
                                        : localizeLotStatusLabel(
                                          pub.lotIdentity.status,
                                          pub.lotIdentity.statusLabel,
                                          lang,
                                          activeKind,
                                          pub.lotIdentity.rawLotStatus,
                                        )}
                                    </strong>
                                  </div>
                                </div>
                              </section>
                            );
                          })(),
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                  ]
                  : []),
                ...(authData
                  ? [
                    ...authHhChunks.map((hhChunk, hIdx): A4DossierSectionItem => ({
                      key: `auth-hh-${hIdx}`,
                      content: (
                        <section className="tr-doc-ledger tr-doc-ext-block">
                          <div className="tr-doc-meta-strip">
                            <span className="tr-doc-meta-left">
                              {extCopy.authHhTitlePlot}
                              {authHhChunks.length > 1
                                ? extCopy.partSuffixFmt(hIdx + 1, authHhChunks.length)
                                : ""}
                            </span>
                          </div>
                          <div className="tr-doc-table-wrap">
                            <table className="tr-doc-table is-auth-hh">
                              <thead>
                                <tr>
                                  <th className="col-no">{extCopy.colNo}</th>
                                  <th className="col-hh-id">{extCopy.colHhIdentity}</th>
                                  <th className="col-gis">{extCopy.colCadastralGis}</th>
                                  <th className="col-status">{extCopy.colStatus}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {hhChunk.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="tr-doc-contrib-empty">
                                      {extCopy.emptyAuthHh}
                                    </td>
                                  </tr>
                                ) : (
                                  hhChunk.map((slice, sIdx) => {
                                    const { hh, hhNumber, plotsSlice, isContinuation } = slice;
                                    const idMeta = [
                                      `${extCopy.hhCodePrefix}: ${hh.householdCode}`,
                                      hh.villageName
                                        ? `${extCopy.areaLocPrefix}: ${localizeVillageLabel(hh.villageName, lang)}`
                                        : null,
                                      hh.phone ? `${extCopy.phonePrefix}: ${hh.phone}` : null,
                                      hh.cccdMasked
                                        ? `${extCopy.cccdPrefix}: ${hh.cccdMasked}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(", ");
                                    return (
                                      <tr
                                        key={`${hh.householdCode}-${hhNumber}-${sIdx}`}
                                      >
                                        <td className="col-no">
                                          {String(hhNumber).padStart(2, "0")}.
                                        </td>
                                        <td className="col-hh-id">
                                          <strong className="tr-doc-item-title">
                                            {hh.householdName}
                                            {isContinuation ? " (tiếp)" : ""}
                                          </strong>
                                          <span className="tr-doc-item-sub is-tabular">
                                            {idMeta}
                                          </span>
                                        </td>
                                        <td className="col-gis">
                                          {plotsSlice.length === 0 ? (
                                            <span className="tr-doc-item-sub is-tabular">
                                              {hh.contributedPlotCode
                                                ? `${extCopy.colPlotCode}: ${hh.contributedPlotCode}`
                                                : "-"}
                                            </span>
                                          ) : (
                                            <div className="tr-doc-gis-plot-stack">
                                              {plotsSlice.map((p) => {
                                                const hasGis = Boolean(
                                                  p.geometryJson ||
                                                  (p.lat !== null && p.lng !== null),
                                                );
                                                return (
                                                  <div
                                                    key={p.plotCode}
                                                    className="tr-doc-gis-plot-line"
                                                  >
                                                    <span className="is-tabular">
                                                      <strong>{p.plotCode}</strong> (
                                                      {extCopy.cadastralFmt(
                                                        p.sheetNo,
                                                        p.parcelNo,
                                                      )}
                                                      , {formatTraceNumber(p.areaHa || 0, lang)}{" "}
                                                      ha
                                                      {p.lat !== null && p.lng !== null
                                                        ? `, ${extCopy.coordFmt(
                                                          Number(p.lat).toFixed(5),
                                                          Number(p.lng).toFixed(5),
                                                        )}`
                                                        : ""}
                                                      )
                                                    </span>
                                                    {hasGis && (
                                                      <button
                                                        type="button"
                                                        className="tr-doc-gis-btn no-print"
                                                        onClick={() =>
                                                          openAuthorityPlotGis(hh, p)
                                                        }
                                                      >
                                                        {extCopy.openGisBtn}
                                                      </button>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </td>
                                        <td className="col-status is-ok">
                                          {extCopy.statusQualified}
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ),
                    })),
                    ...authDiaryChunks.map((dChunk, dIdx): A4DossierSectionItem => ({
                      key: `auth-diaries-${dIdx}`,
                      content: (
                        <section className="tr-doc-ledger tr-doc-ext-block">
                          <div className="tr-doc-meta-strip">
                            <span className="tr-doc-meta-left">
                              {extCopy.diariesTitle}
                              {authDiaryChunks.length > 1
                                ? extCopy.partSuffixFmt(dIdx + 1, authDiaryChunks.length)
                                : ""}
                            </span>
                          </div>
                          <div className="tr-doc-table-wrap">
                            <table className="tr-doc-table is-auth-diary">
                              <thead>
                                <tr>
                                  <th className="col-date">{extCopy.colDate}</th>
                                  <th className="col-hh-plot">{extCopy.colHhPlot}</th>
                                  <th className="col-act">{extCopy.colDiaryActivity}</th>
                                  <th className="col-status">{extCopy.colStatus}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dChunk.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="tr-doc-contrib-empty">
                                      {extCopy.emptyDiaries}
                                    </td>
                                  </tr>
                                ) : (
                                  dChunk.map((d, idx) => {
                                    const mrlFailed = Boolean(
                                      d.mrlStatus && d.mrlStatus !== "pass",
                                    );
                                    const compact = formatCompactDiaryEntry(
                                      d.activity,
                                      d.detail,
                                      lang,
                                    );
                                    const hasDistinctRecorder = Boolean(
                                      d.recorder &&
                                      d.recorder.trim() &&
                                      d.recorder.trim() !== (d.householdName || "").trim(),
                                    );
                                    const hhSubParts = [
                                      d.plotCode ? extCopy.plotRefFmt(d.plotCode) : null,
                                      hasDistinctRecorder
                                        ? extCopy.recordedByFmt(d.recorder.trim())
                                        : null,
                                    ].filter(Boolean);
                                    const statusTone = mrlFailed
                                      ? "is-danger"
                                      : d.isLateEntry
                                        ? "is-warn"
                                        : "is-ok";
                                    const statusText = mrlFailed
                                      ? extCopy.diaryWarn
                                      : d.isLateEntry
                                        ? extCopy.diaryLate
                                        : extCopy.diaryValid;

                                    return (
                                      <tr key={`${d.entryOn}-${d.plotCode}-${idx}`}>
                                        <td className="col-date is-tabular">
                                          {formatTraceDate(d.entryOn, lang)}
                                        </td>
                                        <td className="col-hh-plot">
                                          <strong className="tr-doc-item-title">
                                            {d.householdName || d.recorder || "-"}
                                          </strong>
                                          {hhSubParts.length > 0 && (
                                            <span className="tr-doc-item-sub is-tabular">
                                              {hhSubParts.join(", ")}
                                            </span>
                                          )}
                                        </td>
                                        <td className="col-act">
                                          <strong className="tr-doc-item-title">
                                            {compact.title}
                                          </strong>
                                          {compact.subtitle && (
                                            <span className="tr-doc-item-sub is-tabular">
                                              {compact.subtitle}
                                            </span>
                                          )}
                                          {isSafeMediaUrl(d.photoUrl) && (
                                            <button
                                              type="button"
                                              className="tr-doc-sub-btn no-print"
                                              onClick={() =>
                                                setTracePreviewMedia({
                                                  urls: [d.photoUrl as string],
                                                  title: d.householdName || extCopy.diariesTitle,
                                                  subtitle: `${formatTraceDate(d.entryOn, lang)}, ${compact.title}`,
                                                })
                                              }
                                            >
                                              {extCopy.viewFieldPhotoBtn}
                                            </button>
                                          )}
                                        </td>
                                        <td className={`col-status ${statusTone}`}>
                                          <span>{statusText}</span>
                                          {d.gpsVerified && (
                                            <span className="tr-doc-status-sub">
                                              {extCopy.gpsShort}
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ),
                    })),
                    ...authMinuteChunks.map((mChunk, mIdx): A4DossierSectionItem => ({
                      key: `auth-minutes-${mIdx}`,
                      content: (
                        <section className="tr-doc-ledger tr-doc-ext-block">
                          <div className="tr-doc-meta-strip">
                            <span className="tr-doc-meta-left">
                              {extCopy.minutesTitle}
                              {authMinuteChunks.length > 1
                                ? extCopy.partSuffixFmt(mIdx + 1, authMinuteChunks.length)
                                : ""}
                            </span>
                          </div>
                          <div className="tr-doc-table-wrap">
                            <table className="tr-doc-table is-auth-minutes">
                              <thead>
                                <tr>
                                  <th className="col-min-code">{extCopy.colMinuteCode}</th>
                                  <th className="col-date">{extCopy.colDate}</th>
                                  <th className="col-inspector">{extCopy.colInspectorLoc}</th>
                                  <th className="col-plot-ref">{extCopy.colPlotCode}</th>
                                  <th className="col-status">{extCopy.colResult}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mChunk.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="tr-doc-contrib-empty">
                                      {extCopy.emptyMinutes}
                                    </td>
                                  </tr>
                                ) : (
                                  mChunk.map((m) => {
                                    const isFail =
                                      m.result === "fail" ||
                                      m.result.toLowerCase().includes("không đạt");
                                    const locParts = [
                                      m.location || null,
                                      m.gpsVerified ? extCopy.gpsShort : null,
                                    ].filter(Boolean);
                                    return (
                                      <tr key={m.code}>
                                        <td className="col-min-code is-tabular">
                                          <strong>{m.code}</strong>
                                        </td>
                                        <td className="col-date is-tabular">
                                          {formatTraceDate(m.heldOn, lang)}
                                        </td>
                                        <td className="col-inspector">
                                          <strong className="tr-doc-item-title">
                                            {m.officer}
                                          </strong>
                                          {locParts.length > 0 && (
                                            <span className="tr-doc-item-sub">
                                              {locParts.join(", ")}
                                            </span>
                                          )}
                                          {isSafeMediaUrl(m.photoUrl) && (
                                            <button
                                              type="button"
                                              className="tr-doc-sub-btn no-print"
                                              onClick={() =>
                                                setTracePreviewMedia({
                                                  urls: [m.photoUrl as string],
                                                  title: m.code,
                                                  subtitle: m.location || undefined,
                                                })
                                              }
                                            >
                                              {extCopy.viewMinutePhotoBtn}
                                            </button>
                                          )}
                                        </td>
                                        <td className="col-plot-ref is-tabular">
                                          {m.plotCode || "-"}
                                        </td>
                                        <td
                                          className={`col-status ${isFail ? "is-danger" : "is-ok"}`}
                                        >
                                          {m.result === "pass"
                                            ? extCopy.labPass
                                            : m.result === "fail"
                                              ? extCopy.labFail
                                              : m.result}
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ),
                    })),
                    ...authViolationChunks.map((vChunk, vIdx): A4DossierSectionItem => ({
                      key: `auth-violations-${vIdx}`,
                      content: (
                        <section className="tr-doc-ledger tr-doc-ext-block">
                          <div className="tr-doc-meta-strip">
                            <span className="tr-doc-meta-left">
                              {extCopy.violationsTitle}
                              {authViolationChunks.length > 1
                                ? extCopy.partSuffixFmt(vIdx + 1, authViolationChunks.length)
                                : ""}
                            </span>
                          </div>
                          <div className="tr-doc-table-wrap">
                            <table className="tr-doc-table is-auth-violations">
                              <thead>
                                <tr>
                                  <th className="col-date">{extCopy.colDate}</th>
                                  <th className="col-vio-desc">{extCopy.colViolationDesc}</th>
                                  <th className="col-plot-ref">{extCopy.colPlotCode}</th>
                                  <th className="col-status">{extCopy.colSeverity}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {vChunk.map((v, idx) => {
                                  const isCrit = v.severity === "critical";
                                  return (
                                    <tr key={`${v.detectedOn}-${idx}`}>
                                      <td className="col-date is-tabular">
                                        {formatTraceDate(v.detectedOn, lang)}
                                      </td>
                                      <td className="col-vio-desc">
                                        <strong className="tr-doc-item-title">{v.title}</strong>
                                        {v.description && (
                                          <span className="tr-doc-item-sub">
                                            {v.description}
                                          </span>
                                        )}
                                      </td>
                                      <td className="col-plot-ref is-tabular">
                                        {v.plotCode || v.householdLabel || "-"}
                                      </td>
                                      <td
                                        className={`col-status ${isCrit ? "is-danger" : "is-muted"}`}
                                      >
                                        {isCrit ? extCopy.sevCritical : extCopy.sevWarning}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      ),
                    })),
                  ]
                  : []),
                {
                  key: "attestation",
                  content: (
                    <section className="tr-doc-attest-grid">
                      <div className="tr-doc-attest-col is-bordered">
                        <strong className="tr-doc-attest-heading">
                          {isPlotDossier ? plotCopy.certColHeading : docCopy.certColHeading}
                        </strong>
                        {isPlotDossier ? (
                          <>
                            <p>
                              {plotCopy.fieldRecordPrefix}:{" "}
                              {plotSb?.latestMinuteCode || plotCopy.fieldScheduleFallback}
                            </p>
                            <p>
                              {docCopy.labUnitPrefix}:{" "}
                              {firstLab
                                ? localizeLabName(firstLab.lab, lang)
                                : plotCopy.preHarvestSamplePending}
                            </p>
                            <p>
                              {docCopy.supervisionPrefix}:{" "}
                              {localizeInspectionNote(pub.farmingProcess.inspectionNote, lang)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p>
                              {docCopy.labUnitPrefix}:{" "}
                              {firstLab ? localizeLabName(firstLab.lab, lang) : t.lab.badgeUpdating}
                            </p>
                            <p>
                              {docCopy.labCertPrefix}: {firstLab ? firstLab.code : "-"}
                            </p>
                            <p>
                              {docCopy.supervisionPrefix}:{" "}
                              {localizeInspectionNote(pub.farmingProcess.inspectionNote, lang)}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="tr-doc-attest-col">
                        <strong className="tr-doc-attest-heading">
                          {isPlotDossier ? plotCopy.termsColHeading : docCopy.termsColHeading}
                        </strong>
                        <p>{isPlotDossier ? plotCopy.assuranceLine1 : docCopy.assuranceLine1}</p>
                        <p>{isPlotDossier ? plotCopy.assuranceLine2 : docCopy.assuranceLine2}</p>
                      </div>

                      <div className="tr-doc-sign-col">
                        <span className="tr-doc-sign-kicker">
                          {isPlotDossier ? plotCopy.issuerHeading : docCopy.issuerHeading}
                        </span>
                        <div className="tr-doc-qr-wrap">
                          {qrSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={qrSrc}
                              alt={getTraceQrAlt(activePrimaryCode, activeKind, lang)}
                              width={80}
                              height={80}
                              className="tr-doc-qr-img"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="tr-doc-qr-placeholder" aria-hidden="true" />
                          )}
                        </div>
                        <strong className="tr-doc-sign-org">{coopDisplay}</strong>
                        <span className="tr-doc-sign-code">{activePrimaryCode}</span>
                      </div>
                    </section>
                  ),
                },
              ];

              const renderPageFooter = (pageIdx: number, totalPages: number) => {
                const isLastPage = pageIdx === totalPages - 1;
                return (
                  <footer className="tr-doc-footer">
                    <div className="tr-doc-footer-bar">
                      <span>{t.footer.line2}</span>
                      <span>
                        {isLastPage
                          ? t.hero.verifiedAtFmt(
                            formatTraceDateTime(pub.verification.verifiedAt, lang),
                          )
                          : docCopy.continuedLabel}
                        {totalPages > 1
                          ? ` (${docCopy.pageIndicatorFmt(pageIdx + 1, totalPages)})`
                          : ""}
                      </span>
                    </div>
                  </footer>
                );
              };

              return (
                <>
                  <PaginatedA4Dossier
                    status={pub.lotIdentity.status}
                    measureKey={dossierMeasureKey}
                    headerFull={headerFullNode}
                    headerContinuation={headerContNode}
                    sections={dossierSections}
                    renderFooter={renderPageFooter}
                  />

                  {/* THANH THAO TÁC NGOÀI TỜ A4 (NẰM TRONG KHUNG TRUY XUẤT, KHÔNG LÀM LỆCH BỐ CỤC CHỨNG TỪ A4) */}
                  <div className="tr-doc-external-bar no-print">
                    <div className="tr-doc-ext-group">
                      <button
                        type="button"
                        className="tr-doc-act-btn"
                        onClick={() => setShowZoneMap((v) => !v)}
                      >
                        {showZoneMap ? docCopy.hideMapBtn : docCopy.showMapBtn}
                      </button>
                      {firstLab && isSafeMediaUrl(firstLab.scanUrl) && (
                        <a
                          href={firstLab.scanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tr-doc-act-btn"
                        >
                          {docCopy.viewLabScanLabel}
                        </a>
                      )}
                      {firstLab &&
                        !isSafeMediaUrl(firstLab.scanUrl) &&
                        isSafeExternalHttpsUrl(firstLab.externalVerifyUrl) && (
                          <a
                            href={firstLab.externalVerifyUrl.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                            className="tr-doc-act-btn"
                          >
                            {docCopy.verifyLabPortalLabel}
                          </a>
                        )}
                    </div>

                    <div className="tr-doc-actions">
                      <button type="button" className="tr-doc-act-btn" onClick={handlePrint}>
                        {t.actions.print}
                      </button>
                      <button type="button" className="tr-doc-act-btn" onClick={handleShare}>
                        {copied ? t.actions.copied : t.actions.share}
                      </button>
                    </div>
                  </div>

                  {showZoneMap && (
                    <div className="tr-doc-external-map no-print">
                      <CoarseZoneOverviewMap
                        centerLat={pub.growingZone.coarseMap.centerLat}
                        centerLng={pub.growingZone.coarseMap.centerLng}
                        radiusMeters={pub.growingZone.coarseMap.radiusMeters}
                        zoom={pub.growingZone.coarseMap.zoom}
                        label={pub.growingZone.coarseMap.label}
                        privacyNote={pub.growingZone.coarseMap.privacyNote}
                        pucCode={pub.growingZone.pucCode}
                        adminLocation={localizeAdminLocation(pub.growingZone.adminLocation, lang)}
                        lang={lang}
                      />
                    </div>
                  )}

                  {data.fieldAuditData && (
                    <div className="tr-doc-external-audit no-print">
                      <FieldAuditGpsCheckCard
                        scannedCode={pub.lotIdentity.scannedCode || code}
                        data={data.fieldAuditData}
                        auditPass={auditPass}
                        isAuthenticated={ac.isAuthenticated}
                        lang={lang}
                        formatDate={formatTraceDate}
                        formatDateTime={formatTraceDateTime}
                      />
                    </div>
                  )}
                </>
              );
            })()}

            <TraceAccessRequestBanner
              scannedCode={pub.lotIdentity.scannedCode || code}
              lang={lang}
              actualTier={ac.actualTier}
              isAuthenticated={ac.isAuthenticated}
              fieldAuditPassActive={Boolean(ac.fieldAuditPass?.active)}
              loginHref={loginWithNextHref}
              auditPassInput={auditPassInput}
              onAuditPassInputChange={setAuditPassInput}
              onApplyAuditPass={handleApplyAuditPass}
              switchingTier={switchingTier}
              defaultRequesterName={ac.viewerName}
              externalOpenTrigger={openAccessReqCount}
              onGrantActivated={handleGrantActivated}
            />
          </>
        ) : null}
      </main>

      {/* ─── Modal Bản Đồ Vệ Tinh Ranh Giới GIS Thửa Đất (Dành riêng Cấp 3 Cơ quan quản lý) ─── */}
      {gisModalPlot && (
        <PlotMapModal
          plot={gisModalPlot.plot}
          householdName={gisModalPlot.householdName}
          onClose={() => setGisModalPlot(null)}
        />
      )}

      {tracePreviewMedia && (
        <MediaBottomSheet
          urls={tracePreviewMedia.urls}
          title={tracePreviewMedia.title}
          subtitle={tracePreviewMedia.subtitle}
          onClose={() => setTracePreviewMedia(null)}
        />
      )}
    </div>
  );
}
