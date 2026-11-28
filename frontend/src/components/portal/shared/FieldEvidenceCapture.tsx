"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, useSheetClose } from "../ui";

const IOS_PWA_DISMISSED_KEY = "puc:ios-pwa-guide-dismissed:v1";
const OS_CAMERA_MAX_FRESH_AGE_MS = 3 * 60_000;

export interface TrustTierSummary {
  level: 1 | 2 | 3;
  shortLabel: string;
  fullLabel: string;
  tone: "ok" | "neutral" | "warn";
  evidenceNotes: string[];
}

const FLAG_LABELS_VI: Record<string, string> = {
  staff_verified: "Cán bộ HTX đã xác minh",
  in_app_camera: "Chụp trực tiếp trên ứng dụng",
  signboard_qr: "Đã quét khớp biển QR tại thửa",
  inside_plot: "Định vị GPS nằm trong ranh giới thửa",
  time_anchored: "Đối chiếu khớp mốc giờ máy chủ",
  offline_sync: "Ghi ngoại tuyến tại rẫy, đồng bộ tự động",
  missing_gps: "Chưa có tọa độ GPS lúc lưu",
  low_gps_accuracy: "Tín hiệu vệ tinh dưới tán cây sai số lớn",
  late_sync: "Đồng bộ sau thời điểm thực hiện",
  outside_plot: "Tọa độ GPS nằm ngoài ranh giới thửa đăng ký",
  clock_skew: "Đồng hồ thiết bị lệch so với mốc giờ máy chủ",
  invalid_signboard_qr: "Mã biển QR không khớp thửa đất đã chọn",
  gallery_upload: "Ảnh chọn từ thư viện máy",
};

/**
 * Chuẩn hóa mức tin cậy thực địa (1 / 2 / 3) và danh sách bằng chứng tiếng Việt rõ nghĩa,
 * tuyệt đối không lộ tên biến hay mã kỹ thuật nội bộ lên màn hình người dùng.
 */
export function describeFieldEvidence(input: {
  trustLevel?: number | null;
  trustFlags?: string[] | null;
  verificationStatus?: string | null;
  gpsVerified?: boolean | null;
  signboardQrVerified?: boolean | null;
  offlineQueued?: boolean | null;
  captureSource?: string | null;
}): TrustTierSummary {
  const isStaffVerified = input.verificationStatus === "verified";
  const rawLevel = Number(input.trustLevel);
  const level: 1 | 2 | 3 = isStaffVerified
    ? 1
    : rawLevel === 1 || rawLevel === 2 || rawLevel === 3
      ? rawLevel
      : input.gpsVerified || input.signboardQrVerified
        ? 1
        : 2;

  const rawFlags = Array.isArray(input.trustFlags) ? input.trustFlags : [];
  const seen = new Set<string>();
  const evidenceNotes: string[] = [];
  const pushNote = (text: string | undefined) => {
    if (!text || seen.has(text)) return;
    seen.add(text);
    evidenceNotes.push(text);
  };

  if (isStaffVerified) pushNote(FLAG_LABELS_VI.staff_verified);
  if (input.signboardQrVerified) pushNote(FLAG_LABELS_VI.signboard_qr);
  if (input.gpsVerified) pushNote(FLAG_LABELS_VI.inside_plot);
  if (input.captureSource === "in_app_camera") pushNote(FLAG_LABELS_VI.in_app_camera);
  if (input.offlineQueued) pushNote(FLAG_LABELS_VI.offline_sync);

  for (const flag of rawFlags) {
    pushNote(FLAG_LABELS_VI[flag]);
  }

  if (level === 1) {
    return {
      level: 1,
      shortLabel: "Xác thực thực địa cao",
      fullLabel: "Mức 1: Xác thực thực địa cao",
      tone: "ok",
      evidenceNotes,
    };
  }
  if (level === 3) {
    return {
      level: 3,
      shortLabel: "Cần cán bộ xác minh",
      fullLabel: "Mức 3: Cần cán bộ HTX đối chiếu thực địa",
      tone: "warn",
      evidenceNotes,
    };
  }
  return {
    level: 2,
    shortLabel: "Đã ghi nhận hợp lệ",
    fullLabel: "Mức 2: Đã ghi nhận hợp lệ",
    tone: "neutral",
    evidenceNotes,
  };
}

export function FieldTrustBadge({
  trustLevel,
  trustFlags,
  verificationStatus,
  gpsVerified,
  signboardQrVerified,
  offlineQueued,
  captureSource,
  compact = false,
}: {
  trustLevel?: number | null;
  trustFlags?: string[] | null;
  verificationStatus?: string | null;
  gpsVerified?: boolean | null;
  signboardQrVerified?: boolean | null;
  offlineQueued?: boolean | null;
  captureSource?: string | null;
  compact?: boolean;
}) {
  const info = describeFieldEvidence({
    trustLevel,
    trustFlags,
    verificationStatus,
    gpsVerified,
    signboardQrVerified,
    offlineQueued,
    captureSource,
  });

  const color =
    info.tone === "ok" ? "#15803d" : info.tone === "warn" ? "#9a6712" : "#14372f";
  const background =
    info.tone === "ok" ? "#f3f7ee" : info.tone === "warn" ? "#fdf8ee" : "#f7f7f5";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: compact ? "2px 8px" : "4px 10px",
        borderRadius: 5,
        border: "1px solid #d4d4d2",
        background,
        color,
        fontSize: compact ? 11.5 : 12.5,
        fontWeight: 600,
        lineHeight: 1.35,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {compact ? info.shortLabel : info.fullLabel}
    </span>
  );
}

function InAppCameraBody({
  remainingSlots,
  currentCount,
  maxFiles,
  onCaptureFile,
  onClose,
}: {
  remainingSlots: number;
  currentCount: number;
  maxFiles: number;
  onCaptureFile: (file: File, source: "in_app_camera" | "camera") => Promise<void>;
  onClose: () => void;
}) {
  const sheetClose = useSheetClose();
  const closeSheet = sheetClose ?? onClose;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraUnavailableReason, setCameraUnavailableReason] = useState<string | null>(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return "Trình duyệt trên máy này không mở trực tiếp được ống kính trong trang. Bấm nút bên dưới để mở máy ảnh của điện thoại.";
    }
    return null;
  });
  const [capturing, setCapturing] = useState(false);
  const [capturedInSession, setCapturedInSession] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
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
            // Trình duyệt di động tự phát qua thuộc tính autoPlay + playsInline.
          }
        }
        setCameraUnavailableReason(null);
        setCameraReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraUnavailableReason(
            "Chưa cấp quyền máy ảnh cho trình duyệt. Vui lòng cho phép quyền máy ảnh hoặc bấm nút mở máy ảnh điện thoại ngay bên dưới.",
          );
        }
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  const handleCaptureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setLocalError("Ống kính đang lấy nét, vui lòng chờ 1 giây rồi bấm chụp.");
      return;
    }
    if (capturedInSession >= remainingSlots) {
      closeSheet();
      return;
    }

    setCapturing(true);
    setLocalError(null);
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(1, 1600 / Math.max(vw, vh));
      const targetW = Math.max(1, Math.round(vw * scale));
      const targetH = Math.max(1, Math.round(vh * scale));

      canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        throw new Error("Không khởi tạo được bộ đệm ảnh hiện trường.");
      }
      ctx.drawImage(video, 0, 0, targetW, targetH);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas!.toBlob(resolve, "image/jpeg", 0.88),
      );
      if (!blob) {
        throw new Error("Không ghi nhận được khung hình từ máy ảnh.");
      }

      const now = Date.now();
      const file = new File([blob], `hien-truong-${now}.jpg`, {
        type: "image/jpeg",
        lastModified: now,
      });
      await onCaptureFile(file, "in_app_camera");
      const nextCount = capturedInSession + 1;
      setCapturedInSession(nextCount);
      if (nextCount >= remainingSlots) {
        stopStream();
        closeSheet();
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Không chụp được ảnh hiện trường.");
    } finally {
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
        ctx?.clearRect(0, 0, 1, 1);
        canvas.width = 0;
        canvas.height = 0;
      }
      setCapturing(false);
    }
  };

  const handleFallbackCameraInput = async (fileList: FileList | null) => {
    const picked = fileList?.[0];
    if (!picked) return;
    setLocalError(null);

    if (picked.lastModified > 0 && Math.abs(Date.now() - picked.lastModified) > OS_CAMERA_MAX_FRESH_AGE_MS) {
      setLocalError(
        "Ảnh này không phải vừa chụp trực tiếp tại vườn. Hệ thống chỉ nhận ảnh chụp mới tại hiện trường để đảm bảo minh bạch.",
      );
      return;
    }

    setCapturing(true);
    try {
      await onCaptureFile(picked, "camera");
      const nextCount = capturedInSession + 1;
      setCapturedInSession(nextCount);
      if (nextCount >= remainingSlots) {
        stopStream();
        closeSheet();
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Không lưu được ảnh vừa chụp.");
    } finally {
      setCapturing(false);
    }
  };

  const totalNow = Math.min(maxFiles, currentCount + capturedInSession);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.48, color: "#5f6d66" }}>
        Hướng ống kính vào gốc cây, cơi đọt, béc tưới hoặc nhãn chai thuốc tại vườn. Ảnh được nén nhẹ và tính mã kiểm chứng ngay trên điện thoại, hoạt động bình thường cả khi rẫy không có sóng 4G.
      </p>

      {!cameraUnavailableReason ? (
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "4 / 3",
            maxHeight: "54vh",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #d4d4d2",
            background: "#121212",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
          {!cameraReady && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                color: "#ffffff",
                fontSize: 13,
                textAlign: "center",
                background: "rgba(18, 18, 18, 0.72)",
              }}
            >
              Đang mở ống kính sau...
            </div>
          )}
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              padding: "4px 10px",
              borderRadius: 5,
              border: "1px solid rgba(255, 255, 255, 0.28)",
              background: "rgba(18, 18, 18, 0.72)",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Đã có {totalNow}/{maxFiles} ảnh
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 8,
            border: "1px solid #d4d4d2",
            background: "#f7f7f5",
            color: "#14372f",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: "0 0 10px" }}>{cameraUnavailableReason}</p>
          <label
            className="pt-btn pt-btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              cursor: capturing ? "default" : "pointer",
            }}
          >
            <input
              ref={fallbackInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={capturing}
              style={{ display: "none" }}
              onChange={(e) => {
                void handleFallbackCameraInput(e.target.files);
                e.target.value = "";
              }}
            />
            <span>{capturing ? "Đang xử lý ảnh..." : "Mở máy ảnh điện thoại để chụp"}</span>
          </label>
        </div>
      )}

      {localError && (
        <p className="pt-form-error" role="alert" style={{ margin: 0 }}>
          {localError}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: capturedInSession > 0 ? "1fr 1fr" : "1fr 1.4fr",
          gap: 10,
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          className="pt-btn"
          style={{
            border: "1px solid #d4d4d2",
            background: "#ffffff",
            color: "#14372f",
          }}
          onClick={() => {
            stopStream();
            closeSheet();
          }}
          disabled={capturing}
        >
          {capturedInSession > 0 ? `Xong (${capturedInSession} ảnh)` : "Đóng"}
        </button>

        {!cameraUnavailableReason && (
          <button
            type="button"
            className="pt-btn pt-btn-primary"
            onClick={() => void handleCaptureFrame()}
            disabled={!cameraReady || capturing || capturedInSession >= remainingSlots}
          >
            {capturing
              ? "Đang lưu ảnh..."
              : capturedInSession > 0
                ? "Chụp thêm góc khác"
                : "Bấm chụp hiện trường"}
          </button>
        )}
      </div>
    </div>
  );
}

export function FieldCameraCaptureModal({
  remainingSlots,
  currentCount,
  maxFiles,
  onCaptureFile,
  onClose,
}: {
  remainingSlots: number;
  currentCount: number;
  maxFiles: number;
  onCaptureFile: (file: File, source: "in_app_camera" | "camera") => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Sheet title="Chụp ảnh hiện trường trực tiếp" className="pt-diary-sheet" onClose={onClose}>
      <InAppCameraBody
        remainingSlots={remainingSlots}
        currentCount={currentCount}
        maxFiles={maxFiles}
        onCaptureFile={onCaptureFile}
        onClose={onClose}
      />
    </Sheet>
  );
}

/**
 * Thẻ hướng dẫn gọn cho nông hộ dùng iPhone/iPad mở bằng Safari thường (chưa ghim ra Màn hình chính):
 * giúp tránh việc iOS tự dọn bộ nhớ tạm khi đi rẫy dài ngày và nhắc đồng bộ khi về nhà có sóng.
 */
export function IosPwaInstallGuideBanner() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    try {
      if (window.localStorage.getItem(IOS_PWA_DISMISSED_KEY) === "1") return false;
    } catch {
      // ignore
    }
    const ua = navigator.userAgent || "";
    const isIosDevice =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    return Boolean(isIosDevice && !isStandalone);
  });

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(IOS_PWA_DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <section
      aria-label="Hướng dẫn lưu ứng dụng ra màn hình chính trên iPhone"
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid #d4d4d2",
        background: "#f7f7f5",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <strong style={{ fontSize: 13.5, color: "#14372f", lineHeight: 1.4 }}>
          Ghim ra Màn hình chính để ghi nhật ký mất sóng an toàn trên iPhone
        </strong>
        <button
          type="button"
          onClick={dismiss}
          style={{
            minHeight: 28,
            padding: "2px 10px",
            borderRadius: 5,
            border: "1px solid #d4d4d2",
            background: "#ffffff",
            color: "#14372f",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Đã hiểu
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "#5f6d66" }}>
        Trên Safari, bấm nút <strong>Chia sẻ</strong> ở thanh dưới rồi chọn <strong>Thêm vào Màn hình chính</strong>. Cách này giúp điện thoại giữ an toàn ảnh chụp tại rẫy không sóng và nhắc gửi ngay khi mở lại ở nơi có mạng.
      </p>
    </section>
  );
}

