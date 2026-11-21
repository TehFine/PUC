"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { CloseCircleIcon } from "@/components/ui/CloseCircleIcon";
import { DetailArrowIcon } from "@/components/ui/DetailArrowIcon";
import { OfflinePendingDiaryCards } from "@/components/ui/OfflineSyncBar";
import { toast } from "@/components/ui/Toast";
import { invalidatePortal, useCatalog, usePortal } from "@/hooks/use-portal";
import { api, errorMessage } from "@/lib/api-client";
import { usePersistedRecordSelection, usePersistedState } from "@/lib/back-navigation";
import {
  clearWorkingFieldDraft,
  type OfflineFieldDraft,
  saveOfflineFieldDraft,
  submitFieldRecordWithOfflineQueue,
  useOfflineSyncState,
} from "@/lib/offline-sync";
import { daysSince, daysUntil, JOURNAL_ACTIVITIES, todayIso, toNumber } from "@/lib/portal-labels";
import { formatDate, formatDateTime, formatDiaryEditor, formatDiaryRole } from "@/utils/format";
import type { FertilizerDto, PesticideDto } from "@/types/api";
import type {
  CreateJournalBody,
  CreateSprayBody,
  PortalJournalEntry,
  PortalList,
  PortalPlot,
  PortalPlots,
  PortalSprayRecord,
} from "@/types/portal";
import { DEFAULT_FERTILIZERS, getFertilizerImage, getPesticideImage } from "./LearnTab";
import {
  BusyButton,
  ConfirmButton,
  InlineError,
  LateDeclarationNotice,
  MultiPhotoField,
  ProgressiveListFooter,
  StoredMediaGallery,
  useMultiPhotoPicker,
  useProgressiveCount,
} from "./shared/controls";
import { RadialPngIcon } from "./RadialIcons";
import type { PortalAction } from "./PortalSearch";
import { EmptyState, Field, Sheet, StateBlock, useSheetClose } from "./ui";

function canDeleteEntry(entry: PortalJournalEntry): boolean {
  if (typeof entry.canDelete === "boolean") return entry.canDelete;
  if (entry.recorder !== "Chủ hộ") return false;
  if (!entry.createdAt) return false;
  const createdMs = new Date(entry.createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < 24 * 60 * 60 * 1000;
}

function canDeleteSpray(record: PortalSprayRecord): boolean {
  if (typeof record.canDelete === "boolean") return record.canDelete;
  if (record.pesticideStatus === "banned") return false;
  if (!record.createdAt) return false;
  const createdMs = new Date(record.createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < 24 * 60 * 60 * 1000;
}

function addIsoDays(isoDate: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function diffDaysFromToday(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  const tm = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayIso());
  if (!m || !tm) return 0;
  const targetUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const nowUtc = Date.UTC(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]));
  return Math.round((nowUtc - targetUtc) / (24 * 60 * 60 * 1000));
}

const SPRAY_ACTIVITY_NAME = "Phun thuốc BVTV";
const FERTILIZE_ACTIVITY_NAME = "Bón phân";

interface VisualPickerOption {
  id: string;
  name: string;
  imageSrc: string;
  metaText: string;
  tone: "ok" | "warn" | "danger" | "muted";
  searchText: string;
}

interface VisualCatalogPickerProps {
  title: string;
  hint: string;
  searchPlaceholder: string;
  options: VisualPickerOption[];
  selectedId: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function VisualCatalogPickerBody({
  title,
  hint,
  searchPlaceholder,
  options,
  selectedId,
  loading,
  onSelect,
  onClose,
}: VisualCatalogPickerProps) {
  const sheetClose = useSheetClose();
  const [query, setQuery] = useState("");
  const trackRef = useRef<HTMLDivElement | null>(null);
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);
  const dragStateRef = useRef<{ down: boolean; startX: number; scrollLeft: number; moved: boolean }>({
    down: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.searchText.includes(q));
  }, [options, query]);

  const syncScrollButtons = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useLayoutEffect(() => {
    const track = trackRef.current;
    const card = selectedCardRef.current;
    if (track && card) {
      const targetLeft = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      track.scrollLeft = Math.max(0, Math.min(maxScroll, targetLeft));
    }
    syncScrollButtons();
  }, [filtered.length, selectedId]);

  const scrollByStep = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(200, Math.round(el.clientWidth * 0.72));
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className="pt-vpicker-body">
      <p className="pt-vpicker-hint">{hint}</p>

      <div className="pt-vpicker-search-wrap">
        <Search size={16} className="pt-vpicker-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="pt-vpicker-search-input"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={searchPlaceholder}
        />
        {query && (
          <button
            type="button"
            className="pt-vpicker-search-clear"
            onClick={() => setQuery("")}
            aria-label="Xóa từ khóa tìm kiếm"
          >
            <CloseCircleIcon size={18} />
          </button>
        )}
      </div>

      {loading && options.length === 0 ? (
        <div className="pt-vpicker-empty">Đang tải danh mục hình ảnh…</div>
      ) : filtered.length === 0 ? (
        <div className="pt-vpicker-empty">Không tìm thấy sản phẩm phù hợp với từ khóa.</div>
      ) : (
        <div className="pt-vpicker-carousel" data-no-sheet-drag="true">
          <button
            type="button"
            className="pt-vpicker-nav is-prev"
            onClick={() => scrollByStep(-1)}
            disabled={!canScrollLeft}
            aria-label="Cuộn sang trái"
          >
            <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>

          <div
            ref={trackRef}
            className="pt-vpicker-track"
            role="listbox"
            aria-label={title}
            data-no-sheet-drag="true"
            onScroll={syncScrollButtons}
            onWheel={(e) => {
              const el = trackRef.current;
              if (!el) return;
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
              }
            }}
            onMouseDown={(e) => {
              const el = trackRef.current;
              if (!el || e.button !== 0) return;
              dragStateRef.current = {
                down: true,
                startX: e.clientX,
                scrollLeft: el.scrollLeft,
                moved: false,
              };
            }}
            onMouseMove={(e) => {
              const st = dragStateRef.current;
              const el = trackRef.current;
              if (!st.down || !el) return;
              const dx = e.clientX - st.startX;
              if (Math.abs(dx) > 6) st.moved = true;
              if (st.moved) {
                el.scrollLeft = st.scrollLeft - dx;
              }
            }}
            onMouseUp={() => {
              dragStateRef.current.down = false;
            }}
            onMouseLeave={() => {
              dragStateRef.current.down = false;
            }}
          >
            {filtered.map((opt) => {
              const isSelected = opt.id === selectedId;
              return (
                <button
                  key={opt.id}
                  ref={isSelected ? selectedCardRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`pt-vpicker-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => {
                    if (dragStateRef.current.moved) {
                      dragStateRef.current.moved = false;
                      return;
                    }
                    onSelect(opt.id);
                    if (sheetClose) sheetClose();
                    else onClose();
                  }}
                >
                  <div className="pt-vpicker-img-frame">
                    <img
                      src={opt.imageSrc}
                      alt={opt.name}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="pt-vpicker-img"
                    />
                  </div>
                  <div className="pt-vpicker-caption">
                    <span className="pt-vpicker-name">{opt.name}</span>
                    <span className={`pt-vpicker-meta tone-${opt.tone}`}>{opt.metaText}</span>
                    {isSelected && <span className="pt-vpicker-selected-label">Đang chọn</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="pt-vpicker-nav is-next"
            onClick={() => scrollByStep(1)}
            disabled={!canScrollRight}
            aria-label="Cuộn sang phải"
          >
            <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function VisualCatalogPickerSheet(props: VisualCatalogPickerProps) {
  return (
    <Sheet title={props.title} className="pt-visual-picker-sheet" onClose={props.onClose}>
      <VisualCatalogPickerBody {...props} />
    </Sheet>
  );
}

function DiarySheetActionFooter({
  formId = "pt-unified-diary-form",
  submitLabel = "Lưu nhật ký",
  busyLabel = "Đang lưu…",
  saving,
  canSubmit,
  hasFiles,
  onBeforeCancel,
  onCancel,
}: {
  formId?: string;
  submitLabel?: string;
  busyLabel?: string;
  saving: boolean;
  canSubmit: boolean;
  hasFiles: boolean;
  onBeforeCancel?: () => void;
  onCancel: () => void;
}) {
  const sheetClose = useSheetClose();
  return (
    <>
      <button
        type="button"
        className="pt-diary-footer-btn pt-diary-footer-cancel"
        onClick={() => {
          onBeforeCancel?.();
          if (sheetClose) sheetClose();
          else onCancel();
        }}
        disabled={saving}
      >
        Hủy
      </button>
      <BusyButton
        type="submit"
        form={formId}
        className="pt-diary-footer-btn pt-diary-footer-submit"
        busy={saving}
        busyLabel={busyLabel}
        disabled={!canSubmit}
        title={!hasFiles ? "Vui lòng chụp ảnh hiện trường trước khi lưu" : undefined}
      >
        {submitLabel}
      </BusyButton>
    </>
  );
}

function UnifiedDiaryForm({
  plotsList,
  initialActivity,
  initialDraft,
  onDone,
  onClose,
}: {
  plotsList: PortalPlot[];
  initialActivity?: string;
  initialDraft?: OfflineFieldDraft | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const plotCodes = plotsList.map((p) => p.code);
  const defaultPlotCode = initialDraft?.plotCode || plotCodes[0] || "";
  const matchedInitialPlot = plotsList.find((p) => p.code === defaultPlotCode) ?? plotsList[0];
  const defaultPlotArea = initialDraft?.areaHa || (matchedInitialPlot?.areaHa ? String(matchedInitialPlot.areaHa) : "0.5");

  const today = todayIso();
  const minBackdateIso = addIsoDays(today, -7) ?? today;
  const [draftCapturedMeta] = useState(() => ({
    capturedAtIso: initialDraft?.capturedAtIso,
    capturedDateVn: initialDraft?.capturedDateVn,
  }));
  const hasDraftCaptureDate = Boolean(
    draftCapturedMeta.capturedDateVn && /^\d{4}-\d{2}-\d{2}$/.test(draftCapturedMeta.capturedDateVn),
  );
  const maxEntryIso =
    hasDraftCaptureDate && draftCapturedMeta.capturedDateVn! < today
      ? draftCapturedMeta.capturedDateVn!
      : today;

  const rawInitialEntryDate = initialDraft?.entryOn || maxEntryIso;
  const initialEntryDate = !/^\d{4}-\d{2}-\d{2}$/.test(rawInitialEntryDate)
    ? maxEntryIso
    : rawInitialEntryDate > maxEntryIso
      ? maxEntryIso
      : rawInitialEntryDate < minBackdateIso
        ? minBackdateIso
        : rawInitialEntryDate;

  const autoLateDefault =
    initialDraft && !initialDraft.lateReason && diffDaysFromToday(initialEntryDate) >= 1
      ? `Đã chụp và giữ hình tại vườn ngày ${formatDate(initialEntryDate)}, hoàn tất chi tiết khi về nhà`
      : (initialDraft?.lateReason ?? "");

  const [entryOn, setEntryOn] = useState(initialEntryDate);
  const [dateBoundNotice, setDateBoundNotice] = useState<string | null>(null);
  const [plotCode, setPlotCode] = useState(defaultPlotCode);
  const [activity, setActivity] = useState(initialDraft?.activity ?? initialActivity ?? JOURNAL_ACTIVITIES[0]);
  const [detail, setDetail] = useState(initialDraft?.detail ?? "");
  const [lateReason, setLateReason] = useState(autoLateDefault);

  const isSprayActivity = activity === SPRAY_ACTIVITY_NAME;
  const isFertilizeActivity = activity === FERTILIZE_ACTIVITY_NAME;
  const pesticides = useCatalog<PesticideDto>("pesticides", isSprayActivity);
  const fertilizersCatalog = useCatalog<FertilizerDto>("fertilizers", isFertilizeActivity);
  const fertilizerRows = useMemo(
    () => (fertilizersCatalog.rows.length > 0 ? fertilizersCatalog.rows : DEFAULT_FERTILIZERS),
    [fertilizersCatalog.rows],
  );
  const [pesticideId, setPesticideId] = useState(initialDraft?.pesticideId ?? "");
  const [fertilizerId, setFertilizerId] = useState(initialDraft?.fertilizerId ?? "");
  const [fertDose, setFertDose] = useState(initialDraft?.fertDose ?? "");
  const [pickerMode, setPickerMode] = useState<"pesticide" | "fertilizer" | null>(null);
  const [dose, setDose] = useState(initialDraft?.dose ?? "");
  const [areaHa, setAreaHa] = useState(defaultPlotArea);
  const [areaTouched, setAreaTouched] = useState(Boolean(initialDraft?.areaHa));
  const [source, setSource] = useState(initialDraft?.source ?? "");

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    initialDraft?.coords ?? null,
  );
  const [gpsStatus, setGpsStatus] = useState<string | null>(
    initialDraft?.coords
      ? `Đã định vị: ${initialDraft.coords.latitude.toFixed(5)}, ${initialDraft.coords.longitude.toFixed(5)}`
      : null,
  );
  const [locating, setLocating] = useState(false);
  const media = useMultiPhotoPicker("journal", {
    maxFiles: 8,
    allowVideo: true,
    initialDraftSlots: initialDraft?.mediaSlots,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePlot = plotCode || defaultPlotCode;

  // Tự động bảo vệ ngầm bản đang nhập xuống bộ nhớ máy (sau 500ms) ngay khi nông hộ chụp ảnh:
  // nếu sóng yếu, trình duyệt bị đóng hoặc điện thoại thu hồi RAM lúc mở Máy ảnh, vào lại Ghi nhật ký vẫn còn nguyên hình.
  useEffect(() => {
    if (saving) return;
    if (!media.hasFiles) return;
    const timer = window.setTimeout(() => {
      void saveOfflineFieldDraft({
        isAutoWorkingDraft: true,
        plotCode: effectivePlot.trim(),
        entryOn,
        activity,
        detail,
        lateReason,
        pesticideId,
        fertilizerId,
        fertDose,
        dose,
        areaHa,
        source,
        coords,
        capturedAtIso: draftCapturedMeta.capturedAtIso,
        capturedDateVn: draftCapturedMeta.capturedDateVn,
        items: media.items,
      }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    saving,
    draftCapturedMeta,
    media.hasFiles,
    media.items,
    effectivePlot,
    entryOn,
    activity,
    detail,
    lateReason,
    pesticideId,
    fertilizerId,
    fertDose,
    dose,
    areaHa,
    source,
    coords,
  ]);

  const handleDiscardAndCancel = () => {
    void clearWorkingFieldDraft();
    onClose();
  };
  const selectedDelayDays = Math.max(0, diffDaysFromToday(entryOn));
  const isLateOver48h = selectedDelayDays > 2;
  const isEntryDateValid =
    /^\d{4}-\d{2}-\d{2}$/.test(entryOn) && entryOn <= maxEntryIso && entryOn >= minBackdateIso;

  const handleEntryDateChange = (nextVal: string) => {
    if (!nextVal) {
      setEntryOn(maxEntryIso);
      setDateBoundNotice(null);
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(nextVal) && Number(nextVal.slice(0, 4)) >= 2000) {
      if (nextVal > maxEntryIso) {
        setEntryOn(maxEntryIso);
        setDateBoundNotice(
          maxEntryIso < today
            ? `Hình hiện trường chụp ngày ${formatDate(maxEntryIso)} nên ngày thực hiện không được vượt quá ${formatDate(maxEntryIso)}.`
            : "Chỉ ghi nhật ký cho công việc đã thực hiện, không được khai trước ngày tương lai.",
        );
        return;
      }
      if (nextVal < minBackdateIso) {
        setEntryOn(minBackdateIso);
        setDateBoundNotice("Chỉ được ghi bổ sung trong vòng 7 ngày gần nhất. Quá 7 ngày vui lòng báo cán bộ xã lập biên bản.");
        return;
      }
    }
    setDateBoundNotice(null);
    setEntryOn(nextVal);
  };

  const handleEntryDateBlur = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryOn) || entryOn > maxEntryIso) {
      setEntryOn(maxEntryIso);
    } else if (entryOn < minBackdateIso) {
      setEntryOn(minBackdateIso);
    }
  };

  const chosenPesticide = isSprayActivity
    ? pesticides.rows.find((item) => String(item.id) === pesticideId)
    : undefined;
  const chosenFertilizer = isFertilizeActivity
    ? fertilizerRows.find((item) => String(item.id) === fertilizerId)
    : undefined;
  const safeFromIso =
    chosenPesticide && (chosenPesticide.isolationDays ?? 0) > 0
      ? addIsoDays(entryOn, chosenPesticide.isolationDays ?? 0)
      : null;

  const pesticidePickerOptions = useMemo<VisualPickerOption[]>(() => {
    const rank = (s: PesticideDto["status"]) => (s === "allowed" ? 0 : s === "restricted" ? 1 : 2);
    return [...pesticides.rows]
      .sort((a, b) => rank(a.status) - rank(b.status) || a.id - b.id)
      .map((item) => {
        const tone: VisualPickerOption["tone"] =
          item.status === "banned" ? "danger" : item.status === "restricted" ? "warn" : "ok";
        const metaText =
          item.status === "banned"
            ? "Cấm sử dụng"
            : item.status === "restricted"
              ? `Hạn chế, cách ly ${item.isolationDays ?? 0} ngày`
              : `Được phép, cách ly ${item.isolationDays ?? 0} ngày`;
        return {
          id: String(item.id),
          name: item.name,
          imageSrc: getPesticideImage(item),
          metaText,
          tone,
          searchText: `${item.name} ${item.activeIngredient ?? ""} ${item.manufacturer ?? ""}`.toLowerCase(),
        };
      });
  }, [pesticides.rows]);

  const fertilizerPickerOptions = useMemo<VisualPickerOption[]>(() => {
    const rank = (s: FertilizerDto["status"]) => (s === "encouraged" ? 0 : s === "allowed" ? 1 : 2);
    return [...fertilizerRows]
      .sort((a, b) => rank(a.status) - rank(b.status) || a.id - b.id)
      .map((item) => {
        const tone: VisualPickerOption["tone"] =
          item.status === "warning" ? "danger" : item.status === "encouraged" ? "ok" : "muted";
        const metaText =
          item.status === "warning"
            ? "Không dùng cho sầu riêng"
            : item.status === "encouraged"
              ? "Khuyến khích dùng"
              : "Được phép sử dụng";
        return {
          id: String(item.id),
          name: item.name,
          imageSrc: getFertilizerImage(item),
          metaText,
          tone,
          searchText: `${item.name} ${item.formula ?? ""} ${item.manufacturer ?? ""}`.toLowerCase(),
        };
      });
  }, [fertilizerRows]);

  const handlePlotChange = (nextCode: string) => {
    setPlotCode(nextCode);
    if (!areaTouched) {
      const matched = plotsList.find((p) => p.code === nextCode);
      if (matched?.areaHa) setAreaHa(String(matched.areaHa));
    }
  };

  const getGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCoords(null);
      setGpsStatus("Thiết bị không hỗ trợ GPS");
      return;
    }
    setLocating(true);
    setGpsStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = Number(pos.coords.latitude.toFixed(6));
        const longitude = Number(pos.coords.longitude.toFixed(6));
        setCoords({ latitude, longitude });
        setGpsStatus(`Đã định vị: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setCoords(null);
        setGpsStatus(
          err.code === err.PERMISSION_DENIED
            ? "Chưa cấp quyền vị trí GPS"
            : "Không lấy được tín hiệu GPS",
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const lateReasonOk = !isLateOver48h || lateReason.trim().length >= 5;
  const canSubmit = isSprayActivity
    ? Boolean(
      isEntryDateValid &&
      lateReasonOk &&
      effectivePlot.trim() &&
      pesticideId &&
      dose.trim() &&
      Number(areaHa) > 0 &&
      media.hasFiles,
    )
    : isFertilizeActivity
      ? Boolean(isEntryDateValid && lateReasonOk && effectivePlot.trim() && fertilizerId && media.hasFiles)
      : Boolean(isEntryDateValid && lateReasonOk && effectivePlot.trim() && media.hasFiles);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nowToday = todayIso();
    const effectiveMaxDate =
      hasDraftCaptureDate && draftCapturedMeta.capturedDateVn! < nowToday
        ? draftCapturedMeta.capturedDateVn!
        : nowToday;
    const effectiveMinDate = addIsoDays(nowToday, -7) ?? nowToday;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryOn) || entryOn > effectiveMaxDate) {
      setError(
        effectiveMaxDate < nowToday
          ? `Hình hiện trường chụp ngày ${formatDate(effectiveMaxDate)}, không thể khai ngày thực hiện sau ngày chụp hình.`
          : "Không được chọn ngày tương lai. Chỉ ghi nhật ký sau khi đã thực hiện công việc tại vườn.",
      );
      return;
    }
    if (entryOn < effectiveMinDate) {
      setError("Không được ghi lùi nhật ký quá 7 ngày. Vui lòng liên hệ cán bộ kỹ thuật xã để ghi nhận bổ sung.");
      return;
    }
    if (isLateOver48h && lateReason.trim().length < 5) {
      setError(`Vui lòng nhập rõ lý do khai báo chậm ${selectedDelayDays} ngày (ít nhất 5 ký tự).`);
      return;
    }
    const finalPlot = effectivePlot.trim();
    if (!finalPlot) {
      setError("Vui lòng chọn hoặc nhập mã thửa đất.");
      return;
    }
    if (!media.hasFiles) {
      setError("Vui lòng chụp hoặc chọn ít nhất 1 ảnh hiện trường trước khi lưu.");
      return;
    }
    if (isSprayActivity) {
      if (!pesticideId) {
        setError("Vui lòng chọn loại thuốc bảo vệ thực vật đã sử dụng.");
        return;
      }
      if (!dose.trim()) {
        setError("Vui lòng nhập liều lượng pha phun.");
        return;
      }
      if (!(Number(areaHa) > 0)) {
        setError("Vui lòng nhập diện tích phun hợp lệ.");
        return;
      }
    }
    if (isFertilizeActivity && !fertilizerId) {
      setError("Vui lòng chọn loại phân bón đã sử dụng.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isSprayActivity) {
        const sprayBody: Omit<CreateSprayBody, "photoId" | "photoIds"> = {
          sprayedOn: entryOn,
          pesticideId: Number(pesticideId),
          dose: dose.trim(),
          areaHa: Number(areaHa),
          source: source.trim() || undefined,
          plotCode: finalPlot,
          note: detail.trim() || undefined,
          lateReason: selectedDelayDays >= 1 && lateReason.trim() ? lateReason.trim() : undefined,
        };
        const outcome = await submitFieldRecordWithOfflineQueue<PortalSprayRecord>({
          kind: "portal-spray",
          label: `Phun thuốc${chosenPesticide ? ` ${chosenPesticide.name}` : ""} - Thửa ${finalPlot}`,
          plotCode: finalPlot,
          endpoint: "/portal/spray",
          payload: sprayBody as Record<string, unknown>,
          mediaGroups: [
            {
              slotKey: "photos",
              purpose: "journal",
              items: media.items,
              binding: { arrayField: "photoIds", primaryField: "photoId" },
            },
          ],
          portalKeysToInvalidate: ["journal", "spray", "violations", "overview"],
          onProgress: media.setUploadProgress,
          capturedAtIso: draftCapturedMeta.capturedAtIso,
          capturedDateVn: draftCapturedMeta.capturedDateVn,
        });
        await clearWorkingFieldDraft();
        if (outcome.mode === "synced") {
          invalidatePortal("journal", "spray", "violations", "overview");
          toast.success("Đã lưu nhật ký phun thuốc lên hệ thống.");
        } else {
          toast.success("Đã lưu trên điện thoại, hệ thống tự đồng bộ khi có sóng ổn định.");
        }
        onDone();
        return;
      }

      const composedDetail =
        isFertilizeActivity && chosenFertilizer
          ? [
            `Loại phân: ${chosenFertilizer.name}`,
            fertDose.trim() ? `Liều lượng: ${fertDose.trim()}` : "",
            detail.trim() ? `Ghi chú: ${detail.trim()}` : "",
          ]
            .filter(Boolean)
            .join(". ")
            .slice(0, 500)
          : detail.trim() || undefined;

      const baseBody: Omit<CreateJournalBody, "photoId" | "photoIds"> = {
        entryOn,
        plotCode: finalPlot,
        activity,
        detail: composedDetail,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        lateReason: selectedDelayDays >= 1 && lateReason.trim() ? lateReason.trim() : undefined,
      };
      const outcome = await submitFieldRecordWithOfflineQueue<PortalJournalEntry>({
        kind: "portal-journal",
        label:
          isFertilizeActivity && chosenFertilizer
            ? `Bón phân ${chosenFertilizer.name} - Thửa ${finalPlot}`
            : `Nhật ký ${activity} - Thửa ${finalPlot}`,
        plotCode: finalPlot,
        endpoint: "/portal/journal",
        payload: baseBody as Record<string, unknown>,
        mediaGroups: [
          {
            slotKey: "photos",
            purpose: "journal",
            items: media.items,
            binding: { arrayField: "photoIds", primaryField: "photoId" },
          },
        ],
        portalKeysToInvalidate: ["journal", "spray", "violations", "overview"],
        onProgress: media.setUploadProgress,
        capturedAtIso: draftCapturedMeta.capturedAtIso,
        capturedDateVn: draftCapturedMeta.capturedDateVn,
      });
      await clearWorkingFieldDraft();
      if (outcome.mode === "synced") {
        invalidatePortal("journal", "spray", "violations", "overview");
        toast.success("Đã lưu nhật ký canh tác lên hệ thống.");
      } else {
        toast.success("Đã lưu trên điện thoại, hệ thống tự đồng bộ khi có sóng ổn định.");
      }
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Không lưu được nhật ký. Vui lòng thử lại."));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Ghi nhật ký canh tác"
      className="pt-diary-sheet pt-diary-form-sheet"
      onClose={onClose}
      footer={
        <DiarySheetActionFooter
          saving={saving || Boolean(media.compressing)}
          canSubmit={canSubmit && !media.compressing}
          hasFiles={media.hasFiles}
          onBeforeCancel={() => {
            void clearWorkingFieldDraft();
          }}
          onCancel={handleDiscardAndCancel}
        />
      }
    >
      <form id="pt-unified-diary-form" className="pt-form" onSubmit={submit}>
        <div className="pt-field-row">
          <Field label="Ngày thực hiện" htmlFor="pj-date">
            <input
              id="pj-date"
              type="date"
              className="pt-input-date"
              min={minBackdateIso}
              max={maxEntryIso}
              value={entryOn}
              onChange={(e) => handleEntryDateChange(e.target.value)}
              onBlur={handleEntryDateBlur}
              required
            />
          </Field>
          <Field label="Thửa đất" htmlFor="pj-plot">
            {plotsList.length > 0 ? (
              <select
                id="pj-plot"
                value={effectivePlot}
                onChange={(e) => handlePlotChange(e.target.value)}
                required
              >
                {plotsList.map((p) => (
                  <option key={p.code} value={p.code}>
                    Thửa {p.code}{p.areaHa ? ` (${p.areaHa} ha)` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="pj-plot"
                placeholder="Nhập mã thửa đất"
                value={plotCode}
                onChange={(e) => setPlotCode(e.target.value)}
                required
              />
            )}
          </Field>
        </div>

        {dateBoundNotice && (
          <p className="pt-form-error" role="status" style={{ marginTop: -2, marginBottom: 4 }}>
            {dateBoundNotice}
          </p>
        )}

        <LateDeclarationNotice
          selectedDate={entryOn}
          todayDate={today}
          delayDays={selectedDelayDays}
        />

        {selectedDelayDays >= 1 && (
          <Field
            label={
              isLateOver48h
                ? `Lý do ghi bổ sung chậm ${selectedDelayDays} ngày (bắt buộc)`
                : `Ghi chú lý do khai báo chậm ${selectedDelayDays} ngày (không bắt buộc)`
            }
            htmlFor="pj-late-reason"
          >
            <input
              id="pj-late-reason"
              maxLength={250}
              placeholder="Ví dụ: Vườn xa mất sóng 4G nên về nhà mới tải ảnh lên..."
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              required={isLateOver48h}
            />
          </Field>
        )}

        <Field label="Công việc thực hiện" htmlFor="pj-activity">
          <select
            id="pj-activity"
            value={activity}
            onChange={(e) => {
              const next = e.target.value;
              setActivity(next);
              setError(null);
              if (next === SPRAY_ACTIVITY_NAME && !pesticideId) {
                setPickerMode("pesticide");
              } else if (next === FERTILIZE_ACTIVITY_NAME && !fertilizerId) {
                setPickerMode("fertilizer");
              }
            }}
          >
            {JOURNAL_ACTIVITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>

        {isFertilizeActivity && (
          <>
            <Field label="Loại phân bón sử dụng" htmlFor="pf-fertilizer-trigger">
              <button
                id="pf-fertilizer-trigger"
                type="button"
                className={`pt-vpicker-trigger ${chosenFertilizer ? "has-value" : ""}`}
                onClick={() => setPickerMode("fertilizer")}
              >
                {chosenFertilizer ? (
                  <>
                    <span className="pt-vpicker-trigger-thumb">
                      <img
                        src={getFertilizerImage(chosenFertilizer)}
                        alt={chosenFertilizer.name}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="pt-vpicker-trigger-info">
                      <strong className="pt-vpicker-trigger-name">{chosenFertilizer.name}</strong>
                      <span className="pt-vpicker-trigger-sub">{chosenFertilizer.formula}</span>
                    </span>
                    <span className="pt-vpicker-trigger-action">Đổi loại</span>
                  </>
                ) : (
                  <>
                    <span className="pt-vpicker-trigger-placeholder">
                      {fertilizersCatalog.loading ? "Đang tải danh mục phân bón…" : "Bấm để chọn phân bón bằng hình ảnh"}
                    </span>
                    <DetailArrowIcon className="pt-vpicker-trigger-arrow" size={20} />
                  </>
                )}
              </button>
            </Field>

            {chosenFertilizer?.status === "warning" && (
              <p className="pt-form-error" role="alert">
                Loại phân này chứa hàm lượng Clo cao, không dùng cho sầu riêng theo tiêu chuẩn VietGAP. Nếu đã bón, vui lòng vẫn lưu trung thực để cán bộ kỹ thuật HTX hướng dẫn xử lý rửa mặn.
              </p>
            )}

            {chosenFertilizer && chosenFertilizer.status !== "warning" && chosenFertilizer.dosage && (
              <p className="pt-hint" style={{ fontVariantNumeric: "tabular-nums" }}>
                Liều khuyến cáo: <strong>{chosenFertilizer.dosage}</strong>.
              </p>
            )}

            <Field label="Liều lượng bón thực tế (không bắt buộc)" htmlFor="pf-dose">
              <input
                id="pf-dose"
                placeholder="Ví dụ: 5 kg/gốc hoặc 1 kg/cây"
                value={fertDose}
                onChange={(e) => setFertDose(e.target.value)}
              />
            </Field>
          </>
        )}

        {isSprayActivity && (
          <>
            <Field label="Loại thuốc bảo vệ thực vật sử dụng" htmlFor="ps-pesticide-trigger">
              <button
                id="ps-pesticide-trigger"
                type="button"
                className={`pt-vpicker-trigger ${chosenPesticide ? "has-value" : ""}`}
                onClick={() => setPickerMode("pesticide")}
              >
                {chosenPesticide ? (
                  <>
                    <span className="pt-vpicker-trigger-thumb">
                      <img
                        src={getPesticideImage(chosenPesticide)}
                        alt={chosenPesticide.name}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="pt-vpicker-trigger-info">
                      <strong className="pt-vpicker-trigger-name">{chosenPesticide.name}</strong>
                      <span
                        className={`pt-vpicker-trigger-sub ${chosenPesticide.status === "banned"
                          ? "is-danger"
                          : chosenPesticide.status === "restricted"
                            ? "is-warn"
                            : ""
                          }`}
                      >
                        {chosenPesticide.status === "banned"
                          ? "Danh mục cấm sử dụng"
                          : chosenPesticide.status === "restricted"
                            ? `Hạn chế, cách ly ${chosenPesticide.isolationDays ?? 0} ngày`
                            : `Cách ly ${chosenPesticide.isolationDays ?? 0} ngày`}
                      </span>
                    </span>
                    <span className="pt-vpicker-trigger-action">Đổi loại</span>
                  </>
                ) : (
                  <>
                    <span className="pt-vpicker-trigger-placeholder">
                      {pesticides.loading ? "Đang tải danh mục thuốc…" : "Bấm để chọn thuốc bằng hình ảnh"}
                    </span>
                    <DetailArrowIcon className="pt-vpicker-trigger-arrow" size={20} />
                  </>
                )}
              </button>
            </Field>

            {chosenPesticide?.status === "banned" && (
              <p className="pt-form-error" role="alert">
                Thuốc này nằm trong danh mục cấm sử dụng cho sầu riêng xuất khẩu. Nếu đã phun, vui lòng vẫn lưu lại trung thực để cán bộ kỹ thuật HTX kịp thời hỗ trợ khoanh vùng xử lý.
              </p>
            )}

            {chosenPesticide?.status === "restricted" && (
              <p
                className="pt-hint"
                role="status"
                style={{
                  background: "#fffbeb",
                  border: "1px solid #d4d4d2",
                  color: "#92400e",
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
              >
                Hoạt chất kiểm soát đặc biệt: chỉ dùng theo hướng dẫn kỹ thuật của HTX và tuân thủ thời gian cách ly {chosenPesticide.isolationDays ?? 0} ngày.
              </p>
            )}

            {chosenPesticide && chosenPesticide.status !== "banned" && (
              <p className="pt-hint" style={{ fontVariantNumeric: "tabular-nums" }}>
                Thời gian cách ly tự động: <strong>{chosenPesticide.isolationDays ?? 0} ngày</strong> trước thu hoạch
                {safeFromIso ? ` (được phép thu hái từ ngày ${formatDate(safeFromIso)})` : ""}.
              </p>
            )}

            <div className="pt-field-row">
              <Field label="Liều lượng pha phun" htmlFor="ps-dose">
                <input
                  id="ps-dose"
                  placeholder="Ví dụ: 100 ml / bình 20L"
                  value={dose}
                  onChange={(e) => setDose(e.target.value)}
                  required
                />
              </Field>
              <Field label="Diện tích phun (ha)" htmlFor="ps-area">
                <input
                  id="ps-area"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={areaHa}
                  onChange={(e) => {
                    setAreaTouched(true);
                    setAreaHa(e.target.value);
                  }}
                  required
                />
              </Field>
            </div>

            <Field label="Cửa hàng / Đại lý cung cấp thuốc (không bắt buộc)" htmlFor="ps-source">
              <input
                id="ps-source"
                placeholder="Tên đại lý vật tư nông nghiệp"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </Field>
          </>
        )}

        <Field
          label={isSprayActivity ? "Ghi chú tình trạng sâu bệnh (không bắt buộc)" : "Ghi chú công việc và vật tư"}
          htmlFor="pj-detail"
        >
          <textarea
            id="pj-detail"
            rows={3}
            maxLength={500}
            placeholder={
              isSprayActivity
                ? "Ví dụ: Phun phòng rầy xanh trên cơi đọt 2 vào sáng sớm..."
                : "Mô tả công việc"
            }
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </Field>

        {!isSprayActivity && (
          <div className="pt-journal-gps-card">
            <div className="pt-journal-gps-text">
              <span className="pt-journal-gps-title">Tọa độ GPS vườn (tùy chọn)</span>
              <span className="pt-journal-gps-desc">
                {coords
                  ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                  : gpsStatus || "Chưa định vị"}
              </span>
            </div>
            <button
              type="button"
              className={`pt-gps-btn ${coords ? "is-active" : ""}`}
              onClick={getGps}
              disabled={locating || saving}
              title={coords ? `Đã định vị: ${coords.latitude}, ${coords.longitude}` : "Lấy vị trí định vị của vườn hiện tại"}
            >
              <RadialPngIcon src="/map-pin.png" size={16} className="pt-gps-icon" />
              <span>{locating ? "Đang lấy GPS…" : coords ? "Cập nhật GPS" : "Định vị vườn"}</span>
            </button>
          </div>
        )}

        <MultiPhotoField
          id="pj-photo-input"
          label={isSprayActivity ? "Ảnh phun thuốc, nhãn thuốc" : "Ảnh, video hiện trường"}
          picker={media}
          required
          description="Tối đa 8 ảnh hoặc video dưới 90 giây."
          cameraLabel="Chụp ảnh"
          galleryLabel="Chọn nhiều ảnh"
          videoLabel="Thêm video"
          disabled={saving}
        />

        <InlineError message={error} />
      </form>

      {pickerMode === "pesticide" && (
        <VisualCatalogPickerSheet
          title="Chọn thuốc bảo vệ thực vật"
          hint="Vuốt sang ngang và chạm vào đúng hình chai hoặc gói thuốc đã dùng"
          searchPlaceholder="Tìm nhanh tên thuốc hoặc hoạt chất..."
          options={pesticidePickerOptions}
          selectedId={pesticideId}
          loading={pesticides.loading}
          onSelect={(id) => {
            setPesticideId(id);
            setError(null);
          }}
          onClose={() => setPickerMode(null)}
        />
      )}

      {pickerMode === "fertilizer" && (
        <VisualCatalogPickerSheet
          title="Chọn loại phân bón"
          hint="Vuốt sang ngang và chạm vào đúng hình bao hoặc chai phân bón đã dùng"
          searchPlaceholder="Tìm nhanh tên phân bón hoặc công thức..."
          options={fertilizerPickerOptions}
          selectedId={fertilizerId}
          loading={fertilizersCatalog.loading}
          onSelect={(id) => {
            setFertilizerId(id);
            setError(null);
          }}
          onClose={() => setPickerMode(null)}
        />
      )}
    </Sheet>
  );
}

function JournalDetailModal({
  entry,
  onClose,
  onDeleted,
}: {
  entry: PortalJournalEntry;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const sheetClose = useSheetClose();
  const closeModal = sheetClose ?? onClose;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const lat = toNumber(entry.latitude);
  const lng = toNumber(entry.longitude);
  const hasRealCoords = lat !== null && lng !== null;
  const allowDelete = canDeleteEntry(entry);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/portal/journal/${entry.id}`);
      // Xóa nhật ký có thể làm mất bằng chứng khắc phục vi phạm: làm mới cả danh sách vi phạm
      invalidatePortal("journal", "spray", "violations", "overview");
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err, "Không xóa được bản ghi nhật ký."));
      setDeleting(false);
    }
  };

  return (
    <div className="pt-diary-detail-body">
      <div className="pt-detail-hero">
        <div className="pt-detail-hero-icon-box">
          <img
            src="/note.png?v=2"
            alt=""
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="pt-detail-hero-icon"
          />
        </div>
        <div className="pt-detail-hero-info">
          <h3 className="pt-detail-hero-title">{entry.activity}</h3>
        </div>
      </div>

      <div className="pt-detail-grid">
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Thửa canh tác</span>
          <span className="pt-detail-cell-value">Thửa {entry.plotCode}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Ngày thực hiện tại vườn</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDate(entry.entryOn)}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Thời điểm khai báo thực tế</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDateTime(entry.serverRecordedAt || entry.createdAt)}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Độ trễ khai báo</span>
          <span
            className="pt-detail-cell-value"
            style={{
              fontVariantNumeric: "tabular-nums",
              color: (entry.lateDeclarationDays ?? 0) > 0 ? "#9a6712" : "#15803d",
            }}
          >
            {(entry.lateDeclarationDays ?? 0) > 0
              ? `Khai báo chậm ${entry.lateDeclarationDays} ngày`
              : "Khai báo đúng trong ngày"}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Người ghi ban đầu</span>
          <span className="pt-detail-cell-value">{entry.recorder || "Chủ hộ"}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Mã ghi nhận</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>#NK-{entry.id}</span>
        </div>
        {(entry.updatedByName || entry.updatedAt) && (
          <>
            <div className="pt-detail-cell">
              <span className="pt-detail-cell-label">Người chỉnh sửa</span>
              <span className="pt-detail-cell-value" style={{ color: "#9a6712", fontWeight: 600 }}>
                {formatDiaryEditor(entry.updatedByName, entry.updatedByRole) || "Đã chỉnh sửa"}
                {(entry.editCount ?? 0) > 1 ? ` (${entry.editCount} lần)` : ""}
              </span>
            </div>
            {entry.updatedAt && (
              <div className="pt-detail-cell">
                <span className="pt-detail-cell-label">Thời điểm chỉnh sửa</span>
                <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatDateTime(entry.updatedAt)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {hasRealCoords && (
        <div className="pt-detail-gps-box">
          <img
            src="/location-pin.png"
            alt=""
            width={18}
            height={18}
            loading="lazy"
            decoding="async"
            className="pt-detail-gps-icon"
            aria-hidden="true"
          />
          <div>
            <div className="pt-detail-gps-title">
              Tọa độ GPS thực địa{entry.gpsVerified ? " - Khớp ranh giới GIS thửa vườn" : ""}
            </div>
            <div className="pt-detail-gps-coords" style={{ fontVariantNumeric: "tabular-nums" }}>
              {lat.toFixed(5)}, {lng.toFixed(5)}
              {!entry.gpsVerified && entry.gpsDistanceM != null
                ? ` (cách ranh giới ${Math.round(Number(entry.gpsDistanceM))} m)`
                : ""}
            </div>
          </div>
        </div>
      )}

      {entry.lateReason && entry.lateReason !== "Khai báo bổ sung sau thời điểm thực hiện" && (
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Lý do ghi bổ sung</span>
          <span className="pt-detail-cell-value">{entry.lateReason}</span>
        </div>
      )}

      {/* Ảnh và video chụp hiện trường minh chứng thực tế */}
      <div className="pt-detail-section">
        <div className="pt-detail-section-header">
          <h4 className="pt-detail-section-title">Minh chứng hiện trường vườn</h4>
          {(entry.photoUrls?.length || entry.photoUrl) && (
            <span className="pt-detail-photo-tag">Đã xác thực thực địa</span>
          )}
        </div>
        {entry.photoUrls?.length || entry.photoUrl ? (
          <StoredMediaGallery
            urls={entry.photoUrls}
            fallbackUrl={entry.photoUrl}
            altPrefix={`Hiện trường ${entry.activity}`}
            caption={`Thửa ${entry.plotCode} - Ngày ${formatDate(entry.entryOn)}`}
          />
        ) : (
          <div className="pt-detail-no-photo">
            <span>Bản ghi này không có tệp ảnh đính kèm trên máy chủ.</span>
          </div>
        )}
      </div>

      <div className="pt-detail-section">
        <h4 className="pt-detail-section-title">Nội dung công việc & vật tư sử dụng</h4>
        <div className="pt-detail-content-box">
          {entry.detail ? (
            <p className="pt-detail-text">{entry.detail}</p>
          ) : (
            <p className="pt-detail-empty">Không có ghi chú thêm cho lần canh tác này.</p>
          )}
        </div>
      </div>

      <InlineError message={deleteError} />

      <div className="pt-detail-footer" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {allowDelete && (
          <ConfirmButton
            label="Xóa bản ghi này (trong 24h)"
            title="Xóa nhật ký canh tác"
            question="Xác nhận xóa bản ghi nhật ký canh tác này? Thao tác không thể hoàn tác."
            confirmLabel="Xóa nhật ký"
            className="pt-btn pt-btn-danger pt-btn-block"
            busy={deleting}
            onConfirm={handleDelete}
          />
        )}
        <button type="button" className="pt-btn pt-btn-primary pt-btn-block" onClick={closeModal} disabled={deleting}>
          Đóng chi tiết
        </button>
      </div>
    </div>
  );
}

function SprayDetailModal({
  record,
  onClose,
  onDeleted,
}: {
  record: PortalSprayRecord;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const sheetClose = useSheetClose();
  const closeModal = sheetClose ?? onClose;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isPass = record.mrlStatus === "pass";
  const isBanned = record.pesticideStatus === "banned";
  const allowDelete = canDeleteSpray(record);

  const safeDateIso =
    record.isolationEndsOn ||
    (record.isolationDays > 0 ? addIsoDays(record.sprayedOn, record.isolationDays) : null);
  const remainingPhiDays = safeDateIso ? daysUntil(safeDateIso) : null;
  const inIsolation = remainingPhiDays !== null && remainingPhiDays > 0;

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/portal/spray/${record.id}`);
      invalidatePortal("spray", "journal", "overview", "violations");
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err, "Không xóa được bản ghi phun thuốc."));
      setDeleting(false);
    }
  };

  return (
    <div className="pt-diary-detail-body">
      <div className="pt-detail-hero">
        <div className="pt-detail-hero-icon-box">
          <img
            src="/note.png?v=2"
            alt=""
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="pt-detail-hero-icon"
          />
        </div>
        <div className="pt-detail-hero-info">
          <h3 className="pt-detail-hero-title">{record.pesticide}</h3>
        </div>
      </div>

      <div className="pt-detail-grid">
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Ngày phun tại vườn</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDate(record.sprayedOn)}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Thời điểm khai báo thực tế</span>
          <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatDateTime(record.serverRecordedAt || record.createdAt)}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Độ trễ khai báo</span>
          <span
            className="pt-detail-cell-value"
            style={{
              fontVariantNumeric: "tabular-nums",
              color: (record.lateDeclarationDays ?? 0) > 0 ? "#9a6712" : "#15803d",
            }}
          >
            {(record.lateDeclarationDays ?? 0) > 0
              ? `Khai báo chậm ${record.lateDeclarationDays} ngày`
              : "Khai báo đúng trong ngày"}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Liều lượng sử dụng</span>
          <span className="pt-detail-cell-value">{record.dose}</span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Diện tích phun</span>
          <span className="pt-detail-cell-value">
            {record.areaHa} ha{record.plotCode ? ` - Thửa ${record.plotCode}` : " - Toàn vườn"}
          </span>
        </div>
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Cách ly trước thu hoạch (PHI)</span>
          <span className="pt-detail-cell-value">
            {record.isolationDays} ngày (thu từ {safeDateIso ? formatDate(safeDateIso) : formatDate(record.sprayedOn)})
          </span>
        </div>
        {record.recordedByRole && (
          <div className="pt-detail-cell">
            <span className="pt-detail-cell-label">Người ghi ban đầu</span>
            <span className="pt-detail-cell-value">{formatDiaryRole(record.recordedByRole) || "Chủ hộ"}</span>
          </div>
        )}
        {(record.updatedByName || record.updatedAt) && (
          <>
            <div className="pt-detail-cell">
              <span className="pt-detail-cell-label">Người chỉnh sửa</span>
              <span className="pt-detail-cell-value" style={{ color: "#9a6712", fontWeight: 600 }}>
                {formatDiaryEditor(record.updatedByName, record.updatedByRole) || "Đã chỉnh sửa"}
                {(record.editCount ?? 0) > 1 ? ` (${record.editCount} lần)` : ""}
              </span>
            </div>
            {record.updatedAt && (
              <div className="pt-detail-cell">
                <span className="pt-detail-cell-label">Thời điểm chỉnh sửa</span>
                <span className="pt-detail-cell-value" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatDateTime(record.updatedAt)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="pt-detail-section">
        <h4 className="pt-detail-section-title">Nguồn gốc và ghi chú</h4>
        <div className="pt-detail-content-box">
          <p className="pt-detail-text">
            {record.source ? `Đại lý cung cấp: ${record.source}` : "Chưa ghi nhận đại lý cung cấp"}
          </p>
          {record.note && (
            <p className="pt-detail-text" style={{ marginTop: 6 }}>
              Ghi chú: {record.note}
            </p>
          )}
        </div>
      </div>

      {(record.photoUrls?.length || record.photoUrl) && (
        <div className="pt-detail-section">
          <h4 className="pt-detail-section-title">Minh chứng hiện trường</h4>
          <StoredMediaGallery
            urls={record.photoUrls}
            fallbackUrl={record.photoUrl}
            altPrefix={`Hiện trường phun thuốc ${record.pesticide}`}
            caption={`Ảnh hiện trường phun thuốc ngày ${formatDate(record.sprayedOn)}`}
          />
        </div>
      )}

      {record.lateReason && record.lateReason !== "Khai báo bổ sung sau thời điểm thực hiện" && (
        <div className="pt-detail-cell">
          <span className="pt-detail-cell-label">Lý do khai báo bổ sung</span>
          <span className="pt-detail-cell-value">{record.lateReason}</span>
        </div>
      )}

      <div className={`pt-detail-compliance-box ${isPass && !isBanned ? "is-safe" : "is-warning"}`}>
        <div className="pt-detail-compliance-title">
          {isBanned
            ? "Cảnh báo hoạt chất cấm xuất khẩu"
            : inIsolation
              ? `Đang trong thời gian cách ly PHI (còn ${remainingPhiDays} ngày)`
              : isPass
                ? "Đáp ứng tiêu chuẩn an toàn VietGAP & GACC"
                : "Cảnh báo an toàn dư lượng"}
        </div>
        <div className="pt-detail-compliance-desc">
          {isBanned
            ? "Hoạt chất nằm trong danh mục cấm sử dụng. Thông tin đã được chuyển tới cán bộ kỹ thuật HTX để hỗ trợ khoanh vùng xử lý."
            : inIsolation && safeDateIso
              ? `Tuyệt đối chưa thu hái hoặc kích hoạt tem quả trên thửa này trước ngày ${formatDate(safeDateIso)}.`
              : `Đã đảm bảo thời gian cách ly tối thiểu ${record.isolationDays} ngày trước thu hoạch.`}
        </div>
      </div>

      <InlineError message={deleteError} />

      <div className="pt-detail-footer" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {allowDelete && (
          <ConfirmButton
            label="Xóa bản ghi này (trong 24h)"
            title="Xóa nhật ký phun thuốc"
            question="Xác nhận xóa bản ghi phun thuốc nhập nhầm này? Thao tác không thể hoàn tác."
            confirmLabel="Xóa bản ghi"
            className="pt-btn pt-btn-danger pt-btn-block"
            busy={deleting}
            onConfirm={handleDelete}
          />
        )}
        <button type="button" className="pt-btn pt-btn-primary pt-btn-block" onClick={closeModal} disabled={deleting}>
          Đóng chi tiết
        </button>
      </div>
    </div>
  );
}

type CombinedDiaryItem =
  | { kind: "journal"; key: string; date: string; recordedAt: number; entry: PortalJournalEntry }
  | { kind: "spray"; key: string; date: string; recordedAt: number; record: PortalSprayRecord };

interface DiaryDayGroup {
  date: string;
  label: string;
  items: CombinedDiaryItem[];
}

function formatDiaryDayHeading(isoDate: string): string {
  const diff = daysSince(isoDate);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  return formatDate(isoDate);
}

export default function DiaryTab({ initialAction }: { initialAction?: PortalAction } = {}) {
  const sync = useOfflineSyncState();
  const journal = usePortal<PortalList<PortalJournalEntry>>("journal");
  const spray = usePortal<PortalList<PortalSprayRecord>>("spray");
  const plots = usePortal<PortalPlots>("plots");
  const [persistedFormOpen, setPersistedFormOpen] = usePersistedState("portal:diary:form-open", false);
  const [persistedFormActivity, setPersistedFormActivity] = usePersistedState<string | null>(
    "portal:diary:form-activity",
    null,
    (v): v is string | null => v === null || typeof v === "string",
  );
  const actionOpensForm = initialAction === "journal-add" || initialAction === "spray-add";
  const formOpen = actionOpensForm || persistedFormOpen;
  const formInitialActivity =
    initialAction === "spray-add" ? SPRAY_ACTIVITY_NAME : (persistedFormActivity ?? undefined);
  const setFormOpen = (next: boolean) => setPersistedFormOpen(next);
  const setFormInitialActivity = (next: string | undefined) => setPersistedFormActivity(next ?? null);

  const [selectedJournal, setSelectedJournal] = usePersistedRecordSelection(
    "portal:diary:journal",
    journal.data?.data,
    (it) => it.id,
    journal.loading && !journal.data,
  );
  const [selectedSpray, setSelectedSpray] = usePersistedRecordSelection(
    "portal:diary:spray",
    spray.data?.data,
    (it) => it.id,
    spray.loading && !spray.data,
  );
  const plotsList = plots.data?.available ? plots.data.data : [];
  const hasPendingOfflineItems = sync.items.some(
    (it) => it.kind === "portal-journal" || it.kind === "portal-spray",
  );

  const combinedItems = useMemo<CombinedDiaryItem[]>(() => {
    const out: CombinedDiaryItem[] = [];
    for (const entry of journal.data?.data ?? []) {
      const ts = new Date(entry.serverRecordedAt || entry.createdAt || `${entry.entryOn}T00:00:00Z`).getTime();
      out.push({
        kind: "journal",
        key: `j-${entry.id}`,
        date: entry.entryOn,
        recordedAt: Number.isFinite(ts) ? ts : 0,
        entry,
      });
    }
    for (const record of spray.data?.data ?? []) {
      const ts = new Date(record.serverRecordedAt || record.createdAt || `${record.sprayedOn}T00:00:00Z`).getTime();
      out.push({
        kind: "spray",
        key: `s-${record.id}`,
        date: record.sprayedOn,
        recordedAt: Number.isFinite(ts) ? ts : 0,
        record,
      });
    }
    out.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.recordedAt - a.recordedAt;
    });
    return out;
  }, [journal.data, spray.data]);

  const isLoading = (journal.loading && !journal.data) || (spray.loading && !spray.data);
  const combinedError = !journal.data && !spray.data ? (journal.error ?? spray.error) : null;
  const hasLoadedOnce = Boolean(journal.data || spray.data);
  const progressive = useProgressiveCount(combinedItems.length, 16, 16);
  const visibleItems = useMemo(
    () => combinedItems.slice(0, progressive.visibleCount),
    [combinedItems, progressive.visibleCount],
  );

  const dayGroups = useMemo<DiaryDayGroup[]>(() => {
    const groups: DiaryDayGroup[] = [];
    for (const item of visibleItems) {
      const last = groups[groups.length - 1];
      if (last && last.date === item.date) {
        last.items.push(item);
      } else {
        groups.push({
          date: item.date,
          label: formatDiaryDayHeading(item.date),
          items: [item],
        });
      }
    }
    return groups;
  }, [visibleItems]);

  return (
    <div className="pt-stack">
      <section className="pt-diary-section" aria-labelledby="diary-heading">
        <div className="pt-diary-header">
          <h2 id="diary-heading" className="pt-plots-title">
            Nhật ký canh tác
          </h2>
          <button
            type="button"
            className="pt-diary-create-btn"
            onClick={() => {
              setFormInitialActivity(undefined);
              setFormOpen(true);
            }}
            title="Ghi công việc chăm sóc hoặc phun thuốc mới"
          >
            Ghi nhật ký
          </button>
        </div>

        <OfflinePendingDiaryCards kinds={["portal-journal", "portal-spray"]} />
        <StateBlock loading={isLoading} error={combinedError} />

        {hasLoadedOnce && combinedItems.length === 0 && !hasPendingOfflineItems && (
          <EmptyState icon="empty">
            Chưa có nhật ký nào. Bấm “Ghi nhật ký” để lưu công việc đầu tiên.
          </EmptyState>
        )}

        {dayGroups.length > 0 && (
          <>
            <div className="pt-diary-day-groups">
              {dayGroups.map((group) => (
                <div key={group.date} className="pt-diary-day-group">
                  <div className="pt-diary-day-head">
                    <span className="pt-diary-day-label">{group.label}</span>
                  </div>
                  <ul className="pt-diary-day-card" role="list">
                    {group.items.map((item) => {
                      if (item.kind === "journal") {
                        const entry = item.entry;
                        const lateDays = entry.lateDeclarationDays ?? 0;
                        const subNotes: string[] = [];
                        if (lateDays > 0) subNotes.push(`Khai chậm ${lateDays} ngày`);
                        if (entry.updatedByName) {
                          subNotes.push(`Đã sửa bởi ${formatDiaryEditor(entry.updatedByName, entry.updatedByRole)}`);
                        }

                        return (
                          <li key={item.key}>
                            <div
                              role="button"
                              tabIndex={0}
                              className="pt-widget-item pt-diary-day-row"
                              onClick={() => setSelectedJournal(entry)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedJournal(entry);
                                }
                              }}
                              title="Bấm để xem chi tiết nhật ký"
                            >
                              <img
                                src="/note.png?v=2"
                                alt=""
                                width={20}
                                height={20}
                                loading="lazy"
                                decoding="async"
                                className="pt-widget-note-icon"
                                aria-hidden="true"
                              />
                              <span className="pt-diary-item-body">
                                <span className="pt-diary-item-title">{entry.activity}</span>
                                {subNotes.length > 0 && (
                                  <span className="pt-diary-item-sub">{subNotes.join(", ")}</span>
                                )}
                              </span>
                              {entry.plotCode && (
                                <span className="pt-diary-item-plot">Thửa {entry.plotCode}</span>
                              )}
                              <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                            </div>
                          </li>
                        );
                      }

                      const record = item.record;
                      const safeIso =
                        record.isolationEndsOn ??
                        (record.isolationDays > 0 ? addIsoDays(record.sprayedOn, record.isolationDays) : null);
                      const remPhi = safeIso ? daysUntil(safeIso) : null;
                      const inPhi = remPhi !== null && remPhi > 0;
                      const lateDays = record.lateDeclarationDays ?? 0;
                      const subNotes: string[] = [];
                      if (inPhi) {
                        subNotes.push(`Cách ly còn ${remPhi} ngày`);
                      } else if (lateDays > 0) {
                        subNotes.push(`Khai chậm ${lateDays} ngày`);
                      }
                      if (record.updatedByName) {
                        subNotes.push(`Đã sửa bởi ${formatDiaryEditor(record.updatedByName, record.updatedByRole)}`);
                      }

                      return (
                        <li key={item.key}>
                          <div
                            role="button"
                            tabIndex={0}
                            className="pt-widget-item pt-diary-day-row"
                            onClick={() => setSelectedSpray(record)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedSpray(record);
                              }
                            }}
                            title="Bấm để xem chi tiết lần phun thuốc"
                          >
                            <img
                              src="/note.png?v=2"
                              alt=""
                              width={20}
                              height={20}
                              loading="lazy"
                              decoding="async"
                              className="pt-widget-note-icon"
                              aria-hidden="true"
                            />
                            <span className="pt-diary-item-body">
                              <span className="pt-diary-item-title">Phun thuốc: {record.pesticide}</span>
                              {subNotes.length > 0 && (
                                <span className="pt-diary-item-sub">{subNotes.join(", ")}</span>
                              )}
                            </span>
                            {record.plotCode && (
                              <span className="pt-diary-item-plot">Thửa {record.plotCode}</span>
                            )}
                            <DetailArrowIcon className="pt-widget-item-arrow" size={22} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <ProgressiveListFooter
              hasMore={progressive.hasMore}
              remainingCount={progressive.remainingCount}
              sentinelRef={progressive.sentinelRef}
              onShowMore={progressive.showMore}
              unitLabel="nhật ký"
            />
          </>
        )}
      </section>

      {formOpen && (
        <UnifiedDiaryForm
          plotsList={plotsList}
          initialActivity={formInitialActivity}
          initialDraft={sync.workingDraft}
          onDone={() => {
            setFormOpen(false);
          }}
          onClose={() => {
            setFormOpen(false);
          }}
        />
      )}

      {selectedJournal && (
        <Sheet title="Chi tiết nhật ký canh tác" className="pt-diary-sheet" onClose={() => setSelectedJournal(null)}>
          <JournalDetailModal
            entry={selectedJournal}
            onClose={() => setSelectedJournal(null)}
            onDeleted={() => setSelectedJournal(null)}
          />
        </Sheet>
      )}

      {selectedSpray && (
        <Sheet title="Chi tiết lần phun thuốc" className="pt-diary-sheet" onClose={() => setSelectedSpray(null)}>
          <SprayDetailModal
            record={selectedSpray}
            onClose={() => setSelectedSpray(null)}
            onDeleted={() => setSelectedSpray(null)}
          />
        </Sheet>
      )}
    </div>
  );
}
