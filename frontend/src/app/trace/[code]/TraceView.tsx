"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { MediaBottomSheet } from "@/components/ui/MediaBottomSheet";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ROLE_LABELS } from "@/constants/roles";
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
  MapPin,
} from "@/components/ui/PublicIcon";
import type { FieldAuditDataPayload } from "./FieldAuditGpsCheckCard";
import {
  TRACE_UI_COPY,
  detectInitialTraceLang,
  persistTraceLang,
  formatTraceDate,
  formatTraceDateTime,
  formatTraceNumber,
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
  localizeInspectionNote,
  localizeTimelineStep,
  type TraceLang,
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

interface TraceGovernancePayload {
  governmentEndorsement: {
    programTitle: string;
    directiveNo: string;
    communeAuthority: string;
    provincialAuthority: string;
    officialPortalUrl: string | null;
    officialDomain: string;
    inspectionUnit: string;
  };
  threePartyAttestation: Array<{
    partyOrder: number;
    partyKey: string;
    roleLabel: string;
    actorName: string;
    status: "verified" | "warning" | "pending" | "active" | "review" | string;
    evidenceCode: string;
    verifiedOn: string | null;
    summary: string;
  }>;
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
  governance?: TraceGovernancePayload | null;
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

interface TraceData {
  verifiedAt: string;
  accessControl: TraceAccessControl;
  isFarmerStamp?: boolean;
  isPlotSignboard?: boolean;
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
    inquiryHeading: string;
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
    colStage: "HẠNG MỤC MINH BẠCH VÀ CHỨNG TỪ",
    colUnit: "ĐƠN VỊ XÁC NHẬN",
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
        ? `Phiếu ${code}: Đạt chuẩn kim loại nặng, không phát hiện Vàng O, dư lượng thuốc BVTV an toàn`
        : `Phiếu ${code}: Phát hiện chỉ tiêu cần kiểm tra lại trước khi lưu thông`,
    viewLabScanLabel: "Xem bản scan phiếu kiểm nghiệm",
    verifyLabPortalLabel: "Đối chiếu tại đơn vị kiểm nghiệm",
    certColHeading: "Hồ sơ Kiểm nghiệm và Vùng trồng:",
    labUnitPrefix: "Đơn vị kiểm nghiệm",
    labCertPrefix: "Mã phiếu",
    supervisionPrefix: "Giám sát",
    showMapBtn: "Xem bản đồ khái quát vùng trồng",
    hideMapBtn: "Thu gọn bản đồ vùng trồng",
    termsColHeading: "Cam kết Chất lượng và Xuất xứ:",
    assuranceLine1:
      "Sản phẩm thu hoạch đúng độ chín từ vùng trồng thành viên đã cấp mã số định danh, canh tác theo quy trình VietGAP và tuân thủ thời gian cách ly an toàn.",
    assuranceLine2:
      "Thông tin trên phiếu được công bố sau khi Hợp tác xã Cư Né đối chiếu nhật ký chăm sóc vườn, phiếu kiểm nghiệm an toàn thực phẩm và hồ sơ xuất xưởng.",
    issuerHeading: "ĐƠN VỊ XÁC THỰC",
    inquiryHeading: "Đối chiếu hồ sơ gốc?",
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
    colStage: "TRANSPARENCY STAGE & EVIDENCE",
    colUnit: "RESPONSIBLE UNIT",
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
    showMapBtn: "Show growing zone map",
    hideMapBtn: "Hide growing zone map",
    termsColHeading: "Origin & Quality Commitment:",
    assuranceLine1:
      "Harvested at proper maturity from registered member orchards cultivated under VietGAP standards and safe pre-harvest withdrawal periods.",
    assuranceLine2:
      "Information on this dossier is published after Cư Né Cooperative verifies orchard care logs, food safety test reports, and dispatch records.",
    issuerHeading: "ISSUING COOPERATIVE",
    inquiryHeading: "Verification Inquiry?",
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
    colStage: "透明溯源环节与凭证",
    colUnit: "责任单位",
    colDate: "记录日期",
    colResult: "核验结论",
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
    showMapBtn: "展开产区概略地图",
    hideMapBtn: "收起产区地图",
    termsColHeading: "原产地与品质承诺:",
    assuranceLine1:
      "采自已获注册编码的合作社成员果园，严格执行良好农业规范 (VietGAP) 与采前安全间隔期管理。",
    assuranceLine2:
      "本单所列信息均经 Cư Né 合作社核对果园管护台账、食品安全检测报告及出厂单证后正式发布。",
    issuerHeading: "签发合作社",
    inquiryHeading: "溯源档案核实联系",
  },
};

const A4_SHEET_WIDTH_PX = 820;

function A4DossierStage({
  status,
  children,
}: {
  status: string;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<{ scale: number; scaledHeight: number | null }>({
    scale: 1,
    scaledHeight: null,
  });

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const sheet = sheetRef.current;
    if (!stage || !sheet) return;

    let printing = false;

    const measure = () => {
      if (printing) return;
      const availWidth = stage.clientWidth;
      if (availWidth <= 0) return;

      if (availWidth >= A4_SHEET_WIDTH_PX) {
        setLayout((prev) =>
          prev.scale === 1 && prev.scaledHeight === null
            ? prev
            : { scale: 1, scaledHeight: null },
        );
        return;
      }

      const nextScale = availWidth / A4_SHEET_WIDTH_PX;
      const naturalHeight = sheet.offsetHeight;
      const nextHeight = Math.ceil(naturalHeight * nextScale);

      setLayout((prev) =>
        Math.abs(prev.scale - nextScale) < 0.0004 && prev.scaledHeight === nextHeight
          ? prev
          : { scale: nextScale, scaledHeight: nextHeight },
      );
    };

    const onBeforePrint = () => {
      printing = true;
      setLayout({ scale: 1, scaledHeight: null });
    };

    const onAfterPrint = () => {
      printing = false;
      measure();
    };

    measure();

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;
    ro?.observe(stage);
    ro?.observe(sheet);
    window.addEventListener("resize", measure);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, []);

  const isScaled = layout.scale < 0.9995 && layout.scaledHeight !== null;

  return (
    <div
      ref={stageRef}
      className={`tr-doc-a4-stage${isScaled ? " is-scaled" : ""}`}
      style={isScaled ? { height: `${layout.scaledHeight}px` } : undefined}
    >
      <article
        ref={sheetRef}
        className="tr-doc-sheet"
        data-status={status}
        style={
          isScaled
            ? {
                transform: `scale(${layout.scale})`,
                transformOrigin: "top left",
              }
            : undefined
        }
      >
        {children}
      </article>
    </div>
  );
}

function resolveSearchNavigationHref(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed || /^\.+$/.test(trimmed)) return null;

  const tokenPathMatch = /(?:^|\/)t\/([A-Za-z0-9_-]{6,64})(?:[/?#]|$)/.exec(trimmed);
  if (tokenPathMatch?.[1] && !/^\.+$/.test(tokenPathMatch[1]) && isSafeTraceCode(tokenPathMatch[1])) {
    return `/t/${encodeURIComponent(tokenPathMatch[1])}`;
  }

  const tracePathMatch = /(?:^|\/)trace\/([^/?#\s]+)(?:[/?#]|$)/.exec(trimmed);
  if (tracePathMatch?.[1]) {
    const extracted = safeDecodeURIComponent(tracePathMatch[1]).trim();
    if (!extracted || /^\.+$/.test(extracted) || !isSafeTraceCode(extracted)) return null;
    return `/trace/${encodeURIComponent(extracted)}`;
  }

  if (/^[A-Za-z0-9]{12,24}$/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z0-9]/.test(trimmed)) {
    return `/t/${encodeURIComponent(trimmed)}`;
  }

  if (!isSafeTraceCode(trimmed)) return null;
  return `/trace/${encodeURIComponent(trimmed)}`;
}

/** Phân loại biểu tượng tròn cho từng dòng Nhật ký canh tác ở Cấp 3 (Cơ quan quản lý). */
function classifyDiaryVisual(entry: TraceDiaryEntry): {
  tone: "spray" | "fertilizer" | "prune" | "water" | "care";
  icon: React.ReactNode;
} {
  const act = (entry.activity || "").toLowerCase();
  if (entry.kind === "spray" || /phun|thuốc|bvtv|trừ sâu|trừ nấm|phòng bệnh|diệt khuẩn/.test(act)) {
    return {
      tone: "spray",
      icon: (
        <img
          src="/icons/diary-spray.svg"
          width={21}
          height={21}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      ),
    };
  }

  if (/bón|phân|hữu cơ|npk|vi sinh|humic|vôi|dinh dưỡng/.test(act)) {
    return {
      tone: "fertilizer",
      icon: (
        <img
          src="/icons/diary-fertilizer.svg"
          width={21}
          height={21}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      ),
    };
  }

  if (/cắt cỏ|làm cỏ|dọn vườn|vệ sinh|tỉa|cành|tạo tán|rong cành/.test(act)) {
    return {
      tone: "prune",
      icon: (
        <img
          src="/icons/diary-prune.svg"
          width={20}
          height={20}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      ),
    };
  }

  if (/tưới|nước|giữ ẩm/.test(act)) {
    return {
      tone: "water",
      icon: (
        <img
          src="/icons/diary-water.svg"
          width={20}
          height={20}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      ),
    };
  }

  return {
    tone: "care",
    icon: (
      <img
        src="/icons/diary-care.svg"
        width={20}
        height={20}
        alt=""
        loading="lazy"
        decoding="async"
        aria-hidden="true"
      />
    ),
  };
}

/** Khối Nhật ký canh tác & Phun thuốc BVTV dành riêng cho Cấp 3 (Cơ quan quản lý). */
function AuthorityDiarySection({ diaries }: { diaries: TraceDiaryEntry[] }) {
  const [previewMedia, setPreviewMedia] = useState<{
    urls: string[];
    title: string;
    subtitle?: string;
  } | null>(null);

  return (
    <section className="tr-card tr-puc-journal-card">
      <div className="tr-puc-journal-head">
        <h3 className="tr-puc-journal-title">Nhật ký canh tác và phun thuốc BVTV chi tiết</h3>
        {diaries.length > 0 && <span className="tr-count-badge">{diaries.length} bản ghi</span>}
      </div>
      <p className="tr-card-sub">
        Lưu vết tên thuốc bảo vệ thực vật, liều lượng sử dụng, số ngày cách ly an toàn và người ghi chép thực tế tại hộ.
      </p>

      {diaries.length === 0 ? (
        <div className="tr-farmer-empty">Chưa ghi nhận nhật ký canh tác hoặc đợt phun thuốc nào của các hộ nguồn.</div>
      ) : (
        <div className="tr-proof-timeline" role="list">
          {diaries.map((d, idx) => {
            const visual = classifyDiaryVisual(d);
            const isLast = idx === diaries.length - 1;
            const mrlFailed = d.mrlStatus && d.mrlStatus !== "pass";
            return (
              <div key={idx} className="tr-proof-item" role="listitem">
                <div className="tr-proof-track" aria-hidden="true">
                  <div className={`tr-proof-icon-circle is-${visual.tone}`}>{visual.icon}</div>
                  {!isLast && <div className={`tr-proof-stem is-${visual.tone}`} />}
                </div>
                <div className="tr-proof-body">
                  <strong className="tr-proof-heading">
                    <span className="tr-proof-date">{formatTraceDate(d.entryOn, "vi")}</span>
                    <span className="tr-proof-sep">-</span>
                    <span>{d.activity}</span>
                  </strong>
                  {d.detail && <p className="tr-proof-detail">{d.detail}</p>}
                  <div className="tr-proof-meta">
                    {d.householdName && <span>Hộ: {d.householdName}</span>}
                    {d.plotCode && <span>Mã lô vườn: {d.plotCode}</span>}
                    {d.mrlStatus && (
                      <span className={mrlFailed ? "tr-proof-warn-tag" : "tr-proof-safe-tag"}>
                        {mrlFailed ? "Cảnh báo dư lượng" : "Đạt ngưỡng an toàn"}
                      </span>
                    )}
                    {d.isLateEntry ? (
                      <span className="tr-proof-warn-tag">Ghi bổ sung muộn</span>
                    ) : (
                      <span className="tr-proof-safe-tag">Ghi đúng hạn</span>
                    )}
                    {d.gpsVerified && <span className="tr-proof-safe-tag">Khớp GPS thửa</span>}
                    {isSafeMediaUrl(d.photoUrl) && (
                      <button
                        type="button"
                        className="tr-inline-link"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                        onClick={() =>
                          setPreviewMedia({
                            urls: [d.photoUrl as string],
                            title: d.householdName || "Ảnh hiện trường",
                            subtitle: `${formatTraceDate(d.entryOn, "vi")}, ${d.activity}`,
                          })
                        }
                      >
                        Xem ảnh hiện trường
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {previewMedia && (
        <MediaBottomSheet
          urls={previewMedia.urls}
          title={previewMedia.title}
          subtitle={previewMedia.subtitle}
          onClose={() => setPreviewMedia(null)}
        />
      )}
    </section>
  );
}

const AUDIT_PASS_SESSION_KEY = "puc_audit_pass";

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
    const fromQuery = new URLSearchParams(window.location.search).get("auditPass")?.trim();
    if (fromQuery && /^[A-Za-z0-9_-]{4,80}$/.test(fromQuery)) {
      window.sessionStorage.setItem(AUDIT_PASS_SESSION_KEY, fromQuery);
      return fromQuery;
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
  const [data, setData] = useState<TraceData | null>(null);
  const [selectedView, setSelectedView] = useState<ViewerTier | null>(() => readInitialViewParam());
  const [auditPass, setAuditPass] = useState<string | null>(() => readInitialAuditPass());
  const [auditPassInput, setAuditPassInput] = useState("");
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
      const pass = readInitialAuditPass();
      setAuditPass((prev) => (prev === pass ? prev : pass));
      const nextView = readInitialViewParam();
      setSelectedView((prev) => (prev === nextView ? prev : nextView));
      scrubAuditPassFromBrowserUrl();
    };
    const rafId = window.requestAnimationFrame(syncFromUrl);
    scrubAuditPassFromBrowserUrl();

    window.addEventListener(PUC_URL_SYNC_EVENT, syncFromUrl);
    window.addEventListener("hashchange", syncFromUrl);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener(PUC_URL_SYNC_EVENT, syncFromUrl);
      window.removeEventListener("hashchange", syncFromUrl);
    };
  }, [pathname]);

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
    setAuditPass(cleaned);
    setAuditPassInput("");
  };

  const handleClearAuditPass = () => {
    try {
      window.sessionStorage.removeItem(AUDIT_PASS_SESSION_KEY);
      if (typeof window !== "undefined") {
        const nextUrl = new URL(window.location.href);
        if (nextUrl.searchParams.has("auditPass")) {
          nextUrl.searchParams.delete("auditPass");
          replaceUrlPreservingState(nextUrl.pathname + nextUrl.search + nextUrl.hash);
        }
      }
    } catch {
      // Bỏ qua lỗi xóa sessionStorage
    }
    setSwitchingTier(true);
    setAuditPass(null);
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
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [code, resolvedQrToken]);

  useEffect(() => {
    if (!code) return;
    let active = true;
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

    const qs = new URLSearchParams();
    if (selectedView) qs.set("view", selectedView);
    const querySuffix = qs.toString() ? `?${qs.toString()}` : "";
    const encodedCode = encodeURIComponent(code);
    const preferAuthenticatedEndpoint =
      authStatus === "authenticated" || Boolean(data?.accessControl?.isAuthenticated);
    const primaryUrl = preferAuthenticatedEndpoint
      ? `/api/trace/${encodedCode}${querySuffix}`
      : `/api/public/trace/${encodedCode}${querySuffix}`;
    const reqHeaders: HeadersInit | undefined = auditPass
      ? { "x-audit-pass": auditPass }
      : undefined;

    fetch(primaryUrl, {
      credentials: "include",
      headers: reqHeaders,
      signal: controller.signal,
    })
      .then((res) => {
        if (res.status === 401 && preferAuthenticatedEndpoint) {
          return fetch(`/api/public/trace/${encodedCode}${querySuffix}`, {
            credentials: "include",
            headers: reqHeaders,
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
  }, [code, selectedView, auditPass, authStatus]);

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

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    const prevTitle = document.title;
    const refLabel = data?.publicData?.lotIdentity?.lotCode || code || "PUC";
    const safeCode = refLabel.replace(/[^a-zA-Z0-9_-]+/g, "-");
    document.title = `Ho-so-truy-xuat-${safeCode}`;
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

  const t = TRACE_UI_COPY[lang];
  const pub = data?.publicData;
  const ac = data?.accessControl;

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

  // Mã chữ dự phòng của đơn vị thùng / quả (để kiểm tra khi tem trầy xước - 4b)
  const fallbackUnitSerial = pub
    ? data?.item?.serialCode ||
      data?.farmerStamp?.serialCode ||
      (pub.lotIdentity.scannedCode.toUpperCase() !== pub.lotIdentity.lotCode.toUpperCase() &&
      pub.lotIdentity.scannedCode !== pub.lotIdentity.qrToken
        ? pub.lotIdentity.scannedCode
        : null)
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
            <Link href={loginWithNextHref} className="tr-partner-login-btn">
              <span>{t.authHint.compactBtn}</span>
            </Link>
          )}
        </div>

        {loading ? (
          <SkeletonCards count={3} label={t.loadingLabel} />
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

            {!ac.fieldAuditPass?.active && data.isPlotSignboard && (
              <section
                className="tr-pass-prompt-card no-print is-featured"
                aria-label={t.fieldAudit.passPromptTitle}
              >
                <div className="tr-pass-prompt-copy">
                  <strong className="tr-pass-prompt-title">{t.fieldAudit.passPromptTitle}</strong>
                  <p className="tr-pass-prompt-desc">{t.fieldAudit.passPromptDesc}</p>
                </div>
                <form className="tr-pass-form" onSubmit={handleApplyAuditPass}>
                  <input
                    type="text"
                    className="tr-pass-input"
                    value={auditPassInput}
                    onChange={(e) => setAuditPassInput(e.target.value)}
                    placeholder={t.fieldAudit.passInputPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    className="tr-pass-submit-btn"
                    disabled={switchingTier || !auditPassInput.trim()}
                  >
                    {t.fieldAudit.passApplyBtn}
                  </button>
                </form>
              </section>
            )}

            {/* ─── Thông báo từ chối chi tiết khi tài khoản đã đăng nhập nhưng lô nằm ngoài phạm vi quản lý (Mục 2 & Mục 5) ─── */}
            {ac.isAuthenticated && ac.scopeDenied && (
              <section className="tr-alert-banner is-warn tr-scope-denied-banner no-print" role="status">
                <div className="tr-scope-denied-main">
                  <div className="tr-alert-banner-head">
                    <Lock size={18} strokeWidth={2.3} aria-hidden="true" />
                    <strong>
                      {lang === "vi" && ac.scopeDeniedMessage
                        ? ac.scopeDeniedMessage
                        : t.scopeAccess.deniedTitle}
                    </strong>
                  </div>
                  <p className="tr-alert-banner-desc">
                    {t.scopeAccess.deniedDesc(
                      ac.viewerName || "Người dùng",
                      ac.viewerRole ? ROLE_LABELS[ac.viewerRole] : ac.viewerTierLabel,
                      lang === "vi" ? (ac.scopeReason ?? null) : null,
                    )}
                  </p>
                </div>
                <button type="button" className="tr-scope-switch-btn" onClick={() => void handleSwitchAccount()}>
                  {t.scopeAccess.switchAccountBtn}
                </button>
              </section>
            )}

            {/* ─── Thanh điều khiển Cấp độ Truy xuất mở rộng (Dành cho Doanh nghiệp & Cơ quan quản lý đã đăng nhập đúng phạm vi) ─── */}
            {ac.actualTier !== "public" && (
              <section className="tr-tier-bar no-print" aria-label="Chuyển đổi cấp độ truy xuất">
                <div className="tr-tier-bar-info">
                  <div className="tr-tier-role-line">
                    <ShieldCheck size={16} strokeWidth={2.2} className="tr-tier-icon" aria-hidden="true" />
                    <span>
                      Tài khoản: <strong>{ac.viewerName || "Cán bộ"}</strong> (
                      {ac.viewerRole ? ROLE_LABELS[ac.viewerRole] : ac.viewerTierLabel})
                    </span>
                  </div>
                  <span className="tr-tier-audit-note">
                    {ac.auditLogged
                      ? "Lượt xem mở rộng này đã được ghi nhận vào nhật ký kiểm toán hệ thống."
                      : "Đang xem ở chế độ giao diện công khai dành cho người tiêu dùng."}
                  </span>
                </div>

                <div className="tr-tier-switch" role="tablist" aria-label="Chọn cấp độ hiển thị">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={ac.viewerTier === "public"}
                    disabled={switchingTier}
                    className={`tr-tier-btn ${ac.viewerTier === "public" ? "is-active" : ""}`}
                    onClick={() => handleSelectTier("public")}
                  >
                    1. Công khai
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={ac.viewerTier === "enterprise"}
                    disabled={switchingTier}
                    className={`tr-tier-btn ${ac.viewerTier === "enterprise" ? "is-active" : ""}`}
                    onClick={() => handleSelectTier("enterprise")}
                  >
                    2. Doanh nghiệp
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
                      3. Cơ quan quản lý
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* ─── Cảnh báo Thu hồi / Tạm dừng / Chống giả (nếu có) ─── */}
            {pub.lotIdentity.status === "revoked" && (
              <section className="tr-alert-banner is-danger" role="alert">
                <div className="tr-alert-banner-head">
                  <ShieldAlert size={19} strokeWidth={2.3} aria-hidden="true" />
                  <strong>{t.alerts.revokedTitle}</strong>
                </div>
                <p className="tr-alert-banner-desc">
                  {lang === "vi" && pub.lotIdentity.revokedReason
                    ? pub.lotIdentity.revokedReason
                    : t.alerts.revokedDefaultDesc}
                </p>
              </section>
            )}

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
              pub.verification.warningReason === "high_frequency") && (
              <section className="tr-alert-banner is-warn" role="alert">
                <div className="tr-alert-banner-head">
                  <AlertTriangle size={19} strokeWidth={2.3} aria-hidden="true" />
                  <strong>
                    {pub.verification.warningReason === "multi_country"
                      ? t.alerts.multiCountryTitle
                      : t.alerts.highFreqTitle}
                  </strong>
                </div>
                <p className="tr-alert-banner-desc">
                  {pub.verification.warningReason === "multi_country"
                    ? t.alerts.multiCountryDesc(
                        pub.verification.distinctCountries24h ||
                          (pub.verification.countries24h?.length ?? 2),
                        (pub.verification.countries24h || []).join(", "),
                      )
                    : t.alerts.highFreqDesc(
                        pub.verification.scansLast24h,
                        pub.verification.distinctSources24h || 1,
                      )}
                </p>
              </section>
            )}

            {/* ─── HỒ SƠ THẨM ĐỊNH THỰC ĐỊA THỬA ĐẤT & ĐỐI CHỨNG GPS TẠI VƯỜN (NẾU QUÉT BẢNG QR THỬA) ─── */}
            {data.fieldAuditData && (
              <FieldAuditGpsCheckCard
                scannedCode={pub.lotIdentity.scannedCode || code}
                data={data.fieldAuditData}
                auditPass={auditPass}
                isAuthenticated={ac.isAuthenticated}
                lang={lang}
                formatDate={formatTraceDate}
                formatDateTime={formatTraceDateTime}
              />
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════
               PHIẾU HỒ SƠ MINH BẠCH LÔ HÀNG (BỐ CỤC CHỨNG TỪ / HÓA ĐƠN CHUẨN THỤY SĨ)
               ═══════════════════════════════════════════════════════════════════════════ */}
            {(() => {
              const docCopy = DOSSIER_SHEET_COPY[lang];
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

              const scaleDisplay =
                pub.lotIdentity.itemWeightKg !== null
                  ? `${formatTraceNumber(pub.lotIdentity.itemWeightKg, lang)} kg${
                      pub.lotIdentity.itemGrade
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

              const localizedVariety = localizeVariety(pub.lotIdentity.variety, lang);
              const scaleSubline =
                pub.lotIdentity.itemWeightKg === null && pub.lotIdentity.weightTons > 0
                  ? `${formatTraceNumber(pub.lotIdentity.weightTons, lang)} ${docCopy.tonsUnit}, ${localizedVariety}`
                  : localizedVariety;

              const lotStatusTone =
                pub.lotIdentity.status === "revoked"
                  ? "is-danger"
                  : pub.lotIdentity.status === "pending" || pub.lotIdentity.status === "unverified"
                    ? "is-warn"
                    : "is-ok";

              return (
                <>
                  <A4DossierStage status={pub.lotIdentity.status}>
                    {/* 1. ĐẦU CHỨNG TỪ: ĐƠN VỊ SẢN XUẤT (TRÁI) <-> TIÊU ĐỀ & NGÀY XÁC THỰC (PHẢI) */}
                  <header className="tr-doc-head">
                    <div className="tr-doc-brand">
                      <div className="tr-doc-logo-box" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/newlogo.png"
                          alt=""
                          width={28}
                          height={28}
                          className="tr-doc-logo-img"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div className="tr-doc-brand-copy">
                        <strong className="tr-doc-org-name">
                          {localizeCoopName(pub.producer.cooperativeName, lang)}
                        </strong>
                        <span className="tr-doc-org-sub">
                          {localizeAdminLocation(pub.growingZone.adminLocation, lang)}
                        </span>
                      </div>
                    </div>

                    <div className="tr-doc-title-block">
                      <h1 className="tr-doc-main-title">{docCopy.docTitle}</h1>
                      <div className="tr-doc-date-line">
                        {docCopy.verifiedDatePrefix}{" "}
                        <span>{formatTraceDate(pub.verification.verifiedAt, lang)}</span>
                      </div>
                    </div>
                  </header>

                  {/* 2. KHỐI NỀN XÁM 2 CỘT: VÙNG TRỒNG NGUỒN (TRÁI) | ĐÓNG GÓI VÀ XUẤT KHẨU (PHẢI) */}
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
                          {pub.producer.consentedHouseholds.length > 0
                            ? `${docCopy.farmersPrefix}: ${pub.producer.consentedHouseholds.join(", ")}`
                            : t.producerPackhouse.representedByCoop}
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
                        <span>
                          {t.processPhyto.standardValue}
                        </span>
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

                  {/* 3. DÒNG ĐỊNH DANH SẢN PHẨM / MÃ LÔ & BẢNG SỔ CÁI MINH BẠCH 5 KHÂU */}
                  <section className="tr-doc-ledger" aria-label={t.timeline.ariaLabel}>
                    <div className="tr-doc-meta-strip">
                      <span className="tr-doc-meta-left">
                        {docCopy.productMetaPrefix}:{" "}
                        {localizeProductName(
                          pub.lotIdentity.productName,
                          pub.lotIdentity.traceUnit,
                          lang,
                        )}{" "}
                        ({localizedVariety})
                      </span>
                      <strong className="tr-doc-meta-right">
                        {docCopy.lotNoPrefix}: {pub.lotIdentity.lotCode}
                        {fallbackUnitSerial &&
                        fallbackUnitSerial.toUpperCase() !== pub.lotIdentity.lotCode.toUpperCase()
                          ? ` / ${docCopy.unitSerialPrefix}: ${fallbackUnitSerial}`
                          : ""}
                      </strong>
                    </div>

                    <div className="tr-doc-table-wrap">
                      <table className="tr-doc-table">
                        <thead>
                          <tr>
                            <th className="col-no">{docCopy.colNo}</th>
                            <th className="col-desc">{docCopy.colStage}</th>
                            <th className="col-unit">{docCopy.colUnit}</th>
                            <th className="col-date">{docCopy.colDate}</th>
                            <th className="col-status">{docCopy.colResult}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pub.timeline.map((st) => {
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
                            });
                            const isLabStep = st.step === 4 || st.key.includes("lab") || st.key.includes("test");
                            const isExportStep = st.step === 5 || st.key.includes("export") || st.key.includes("phyto");

                            return (
                              <tr key={st.key}>
                                <td className="col-no">{String(st.step).padStart(2, "0")}.</td>
                                <td className="col-desc">
                                  <strong className="tr-doc-item-title">{localizedStep.title}</strong>
                                  <span className="tr-doc-item-sub">{localizedStep.detail}</span>

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
                                            <span>{docCopy.labReportLineFmt(lt.code, ltPassed)}</span>
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
                                <td className="col-date">{formatTraceDate(st.date, lang)}</td>
                                <td className={`col-status ${statusTone}`}>{statusLabel}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* 4. KHỐI TỔNG KẾT CHỈ TIÊU AN TOÀN & KHỐI LƯỢNG (TRÁI Ô GẠCH CHÉO, PHẢI BẢNG ĐỐI SOÁT) */}
                  <section className="tr-doc-summary-split">
                    <div className="tr-doc-total-box">
                      <span className="tr-doc-total-label">
                        {pub.lotIdentity.itemWeightKg !== null
                          ? docCopy.unitWeightHeading
                          : docCopy.lotScaleHeading}
                      </span>
                      <div className="tr-doc-hatch-box">
                        <strong className="tr-doc-hatch-val">{scaleDisplay}</strong>
                        <span className="tr-doc-hatch-sub">{scaleSubline}</span>
                      </div>
                    </div>

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
                            ? firstLab.result !== "pass" || (firstLab.chlorpyrifosMgKg ?? 0) > 0.01
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
                          {mb && !mb.withinQuota ? docCopy.overQuotaText : docCopy.withinQuotaText}
                        </dd>
                      </div>
                      <div className="tr-doc-kv-row">
                        <dt>{docCopy.rowPhytosanitary}</dt>
                        <dd>
                          {pub.phytosanitary.certNo ||
                            (lang === "vi"
                              ? pub.phytosanitary.statusLabel
                              : t.processPhyto.phytoDefaultPending)}
                        </dd>
                      </div>
                      <div className="tr-doc-kv-row is-grand">
                        <dt>{docCopy.rowFinalStatus}</dt>
                        <dd className={lotStatusTone}>
                          {localizeLotStatusLabel(
                            pub.lotIdentity.status,
                            pub.lotIdentity.statusLabel,
                            lang,
                          )}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  {/* 5. BA CỘT CHỨNG THỰC CUỐI TRANG: KIỂM NGHIỆM | CAM KẾT XUẤT XỨ | MÃ QR & ĐƠN VỊ */}
                  <section className="tr-doc-attest-grid">
                    <div className="tr-doc-attest-col is-bordered">
                      <strong className="tr-doc-attest-heading">{docCopy.certColHeading}</strong>
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
                    </div>

                    <div className="tr-doc-attest-col">
                      <strong className="tr-doc-attest-heading">{docCopy.termsColHeading}</strong>
                      <p>{docCopy.assuranceLine1}</p>
                      <p>{docCopy.assuranceLine2}</p>
                    </div>

                    <div className="tr-doc-sign-col">
                      <span className="tr-doc-sign-kicker">{docCopy.issuerHeading}</span>
                      <div className="tr-doc-qr-wrap">
                        {qrSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={qrSrc}
                            alt={t.hero.qrAlt(pub.lotIdentity.lotCode)}
                            width={84}
                            height={84}
                            className="tr-doc-qr-img"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="tr-doc-qr-placeholder" aria-hidden="true" />
                        )}
                      </div>
                      <strong className="tr-doc-sign-org">
                        {localizeCoopName(pub.producer.cooperativeName, lang)}
                      </strong>
                      <span className="tr-doc-sign-code">{pub.lotIdentity.lotCode}</span>
                    </div>
                  </section>

                  {/* 6. CHÂN PHIẾU: LIÊN HỆ ĐỐI CHIẾU & THỜI ĐIỂM TRA CỨU */}
                  <footer className="tr-doc-footer">
                    <div className="tr-doc-footer-top">
                      <div className="tr-doc-inquiry">
                        <strong>{docCopy.inquiryHeading}</strong>
                        <p>{t.footer.line1}</p>
                      </div>
                    </div>

                    <div className="tr-doc-footer-bar">
                      <span>{t.footer.line2}</span>
                      <span>
                        {t.hero.verifiedAtFmt(
                          formatTraceDateTime(pub.verification.verifiedAt, lang),
                        )}
                      </span>
                    </div>
                  </footer>
                  </A4DossierStage>

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
                </>
              );
            })()}

            {/* ═══════════════════════════════════════════════════════════════════════════
               CẤP ĐỘ 2: HỒ SƠ MỞ RỘNG DOANH NGHIỆP / CƠ SỞ ĐÓNG GÓI (enterpriseData)
               ═══════════════════════════════════════════════════════════════════════════ */}
            {data.enterpriseData && (
              <section className="tr-ext-section" aria-labelledby="ext-ent-heading">
                <div className="tr-ext-header">
                  <div>
                    <span className="tr-ext-kicker">Cấp độ 2 - Truy xuất mở rộng Doanh nghiệp</span>
                    <h2 id="ext-ent-heading" className="tr-ext-title">
                      Vùng nguồn nguyên liệu, sản lượng từng vùng &amp; kiểm nghiệm chi tiết
                    </h2>
                  </div>
                  <span className="tr-badge-green">Đã xác thực quyền Doanh nghiệp</span>
                </div>

                {/* Bảng vùng nguồn của lô & sản lượng từng vùng */}
                <div className="tr-card">
                  <div className="tr-card-header">
                    <h3 className="tr-card-title">Phân bổ các vùng nguồn đóng góp vào lô</h3>
                    <span className="tr-count-badge">
                      Tổng: {data.enterpriseData.totalSourceWeightKg.toLocaleString("vi-VN")} kg
                    </span>
                  </div>

                  <div className="tr-table-scroll">
                    <table className="tr-ext-table">
                      <thead>
                        <tr>
                          <th>Mã vùng trồng (PUC)</th>
                          <th>Khu vực / Thôn</th>
                          <th className="is-num">Số hộ</th>
                          <th className="is-num">Diện tích</th>
                          <th className="is-num">Sản lượng góp</th>
                          <th className="is-num">Tỷ trọng</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.enterpriseData.sourceZones.map((z, idx) => (
                          <tr key={`${z.zoneCode}-${idx}`}>
                            <td className="is-mono">{z.zoneCode}</td>
                            <td>{z.villageName}</td>
                            <td className="is-num">{z.householdCount} hộ</td>
                            <td className="is-num">
                              {z.areaHa > 0 ? `${z.areaHa.toLocaleString("vi-VN")} ha` : "-"}
                            </td>
                            <td className="is-num">
                              <strong>{z.weightKg.toLocaleString("vi-VN")} kg</strong>
                            </td>
                            <td className="is-num">{z.sharePct}%</td>
                            <td>
                              <span
                                className={
                                  z.status === "Đủ điều kiện" ? "tr-badge-green" : "tr-badge-red"
                                }
                              >
                                {z.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Trụ cột 2: Đối soát Hạn ngạch Sản lượng Từng Thửa Đất Nguồn (Mass-Balance) */}
                {data.enterpriseData.massBalance && (() => {
                  const emb = data.enterpriseData.massBalance;
                  const clampedPct = Math.min(100, Math.max(0, emb.utilizationPct));
                  const barTone = !emb.withinQuota
                    ? "is-danger"
                    : emb.utilizationPct >= 85
                      ? "is-warn"
                      : "is-ok";
                  return (
                    <div className="tr-card">
                      <div className="tr-card-header">
                        <h3 className="tr-card-title">
                          Đối soát định mức sản lượng đầu vụ theo thửa (Vụ {emb.seasonYear})
                        </h3>
                        <span className={emb.withinQuota ? "tr-badge-green" : "tr-badge-red"}>
                          {emb.withinQuota ? "Trong định mức đầu vụ" : "Vượt định mức đầu vụ"}
                        </span>
                      </div>

                      <div className="tr-quota-bar-block">
                        <div className="tr-quota-stats-row">
                          <span className="is-tabular">
                            Lô này sử dụng: <strong>{emb.thisLotWeightKg.toLocaleString("vi-VN")} kg</strong> / Lũy kế vùng:{" "}
                            <strong>{emb.cumulativeUsedKg.toLocaleString("vi-VN")} kg</strong> trên trần{" "}
                            <strong>{emb.zoneMaxQuotaKg.toLocaleString("vi-VN")} kg</strong> ({emb.utilizationPct}%)
                          </span>
                          <span className="is-tabular">
                            Còn lại: <strong>{emb.remainingQuotaKg.toLocaleString("vi-VN")} kg</strong>
                          </span>
                        </div>
                        <div className="tr-quota-track" role="progressbar" aria-valuenow={emb.utilizationPct} aria-valuemin={0} aria-valuemax={100}>
                          <div className={`tr-quota-fill ${barTone}`} style={{ width: `${clampedPct}%` }} />
                        </div>
                      </div>

                      {emb.plots.length > 0 && (
                        <div className="tr-table-scroll">
                          <table className="tr-ext-table">
                            <thead>
                              <tr>
                                <th>Mã lô vườn</th>
                                <th>Mã vùng (PUC)</th>
                                <th className="is-num">Diện tích</th>
                                <th className="is-num">Số cây</th>
                                <th className="is-num">Trần đầu vụ</th>
                                <th className="is-num">Đã xuất</th>
                                <th className="is-num">Còn lại</th>
                                <th className="is-num">Tỷ lệ dùng</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emb.plots.map((pq) => (
                                <tr key={pq.plotCode}>
                                  <td className="is-mono">{pq.plotCode}</td>
                                  <td className="is-mono">{pq.zoneCode}</td>
                                  <td className="is-num">{pq.areaHa.toLocaleString("vi-VN")} ha</td>
                                  <td className="is-num">{pq.treeCount.toLocaleString("vi-VN")} cây</td>
                                  <td className="is-num">{pq.maxQuotaKg.toLocaleString("vi-VN")} kg</td>
                                  <td className="is-num">
                                    <strong>{pq.usedKg.toLocaleString("vi-VN")} kg</strong>
                                  </td>
                                  <td className="is-num">{pq.remainingKg.toLocaleString("vi-VN")} kg</td>
                                  <td className="is-num">
                                    <span className={pq.withinQuota ? "tr-badge-green" : "tr-badge-red"}>
                                      {pq.utilizationPct}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Trụ cột 3: Danh mục Bảng QR Thửa Đất Nguồn để Đối tác Đi Thẩm định Thực địa Tại Vườn */}
                {data.enterpriseData.fieldAuditSourcePlots &&
                  data.enterpriseData.fieldAuditSourcePlots.length > 0 && (
                    <div className="tr-card no-print">
                      <div className="tr-card-header">
                        <h3 className="tr-card-title">
                          Bảng QR thửa đất nguồn phục vụ đối tác đi kiểm tra thực địa tại vườn
                        </h3>
                        <span className="tr-count-badge">
                          {data.enterpriseData.fieldAuditSourcePlots.length} thửa định danh
                        </span>
                      </div>
                      <p className="tr-card-sub">
                        Đối tác thu mua có thể mở từng thửa đất nguồn để xem sơ đồ ranh giới thửa vườn và đối chiếu vị trí thực tế khi kiểm tra tại vườn.
                      </p>
                      <div className="tr-source-plots-grid">
                        {data.enterpriseData.fieldAuditSourcePlots.map((sp) => {
                          const plotHref =
                            sp.qrToken && !/^\.+$/.test(sp.qrToken) && isSafeTraceCode(sp.qrToken)
                              ? `/t/${encodeURIComponent(sp.qrToken)}`
                              : !/^\.+$/.test(sp.plotCode) && isSafeTraceCode(sp.plotCode)
                                ? `/trace/${encodeURIComponent(sp.plotCode)}`
                                : "/trace";
                          return (
                            <Link key={sp.plotCode} href={plotHref} className="tr-source-plot-link">
                              <div className="tr-source-plot-top">
                                <strong className="is-mono">{sp.plotCode}</strong>
                                <span className="tr-badge-green">Bảng QR vườn</span>
                              </div>
                              <div className="tr-source-plot-meta">
                                <span>PUC: {sp.zoneCode}</span>
                                <span>-</span>
                                <span>{sp.areaHa.toLocaleString("vi-VN")} ha</span>
                                {sp.variety && (
                                  <>
                                    <span>-</span>
                                    <span>{sp.variety}</span>
                                  </>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Ma trận kiểm nghiệm chi tiết theo vùng & Thông số sơ chế / vận chuyển lạnh */}
                <div className="tr-ext-two-col">
                  <div className="tr-card">
                    <div className="tr-card-header">
                      <h3 className="tr-card-title">Trạng thái kiểm nghiệm chi tiết của lô</h3>
                      <span className="tr-count-badge">
                        {data.enterpriseData.detailedLabTests.length} phiếu
                      </span>
                    </div>

                    {data.enterpriseData.detailedLabTests.length === 0 ? (
                      <div className="tr-farmer-empty">Chưa có phiếu kiểm nghiệm chi tiết.</div>
                    ) : (
                      <div className="tr-table-scroll">
                        <table className="tr-ext-table">
                          <thead>
                            <tr>
                              <th>Số phiếu</th>
                              <th>Mã vùng</th>
                              <th>Ngày mẫu</th>
                              <th className="is-num">Cd (mg/kg)</th>
                              <th>Vàng O</th>
                              <th className="is-num">Dư lượng</th>
                              <th>Kết quả</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.enterpriseData.detailedLabTests.map((lt) => (
                              <tr key={lt.code}>
                                <td className="is-mono">
                                  <div className="tr-lab-code-stack">
                                    {isSafeMediaUrl(lt.scanUrl) ? (
                                      <a
                                        href={lt.scanUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="tr-inline-link"
                                      >
                                        {lt.code}
                                      </a>
                                    ) : (
                                      <span>{lt.code}</span>
                                    )}
                                    {isSafeExternalHttpsUrl(lt.externalVerifyUrl) && (
                                      <a
                                        href={lt.externalVerifyUrl.trim()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        referrerPolicy="no-referrer"
                                        className="tr-inline-link is-sub"
                                      >
                                        Đối chiếu Lab
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="is-mono">{lt.zoneCode}</td>
                                <td>{formatTraceDate(lt.sampledOn, "vi")}</td>
                                <td className="is-num">{lt.cdMgKg}</td>
                                <td>{lt.yellowOPositive ? "Dương tính" : "Âm tính"}</td>
                                <td className="is-num">{lt.residueMgKg} mg/kg</td>
                                <td>
                                  <span
                                    className={
                                      lt.result === "pass" ? "tr-badge-green" : "tr-badge-red"
                                    }
                                  >
                                    {lt.result === "pass" ? "Đạt" : "Không đạt"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {data.enterpriseData.packingSpecs && (
                    <div className="tr-card">
                      <div className="tr-card-header">
                        <h3 className="tr-card-title">Thông số sơ chế &amp; chuỗi lạnh</h3>
                      </div>
                      <div className="tr-data-list">
                        <div className="tr-data-row">
                          <span className="tr-data-label">Tỷ lệ phân hạng A / B / C</span>
                          <strong className="tr-data-val highlight">
                            {data.enterpriseData.packingSpecs.gradeAPct !== null
                              ? `${data.enterpriseData.packingSpecs.gradeAPct}% / ${
                                  data.enterpriseData.packingSpecs.gradeBPct ?? 0
                                }% / ${data.enterpriseData.packingSpecs.gradeCPct ?? 0}%`
                              : "Theo quy chuẩn đóng thùng xuất khẩu"}
                          </strong>
                        </div>
                        <div className="tr-data-row">
                          <span className="tr-data-label">Độ ngọt bình quân</span>
                          <strong className="tr-data-val highlight">
                            {data.enterpriseData.packingSpecs.avgBrix !== null
                              ? `${data.enterpriseData.packingSpecs.avgBrix}° Brix`
                              : "Đạt chuẩn thu hái"}
                          </strong>
                        </div>
                        <div className="tr-data-row">
                          <span className="tr-data-label">Phương pháp sơ chế</span>
                          <strong className="tr-data-val">
                            {data.enterpriseData.packingSpecs.treatmentMethod ||
                              "Làm sạch khí nén, phân cỡ & đóng thùng carton"}
                          </strong>
                        </div>
                        <div className="tr-data-row">
                          <span className="tr-data-label">Đơn vị vận tải lạnh</span>
                          <strong className="tr-data-val">
                            {data.enterpriseData.packingSpecs.transporter || "Đang cập nhật"}
                            {data.enterpriseData.packingSpecs.vehiclePlate
                              ? ` (${data.enterpriseData.packingSpecs.vehiclePlate})`
                              : ""}
                          </strong>
                        </div>
                        <div className="tr-data-row">
                          <span className="tr-data-label">Nhiệt độ bảo quản</span>
                          <strong className="tr-data-val highlight">
                            {data.enterpriseData.packingSpecs.temperatureC !== null
                              ? `${data.enterpriseData.packingSpecs.temperatureC}°C`
                              : "13°C - 15°C"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════
               CẤP ĐỘ 3: HỒ SƠ MỞ RỘNG CƠ QUAN QUẢN LÝ NHÀ NƯỚC (authorityData)
               ═══════════════════════════════════════════════════════════════════════════ */}
            {data.authorityData && (
              <section className="tr-ext-section is-authority" aria-labelledby="ext-auth-heading">
                <div className="tr-ext-header">
                  <div>
                    <span className="tr-ext-kicker">
                      Cấp độ 3 - Hồ sơ thanh tra &amp; quản lý nhà nước (Ghi log kiểm toán)
                    </span>
                    <h2 id="ext-auth-heading" className="tr-ext-title">
                      Danh sách hộ &amp; thửa nguồn GIS, nhật ký canh tác và biên bản kiểm tra
                    </h2>
                  </div>
                  <span className="tr-badge-green">Quyền Cơ quan quản lý</span>
                </div>

                {/* 1. Danh sách hộ & thửa nguồn (Kèm nút mở bản đồ GIS chính xác từng thửa; Mã lô vườn 1 dòng chữ trơn) */}
                <div className="tr-card">
                  <div className="tr-card-header">
                    <h3 className="tr-card-title">Danh sách hộ thành viên &amp; thửa đất nguồn</h3>
                    <span className="tr-count-badge">
                      {data.authorityData.sourceHouseholds.length} hộ nguồn
                    </span>
                  </div>
                  <p className="tr-card-sub">
                    Dữ liệu định danh hộ, SĐT, CCCD ẩn số, quan hệ lô - thửa nguồn và tọa độ ranh giới chính xác từng thửa chỉ phục vụ công tác thanh tra, truy vết sự cố.
                  </p>

                  {data.authorityData.sourceHouseholds.length === 0 ? (
                    <div className="tr-farmer-empty">
                      Chưa ghi nhận danh sách hộ đóng góp trực tiếp trong lô này.
                    </div>
                  ) : (
                    <div className="tr-auth-hh-list">
                      {data.authorityData.sourceHouseholds.map((hh, hhIdx) => (
                        <div
                          key={`${hh.householdCode}-${hh.contributedPlotCode || hhIdx}`}
                          className="tr-auth-hh-card"
                        >
                          <div className="tr-auth-hh-top">
                            <div>
                              <strong className="tr-auth-hh-name">{hh.householdName}</strong>
                              <div className="tr-auth-hh-meta">
                                <span>Mã hộ: {hh.householdCode}</span>
                                <span>-</span>
                                <span>Khu vực: {hh.villageName || "Xã Cư Né"}</span>
                                {hh.contributedPlotCode && (
                                  <>
                                    <span>-</span>
                                    <span>Mã lô vườn: {hh.contributedPlotCode}</span>
                                  </>
                                )}
                                {hh.phone && (
                                  <>
                                    <span>-</span>
                                    <span>SĐT: {hh.phone}</span>
                                  </>
                                )}
                                {hh.cccdMasked && (
                                  <>
                                    <span>-</span>
                                    <span>CCCD: {hh.cccdMasked}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="tr-auth-hh-right">
                              {hh.contributedKg !== null && hh.contributedKg !== undefined && (
                                <strong className="tr-auth-hh-kg">
                                  {Number(hh.contributedKg).toLocaleString("vi-VN")} kg
                                </strong>
                              )}
                              <span
                                className={
                                  hh.publicTraceConsent ? "tr-badge-green" : "tr-badge-neutral"
                                }
                              >
                                {hh.publicTraceConsent
                                  ? "Đồng ý hiện tên QR"
                                  : "Ẩn tên trên QR công khai"}
                              </span>
                            </div>
                          </div>

                          {hh.plots.length > 0 && (
                            <div className="tr-auth-plots-list">
                              {hh.plots.map((p) => {
                                const hasGis = Boolean(
                                  p.geometryJson || (p.lat !== null && p.lng !== null),
                                );
                                return (
                                  <div key={p.plotCode} className="tr-auth-plot-row">
                                    <div className="tr-auth-plot-specs">
                                      <span>
                                        Mã lô vườn: <strong>{p.plotCode}</strong>
                                      </span>
                                      <span>-</span>
                                      <span>
                                        Địa chính: Tờ {p.sheetNo || "-"} / Thửa {p.parcelNo || "-"}
                                      </span>
                                      <span>-</span>
                                      <span>
                                        Diện tích: {Number(p.areaHa || 0).toLocaleString("vi-VN")} ha
                                      </span>
                                      {p.lat !== null && p.lng !== null && (
                                        <>
                                          <span>-</span>
                                          <span>
                                            Tọa độ: {Number(p.lat).toFixed(5)}°B,{" "}
                                            {Number(p.lng).toFixed(5)}°Đ
                                          </span>
                                        </>
                                      )}
                                    </div>

                                    {hasGis && (
                                      <button
                                        type="button"
                                        className="tr-auth-gis-btn"
                                        onClick={() => openAuthorityPlotGis(hh, p)}
                                      >
                                        <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
                                        <span>Xem ranh giới GIS</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Nhật ký canh tác & Phun thuốc BVTV chi tiết */}
                <AuthorityDiarySection diaries={data.authorityData.cultivationDiaries} />

                {/* 3. Biên bản kiểm tra & Dữ liệu cảnh báo / kỷ luật nội bộ */}
                <div className="tr-ext-two-col">
                  <div className="tr-card">
                    <div className="tr-card-header">
                      <h3 className="tr-card-title">Biên bản kiểm tra vùng trồng</h3>
                      <span className="tr-count-badge">
                        {data.authorityData.inspectionMinutes.length} biên bản
                      </span>
                    </div>

                    {data.authorityData.inspectionMinutes.length === 0 ? (
                      <div className="tr-farmer-empty">Chưa có biên bản kiểm tra được lưu trữ.</div>
                    ) : (
                      <div className="tr-minutes-list">
                        {data.authorityData.inspectionMinutes.map((m) => (
                          <div key={m.code} className="tr-minute-item">
                            <div className="tr-minute-head">
                              <strong className="tr-minute-code">{m.code}</strong>
                              <span className="tr-minute-date">{formatTraceDate(m.heldOn, "vi")}</span>
                            </div>
                            <div className="tr-minute-meta">
                              Cán bộ kiểm tra: {m.officer} - Địa điểm: {m.location}
                              {m.plotCode ? ` - Mã lô vườn: ${m.plotCode}` : ""}
                            </div>
                            <div className="tr-minute-result">Kết luận: {m.result}</div>
                            {(m.gpsVerified || isSafeMediaUrl(m.photoUrl)) && (
                              <div className="tr-proof-meta tr-minute-seals">
                                {m.gpsVerified && (
                                  <span className="tr-proof-safe-tag">Khớp GPS tại thửa</span>
                                )}
                                {isSafeMediaUrl(m.photoUrl) && (
                                  <button
                                    type="button"
                                    className="tr-inline-link"
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                                    onClick={() =>
                                      setTracePreviewMedia({
                                        urls: [m.photoUrl as string],
                                        title: m.code || "Ảnh biên bản hiện trường",
                                        subtitle: m.location || undefined,
                                      })
                                    }
                                  >
                                    Xem ảnh biên bản hiện trường
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="tr-card">
                    <div className="tr-card-header">
                      <h3 className="tr-card-title">Hồ sơ cảnh báo &amp; kỷ luật nội bộ</h3>
                      <span className="tr-count-badge">
                        {data.authorityData.internalViolations.length} ghi nhận
                      </span>
                    </div>

                    {data.authorityData.internalViolations.length === 0 ? (
                      <div className="tr-farmer-empty">
                        Không có vi phạm hoặc cảnh cáo nội bộ nào đối với các hộ nguồn của lô hàng.
                      </div>
                    ) : (
                      <div className="tr-minutes-list">
                        {data.authorityData.internalViolations.map((v, idx) => (
                          <div key={idx} className="tr-minute-item is-violation-item">
                            <div className="tr-minute-head">
                              <strong className="tr-minute-code">{v.title}</strong>
                              <span
                                className={
                                  v.severity === "critical" ? "tr-badge-red" : "tr-badge-neutral"
                                }
                              >
                                {v.severity === "critical" ? "Nghiêm trọng" : "Nhắc nhở"}
                              </span>
                            </div>
                            <div className="tr-minute-meta">
                              Ngày phát hiện: {formatTraceDate(v.detectedOn, "vi")}
                              {v.plotCode ? ` - Mã lô vườn: ${v.plotCode}` : ""}
                            </div>
                            {v.description && <div className="tr-minute-result">{v.description}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {!ac.fieldAuditPass?.active && !data.isPlotSignboard && !ac.isAuthenticated && (
              <section
                className="tr-pass-prompt-card is-sheet-aligned no-print"
                aria-label={t.fieldAudit.passPromptTitle}
              >
                <div className="tr-pass-prompt-copy">
                  <strong className="tr-pass-prompt-title">{t.fieldAudit.passPromptTitle}</strong>
                  <p className="tr-pass-prompt-desc">{t.fieldAudit.passPromptDesc}</p>
                </div>
                <form className="tr-pass-form" onSubmit={handleApplyAuditPass}>
                  <input
                    type="text"
                    className="tr-pass-input"
                    value={auditPassInput}
                    onChange={(e) => setAuditPassInput(e.target.value)}
                    placeholder={t.fieldAudit.passInputPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    className="tr-pass-submit-btn"
                    disabled={switchingTier || !auditPassInput.trim()}
                  >
                    {t.fieldAudit.passApplyBtn}
                  </button>
                </form>
              </section>
            )}
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
