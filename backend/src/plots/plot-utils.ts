import type { MultiPolygon, Polygon } from "geojson";

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const WGS84_E = Math.sqrt(WGS84_E2);
const DEG_TO_RAD = Math.PI / 180;

function authalicQ(latRad: number): number {
  const sinPhi = Math.sin(latRad);
  const eSin = WGS84_E * sinPhi;
  const oneMinusE2Sin2 = 1 - eSin * eSin;
  if (oneMinusE2Sin2 <= 1e-15) return sinPhi >= 0 ? 2 : -2;
  const atanhTerm = (1 / (2 * WGS84_E)) * Math.log((1 + eSin) / (1 - eSin));
  return (1 - WGS84_E2) * (sinPhi / oneMinusE2Sin2 + atanhTerm);
}

function wrapDeltaRad(dLonRad: number): number {
  let d = dLonRad;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

function ringEllipsoidalAreaSqm(ring: number[][]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const closed =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring
      : [...ring, ring[0]];
  if (closed.length < 4) return 0;

  const q0 = authalicQ(Number(closed[0][1]) * DEG_TO_RAD);
  let prevLon = Number(closed[0][0]) * DEG_TO_RAD;
  let prevQRel = 0;
  let acc = 0;

  for (let i = 1; i < closed.length; i += 1) {
    const lon = Number(closed[i][0]) * DEG_TO_RAD;
    const lat = Number(closed[i][1]) * DEG_TO_RAD;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const qRel = authalicQ(lat) - q0;
    const dLon = wrapDeltaRad(lon - prevLon);
    acc += dLon * (prevQRel + qRel);
    prevLon = lon;
    prevQRel = qRel;
  }

  return Math.abs((WGS84_A * WGS84_A * 0.25) * acc);
}

export function polygonAreaSqm(geometry: Polygon | MultiPolygon): number {
  if (!geometry || typeof geometry !== "object") return 0;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates ?? [];
    if (rings.length === 0) return 0;
    let total = ringEllipsoidalAreaSqm(rings[0]);
    for (let i = 1; i < rings.length; i += 1) {
      total -= ringEllipsoidalAreaSqm(rings[i]);
    }
    return Math.max(0, total);
  }
  if (geometry.type === "MultiPolygon") {
    let sum = 0;
    for (const polyCoords of geometry.coordinates ?? []) {
      if (!polyCoords || polyCoords.length === 0) continue;
      let polyArea = ringEllipsoidalAreaSqm(polyCoords[0]);
      for (let i = 1; i < polyCoords.length; i += 1) {
        polyArea -= ringEllipsoidalAreaSqm(polyCoords[i]);
      }
      sum += Math.max(0, polyArea);
    }
    return sum;
  }
  return 0;
}

export function polygonAreaHa(geometry: Polygon): number {
  return Number((polygonAreaSqm(geometry) / 10_000).toFixed(4));
}
