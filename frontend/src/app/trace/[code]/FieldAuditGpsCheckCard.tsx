"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MediaBottomSheet } from "@/components/ui/MediaBottomSheet";
import { getServerCalibratedDate } from "@/lib/api-client";
import { buildSignedSecurityHeaders } from "@/lib/request-security";
import { isSafeMediaUrl, isSafeTraceCode } from "@/utils/url-safety";
import {
  PaginatedA4Dossier,
  splitCoopHeaderLines,
  type A4DossierSectionItem,
} from "./PaginatedA4Dossier";
import {
  TRACE_UI_COPY,
  formatTraceNumber,
  localizeAdminLocation,
  localizeAssessedBy,
  localizeCoopName,
  localizeMarket,
  localizeOwnerLabel,
  localizeVariety,
  rememberTraceKindHint,
  type TraceLang,
} from "./trace-i18n";

export interface FieldAuditPlotProfile {
  plotCode: string;
  qrToken: string | null;
  zoneCode: string;
  householdRefCode: string;
  ownerLabel: string;
  villageName: string;
  adminLocation: string;
  variety: string;
  plantedYear: number | null;
  areaHa: number;
  treeCount: number;
  status: string;
  sheetNo: string | null;
  parcelNo: string | null;
  centerLat: number | null;
  centerLng: number | null;
  geometryJson: string | null;
}

export interface FieldAuditQuota {
  seasonYear: number;
  maxQuotaKg: number;
  usedKg: number;
  remainingKg: number;
  utilizationPct: number;
  withinQuota: boolean;
  assessedBy: string;
  assessedOn: string | null;
}

export interface FieldAuditPhiSafety {
  safeToHarvestToday: boolean;
  activeIsolationUntil: string | null;
  lastSprayOn: string | null;
  lastPesticideName: string | null;
  lastActiveIngredient: string | null;
  mrlAllPass: boolean;
}

export interface FieldAuditLedgerItem {
  entryOn: string;
  kind: "journal" | "spray";
  activity: string;
  detail: string | null;
  serverRecordedAt: string | null;
  entryDelayHours: number;
  isLateEntry: boolean;
  recordHash: string | null;
  gpsVerified: boolean;
  gpsDistanceM: number | null;
  photoUrl: string | null;
  photoUrls?: string[] | null;
}

export interface FieldAuditInspectionItem {
  code: string;
  heldOn: string;
  location: string;
  officer: string;
  result: string;
  gpsVerified: boolean;
  gpsDistanceM: number | null;
  recordHash: string | null;
  photoUrl: string | null;
  photoUrls?: string[] | null;
}

export interface FieldAuditLinkedLot {
  lotCode: string;
  qrToken: string | null;
  harvestedOn: string | null;
  contributedKg: number;
  market: string;
  status: string;
}

export interface FieldAuditCheckinItem {
  checkedAt: string;
  actorLabel: string;
  insidePolygon: boolean;
  distanceMeters: number | null;
  verified: boolean;
}

export interface FieldAuditDataPayload {
  plotProfile: FieldAuditPlotProfile;
  quota: FieldAuditQuota | null;
  phiSafety: FieldAuditPhiSafety;
  sealedLedger: FieldAuditLedgerItem[];
  inspectionHistory: FieldAuditInspectionItem[];
  linkedLots: FieldAuditLinkedLot[];
  recentGpsCheckins: FieldAuditCheckinItem[];
}

interface GpsVerifyApiResponse {
  verified: boolean;
  insidePolygon: boolean;
  distanceMeters: number | null;
  accuracyMeters: number | null;
  plotCode: string;
  zoneCode: string;
  centerLat: number | null;
  centerLng: number | null;
  actorLabel: string;
  checkedAt: string;
}

interface Props {
  scannedCode: string;
  data: FieldAuditDataPayload;
  coopName?: string;
  auditPass: string | null;
  isAuthenticated: boolean;
  lang: TraceLang;
  formatDate: (dateStr: string | null | undefined, lang: TraceLang) => string;
  formatDateTime: (dateStr: string | null | undefined, lang: TraceLang) => string;
}

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function extractMediaUrls(urls?: string[] | null, single?: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of urls ?? []) {
    if (isSafeMediaUrl(u) && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  if (out.length === 0 && isSafeMediaUrl(single)) {
    out.push(single);
  }
  return out;
}

function sanitizeAuditDetail(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\s*\|\s*/g, ", ")
    .replace(/\s*[–—•·+]\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .trim();
}

function extractOuterRings(
  geometryJson: string | null,
  fallbackLat: number | null,
  fallbackLng: number | null,
): Array<Array<[number, number]>> {
  if (geometryJson) {
    try {
      const parsed = JSON.parse(geometryJson) as {
        type?: string;
        coordinates?: unknown;
      };
      if (
        parsed.type === "Polygon" &&
        Array.isArray(parsed.coordinates) &&
        Array.isArray(parsed.coordinates[0])
      ) {
        const ring = (parsed.coordinates[0] as unknown[])
          .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2)
          .map((pt) => [Number(pt[0]), Number(pt[1])] as [number, number])
          .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
        if (ring.length >= 3) return [ring];
      }
      if (parsed.type === "MultiPolygon" && Array.isArray(parsed.coordinates)) {
        const rings: Array<Array<[number, number]>> = [];
        for (const poly of parsed.coordinates as unknown[]) {
          if (Array.isArray(poly) && Array.isArray(poly[0])) {
            const ring = (poly[0] as unknown[])
              .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2)
              .map((pt) => [Number(pt[0]), Number(pt[1])] as [number, number])
              .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
            if (ring.length >= 3) rings.push(ring);
          }
        }
        if (rings.length > 0) return rings;
      }
    } catch {
      // Bỏ qua nếu JSON ranh giới không hợp lệ
    }
  }

  const cLat = fallbackLat ?? 13.128;
  const cLng = fallbackLng ?? 108.186;
  const dLat = 0.00052;
  const dLng = 0.00062;
  return [
    [
      [cLng - dLng, cLat - dLat],
      [cLng + dLng, cLat - dLat],
      [cLng + dLng, cLat + dLat],
      [cLng - dLng, cLat + dLat],
      [cLng - dLng, cLat - dLat],
    ],
  ];
}

const AUDIT_A4_COPY: Record<
  TraceLang,
  {
    docTitle: string;
    plotSubPrefix: string;
    mapSectionHeading: string;
    specsSectionHeading: string;
    rowOwner: string;
    rowPuc: string;
    rowScale: string;
    rowVariety: string;
    rowPhiStatus: string;
    rowSeasonQuota: string;
    rowAssessedBy: string;
    colNo: string;
    colDate: string;
    colActivity: string;
    colStatus: string;
    colActor: string;
    colCheckTime: string;
    colPosition: string;
    colLotCode: string;
    colMarket: string;
    colWeight: string;
    colMinuteCode: string;
    colInspector: string;
    colResult: string;
    partSuffixFmt: (cur: number, total: number) => string;
    insideParcelText: string;
    viewPhotosFmt: (count: number) => string;
    minutePassText: string;
    footerLeft: string;
    continuedLabel: string;
    pageIndicatorFmt: (cur: number, total: number) => string;
    demoSimulateBtn: string;
  }
> = {
  vi: {
    docTitle: "HỒ SƠ THỰC ĐỊA",
    plotSubPrefix: "THỬA CANH TÁC:",
    mapSectionHeading: "SƠ ĐỒ RANH GIỚI THỬA VƯỜN",
    specsSectionHeading: "THÔNG SỐ ĐỊNH DANH VÀ ĐỊNH MỨC",
    rowOwner: "Chủ hộ canh tác",
    rowPuc: "Mã vùng trồng (PUC)",
    rowScale: "Quy mô thửa",
    rowVariety: "Giống canh tác",
    rowPhiStatus: "Thời gian cách ly",
    rowSeasonQuota: "Định mức đầu vụ",
    rowAssessedBy: "Đơn vị thẩm định",
    colNo: "STT",
    colDate: "NGÀY",
    colActivity: "CÔNG VIỆC CANH TÁC",
    colStatus: "TRẠNG THÁI",
    colActor: "ĐOÀN KIỂM TRA",
    colCheckTime: "THỜI ĐIỂM",
    colPosition: "VỊ TRÍ ĐỐI CHIẾU",
    colLotCode: "MÃ LÔ HÀNG",
    colMarket: "THỊ TRƯỜNG",
    colWeight: "SẢN LƯỢNG GÓP",
    colMinuteCode: "MÃ BIÊN BẢN",
    colInspector: "CÁN BỘ VÀ ĐỊA ĐIỂM",
    colResult: "KẾT LUẬN",
    partSuffixFmt: (c, t) => ` (PHẦN ${c}/${t})`,
    insideParcelText: "Trong thửa (0m)",
    viewPhotosFmt: (n) => (n > 1 ? `Xem ${n} ảnh` : "Xem ảnh thực địa"),
    minutePassText: "Đạt yêu cầu",
    footerLeft: "Hồ sơ kiểm tra thực địa tại vườn - Bảo mật thông tin cá nhân nông hộ",
    continuedLabel: "Xem tiếp trang sau",
    pageIndicatorFmt: (c, t) => `Trang ${String(c).padStart(2, "0")} / ${String(t).padStart(2, "0")}`,
    demoSimulateBtn: "Thử tọa độ mẫu tại vườn",
  },
  en: {
    docTitle: "FIELD AUDIT",
    plotSubPrefix: "ORCHARD PLOT:",
    mapSectionHeading: "PARCEL BOUNDARY DIAGRAM",
    specsSectionHeading: "PLOT IDENTITY & SEASON QUOTA",
    rowOwner: "Member grower",
    rowPuc: "Growing zone (PUC)",
    rowScale: "Parcel scale",
    rowVariety: "Cultivated variety",
    rowPhiStatus: "Withdrawal status",
    rowSeasonQuota: "Seasonal quota",
    rowAssessedBy: "Assessed by",
    colNo: "NO",
    colDate: "DATE",
    colActivity: "CULTIVATION ACTIVITY",
    colStatus: "STATUS",
    colActor: "DELEGATION",
    colCheckTime: "CHECKED AT",
    colPosition: "GPS POSITION",
    colLotCode: "LOT CODE",
    colMarket: "MARKET",
    colWeight: "CONTRIBUTED",
    colMinuteCode: "MINUTE NO",
    colInspector: "INSPECTOR & SITE",
    colResult: "RESULT",
    partSuffixFmt: (c, t) => ` (PART ${c}/${t})`,
    insideParcelText: "Inside parcel (0m)",
    viewPhotosFmt: (n) => (n > 1 ? `View ${n} photos` : "Field photo"),
    minutePassText: "Passed",
    footerLeft: "On-site orchard field audit sheet - Grower personal data protected",
    continuedLabel: "Continued on next page",
    pageIndicatorFmt: (c, t) => `Page ${String(c).padStart(2, "0")} / ${String(t).padStart(2, "0")}`,
    demoSimulateBtn: "Simulate On-Site Fix",
  },
  zh: {
    docTitle: "实地核验单",
    plotSubPrefix: "果园地块:",
    mapSectionHeading: "果园地块边界示意图",
    specsSectionHeading: "地块身份与产季定额",
    rowOwner: "种植主体",
    rowPuc: "注册产区编码",
    rowScale: "核定规模",
    rowVariety: "栽培品种",
    rowPhiStatus: "安全间隔期",
    rowSeasonQuota: "产季定额核销",
    rowAssessedBy: "核定单位",
    colNo: "序号",
    colDate: "日期",
    colActivity: "农事作业记录",
    colStatus: "状态",
    colActor: "核查代表团",
    colCheckTime: "核验时间",
    colPosition: "相对地块位置",
    colLotCode: "批次编号",
    colMarket: "出口市场",
    colWeight: "供货重量",
    colMinuteCode: "笔录编号",
    colInspector: "核查员与地点",
    colResult: "结论",
    partSuffixFmt: (c, t) => `（第 ${c}/${t} 部分）`,
    insideParcelText: "地块内 (0m)",
    viewPhotosFmt: (n) => (n > 1 ? `查看 ${n} 张照片` : "现场照片"),
    minutePassText: "核查合格",
    footerLeft: "果园实地核验专页 - 农户个人隐私受保护",
    continuedLabel: "续见下页",
    pageIndicatorFmt: (c, t) => `第 ${String(c).padStart(2, "0")} / ${String(t).padStart(2, "0")} 页`,
    demoSimulateBtn: "模拟果园现场定位",
  },
};

export default function FieldAuditGpsCheckCard({
  scannedCode,
  data,
  coopName = "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né",
  auditPass,
  isAuthenticated,
  lang,
  formatDate,
  formatDateTime,
}: Props) {
  const t = TRACE_UI_COPY[lang];
  const f = t.fieldAudit;
  const acopy = AUDIT_A4_COPY[lang];
  const { plotProfile, quota, phiSafety } = data;

  const [verifying, setVerifying] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [auditPreviewMedia, setAuditPreviewMedia] = useState<{
    urls: string[];
    title: string;
    subtitle?: string;
  } | null>(null);
  const [liveResult, setLiveResult] = useState<
    (GpsVerifyApiResponse & { userLat: number; userLng: number }) | null
  >(null);
  const [checkins, setCheckins] = useState<FieldAuditCheckinItem[]>(
    () => data.recentGpsCheckins ?? [],
  );

  const svgProjection = useMemo(() => {
    const rings = extractOuterRings(
      plotProfile.geometryJson,
      plotProfile.centerLat,
      plotProfile.centerLng,
    );
    const allPts = rings.flat();
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of allPts) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const spanLng = Math.max(maxLng - minLng, 0.0008);
    const spanLat = Math.max(maxLat - minLat, 0.0008);
    const padLng = spanLng * 0.34;
    const padLat = spanLat * 0.34;

    const boxMinLng = minLng - padLng;
    const boxMaxLng = maxLng + padLng;
    const boxMinLat = minLat - padLat;
    const boxMaxLat = maxLat + padLat;

    const W = 560;
    const H = 310;
    const project = (lng: number, lat: number): [number, number] => {
      const x = ((lng - boxMinLng) / (boxMaxLng - boxMinLng)) * W;
      const y = H - ((lat - boxMinLat) / (boxMaxLat - boxMinLat)) * H;
      return [Number(x.toFixed(1)), Number(y.toFixed(1))];
    };

    const paths = rings.map((ring) => {
      return (
        ring
          .map(([lng, lat], idx) => {
            const [x, y] = project(lng, lat);
            return `${idx === 0 ? "M" : "L"}${x} ${y}`;
          })
          .join(" ") + " Z"
      );
    });

    const vertices = rings[0]
      ? rings[0].slice(0, -1).map(([lng, lat]) => {
          const [x, y] = project(lng, lat);
          return { x, y, lng, lat };
        })
      : [];

    const cLng = plotProfile.centerLng ?? (minLng + maxLng) / 2;
    const cLat = plotProfile.centerLat ?? (minLat + maxLat) / 2;
    const [cx, cy] = project(cLng, cLat);

    const metersPerDegLng = 111_320 * Math.cos((cLat * Math.PI) / 180);
    const deg50m = 50 / Math.max(metersPerDegLng, 1);
    const scalePx = Math.min(140, Math.max(36, (deg50m / (boxMaxLng - boxMinLng)) * W));

    let livePoint: { x: number; y: number; clamped: boolean } | null = null;
    if (liveResult) {
      const [rawX, rawY] = project(liveResult.userLng, liveResult.userLat);
      const clampedX = Math.min(W - 18, Math.max(18, rawX));
      const clampedY = Math.min(H - 18, Math.max(18, rawY));
      livePoint = {
        x: clampedX,
        y: clampedY,
        clamped: Math.abs(clampedX - rawX) > 2 || Math.abs(clampedY - rawY) > 2,
      };
    }

    return {
      W,
      H,
      paths,
      vertices,
      cx,
      cy,
      cLat,
      cLng,
      scalePx: Number(scalePx.toFixed(1)),
      livePoint,
    };
  }, [plotProfile.geometryJson, plotProfile.centerLat, plotProfile.centerLng, liveResult]);

  const submitCoordinatesToServer = async (
    latitude: number,
    longitude: number,
    accuracyMeters?: number,
  ) => {
    if (!isSafeTraceCode(scannedCode)) {
      setGpsError(f.gpsPermissionErr);
      return;
    }
    setVerifying(true);
    setGpsError(null);
    try {
      const endpoint =
        isAuthenticated && !auditPass
          ? `/api/trace/${encodeURIComponent(scannedCode)}/verify-gps`
          : `/api/public/trace/${encodeURIComponent(scannedCode)}/verify-gps`;

      const bodyStr = JSON.stringify({
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
        ...(accuracyMeters !== undefined ? { accuracyMeters: Math.round(accuracyMeters) } : {}),
        ...(auditPass ? { auditPass } : {}),
      });
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...buildSignedSecurityHeaders(
          "POST",
          endpoint,
          bodyStr,
          getServerCalibratedDate().getTime(),
        ),
      };
      if (auditPass) {
        headers["x-audit-pass"] = auditPass;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers,
        body: bodyStr,
      });

      const body = (await res.json().catch(() => null)) as
        | (GpsVerifyApiResponse & { error?: string })
        | null;
      if (!res.ok || !body) {
        setGpsError(body?.error || f.gpsPermissionErr);
        return;
      }

      setLiveResult({
        ...body,
        userLat: latitude,
        userLng: longitude,
      });

      setCheckins((prev) => [
        {
          checkedAt: body.checkedAt,
          actorLabel: body.actorLabel,
          insidePolygon: body.insidePolygon,
          distanceMeters: body.distanceMeters,
          verified: body.verified,
        },
        ...prev.slice(0, 5),
      ]);
    } catch {
      setGpsError(f.gpsPermissionErr);
    } finally {
      setVerifying(false);
    }
  };

  const handleLiveGpsVerify = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError(f.gpsUnsupportedErr);
      return;
    }
    setVerifying(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void submitCoordinatesToServer(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
        );
      },
      () => {
        setVerifying(false);
        setGpsError(f.gpsPermissionErr);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  };

  const handleSimulateDemoAtOrchard = () => {
    void submitCoordinatesToServer(svgProjection.cLat, svgProjection.cLng, 6);
  };

  const coopDisplay = localizeCoopName(coopName, lang);
  const coopLines = splitCoopHeaderLines(coopDisplay, lang);
  const isDemoPass = auditPass?.toUpperCase() === "AUDIT-2026-CN01";

  const checkinChunks = chunkItems(checkins, 5);
  const linkedLotChunks = chunkItems(data.linkedLots, 5);
  const ledgerChunks = chunkItems(data.sealedLedger, 6);
  const minuteChunks = chunkItems(data.inspectionHistory, 5);

  const measureKey = [
    "field-audit-a4",
    plotProfile.plotCode,
    lang,
    Boolean(quota && quota.maxQuotaKg > 0),
    Boolean(liveResult),
    checkins.length,
    data.linkedLots.length,
    data.sealedLedger.length,
    data.inspectionHistory.length,
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
            {coopLines.line2 && <span className="tr-doc-org-line">{coopLines.line2}</span>}
          </strong>
          <span className="tr-doc-org-sub">
            {localizeAdminLocation(plotProfile.adminLocation, lang)}
          </span>
        </div>
      </div>

      <div className="tr-doc-title-block">
        <h2 className="tr-doc-main-title">{acopy.docTitle}</h2>
        <div className="tr-doc-date-line">
          {acopy.plotSubPrefix} <span>{plotProfile.plotCode}</span>
        </div>
      </div>
    </header>
  );

  const headerContNode = (
    <header className="tr-doc-head-cont">
      <strong className="tr-doc-cont-org">{coopDisplay}</strong>
      <span className="tr-doc-cont-meta">
        {acopy.docTitle} / {acopy.plotSubPrefix} {plotProfile.plotCode}
      </span>
    </header>
  );

  const specRows: Array<{ label: string; value: string; tone?: string; href?: string }> = [
    {
      label: acopy.rowOwner,
      value: localizeOwnerLabel(plotProfile.ownerLabel, lang),
      href:
        plotProfile.householdRefCode && isSafeTraceCode(plotProfile.householdRefCode)
          ? `/trace/${encodeURIComponent(plotProfile.householdRefCode)}`
          : undefined,
    },
    {
      label: acopy.rowPuc,
      value: plotProfile.zoneCode,
    },
    {
      label: acopy.rowScale,
      value: f.areaTreesFmt(plotProfile.areaHa, plotProfile.treeCount),
    },
    {
      label: acopy.rowVariety,
      value: `${localizeVariety(plotProfile.variety, lang)}${plotProfile.plantedYear ? ` (${plotProfile.plantedYear})` : ""}`,
    },
    {
      label: acopy.rowPhiStatus,
      value: phiSafety.safeToHarvestToday
        ? f.phiSafeBadge
        : f.phiLockedFmt(
            phiSafety.activeIsolationUntil
              ? formatDate(phiSafety.activeIsolationUntil, lang)
              : null,
          ),
      tone: phiSafety.safeToHarvestToday ? "is-ok" : "is-danger",
    },
  ];

  if (quota && quota.maxQuotaKg > 0) {
    specRows.push({
      label: acopy.rowSeasonQuota,
      value: `${formatTraceNumber(quota.usedKg, lang)} / ${formatTraceNumber(quota.maxQuotaKg, lang)} kg (${quota.utilizationPct}%)`,
      tone: quota.withinQuota ? "is-ok" : "is-danger",
    });
    if (quota.assessedBy) {
      specRows.push({
        label: acopy.rowAssessedBy,
        value: `${localizeAssessedBy(quota.assessedBy, lang)}${quota.assessedOn ? ` (${formatDate(quota.assessedOn, lang)})` : ""}`,
      });
    }
  }

  const sections: A4DossierSectionItem[] = [
    {
      key: "audit-map-and-specs",
      content: (
        <section className="tr-doc-audit-top-split" aria-label={acopy.mapSectionHeading}>
          <div className="tr-doc-audit-map-col">
            <div className="tr-doc-meta-strip">
              <span className="tr-doc-meta-left">{acopy.mapSectionHeading}</span>
              <strong className="tr-doc-meta-right">{plotProfile.plotCode}</strong>
            </div>

            <div className="tr-parcel-svg-frame is-a4-sheet">
              <svg
                viewBox={`0 0 ${svgProjection.W} ${svgProjection.H}`}
                className="tr-parcel-svg"
                role="img"
                aria-label={`${acopy.mapSectionHeading} - ${plotProfile.plotCode}`}
              >
                <defs>
                  <pattern
                    id="pucParcelGridA4"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="#deded8"
                      strokeWidth="0.75"
                    />
                  </pattern>
                </defs>

                <rect width={svgProjection.W} height={svgProjection.H} fill="#f7f7f4" />
                <rect
                  width={svgProjection.W}
                  height={svgProjection.H}
                  fill="url(#pucParcelGridA4)"
                />

                {svgProjection.paths.map((d, idx) => (
                  <path
                    key={idx}
                    d={d}
                    fill="rgba(28, 78, 48, 0.13)"
                    stroke="#1c4e30"
                    strokeWidth="2"
                  />
                ))}

                {svgProjection.vertices.slice(0, 8).map((v, idx) => (
                  <g key={idx}>
                    <rect
                      x={v.x - 3}
                      y={v.y - 3}
                      width="6"
                      height="6"
                      fill="#ffffff"
                      stroke="#1c4e30"
                      strokeWidth="1.5"
                    />
                  </g>
                ))}

                <g transform={`translate(${svgProjection.cx}, ${svgProjection.cy})`}>
                  <circle r="12" fill="rgba(28, 78, 48, 0.12)" />
                  <circle r="4" fill="#1c4e30" stroke="#ffffff" strokeWidth="1.5" />
                  <text
                    x="0"
                    y="-10"
                    textAnchor="middle"
                    fill="#121212"
                    fontSize="11"
                    fontWeight="700"
                  >
                    {plotProfile.plotCode}
                  </text>
                </g>

                {svgProjection.livePoint && (
                  <g
                    transform={`translate(${svgProjection.livePoint.x}, ${svgProjection.livePoint.y})`}
                  >
                    <circle
                      r="15"
                      fill={
                        liveResult?.verified
                          ? "rgba(22, 101, 52, 0.22)"
                          : "rgba(180, 83, 9, 0.2)"
                      }
                    />
                    <circle
                      r="5.5"
                      fill={liveResult?.verified ? "#15803d" : "#b45309"}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x="0"
                      y="18"
                      textAnchor="middle"
                      fill={liveResult?.verified ? "#14532d" : "#7c2d12"}
                      fontSize="10.5"
                      fontWeight="700"
                    >
                      GPS
                    </text>
                  </g>
                )}

                <g transform={`translate(${svgProjection.W - 34}, 30)`}>
                  <rect
                    x="-15"
                    y="-15"
                    width="30"
                    height="30"
                    fill="#ffffff"
                    stroke="#cfcfc9"
                    strokeWidth="1"
                  />
                  <path d="M0 -8 L4.5 5.5 L0 2.5 L-4.5 5.5 Z" fill="#121212" />
                  <text
                    x="0"
                    y="12.5"
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="700"
                    fill="#121212"
                  >
                    {t.zone.coarseCompassNorth}
                  </text>
                </g>

                <g transform={`translate(16, ${svgProjection.H - 20})`}>
                  <line
                    x1="0"
                    y1="0"
                    x2={svgProjection.scalePx}
                    y2="0"
                    stroke="#121212"
                    strokeWidth="1.6"
                  />
                  <line x1="0" y1="-4" x2="0" y2="4" stroke="#121212" strokeWidth="1.4" />
                  <line
                    x1={svgProjection.scalePx}
                    y1="-4"
                    x2={svgProjection.scalePx}
                    y2="4"
                    stroke="#121212"
                    strokeWidth="1.4"
                  />
                  <text x="0" y="-7" fontSize="10" fontWeight="600" fill="#121212">
                    50 m
                  </text>
                </g>
              </svg>

              <div className="tr-parcel-coord-bar">
                <span>
                  {lang === "zh"
                    ? `中心：${svgProjection.cLat.toFixed(5)}°N, ${svgProjection.cLng.toFixed(5)}°E`
                    : lang === "en"
                      ? `Center: ${svgProjection.cLat.toFixed(5)}°N, ${svgProjection.cLng.toFixed(5)}°E`
                      : `Tâm vườn: ${svgProjection.cLat.toFixed(5)}°B, ${svgProjection.cLng.toFixed(5)}°Đ`}
                </span>
                {plotProfile.sheetNo || plotProfile.parcelNo ? (
                  <span>
                    Tờ {plotProfile.sheetNo || "-"} / Thửa {plotProfile.parcelNo || "-"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="tr-doc-audit-spec-col">
            <div className="tr-doc-meta-strip">
              <span className="tr-doc-meta-left">{acopy.specsSectionHeading}</span>
            </div>

            <table className="tr-doc-table is-audit-specs">
              <tbody>
                {specRows.map((sr) => (
                  <tr key={sr.label}>
                    <td className="col-audit-k">{sr.label}</td>
                    <td className={`col-audit-v${sr.tone ? ` ${sr.tone}` : ""}`}>
                      {sr.href ? (
                        <Link
                          href={sr.href}
                          className="tr-doc-code-link"
                          onClick={() =>
                            rememberTraceKindHint(plotProfile.householdRefCode, "household")
                          }
                        >
                          {sr.value}
                        </Link>
                      ) : (
                        sr.value
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ),
    },
    ...checkinChunks.map((ckChunk, cIdx): A4DossierSectionItem => ({
      key: `audit-checkins-${cIdx}`,
      content: (
        <section className="tr-doc-ledger tr-doc-ext-block">
          <div className="tr-doc-meta-strip">
            <span className="tr-doc-meta-left">
              {f.recentCheckinsTitle}
              {checkinChunks.length > 1 ? acopy.partSuffixFmt(cIdx + 1, checkinChunks.length) : ""}
            </span>
          </div>
          <div className="tr-doc-table-wrap">
            <table className="tr-doc-table is-audit-checkins">
              <thead>
                <tr>
                  <th className="col-no">{acopy.colNo}</th>
                  <th className="col-actor">{acopy.colActor}</th>
                  <th className="col-time">{acopy.colCheckTime}</th>
                  <th className="col-pos">{acopy.colPosition}</th>
                </tr>
              </thead>
              <tbody>
                {ckChunk.map((ck, idx) => {
                  const rowNo = cIdx * 5 + idx + 1;
                  return (
                    <tr key={`${ck.checkedAt}-${rowNo}`}>
                      <td className="col-no">{String(rowNo).padStart(2, "0")}.</td>
                      <td className="col-actor">
                        <strong className="tr-doc-item-title">{ck.actorLabel}</strong>
                      </td>
                      <td className="col-time is-tabular">
                        {formatDateTime(ck.checkedAt, lang)}
                      </td>
                      <td className={`col-pos is-tabular ${ck.verified ? "is-ok" : "is-warn"}`}>
                        {ck.insidePolygon
                          ? acopy.insideParcelText
                          : ck.distanceMeters !== null
                            ? `${Math.round(ck.distanceMeters)} m`
                            : "-"}
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
    ...linkedLotChunks.map((lotChunk, lIdx): A4DossierSectionItem => ({
      key: `audit-lots-${lIdx}`,
      content: (
        <section className="tr-doc-ledger tr-doc-ext-block">
          <div className="tr-doc-meta-strip">
            <span className="tr-doc-meta-left">
              {lang === "zh"
                ? "本果园地块关联出口批次"
                : lang === "en"
                  ? "EXPORT LOTS SOURCED FROM THIS PARCEL"
                  : "CÁC LÔ HÀNG XUẤT KHẨU CÓ NGUỒN TỪ THỬA NÀY"}
              {linkedLotChunks.length > 1
                ? acopy.partSuffixFmt(lIdx + 1, linkedLotChunks.length)
                : ""}
            </span>
          </div>
          <div className="tr-doc-table-wrap">
            <table className="tr-doc-table is-audit-lots">
              <thead>
                <tr>
                  <th className="col-no">{acopy.colNo}</th>
                  <th className="col-lot">{acopy.colLotCode}</th>
                  <th className="col-mkt">{acopy.colMarket}</th>
                  <th className="col-date">{acopy.colDate}</th>
                  <th className="col-wt">{acopy.colWeight}</th>
                </tr>
              </thead>
              <tbody>
                {lotChunk.map((lot, idx) => {
                  const rowNo = lIdx * 5 + idx + 1;
                  const href =
                    lot.qrToken && isSafeTraceCode(lot.qrToken)
                      ? `/t/${encodeURIComponent(lot.qrToken)}`
                      : isSafeTraceCode(lot.lotCode)
                        ? `/trace/${encodeURIComponent(lot.lotCode)}`
                        : null;
                  return (
                    <tr key={`${lot.lotCode}-${rowNo}`}>
                      <td className="col-no">{String(rowNo).padStart(2, "0")}.</td>
                      <td className="col-lot is-tabular">
                        {href ? (
                          <Link
                            href={href}
                            className="tr-doc-inline-link"
                            onClick={() => {
                              rememberTraceKindHint(lot.lotCode, "lot");
                              rememberTraceKindHint(lot.qrToken, "lot");
                            }}
                          >
                            {lot.lotCode}
                          </Link>
                        ) : (
                          <strong>{lot.lotCode}</strong>
                        )}
                      </td>
                      <td className="col-mkt">{localizeMarket(lot.market, lang)}</td>
                      <td className="col-date is-tabular">{formatDate(lot.harvestedOn, lang)}</td>
                      <td className="col-wt is-tabular">
                        <strong>{formatTraceNumber(lot.contributedKg, lang)} kg</strong>
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
    ...ledgerChunks.map((lgChunk, lgIdx): A4DossierSectionItem => ({
      key: `audit-ledger-${lgIdx}`,
      content: (
        <section className="tr-doc-ledger tr-doc-ext-block">
          <div className="tr-doc-meta-strip">
            <span className="tr-doc-meta-left">
              {f.sealedDiaryTitle.toUpperCase()}
              {ledgerChunks.length > 1 ? acopy.partSuffixFmt(lgIdx + 1, ledgerChunks.length) : ""}
            </span>
          </div>
          <div className="tr-doc-table-wrap">
            <table className="tr-doc-table is-audit-ledger">
              <thead>
                <tr>
                  <th className="col-no">{acopy.colNo}</th>
                  <th className="col-date">{acopy.colDate}</th>
                  <th className="col-act">{acopy.colActivity}</th>
                  <th className="col-status">{acopy.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {lgChunk.map((entry, idx) => {
                  const rowNo = lgIdx * 6 + idx + 1;
                  const mediaUrls = extractMediaUrls(entry.photoUrls, entry.photoUrl);
                  const cleanDetail = sanitizeAuditDetail(entry.detail);
                  return (
                    <tr key={`${entry.entryOn}-${rowNo}`}>
                      <td className="col-no">{String(rowNo).padStart(2, "0")}.</td>
                      <td className="col-date is-tabular">{formatDate(entry.entryOn, lang)}</td>
                      <td className="col-act">
                        <strong className="tr-doc-item-title">{entry.activity}</strong>
                        {cleanDetail && (
                          <span className="tr-doc-item-sub is-tabular">{cleanDetail}</span>
                        )}
                        {mediaUrls.length > 0 && (
                          <button
                            type="button"
                            className="tr-doc-sub-btn no-print"
                            onClick={() =>
                              setAuditPreviewMedia({
                                urls: mediaUrls,
                                title: plotProfile.ownerLabel || plotProfile.plotCode,
                                subtitle: `${formatDate(entry.entryOn, lang)}, ${entry.activity}`,
                              })
                            }
                          >
                            {acopy.viewPhotosFmt(mediaUrls.length)}
                          </button>
                        )}
                      </td>
                      <td className={`col-status ${entry.isLateEntry ? "is-warn" : "is-ok"}`}>
                        <span>{entry.isLateEntry ? f.lateTag : f.onTimeTag}</span>
                        {entry.gpsVerified && (
                          <span className="tr-doc-status-sub">{f.gpsVerifiedTag}</span>
                        )}
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
    ...minuteChunks.map((mChunk, mIdx): A4DossierSectionItem => ({
      key: `audit-minutes-${mIdx}`,
      content: (
        <section className="tr-doc-ledger tr-doc-ext-block">
          <div className="tr-doc-meta-strip">
            <span className="tr-doc-meta-left">
              {f.sealedMinutesTitle.toUpperCase()}
              {minuteChunks.length > 1 ? acopy.partSuffixFmt(mIdx + 1, minuteChunks.length) : ""}
            </span>
          </div>
          <div className="tr-doc-table-wrap">
            <table className="tr-doc-table is-audit-minutes">
              <thead>
                <tr>
                  <th className="col-min-code">{acopy.colMinuteCode}</th>
                  <th className="col-date">{acopy.colDate}</th>
                  <th className="col-inspector">{acopy.colInspector}</th>
                  <th className="col-status">{acopy.colResult}</th>
                </tr>
              </thead>
              <tbody>
                {mChunk.map((m) => {
                  const mediaUrls = extractMediaUrls(m.photoUrls, m.photoUrl);
                  const isFail =
                    m.result === "fail" || m.result.toLowerCase().includes("không đạt");
                  return (
                    <tr key={m.code}>
                      <td className="col-min-code is-tabular">
                        <strong>{m.code}</strong>
                      </td>
                      <td className="col-date is-tabular">{formatDate(m.heldOn, lang)}</td>
                      <td className="col-inspector">
                        <strong className="tr-doc-item-title">{m.officer}</strong>
                        {m.location && <span className="tr-doc-item-sub">{m.location}</span>}
                        {mediaUrls.length > 0 && (
                          <button
                            type="button"
                            className="tr-doc-sub-btn no-print"
                            onClick={() =>
                              setAuditPreviewMedia({
                                urls: mediaUrls,
                                title: m.code,
                                subtitle: m.location || undefined,
                              })
                            }
                          >
                            {acopy.viewPhotosFmt(mediaUrls.length)}
                          </button>
                        )}
                      </td>
                      <td className={`col-status ${isFail ? "is-danger" : "is-ok"}`}>
                        <span>{m.result === "pass" ? acopy.minutePassText : m.result}</span>
                        {m.gpsVerified && (
                          <span className="tr-doc-status-sub">{f.gpsVerifiedTag}</span>
                        )}
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
  ];

  const renderFooter = (pageIdx: number, totalPages: number) => {
    const isLast = pageIdx === totalPages - 1;
    return (
      <footer className="tr-doc-footer">
        <div className="tr-doc-footer-bar">
          <span>{acopy.footerLeft}</span>
          <span>
            {!isLast ? `${acopy.continuedLabel} ` : ""}
            {acopy.pageIndicatorFmt(pageIdx + 1, totalPages)}
          </span>
        </div>
      </footer>
    );
  };

  return (
    <div className="tr-audit-a4-wrap">
      <PaginatedA4Dossier
        status={phiSafety.safeToHarvestToday ? "valid" : "pending"}
        measureKey={measureKey}
        headerFull={headerFullNode}
        headerContinuation={headerContNode}
        sections={sections}
        renderFooter={renderFooter}
      />

      {/* Thanh công cụ đối chiếu vị trí GPS thực tế đặt ngoài khung tờ giấy A4 */}
      <div className="tr-doc-external-bar tr-audit-gps-bar no-print">
        <div className="tr-doc-ext-group">
          <button
            type="button"
            className="tr-doc-act-btn is-audit-primary"
            onClick={handleLiveGpsVerify}
            disabled={verifying}
          >
            {verifying ? f.gpsVerifyingBtn : f.gpsVerifyBtn}
          </button>

          {isDemoPass && (
            <button
              type="button"
              className="tr-doc-act-btn"
              onClick={handleSimulateDemoAtOrchard}
              disabled={verifying}
            >
              {acopy.demoSimulateBtn}
            </button>
          )}
        </div>

        {(gpsError || liveResult) && (
          <div
            className={`tr-audit-gps-feedback ${gpsError || !liveResult?.verified ? "is-warn" : "is-ok"}`}
            role={gpsError ? "alert" : "status"}
          >
            {gpsError ? (
              <strong>{gpsError}</strong>
            ) : liveResult ? (
              <span>
                <strong>
                  {liveResult.insidePolygon
                    ? f.gpsInsideTitle
                    : liveResult.verified
                      ? f.gpsNearTitle(Math.round(liveResult.distanceMeters ?? 0))
                      : f.gpsOutsideTitle(Math.round(liveResult.distanceMeters ?? 0))}
                </strong>{" "}
                ({liveResult.userLat.toFixed(5)}°N, {liveResult.userLng.toFixed(5)}°E,{" "}
                {f.gpsAccuracyFmt(liveResult.accuracyMeters)})
              </span>
            ) : null}
          </div>
        )}
      </div>

      {auditPreviewMedia && (
        <MediaBottomSheet
          urls={auditPreviewMedia.urls}
          title={auditPreviewMedia.title}
          subtitle={auditPreviewMedia.subtitle}
          onClose={() => setAuditPreviewMedia(null)}
        />
      )}
    </div>
  );
}
