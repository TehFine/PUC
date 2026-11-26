"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { preconnectMapTileOrigins } from "@/components/map/map-layers";
import { MediaBottomSheet } from "@/components/ui/MediaBottomSheet";
import { toast } from "@/components/ui/Toast";
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
  getTraceEmptyText,
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
  treeCount: number | null;
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
  trustLevel?: number | null;
  trustFlags?: string[] | null;
  offlineQueued?: boolean;
  signboardQrVerified?: boolean;
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
  insidePolygon: boolean | null;
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
  insidePolygon: boolean | null;
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

const ESRI_TILE_HOSTS = ["server.arcgisonline.com", "services.arcgisonline.com"] as const;

function lngToWorldPx(lng: number, z: number): number {
  return ((lng + 180) / 360) * 256 * 2 ** z;
}

function latToWorldPx(lat: number, z: number): number {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clampedLat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 256 * 2 ** z;
}

interface ProjectedSatelliteTile {
  key: string;
  url: string;
  x: number;
  y: number;
  size: number;
}

function buildProjectedTileGrid(
  z: number,
  centerLng: number,
  centerLat: number,
  effZoom: number,
  width: number,
  height: number,
): ProjectedSatelliteTile[] {
  const n = 2 ** z;
  const tileScale = 2 ** (effZoom - z);
  const centerWx = lngToWorldPx(centerLng, z);
  const centerWy = latToWorldPx(centerLat, z);
  const halfSpanWx = width / (2 * tileScale);
  const halfSpanWy = height / (2 * tileScale);

  const minTx = Math.floor((centerWx - halfSpanWx) / 256);
  const maxTx = Math.floor((centerWx + halfSpanWx) / 256);
  const minTy = Math.floor((centerWy - halfSpanWy) / 256);
  const maxTy = Math.floor((centerWy + halfSpanWy) / 256);
  const tileDrawSize = Number((256 * tileScale + 0.75).toFixed(2));

  const tiles: ProjectedSatelliteTile[] = [];
  for (let ty = minTy; ty <= maxTy; ty += 1) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      const wrappedTx = ((tx % n) + n) % n;
      const host = ESRI_TILE_HOSTS[Math.abs(wrappedTx + ty) % ESRI_TILE_HOSTS.length];
      const x = Number((width / 2 + (tx * 256 - centerWx) * tileScale).toFixed(2));
      const y = Number((height / 2 + (ty * 256 - centerWy) * tileScale).toFixed(2));
      tiles.push({
        key: `${z}-${tx}-${ty}`,
        url: `https://${host}/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${wrappedTx}`,
        x,
        y,
        size: tileDrawSize,
      });
    }
  }
  return tiles;
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
    rowSheetParcel: string;
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
    mapSectionHeading: "BẢN ĐỒ VỆ TINH RANH GIỚI THỬA VƯỜN",
    specsSectionHeading: "THÔNG SỐ ĐỊNH DANH VÀ ĐỊNH MỨC",
    rowOwner: "Chủ hộ canh tác",
    rowPuc: "Mã vùng trồng (PUC)",
    rowScale: "Quy mô thửa",
    rowVariety: "Giống canh tác",
    rowSheetParcel: "Số tờ / Số thửa địa chính",
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
    mapSectionHeading: "SATELLITE PARCEL BOUNDARY MAP",
    specsSectionHeading: "PLOT IDENTITY & SEASON QUOTA",
    rowOwner: "Member grower",
    rowPuc: "Growing zone (PUC)",
    rowScale: "Parcel scale",
    rowVariety: "Cultivated variety",
    rowSheetParcel: "Cadastral sheet / parcel",
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
    mapSectionHeading: "果园地块卫星边界图",
    specsSectionHeading: "地块身份与产季定额",
    rowOwner: "种植主体",
    rowPuc: "注册产区编码",
    rowScale: "核定规模",
    rowVariety: "栽培品种",
    rowSheetParcel: "地籍图号 / 地块号",
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
  const [localCheckins, setLocalCheckins] = useState<FieldAuditCheckinItem[]>([]);

  const checkins = useMemo(() => {
    const serverList = data.recentGpsCheckins ?? [];
    if (localCheckins.length === 0) return serverList;
    const seen = new Set(serverList.map((c) => c.checkedAt));
    const freshLocal = localCheckins.filter((c) => !seen.has(c.checkedAt));
    return [...freshLocal, ...serverList].slice(0, 30);
  }, [data.recentGpsCheckins, localCheckins]);

  useEffect(() => {
    preconnectMapTileOrigins({ chinaSafe: true });
  }, []);

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

    const W = 716;
    const H = 330;
    const midLng = (minLng + maxLng) / 2;
    const midLat = (minLat + maxLat) / 2;

    const dx18 = Math.max(lngToWorldPx(maxLng, 18) - lngToWorldPx(minLng, 18), 36);
    const dy18 = Math.max(latToWorldPx(minLat, 18) - latToWorldPx(maxLat, 18), 36);
    const idealScaleAt18 = Math.min((W * 0.56) / dx18, (H * 0.64) / dy18);
    const effZoom = Math.max(14, Math.min(18.7, 18 + Math.log2(idealScaleAt18)));
    const zTile = Math.min(18, Math.floor(effZoom));
    const zFallback = Math.min(16, zTile);
    const tileScale = 2 ** (effZoom - zTile);

    const centerWx = lngToWorldPx(midLng, zTile);
    const centerWy = latToWorldPx(midLat, zTile);
    const project = (lng: number, lat: number): [number, number] => {
      const x = W / 2 + (lngToWorldPx(lng, zTile) - centerWx) * tileScale;
      const y = H / 2 + (latToWorldPx(lat, zTile) - centerWy) * tileScale;
      return [Number(x.toFixed(1)), Number(y.toFixed(1))];
    };

    const fallbackTiles = buildProjectedTileGrid(zFallback, midLng, midLat, effZoom, W, H);
    const detailTiles =
      zTile > zFallback ? buildProjectedTileGrid(zTile, midLng, midLat, effZoom, W, H) : [];

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

    const cLng = plotProfile.centerLng ?? midLng;
    const cLat = plotProfile.centerLat ?? midLat;
    const [cx, cy] = project(cLng, cLat);

    const metersPerSvgPx =
      (156_543.03392 * Math.cos((cLat * Math.PI) / 180)) / Math.max(2 ** effZoom, 1);
    let scaleMeters = 50;
    if (50 / metersPerSvgPx > 150) {
      scaleMeters = 25;
    } else if (50 / metersPerSvgPx < 42) {
      scaleMeters = 100;
    }
    const scalePx = Math.min(160, Math.max(40, scaleMeters / Math.max(metersPerSvgPx, 0.05)));

    let livePoint: { x: number; y: number; clamped: boolean } | null = null;
    if (liveResult) {
      const [rawX, rawY] = project(liveResult.userLng, liveResult.userLat);
      const clampedX = Math.min(W - 24, Math.max(24, rawX));
      let clampedY = Math.min(H - 26, Math.max(22, rawY));
      // Tránh đè lên thước tỷ lệ góc dưới trái và kim chỉ Bắc góc trên phải
      if (clampedX < scalePx + 42 && clampedY > H - 56) {
        clampedY = H - 58;
      }
      if (clampedX > W - 64 && clampedY < 58) {
        clampedY = 60;
      }
      livePoint = {
        x: Number(clampedX.toFixed(1)),
        y: Number(clampedY.toFixed(1)),
        clamped: Math.abs(clampedX - rawX) > 2 || Math.abs(clampedY - rawY) > 2,
      };
    }

    return {
      W,
      H,
      fallbackTiles,
      detailTiles,
      paths,
      vertices,
      cx,
      cy,
      cLat,
      cLng,
      scaleMeters,
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

      setLocalCheckins((prev) => [
        {
          checkedAt: body.checkedAt,
          actorLabel: body.actorLabel,
          insidePolygon: body.insidePolygon,
          distanceMeters: body.distanceMeters,
          verified: body.verified,
        },
        ...prev.slice(0, 29),
      ]);
      toast.success(
        lang === "en"
          ? "GPS location verified"
          : lang === "zh"
            ? "已完成GPS实地核验"
            : "Đã đối chiếu vị trí GPS",
      );
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
  const isDemoPass =
    process.env.NODE_ENV !== "production" && auditPass?.toUpperCase() === "AUDIT-2026-CN01";

  const measureKey = [
    "field-audit-a4",
    plotProfile.plotCode,
    plotProfile.zoneCode,
    plotProfile.areaHa,
    plotProfile.treeCount,
    plotProfile.status,
    lang,
    phiSafety.safeToHarvestToday ? "phi-ok" : `phi-lock:${phiSafety.activeIsolationUntil || ""}`,
    quota
      ? `${quota.seasonYear}:${quota.usedKg}:${quota.maxQuotaKg}:${quota.withinQuota}`
      : "no-quota",
    liveResult ? `${liveResult.checkedAt}:${liveResult.verified}` : "no-live",
    checkins.length,
    checkins[0]?.checkedAt || "",
    data.linkedLots.length,
    data.linkedLots.map((l) => `${l.lotCode}:${l.contributedKg}`).join(","),
    data.sealedLedger.length,
    data.sealedLedger[0]?.recordHash || data.sealedLedger[0]?.entryOn || "",
    data.inspectionHistory.length,
    data.inspectionHistory[0]?.code || "",
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
      value: plotProfile.zoneCode || getTraceEmptyText("notRegistered", lang),
    },
    {
      label: acopy.rowScale,
      value: f.areaTreesFmt(plotProfile.areaHa, plotProfile.treeCount),
    },
    {
      label: acopy.rowVariety,
      value: `${localizeVariety(plotProfile.variety, lang)}${plotProfile.plantedYear ? ` (${plotProfile.plantedYear})` : ""}`,
    },
    ...(plotProfile.sheetNo || plotProfile.parcelNo
      ? [
        {
          label: acopy.rowSheetParcel,
          value:
            lang === "zh"
              ? `第 ${plotProfile.sheetNo || "-"} 图 / 第 ${plotProfile.parcelNo || "-"} 号`
              : lang === "en"
                ? `Sheet ${plotProfile.sheetNo || "-"} / Parcel ${plotProfile.parcelNo || "-"}`
                : `Tờ ${plotProfile.sheetNo || "-"} / Thửa ${plotProfile.parcelNo || "-"}`,
        },
      ]
      : []),
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

  const satelliteMapSection: A4DossierSectionItem = {
    key: "audit-satellite-map",
    content: (
      <section className="tr-doc-ledger tr-doc-ext-block" aria-label={acopy.mapSectionHeading}>
        <div className="tr-doc-meta-strip">
          <span className="tr-doc-meta-left">{acopy.mapSectionHeading}</span>
          <strong className="tr-doc-meta-right">{plotProfile.plotCode}</strong>
        </div>

        <div className="tr-parcel-svg-frame is-a4-sheet">
          <svg
            viewBox={`0 0 ${svgProjection.W} ${svgProjection.H}`}
            width={svgProjection.W}
            height={svgProjection.H}
            className="tr-parcel-svg"
            role="img"
            aria-label={`${acopy.mapSectionHeading} - ${plotProfile.plotCode}`}
          >
            <rect width={svgProjection.W} height={svgProjection.H} fill="#1b281f" />

            {svgProjection.fallbackTiles.map((tile) => (
              <image
                key={tile.key}
                href={tile.url}
                x={tile.x}
                y={tile.y}
                width={tile.size}
                height={tile.size}
                preserveAspectRatio="none"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ))}

            {svgProjection.detailTiles.map((tile) => (
              <image
                key={tile.key}
                href={tile.url}
                x={tile.x}
                y={tile.y}
                width={tile.size}
                height={tile.size}
                preserveAspectRatio="none"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ))}

            <rect
              width={svgProjection.W}
              height={svgProjection.H}
              fill="rgba(8, 16, 11, 0.08)"
            />

            {svgProjection.paths.map((d, idx) => (
              <g key={idx}>
                <path
                  d={d}
                  fill="rgba(134, 239, 172, 0.14)"
                  stroke="rgba(10, 18, 12, 0.72)"
                  strokeWidth="4.2"
                  strokeLinejoin="round"
                />
                <path
                  d={d}
                  fill="none"
                  stroke="#bef264"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
              </g>
            ))}

            {svgProjection.vertices.slice(0, 12).map((v, idx) => (
              <rect
                key={idx}
                x={v.x - 3}
                y={v.y - 3}
                width="6"
                height="6"
                fill="#ffffff"
                stroke="#14372f"
                strokeWidth="1.5"
              />
            ))}

            <g transform={`translate(${svgProjection.cx}, ${svgProjection.cy})`}>
              <circle r="11" fill="rgba(190, 242, 100, 0.24)" />
              <circle r="4.5" fill="#bef264" stroke="#121212" strokeWidth="1.6" />
              <text
                x="0"
                y="-10"
                textAnchor="middle"
                fill="#ffffff"
                stroke="rgba(10, 18, 12, 0.88)"
                strokeWidth="3.4"
                strokeLinejoin="round"
                style={{ paintOrder: "stroke" }}
                fontSize="12"
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
                  r="14"
                  fill={
                    liveResult?.verified
                      ? "rgba(34, 197, 94, 0.34)"
                      : "rgba(245, 158, 11, 0.36)"
                  }
                />
                <circle
                  r="5.5"
                  fill={liveResult?.verified ? "#22c55e" : "#f59e0b"}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <text
                  x="0"
                  y="17"
                  textAnchor="middle"
                  fill="#ffffff"
                  stroke="rgba(10, 18, 12, 0.9)"
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                  style={{ paintOrder: "stroke" }}
                  fontSize="10.5"
                  fontWeight="700"
                >
                  GPS
                </text>
              </g>
            )}

            <g transform={`translate(${svgProjection.W - 32}, 28)`}>
              <rect
                x="-15"
                y="-15"
                width="30"
                height="30"
                fill="rgba(255, 255, 255, 0.92)"
                stroke="rgba(18, 18, 18, 0.28)"
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

            <g transform={`translate(16, ${svgProjection.H - 18})`}>
              <line
                x1="0"
                y1="0"
                x2={svgProjection.scalePx}
                y2="0"
                stroke="rgba(10, 18, 12, 0.8)"
                strokeWidth="3.8"
              />
              <line
                x1="0"
                y1="0"
                x2={svgProjection.scalePx}
                y2="0"
                stroke="#ffffff"
                strokeWidth="1.8"
              />
              <line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="#ffffff" strokeWidth="1.8" />
              <line
                x1={svgProjection.scalePx}
                y1="-4.5"
                x2={svgProjection.scalePx}
                y2="4.5"
                stroke="#ffffff"
                strokeWidth="1.8"
              />
              <text
                x="0"
                y="-7.5"
                fontSize="10.5"
                fontWeight="700"
                fill="#ffffff"
                stroke="rgba(10, 18, 12, 0.88)"
                strokeWidth="3"
                strokeLinejoin="round"
                style={{ paintOrder: "stroke" }}
              >
                {svgProjection.scaleMeters} m
              </text>
            </g>
          </svg>

          <div className="tr-parcel-coord-bar">
            <span>
              {lang === "zh"
                ? `地块中心坐标：${svgProjection.cLat.toFixed(5)}°N, ${svgProjection.cLng.toFixed(5)}°E`
                : lang === "en"
                  ? `Parcel center: ${svgProjection.cLat.toFixed(5)}°N, ${svgProjection.cLng.toFixed(5)}°E`
                  : `Tâm vườn: ${svgProjection.cLat.toFixed(5)}°B, ${svgProjection.cLng.toFixed(5)}°Đ`}
            </span>
            {plotProfile.sheetNo || plotProfile.parcelNo ? (
              <span>
                {lang === "zh"
                  ? `第 ${plotProfile.sheetNo || "-"} 图 / 第 ${plotProfile.parcelNo || "-"} 号`
                  : lang === "en"
                    ? `Sheet ${plotProfile.sheetNo || "-"} / Parcel ${plotProfile.parcelNo || "-"}`
                    : `Tờ ${plotProfile.sheetNo || "-"} / Thửa ${plotProfile.parcelNo || "-"}`}
              </span>
            ) : null}
          </div>
        </div>
      </section>
    ),
  };

  const linkedLotsTitle =
    lang === "zh"
      ? "本果园地块关联出口批次"
      : lang === "en"
        ? "EXPORT LOTS SOURCED FROM THIS PARCEL"
        : "CÁC LÔ HÀNG XUẤT KHẨU CÓ NGUỒN TỪ THỬA NÀY";

  const sections: A4DossierSectionItem[] = [
    {
      key: "audit-specs",
      kind: "table",
      table: {
        sectionClassName: "tr-doc-ledger tr-doc-ext-block",
        ariaLabel: acopy.specsSectionHeading,
        title: acopy.specsSectionHeading,
        partTitleFmt: (part, total) =>
          `${acopy.specsSectionHeading}${acopy.partSuffixFmt(part, total)}`,
        metaRight: plotProfile.plotCode,
        tableClassName: "tr-doc-table is-audit-specs",
        rows: specRows.map((sr) => ({
          key: sr.label,
          node: (
            <tr>
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
          ),
        })),
      },
    },
    satelliteMapSection,
    ...(checkins.length > 0
      ? [
        {
          key: "audit-checkins",
          kind: "table",
          table: {
            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
            title: f.recentCheckinsTitle,
            partTitleFmt: (part, total) =>
              `${f.recentCheckinsTitle}${acopy.partSuffixFmt(part, total)}`,
            tableClassName: "tr-doc-table is-audit-checkins",
            thead: (
              <tr>
                <th className="col-no">{acopy.colNo}</th>
                <th className="col-actor">{acopy.colActor}</th>
                <th className="col-time">{acopy.colCheckTime}</th>
                <th className="col-pos">{acopy.colPosition}</th>
              </tr>
            ),
            rows: checkins.map((ck, idx) => {
              const rowNo = idx + 1;
              return {
                key: `${ck.checkedAt}-${rowNo}`,
                node: (
                  <tr>
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
                ),
              };
            }),
          },
        } satisfies A4DossierSectionItem,
      ]
      : []),
    ...(data.linkedLots.length > 0
      ? [
        {
          key: "audit-lots",
          kind: "table",
          table: {
            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
            title: linkedLotsTitle,
            partTitleFmt: (part, total) =>
              `${linkedLotsTitle}${acopy.partSuffixFmt(part, total)}`,
            tableClassName: "tr-doc-table is-audit-lots",
            thead: (
              <tr>
                <th className="col-no">{acopy.colNo}</th>
                <th className="col-lot">{acopy.colLotCode}</th>
                <th className="col-mkt">{acopy.colMarket}</th>
                <th className="col-date">{acopy.colDate}</th>
                <th className="col-wt">{acopy.colWeight}</th>
              </tr>
            ),
            rows: data.linkedLots.map((lot, idx) => {
              const rowNo = idx + 1;
              const href =
                lot.qrToken && isSafeTraceCode(lot.qrToken)
                  ? `/t/${encodeURIComponent(lot.qrToken)}`
                  : isSafeTraceCode(lot.lotCode)
                    ? `/trace/${encodeURIComponent(lot.lotCode)}`
                    : null;
              return {
                key: `${lot.lotCode}-${rowNo}`,
                node: (
                  <tr>
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
                ),
              };
            }),
          },
        } satisfies A4DossierSectionItem,
      ]
      : []),
    ...(data.sealedLedger.length > 0
      ? [
        {
          key: "audit-ledger",
          kind: "table",
          table: {
            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
            title: f.sealedDiaryTitle.toUpperCase(),
            partTitleFmt: (part, total) =>
              `${f.sealedDiaryTitle.toUpperCase()}${acopy.partSuffixFmt(part, total)}`,
            tableClassName: "tr-doc-table is-audit-ledger",
            thead: (
              <tr>
                <th className="col-no">{acopy.colNo}</th>
                <th className="col-date">{acopy.colDate}</th>
                <th className="col-act">{acopy.colActivity}</th>
                <th className="col-status">{acopy.colStatus}</th>
              </tr>
            ),
            rows: data.sealedLedger.map((entry, idx) => {
              const rowNo = idx + 1;
              const mediaUrls = extractMediaUrls(entry.photoUrls, entry.photoUrl);
              const cleanDetail = sanitizeAuditDetail(entry.detail);
              return {
                key: `${entry.entryOn}-${rowNo}`,
                node: (
                  <tr>
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
                    <td
                      className={`col-status ${
                        entry.isLateEntry || entry.trustLevel === 3 ? "is-warn" : "is-ok"
                      }`}
                    >
                      <span>{entry.isLateEntry ? f.lateTag : f.onTimeTag}</span>
                      {entry.signboardQrVerified && (
                        <span className="tr-doc-status-sub">
                          {lang === "zh"
                            ? "地块码核对一致"
                            : lang === "en"
                              ? "Plot QR matched"
                              : "Khớp QR thửa"}
                        </span>
                      )}
                      {entry.gpsVerified && (
                        <span className="tr-doc-status-sub">{f.gpsVerifiedTag}</span>
                      )}
                      {entry.recordHash && (
                        <span className="tr-doc-status-sub is-tabular">
                          {lang === "zh"
                            ? `防伪哈希: ${entry.recordHash.slice(0, 10)}...`
                            : lang === "en"
                              ? `Seal: ${entry.recordHash.slice(0, 10)}...`
                              : `Niêm phong: ${entry.recordHash.slice(0, 10)}...`}
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
    ...(data.inspectionHistory.length > 0
      ? [
        {
          key: "audit-minutes",
          kind: "table",
          table: {
            sectionClassName: "tr-doc-ledger tr-doc-ext-block",
            title: f.sealedMinutesTitle.toUpperCase(),
            partTitleFmt: (part, total) =>
              `${f.sealedMinutesTitle.toUpperCase()}${acopy.partSuffixFmt(part, total)}`,
            tableClassName: "tr-doc-table is-audit-minutes",
            thead: (
              <tr>
                <th className="col-min-code">{acopy.colMinuteCode}</th>
                <th className="col-date">{acopy.colDate}</th>
                <th className="col-inspector">{acopy.colInspector}</th>
                <th className="col-status">{acopy.colResult}</th>
              </tr>
            ),
            rows: data.inspectionHistory.map((m) => {
              const mediaUrls = extractMediaUrls(m.photoUrls, m.photoUrl);
              const isFail =
                m.result === "fail" || m.result.toLowerCase().includes("không đạt");
              return {
                key: m.code,
                node: (
                  <tr>
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
                ),
              };
            }),
          },
        } satisfies A4DossierSectionItem,
      ]
      : []),
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
