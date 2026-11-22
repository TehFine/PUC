"use client";

import { useState } from "react";
import { TRACE_UI_COPY, type TraceLang } from "./trace-i18n";

export interface CoarseZoneOverviewMapProps {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  zoom?: number;
  label: string;
  privacyNote: string;
  pucCode: string;
  adminLocation?: string;
  lang?: TraceLang;
}

/**
 * Bản đồ vùng trồng khái quát dạng Vector nội tuyến (Zero External Network Requests):
 * - Tuyệt đối không gọi Google Maps (mt*.google.com) hay dịch vụ bản đồ bên ngoài bị chặn tại Trung Quốc (4e).
 * - Không tải thư viện bản đồ nặng trên mạng di động yếu; hiển thị tức thì < 1 khung hình.
 * - Chỉ hiển thị phạm vi vùng trồng khái quát cấp xã (tọa độ làm tròn 2 chữ số thập phân ~1.1km),
 *   không bao giờ lộ ranh giới từng thửa đất cá nhân (Mục 1 & Mục 2).
 */
export default function CoarseZoneOverviewMap({
  centerLat,
  centerLng,
  radiusMeters,
  label,
  privacyNote,
  pucCode,
  adminLocation,
  lang = "vi",
}: CoarseZoneOverviewMapProps) {
  const [mode, setMode] = useState<"terrain" | "grid">("terrain");
  const t = TRACE_UI_COPY[lang].zone;

  const safeLat = Number.isFinite(centerLat) ? Number(centerLat.toFixed(2)) : 13.13;
  const safeLng = Number.isFinite(centerLng) ? Number(centerLng.toFixed(2)) : 108.19;
  const radiusKm = Math.max(1, Number(((radiusMeters || 2500) / 1000).toFixed(1)));

  const latTop = (safeLat + 0.02).toFixed(2);
  const latMid = safeLat.toFixed(2);
  const latBot = (safeLat - 0.02).toFixed(2);
  const lngLeft = (safeLng - 0.03).toFixed(2);
  const lngMid = safeLng.toFixed(2);
  const lngRight = (safeLng + 0.03).toFixed(2);

  const dirLat = lang === "vi" ? "B" : "N";
  const dirLng = lang === "vi" ? "Đ" : "E";
  const effectiveNote = lang === "vi" && privacyNote ? privacyNote : t.coarsePrivacyNote;
  const roadLabel =
    lang === "zh" ? "14号国道走廊" : lang === "en" ? "National Highway 14 Corridor" : "Trục Quốc lộ 14";
  const plateauLabel =
    lang === "zh"
      ? "Đắk Lắk 红玄武岩高原产区 (560m)"
      : lang === "en"
        ? "Đắk Lắk Basalt Plateau (560m)"
        : "Cao nguyên đất đỏ Bazan Đắk Lắk (560m)";

  return (
    <div className="tr-coarse-map-block">
      <div className="tr-coarse-map-head">
        <span className="tr-coarse-map-title">{t.coarseMapTitle(pucCode)}</span>
        <div className="tr-coarse-map-tabs" role="group" aria-label={t.coarseMapTitle(pucCode)}>
          <button
            type="button"
            className={`tr-coarse-map-tab ${mode === "terrain" ? "is-active" : ""}`}
            onClick={() => setMode("terrain")}
          >
            {t.coarseTabTerrain}
          </button>
          <button
            type="button"
            className={`tr-coarse-map-tab ${mode === "grid" ? "is-active" : ""}`}
            onClick={() => setMode("grid")}
          >
            {t.coarseTabGrid}
          </button>
        </div>
      </div>

      <div className="tr-coarse-map-canvas is-svg-schematic" role="img" aria-label={label}>
        <svg
          viewBox="0 0 680 244"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="puc-ZoneHatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <line x1="0" y1="0" x2="0" y2="12" stroke="#1c4e30" strokeWidth="1" strokeOpacity="0.11" />
            </pattern>
            <radialGradient id="puc-ZoneGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#166534" stopOpacity="0.18" />
              <stop offset="72%" stopColor="#166534" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#166534" stopOpacity="0.02" />
            </radialGradient>
          </defs>

          {/* Nền bản đồ giấy kỹ thuật Thụy Sĩ */}
          <rect x="0" y="0" width="680" height="244" fill={mode === "terrain" ? "#f4f5f0" : "#f7f7f5"} />

          {/* Lưới kinh vĩ độ khái quát (làm tròn 2 chữ số thập phân) */}
          <g stroke={mode === "grid" ? "#d3d5ce" : "#e3e5de"} strokeWidth={mode === "grid" ? "1" : "0.8"}>
            <line x1="136" y1="0" x2="136" y2="244" strokeDasharray={mode === "grid" ? undefined : "3 3"} />
            <line x1="340" y1="0" x2="340" y2="244" strokeDasharray={mode === "grid" ? undefined : "3 3"} />
            <line x1="544" y1="0" x2="544" y2="244" strokeDasharray={mode === "grid" ? undefined : "3 3"} />
            <line x1="0" y1="48" x2="680" y2="48" strokeDasharray={mode === "grid" ? undefined : "3 3"} />
            <line x1="0" y1="122" x2="680" y2="122" strokeDasharray={mode === "grid" ? undefined : "3 3"} />
            <line x1="0" y1="196" x2="680" y2="196" strokeDasharray={mode === "grid" ? undefined : "3 3"} />
          </g>

          {/* Lớp đường đồng mức địa hình cao nguyên Bazan & thủy văn khái quát */}
          {mode === "terrain" && (
            <g fill="none">
              <path
                d="M-20,38 C110,14 235,64 370,36 C495,10 590,46 700,26"
                stroke="#d8dfd5"
                strokeWidth="1.2"
              />
              <path
                d="M-20,86 C95,62 210,108 355,78 C485,52 585,96 700,74"
                stroke="#d2dbd0"
                strokeWidth="1.2"
              />
              <path
                d="M-20,172 C125,148 250,192 395,166 C515,144 605,182 700,162"
                stroke="#d2dbd0"
                strokeWidth="1.2"
              />
              <path
                d="M-15,214 C140,195 275,228 420,204 C540,184 615,216 700,202"
                stroke="#d8dfd5"
                strokeWidth="1.1"
              />
              {/* Suối tự nhiên khái quát */}
              <path
                d="M52,0 C78,66 118,98 164,142 C204,180 232,212 254,244"
                stroke="#bcd3dc"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              {/* Hành lang giao thông liên vùng QL14 */}
              <path
                d="M112,244 L262,0"
                stroke="#dedad0"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M112,244 L262,0"
                stroke="#b9b3a6"
                strokeWidth="1.2"
                strokeDasharray="6 4"
              />
              <text
                x="162"
                y="194"
                fill="#7b776d"
                fontSize="9.5"
                fontWeight="500"
                transform="rotate(-58 162 194)"
              >
                {roadLabel}
              </text>
              <text x="458" y="34" fill="#6f7a70" fontSize="10" fontWeight="500">
                {plateauLabel}
              </text>
            </g>
          )}

          {/* Vòng tròn phạm vi vùng trồng khái quát R = 2.5km */}
          <circle cx="340" cy="122" r="76" fill="url(#puc-ZoneGlow)" />
          <circle cx="340" cy="122" r="76" fill="url(#puc-ZoneHatch)" />
          <circle
            cx="340"
            cy="122"
            r="76"
            fill="none"
            stroke="#1c4e30"
            strokeWidth="1.8"
            strokeDasharray="6 4"
          />

          {/* Đường kính bán kính minh họa R = 2.5 km */}
          <line
            x1="340"
            y1="122"
            x2="416"
            y2="122"
            stroke="#1c4e30"
            strokeWidth="1.1"
            strokeDasharray="2 2"
          />
          <rect x="352" y="106" width="56" height="14" fill="#ffffff" fillOpacity="0.9" />
          <text x="380" y="116" textAnchor="middle" fill="#1c4e30" fontSize="9.5" fontWeight="600">
            R ≈ {radiusKm} km
          </text>

          {/* Tâm vùng trồng (chỉ ở mức khái quát cấp xã) */}
          <circle cx="340" cy="122" r="13" fill="#1c4e30" fillOpacity="0.18" />
          <circle cx="340" cy="122" r="5.5" fill="#1c4e30" stroke="#ffffff" strokeWidth="2" />

          {/* Nhãn định danh mã PUC nổi */}
          <g transform="translate(226, 52)">
            <rect
              x="0"
              y="0"
              width="228"
              height="44"
              fill="#ffffff"
              stroke="#121212"
              strokeWidth="1"
            />
            <text x="114" y="17" textAnchor="middle" fill="#121212" fontSize="11.5" fontWeight="700">
              {pucCode}
            </text>
            <text x="114" y="33" textAnchor="middle" fill="#575753" fontSize="10" fontWeight="500">
              {safeLat.toFixed(2)}°{dirLat}, {safeLng.toFixed(2)}°{dirLng} ({t.coarseCenterTag})
            </text>
          </g>

          {/* Nhãn tọa độ khái quát trên khung lưới */}
          <g fill="#757570" fontSize="9.5" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            <text x="8" y="44">{latTop}°{dirLat}</text>
            <text x="8" y="118">{latMid}°{dirLat}</text>
            <text x="8" y="192">{latBot}°{dirLat}</text>
            <text x="140" y="237">{lngLeft}°{dirLng}</text>
            <text x="344" y="237">{lngMid}°{dirLng}</text>
            <text x="548" y="237">{lngRight}°{dirLng}</text>
          </g>

          {/* Hoa gió chỉ hướng Bắc */}
          <g transform="translate(638, 34)">
            <circle cx="0" cy="0" r="16" fill="#ffffff" stroke="#cfcfc9" strokeWidth="1" />
            <polygon points="0,-11 4,3 0,0 -4,3" fill="#121212" />
            <text x="0" y="12" textAnchor="middle" fill="#121212" fontSize="8.5" fontWeight="700">
              {t.coarseCompassNorth}
            </text>
          </g>

          {/* Thước tỷ lệ khái quát góc phải dưới */}
          <g transform="translate(534, 206)">
            <rect x="0" y="0" width="132" height="26" fill="#ffffff" fillOpacity="0.94" stroke="#cfcfc9" strokeWidth="1" />
            <line x1="12" y1="16" x2="72" y2="16" stroke="#121212" strokeWidth="1.8" />
            <line x1="12" y1="12" x2="12" y2="19" stroke="#121212" strokeWidth="1.5" />
            <line x1="72" y1="12" x2="72" y2="19" stroke="#121212" strokeWidth="1.5" />
            <text x="80" y="17" fill="#121212" fontSize="9.5" fontWeight="600">
              {radiusKm} km
            </text>
          </g>

          {adminLocation && (
            <g transform="translate(12, 206)">
              <rect x="0" y="0" width="268" height="24" fill="#ffffff" fillOpacity="0.92" stroke="#deded9" strokeWidth="1" />
              <text x="10" y="15.5" fill="#3a3a37" fontSize="10" fontWeight="500">
                {adminLocation.length > 42 ? `${adminLocation.slice(0, 42)}…` : adminLocation}
              </text>
            </g>
          )}
        </svg>
      </div>

      <p className="tr-coarse-map-note">{effectiveNote}</p>
    </div>
  );
}
