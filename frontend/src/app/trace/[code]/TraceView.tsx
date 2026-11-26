"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { MediaBottomSheet } from "@/components/ui/MediaBottomSheet";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { ROLE_LABELS } from "@/constants/roles";
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT } from "@/lib/api-client";
import {
  PUC_URL_SYNC_EVENT,
  pushUrlNavigation,
  replaceUrlPreservingState,
  resetOverlayHistoryOnRouteLeave,
} from "@/lib/back-navigation";
import { reportRequestTime } from "@/lib/network";
import { INTRO_PATH } from "@/lib/routes";
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
import {
  PaginatedA4Dossier,
  splitCoopHeaderLines,
  type A4DossierSectionItem,
} from "./PaginatedA4Dossier";
import TraceAccessRequestBanner from "./TraceAccessRequestBanner";
import {
  TRACE_UI_COPY,
  detectInitialTraceLang,
  persistTraceLang,
  formatTraceDate,
  formatTraceDateTime,
  formatTraceNumber,
  formatTracePlotsUnit,
  getTraceEmptyText,
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
  localizeVillageLabel,
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
type ErrorKind = "invalid" | "not_found" | "server" | "timeout" | "network" | "blocked";

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
  eventCode?: string | null;
  title: string;
  date: string | null;
  responsibleUnit: string;
  recordedByName?: string | null;
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
  verifiedDiaryRecords?: number;
  selfDeclaredDiaryRecords?: number;
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
  avatarUrl?: string | null;
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
    brandName?: string | null;
    productImageUrl?: string | null;
    expiryOn?: string | null;
    storageCondition?: string | null;
    variety: string;
    lotCode: string;
    qrToken?: string | null;
    scannedCode: string;
    matchedEventCode?: string | null;
    traceUnit: "lot" | "box" | "fruit" | "puc_zone" | string;
    traceUnitLabel: string;
    weightTons: number;
    itemWeightKg: number | null;
    itemGrade: string | null;
    market: string;
    status: "valid" | "revoked" | "pending" | "unverified" | string;
    rawLotStatus?: string | null;
    dossierVerifiedOn?: string | null;
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
    gaccCode?: string | null;
    mardApprovedOn?: string | null;
    gaccApprovedOn?: string | null;
    additionalZoneCount: number;
    adminLocation: string;
    status: "active" | "suspended" | "revoked" | "pending" | string;
    statusLabel: string;
    statusNote?: string | null;
    validUntil: string | null;
    geoCheck?: {
      allPlotsMatchZone: boolean;
      checkedPlotCount: number;
      mismatchPlotCount: number;
    } | null;
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
    coopLegalName?: string | null;
    coopTaxCode?: string | null;
    coopAddress?: string | null;
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
    gaccCode?: string | null;
    mardApprovedOn?: string | null;
    gaccApprovedOn?: string | null;
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
    dossierVerifiedOn?: string | null;
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
  zoneGeoCheck?: {
    primaryZoneCode: string;
    allPlotsMatchZone: boolean;
    checkedPlotCount: number;
    mismatchPlotCount: number;
    mismatchedPlotCodes: string[];
  } | null;
  massBalance?: TraceEnterpriseMassBalance | null;
  evidenceLogs?: TraceDiaryEntry[];
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
  avatarUrl?: string | null;
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
  householdCode?: string | null;
  activity: string;
  detail: string | null;
  recorder: string;
  householdName?: string;
  mrlStatus?: string | null;
  isolationDays?: number | null;
  verificationStatus?: "self_declared" | "verified" | string;
  verifiedAt?: string | null;
  verifiedByLabel?: string | null;
  verifiedByName?: string | null;
  serverRecordedAt?: string | null;
  entryDelayHours?: number;
  isLateEntry?: boolean;
  recordHash?: string | null;
  gpsVerified?: boolean;
  gpsDistanceM?: number | null;
  trustLevel?: number | null;
  trustFlags?: string[] | null;
  offlineQueued?: boolean;
  signboardQrVerified?: boolean;
  photoUrl?: string | null;
  photoUrls?: string[] | null;
}

interface TraceImmutableChangeLog {
  id: number;
  occurredAt: string;
  tableName: string;
  tableLabel: string;
  recordId: number;
  operation: "UPDATE" | "DELETE" | string;
  plotCode: string | null;
  actorLabel: string;
  actorRole: string | null;
  changedFields: string[];
  oldData: Record<string, unknown>;
  newData: Record<string, unknown> | null;
  entryHash: string;
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
  photoUrls?: string[] | null;
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
  immutableChangeLogs?: TraceImmutableChangeLog[];
}

interface TracePlotSignboardInfo {
  plotCode: string;
  qrToken?: string | null;
  zoneCode: string;
  villageName?: string | null;
  variety?: string | null;
  plantedYear?: number | null;
  areaHa: number;
  treeCount: number | null;
  plotStatus?: "approved" | "pending" | "violation" | string;
  lastCareOn?: string | null;
  lastInspectionOn?: string | null;
  latestMinuteCode?: string | null;
  latestMinuteOfficer?: string | null;
  linkedLotCode?: string | null;
}

interface TraceHouseholdDossierInfo {
  householdCode: string;
  villageName?: string | null;
  zoneCode: string;
  varieties?: string | null;
  plotCount: number;
  totalAreaHa: number;
  totalTrees: number | null;
  householdStatus?: "qualified" | "pending" | "violation" | string;
  lastCareOn?: string | null;
  lastInspectionOn?: string | null;
  latestMinuteCode?: string | null;
  latestMinuteOfficer?: string | null;
  linkedLotCode?: string | null;
}

interface TraceFarmerProfile {
  displayName: string;
  isAnonymized: boolean;
  avatarUrl: string | null;
  householdCode: string | null;
  villageName: string;
  adminLocation: string;
  cooperativeName: string;
  plotCount: number;
  totalAreaHa: number;
  totalTrees: number | null;
  zoneCodes: string[];
  varieties: string;
  complianceStatus: "valid" | "review" | "unverified" | string;
  plots?: Array<{
    plotCode: string;
    qrToken: string | null;
    zoneCode: string;
    areaHa: number;
    treeCount: number | null;
    variety: string | null;
    plantedYear: number | null;
    status: string;
  }>;
}

interface TraceCommuneLotItem {
  lotCode: string;
  qrToken: string | null;
  harvestedOn: string | null;
  packedOn: string | null;
  exportedOn: string | null;
  plotCode: string | null;
  contributedKg: number;
  lotWeightTons: number;
  sharePct: number;
  packhouseName: string;
  market: string;
  status: string;
}

interface TraceCommuneLotContributions {
  scopeLabel: "plot" | "household";
  totalLots: number;
  totalContributedKg: number;
  currentSeasonYear: number;
  currentSeasonKg: number;
  householdTotalLots?: number;
  householdTotalContributedKg?: number;
  lots: TraceCommuneLotItem[];
}

interface TraceData {
  verifiedAt: string;
  accessControl: TraceAccessControl;
  isFarmerStamp?: boolean;
  isPlotSignboard?: boolean;
  isHouseholdDossier?: boolean;
  plotSignboard?: TracePlotSignboardInfo | null;
  householdDossier?: TraceHouseholdDossierInfo | null;
  farmerProfile?: TraceFarmerProfile | null;
  communeLotContributions?: TraceCommuneLotContributions | null;
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
    verifiedDatePending: string;
    originHeading: string;
    destinationHeading: string;
    farmersPrefix: string;
    producerEntityPrefix: string;
    taxCodePrefix: string;
    brandPrefix: string;
    gaccPrefix: string;
    geoCheckOkFmt: (count: number) => string;
    geoCheckWarnFmt: (mismatch: number, total: number) => string;
    eventCodePrefix: string;
    matchedEventPrefix: string;
    recordedByStaffPrefix: string;
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
    rowExpiryDate: string;
    rowStorageCondition: string;
    rowHeavyMetalYellowO: string;
    rowPesticideSafety: string;
    rowFarmJournal: string;
    journalBreakdownFmt: (
      diaryTotal: number,
      verified: number,
      selfDeclared: number,
      minuteCount?: number,
    ) => string;
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
    verifiedDatePending: "CHỜ XÁC THỰC",
    originHeading: "VÙNG TRỒNG NGUỒN",
    destinationHeading: "ĐÓNG GÓI VÀ XUẤT KHẨU",
    farmersPrefix: "Hộ tham gia",
    producerEntityPrefix: "Đơn vị sản xuất",
    taxCodePrefix: "MST",
    brandPrefix: "Nhãn hiệu",
    gaccPrefix: "GACC",
    geoCheckOkFmt: (count) => `Đối chiếu ranh giới: ${count}/${count} thửa khớp mã vùng`,
    geoCheckWarnFmt: (mismatch, total) =>
      `Cần đối chiếu mã vùng: ${mismatch}/${total} thửa khác mã chính`,
    eventCodePrefix: "Mã sự kiện",
    matchedEventPrefix: "MÃ SỰ KIỆN",
    recordedByStaffPrefix: "Cán bộ ghi nhận",
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
    rowExpiryDate: "HẠN SỬ DỤNG:",
    rowStorageCondition: "ĐIỀU KIỆN BẢO QUẢN:",
    rowHeavyMetalYellowO: "KIM LOẠI NẶNG VÀ VÀNG O:",
    rowPesticideSafety: "DƯ LƯỢNG THUỐC BVTV:",
    rowFarmJournal: "NHẬT KÝ CANH TÁC:",
    journalBreakdownFmt: (diaryTotal, verified, selfDeclared, minuteCount = 0) => {
      if (diaryTotal <= 0) {
        return minuteCount > 0 ? `${minuteCount} biên bản kiểm tra` : "Chưa có bản ghi";
      }
      const diaryPart =
        verified > 0 && selfDeclared > 0
          ? `${diaryTotal} bản ghi (${verified} HTX xác minh, ${selfDeclared} tự khai báo)`
          : verified > 0
            ? `${diaryTotal} bản ghi (HTX đã xác minh)`
            : `${diaryTotal} bản ghi (nông hộ khai báo)`;
      return minuteCount > 0 ? `${diaryPart}, ${minuteCount} biên bản` : diaryPart;
    },
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
      "Thu hoạch từ vùng trồng thành viên đã cấp mã số định danh, canh tác theo quy trình VietGAP và đảm bảo thời gian cách ly an toàn.",
    assuranceLine2: "",
    issuerHeading: "ĐƠN VỊ XÁC THỰC",
    continuedLabel: "Xem tiếp trang sau",
    pageIndicatorFmt: (cur, total) =>
      `Trang ${String(cur).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
  },
  en: {
    docTitle: "LOT DOSSIER",
    verifiedDatePrefix: "VERIFIED:",
    verifiedDatePending: "PENDING REVIEW",
    originHeading: "ORIGIN GROWING ZONE",
    destinationHeading: "PACKHOUSE & DESTINATION",
    farmersPrefix: "Consented growers",
    producerEntityPrefix: "Producer",
    taxCodePrefix: "Tax ID",
    brandPrefix: "Brand",
    gaccPrefix: "GACC",
    geoCheckOkFmt: (count) => `Boundary check: ${count}/${count} plots match zone`,
    geoCheckWarnFmt: (mismatch, total) =>
      `Zone check required: ${mismatch}/${total} plots differ from primary zone`,
    eventCodePrefix: "Event ID",
    matchedEventPrefix: "EVENT ID",
    recordedByStaffPrefix: "Recorded by",
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
    rowExpiryDate: "BEST BEFORE:",
    rowStorageCondition: "STORAGE CONDITION:",
    rowHeavyMetalYellowO: "HEAVY METALS & YELLOW O:",
    rowPesticideSafety: "PESTICIDE SAFETY:",
    rowFarmJournal: "CULTIVATION LOG:",
    journalBreakdownFmt: (diaryTotal, verified, selfDeclared, minuteCount = 0) => {
      if (diaryTotal <= 0) {
        return minuteCount > 0 ? `${minuteCount} inspection minutes` : "No entries yet";
      }
      const diaryPart =
        verified > 0 && selfDeclared > 0
          ? `${diaryTotal} entries (${verified} coop-verified, ${selfDeclared} self-declared)`
          : verified > 0
            ? `${diaryTotal} entries (coop-verified)`
            : `${diaryTotal} entries (grower self-declared)`;
      return minuteCount > 0 ? `${diaryPart}, ${minuteCount} inspections` : diaryPart;
    },
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
      "Harvested from registered member orchards cultivated under VietGAP standards and safe pre-harvest withdrawal periods.",
    assuranceLine2: "",
    issuerHeading: "ISSUING COOPERATIVE",
    continuedLabel: "Continued on next page",
    pageIndicatorFmt: (cur, total) =>
      `Page ${String(cur).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
  },
  zh: {
    docTitle: "批次溯源单",
    verifiedDatePrefix: "核验日期:",
    verifiedDatePending: "待核验",
    originHeading: "原产种植区",
    destinationHeading: "包装厂与出口市场",
    farmersPrefix: "公开农户",
    producerEntityPrefix: "生产单位",
    taxCodePrefix: "税号",
    brandPrefix: "品牌商标",
    gaccPrefix: "海关总署 (GACC)",
    geoCheckOkFmt: (count) => `产区核对：${count}/${count} 个供货地块与注册编码一致`,
    geoCheckWarnFmt: (mismatch, total) =>
      `产区提示：${mismatch}/${total} 个地块与主产区编码不同`,
    eventCodePrefix: "事件编码",
    matchedEventPrefix: "事件编码",
    recordedByStaffPrefix: "经办核验人",
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
    rowExpiryDate: "保质期至:",
    rowStorageCondition: "贮存条件:",
    rowHeavyMetalYellowO: "重金属与碱性嫩黄O:",
    rowPesticideSafety: "农药残留安全:",
    rowFarmJournal: "果园农事记录:",
    journalBreakdownFmt: (diaryTotal, verified, selfDeclared, minuteCount = 0) => {
      if (diaryTotal <= 0) {
        return minuteCount > 0 ? `${minuteCount} 条巡检记录` : "暂无记录";
      }
      const diaryPart =
        verified > 0 && selfDeclared > 0
          ? `${diaryTotal} 条（合作社已核验 ${verified} 条，农户申报 ${selfDeclared} 条）`
          : verified > 0
            ? `${diaryTotal} 条（合作社已核验）`
            : `${diaryTotal} 条（农户自主申报）`;
      return minuteCount > 0 ? `${diaryPart}，巡检 ${minuteCount} 条` : diaryPart;
    },
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
    assuranceLine2: "",
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
      journalCount?: number;
      sprayCount?: number;
      isHousehold?: boolean;
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
    termsColHeading: "Cam kết Canh tác:",
    assuranceLine1:
      "Canh tác trong mạng lưới liên kết Hợp tác xã Cư Né theo quy trình VietGAP, đối chiếu nhật ký và thời gian cách ly an toàn trước thu hoạch.",
    assuranceLine2: "",
    issuerHeading: "ĐƠN VỊ QUẢN LÝ VÙNG TRỒNG",
    buildSteps: (ctx) => {
      const rawSteps: Array<Omit<OrchardPlotStepCopy, "stepNo">> = [
        {
          title: ctx.isHousehold
            ? "Định danh nông hộ và vùng trồng liên kết"
            : "Định danh thửa đất và ranh giới canh tác",
          unit: ctx.coopName,
          detail: ctx.isHousehold
            ? `Mã hộ ${ctx.plotCode}${ctx.pucCode ? ` thuộc vùng trồng ${ctx.pucCode}` : ""}, quy mô ${ctx.areaText}${ctx.treesText ? ` (${ctx.treesText})` : ""}`
            : `Thửa ${ctx.plotCode}${ctx.pucCode ? ` thuộc mã vùng trồng ${ctx.pucCode}` : ""}, quy mô ${ctx.areaText}${ctx.treesText ? ` (${ctx.treesText})` : ""}`,
          date: ctx.assessedOn,
          statusLabel: ctx.isSuspended ? "Cảnh báo" : ctx.isPending ? "Chờ duyệt" : "Đã xác thực",
          statusTone: ctx.isSuspended ? "is-danger" : ctx.isPending ? "is-muted" : "is-ok",
        },
      ];
      if ((ctx.journalCount ?? 0) > 0 || ctx.lastCareOn) {
        rawSteps.push({
          title: "Nhật ký chăm sóc tại vườn",
          unit: "Tổ kỹ thuật HTX Cư Né",
          detail:
            (ctx.journalCount ?? 0) > 0
              ? `Đã ghi nhận ${ctx.journalCount} bản ghi chăm sóc điện tử trên hệ thống`
              : `Cập nhật nhật ký chăm sóc gần nhất ngày ${ctx.lastCareOn}`,
          date: ctx.lastCareOn,
          statusLabel: ctx.journalOk ? "Đã xác thực" : "Đang rà soát",
          statusTone: ctx.journalOk ? "is-ok" : "is-muted",
        });
      }
      if ((ctx.sprayCount ?? 0) > 0 || ctx.isSuspended) {
        rawSteps.push({
          title: "Nhật ký bảo vệ thực vật và cách ly PHI",
          unit: "Ban giám sát nội bộ HTX Cư Né",
          detail: ctx.isSuspended
            ? "Tạm dừng để rà soát nhật ký bảo vệ thực vật tại vườn"
            : `Đã ghi nhận ${ctx.sprayCount} đợt sử dụng vật tư trong danh mục cho phép`,
          date: ctx.lastCareOn,
          statusLabel: ctx.isSuspended ? "Cảnh báo" : "Đạt an toàn",
          statusTone: ctx.isSuspended ? "is-danger" : "is-ok",
        });
      }
      if (ctx.minuteCode || ctx.lastInspOn) {
        rawSteps.push({
          title: "Kiểm tra thực địa hiện trường",
          unit: "Đoàn kiểm tra HTX và Cấp xã",
          detail: ctx.minuteCode
            ? `Biên bản ${ctx.minuteCode}${ctx.minuteOfficer ? `, cán bộ: ${ctx.minuteOfficer}` : ""}`
            : "Đã kiểm tra thực địa tại vườn",
          date: ctx.lastInspOn,
          statusLabel: "Đã kiểm tra",
          statusTone: "is-ok",
        });
      }
      if (ctx.firstLabCode) {
        rawSteps.push({
          title: "Phân tích mẫu an toàn thực phẩm",
          unit: ctx.firstLabName || "Phòng kiểm nghiệm độc lập",
          detail: `Phiếu ${ctx.firstLabCode}: Phân tích Cadimi, Vàng O và dư lượng thuốc BVTV`,
          date: ctx.firstLabOn,
          statusLabel: ctx.anyLabFail ? "Cảnh báo" : "Đạt chuẩn",
          statusTone: ctx.anyLabFail ? "is-danger" : "is-ok",
        });
      }
      return rawSteps.map((s, idx) => ({
        ...s,
        stepNo: `${String(idx + 1).padStart(2, "0")}.`,
      }));
    },
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
    termsColHeading: "Cultivation Commitment:",
    assuranceLine1:
      "Cultivated within Cư Né Cooperative under VietGAP standards, with verified care logs and pre-harvest withdrawal compliance.",
    assuranceLine2: "",
    issuerHeading: "MANAGING COOPERATIVE",
    buildSteps: (ctx) => {
      const rawSteps: Array<Omit<OrchardPlotStepCopy, "stepNo">> = [
        {
          title: ctx.isHousehold
            ? "Grower & Linked Zone Registration"
            : "Plot Registration & Boundary Verification",
          unit: ctx.coopName,
          detail: `${ctx.isHousehold ? "Grower" : "Plot"} ${ctx.plotCode}${ctx.pucCode ? ` under zone ${ctx.pucCode}` : ""}, scale ${ctx.areaText}${ctx.treesText ? ` (${ctx.treesText})` : ""}`,
          date: ctx.assessedOn,
          statusLabel: ctx.isSuspended ? "Warning" : ctx.isPending ? "Pending" : "Verified",
          statusTone: ctx.isSuspended ? "is-danger" : ctx.isPending ? "is-muted" : "is-ok",
        },
      ];
      if ((ctx.journalCount ?? 0) > 0 || ctx.lastCareOn) {
        rawSteps.push({
          title: "Orchard Care Log",
          unit: "Cư Né Cooperative Technical Team",
          detail:
            (ctx.journalCount ?? 0) > 0
              ? `${ctx.journalCount} electronic care entries recorded`
              : `Latest orchard care entry on ${ctx.lastCareOn}`,
          date: ctx.lastCareOn,
          statusLabel: ctx.journalOk ? "Verified" : "In Review",
          statusTone: ctx.journalOk ? "is-ok" : "is-muted",
        });
      }
      if ((ctx.sprayCount ?? 0) > 0 || ctx.isSuspended) {
        rawSteps.push({
          title: "Crop Protection & Withdrawal Log",
          unit: "Cư Né Internal Supervisory Board",
          detail: ctx.isSuspended
            ? "Paused to review orchard crop protection records"
            : `${ctx.sprayCount} approved crop protection applications recorded`,
          date: ctx.lastCareOn,
          statusLabel: ctx.isSuspended ? "Warning" : "Compliant",
          statusTone: ctx.isSuspended ? "is-danger" : "is-ok",
        });
      }
      if (ctx.minuteCode || ctx.lastInspOn) {
        rawSteps.push({
          title: "On-Site Field Inspection",
          unit: "Cooperative & Commune Inspection Team",
          detail: ctx.minuteCode
            ? `Inspection minute ${ctx.minuteCode}${ctx.minuteOfficer ? `, inspector: ${ctx.minuteOfficer}` : ""}`
            : "On-site orchard inspection completed",
          date: ctx.lastInspOn,
          statusLabel: "Inspected",
          statusTone: "is-ok",
        });
      }
      if (ctx.firstLabCode) {
        rawSteps.push({
          title: "Food Safety Sample Testing",
          unit: ctx.firstLabName || "Independent Testing Lab",
          detail: `Report ${ctx.firstLabCode}: Tested for Cadmium, Yellow O, and pesticide residues`,
          date: ctx.firstLabOn,
          statusLabel: ctx.anyLabFail ? "Warning" : "Compliant",
          statusTone: ctx.anyLabFail ? "is-danger" : "is-ok",
        });
      }
      return rawSteps.map((s, idx) => ({
        ...s,
        stepNo: `${String(idx + 1).padStart(2, "0")}.`,
      }));
    },
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
    termsColHeading: "种植质量承诺:",
    assuranceLine1:
      "隶属 Cư Né 合作社注册种植网络，严格执行 VietGAP 规范及采前安全间隔期核验。",
    assuranceLine2: "",
    issuerHeading: "产区管理合作社",
    buildSteps: (ctx) => {
      const rawSteps: Array<Omit<OrchardPlotStepCopy, "stepNo">> = [
        {
          title: ctx.isHousehold ? "成员农户与产区登记" : "地块登记与种植边界核查",
          unit: ctx.coopName,
          detail: `${ctx.isHousehold ? "农户" : "地块"} ${ctx.plotCode}${ctx.pucCode ? ` 隶属注册产区 ${ctx.pucCode}` : ""}，核定规模 ${ctx.areaText}${ctx.treesText ? `（${ctx.treesText}）` : ""}`,
          date: ctx.assessedOn,
          statusLabel: ctx.isSuspended ? "警示" : ctx.isPending ? "待审" : "已核验",
          statusTone: ctx.isSuspended ? "is-danger" : ctx.isPending ? "is-muted" : "is-ok",
        },
      ];
      if ((ctx.journalCount ?? 0) > 0 || ctx.lastCareOn) {
        rawSteps.push({
          title: "果园管护电子台账",
          unit: "Cư Né 合作社技术组",
          detail:
            (ctx.journalCount ?? 0) > 0
              ? `系统已记录 ${ctx.journalCount} 条电子农事管护记录`
              : `最近管护记录日期 ${ctx.lastCareOn}`,
          date: ctx.lastCareOn,
          statusLabel: ctx.journalOk ? "已核验" : "复核中",
          statusTone: ctx.journalOk ? "is-ok" : "is-muted",
        });
      }
      if ((ctx.sprayCount ?? 0) > 0 || ctx.isSuspended) {
        rawSteps.push({
          title: "植保用药与间隔期记录",
          unit: "Cư Né 合作社内部监督组",
          detail: ctx.isSuspended
            ? "暂停待复查果园植保记录"
            : `系统已记录 ${ctx.sprayCount} 次合规农资施用`,
          date: ctx.lastCareOn,
          statusLabel: ctx.isSuspended ? "警示" : "安全合规",
          statusTone: ctx.isSuspended ? "is-danger" : "is-ok",
        });
      }
      if (ctx.minuteCode || ctx.lastInspOn) {
        rawSteps.push({
          title: "果园现场巡检核验",
          unit: "合作社与乡级联合巡检组",
          detail: ctx.minuteCode
            ? `巡检笔录编号 ${ctx.minuteCode}${ctx.minuteOfficer ? `，核查员：${ctx.minuteOfficer}` : ""}`
            : "已完成果园现场巡检",
          date: ctx.lastInspOn,
          statusLabel: "已巡检",
          statusTone: "is-ok",
        });
      }
      if (ctx.firstLabCode) {
        rawSteps.push({
          title: "食品安全采样检测",
          unit: ctx.firstLabName || "独立检测实验室",
          detail: `报告 ${ctx.firstLabCode}：检测重金属镉、碱性嫩黄O及农药残留`,
          date: ctx.firstLabOn,
          statusLabel: ctx.anyLabFail ? "待复查" : "检测合格",
          statusTone: ctx.anyLabFail ? "is-danger" : "is-ok",
        });
      }
      return rawSteps.map((s, idx) => ({
        ...s,
        stepNo: `${String(idx + 1).padStart(2, "0")}.`,
      }));
    },
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

function extractSafeMediaUrls(
  urls?: string[] | null,
  fallbackSingle?: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of urls ?? []) {
    if (isSafeMediaUrl(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  if (out.length === 0 && isSafeMediaUrl(fallbackSingle)) {
    out.push(fallbackSingle);
  }
  return out;
}

function computeFarmerMonogram(displayName: string, isAnonymized: boolean): string {
  if (isAnonymized) return "HTX";
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    const a = words[words.length - 2]?.[0] ?? "";
    const b = words[words.length - 1]?.[0] ?? "";
    const joined = `${a}${b}`.toUpperCase();
    if (joined) return joined;
  }
  if (words.length === 1 && words[0]) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return "HTX";
}

const HOUSEHOLD_COMMUNE_COPY: Record<
  TraceLang,
  {
    hhDocTitle: string;
    hhProfileKicker: string;
    hhCodePrefix: string;
    hhScaleHeading: string;
    hhStatusValid: string;
    hhStatusPending: string;
    hhStatusRevoked: string;
    rowHhFinalStatus: string;
    rowCommuneContrib: string;
    portraitFallbackSub: string;
    ownerPrefix: string;
    hhScaleLineFmt: (plotCount: number, areaText: string, treesText: string | null) => string;
    communeContribSectionTitle: string;
    communeContribTotalFmt: (lots: number, kgText: string) => string;
    communeHouseholdWideFmt: (lots: number, kgText: string) => string;
    communeLotsInlineFmt: (lots: number, kgText: string) => string;
    colLotAndPackhouse: string;
    colPlotOrZone: string;
    colHarvestDate: string;
    colContributed: string;
    colLotStatus: string;
    shareOfLotFmt: (pct: number) => string;
    emptyCommuneLots: string;
    lotExported: string;
    lotInTransit: string;
    lotDelivered: string;
    lotSampling: string;
    tier2EvidenceTitle: string;
    viewPhotosFmt: (count: number) => string;
    hhLookupHintFmt: (code: string) => string;
    colPackingItem: string;
    colPackingValue: string;
    sealedRecordsCountFmt: (count: number) => string;
  }
> = {
  vi: {
    hhDocTitle: "HỒ SƠ NÔNG HỘ",
    hhProfileKicker: "HỒ SƠ NÔNG HỘ THÀNH VIÊN",
    hhCodePrefix: "MÃ HỘ",
    hhScaleHeading: "QUY MÔ VƯỜN LIÊN KẾT",
    hhStatusValid: "Nông hộ liên kết đủ điều kiện",
    hhStatusPending: "Hồ sơ hộ đang chờ duyệt",
    hhStatusRevoked: "Tạm dừng để rà soát kỹ thuật",
    rowHhFinalStatus: "TRẠNG THÁI NÔNG HỘ:",
    rowCommuneContrib: "ĐÓNG GÓP LÔ XÃ:",
    portraitFallbackSub: "THÀNH VIÊN",
    ownerPrefix: "Chủ thể",
    hhScaleLineFmt: (plots, area, trees) => {
      if (plots <= 0 && (area === "0" || !area)) return "Quy mô: Chưa đăng ký thửa canh tác";
      const plotPart = plots > 0 ? `${plots} thửa, ${area} ha` : `${area} ha`;
      return trees ? `Quy mô: ${plotPart} (${trees})` : `Quy mô: ${plotPart}`;
    },
    communeContribSectionTitle: "ĐÓNG GÓP LÔ HÀNG TRÊN ĐỊA BÀN XÃ",
    communeContribTotalFmt: (lots, kg) => `ĐÃ GHI NHẬN: ${lots} LÔ, ${kg} KG`,
    communeHouseholdWideFmt: (lots, kg) => `Toàn hộ: ${lots} lô (${kg} kg)`,
    communeLotsInlineFmt: (lots, kg) => `${lots} lô (${kg} kg)`,
    colLotAndPackhouse: "LÔ HÀNG VÀ ĐƠN VỊ TIẾP NHẬN",
    colPlotOrZone: "THỬA NGUỒN",
    colHarvestDate: "THU HOẠCH",
    colContributed: "ĐÓNG GÓP",
    colLotStatus: "TRẠNG THÁI",
    shareOfLotFmt: (pct) => `${pct}% lô`,
    emptyCommuneLots: "Chưa ghi nhận đợt đóng góp lô hàng thương mại trên địa bàn xã.",
    lotExported: "Đã xuất khẩu",
    lotInTransit: "Đang vận chuyển",
    lotDelivered: "Đã bàn giao",
    lotSampling: "Đang kiểm định",
    tier2EvidenceTitle: "NHẬT KÝ VÀ HÌNH ẢNH MINH CHỨNG CANH TÁC",
    viewPhotosFmt: (count) => (count > 1 ? `Xem ${count} ảnh` : "Xem ảnh"),
    hhLookupHintFmt: (c) => `Mã hộ: ${c}`,
    colPackingItem: "HẠNG MỤC",
    colPackingValue: "THÔNG SỐ GHI NHẬN",
    sealedRecordsCountFmt: (c) => `${c} bản ghi đã xác thực`,
  },
  en: {
    hhDocTitle: "GROWER DOSSIER",
    hhProfileKicker: "MEMBER GROWER PROFILE",
    hhCodePrefix: "GROWER ID",
    hhScaleHeading: "LINKED ORCHARD SCALE",
    hhStatusValid: "Verified Member Grower",
    hhStatusPending: "Grower Dossier Pending Review",
    hhStatusRevoked: "Paused for Technical Review",
    rowHhFinalStatus: "GROWER STATUS:",
    rowCommuneContrib: "COMMUNE LOTS:",
    portraitFallbackSub: "MEMBER",
    ownerPrefix: "Grower",
    hhScaleLineFmt: (plots, area, trees) => {
      if (plots <= 0 && (area === "0" || !area)) return "Scale: No registered plots yet";
      const plotUnit = plots === 1 ? "1 plot" : `${plots} plots`;
      const plotPart = plots > 0 ? `${plotUnit}, ${area} ha` : `${area} ha`;
      return trees ? `Scale: ${plotPart} (${trees})` : `Scale: ${plotPart}`;
    },
    communeContribSectionTitle: "RECORDED COMMUNE LOT CONTRIBUTIONS",
    communeContribTotalFmt: (lots, kg) => `RECORDED: ${lots} LOTS, ${kg} KG`,
    communeHouseholdWideFmt: (lots, kg) => `Household total: ${lots} lots (${kg} kg)`,
    communeLotsInlineFmt: (lots, kg) => `${lots} lots (${kg} kg)`,
    colLotAndPackhouse: "LOT & RECEIVING PACKHOUSE",
    colPlotOrZone: "SOURCE PLOT",
    colHarvestDate: "HARVESTED",
    colContributed: "CONTRIBUTED",
    colLotStatus: "STATUS",
    shareOfLotFmt: (pct) => `${pct}% of lot`,
    emptyCommuneLots: "No commercial commune lot contributions recorded yet.",
    lotExported: "Exported",
    lotInTransit: "In Transit",
    lotDelivered: "Delivered",
    lotSampling: "Sampling",
    tier2EvidenceTitle: "CULTIVATION LOG & FIELD PHOTO EVIDENCE",
    viewPhotosFmt: (count) => (count > 1 ? `View ${count} photos` : "View photo"),
    hhLookupHintFmt: (c) => `Grower ID: ${c}`,
    colPackingItem: "SPECIFICATION",
    colPackingValue: "RECORDED VALUE",
    sealedRecordsCountFmt: (c) => `${c} verified entries`,
  },
  zh: {
    hhDocTitle: "成员农户档案",
    hhProfileKicker: "合作社成员农户档案",
    hhCodePrefix: "农户编码",
    hhScaleHeading: "联营果园核定规模",
    hhStatusValid: "合规联营成员农户",
    hhStatusPending: "农户档案审核中",
    hhStatusRevoked: "暂停待技术复核",
    rowHhFinalStatus: "农户核验状态:",
    rowCommuneContrib: "乡域出货累计:",
    portraitFallbackSub: "成员户",
    ownerPrefix: "种植主体",
    hhScaleLineFmt: (plots, area, trees) => {
      if (plots <= 0 && (area === "0" || !area)) return "规模：暂未登记地块";
      const plotPart = plots > 0 ? `${plots} 个地块，${area} 公顷` : `${area} 公顷`;
      return trees ? `规模：${plotPart}（${trees}）` : `规模：${plotPart}`;
    },
    communeContribSectionTitle: "乡域系统已登记出货批次供货记录",
    communeContribTotalFmt: (lots, kg) => `累计登记：${lots} 批次，${kg} KG`,
    communeHouseholdWideFmt: (lots, kg) => `全户累计：${lots} 批（${kg} kg）`,
    communeLotsInlineFmt: (lots, kg) => `${lots} 批（${kg} kg）`,
    colLotAndPackhouse: "批次编号与接收包装厂",
    colPlotOrZone: "来源地块",
    colHarvestDate: "采收日期",
    colContributed: "供货量",
    colLotStatus: "状态",
    shareOfLotFmt: (pct) => `占批次 ${pct}%`,
    emptyCommuneLots: "系统暂未登记该果园的商品批次供货记录。",
    lotExported: "已出口",
    lotInTransit: "运输中",
    lotDelivered: "已交付",
    lotSampling: "抽检中",
    tier2EvidenceTitle: "果园农事记录与现场照片凭证",
    viewPhotosFmt: (count) => (count > 1 ? `查看 ${count} 张照片` : "查看照片"),
    hhLookupHintFmt: (c) => `户号：${c}`,
    colPackingItem: "技术项目",
    colPackingValue: "实测与登记参数",
    sealedRecordsCountFmt: (c) => `已核验 ${c} 条记录`,
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
    continuedInlineSuffix: string;
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
    orchardScaleFmt: (areaText: string, treesText: string | null) => string;
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
    specZoneGeoCheck: string;
    zoneGeoMatchFmt: (count: number, puc: string) => string;
    zoneGeoMismatchFmt: (codes: string[]) => string;
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
    diaryHtxVerified: string;
    diarySelfDeclared: string;
    verifiedByFmt: (who: string, dateText: string | null) => string;
    diaryLate: string;
    diaryWarn: string;
    gpsShort: string;
    signboardShort: string;
    trustHighShort: string;
    trustReviewShort: string;
    offlineSyncShort: string;
    hashShortFmt: (prefix: string) => string;
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
    immutableTitle: string;
    colAuditTime: string;
    colAuditActor: string;
    colAuditDiff: string;
    colAuditHash: string;
    opUpdate: string;
    opDelete: string;
    deletedSnapshotFmt: (summary: string) => string;
  }
> = {
  vi: {
    zonesTitle: "VÙNG TRỒNG THAM GIA",
    zonesTotalFmt: (kg) => `TỔNG: ${kg} KG`,
    partSuffixFmt: (c, t) => ` (PHẦN ${c}/${t})`,
    continuedInlineSuffix: " (tiếp)",
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
    orchardScaleFmt: (area, trees) => (trees ? `${area} ha, ${trees} cây` : `${area} ha`),
    labsTitle: "KẾT QUẢ KIỂM NGỰA MẪU".replace("NGỰA", "NGHIỆM"),
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
    specZoneGeoCheck: "Đối chiếu mã vùng thửa nguồn",
    zoneGeoMatchFmt: (count, puc) => `Khớp ${count}/${count} thửa thuộc mã vùng ${puc}`,
    zoneGeoMismatchFmt: (codes) => `Khác mã vùng chính tại thửa: ${codes.join(", ")}`,
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
    diaryHtxVerified: "HTX đã xác minh",
    diarySelfDeclared: "Tự khai báo",
    verifiedByFmt: (who, dt) => (dt ? `${who} (${dt})` : who),
    diaryLate: "Bổ sung sau",
    diaryWarn: "Vượt ngưỡng",
    gpsShort: "Khớp GPS thửa",
    signboardShort: "Khớp QR thửa",
    trustHighShort: "Xác thực thực địa cao",
    trustReviewShort: "Cần đối chiếu thực địa",
    offlineSyncShort: "Ghi ngoại tuyến, đã đồng bộ",
    hashShortFmt: (p) => `Niêm phong: ${p}`,
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
    immutableTitle: "NHẬT KÝ KIỂM TOÁN THAY ĐỔI BẤT BIẾN",
    colAuditTime: "THỜI ĐIỂM",
    colAuditActor: "ĐỐI TƯỢNG VÀ NGƯỜI SỬA",
    colAuditDiff: "NỘI DUNG THAY ĐỔI (CŨ -> MỚI)",
    colAuditHash: "NIÊM PHONG",
    opUpdate: "Cập nhật dữ liệu",
    opDelete: "Xóa bản ghi",
    deletedSnapshotFmt: (s) => `Bản ghi trước khi xóa: ${s}`,
  },
  en: {
    zonesTitle: "SOURCE GROWING ZONES",
    zonesTotalFmt: (kg) => `TOTAL: ${kg} KG`,
    partSuffixFmt: (c, t) => ` (PART ${c}/${t})`,
    continuedInlineSuffix: " (cont.)",
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
    orchardScaleFmt: (area, trees) => (trees ? `${area} ha, ${trees} trees` : `${area} ha`),
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
    specZoneGeoCheck: "Source plot zone check",
    zoneGeoMatchFmt: (count, puc) => `Matched ${count}/${count} plots in zone ${puc}`,
    zoneGeoMismatchFmt: (codes) => `Cross-zone plots: ${codes.join(", ")}`,
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
    diaryHtxVerified: "Coop verified",
    diarySelfDeclared: "Self-declared",
    verifiedByFmt: (who, dt) => (dt ? `${who} (${dt})` : who),
    diaryLate: "Logged later",
    diaryWarn: "Over limit",
    gpsShort: "In-plot GPS",
    signboardShort: "Plot QR matched",
    trustHighShort: "High field assurance",
    trustReviewShort: "Field check advised",
    offlineSyncShort: "Offline captured & synced",
    hashShortFmt: (p) => `Seal: ${p}`,
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
    immutableTitle: "IMMUTABLE CHANGE AUDIT TRAIL",
    colAuditTime: "TIMESTAMP",
    colAuditActor: "TARGET & ACTOR",
    colAuditDiff: "RECORDED CHANGE (OLD -> NEW)",
    colAuditHash: "HASH SEAL",
    opUpdate: "Updated record",
    opDelete: "Deleted record",
    deletedSnapshotFmt: (s) => `Snapshot before deletion: ${s}`,
  },
  zh: {
    zonesTitle: "供货种植产区",
    zonesTotalFmt: (kg) => `总重：${kg} KG`,
    partSuffixFmt: (c, t) => `（第 ${c}/${t} 部分）`,
    continuedInlineSuffix: "（续）",
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
    orchardScaleFmt: (area, trees) => (trees ? `${area} 公顷, ${trees} 株` : `${area} 公顷`),
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
    specZoneGeoCheck: "供货地块产区编码核对",
    zoneGeoMatchFmt: (count, puc) => `全部一致（${count}/${count} 个地块属 ${puc}）`,
    zoneGeoMismatchFmt: (codes) => `跨片区地块：${codes.join(", ")}`,
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
    diaryHtxVerified: "合作社已核验",
    diarySelfDeclared: "自主申报",
    verifiedByFmt: (who, dt) => (dt ? `${who}（${dt}）` : who),
    diaryLate: "事后补录",
    diaryWarn: "超标预警",
    gpsShort: "地块内GPS核实",
    signboardShort: "地块二维码一致",
    trustHighShort: "高可信现场核验",
    trustReviewShort: "建议现场复核",
    offlineSyncShort: "离线采集已同步",
    hashShortFmt: (p) => `防伪哈希: ${p}`,
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
    immutableTitle: "不可篡改变更审计日志",
    colAuditTime: "记录时间",
    colAuditActor: "变更对象与经办人",
    colAuditDiff: "变更前后内容对比",
    colAuditHash: "哈希封存",
    opUpdate: "更新数据",
    opDelete: "删除记录",
    deletedSnapshotFmt: (s) => `删除前快照：${s}`,
  },
};

const IMMUTABLE_FIELD_LABELS: Record<string, Record<TraceLang, string>> = {
  code: { vi: "Mã số", en: "Code", zh: "编号" },
  zone_code: { vi: "Mã vùng trồng", en: "Zone code", zh: "产区编码" },
  plot_code: { vi: "Mã thửa", en: "Plot code", zh: "地块编号" },
  variety: { vi: "Giống", en: "Variety", zh: "品种" },
  product_name: { vi: "Tên sản phẩm", en: "Product name", zh: "产品名称" },
  brand_name: { vi: "Nhãn hiệu", en: "Brand", zh: "品牌商标" },
  expiry_on: { vi: "Hạn sử dụng", en: "Best before", zh: "保质期至" },
  storage_condition: { vi: "Điều kiện bảo quản", en: "Storage", zh: "贮存条件" },
  weight_tons: { vi: "Khối lượng lô (tấn)", en: "Lot weight (tons)", zh: "批次重量(吨)" },
  weight_kg: { vi: "Sản lượng đóng góp (kg)", en: "Contributed weight (kg)", zh: "供货重量(kg)" },
  harvested_on: { vi: "Ngày thu hoạch", en: "Harvest date", zh: "采收日期" },
  packed_on: { vi: "Ngày đóng gói", en: "Packing date", zh: "包装日期" },
  exported_on: { vi: "Ngày xuất khẩu", en: "Export date", zh: "出厂日期" },
  market: { vi: "Thị trường", en: "Market", zh: "出口市场" },
  status: { vi: "Trạng thái", en: "Status", zh: "状态" },
  revoked_reason: { vi: "Lý do thu hồi", en: "Recall reason", zh: "召回原因" },
  phyto_cert_no: { vi: "Số giấy kiểm dịch", en: "Phytosanitary cert", zh: "植检证书号" },
  phyto_issued_on: { vi: "Ngày cấp kiểm dịch", en: "Phyto issue date", zh: "植检签发日" },
  avg_brix: { vi: "Độ ngọt Brix", en: "Avg Brix", zh: "平均糖度" },
  grade_a_pct: { vi: "Tỷ lệ hạng A (%)", en: "Grade A (%)", zh: "A级占比(%)" },
  grade_b_pct: { vi: "Tỷ lệ hạng B (%)", en: "Grade B (%)", zh: "B级占比(%)" },
  grade_c_pct: { vi: "Tỷ lệ hạng C (%)", en: "Grade C (%)", zh: "C级占比(%)" },
  treatment_method: { vi: "Phương pháp sơ chế", en: "Treatment", zh: "采后处理" },
  transporter: { vi: "Đơn vị vận tải", en: "Carrier", zh: "承运单位" },
  vehicle_plate: { vi: "Biển số xe", en: "Vehicle plate", zh: "车牌号" },
  temperature_c: { vi: "Nhiệt độ lạnh (°C)", en: "Cold temp (°C)", zh: "冷链温度(°C)" },
  entry_on: { vi: "Ngày nhật ký", en: "Entry date", zh: "记录日期" },
  sprayed_on: { vi: "Ngày phun thuốc", en: "Spray date", zh: "施药日期" },
  activity: { vi: "Công việc canh tác", en: "Activity", zh: "农事作业" },
  note: { vi: "Ghi chú", en: "Note", zh: "备注" },
  dose: { vi: "Liều lượng", en: "Dosage", zh: "施用剂量" },
  isolation_days: { vi: "Số ngày cách ly", en: "Withdrawal days", zh: "安全间隔天数" },
  mrl_status: { vi: "Đánh giá MRL", en: "MRL check", zh: "农残评估" },
  verification_status: { vi: "Trạng thái xác minh", en: "Verification status", zh: "核验状态" },
  verified_by_name: { vi: "Cán bộ xác minh", en: "Verified by", zh: "核验人员" },
  sampled_on: { vi: "Ngày lấy mẫu", en: "Sample date", zh: "采样日期" },
  lab: { vi: "Đơn vị kiểm nghiệm", en: "Testing lab", zh: "检测机构" },
  cd_mg_kg: { vi: "Hàm lượng Cadimi", en: "Cadmium (mg/kg)", zh: "镉含量" },
  yellow_o_positive: { vi: "Chỉ tiêu Vàng O", en: "Yellow O", zh: "碱性嫩黄O" },
  residue_mg_kg: { vi: "Dư lượng BVTV", en: "Residue (mg/kg)", zh: "综合农残" },
  chlorpyrifos_mg_kg: { vi: "Chlorpyrifos", en: "Chlorpyrifos", zh: "毒死蜱" },
  result: { vi: "Kết quả", en: "Result", zh: "检测结果" },
  max_quota_kg: { vi: "Trần sản lượng vụ (kg)", en: "Season quota (kg)", zh: "产季定额上限(kg)" },
  tree_count: { vi: "Số cây cho trái", en: "Bearing trees", zh: "挂果树数" },
  area_ha: { vi: "Diện tích (ha)", en: "Area (ha)", zh: "面积(公顷)" },
  product_image_id: { vi: "Ảnh sản phẩm lô hàng", en: "Product image", zh: "批次产品图片" },
};

const SKIPPED_IMMUTABLE_DIFF_KEYS = new Set([
  "updated_at",
  "created_at",
  "verified_at",
  "verified_by_user_id",
  "server_recorded_at",
  "prev_hash",
  "record_hash",
]);

function formatImmutableScalar(val: unknown, key: string, lang: TraceLang): string {
  if (val === null || val === undefined || val === "") {
    return lang === "zh" ? "空" : lang === "en" ? "Empty" : "Trống";
  }
  if (typeof val === "boolean") {
    return val
      ? lang === "zh" ? "是" : lang === "en" ? "Yes" : "Có"
      : lang === "zh" ? "否" : lang === "en" ? "No" : "Không";
  }
  const str = String(val).trim();
  if (key === "verification_status") {
    if (str === "verified") {
      return lang === "zh" ? "合作社已核验" : lang === "en" ? "Coop verified" : "HTX đã xác minh";
    }
    if (str === "self_declared") {
      return lang === "zh" ? "自主申报" : lang === "en" ? "Self-declared" : "Tự khai báo";
    }
  }
  if (key === "product_image_id") {
    return lang === "zh" ? "已更新图片" : lang === "en" ? "Updated photo" : "Đã cập nhật ảnh";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-");
    return lang === "vi" ? `${d}/${m}/${y}` : str;
  }
  return str.length > 64 ? `${str.slice(0, 61)}...` : str;
}

function localizeImmutableTableLabel(tableName: string, rawLabel: string, lang: TraceLang): string {
  if (lang === "vi") return rawLabel;
  switch (tableName) {
    case "harvest_lots":
      return lang === "zh" ? "出口批次" : "Shipment lot";
    case "harvest_contributions":
      return lang === "zh" ? "农户供货量" : "Lot contribution";
    case "journal_entries":
      return lang === "zh" ? "农事记录" : "Cultivation log";
    case "spray_records":
      return lang === "zh" ? "植保记录" : "Spray log";
    case "lab_tests":
      return lang === "zh" ? "检测报告" : "Lab report";
    case "plot_season_quotas":
      return lang === "zh" ? "产季定额" : "Season quota";
    default:
      return rawLabel;
  }
}

function formatImmutableDiffLines(
  log: TraceImmutableChangeLog,
  lang: TraceLang,
): string[] {
  const ext = DOSSIER_EXTENDED_COPY[lang];
  if (log.operation === "DELETE" || !log.newData) {
    const summaryKeys = ["code", "plot_code", "activity", "weight_kg", "weight_tons", "max_quota_kg"];
    const parts: string[] = [];
    for (const k of summaryKeys) {
      if (log.oldData[k] !== undefined && log.oldData[k] !== null && log.oldData[k] !== "") {
        const label = IMMUTABLE_FIELD_LABELS[k]?.[lang] ?? k;
        parts.push(`${label}: ${formatImmutableScalar(log.oldData[k], k, lang)}`);
      }
    }
    return [
      parts.length > 0
        ? ext.deletedSnapshotFmt(parts.slice(0, 3).join(", "))
        : ext.opDelete,
    ];
  }

  const lines: string[] = [];
  const candidateKeys =
    log.changedFields.length > 0 ? log.changedFields : Object.keys(log.newData);
  for (const key of candidateKeys) {
    if (SKIPPED_IMMUTABLE_DIFF_KEYS.has(key)) continue;
    const labelMap = IMMUTABLE_FIELD_LABELS[key];
    if (!labelMap) continue;
    const oldText = formatImmutableScalar(log.oldData[key], key, lang);
    const newText = formatImmutableScalar(log.newData[key], key, lang);
    if (oldText === newText) continue;
    lines.push(`${labelMap[lang]}: ${oldText} -> ${newText}`);
    if (lines.length >= 4) break;
  }
  return lines.length > 0 ? lines : [ext.opUpdate];
}

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

const TRACE_LOOKUP_PREFIX_RE =
  /^(?:mã\s*sự\s*kiện|ma\s*su\s*kien|mã\s*vùng|ma\s*vung|mã\s*thửa|ma\s*thua|mã\s*lô|ma\s*lo|mã\s*hộ|ma\s*ho|nông\s*hộ|nong\s*ho|thùng|thung|thửa|thua|lô|lo|hộ|ho|mã|ma|puc|phc|tem)(?:\s*[:#]\s*|\s+[-–]?\s*)/iu;

function normalizeLookupCandidate(raw: string): string {
  return safeDecodeURIComponent(raw.slice(0, 256))
    .trim()
    .replace(TRACE_LOOKUP_PREFIX_RE, "")
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
  const [blockedUntilMs, setBlockedUntilMs] = useState<number | null>(null);
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());
  const [reloadNonce, setReloadNonce] = useState(0);
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
      try {
        window.sessionStorage.removeItem(AUDIT_PASS_SESSION_KEY);
        window.sessionStorage.removeItem("puc_trace_access_req_v1");
      } catch {
        // Bỏ qua nếu trình duyệt chặn sessionStorage
      }
      setAuditPass(null);
      setAuditPassInput("");
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

  const handleDeviceBlocked = (retryAfterSeconds: number, blockedUntil?: string | null) => {
    const parsedUntil = blockedUntil ? new Date(blockedUntil).getTime() : Number.NaN;
    const targetMs = !Number.isNaN(parsedUntil)
      ? parsedUntil
      : Date.now() + Math.max(1, retryAfterSeconds) * 1000;
    setNowTickMs(Date.now());
    setBlockedUntilMs(targetMs);
    setData(null);
    setErrorKind("blocked");
  };

  useEffect(() => {
    if (blockedUntilMs === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNowTickMs(current);
      if (current >= blockedUntilMs) {
        window.clearInterval(timer);
        setBlockedUntilMs(null);
        setErrorKind(null);
        if (code) {
          setLoading(true);
          setReloadNonce((n) => n + 1);
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [blockedUntilMs, code]);

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
    toast.success(
      lang === "en"
        ? "Extended dossier unlocked"
        : lang === "zh"
          ? "已开启详细档案权限"
          : "Đã mở quyền xem hồ sơ chi tiết",
    );
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
    toast.success(
      lang === "en"
        ? "Audit pass cleared"
        : lang === "zh"
          ? "已退出核验卡模式"
          : "Đã thoát chế độ thẻ thẩm định",
    );
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
      .then(async (res) => {
        reportRequestTime(performance.now() - start);
        if (!res.ok) {
          if (res.status === 429) {
            const errJson = (await res.json().catch(() => null)) as {
              code?: string;
              retryAfterSeconds?: number;
              blockedUntil?: string;
            } | null;
            const headerRetry = Number(res.headers.get("retry-after") || "0");
            const retrySec = errJson?.retryAfterSeconds || (headerRetry > 0 ? headerRetry : 300);
            const parsedUntil = errJson?.blockedUntil ? new Date(errJson.blockedUntil).getTime() : Number.NaN;
            const untilMs = !Number.isNaN(parsedUntil) ? parsedUntil : Date.now() + retrySec * 1000;
            const blockedErr = new Error(`blocked:${untilMs}`);
            blockedErr.name = "TraceBlockedError";
            throw blockedErr;
          }
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
          setBlockedUntilMs(null);
          const passInfo = payload.accessControl?.fieldAuditPass;
          const tempGrantInfo = payload.accessControl?.temporaryGrant;
          if (auditPass && !passInfo?.active && !tempGrantInfo?.active) {
            try {
              window.sessionStorage.removeItem(AUDIT_PASS_SESSION_KEY);
            } catch {
              // Bỏ qua nếu không xóa được sessionStorage
            }
            setAuditPass(null);
          }
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
        if (err instanceof Error && err.name === "TraceBlockedError") {
          const untilMs = Number(err.message.split(":")[1]) || Date.now() + 300_000;
          setNowTickMs(Date.now());
          setBlockedUntilMs(untilMs);
          setData(null);
          setErrorKind("blocked");
        } else if (err instanceof Error && err.name === "TraceHttpError") {
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
  }, [code, selectedView, auditPass, suppressTempGrant, isAuthenticated, reloadNonce]);

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
        .then(async (res) => {
          if (res.status === 429) {
            const errJson = (await res.json().catch(() => null)) as {
              code?: string;
              retryAfterSeconds?: number;
              blockedUntil?: string;
            } | null;
            if (errJson?.code === "TRACE_DEVICE_BLOCKED") {
              const parsedUntil = errJson.blockedUntil ? new Date(errJson.blockedUntil).getTime() : Number.NaN;
              const untilMs = !Number.isNaN(parsedUntil)
                ? parsedUntil
                : Date.now() + (errJson.retryAfterSeconds || 300) * 1000;
              if (!disposed) {
                setNowTickMs(Date.now());
                setBlockedUntilMs(untilMs);
                setData(null);
                setErrorKind("blocked");
              }
            }
            return null;
          }
          return res.ok ? ((await res.json()) as TraceData) : null;
        })
        .then((nextPayload) => {
          if (disposed || !nextPayload) return;
          if (
            auditPass &&
            !nextPayload.accessControl?.fieldAuditPass?.active &&
            !nextPayload.accessControl?.temporaryGrant?.active
          ) {
            try {
              window.sessionStorage.removeItem(AUDIT_PASS_SESSION_KEY);
            } catch {
              // Bỏ qua nếu không xóa được sessionStorage
            }
            setAuditPass(null);
          }
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
      toast.success(
        lang === "en"
          ? "Traceability link copied"
          : lang === "zh"
            ? "已复制溯源链接"
            : "Đã sao chép liên kết truy xuất",
      );
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
      ? data.isHouseholdDossier
        ? "household"
        : data.isPlotSignboard || pub.lotIdentity.traceUnit === "puc_zone"
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
    if (activeKind === "household") {
      rememberTraceKindHint(data.householdDossier?.householdCode, "household");
    } else if (activeKind === "plot") {
      rememberTraceKindHint(data.plotSignboard?.plotCode, "plot");
    } else if (activeKind === "lot") {
      rememberTraceKindHint(pub.lotIdentity.lotCode, "lot");
    }
  }, [activeKind, code, data, pub]);

  useEffect(() => {
    if (typeof document === "undefined" || !code) return;
    const displayRef =
      activeKind === "household"
        ? data?.householdDossier?.householdCode || fallbackUnitSerial || pub?.lotIdentity.scannedCode || code
        : activeKind === "plot"
          ? data?.plotSignboard?.plotCode || fallbackUnitSerial || pub?.lotIdentity.scannedCode || code
          : activeKind === "box" || activeKind === "fruit"
            ? fallbackUnitSerial || pub?.lotIdentity.scannedCode || pub?.lotIdentity.lotCode || code
            : pub?.lotIdentity.lotCode || code;
    if (lang === "zh") {
      const zhPrefix =
        activeKind === "household"
          ? "成员农户溯源"
          : activeKind === "plot"
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
        activeKind === "household"
          ? "Grower Household"
          : activeKind === "plot"
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
      activeKind === "household"
        ? "Truy xuất nông hộ"
        : activeKind === "plot"
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
      activeKind === "household"
        ? data?.householdDossier?.householdCode || fallbackUnitSerial || pub?.lotIdentity.scannedCode || code || "PUC"
        : activeKind === "plot"
          ? data?.plotSignboard?.plotCode || fallbackUnitSerial || pub?.lotIdentity.scannedCode || code || "PUC"
          : activeKind === "box" || activeKind === "fruit"
            ? fallbackUnitSerial || pub?.lotIdentity.scannedCode || pub?.lotIdentity.lotCode || code || "PUC"
            : pub?.lotIdentity?.lotCode || code || "PUC";
    const safeCode = refLabel.replace(/[^a-zA-Z0-9_-]+/g, "-");
    const filePrefix =
      activeKind === "household"
        ? "Ho-so-nong-ho"
        : activeKind === "plot"
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

  const blockedRemainingSec =
    errorKind === "blocked" && blockedUntilMs !== null
      ? Math.max(0, Math.ceil((blockedUntilMs - nowTickMs) / 1000))
      : 0;
  const blockedCountdownText = `${String(Math.floor(blockedRemainingSec / 60)).padStart(2, "0")}:${String(
    blockedRemainingSec % 60,
  ).padStart(2, "0")}`;

  const errorMessage = errorKind
    ? errorKind === "blocked"
      ? t.errorState.blockedDesc
      : errorKind === "invalid"
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
          <Link
            href={INTRO_PATH}
            className="tr-brand"
            onClick={() => resetOverlayHistoryOnRouteLeave()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/newlogo.png" alt="" width={22} height={22} className="tr-brand-img" loading="lazy" decoding="async" />
            <span>{t.topbar.brand}</span>
          </Link>

          <div className="tr-topbar-actions">
            <Link
              href="/trace"
              className="tr-top-btn"
              onClick={() => resetOverlayHistoryOnRouteLeave()}
            >
              {t.topbar.lookupOther}
            </Link>
            <Link
              href={INTRO_PATH}
              className="tr-top-btn is-solid"
              onClick={() => resetOverlayHistoryOnRouteLeave()}
            >
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
        </div>

        {loading ? (
          <SkeletonCards count={3} label={getTraceLoadingLabel(activeKind, lang)} />
        ) : errorKind === "blocked" ? (
          <div className="tr-card tr-error-card tr-blocked-card" role="alert">
            <h2 className="tr-error-title">{t.errorState.blockedTitle}</h2>
            <p className="tr-error-desc">{t.errorState.blockedDesc}</p>
            <div className="tr-block-countdown">
              <span className="tr-block-countdown-label">{t.errorState.blockedTimerLabel}</span>
              <strong className="tr-block-countdown-value">{blockedCountdownText}</strong>
            </div>
            <div className="tr-req-modal-contact tr-blocked-contact">
              <span className="tr-uac-contact-text">
                {lang === "zh"
                  ? "联系合作社社长："
                  : lang === "en"
                    ? "Contact Cooperative Head:"
                    : "Liên hệ Trưởng Hợp tác xã:"}{" "}
                <strong>Trần Đặng Sáu</strong>,
              </span>
              <a href="tel:0982576648" className="tr-uac-contact-tel">
                0982576648
              </a>
            </div>
            <div className="tr-error-actions">
              {blockedRemainingSec <= 0 && code ? (
                <button
                  type="button"
                  className="tr-home-btn"
                  onClick={() => {
                    setBlockedUntilMs(null);
                    setErrorKind(null);
                    setLoading(true);
                    setReloadNonce((n) => n + 1);
                  }}
                >
                  <span>{t.errorState.blockedRetryBtn}</span>
                </button>
              ) : (
                <Link href={INTRO_PATH} className="tr-home-btn">
                  <ArrowLeft size={17} strokeWidth={2.3} aria-hidden="true" />
                  <span>{t.actions.home}</span>
                </Link>
              )}
            </div>
          </div>
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
              <Link href={INTRO_PATH} className="tr-home-btn">
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
              const hhCommuneCopy = HOUSEHOLD_COMMUNE_COPY[lang];
              const unitCopy = UNIT_DOSSIER_OVERRIDES[lang];
              const extCopy = DOSSIER_EXTENDED_COPY[lang];
              const isPlotDossier = activeKind === "plot";
              const isHouseholdDossier = activeKind === "household";
              const isOrchardOrHousehold = isPlotDossier || isHouseholdDossier;
              const isBoxDossier = activeKind === "box";
              const isFruitDossier = activeKind === "fruit";
              const plotSb = data.plotSignboard ?? null;
              const hhDossier = data.householdDossier ?? null;
              const farmerProf = data.farmerProfile ?? null;
              const communeContrib = data.communeLotContributions ?? null;
              const safeFarmerAvatarUrl = isSafeMediaUrl(farmerProf?.avatarUrl)
                ? (farmerProf!.avatarUrl as string)
                : null;
              const safeLotProductImageUrl = isSafeMediaUrl(pub.lotIdentity.productImageUrl)
                ? (pub.lotIdentity.productImageUrl as string)
                : null;
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
                (isHouseholdDossier
                  ? hhDossier?.varieties
                  : isPlotDossier
                    ? plotSb?.variety
                    : null) || pub.lotIdentity.variety,
                lang,
              );

              const householdCodeRef =
                hhDossier?.householdCode ||
                farmerProf?.householdCode ||
                (isHouseholdDossier ? fallbackUnitSerial || pub.lotIdentity.scannedCode : null);
              const plotCode = isHouseholdDossier
                ? (householdCodeRef || pub.lotIdentity.scannedCode)
                : plotSb?.plotCode || fallbackUnitSerial || pub.lotIdentity.scannedCode;
              const plotAreaHa = isHouseholdDossier
                ? hhDossier && hhDossier.totalAreaHa > 0
                  ? hhDossier.totalAreaHa
                  : (farmerProf?.totalAreaHa ?? mb?.totalAreaHa ?? 0)
                : plotSb && plotSb.areaHa > 0
                  ? plotSb.areaHa
                  : (mb?.totalAreaHa ?? 0);
              const plotTreeCount = isHouseholdDossier
                ? hhDossier?.totalTrees && hhDossier.totalTrees > 0
                  ? hhDossier.totalTrees
                  : farmerProf?.totalTrees && farmerProf.totalTrees > 0
                    ? farmerProf.totalTrees
                    : (mb?.totalTreeCount ?? 0)
                : plotSb?.treeCount && plotSb.treeCount > 0
                  ? plotSb.treeCount
                  : (mb?.totalTreeCount ?? 0);
              const hhPlotCount =
                hhDossier?.plotCount ?? farmerProf?.plotCount ?? 0;
              const displayPucCode =
                pub.growingZone.pucCode || getTraceEmptyText("notRegistered", lang);
              const displayPhcCode =
                pub.packhouse.code || getTraceEmptyText("notUpdated", lang);
              const sealDiaryTotal =
                pub.integritySeal &&
                  pub.integritySeal.journalCount !== undefined &&
                  pub.integritySeal.sprayCount !== undefined
                  ? pub.integritySeal.journalCount + pub.integritySeal.sprayCount
                  : (pub.integritySeal?.verifiedDiaryRecords ?? 0) +
                  (pub.integritySeal?.selfDeclaredDiaryRecords ?? 0);
              const sealMinuteCount = pub.integritySeal?.minuteCount ?? 0;
              const rawVillageSource = isHouseholdDossier
                ? hhDossier?.villageName || farmerProf?.villageName
                : plotSb?.villageName || farmerProf?.villageName;
              const plotVillageText = rawVillageSource
                ? localizeVillageLabel(rawVillageSource, lang)
                : "";
              const plotPlantedYear = plotSb?.plantedYear ?? null;
              const plotLinkedLotCode =
                (isHouseholdDossier ? hhDossier?.linkedLotCode : plotSb?.linkedLotCode) ??
                communeContrib?.lots[0]?.lotCode ??
                (pub.lotIdentity.lotCode &&
                  pub.lotIdentity.lotCode.toUpperCase() !==
                  pub.growingZone.pucCode.toUpperCase()
                  ? pub.lotIdentity.lotCode
                  : null);

              const isPlotSuspended =
                pub.lotIdentity.status === "revoked" ||
                plotSb?.plotStatus === "violation" ||
                hhDossier?.householdStatus === "violation";
              const isPlotPending =
                pub.lotIdentity.status === "pending" ||
                pub.lotIdentity.status === "unverified" ||
                plotSb?.plotStatus === "pending" ||
                hhDossier?.householdStatus === "pending";
              const journalOk = !(pub.integritySeal && !pub.integritySeal.chainVerified);

              const hasNumericScale = isOrchardOrHousehold
                ? plotAreaHa > 0
                : pub.lotIdentity.itemWeightKg !== null || pub.lotIdentity.weightTons > 0;

              const scaleDisplay = isOrchardOrHousehold
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

              const scaleSubline = isHouseholdDossier
                ? hhPlotCount > 0 && plotTreeCount > 0
                  ? `${formatTracePlotsUnit(hhPlotCount, lang)}, ${formatTraceNumber(plotTreeCount, lang)} ${plotCopy.treesUnit}`
                  : hhPlotCount > 0
                    ? `${formatTracePlotsUnit(hhPlotCount, lang)}, ${localizedVariety}`
                    : plotTreeCount > 0
                      ? `${formatTraceNumber(plotTreeCount, lang)} ${plotCopy.treesUnit}, ${localizedVariety}`
                      : localizedVariety
                : isPlotDossier
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

              const orchardSteps = isOrchardOrHousehold
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
                  assessedOn: mb?.assessedOn ?? null,
                  lastCareOn: (isHouseholdDossier ? hhDossier?.lastCareOn : plotSb?.lastCareOn) ?? null,
                  lastInspOn: (isHouseholdDossier ? hhDossier?.lastInspectionOn : plotSb?.lastInspectionOn) ?? null,
                  minuteCode: (isHouseholdDossier ? hhDossier?.latestMinuteCode : plotSb?.latestMinuteCode) ?? null,
                  minuteOfficer: (isHouseholdDossier ? hhDossier?.latestMinuteOfficer : plotSb?.latestMinuteOfficer) ?? null,
                  firstLabCode: firstLab?.code ?? null,
                  firstLabName: firstLab ? localizeLabName(firstLab.lab, lang) : null,
                  firstLabOn: firstLab?.sampledOn ?? null,
                  anyLabFail,
                  isSuspended: isPlotSuspended,
                  isPending: isPlotPending,
                  journalOk,
                  journalCount: pub.integritySeal?.journalCount ?? 0,
                  sprayCount: pub.integritySeal?.sprayCount ?? 0,
                  isHousehold: isHouseholdDossier,
                })
                : [];
              const visibleLotTimelineSteps = !isOrchardOrHousehold
                ? (() => {
                  const recorded = pub.timeline.filter(
                    (st) => Boolean(st.date) || st.status === "completed" || st.status === "warning",
                  );
                  return recorded.length > 0 ? recorded : pub.timeline.slice(0, 1);
                })()
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

              const activeDocTitle = isHouseholdDossier
                ? hhCommuneCopy.hhDocTitle
                : isPlotDossier
                  ? plotCopy.docTitle
                  : isBoxDossier
                    ? unitCopy.boxDocTitle
                    : isFruitDossier
                      ? unitCopy.fruitDocTitle
                      : docCopy.docTitle;
              const activePrimaryPrefix = isHouseholdDossier
                ? hhCommuneCopy.hhCodePrefix
                : isPlotDossier
                  ? plotCopy.plotCodePrefix
                  : isBoxDossier
                    ? unitCopy.boxCodePrefix
                    : isFruitDossier
                      ? unitCopy.fruitCodePrefix
                      : docCopy.lotNoPrefix;
              const activePrimaryCode = isOrchardOrHousehold
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
              const showContributorsTable = !isOrchardOrHousehold && !data.isFarmerStamp;
              const entData = data.enterpriseData ?? null;
              const authData = data.authorityData ?? null;
              const hasSeparateFieldAuditSheet = Boolean(isPlotDossier && data.fieldAuditData);

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
              const showEntQuota = Boolean(
                !hasSeparateFieldAuditSheet &&
                entData?.massBalance &&
                (entData.massBalance.plots.length > 0 || entData.massBalance.zoneMaxQuotaKg > 0),
              );
              const packingSpecRows: Array<{ label: string; value: string; tabular?: boolean }> = [];
              if (entData?.zoneGeoCheck && entData.zoneGeoCheck.checkedPlotCount > 0) {
                const gc = entData.zoneGeoCheck;
                packingSpecRows.push({
                  label: extCopy.specZoneGeoCheck,
                  value: gc.allPlotsMatchZone
                    ? extCopy.zoneGeoMatchFmt(gc.checkedPlotCount, gc.primaryZoneCode)
                    : extCopy.zoneGeoMismatchFmt(gc.mismatchedPlotCodes),
                  tabular: true,
                });
              }
              if (entData?.packingSpecs) {
                const ps = entData.packingSpecs;
                if (ps.gradeAPct !== null) {
                  packingSpecRows.push({
                    label: extCopy.specGradeRatio,
                    value: `${ps.gradeAPct}% / ${ps.gradeBPct ?? 0}% / ${ps.gradeCPct ?? 0}%`,
                    tabular: true,
                  });
                }
                if (ps.avgBrix !== null) {
                  packingSpecRows.push({
                    label: extCopy.specAvgBrix,
                    value: `${ps.avgBrix}° Brix`,
                    tabular: true,
                  });
                }
                if (ps.treatmentMethod && ps.treatmentMethod.trim()) {
                  packingSpecRows.push({
                    label: extCopy.specTreatment,
                    value: sanitizeTraceTextConnectors(ps.treatmentMethod.trim()),
                  });
                }
                if (
                  (ps.transporter && ps.transporter.trim()) ||
                  (ps.vehiclePlate && ps.vehiclePlate.trim())
                ) {
                  packingSpecRows.push({
                    label: extCopy.specTransport,
                    value: [ps.transporter?.trim(), ps.vehiclePlate?.trim()]
                      .filter(Boolean)
                      .join(" - "),
                    tabular: true,
                  });
                }
                if (ps.temperatureC !== null) {
                  packingSpecRows.push({
                    label: extCopy.specTemp,
                    value: `${ps.temperatureC}°C`,
                    tabular: true,
                  });
                }
                const scheduleParts = [
                  ps.departedAt ? formatTraceDateTime(ps.departedAt, lang) : null,
                  ps.estimatedArrival ? formatTraceDateTime(ps.estimatedArrival, lang) : null,
                ].filter(Boolean);
                if (scheduleParts.length > 0) {
                  packingSpecRows.push({
                    label: extCopy.specSchedule,
                    value: scheduleParts.join(" / "),
                    tabular: true,
                  });
                }
              }
              const hasRealPackingSpecs = packingSpecRows.length > 0;

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

              const resolvedDossierVerifiedOn =
                pub.lotIdentity.dossierVerifiedOn !== undefined
                  ? pub.lotIdentity.dossierVerifiedOn
                  : pub.verification.dossierVerifiedOn !== undefined
                    ? pub.verification.dossierVerifiedOn
                    : pub.lotIdentity.status === "pending" ||
                      pub.lotIdentity.status === "unverified"
                      ? null
                      : pub.phytosanitary.issuedOn ||
                      pub.milestones.exportedOn ||
                      pub.milestones.packedOn ||
                      pub.milestones.harvestedOn ||
                      mb?.assessedOn ||
                      null;

              const dossierMeasureKey = [
                activeKind,
                activePrimaryCode,
                lang,
                ac.viewerTier,
                hasSeparateFieldAuditSheet ? "split-audit-a4" : "single-deck",
                isOrchardOrHousehold
                  ? orchardSteps.map((s) => `${s.stepNo}:${s.detail.length}:${s.statusLabel}`).join(",")
                  : visibleLotTimelineSteps
                    .map((s) => `${s.status}:${s.detail.length}:${s.eventCode || ""}:${s.recordedByName || ""}`)
                    .join(","),
                labs.map((l) => `${l.code}:${l.result}:${l.cdMgKg}:${l.yellowOPositive}`).join(","),
                contribTier,
                contribRows.length,
                contribRows
                  .map(
                    (r) =>
                      `${r.index}:${r.visibilityLevel}:${r.weightKg ?? ""}:${r.sharePct}:${r.complianceStatus}:${r.householdCode || ""}`,
                  )
                  .join(","),
                communeContrib
                  ? `${communeContrib.totalLots}:${communeContrib.totalContributedKg}:${communeContrib.lots.length}`
                  : "no-cl",
                Boolean(safeFarmerAvatarUrl),
                Boolean(safeLotProductImageUrl),
                `${pub.lotIdentity.weightTons ?? ""}:${pub.lotIdentity.itemWeightKg ?? ""}:${pub.lotIdentity.avgBrix ?? ""}:${pub.lotIdentity.gradeAPct ?? ""}:${pub.lotIdentity.temperatureC ?? ""}:${pub.lotIdentity.vehiclePlate ?? ""}`,
                `${plotAreaHa}:${plotTreeCount}:${hhPlotCount}:${plotPlantedYear ?? ""}`,
                pub.lotIdentity.brandName || "",
                pub.lotIdentity.expiryOn || "",
                pub.lotIdentity.storageCondition || "",
                pub.lotIdentity.matchedEventCode || "",
                pub.growingZone.status || "",
                pub.growingZone.validUntil || "",
                pub.growingZone.gaccCode || "",
                pub.growingZone.geoCheck
                  ? `${pub.growingZone.geoCheck.checkedPlotCount}:${pub.growingZone.geoCheck.mismatchPlotCount}`
                  : "no-gc",
                pub.packhouse.status || "",
                pub.packhouse.gaccCode || "",
                pub.producer.coopTaxCode || "",
                pub.phytosanitary.certNo || "",
                pub.integritySeal
                  ? `${pub.integritySeal.chainVerified}:${pub.integritySeal.totalSealedRecords}:${pub.integritySeal.verifiedDiaryRecords ?? ""}:${pub.integritySeal.selfDeclaredDiaryRecords ?? ""}`
                  : "no-seal",
                mb ? `${mb.withinQuota}:${mb.cumulativeUsedKg}:${mb.zoneMaxQuotaKg}` : "no-mb",
                pub.lotIdentity.rawLotStatus || pub.lotIdentity.status,
                resolvedDossierVerifiedOn || "pending",
                Boolean(qrSrc),
                entData
                  ? [
                    showEntZones ? `${entData.sourceZones.length}:${entData.totalSourceWeightKg}` : 0,
                    entData.massBalance
                      ? `${entData.massBalance.withinQuota}:${entData.massBalance.cumulativeUsedKg}:${entData.massBalance.plots.length}`
                      : "no-mb",
                    entData.detailedLabTests.map((l) => `${l.code}:${l.result}:${l.cdMgKg}`).join(","),
                    (entData.evidenceLogs ?? [])
                      .map((d) => `${d.entryOn}:${d.verificationStatus || ""}:${d.detail?.length ?? 0}`)
                      .join(","),
                    packingSpecRows.map((r) => `${r.label}:${r.value}`).join("|"),
                  ].join(";")
                  : "no-ent",
                authData
                  ? [
                    authHhSlices.length,
                    authData.cultivationDiaries
                      .map((d) => `${d.entryOn}:${d.verificationStatus || ""}:${d.detail?.length ?? 0}`)
                      .join(","),
                    authData.inspectionMinutes.map((m) => `${m.code}:${m.result}`).join(","),
                    authData.internalViolations.length,
                    authData.immutableChangeLogs?.length ?? 0,
                    authData.immutableChangeLogs?.[0]?.id ?? 0,
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
                      <span>
                        {resolvedDossierVerifiedOn
                          ? formatTraceDate(resolvedDossierVerifiedOn, lang)
                          : docCopy.verifiedDatePending}
                      </span>
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

              const plotFinalStatusText = isHouseholdDossier
                ? isPlotSuspended
                  ? hhCommuneCopy.hhStatusRevoked
                  : isPlotPending
                    ? hhCommuneCopy.hhStatusPending
                    : hhCommuneCopy.hhStatusValid
                : isPlotSuspended
                  ? plotCopy.plotStatusRevoked
                  : isPlotPending
                    ? plotCopy.plotStatusPending
                    : plotCopy.plotStatusValid;

              const farmerDisplayTitle =
                farmerProf?.displayName ||
                (pub.producer.consentedHouseholds[0]
                  ? pub.producer.consentedHouseholds[0]
                  : householdCodeRef
                    ? contribCopy.memberByCodeFmt(householdCodeRef)
                    : t.producerPackhouse.representedByCoop);
              const farmerMonogram = computeFarmerMonogram(
                farmerDisplayTitle,
                farmerProf?.isAnonymized ?? pub.producer.consentedHouseholds.length === 0,
              );

              const dossierSections: A4DossierSectionItem[] = [
                {
                  key: "parties",
                  content: isOrchardOrHousehold ? (
                    <section className="tr-doc-parties" aria-label={t.zone.title}>
                      <div className="tr-doc-party-col">
                        <div className="tr-doc-farmer-card">
                          <div className="tr-doc-farmer-avatar-frame">
                            {safeFarmerAvatarUrl ? (
                              <button
                                type="button"
                                className="tr-doc-farmer-avatar-btn"
                                onClick={() =>
                                  setTracePreviewMedia({
                                    urls: [safeFarmerAvatarUrl],
                                    title: farmerDisplayTitle,
                                    subtitle: householdCodeRef
                                      ? `${hhCommuneCopy.hhCodePrefix}: ${householdCodeRef}`
                                      : undefined,
                                  })
                                }
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={safeFarmerAvatarUrl}
                                  alt={farmerDisplayTitle}
                                  className="tr-doc-farmer-avatar-img"
                                  loading="eager"
                                  decoding="async"
                                />
                              </button>
                            ) : (
                              <div className="tr-doc-farmer-avatar-fallback" aria-hidden="true">
                                <span className="tr-doc-farmer-monogram">{farmerMonogram}</span>
                                <span className="tr-doc-farmer-monogram-sub">
                                  {hhCommuneCopy.portraitFallbackSub}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="tr-doc-farmer-meta">
                            <span className="tr-doc-party-kicker">
                              {isHouseholdDossier
                                ? hhCommuneCopy.hhProfileKicker
                                : plotCopy.plotProfileHeading}
                            </span>
                            <strong className="tr-doc-party-name">
                              {isHouseholdDossier
                                ? farmerDisplayTitle
                                : plotCopy.plotTitleFmt(plotCode)}
                            </strong>
                            <div className="tr-doc-party-lines">
                              {!isHouseholdDossier && (
                                <span>
                                  {hhCommuneCopy.ownerPrefix}: {farmerDisplayTitle}
                                </span>
                              )}
                              {householdCodeRef && !isHouseholdDossier && isSafeTraceCode(householdCodeRef) && (
                                <span>
                                  {extCopy.hhCodePrefix}:{" "}
                                  <Link
                                    href={`/trace/${encodeURIComponent(householdCodeRef)}`}
                                    className="tr-doc-code-link"
                                    onClick={() =>
                                      rememberTraceKindHint(householdCodeRef, "household")
                                    }
                                  >
                                    {householdCodeRef}
                                  </Link>
                                </span>
                              )}
                              <span>
                                {plotVillageText ||
                                  localizeAdminLocation(pub.growingZone.adminLocation, lang)}
                              </span>
                              {isHouseholdDossier ? (
                                <span>
                                  {hhCommuneCopy.hhScaleLineFmt(
                                    hhPlotCount,
                                    formatTraceNumber(plotAreaHa, lang),
                                    plotTreeCount > 0
                                      ? `${formatTraceNumber(plotTreeCount, lang)} ${plotCopy.treesUnit}`
                                      : null,
                                  )}
                                </span>
                              ) : null}
                              <span>{plotCopy.varietyYearFmt(localizedVariety, plotPlantedYear)}</span>
                            </div>
                            <div className="tr-doc-party-code">
                              {isHouseholdDossier
                                ? `${hhCommuneCopy.hhCodePrefix}: ${plotCode} (${plotFinalStatusText})`
                                : `${plotCopy.plotCodePrefix}: ${plotCode} (${plotFinalStatusText})`}
                            </div>
                          </div>
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
                          {pub.growingZone.validUntil && (
                            <span>
                              {docCopy.validUntilPrefix}:{" "}
                              {formatTraceDate(pub.growingZone.validUntil, lang)}
                            </span>
                          )}
                          {communeContrib && communeContrib.totalLots > 0 ? (
                            <span>
                              {hhCommuneCopy.rowCommuneContrib.replace(/[:：]$/, "")}:{" "}
                              {hhCommuneCopy.communeLotsInlineFmt(
                                communeContrib.totalLots,
                                formatTraceNumber(communeContrib.totalContributedKg, lang),
                              )}
                            </span>
                          ) : plotLinkedLotCode ? (
                            <span>
                              {plotCopy.linkedLotPrefix}: {plotLinkedLotCode}
                            </span>
                          ) : null}
                        </div>
                        <div className="tr-doc-party-code">
                          PUC: {displayPucCode}
                          {pub.growingZone.pucCode
                            ? ` (${localizeZoneStatusLabel(
                              pub.growingZone.status,
                              pub.growingZone.statusLabel,
                              lang,
                            )})`
                            : ""}
                        </div>
                        {pub.growingZone.gaccCode && (
                          <div className="tr-doc-party-code-sub">
                            {docCopy.gaccPrefix}: {pub.growingZone.gaccCode}
                          </div>
                        )}
                      </div>
                    </section>
                  ) : (
                    <section className="tr-doc-parties" aria-label={t.zone.title}>
                      <div className="tr-doc-party-col">
                        {(() => {
                          const originTextNode = (
                            <div className="tr-doc-farmer-meta">
                              <span className="tr-doc-party-kicker">{docCopy.originHeading}</span>
                              <strong className="tr-doc-party-name">
                                {localizeGrowingZoneName(pub.growingZone.name, lang)}
                              </strong>
                              <div className="tr-doc-party-lines">
                                <span>
                                  {docCopy.producerEntityPrefix}:{" "}
                                  {localizeCoopName(
                                    pub.producer.coopLegalName || pub.producer.cooperativeName,
                                    lang,
                                  )}
                                  {pub.producer.coopTaxCode
                                    ? ` (${docCopy.taxCodePrefix}: ${pub.producer.coopTaxCode})`
                                    : ""}
                                </span>
                                <span>
                                  {localizeAddress(
                                    pub.producer.coopAddress || pub.growingZone.adminLocation,
                                    lang,
                                  )}
                                </span>
                                {pub.growingZone.validUntil && (
                                  <span>
                                    {docCopy.validUntilPrefix}:{" "}
                                    {formatTraceDate(pub.growingZone.validUntil, lang)}
                                  </span>
                                )}
                              </div>
                              <div className="tr-doc-party-code">
                                PUC: {displayPucCode}
                                {pub.growingZone.additionalZoneCount > 0
                                  ? t.zone.linkedZonesSuffix(pub.growingZone.additionalZoneCount)
                                  : ""}
                                {pub.growingZone.pucCode
                                  ? ` (${localizeZoneStatusLabel(
                                    pub.growingZone.status,
                                    pub.growingZone.statusLabel,
                                    lang,
                                  )})`
                                  : ""}
                              </div>
                              {pub.growingZone.gaccCode && (
                                <div className="tr-doc-party-code-sub">
                                  {docCopy.gaccPrefix}: {pub.growingZone.gaccCode}
                                </div>
                              )}
                              {pub.growingZone.geoCheck &&
                                pub.growingZone.geoCheck.checkedPlotCount > 0 && (
                                  <div
                                    className={`tr-doc-party-code-sub${pub.growingZone.geoCheck.allPlotsMatchZone ? "" : " is-warn"}`}
                                  >
                                    {pub.growingZone.geoCheck.allPlotsMatchZone
                                      ? docCopy.geoCheckOkFmt(
                                        pub.growingZone.geoCheck.checkedPlotCount,
                                      )
                                      : docCopy.geoCheckWarnFmt(
                                        pub.growingZone.geoCheck.mismatchPlotCount,
                                        pub.growingZone.geoCheck.checkedPlotCount,
                                      )}
                                  </div>
                                )}
                            </div>
                          );

                          if (!safeLotProductImageUrl) {
                            return originTextNode;
                          }

                          return (
                            <div className="tr-doc-farmer-card">
                              <div className="tr-doc-farmer-avatar-frame">
                                <button
                                  type="button"
                                  className="tr-doc-farmer-avatar-btn"
                                  onClick={() =>
                                    setTracePreviewMedia({
                                      urls: [safeLotProductImageUrl],
                                      title: localizeProductName(
                                        pub.lotIdentity.productName,
                                        pub.lotIdentity.traceUnit,
                                        lang,
                                      ),
                                      subtitle: `${docCopy.lotNoPrefix}: ${pub.lotIdentity.lotCode}`,
                                    })
                                  }
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={safeLotProductImageUrl}
                                    alt={localizeProductName(
                                      pub.lotIdentity.productName,
                                      pub.lotIdentity.traceUnit,
                                      lang,
                                    )}
                                    className="tr-doc-farmer-avatar-img"
                                    loading="eager"
                                    decoding="async"
                                  />
                                </button>
                              </div>
                              {originTextNode}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="tr-doc-party-col">
                        <span className="tr-doc-party-kicker">{docCopy.destinationHeading}</span>
                        <strong className="tr-doc-party-name">
                          {localizePackhouseName(pub.packhouse.name, lang)}
                        </strong>
                        <div className="tr-doc-party-lines">
                          {pub.packhouse.address && (
                            <span>{localizeAddress(pub.packhouse.address, lang)}</span>
                          )}
                          {pub.lotIdentity.brandName && (
                            <span>
                              {docCopy.brandPrefix}: {pub.lotIdentity.brandName}
                            </span>
                          )}
                          <span>
                            {docCopy.marketPrefix}: {localizeMarket(pub.lotIdentity.market, lang)}
                          </span>
                          <span>{t.processPhyto.standardValue}</span>
                        </div>
                        <div className="tr-doc-party-code">
                          PHC: {displayPhcCode}
                          {pub.packhouse.code
                            ? ` (${localizePackhouseStatusLabel(
                              pub.packhouse.status,
                              pub.packhouse.statusLabel,
                              lang,
                            )})`
                            : ""}
                        </div>
                        {pub.packhouse.gaccCode && (
                          <div className="tr-doc-party-code-sub">
                            {docCopy.gaccPrefix}: {pub.packhouse.gaccCode}
                          </div>
                        )}
                      </div>
                    </section>
                  ),
                },
                ...(showContributorsTable && contribRows.length > 0
                  ? [
                    {
                      key: "contributors",
                      kind: "table",
                      table: {
                        sectionClassName: "tr-doc-ledger tr-doc-contributors",
                        ariaLabel: contribCopy.sectionTitle,
                        title: contribCopy.sectionTitle,
                        partTitleFmt: (part, total) =>
                          part === 1
                            ? `${contribCopy.sectionTitle}${extCopy.partSuffixFmt(1, total)}`
                            : contribCopy.continuedTitleFmt(part, total),
                        tableClassName: `tr-doc-table is-contributors is-tier-${contribTier}`,
                        thead: (
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
                        ),
                        rows: contribRows.map((row: TraceDossierContributor) => {
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
                          const hhTraceHref =
                            row.householdCode && isSafeTraceCode(row.householdCode)
                              ? `/trace/${encodeURIComponent(row.householdCode)}`
                              : null;

                          return {
                            key: `contrib-${row.index}`,
                            node: (
                              <tr>
                                <td className="col-no">
                                  {String(row.index).padStart(2, "0")}.
                                </td>
                                <td className="col-hh">
                                  {hhTraceHref ? (
                                    <Link
                                      href={hhTraceHref}
                                      className="tr-doc-item-title tr-doc-inline-link"
                                      onClick={() =>
                                        rememberTraceKindHint(row.householdCode, "household")
                                      }
                                    >
                                      {primaryHhTitle}
                                    </Link>
                                  ) : (
                                    <strong className="tr-doc-item-title">
                                      {primaryHhTitle}
                                    </strong>
                                  )}
                                  {row.householdCode && contribTier === "public" && hhTraceHref && (
                                    <span className="tr-doc-item-sub is-tabular">
                                      <Link
                                        href={hhTraceHref}
                                        className="tr-doc-code-link"
                                        onClick={() =>
                                          rememberTraceKindHint(row.householdCode, "household")
                                        }
                                      >
                                        {hhCommuneCopy.hhLookupHintFmt(row.householdCode)}
                                      </Link>
                                      {secondaryHhLine ? `, ${secondaryHhLine}` : ""}
                                    </span>
                                  )}
                                  {(!row.householdCode || contribTier !== "public" || !hhTraceHref) &&
                                    secondaryHhLine && (
                                      <span className="tr-doc-item-sub">{secondaryHhLine}</span>
                                    )}
                                </td>
                                <td className="col-plot">
                                  {contribTier === "public" || !row.plotCode ? (
                                    <span className="tr-doc-contrib-mono">
                                      {row.pucCode || displayPucCode}
                                    </span>
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
                                          ? `${row.cadastralLabel}, PUC: ${row.pucCode || displayPucCode}`
                                          : `PUC: ${row.pucCode || displayPucCode}`}
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
                                  className={`col-status ${isCompliant ? "is-ok" : "is-danger"}`}
                                >
                                  {isCompliant
                                    ? contribCopy.statusValid
                                    : contribCopy.statusReview}
                                </td>
                              </tr>
                            ),
                          };
                        }),
                      },
                    } satisfies A4DossierSectionItem,
                  ]
                  : []),
                (() => {
                  const ledgerLeftMeta = isOrchardOrHousehold
                    ? `${plotCopy.cropMetaPrefix}: ${plotCopy.cropName} (${localizedVariety})`
                    : `${docCopy.productMetaPrefix}: ${localizeProductName(
                      pub.lotIdentity.productName,
                      pub.lotIdentity.traceUnit,
                      lang,
                    )} (${localizedVariety})${pub.lotIdentity.brandName
                      ? `, ${docCopy.brandPrefix}: ${pub.lotIdentity.brandName}`
                      : ""
                    }`;
                  const ledgerRightMeta = isOrchardOrHousehold
                    ? `${activePrimaryPrefix}: ${plotCode} / PUC: ${displayPucCode}`
                    : isBoxDossier || isFruitDossier
                      ? `${activePrimaryPrefix}: ${unitPrimaryCode}${hasDistinctParentLot
                        ? ` / ${unitCopy.parentLotPrefix}: ${pub.lotIdentity.lotCode}`
                        : ""
                      }`
                      : `${pub.lotIdentity.matchedEventCode
                        ? `${docCopy.matchedEventPrefix}: ${pub.lotIdentity.matchedEventCode} / `
                        : ""
                      }${docCopy.lotNoPrefix}: ${pub.lotIdentity.lotCode}${fallbackUnitSerial &&
                        fallbackUnitSerial.toUpperCase() !==
                        pub.lotIdentity.lotCode.toUpperCase()
                        ? ` / ${docCopy.unitSerialPrefix}: ${fallbackUnitSerial}`
                        : ""
                      }`;

                  return {
                    key: "ledger",
                    kind: "table",
                    table: {
                      sectionClassName: "tr-doc-ledger",
                      ariaLabel: t.timeline.ariaLabel,
                      title: ledgerLeftMeta,
                      partTitleFmt: (part, total) =>
                        `${ledgerLeftMeta}${extCopy.partSuffixFmt(part, total)}`,
                      metaRight: ledgerRightMeta,
                      tableClassName: "tr-doc-table",
                      thead: (
                        <tr>
                          <th className="col-no">{docCopy.colNo}</th>
                          <th className="col-desc">
                            {isOrchardOrHousehold ? plotCopy.colStage : docCopy.colStage}
                          </th>
                          <th className="col-unit">{docCopy.colUnit}</th>
                          <th className="col-date">{docCopy.colDate}</th>
                          <th className="col-status">{docCopy.colResult}</th>
                        </tr>
                      ),
                      rows: isOrchardOrHousehold
                        ? orchardSteps.map((st) => ({
                          key: `orchard-step-${st.stepNo}`,
                          node: (
                            <tr>
                              <td className="col-no">{st.stepNo}</td>
                              <td className="col-desc">
                                <strong className="tr-doc-item-title">{st.title}</strong>
                                <span className="tr-doc-item-sub">{st.detail}</span>
                              </td>
                              <td className="col-unit">{st.unit}</td>
                              <td className="col-date">{formatTraceDate(st.date, lang)}</td>
                              <td className={`col-status ${st.statusTone}`}>{st.statusLabel}</td>
                            </tr>
                          ),
                        }))
                        : visibleLotTimelineSteps.map((st, stIdx) => {
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
                            st.step === 4 || st.key.includes("lab") || st.key.includes("test");
                          const isExportStep =
                            st.step === 5 || st.key.includes("export") || st.key.includes("phyto");
                          const isMatchedEventRow = Boolean(
                            pub.lotIdentity.matchedEventCode &&
                            st.eventCode &&
                            pub.lotIdentity.matchedEventCode.toUpperCase() ===
                            st.eventCode.toUpperCase(),
                          );

                          return {
                            key: st.key,
                            node: (
                              <tr className={isMatchedEventRow ? "is-matched-event" : undefined}>
                                <td className="col-no">
                                  {String(stIdx + 1).padStart(2, "0")}.
                                </td>
                                <td className="col-desc">
                                  <strong className="tr-doc-item-title">
                                    {localizedStep.title}
                                  </strong>
                                  <span className="tr-doc-item-sub">{localizedStep.detail}</span>
                                  {st.eventCode && isSafeTraceCode(st.eventCode) && (
                                    <span className="tr-doc-event-code">
                                      {docCopy.eventCodePrefix}:{" "}
                                      <Link
                                        href={`/trace/${encodeURIComponent(st.eventCode)}`}
                                        className="tr-doc-code-link"
                                        onClick={() =>
                                          rememberTraceKindHint(st.eventCode, "lot")
                                        }
                                      >
                                        {st.eventCode}
                                      </Link>
                                      {st.recordedByName
                                        ? `, ${docCopy.recordedByStaffPrefix}: ${st.recordedByName}`
                                        : ""}
                                    </span>
                                  )}

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
                                <td className="col-date">{formatTraceDate(st.date, lang)}</td>
                                <td className={`col-status ${statusTone}`}>{statusLabel}</td>
                              </tr>
                            ),
                          };
                        }),
                    },
                  } satisfies A4DossierSectionItem;
                })(),
                {
                  key: "summary",
                  content: (
                    <section className="tr-doc-summary-split">
                      <div className="tr-doc-total-box">
                        <span className="tr-doc-total-label">
                          {isHouseholdDossier
                            ? hhCommuneCopy.hhScaleHeading
                            : isPlotDossier
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

                      {isOrchardOrHousehold ? (
                        <dl className="tr-doc-kv-totals">
                          <div className="tr-doc-kv-row">
                            <dt>{plotCopy.rowPucCode}</dt>
                            <dd>{displayPucCode}</dd>
                          </div>
                          {(pub.integritySeal?.totalSealedRecords ?? 0) > 0 && (
                            <div className="tr-doc-kv-row">
                              <dt>{plotCopy.rowCareJournal}</dt>
                              <dd>
                                {!journalOk
                                  ? docCopy.journalReviewText
                                  : pub.integritySeal!.verifiedDiaryRecords !== undefined
                                    ? docCopy.journalBreakdownFmt(
                                      sealDiaryTotal,
                                      pub.integritySeal!.verifiedDiaryRecords,
                                      pub.integritySeal!.selfDeclaredDiaryRecords ?? 0,
                                      sealMinuteCount,
                                    )
                                    : hhCommuneCopy.sealedRecordsCountFmt(
                                      pub.integritySeal!.totalSealedRecords,
                                    )}
                              </dd>
                            </div>
                          )}
                          {firstLab && (
                            <div className="tr-doc-kv-row">
                              <dt>{plotCopy.rowPlotSampleTest}</dt>
                              <dd className={anyLabFail ? "is-danger" : ""}>
                                {anyLabFail
                                  ? `${firstLab.code} (${docCopy.heavyMetalFailText})`
                                  : `${firstLab.code} (${docCopy.heavyMetalPassText})`}
                              </dd>
                            </div>
                          )}
                          {communeContrib && communeContrib.totalLots > 0 ? (
                            <div className="tr-doc-kv-row">
                              <dt>{hhCommuneCopy.rowCommuneContrib}</dt>
                              <dd>
                                {hhCommuneCopy.communeLotsInlineFmt(
                                  communeContrib.totalLots,
                                  formatTraceNumber(communeContrib.totalContributedKg, lang),
                                )}
                              </dd>
                            </div>
                          ) : plotLinkedLotCode ? (
                            <div className="tr-doc-kv-row">
                              <dt>{plotCopy.rowLatestLot}</dt>
                              <dd>{plotLinkedLotCode}</dd>
                            </div>
                          ) : null}
                          <div className="tr-doc-kv-row is-grand">
                            <dt>
                              {isHouseholdDossier
                                ? hhCommuneCopy.rowHhFinalStatus
                                : plotCopy.rowPlotFinalStatus}
                            </dt>
                            <dd className={lotStatusTone}>{plotFinalStatusText}</dd>
                          </div>
                        </dl>
                      ) : (
                        <dl className="tr-doc-kv-totals">
                          {pub.lotIdentity.expiryOn && (
                            <div className="tr-doc-kv-row">
                              <dt>{docCopy.rowExpiryDate}</dt>
                              <dd>{formatTraceDate(pub.lotIdentity.expiryOn, lang)}</dd>
                            </div>
                          )}
                          {pub.lotIdentity.storageCondition && (
                            <div className="tr-doc-kv-row">
                              <dt>{docCopy.rowStorageCondition}</dt>
                              <dd>{sanitizeTraceTextConnectors(pub.lotIdentity.storageCondition)}</dd>
                            </div>
                          )}
                          {firstLab && (
                            <>
                              <div className="tr-doc-kv-row">
                                <dt>{docCopy.rowHeavyMetalYellowO}</dt>
                                <dd className={anyLabFail ? "is-danger" : ""}>
                                  {firstLab.yellowOPositive || Number(firstLab.cdMgKg) > 0.05
                                    ? docCopy.heavyMetalFailText
                                    : docCopy.heavyMetalPassText}
                                </dd>
                              </div>
                              <div className="tr-doc-kv-row">
                                <dt>{docCopy.rowPesticideSafety}</dt>
                                <dd className={anyLabFail ? "is-danger" : ""}>
                                  {firstLab.result !== "pass" ||
                                    (firstLab.chlorpyrifosMgKg ?? 0) > 0.01
                                    ? docCopy.pesticideFailText
                                    : docCopy.pesticidePassText}
                                </dd>
                              </div>
                            </>
                          )}
                          {(pub.integritySeal?.totalSealedRecords ?? 0) > 0 && (
                            <div className="tr-doc-kv-row">
                              <dt>{docCopy.rowFarmJournal}</dt>
                              <dd>
                                {!pub.integritySeal!.chainVerified
                                  ? docCopy.journalReviewText
                                  : pub.integritySeal!.verifiedDiaryRecords !== undefined
                                    ? docCopy.journalBreakdownFmt(
                                      sealDiaryTotal,
                                      pub.integritySeal!.verifiedDiaryRecords,
                                      pub.integritySeal!.selfDeclaredDiaryRecords ?? 0,
                                      sealMinuteCount,
                                    )
                                    : hhCommuneCopy.sealedRecordsCountFmt(
                                      pub.integritySeal!.totalSealedRecords,
                                    )}
                              </dd>
                            </div>
                          )}
                          {mb && mb.zoneMaxQuotaKg > 0 && (
                            <div className="tr-doc-kv-row">
                              <dt>{docCopy.rowYieldCheck}</dt>
                              <dd className={!mb.withinQuota ? "is-danger" : ""}>
                                {!mb.withinQuota ? docCopy.overQuotaText : docCopy.withinQuotaText}
                              </dd>
                            </div>
                          )}
                          {pub.phytosanitary.certNo && (
                            <div className="tr-doc-kv-row">
                              <dt>{docCopy.rowPhytosanitary}</dt>
                              <dd>{pub.phytosanitary.certNo}</dd>
                            </div>
                          )}
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
                ...(isOrchardOrHousehold && communeContrib && communeContrib.lots.length > 0
                  ? [
                    (() => {
                      const hasHhHigherTotal =
                        isPlotDossier &&
                        communeContrib.householdTotalContributedKg !== undefined &&
                        communeContrib.householdTotalContributedKg >
                        communeContrib.totalContributedKg;
                      const communeMetaRight = `${hhCommuneCopy.communeContribTotalFmt(
                        communeContrib.totalLots,
                        formatTraceNumber(communeContrib.totalContributedKg, lang),
                      )}${hasHhHigherTotal && communeContrib.householdTotalLots
                        ? ` / ${hhCommuneCopy.communeHouseholdWideFmt(
                          communeContrib.householdTotalLots,
                          formatTraceNumber(
                            communeContrib.householdTotalContributedKg!,
                            lang,
                          ),
                        )}`
                        : ""
                        }`;

                      return {
                        key: "commune-lots",
                        kind: "table",
                        table: {
                          sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                          title: hhCommuneCopy.communeContribSectionTitle,
                          partTitleFmt: (part, total) =>
                            `${hhCommuneCopy.communeContribSectionTitle}${extCopy.partSuffixFmt(part, total)}`,
                          metaRight: communeMetaRight,
                          tableClassName: "tr-doc-table is-commune-lots",
                          thead: (
                            <tr>
                              <th className="col-no">{extCopy.colNo}</th>
                              <th className="col-lot-ref">
                                {hhCommuneCopy.colLotAndPackhouse}
                              </th>
                              <th className="col-plot-src">{hhCommuneCopy.colPlotOrZone}</th>
                              <th className="col-date">{hhCommuneCopy.colHarvestDate}</th>
                              <th className="col-contrib-share">
                                {hhCommuneCopy.colContributed}
                              </th>
                              <th className="col-status">{hhCommuneCopy.colLotStatus}</th>
                            </tr>
                          ),
                          rows: communeContrib.lots.map((cl, idx) => {
                            const rowNum = idx + 1;
                            const lotHref =
                              cl.qrToken && isSafeTraceCode(cl.qrToken)
                                ? `/t/${encodeURIComponent(cl.qrToken)}`
                                : isSafeTraceCode(cl.lotCode)
                                  ? `/trace/${encodeURIComponent(cl.lotCode)}`
                                  : null;
                            const plotHref =
                              isHouseholdDossier &&
                                cl.plotCode &&
                                isSafeTraceCode(cl.plotCode)
                                ? `/trace/${encodeURIComponent(cl.plotCode)}`
                                : null;
                            const lotStateLabel =
                              cl.status === "exported"
                                ? hhCommuneCopy.lotExported
                                : cl.status === "in_transit"
                                  ? hhCommuneCopy.lotInTransit
                                  : cl.status === "delivered"
                                    ? hhCommuneCopy.lotDelivered
                                    : hhCommuneCopy.lotSampling;
                            const lotStateTone =
                              cl.status === "sampling" ? "is-muted" : "is-ok";

                            return {
                              key: `${cl.lotCode}-${rowNum}`,
                              node: (
                                <tr>
                                  <td className="col-no">
                                    {String(rowNum).padStart(2, "0")}.
                                  </td>
                                  <td className="col-lot-ref">
                                    {lotHref ? (
                                      <Link
                                        href={lotHref}
                                        className="tr-doc-item-title tr-doc-inline-link"
                                        onClick={() => {
                                          rememberTraceKindHint(cl.lotCode, "lot");
                                          rememberTraceKindHint(cl.qrToken, "lot");
                                        }}
                                      >
                                        {cl.lotCode}
                                      </Link>
                                    ) : (
                                      <strong className="tr-doc-item-title">
                                        {cl.lotCode}
                                      </strong>
                                    )}
                                    <span className="tr-doc-item-sub">
                                      {localizePackhouseName(cl.packhouseName, lang)} (
                                      {localizeMarket(cl.market, lang)})
                                    </span>
                                  </td>
                                  <td className="col-plot-src">
                                    {cl.plotCode ? (
                                      plotHref ? (
                                        <Link
                                          href={plotHref}
                                          className="tr-doc-code-link"
                                          onClick={() =>
                                            rememberTraceKindHint(cl.plotCode, "plot")
                                          }
                                        >
                                          {cl.plotCode}
                                        </Link>
                                      ) : (
                                        <strong>{cl.plotCode}</strong>
                                      )
                                    ) : (
                                      <span>{displayPucCode}</span>
                                    )}
                                  </td>
                                  <td className="col-date is-tabular">
                                    {formatTraceDate(cl.harvestedOn, lang)}
                                  </td>
                                  <td className="col-contrib-share">
                                    <strong className="tr-doc-contrib-wt">
                                      {formatTraceNumber(cl.contributedKg, lang)} kg
                                    </strong>
                                    <span className="tr-doc-item-sub">
                                      {hhCommuneCopy.shareOfLotFmt(cl.sharePct)}
                                    </span>
                                  </td>
                                  <td className={`col-status ${lotStateTone}`}>
                                    {lotStateLabel}
                                  </td>
                                </tr>
                              ),
                            };
                          }),
                        },
                      } satisfies A4DossierSectionItem;
                    })(),
                  ]
                  : []),
                ...(entData
                  ? [
                    ...(showEntZones
                      ? [
                        {
                          key: "ent-zones",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: extCopy.zonesTitle,
                            partTitleFmt: (part, total) =>
                              `${extCopy.zonesTitle}${extCopy.partSuffixFmt(part, total)}`,
                            metaRight: extCopy.zonesTotalFmt(
                              formatTraceNumber(entData.totalSourceWeightKg, lang),
                            ),
                            tableClassName: "tr-doc-table is-ent-zones",
                            thead: (
                              <tr>
                                <th className="col-no">{extCopy.colNo}</th>
                                <th className="col-puc">{extCopy.colPuc}</th>
                                <th className="col-area-name">{extCopy.colVillage}</th>
                                <th className="col-scale">{extCopy.colZoneScale}</th>
                                <th className="col-wt">{extCopy.colContribWeight}</th>
                                <th className="col-status">{extCopy.colStatus}</th>
                              </tr>
                            ),
                            rows: entData.sourceZones.map((z, idx) => {
                              const rowNum = idx + 1;
                              const isQual = z.status === "Đủ điều kiện";
                              return {
                                key: `${z.zoneCode}-${rowNum}`,
                                node: (
                                  <tr>
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
                                ),
                              };
                            }),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                    ...(showEntQuota && entData.massBalance
                      ? [
                        (() => {
                          const emb = entData.massBalance!;
                          const quotaTitle = extCopy.quotaTitleFmt(emb.seasonYear);
                          return {
                            key: "ent-quota",
                            kind: "table",
                            table: {
                              sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                              title: quotaTitle,
                              partTitleFmt: (part, total) =>
                                `${quotaTitle}${extCopy.partSuffixFmt(part, total)}`,
                              metaRight: emb.withinQuota ? extCopy.quotaWithin : extCopy.quotaOver,
                              metaRightClassName: `tr-doc-meta-right ${emb.withinQuota ? "is-ok-text" : "is-danger-text"}`,
                              tableClassName: "tr-doc-table is-ent-quota",
                              thead: (
                                <tr>
                                  <th className="col-plot-code">{extCopy.colPlotCode}</th>
                                  <th className="col-orchard">{extCopy.colOrchardScale}</th>
                                  <th className="col-cap">{extCopy.colMaxQuota}</th>
                                  <th className="col-used">{extCopy.colUsed}</th>
                                  <th className="col-remain">{extCopy.colRemain}</th>
                                </tr>
                              ),
                              rows:
                                emb.plots.length === 0
                                  ? [
                                    {
                                      key: "zone-quota-total",
                                      node: (
                                        <tr>
                                          <td className="col-plot-code is-tabular">
                                            <strong>{displayPucCode}</strong>
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
                                      ),
                                    },
                                  ]
                                  : emb.plots.map((pq) => {
                                    const pLink = plotLinkByCode.get(
                                      pq.plotCode.trim().toUpperCase(),
                                    );
                                    return {
                                      key: pq.plotCode,
                                      node: (
                                        <tr>
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
                                              pq.treeCount > 0
                                                ? formatTraceNumber(pq.treeCount, lang)
                                                : null,
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
                                      ),
                                    };
                                  }),
                            },
                          } satisfies A4DossierSectionItem;
                        })(),
                      ]
                      : []),
                    ...(entData.detailedLabTests.length > 0
                      ? [
                        {
                          key: "ent-labs",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: extCopy.labsTitle,
                            partTitleFmt: (part, total) =>
                              `${extCopy.labsTitle}${extCopy.partSuffixFmt(part, total)}`,
                            tableClassName: "tr-doc-table is-ent-labs",
                            thead: (
                              <tr>
                                <th className="col-cert">{extCopy.colLabCert}</th>
                                <th className="col-date">{extCopy.colSampleDate}</th>
                                <th className="col-num">{extCopy.colCd}</th>
                                <th className="col-yo">{extCopy.colYellowO}</th>
                                <th className="col-res">{extCopy.colResidue}</th>
                                <th className="col-status">{docCopy.colResult}</th>
                              </tr>
                            ),
                            rows: entData.detailedLabTests.map((lt) => {
                              const passed = lt.result === "pass" && !lt.yellowOPositive;
                              return {
                                key: lt.code,
                                node: (
                                  <tr>
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
                                ),
                              };
                            }),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                    ...(hasRealPackingSpecs
                      ? [
                        {
                          key: "ent-packing",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: extCopy.packingTitle,
                            partTitleFmt: (part, total) =>
                              `${extCopy.packingTitle}${extCopy.partSuffixFmt(part, total)}`,
                            tableClassName: "tr-doc-table is-packing-specs",
                            thead: (
                              <tr>
                                <th className="col-no">{extCopy.colNo}</th>
                                <th className="col-spec-name">
                                  {hhCommuneCopy.colPackingItem}
                                </th>
                                <th className="col-spec-val">
                                  {hhCommuneCopy.colPackingValue}
                                </th>
                              </tr>
                            ),
                            rows: packingSpecRows.map((row, idx) => ({
                              key: row.label,
                              node: (
                                <tr>
                                  <td className="col-no">
                                    {String(idx + 1).padStart(2, "0")}.
                                  </td>
                                  <td className="col-spec-name">{row.label}</td>
                                  <td
                                    className={`col-spec-val${row.tabular ? " is-tabular" : ""}`}
                                  >
                                    {row.value}
                                  </td>
                                </tr>
                              ),
                            })),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                    ...(!hasSeparateFieldAuditSheet &&
                      !authData &&
                      entData.evidenceLogs &&
                      entData.evidenceLogs.length > 0
                      ? [
                        {
                          key: "ent-diaries",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: hhCommuneCopy.tier2EvidenceTitle,
                            partTitleFmt: (part, total) =>
                              `${hhCommuneCopy.tier2EvidenceTitle}${extCopy.partSuffixFmt(part, total)}`,
                            tableClassName: "tr-doc-table is-auth-diary",
                            thead: (
                              <tr>
                                <th className="col-date">{extCopy.colDate}</th>
                                <th className="col-hh-plot">{extCopy.colHhPlot}</th>
                                <th className="col-act">{extCopy.colDiaryActivity}</th>
                                <th className="col-status">{extCopy.colStatus}</th>
                              </tr>
                            ),
                            rows: entData.evidenceLogs.map((d, idx) => {
                              const mrlFailed = Boolean(d.mrlStatus && d.mrlStatus !== "pass");
                              const compact = formatCompactDiaryEntry(
                                d.activity,
                                d.detail,
                                lang,
                              );
                              const mediaUrls = extractSafeMediaUrls(d.photoUrls, d.photoUrl);
                              const hhHref =
                                !isHouseholdDossier &&
                                  d.householdCode &&
                                  isSafeTraceCode(d.householdCode)
                                  ? `/trace/${encodeURIComponent(d.householdCode)}`
                                  : null;
                              const isCoopVerified = d.verificationStatus === "verified";
                              const isHighTrust = isCoopVerified || d.trustLevel === 1;
                              const isReviewTrust = !isCoopVerified && d.trustLevel === 3;
                              const statusTone = mrlFailed
                                ? "is-danger"
                                : d.isLateEntry || isReviewTrust
                                  ? "is-warn"
                                  : isHighTrust
                                    ? "is-ok"
                                    : "is-muted";
                              const statusText = mrlFailed
                                ? extCopy.diaryWarn
                                : isCoopVerified
                                  ? extCopy.diaryHtxVerified
                                  : isReviewTrust
                                    ? extCopy.trustReviewShort
                                    : d.trustLevel === 1
                                      ? extCopy.trustHighShort
                                      : extCopy.diarySelfDeclared;
                              const verifyMetaText =
                                isCoopVerified && (d.verifiedByLabel || d.verifiedAt)
                                  ? extCopy.verifiedByFmt(
                                    d.verifiedByLabel || extCopy.diaryHtxVerified,
                                    d.verifiedAt ? formatTraceDate(d.verifiedAt, lang) : null,
                                  )
                                  : null;

                              return {
                                key: `ent-d-${d.entryOn}-${d.plotCode}-${idx}`,
                                node: (
                                  <tr>
                                    <td className="col-date is-tabular">
                                      {formatTraceDate(d.entryOn, lang)}
                                    </td>
                                    <td className="col-hh-plot">
                                      {hhHref ? (
                                        <Link
                                          href={hhHref}
                                          className="tr-doc-item-title tr-doc-inline-link"
                                          onClick={() =>
                                            rememberTraceKindHint(d.householdCode, "household")
                                          }
                                        >
                                          {d.householdName || d.recorder || "-"}
                                        </Link>
                                      ) : (
                                        <strong className="tr-doc-item-title">
                                          {d.householdName || d.recorder || "-"}
                                        </strong>
                                      )}
                                      {d.plotCode && (
                                        <span className="tr-doc-item-sub is-tabular">
                                          {extCopy.plotRefFmt(d.plotCode)}
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
                                      {mediaUrls.length > 0 && (
                                        <button
                                          type="button"
                                          className="tr-doc-sub-btn no-print"
                                          onClick={() =>
                                            setTracePreviewMedia({
                                              urls: mediaUrls,
                                              title:
                                                d.householdName || hhCommuneCopy.tier2EvidenceTitle,
                                              subtitle: `${formatTraceDate(d.entryOn, lang)}, ${compact.title}`,
                                            })
                                          }
                                        >
                                          {hhCommuneCopy.viewPhotosFmt(mediaUrls.length)}
                                        </button>
                                      )}
                                    </td>
                                    <td className={`col-status ${statusTone}`}>
                                      <span>{statusText}</span>
                                      {verifyMetaText && (
                                        <span className="tr-doc-status-sub is-tabular">
                                          {verifyMetaText}
                                        </span>
                                      )}
                                      {d.isLateEntry ? (
                                        <span className="tr-doc-status-sub">
                                          {extCopy.diaryLate}
                                        </span>
                                      ) : d.offlineQueued ? (
                                        <span className="tr-doc-status-sub">
                                          {extCopy.offlineSyncShort}
                                        </span>
                                      ) : null}
                                      {d.signboardQrVerified && (
                                        <span className="tr-doc-status-sub">
                                          {extCopy.signboardShort}
                                        </span>
                                      )}
                                      {d.gpsVerified && (
                                        <span className="tr-doc-status-sub">
                                          {extCopy.gpsShort}
                                        </span>
                                      )}
                                      {d.recordHash && (
                                        <span className="tr-doc-status-sub is-tabular">
                                          {extCopy.hashShortFmt(`${d.recordHash.slice(0, 10)}...`)}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ),
                              };
                            }),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                  ]
                  : []),
                ...(authData
                  ? [
                    ...(authHhSlices.length > 0
                      ? [
                        {
                          key: "auth-hh",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: extCopy.authHhTitlePlot,
                            partTitleFmt: (part, total) =>
                              `${extCopy.authHhTitlePlot}${extCopy.partSuffixFmt(part, total)}`,
                            tableClassName: "tr-doc-table is-auth-hh",
                            thead: (
                              <tr>
                                <th className="col-no">{extCopy.colNo}</th>
                                <th className="col-hh-id">{extCopy.colHhIdentity}</th>
                                <th className="col-gis">{extCopy.colCadastralGis}</th>
                                <th className="col-status">{extCopy.colStatus}</th>
                              </tr>
                            ),
                            rows: authHhSlices.map((slice, sIdx) => {
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
                              return {
                                key: `${hh.householdCode}-${hhNumber}-${sIdx}`,
                                node: (
                                  <tr>
                                    <td className="col-no">
                                      {String(hhNumber).padStart(2, "0")}.
                                    </td>
                                    <td className="col-hh-id">
                                      {!isHouseholdDossier &&
                                        hh.householdCode &&
                                        isSafeTraceCode(hh.householdCode) ? (
                                        <Link
                                          href={`/trace/${encodeURIComponent(hh.householdCode)}`}
                                          className="tr-doc-item-title tr-doc-inline-link"
                                          onClick={() =>
                                            rememberTraceKindHint(hh.householdCode, "household")
                                          }
                                        >
                                          {hh.householdName}
                                          {isContinuation ? extCopy.continuedInlineSuffix : ""}
                                        </Link>
                                      ) : (
                                        <strong className="tr-doc-item-title">
                                          {hh.householdName}
                                          {isContinuation ? extCopy.continuedInlineSuffix : ""}
                                        </strong>
                                      )}
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
                                                  {extCopy.cadastralFmt(p.sheetNo, p.parcelNo)}
                                                  , {formatTraceNumber(p.areaHa || 0, lang)} ha
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
                                ),
                              };
                            }),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                    ...(!hasSeparateFieldAuditSheet && authData.cultivationDiaries.length > 0
                      ? [
                        {
                          key: "auth-diaries",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: extCopy.diariesTitle,
                            partTitleFmt: (part, total) =>
                              `${extCopy.diariesTitle}${extCopy.partSuffixFmt(part, total)}`,
                            tableClassName: "tr-doc-table is-auth-diary",
                            thead: (
                              <tr>
                                <th className="col-date">{extCopy.colDate}</th>
                                <th className="col-hh-plot">{extCopy.colHhPlot}</th>
                                <th className="col-act">{extCopy.colDiaryActivity}</th>
                                <th className="col-status">{extCopy.colStatus}</th>
                              </tr>
                            ),
                            rows: authData.cultivationDiaries.map((d, idx) => {
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
                              const isCoopVerified = d.verificationStatus === "verified";
                              const isHighTrust = isCoopVerified || d.trustLevel === 1;
                              const isReviewTrust = !isCoopVerified && d.trustLevel === 3;
                              const statusTone = mrlFailed
                                ? "is-danger"
                                : d.isLateEntry || isReviewTrust
                                  ? "is-warn"
                                  : isHighTrust
                                    ? "is-ok"
                                    : "is-muted";
                              const statusText = mrlFailed
                                ? extCopy.diaryWarn
                                : isCoopVerified
                                  ? extCopy.diaryHtxVerified
                                  : isReviewTrust
                                    ? extCopy.trustReviewShort
                                    : d.trustLevel === 1
                                      ? extCopy.trustHighShort
                                      : extCopy.diarySelfDeclared;
                              const verifierDisplay = d.verifiedByName || d.verifiedByLabel;
                              const verifyMetaText =
                                isCoopVerified && (verifierDisplay || d.verifiedAt)
                                  ? extCopy.verifiedByFmt(
                                    verifierDisplay || extCopy.diaryHtxVerified,
                                    d.verifiedAt ? formatTraceDate(d.verifiedAt, lang) : null,
                                  )
                                  : null;
                              const mediaUrls = extractSafeMediaUrls(d.photoUrls, d.photoUrl);

                              return {
                                key: `${d.entryOn}-${d.plotCode}-${idx}`,
                                node: (
                                  <tr>
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
                                      {mediaUrls.length > 0 && (
                                        <button
                                          type="button"
                                          className="tr-doc-sub-btn no-print"
                                          onClick={() =>
                                            setTracePreviewMedia({
                                              urls: mediaUrls,
                                              title: d.householdName || extCopy.diariesTitle,
                                              subtitle: `${formatTraceDate(d.entryOn, lang)}, ${compact.title}`,
                                            })
                                          }
                                        >
                                          {hhCommuneCopy.viewPhotosFmt(mediaUrls.length)}
                                        </button>
                                      )}
                                    </td>
                                    <td className={`col-status ${statusTone}`}>
                                      <span>{statusText}</span>
                                      {verifyMetaText && (
                                        <span className="tr-doc-status-sub is-tabular">
                                          {verifyMetaText}
                                        </span>
                                      )}
                                      {d.isLateEntry ? (
                                        <span className="tr-doc-status-sub">
                                          {extCopy.diaryLate}
                                        </span>
                                      ) : d.offlineQueued ? (
                                        <span className="tr-doc-status-sub">
                                          {extCopy.offlineSyncShort}
                                        </span>
                                      ) : null}
                                      {d.signboardQrVerified && (
                                        <span className="tr-doc-status-sub">
                                          {extCopy.signboardShort}
                                        </span>
                                      )}
                                      {d.gpsVerified && (
                                        <span className="tr-doc-status-sub">
                                          {extCopy.gpsShort}
                                        </span>
                                      )}
                                      {d.recordHash && (
                                        <span className="tr-doc-status-sub is-tabular">
                                          {extCopy.hashShortFmt(`${d.recordHash.slice(0, 10)}...`)}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ),
                              };
                            }),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                    ...(!hasSeparateFieldAuditSheet && authData.inspectionMinutes.length > 0
                      ? [
                        {
                          key: "auth-minutes",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: extCopy.minutesTitle,
                            partTitleFmt: (part, total) =>
                              `${extCopy.minutesTitle}${extCopy.partSuffixFmt(part, total)}`,
                            tableClassName: "tr-doc-table is-auth-minutes",
                            thead: (
                              <tr>
                                <th className="col-min-code">{extCopy.colMinuteCode}</th>
                                <th className="col-date">{extCopy.colDate}</th>
                                <th className="col-inspector">{extCopy.colInspectorLoc}</th>
                                <th className="col-plot-ref">{extCopy.colPlotCode}</th>
                                <th className="col-status">{extCopy.colResult}</th>
                              </tr>
                            ),
                            rows: authData.inspectionMinutes.map((m) => {
                              const isFail =
                                m.result === "fail" ||
                                m.result.toLowerCase().includes("không đạt");
                              const locParts = [
                                m.location || null,
                                m.gpsVerified ? extCopy.gpsShort : null,
                              ].filter(Boolean);
                              const minuteMediaUrls = extractSafeMediaUrls(
                                m.photoUrls,
                                m.photoUrl,
                              );
                              return {
                                key: m.code,
                                node: (
                                  <tr>
                                    <td className="col-min-code is-tabular">
                                      <strong>{m.code}</strong>
                                    </td>
                                    <td className="col-date is-tabular">
                                      {formatTraceDate(m.heldOn, lang)}
                                    </td>
                                    <td className="col-inspector">
                                      <strong className="tr-doc-item-title">{m.officer}</strong>
                                      {locParts.length > 0 && (
                                        <span className="tr-doc-item-sub">
                                          {locParts.join(", ")}
                                        </span>
                                      )}
                                      {minuteMediaUrls.length > 0 && (
                                        <button
                                          type="button"
                                          className="tr-doc-sub-btn no-print"
                                          onClick={() =>
                                            setTracePreviewMedia({
                                              urls: minuteMediaUrls,
                                              title: m.code,
                                              subtitle: m.location || undefined,
                                            })
                                          }
                                        >
                                          {hhCommuneCopy.viewPhotosFmt(minuteMediaUrls.length)}
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
                                ),
                              };
                            }),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                    ...(authData.internalViolations.length > 0
                      ? [
                        {
                          key: "auth-violations",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: extCopy.violationsTitle,
                            partTitleFmt: (part, total) =>
                              `${extCopy.violationsTitle}${extCopy.partSuffixFmt(part, total)}`,
                            tableClassName: "tr-doc-table is-auth-violations",
                            thead: (
                              <tr>
                                <th className="col-date">{extCopy.colDate}</th>
                                <th className="col-vio-desc">{extCopy.colViolationDesc}</th>
                                <th className="col-plot-ref">{extCopy.colPlotCode}</th>
                                <th className="col-status">{extCopy.colSeverity}</th>
                              </tr>
                            ),
                            rows: authData.internalViolations.map((v, idx) => {
                              const isCrit = v.severity === "critical";
                              return {
                                key: `${v.detectedOn}-${idx}`,
                                node: (
                                  <tr>
                                    <td className="col-date is-tabular">
                                      {formatTraceDate(v.detectedOn, lang)}
                                    </td>
                                    <td className="col-vio-desc">
                                      <strong className="tr-doc-item-title">{v.title}</strong>
                                      {v.description && (
                                        <span className="tr-doc-item-sub">{v.description}</span>
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
                                ),
                              };
                            }),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                    ...(authData.immutableChangeLogs && authData.immutableChangeLogs.length > 0
                      ? [
                        {
                          key: "auth-immutable",
                          kind: "table",
                          table: {
                            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
                            title: extCopy.immutableTitle,
                            partTitleFmt: (part, total) =>
                              `${extCopy.immutableTitle}${extCopy.partSuffixFmt(part, total)}`,
                            tableClassName: "tr-doc-table is-auth-immutable",
                            thead: (
                              <tr>
                                <th className="col-audit-time">{extCopy.colAuditTime}</th>
                                <th className="col-audit-actor">{extCopy.colAuditActor}</th>
                                <th className="col-audit-diff">{extCopy.colAuditDiff}</th>
                                <th className="col-audit-hash">{extCopy.colAuditHash}</th>
                              </tr>
                            ),
                            rows: authData.immutableChangeLogs.map((log) => {
                              const diffLines = formatImmutableDiffLines(log, lang);
                              const entityTitle = localizeImmutableTableLabel(
                                log.tableName,
                                log.tableLabel,
                                lang,
                              );
                              const isDelete = log.operation === "DELETE";
                              return {
                                key: `imm-${log.id}`,
                                node: (
                                  <tr>
                                    <td className="col-audit-time is-tabular">
                                      <span>{formatTraceDateTime(log.occurredAt, lang)}</span>
                                      <span className="tr-doc-status-sub">
                                        {isDelete ? extCopy.opDelete : extCopy.opUpdate}
                                      </span>
                                    </td>
                                    <td className="col-audit-actor">
                                      <strong className="tr-doc-item-title is-tabular">
                                        {entityTitle}
                                        {log.plotCode ? ` (${log.plotCode})` : ""}
                                      </strong>
                                      <span className="tr-doc-item-sub">{log.actorLabel}</span>
                                    </td>
                                    <td className="col-audit-diff">
                                      <div className="tr-doc-diff-list">
                                        {diffLines.map((line, lIdx) => (
                                          <span
                                            key={`${log.id}-d-${lIdx}`}
                                            className="tr-doc-diff-line"
                                          >
                                            {line}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                    <td
                                      className={`col-audit-hash col-status is-tabular ${isDelete ? "is-danger" : "is-ok"}`}
                                    >
                                      <span>#{log.id}</span>
                                      <span className="tr-doc-status-sub is-tabular">
                                        {log.entryHash.slice(0, 10)}...
                                      </span>
                                    </td>
                                  </tr>
                                ),
                              };
                            }),
                          },
                        } satisfies A4DossierSectionItem,
                      ]
                      : []),
                  ]
                  : []),
                {
                  key: "attestation",
                  content: (
                    <section className="tr-doc-attest-grid">
                      <div className="tr-doc-attest-col is-bordered">
                        <strong className="tr-doc-attest-heading">
                          {isOrchardOrHousehold ? plotCopy.certColHeading : docCopy.certColHeading}
                        </strong>
                        {isOrchardOrHousehold ? (
                          <>
                            <p>PUC: {displayPucCode}</p>
                            {(isHouseholdDossier
                              ? hhDossier?.latestMinuteCode
                              : plotSb?.latestMinuteCode) && (
                                <p>
                                  {plotCopy.fieldRecordPrefix}:{" "}
                                  {isHouseholdDossier
                                    ? hhDossier?.latestMinuteCode
                                    : plotSb?.latestMinuteCode}
                                </p>
                              )}
                            {firstLab && (
                              <p>
                                {docCopy.labUnitPrefix}: {localizeLabName(firstLab.lab, lang)} (
                                {firstLab.code})
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <p>
                              PUC: {displayPucCode} / PHC: {displayPhcCode}
                            </p>
                            {firstLab && (
                              <p>
                                {docCopy.labUnitPrefix}: {localizeLabName(firstLab.lab, lang)} (
                                {firstLab.code})
                              </p>
                            )}
                            {pub.phytosanitary.certNo && (
                              <p>
                                {t.processPhyto.phytoLabel}: {pub.phytosanitary.certNo}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      <div className="tr-doc-attest-col">
                        <strong className="tr-doc-attest-heading">
                          {isOrchardOrHousehold ? plotCopy.termsColHeading : docCopy.termsColHeading}
                        </strong>
                        <p>
                          {isOrchardOrHousehold ? plotCopy.assuranceLine1 : docCopy.assuranceLine1}
                        </p>
                      </div>

                      <div className="tr-doc-sign-col">
                        <span className="tr-doc-sign-kicker">
                          {isOrchardOrHousehold ? plotCopy.issuerHeading : docCopy.issuerHeading}
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
                    <div className="tr-doc-external-audit">
                      <FieldAuditGpsCheckCard
                        scannedCode={pub.lotIdentity.scannedCode || code}
                        data={data.fieldAuditData}
                        coopName={pub.producer.cooperativeName}
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
              defaultRequesterName={
                ac.isAuthenticated && ac.actualTier !== "authority" ? ac.viewerName : null
              }
              externalOpenTrigger={openAccessReqCount}
              onGrantActivated={handleGrantActivated}
              onDeviceBlocked={handleDeviceBlocked}
            />
          </>
        ) : null}
      </main>

      {/* ─── Modal Bản Đồ Vệ Tinh Ranh Giới GIS Thửa Đất (Dành riêng Cấp 3 Cơ quan quản lý) ─── */}
      {gisModalPlot && (
        <PlotMapModal
          plot={gisModalPlot.plot}
          householdName={gisModalPlot.householdName}
          chinaSafe
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
