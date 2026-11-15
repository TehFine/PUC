"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Compass,
  ExternalLink,
  FileCheck2,
  Lock,
  MapPin,
  Navigation,
  ShieldAlert,
  ShieldCheck,
} from "@/components/ui/PublicIcon";
import { TRACE_UI_COPY, type TraceLang } from "./trace-i18n";
import { isSafeMediaUrl } from "@/utils/url-safety";

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
  auditPass: string | null;
  isAuthenticated: boolean;
  lang: TraceLang;
  formatDate: (dateStr: string | null | undefined, lang: TraceLang) => string;
  formatDateTime: (dateStr: string | null | undefined, lang: TraceLang) => string;
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
      if (parsed.type === "Polygon" && Array.isArray(parsed.coordinates) && Array.isArray(parsed.coordinates[0])) {
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

export default function FieldAuditGpsCheckCard({
  scannedCode,
  data,
  auditPass,
  isAuthenticated,
  lang,
  formatDate,
  formatDateTime,
}: Props) {
  const t = TRACE_UI_COPY[lang];
  const f = t.fieldAudit;
  const { plotProfile, quota, phiSafety } = data;

  const [verifying, setVerifying] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
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

    // Thanh thước tỷ lệ 50m
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
    setVerifying(true);
    setGpsError(null);
    try {
      const endpoint =
        isAuthenticated && !auditPass
          ? `/api/trace/${encodeURIComponent(scannedCode)}/verify-gps`
          : `/api/public/trace/${encodeURIComponent(scannedCode)}/verify-gps`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      };
      if (auditPass) {
        headers["x-audit-pass"] = auditPass;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
          ...(accuracyMeters !== undefined ? { accuracyMeters: Math.round(accuracyMeters) } : {}),
          ...(auditPass ? { auditPass } : {}),
        }),
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
    const lat = svgProjection.cLat;
    const lng = svgProjection.cLng;
    void submitCoordinatesToServer(lat, lng, 6);
  };

  const numberLocale = lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : "vi-VN";
  const isDemoPass = auditPass?.toUpperCase() === "AUDIT-2026-CN01";

  return (
    <section className="tr-ext-section tr-field-audit-section" aria-labelledby="field-audit-heading">
      <div className="tr-ext-header">
        <div>
          <span className="tr-ext-kicker">{f.cardKicker}</span>
          <h2 id="field-audit-heading" className="tr-ext-title">
            {f.cardTitleFmt(plotProfile.plotCode)}
          </h2>
        </div>
        <span className="tr-badge-green">
          <Lock size={12} strokeWidth={2.2} style={{ marginRight: 5 }} aria-hidden="true" />
          {f.privacyBadge}
        </span>
      </div>

      <p className="tr-card-sub" style={{ marginTop: -4, marginBottom: 14 }}>
        {f.privacySub}
      </p>

      {/* Lưới 2 cột: Cột trái Bản đồ Đa giác GIS & Đối chứng GPS thực địa; Cột phải Thông số thửa + Trần sản lượng Mass-Balance */}
      <div className="tr-ext-two-col">
        {/* Cột 1: Bản đồ ranh giới đa giác GIS & Check-in GPS trực tiếp */}
        <div className="tr-card tr-gps-audit-card">
          <div className="tr-card-header">
            <h3 className="tr-card-title">{f.gpsMapTitle}</h3>
            <span className="tr-count-badge is-mono">{plotProfile.plotCode}</span>
          </div>

          <div className="tr-parcel-svg-frame">
            <svg
              viewBox={`0 0 ${svgProjection.W} ${svgProjection.H}`}
              className="tr-parcel-svg"
              role="img"
              aria-label={`${f.gpsMapTitle} - ${plotProfile.plotCode}`}
            >
              <defs>
                <pattern id="pucParcelGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="#deded8"
                    strokeWidth="0.75"
                  />
                </pattern>
              </defs>

              <rect width={svgProjection.W} height={svgProjection.H} fill="#f6f7f3" />
              <rect width={svgProjection.W} height={svgProjection.H} fill="url(#pucParcelGrid)" />

              {/* Đa giác ranh giới thửa đất đã đăng ký */}
              {svgProjection.paths.map((d, idx) => (
                <path
                  key={idx}
                  d={d}
                  fill="rgba(28, 78, 48, 0.14)"
                  stroke="#1c4e30"
                  strokeWidth="2.2"
                />
              ))}

              {/* Các mốc đỉnh tọa độ địa chính */}
              {svgProjection.vertices.slice(0, 8).map((v, idx) => (
                <g key={idx}>
                  <rect
                    x={v.x - 3.2}
                    y={v.y - 3.2}
                    width="6.4"
                    height="6.4"
                    fill="#ffffff"
                    stroke="#1c4e30"
                    strokeWidth="1.6"
                  />
                </g>
              ))}

              {/* Tâm thửa định danh */}
              <g transform={`translate(${svgProjection.cx}, ${svgProjection.cy})`}>
                <circle r="14" fill="rgba(28, 78, 48, 0.12)" />
                <circle r="4.5" fill="#1c4e30" stroke="#ffffff" strokeWidth="1.6" />
                <text
                  x="0"
                  y="-10"
                  textAnchor="middle"
                  fill="#121212"
                  fontSize="11"
                  fontWeight="600"
                >
                  {plotProfile.plotCode}
                </text>
              </g>

              {/* Vị trí điện thoại đối chứng GPS thời gian thực */}
              {svgProjection.livePoint && (
                <g transform={`translate(${svgProjection.livePoint.x}, ${svgProjection.livePoint.y})`}>
                  <circle
                    r="16"
                    fill={
                      liveResult?.verified
                        ? "rgba(22, 101, 52, 0.22)"
                        : "rgba(180, 83, 9, 0.2)"
                    }
                  />
                  <circle
                    r="6"
                    fill={liveResult?.verified ? "#15803d" : "#b45309"}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    x="0"
                    y="19"
                    textAnchor="middle"
                    fill={liveResult?.verified ? "#14532d" : "#7c2d12"}
                    fontSize="10.5"
                    fontWeight="700"
                  >
                    GPS
                  </text>
                </g>
              )}

              {/* Kim chỉ hướng Bắc */}
              <g transform={`translate(${svgProjection.W - 34}, 30)`}>
                <rect
                  x="-16"
                  y="-16"
                  width="32"
                  height="32"
                  fill="#ffffff"
                  stroke="#cfcfc9"
                  strokeWidth="1"
                />
                <path d="M0 -9 L5 6 L0 3 L-5 6 Z" fill="#121212" />
                <text
                  x="0"
                  y="13"
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="700"
                  fill="#121212"
                >
                  {t.zone.coarseCompassNorth}
                </text>
              </g>

              {/* Thước tỷ lệ 50 m */}
              <g transform={`translate(16, ${svgProjection.H - 22})`}>
                <line
                  x1="0"
                  y1="0"
                  x2={svgProjection.scalePx}
                  y2="0"
                  stroke="#121212"
                  strokeWidth="1.8"
                />
                <line x1="0" y1="-4" x2="0" y2="4" stroke="#121212" strokeWidth="1.5" />
                <line
                  x1={svgProjection.scalePx}
                  y1="-4"
                  x2={svgProjection.scalePx}
                  y2="4"
                  stroke="#121212"
                  strokeWidth="1.5"
                />
                <text x="0" y="-7" fontSize="10" fontWeight="600" fill="#121212">
                  50 m
                </text>
              </g>
            </svg>

            <div className="tr-parcel-coord-bar">
              <span>
                WGS84: {svgProjection.cLat.toFixed(5)}°N, {svgProjection.cLng.toFixed(5)}°E
              </span>
              {plotProfile.sheetNo || plotProfile.parcelNo ? (
                <span>
                  Tờ {plotProfile.sheetNo || "-"} / Thửa {plotProfile.parcelNo || "-"}
                </span>
              ) : (
                <span>{plotProfile.zoneCode}</span>
              )}
            </div>
          </div>

          <div className="tr-gps-action-row no-print">
            <button
              type="button"
              className="tr-gps-verify-btn"
              onClick={handleLiveGpsVerify}
              disabled={verifying}
            >
              <Navigation size={16} strokeWidth={2.2} aria-hidden="true" />
              <span>{verifying ? f.gpsVerifyingBtn : f.gpsVerifyBtn}</span>
            </button>

            {isDemoPass && (
              <button
                type="button"
                className="tr-gps-demo-btn"
                onClick={handleSimulateDemoAtOrchard}
                disabled={verifying}
              >
                <Compass size={15} strokeWidth={2} aria-hidden="true" />
                <span>
                  {lang === "zh"
                    ? "模拟果园现场定位（电脑端演示）"
                    : lang === "en"
                      ? "Simulate On-Site Fix (Demo)"
                      : "Thử tọa độ mẫu tại vườn (Demo)"}
                </span>
              </button>
            )}
          </div>

          {gpsError && (
            <div className="tr-gps-verdict is-warn" role="alert">
              <ShieldAlert size={17} strokeWidth={2.1} aria-hidden="true" />
              <div>
                <strong>{gpsError}</strong>
              </div>
            </div>
          )}

          {liveResult && (
            <div
              className={`tr-gps-verdict ${liveResult.verified ? "is-pass" : "is-warn"}`}
              role="status"
            >
              {liveResult.verified ? (
                <CheckCircle2 size={18} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <MapPin size={18} strokeWidth={2.2} aria-hidden="true" />
              )}
              <div className="tr-gps-verdict-body">
                <strong>
                  {liveResult.insidePolygon
                    ? f.gpsInsideTitle
                    : liveResult.verified
                      ? f.gpsNearTitle(Math.round(liveResult.distanceMeters ?? 0))
                      : f.gpsOutsideTitle(Math.round(liveResult.distanceMeters ?? 0))}
                </strong>
                <span>
                  {liveResult.userLat.toFixed(5)}°N, {liveResult.userLng.toFixed(5)}°E -{" "}
                  {f.gpsAccuracyFmt(liveResult.accuracyMeters)} -{" "}
                  {formatDateTime(liveResult.checkedAt, lang)}
                </span>
              </div>
            </div>
          )}

          {/* Nhật ký các lượt đoàn khách check-in GPS gần đây */}
          <div className="tr-gps-log-box">
            <div className="tr-gps-log-head">{f.recentCheckinsTitle}</div>
            {checkins.length === 0 ? (
              <div className="tr-gps-log-empty">{f.noCheckinsYet}</div>
            ) : (
              <div className="tr-gps-log-list">
                {checkins.slice(0, 4).map((ck, idx) => (
                  <div key={`${ck.checkedAt}-${idx}`} className="tr-gps-log-row">
                    <span className="tr-gps-log-actor">{ck.actorLabel}</span>
                    <span className="tr-gps-log-meta">
                      {ck.insidePolygon
                        ? lang === "zh"
                          ? "地块内 (0m)"
                          : lang === "en"
                            ? "Inside (0m)"
                            : "Trong thửa (0m)"
                        : ck.distanceMeters !== null
                          ? `${Math.round(ck.distanceMeters)} m`
                          : "-"}{" "}
                      - {formatDateTime(ck.checkedAt, lang)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cột 2: Thông số thửa vườn + An toàn cách ly PHI + Thanh hạn ngạch sản lượng Mass-Balance */}
        <div className="tr-card">
          <div className="tr-card-header">
            <h3 className="tr-card-title">{f.plotSpecsTitle}</h3>
            <span className={phiSafety.safeToHarvestToday ? "tr-badge-green" : "tr-badge-red"}>
              {phiSafety.safeToHarvestToday
                ? f.phiSafeBadge
                : f.phiLockedFmt(
                    phiSafety.activeIsolationUntil
                      ? formatDate(phiSafety.activeIsolationUntil, lang)
                      : null,
                  )}
            </span>
          </div>

          <div className="tr-data-list">
            <div className="tr-data-row">
              <span className="tr-data-label">{f.farmerRepLabel}</span>
              <strong className="tr-data-val">{plotProfile.ownerLabel}</strong>
            </div>
            <div className="tr-data-row">
              <span className="tr-data-label">{f.pucZoneLabel}</span>
              <strong className="tr-data-val highlight">{plotProfile.zoneCode}</strong>
            </div>
            <div className="tr-data-row">
              <span className="tr-data-label">{f.areaTreesLabel}</span>
              <strong className="tr-data-val highlight">
                {f.areaTreesFmt(plotProfile.areaHa, plotProfile.treeCount)}
              </strong>
            </div>
            <div className="tr-data-row">
              <span className="tr-data-label">{f.varietyYearLabel}</span>
              <strong className="tr-data-val">
                {plotProfile.variety}
                {plotProfile.plantedYear ? ` (${plotProfile.plantedYear})` : ""}
              </strong>
            </div>
          </div>

          {/* Khối Trần sản lượng đầu vụ Mass-Balance của riêng thửa này */}
          {quota && (
            <div className="tr-quota-meter-block">
              <div className="tr-quota-meter-head">
                <strong>{f.quotaTitle}</strong>
                <span className="tr-quota-pct">
                  {f.quotaUsedFmt(
                    quota.usedKg.toLocaleString(numberLocale),
                    quota.maxQuotaKg.toLocaleString(numberLocale),
                    quota.utilizationPct,
                  )}
                </span>
              </div>
              <div className="tr-quota-track" role="progressbar" aria-valuenow={quota.utilizationPct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`tr-quota-fill ${quota.utilizationPct > 92 ? "is-high" : ""}`}
                  style={{ width: `${Math.min(100, Math.max(2, quota.utilizationPct))}%` }}
                />
              </div>
              <div className="tr-quota-foot">
                <span>
                  {f.quotaAssessedFmt(
                    quota.assessedBy,
                    quota.assessedOn ? formatDate(quota.assessedOn, lang) : String(quota.seasonYear),
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Các lô xuất khẩu đã thu hái từ thửa đất này */}
          {data.linkedLots.length > 0 && (
            <div className="tr-linked-lots-box">
              <div className="tr-gps-log-head">
                {lang === "zh"
                  ? "本果园地块关联出口批次"
                  : lang === "en"
                    ? "Export Lots Sourced from This Parcel"
                    : "Các lô hàng xuất khẩu có nguồn từ thửa này"}
              </div>
              <div className="tr-linked-lots-list">
                {data.linkedLots.map((lot) => {
                  const href = lot.qrToken
                    ? `/t/${encodeURIComponent(lot.qrToken)}`
                    : `/trace/${encodeURIComponent(lot.lotCode)}`;
                  return (
                    <Link key={lot.lotCode} href={href} className="tr-linked-lot-item">
                      <div>
                        <strong className="is-mono">{lot.lotCode}</strong>
                        <span>
                          {" "}
                          - {lot.contributedKg.toLocaleString(numberLocale)} kg (
                          {formatDate(lot.harvestedOn, lang)})
                        </span>
                      </div>
                      <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bảng Sổ cái canh tác & thuốc BVTV niêm phong SHA-256 + Biên bản kiểm tra thực địa */}
      <div className="tr-ext-two-col">
        <div className="tr-card">
          <div className="tr-card-header">
            <h3 className="tr-card-title">{f.sealedDiaryTitle}</h3>
            <span className="tr-count-badge">{data.sealedLedger.length}</span>
          </div>

          {data.sealedLedger.length === 0 ? (
            <div className="tr-farmer-empty">{f.emptyRecords}</div>
          ) : (
            <div className="tr-sealed-ledger-list">
              {data.sealedLedger.slice(0, 8).map((entry, idx) => (
                <div key={`${entry.entryOn}-${idx}`} className="tr-sealed-ledger-item">
                  <div className="tr-sealed-ledger-top">
                    <strong className="tr-sealed-activity">{entry.activity}</strong>
                    <span className="tr-minute-date">{formatDate(entry.entryOn, lang)}</span>
                  </div>
                  {entry.detail && <div className="tr-minute-result">{entry.detail}</div>}
                  <div className="tr-sealed-tags">
                    <span className={entry.isLateEntry ? "tr-seal-tag is-warn" : "tr-seal-tag is-ok"}>
                      {entry.isLateEntry ? f.lateTag : f.onTimeTag}
                    </span>
                    {entry.gpsVerified && (
                      <span className="tr-seal-tag is-ok">{f.gpsVerifiedTag}</span>
                    )}
                    {entry.recordHash && (
                      <span className="tr-seal-hash" title={`SHA-256: ${entry.recordHash}`}>
                        <ShieldCheck size={12} strokeWidth={2.2} aria-hidden="true" />
                        SHA-256 #{entry.recordHash.slice(0, 10)}
                      </span>
                    )}
                    {isSafeMediaUrl(entry.photoUrl) && (
                      <a
                        href={entry.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tr-inline-link"
                      >
                        {lang === "zh" ? "现场照片" : lang === "en" ? "Field Photo" : "Xem ảnh thực địa"}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tr-card">
          <div className="tr-card-header">
            <h3 className="tr-card-title">{f.sealedMinutesTitle}</h3>
            <span className="tr-count-badge">{data.inspectionHistory.length}</span>
          </div>

          {data.inspectionHistory.length === 0 ? (
            <div className="tr-farmer-empty">{f.emptyRecords}</div>
          ) : (
            <div className="tr-sealed-ledger-list">
              {data.inspectionHistory.map((m) => (
                <div key={m.code} className="tr-sealed-ledger-item">
                  <div className="tr-sealed-ledger-top">
                    <strong className="tr-sealed-activity is-mono">{m.code}</strong>
                    <span className="tr-minute-date">{formatDate(m.heldOn, lang)}</span>
                  </div>
                  <div className="tr-minute-meta">
                    {m.officer} - {m.location}
                  </div>
                  <div className="tr-sealed-tags">
                    <span className={m.result === "fail" ? "tr-seal-tag is-warn" : "tr-seal-tag is-ok"}>
                      <FileCheck2 size={12} strokeWidth={2.2} aria-hidden="true" />
                      {m.result === "pass"
                        ? lang === "zh"
                          ? "核查合格"
                          : lang === "en"
                            ? "Passed"
                            : "Đạt yêu cầu"
                        : m.result}
                    </span>
                    {m.gpsVerified && <span className="tr-seal-tag is-ok">{f.gpsVerifiedTag}</span>}
                    {m.recordHash && (
                      <span className="tr-seal-hash" title={`SHA-256: ${m.recordHash}`}>
                        SHA-256 #{m.recordHash.slice(0, 10)}
                      </span>
                    )}
                    {isSafeMediaUrl(m.photoUrl) && (
                      <a
                        href={m.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tr-inline-link"
                      >
                        {lang === "zh" ? "巡检实拍" : lang === "en" ? "Inspection Photo" : "Ảnh kiểm tra"}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

