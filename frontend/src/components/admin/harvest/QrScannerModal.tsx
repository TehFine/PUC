"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import jsQR from "jsqr";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Lock,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { formatVn } from "@/components/admin/catalog/form-utils";
import { ALLOWED_IMAGE_MIMES } from "@/components/portal/shared/media";
import { FormError, Modal } from "@/components/ui/Modal";
import { ROLE_LABELS } from "@/constants/roles";
import { api, errorMessage } from "@/lib/api-client";
import type { Role } from "@/types/api";
import { safeDecodeURIComponent } from "@/utils/url-safety";

interface ScopedTraceResponse {
  verifiedAt: string;
  accessControl: {
    viewerTier: "public" | "enterprise" | "authority";
    actualTier: "public" | "enterprise" | "authority";
    viewerTierLabel: string;
    isAuthenticated: boolean;
    viewerRole: Role | null;
    viewerName: string | null;
    scopeDenied?: boolean;
    scopeDeniedMessage?: string | null;
    scopeReason?: string | null;
    auditLogged: boolean;
  };
  publicData: {
    lotIdentity: {
      productName: string;
      variety: string;
      lotCode: string;
      qrToken?: string | null;
      scannedCode: string;
      weightTons: number;
      market: string;
      status: string;
      statusLabel: string;
    };
    growingZone: {
      name: string;
      pucCode: string;
      adminLocation: string;
      status: string;
      statusLabel: string;
    };
    packhouse: {
      name: string;
      code: string;
      status?: string;
      statusLabel?: string;
    };
    realtimeStatus?: {
      hasSuspensionAlert: boolean;
      pucCode: string;
      pucStatusLabel: string;
      packhouseCode: string;
      packhouseStatusLabel: string;
    };
    labTests: Array<{
      code: string;
      sampledOn: string;
      result: string;
    }>;
  };
  enterpriseData?: {
    sourceZones: Array<{
      zoneCode: string;
      villageName: string;
      householdCount: number;
      weightKg: number;
      sharePct: number;
    }>;
    totalSourceWeightKg: number;
    detailedLabTests: Array<{ code: string; result: string }>;
  };
  authorityData?: {
    sourceHouseholds: Array<{
      householdCode: string;
      householdName: string;
      villageName: string;
      phone: string;
      contributedKg: number | null;
      contributedPlotCode?: string | null;
    }>;
    cultivationDiaries: Array<unknown>;
    inspectionMinutes: Array<unknown>;
    internalViolations: Array<unknown>;
  };
}

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

/** Trích xuất token chống giả hoặc mã lô từ chuỗi nội dung QR (/t/<token>, /trace/<code> hoặc mã thuần). */
export function extractTraceTokenFromQrPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tokenMatch = /(?:^|\/)t\/([A-Za-z0-9_-]{4,80})(?:[/?#]|$)/.exec(trimmed);
  if (tokenMatch?.[1]) {
    return safeDecodeURIComponent(tokenMatch[1]).trim();
  }

  const traceMatch = /(?:^|\/)trace\/([^/?#\s]+)(?:[/?#]|$)/.exec(trimmed);
  if (traceMatch?.[1]) {
    return safeDecodeURIComponent(traceMatch[1]).trim();
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return safeDecodeURIComponent(last).trim();
    } catch {
      return null;
    }
  }

  return trimmed.slice(0, 80);
}

export default function QrScannerModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [result, setResult] = useState<ScopedTraceResponse | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const busyLookupRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const fetchAuthenticatedTrace = useCallback(
    async (rawPayload: string) => {
      const token = extractTraceTokenFromQrPayload(rawPayload);
      if (!token) {
        setLookupError("Không đọc được mã hợp lệ từ nội dung vừa quét.");
        return;
      }
      if (busyLookupRef.current) return;
      busyLookupRef.current = true;
      stopCamera();
      setLoading(true);
      setLookupError(null);
      setScannedToken(token);

      try {
        const res = await api.get<ScopedTraceResponse>(`/trace/${encodeURIComponent(token)}`);
        setResult(res);
      } catch (err) {
        setResult(null);
        setLookupError(errorMessage(err, `Không tìm thấy hồ sơ truy xuất cho mã "${token}".`));
      } finally {
        setLoading(false);
        busyLookupRef.current = false;
      }
    },
    [stopCamera],
  );

  useEffect(() => {
    if (mode !== "camera" || result || loading) {
      stopCamera();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Trình duyệt hoặc kết nối hiện tại không hỗ trợ mở camera trực tiếp. Bạn có thể chọn ảnh chụp mã QR hoặc nhập mã thủ công.",
      );
      return;
    }

    let cancelled = false;
    setCameraError(null);

    let detector: BarcodeDetectorLike | null = null;
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => BarcodeDetectorLike })
          .BarcodeDetector;
        detector = new Ctor({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // Một số trình duyệt mobile tự phát qua autoPlay
          }
        }
        setCameraReady(true);

        scanTimerRef.current = window.setInterval(async () => {
          if (cancelled || busyLookupRef.current) return;
          const v = videoRef.current;
          const c = canvasRef.current;
          if (!v || !c || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return;

          if (detector) {
            try {
              const codes = await detector.detect(v);
              const firstVal = codes[0]?.rawValue?.trim();
              if (firstVal) {
                void fetchAuthenticatedTrace(firstVal);
                return;
              }
            } catch {
              // Chuyển sang giải mã bằng jsQR trên canvas
            }
          }

          const targetW = Math.min(640, v.videoWidth);
          const scale = targetW / v.videoWidth;
          const targetH = Math.max(1, Math.round(v.videoHeight * scale));
          c.width = targetW;
          c.height = targetH;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(v, 0, 0, targetW, targetH);
          const imageData = ctx.getImageData(0, 0, targetW, targetH);
          const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          if (decoded?.data?.trim()) {
            void fetchAuthenticatedTrace(decoded.data);
          }
        }, 200);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError(
            "Không cấp được quyền truy cập camera. Vui lòng cho phép quyền máy ảnh trên trình duyệt, hoặc bấm chọn ảnh chụp mã QR bên dưới.",
          );
        }
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [mode, result, loading, stopCamera, fetchAuthenticatedTrace]);

  const handleImageFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
      setLookupError("Chỉ hỗ trợ ảnh chụp mã QR định dạng JPG, PNG hoặc WEBP.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setLookupError("Ảnh chụp mã QR không được vượt quá 15 MB.");
      return;
    }

    setLookupError(null);
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      try {
        const canvas = canvasRef.current ?? document.createElement("canvas");
        const maxDim = 1200;
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setLookupError("Không khởi tạo được bộ đọc ảnh QR.");
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const decoded = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
        if (!decoded?.data?.trim()) {
          setLookupError("Không tìm thấy mã QR rõ nét trong bức ảnh đã chọn. Vui lòng chụp gần hơn hoặc nhập mã lô in trên nhãn.");
          return;
        }
        void fetchAuthenticatedTrace(decoded.data);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setLookupError("Không đọc được tệp hình ảnh đã chọn.");
    };
    img.src = objectUrl;
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) {
      setLookupError("Vui lòng dán đường dẫn QR hoặc nhập mã lô hàng.");
      return;
    }
    void fetchAuthenticatedTrace(manualInput);
  };

  const handleResetScan = () => {
    setResult(null);
    setLookupError(null);
    setScannedToken(null);
  };

  const fullDossierHref = result
    ? result.publicData.lotIdentity.qrToken
      ? `/t/${encodeURIComponent(result.publicData.lotIdentity.qrToken)}`
      : `/trace/${encodeURIComponent(result.publicData.lotIdentity.lotCode)}`
    : null;

  return (
    <Modal
      title="Quét QR truy xuất trong hệ thống"
      onClose={() => {
        stopCamera();
        onClose();
      }}
      width={680}
      footer={
        <>
          {result && (
            <button type="button" className="btn btn-outline" onClick={handleResetScan}>
              <RefreshCw size={14} />
              <span>Quét mã tiếp theo</span>
            </button>
          )}
          {fullDossierHref && (
            <Link
              href={fullDossierHref}
              className="btn btn-primary"
              onClick={() => {
                stopCamera();
                onClose();
              }}
            >
              <ExternalLink size={14} />
              <span>Mở hồ sơ đầy đủ</span>
            </Link>
          )}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              stopCamera();
              onClose();
            }}
          >
            Đóng
          </button>
        </>
      }
    >
      <div
        style={{
          padding: "10px 13px",
          borderRadius: 8,
          background: "#f2f8f4",
          border: "1px solid #d4d4d2",
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "#1c4e30",
          marginBottom: 14,
        }}
      >
        <strong>Quét nhanh bằng phiên đã đăng nhập:</strong> Ứng dụng tự động trích xuất token trong mã QR và gọi trực tiếp API xác thực của máy chủ theo vai trò và phạm vi quản lý hiện tại, không cần đăng nhập lại trên trình duyệt.
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleImageFile}
      />

      {!result && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn btn-sm ${mode === "camera" ? "btn-primary" : "btn-outline"}`}
              onClick={() => {
                setLookupError(null);
                setMode("camera");
              }}
            >
              <Camera size={14} />
              <span>Quét bằng Camera</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === "manual" ? "btn-primary" : "btn-outline"}`}
              onClick={() => {
                setLookupError(null);
                setMode("manual");
              }}
            >
              <QrCode size={14} />
              <span>Dán đường dẫn / Nhập mã lô</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={14} />
              <span>Chọn / Chụp ảnh QR</span>
            </button>
          </div>

          {mode === "camera" ? (
            <div
              style={{
                position: "relative",
                borderRadius: 10,
                overflow: "hidden",
                background: "#0f172a",
                minHeight: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--border)",
              }}
            >
              {cameraError ? (
                <div style={{ padding: 24, textAlign: "center", color: "#e2e8f0", maxWidth: 440 }}>
                  <AlertTriangle size={28} style={{ margin: "0 auto 10px", color: "#fbbf24" }} />
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 14 }}>{cameraError}</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus size={14} />
                      <span>Chụp hoặc tải ảnh QR</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ background: "#ffffff" }}
                      onClick={() => setMode("manual")}
                    >
                      Nhập mã thủ công
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    style={{ width: "100%", maxHeight: 340, objectFit: "cover", display: "block" }}
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      width: 190,
                      height: 190,
                      border: "2px solid rgba(74, 222, 128, 0.9)",
                      borderRadius: 12,
                      boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.34)",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 10,
                      left: 12,
                      right: 12,
                      textAlign: "center",
                      fontSize: 12,
                      color: "#f8fafc",
                      background: "rgba(15, 23, 42, 0.72)",
                      padding: "5px 10px",
                      borderRadius: 6,
                    }}
                  >
                    {cameraReady
                      ? "Đưa mã QR trên thùng hoặc tem vào khung xanh để tự động nhận diện…"
                      : "Đang khởi tạo máy ảnh thiết bị…"}
                  </div>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                className="filter-input"
                style={{ flex: 1, minWidth: 220 }}
                placeholder="Dán link /t/9fQ2xKp7... hoặc nhập mã lô (VD: LH-2024-038)"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Search size={15} />
                <span>{loading ? "Đang xác thực…" : "Kiểm tra ngay"}</span>
              </button>
            </form>
          )}
        </>
      )}

      {loading && (
        <div style={{ padding: "18px 12px", textAlign: "center", fontSize: 13.5, color: "var(--text-secondary)" }}>
          Đang kiểm tra xác thực quyền và phạm vi cho mã <strong>{scannedToken}</strong>…
        </div>
      )}

      <FormError message={lookupError} />

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Dải kết quả phân quyền & phạm vi */}
          {result.accessControl.scopeDenied ? (
            <div
              role="alert"
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #d4d4d2",
                color: "#78350f",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, marginBottom: 4 }}>
                <Lock size={16} />
                <span>{result.accessControl.scopeDeniedMessage || "Bạn không có quyền xem chi tiết lô này"}</span>
              </div>
              <div>
                Tài khoản <strong>{result.accessControl.viewerName}</strong> (
                {result.accessControl.viewerRole ? ROLE_LABELS[result.accessControl.viewerRole] : ""}) nằm ngoài phạm vi quản lý của lô này.
                {result.accessControl.scopeReason ? ` ${result.accessControl.scopeReason}` : ""} Hệ thống chỉ trả về dữ liệu công khai và đã ghi nhận lượt kiểm tra.
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "11px 14px",
                borderRadius: 8,
                background: "#f0fdf4",
                border: "1px solid #d4d4d2",
                color: "#14532d",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <ShieldCheck size={17} />
                <span>
                  Đã mở khóa <strong>{result.accessControl.viewerTierLabel}</strong> cho{" "}
                  <strong>{result.accessControl.viewerName}</strong>
                </span>
              </div>
              <span className="badge badge-green">Đúng phạm vi quản lý</span>
            </div>
          )}

          {/* Thông tin nhận diện lô & PUC/PHC thời gian thực */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "#ffffff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Mã lô: <strong>{result.publicData.lotIdentity.lotCode}</strong>
                </div>
                <strong style={{ fontSize: 15.5 }}>{result.publicData.lotIdentity.productName}</strong>
              </div>
              <span
                className={`badge ${
                  result.publicData.lotIdentity.status === "revoked" ? "badge-red" : "badge-green"
                }`}
              >
                {result.publicData.lotIdentity.statusLabel}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "8px 14px",
                fontSize: 12.5,
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Giống: </span>
                <strong>{result.publicData.lotIdentity.variety}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Quy mô / Thị trường: </span>
                <strong>
                  {formatVn(result.publicData.lotIdentity.weightTons, 1)} tấn ({result.publicData.lotIdentity.market})
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Mã vùng PUC: </span>
                <strong>{result.publicData.growingZone.pucCode}</strong> ({result.publicData.growingZone.statusLabel})
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Cơ sở đóng gói: </span>
                <strong>{result.publicData.packhouse.code}</strong> ({result.publicData.packhouse.statusLabel || "Đang hoạt động"})
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Kiểm nghiệm đã duyệt: </span>
                <strong>{result.publicData.labTests.length} phiếu</strong>
              </div>
            </div>
          </div>

          {/* Tóm tắt dữ liệu Cấp 2 (Doanh nghiệp) nếu được cấp quyền */}
          {result.enterpriseData && (
            <div
              style={{
                padding: "13px 15px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "#fafaf8",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>
                Dữ liệu Cấp 2 (Doanh nghiệp): Vùng nguồn ({formatVn(result.enterpriseData.totalSourceWeightKg, 0)} kg)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                {result.enterpriseData.sourceZones.map((z, idx) => (
                  <div
                    key={`${z.zoneCode}-${idx}`}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}
                  >
                    <span>
                      <strong>{z.zoneCode}</strong> ({z.villageName}, {z.householdCount} hộ)
                    </span>
                    <strong>
                      {formatVn(z.weightKg, 0)} kg ({z.sharePct}%)
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tóm tắt dữ liệu Cấp 3 (Cơ quan quản lý) nếu được cấp quyền */}
          {result.authorityData && (
            <div
              style={{
                padding: "13px 15px",
                borderRadius: 8,
                border: "1px solid #d4d4d2",
                background: "#f7fbf8",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13.5, marginBottom: 8, color: "#14532d" }}>
                <CheckCircle2 size={15} />
                <span>
                  Dữ liệu Cấp 3 (Quản lý): {result.authorityData.sourceHouseholds.length} hộ nguồn,{" "}
                  {result.authorityData.cultivationDiaries.length} nhật ký,{" "}
                  {result.authorityData.inspectionMinutes.length} biên bản
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                {result.authorityData.sourceHouseholds.slice(0, 5).map((hh, idx) => (
                  <div
                    key={`${hh.householdCode}-${idx}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      flexWrap: "wrap",
                      paddingTop: idx > 0 ? 5 : 0,
                      borderTop: idx > 0 ? "1px solid #e2ece5" : "none",
                    }}
                  >
                    <span>
                      <strong>{hh.householdName}</strong> ({hh.householdCode}, {hh.villageName}
                      {hh.contributedPlotCode ? `, Mã lô vườn: ${hh.contributedPlotCode}` : ""})
                    </span>
                    <span>
                      {hh.contributedKg !== null ? <strong>{formatVn(hh.contributedKg, 0)} kg</strong> : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

