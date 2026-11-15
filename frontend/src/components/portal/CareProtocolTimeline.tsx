"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { invalidatePortal, useCatalog, usePortal } from "@/hooks/use-portal";
import { api, errorMessage } from "@/lib/api-client";
import { todayIso } from "@/lib/portal-labels";
import type { PesticideDto } from "@/types/api";
import type {
  CareMilestoneDeclaration,
  CareMilestoneItem,
  CareProtocolPortalResponse,
  ComplianceIssue,
  ComplianceStatus,
  ConfigurePlotCarePlanBody,
  DeclareCareMilestoneBody,
  DeclareCareMilestoneResponse,
  PlanOverallHealth,
  PlotCarePlanTimeline,
  SenProRuleSpec,
} from "@/types/care-protocol";
import { formatDate } from "@/utils/format";
import { BusyButton, InlineError, PhotoField, StoredPhoto, usePhotoPicker } from "./shared/controls";
import { Field, Sheet, StateBlock, useSheetClose } from "./ui";

type TagTone = "green" | "gold" | "red" | "blue" | "gray";

function StatusTag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  const toneClass = tone === "gray" ? "" : `cp-tag-${tone}`;
  return <span className={`cp-tag ${toneClass}`.trim()}>{children}</span>;
}

function addIsoDays(isoDate: string, days: number): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return undefined;
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

function healthBadge(health: PlanOverallHealth, active?: CareMilestoneItem | null): { label: string; tone: TagTone } {
  if (health === "completed") return { label: "Hoàn tất 8 giai đoạn", tone: "green" };
  if (health === "overdue_critical") {
    return { label: `Quá hạn ${active?.daysOverdue ?? 5} ngày`, tone: "red" };
  }
  if (health === "overdue") {
    return { label: `Trễ ${active?.daysOverdue ?? 1} ngày`, tone: "gold" };
  }
  if (health === "due_now") {
    return { label: "Đến lịch thực hiện", tone: "blue" };
  }
  return { label: "Đúng tiến độ", tone: "green" };
}

function milestoneStateBadge(item: CareMilestoneItem): { label: string; tone: TagTone } {
  if (item.state === "completed") {
    if (item.declaration?.complianceStatus === "violation") {
      return { label: "Sai lệch phác đồ", tone: "red" };
    }
    if (item.declaration?.complianceStatus === "warning") {
      return { label: "Có lưu ý điều chỉnh", tone: "gold" };
    }
    return { label: "Đã hoàn thành", tone: "green" };
  }
  if (item.state === "skipped_prior") return { label: "Trước kỳ đồng bộ", tone: "gray" };
  if (item.state === "overdue_critical") return { label: `Quá hạn ${item.daysOverdue} ngày`, tone: "red" };
  if (item.state === "overdue") return { label: `Trễ ${item.daysOverdue} ngày`, tone: "gold" };
  if (item.state === "due_now") return { label: "Đến lịch hôm nay", tone: "blue" };
  if (item.state === "upcoming_current") {
    return {
      label: item.daysUntilScheduled > 0 ? `Còn ${item.daysUntilScheduled} ngày` : "Mốc hiện tại",
      tone: "blue",
    };
  }
  if (item.state === "upcoming_next") return { label: "Mốc kế tiếp", tone: "gray" };
  return { label: "Sắp tới", tone: "gray" };
}

function complianceBadge(status: ComplianceStatus): { label: string; tone: TagTone } {
  if (status === "violation") return { label: "Vi phạm phác đồ - Đã báo HTX", tone: "red" };
  if (status === "warning") return { label: "Có điều chỉnh so với chuẩn", tone: "gold" };
  return { label: "Đúng chuẩn quy trình 2026-2027", tone: "green" };
}

function previewLocalComplianceWarnings(params: {
  stageCode: string;
  isSenPro: boolean;
  expectedDilution?: string;
  followedStandard: boolean;
  selectedProducts: string[];
  standardProducts: string[];
  actualDosage: string;
  extraInputs: string;
}): string[] {
  const warnings: string[] = [];
  const combined = `${params.selectedProducts.join(" ")} ${params.actualDosage} ${params.extraInputs}`.toLowerCase();

  if (
    /\b(vang\s*o|auramine|paclobutrazol|chlorpyrifos|carbaryl|paraquat|glyphosate|methamidophos)\b/i.test(combined) ||
    combined.includes("vàng o")
  ) {
    warnings.push(
      "Phát hiện hoạt chất cấm xuất khẩu (Vàng O, Paclobutrazol hoặc hoạt chất cấm). Hệ thống sẽ gửi cảnh báo vi phạm ngay tới Ban quản trị HTX.",
    );
  }

  if (
    ["nuoi-trai", "nuoi-trai-keo-coi", "lam-com"].includes(params.stageCode) &&
    (/\bkcl\b/i.test(combined) || combined.includes("kali đỏ") || combined.includes("kali clorua"))
  ) {
    warnings.push(
      "Giai đoạn nuôi trái và làm cơm tuyệt đối không dùng Kali đỏ (KCl) vì gây sượng cơm. Khai báo này sẽ tự động gửi cảnh báo tới Quản trị viên và hộ.",
    );
  }

  if (params.isSenPro && params.expectedDilution) {
    const norm = params.actualDosage.replace(/\s+/g, "");
    if (!norm.includes(params.expectedDilution)) {
      warnings.push(
        `Tỷ lệ pha SenPro chuẩn cho trạng thái đọt này là ${params.expectedDilution}. Pha sai tỷ lệ sẽ phát cảnh báo sai quy trình.`,
      );
    }
  }

  if (!params.followedStandard) {
    warnings.push(
      "Bạn đang chọn điều chỉnh khác phác đồ chuẩn. Hệ thống sẽ ghi nhận lưu ý để cán bộ kỹ thuật HTX hỗ trợ.",
    );
  } else if (params.standardProducts.length > 0 && params.selectedProducts.length === 0) {
    warnings.push("Chưa chọn vật tư chuẩn nào của mốc chăm sóc này.");
  }

  return warnings;
}

interface GroupedStage {
  stageCode: string;
  stageOrder: string;
  stageName: string;
  stageDurationLabel: string;
  items: CareMilestoneItem[];
  completedCount: number;
  applicableCount: number;
  hasActive: boolean;
  hasOverdue: boolean;
}

function groupMilestonesByStage(milestones: CareMilestoneItem[]): GroupedStage[] {
  const map = new Map<string, GroupedStage>();
  for (const m of milestones) {
    let group = map.get(m.stageCode);
    if (!group) {
      group = {
        stageCode: m.stageCode,
        stageOrder: m.stageOrder,
        stageName: m.stageName,
        stageDurationLabel: m.stageDurationLabel,
        items: [],
        completedCount: 0,
        applicableCount: 0,
        hasActive: false,
        hasOverdue: false,
      };
      map.set(m.stageCode, group);
    }
    group.items.push(m);
    if (m.state !== "skipped_prior") {
      group.applicableCount += 1;
      if (m.state === "completed") group.completedCount += 1;
    }
    if (
      m.state === "due_now" ||
      m.state === "upcoming_current" ||
      m.state === "overdue" ||
      m.state === "overdue_critical"
    ) {
      group.hasActive = true;
    }
    if (m.state === "overdue" || m.state === "overdue_critical") {
      group.hasOverdue = true;
    }
  }
  return Array.from(map.values());
}

/* ──────────────────────────── Form đồng bộ giai đoạn thửa vườn ──────────────────────────── */

function ConfigureCarePlanForm({
  plan,
  onSaved,
  onClose,
}: {
  plan: PlotCarePlanTimeline;
  onSaved: (updated: PlotCarePlanTimeline) => void;
  onClose: () => void;
}) {
  const sheetClose = useSheetClose();
  const [mode, setMode] = useState<"current_milestone" | "start_cycle">("current_milestone");
  const [milestoneCode, setMilestoneCode] = useState<string>(
    plan.activeMilestone?.code ?? plan.milestones[0]?.code ?? "cb-rua-vuon",
  );
  const [anchorDate, setAnchorDate] = useState<string>(todayIso());
  const [note, setNote] = useState<string>(plan.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSpec = useMemo(
    () => plan.milestones.find((m) => m.code === milestoneCode) ?? plan.milestones[0],
    [plan.milestones, milestoneCode],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: ConfigurePlotCarePlanBody = {
        plotCode: plan.plotCode,
        mode,
        anchorDate,
        milestoneCode: mode === "current_milestone" ? milestoneCode : undefined,
        note: note.trim() || undefined,
      };
      const updated = await api.post<PlotCarePlanTimeline>("/portal/care-protocol/configure", body);
      invalidatePortal("care-protocol", "overview");
      onSaved(updated);
      (sheetClose ?? onClose)();
    } catch (err) {
      setError(errorMessage(err, "Không thể cập nhật lộ trình chăm sóc."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <div className="cp-form-summary" style={{ fontSize: 13, color: "#1e3a2f", lineHeight: 1.5 }}>
        <span>
          Chọn đúng giai đoạn thực tế của{" "}
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>Thửa {plan.plotCode}</strong> để hệ thống tính lịch từng
          ngày, nhắc việc đúng thời điểm và cảnh báo tự động.
        </span>
      </div>

      <Field label="Cách thiết lập lộ trình" htmlFor="cp-mode">
        <select
          id="cp-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "current_milestone" | "start_cycle")}
        >
          <option value="current_milestone">Đồng bộ theo giai đoạn thực tế hiện nay (Khuyên dùng)</option>
          <option value="start_cycle">Bắt đầu vụ mới từ Ngày 0 (Giai đoạn 01 - Rửa vườn)</option>
        </select>
      </Field>

      {mode === "current_milestone" && (
        <Field label="Vườn đang ở giai đoạn và mốc công việc nào?" htmlFor="cp-milestone">
          <select
            id="cp-milestone"
            value={milestoneCode}
            onChange={(e) => setMilestoneCode(e.target.value)}
            required
          >
            {plan.milestones.map((m) => (
              <option key={m.code} value={m.code}>
                GĐ {m.stageOrder} {m.stageName} - {m.dayLabel} ({m.treeState})
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field
        label={
          mode === "current_milestone"
            ? "Ngày bắt đầu thực hiện mốc này"
            : "Ngày bắt đầu chuẩn bị đầu vụ (sau thu hoạch)"
        }
        htmlFor="cp-anchor-date"
      >
        <input
          id="cp-anchor-date"
          type="date"
          className="pt-input-date"
          value={anchorDate}
          onChange={(e) => setAnchorDate(e.target.value)}
          required
        />
      </Field>

      {mode === "current_milestone" && selectedSpec && (
        <div className="cp-form-summary" style={{ background: "#ffffff", fontSize: 13 }}>
          <strong style={{ color: "#14372f", fontVariantNumeric: "tabular-nums" }}>
            Giai đoạn {selectedSpec.stageOrder}: {selectedSpec.stageName} ({selectedSpec.dayLabel})
          </strong>
          <div style={{ color: "#4a5d56", lineHeight: 1.5 }}>
            Trạng thái cây chuẩn: <strong>{selectedSpec.treeState}</strong>. Công việc: {selectedSpec.actionSummary}
          </div>
        </div>
      )}

      <Field label="Ghi chú hiện trạng vườn (tùy chọn)" htmlFor="cp-note">
        <input
          id="cp-note"
          maxLength={400}
          placeholder="Ví dụ: Vườn Ri6 7 năm tuổi, cơi lá đồng đều..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <InlineError message={error} />

      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton type="submit" className="pt-btn pt-btn-primary" busy={saving} busyLabel="Đang đồng bộ...">
          Lưu lộ trình thửa vườn
        </BusyButton>
      </div>
    </form>
  );
}

/* ──────────────────────────── Form khai báo mốc chăm sóc / SenPro ──────────────────────────── */

function CareMilestoneDeclareForm({
  plotCode,
  milestone,
  senProRules,
  initialSenProCode,
  onSuccess,
  onClose,
}: {
  plotCode: string;
  milestone?: CareMilestoneItem | null;
  senProRules?: SenProRuleSpec[];
  initialSenProCode?: string;
  onSuccess: (res: DeclareCareMilestoneResponse) => void;
  onClose: () => void;
}) {
  const sheetClose = useSheetClose();
  const isSenPro = Boolean(!milestone && senProRules && senProRules.length > 0);
  const [senProCode, setSenProCode] = useState<string>(
    initialSenProCode ?? senProRules?.[0]?.code ?? "senpro-mui-giao",
  );

  const activeSenPro = useMemo(
    () => (isSenPro ? senProRules?.find((r) => r.code === senProCode) ?? senProRules?.[0] : undefined),
    [isSenPro, senProRules, senProCode],
  );

  const targetCode = isSenPro ? (activeSenPro?.code ?? "senpro-mui-giao") : (milestone?.code ?? "");
  const expectedTreeState = isSenPro
    ? (activeSenPro?.shootState ?? "Mũi giáo")
    : (milestone?.treeState ?? "");
  const standardProducts = useMemo(
    () => (isSenPro ? ["SenPro"] : (milestone?.products?.map((p) => p.name) ?? [])),
    [isSenPro, milestone],
  );
  const standardDosage = isSenPro
    ? `Pha SenPro tỷ lệ ${activeSenPro?.requiredRatio ?? "1/400"}`
    : (milestone?.standardDosageSummary ?? "");
  const requiresInvoicePhoto = isSenPro ? true : Boolean(milestone?.requiresInvoicePhoto);
  const treeStateChoices = useMemo(() => {
    if (isSenPro && senProRules) {
      return [
        expectedTreeState,
        "Đọt đi mạnh không đồng đều",
        "Đọt ra cạnh tranh lúc đang mang bông và trái non",
      ];
    }
    return milestone?.treeStateOptions?.length ? milestone.treeStateOptions : [expectedTreeState];
  }, [isSenPro, senProRules, expectedTreeState, milestone]);

  const [performedOn, setPerformedOn] = useState<string>(todayIso());
  const [actualTreeState, setActualTreeState] = useState<string>(expectedTreeState);
  const [followedStandard, setFollowedStandard] = useState<boolean>(true);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(standardProducts);
  const [actualDosage, setActualDosage] = useState<string>(standardDosage);
  const [extraInputs, setExtraInputs] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [includeBvtv, setIncludeBvtv] = useState<boolean>(false);
  const [pesticideId, setPesticideId] = useState<string>("");
  const [pesticideDose, setPesticideDose] = useState<string>("");
  const [farmerNote, setFarmerNote] = useState<string>("");
  const [lateReason, setLateReason] = useState<string>("");

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const fieldPhoto = usePhotoPicker("journal");
  const invoicePhoto = usePhotoPicker("journal");
  const pesticidesCatalog = useCatalog<PesticideDto>("pesticides");
  const allowedPesticides = useMemo(
    () => (pesticidesCatalog.rows ?? []).filter((p) => p.status !== "banned"),
    [pesticidesCatalog.rows],
  );
  const selectedPesticide = useMemo(
    () => allowedPesticides.find((p) => String(p.id) === pesticideId) ?? null,
    [allowedPesticides, pesticideId],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSenPro && activeSenPro) {
      setActualTreeState(activeSenPro.shootState);
      setSelectedProducts(["SenPro"]);
      setActualDosage(`Pha SenPro tỷ lệ ${activeSenPro.requiredRatio}`);
    }
  }, [isSenPro, activeSenPro]);

  const minBackdateIso = addIsoDays(todayIso(), -7);
  const isLateOver48h = diffDaysFromToday(performedOn) > 2;

  const localWarnings = useMemo(
    () =>
      previewLocalComplianceWarnings({
        stageCode: isSenPro ? "kiem-soat-dot-senpro" : (milestone?.stageCode ?? ""),
        isSenPro,
        expectedDilution: activeSenPro?.requiredRatio,
        followedStandard,
        selectedProducts,
        standardProducts,
        actualDosage,
        extraInputs,
      }),
    [isSenPro, milestone, activeSenPro, followedStandard, selectedProducts, standardProducts, actualDosage, extraInputs],
  );

  const toggleProduct = (prod: string) => {
    setSelectedProducts((prev) =>
      prev.includes(prod) ? prev.filter((item) => item !== prod) : [...prev, prod],
    );
  };

  const getGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCoords(null);
      setGpsStatus("Thiết bị không hỗ trợ định vị GPS");
      return;
    }
    setLocating(true);
    setGpsStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = Number(pos.coords.latitude.toFixed(6));
        const longitude = Number(pos.coords.longitude.toFixed(6));
        setCoords({ latitude, longitude });
        setGpsStatus(`Đã khóa tọa độ vườn: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setCoords(null);
        setGpsStatus(
          err.code === err.PERMISSION_DENIED
            ? "Chưa cấp quyền vị trí GPS trên trình duyệt"
            : "Chưa thu được tín hiệu GPS",
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fieldPhoto.file) {
      setError("Vui lòng chụp ảnh hiện trường thực tế tại vườn trước khi gửi khai báo.");
      return;
    }
    if (requiresInvoicePhoto && !invoicePhoto.file) {
      setError("Vui lòng chụp ảnh hóa đơn mua vật tư hoặc nhãn bao bì đã sử dụng.");
      return;
    }
    if (!actualDosage.trim()) {
      setError("Vui lòng xác nhận liều lượng thực tế đã thực hiện.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const fieldPhotoId = await fieldPhoto.ensureUploaded();
      if (!fieldPhotoId) {
        setError("Không tải lên được ảnh hiện trường vườn.");
        setSaving(false);
        return;
      }
      const invoicePhotoId = invoicePhoto.file ? await invoicePhoto.ensureUploaded() : undefined;
      if (requiresInvoicePhoto && !invoicePhotoId) {
        setError("Không tải lên được ảnh hóa đơn hoặc bao bì vật tư.");
        setSaving(false);
        return;
      }

      const body: DeclareCareMilestoneBody = {
        plotCode,
        milestoneCode: targetCode,
        performedOn,
        actualTreeState: actualTreeState.trim() || expectedTreeState,
        followedStandard,
        selectedProducts,
        actualDosage: actualDosage.trim(),
        extraInputs: extraInputs.trim() || undefined,
        supplierName: supplierName.trim() || undefined,
        pesticideId: includeBvtv && pesticideId ? Number(pesticideId) : undefined,
        pesticideDose: includeBvtv && pesticideId ? (pesticideDose.trim() || actualDosage.trim()) : undefined,
        fieldPhotoId,
        invoicePhotoId,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        farmerNote: farmerNote.trim() || undefined,
        lateReason: isLateOver48h && lateReason.trim() ? lateReason.trim() : undefined,
      };

      const res = await api.post<DeclareCareMilestoneResponse>("/portal/care-protocol/declare", body);
      invalidatePortal("care-protocol", "journal", "spray", "violations", "overview");
      onSuccess(res);
      (sheetClose ?? onClose)();
    } catch (err) {
      setError(errorMessage(err, "Không thể lưu khai báo mốc chăm sóc. Vui lòng thử lại."));
      setSaving(false);
    }
  };

  return (
    <form className="pt-form" onSubmit={submit}>
      <div className="cp-form-summary">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span className="cp-eyebrow">
            {isSenPro
              ? `Thửa ${plotCode} - Phác đồ chặn đọt SenPro`
              : `Thửa ${plotCode} - Giai đoạn ${milestone?.stageOrder}: ${milestone?.stageName}`}
          </span>
          {!isSenPro && milestone && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#4a5d56", fontVariantNumeric: "tabular-nums" }}>
              {milestone.dayLabel} (Hạn {formatDate(milestone.dueOn)})
            </span>
          )}
        </div>
        <strong style={{ fontSize: 14.5, color: "#14372f", lineHeight: 1.4, fontVariantNumeric: "tabular-nums" }}>
          {isSenPro ? activeSenPro?.actionSummary : milestone?.actionSummary}
        </strong>
        {!isSenPro && milestone?.notes && (
          <p style={{ margin: 0, fontSize: 12.5, color: "#435951", lineHeight: 1.5 }}>{milestone.notes}</p>
        )}
      </div>

      {isSenPro && senProRules && (
        <Field label="Chọn trạng thái mũi đọt thực tế (Tự động điền đúng tỷ lệ SenPro)" htmlFor="cp-senpro-stage">
          <div className="cp-senpro-picker">
            {senProRules.map((rule) => {
              const selected = rule.code === senProCode;
              return (
                <button
                  key={rule.code}
                  type="button"
                  className={`cp-senpro-pick-btn ${selected ? "is-selected" : ""}`.trim()}
                  onClick={() => setSenProCode(rule.code)}
                >
                  <strong style={{ display: "block", fontSize: 13.5, color: "#14372f" }}>{rule.shootState}</strong>
                  <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    Tỷ lệ {rule.requiredRatio} ({rule.effectLabel})
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <div className="pt-field-row">
        <Field label="Ngày thực hiện tại vườn" htmlFor="cp-performed-on">
          <input
            id="cp-performed-on"
            type="date"
            className="pt-input-date"
            min={minBackdateIso}
            max={todayIso()}
            value={performedOn}
            onChange={(e) => setPerformedOn(e.target.value)}
            required
          />
        </Field>

        <Field label="Mức độ tuân thủ phác đồ" htmlFor="cp-followed">
          <select
            id="cp-followed"
            value={followedStandard ? "yes" : "no"}
            onChange={(e) => setFollowedStandard(e.target.value === "yes")}
          >
            <option value="yes">Thực hiện đúng vật tư và liều chuẩn</option>
            <option value="no">Có điều chỉnh vật tư hoặc liều lượng</option>
          </select>
        </Field>
      </div>

      {isLateOver48h && (
        <Field label="Lý do khai báo muộn quá 48 giờ" htmlFor="cp-late-reason">
          <input
            id="cp-late-reason"
            maxLength={300}
            placeholder="Ví dụ: Mưa lớn tại vườn mất sóng điện thoại, nay bổ sung kèm ảnh..."
            value={lateReason}
            onChange={(e) => setLateReason(e.target.value)}
            required
          />
        </Field>
      )}

      <Field label="Xác nhận trạng thái cây thực tế tại vườn (chạm để chọn)" htmlFor="cp-tree-state">
        <div className="cp-choice-wrap">
          {treeStateChoices.map((opt) => {
            const active = actualTreeState === opt;
            return (
              <button
                key={opt}
                type="button"
                className={`cp-choice-btn ${active ? "is-active" : ""}`.trim()}
                onClick={() => setActualTreeState(opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <input
          id="cp-tree-state"
          maxLength={200}
          value={actualTreeState}
          onChange={(e) => setActualTreeState(e.target.value)}
          placeholder="Nhập hoặc chọn trạng thái cây thực tế"
          required
        />
      </Field>

      {standardProducts.length > 0 && (
        <Field label="Vật tư sử dụng theo tài liệu 2026-2027 (chạm để bật hoặc tắt)" htmlFor="cp-products">
          <div id="cp-products" className="cp-choice-wrap" style={{ marginBottom: 0 }}>
            {standardProducts.map((prod) => {
              const checked = selectedProducts.includes(prod);
              return (
                <button
                  key={prod}
                  type="button"
                  aria-pressed={checked}
                  className={`cp-choice-btn ${checked ? "is-active" : ""}`.trim()}
                  onClick={() => toggleProduct(prod)}
                >
                  {prod}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <div className="pt-field-row">
        <Field label="Liều lượng thực tế đã pha hoặc bón" htmlFor="cp-dosage">
          <input
            id="cp-dosage"
            maxLength={300}
            style={{ fontVariantNumeric: "tabular-nums" }}
            value={actualDosage}
            onChange={(e) => setActualDosage(e.target.value)}
            required
          />
        </Field>
        <Field label="Đại lý cung cấp vật tư (theo hóa đơn)" htmlFor="cp-supplier">
          <input
            id="cp-supplier"
            maxLength={200}
            placeholder="Ví dụ: Cửa hàng VTNN HTX Cư Né..."
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Vật tư bổ sung ngoài danh mục chuẩn (nếu có)" htmlFor="cp-extra-inputs">
        <input
          id="cp-extra-inputs"
          maxLength={400}
          placeholder="Bỏ trống nếu chỉ dùng đúng vật tư chuẩn ở trên"
          value={extraInputs}
          onChange={(e) => setExtraInputs(e.target.value)}
        />
      </Field>

      <div className="cp-form-summary" style={{ background: "#fafcfb" }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, fontWeight: 600, color: "#14372f", cursor: "pointer" }}>
          <input
            type="checkbox"
            style={{ marginTop: 3 }}
            checked={includeBvtv}
            onChange={(e) => setIncludeBvtv(e.target.checked)}
          />
          <span>Đợt này có kết hợp phun thuốc BVTV phòng sâu bệnh (tự động tính ngày cách ly PHI)</span>
        </label>

        {includeBvtv && (
          <div className="pt-field-row" style={{ marginTop: 8 }}>
            <Field label="Thuốc BVTV sử dụng" htmlFor="cp-bvtv-id">
              <select
                id="cp-bvtv-id"
                value={pesticideId}
                onChange={(e) => setPesticideId(e.target.value)}
                required={includeBvtv}
              >
                <option value="">Chọn thuốc trong danh mục cho phép</option>
                {allowedPesticides.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} (Cách ly {p.isolationDays ?? 0} ngày)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Liều phun BVTV" htmlFor="cp-bvtv-dose">
              <input
                id="cp-bvtv-dose"
                maxLength={120}
                style={{ fontVariantNumeric: "tabular-nums" }}
                placeholder={selectedPesticide?.concentration || "Ví dụ: 200ml trên phuy 200 lít"}
                value={pesticideDose}
                onChange={(e) => setPesticideDose(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      {localWarnings.length > 0 && (
        <div role="status" className="cp-alert-box">
          <strong style={{ display: "block", marginBottom: 4 }}>Cảnh báo kiểm tra quy trình tự động</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {localWarnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cp-photo-grid">
        <PhotoField
          id="cp-field-photo"
          label="01. Ảnh hiện trường cây và vườn"
          picker={fieldPhoto}
          required
          title="Chụp ảnh hiện trường vườn"
          description="Chụp tán lá, mắt cua, bông hoặc trái thực tế tại vườn"
          disabled={saving}
        />

        <PhotoField
          id="cp-invoice-photo"
          label="02. Ảnh hóa đơn hoặc nhãn vật tư"
          picker={invoicePhoto}
          required={requiresInvoicePhoto}
          title="Chụp hóa đơn hoặc bao bì vật tư"
          description={
            requiresInvoicePhoto
              ? "Bắt buộc chụp hóa đơn mua hàng hoặc nhãn chai, bao phân bón"
              : "Không bắt buộc với công việc phát cỏ cơ giới"
          }
          disabled={saving}
        />
      </div>

      <div className="cp-gps-box">
        <div style={{ fontSize: 12.5, color: "#3b5249", fontVariantNumeric: "tabular-nums" }}>
          <strong style={{ display: "block", color: "#14372f" }}>Xác thực vị trí GPS tại thửa vườn</strong>
          <span>{gpsStatus || "Bấm định vị để ghi nhận tọa độ chụp ảnh thực tế tại vườn"}</span>
        </div>
        <button
          type="button"
          className="cp-btn cp-btn-outline cp-btn-sm"
          onClick={getGps}
          disabled={locating || saving}
        >
          {locating ? "Đang lấy GPS..." : coords ? "Cập nhật GPS" : "Lấy vị trí GPS"}
        </button>
      </div>

      <Field label="Ghi chú thêm của chủ hộ (tùy chọn)" htmlFor="cp-farmer-note">
        <textarea
          id="cp-farmer-note"
          rows={2}
          maxLength={600}
          placeholder="Ghi chú thời tiết, sinh trưởng của cây hoặc đề xuất hỗ trợ kỹ thuật..."
          value={farmerNote}
          onChange={(e) => setFarmerNote(e.target.value)}
        />
      </Field>

      <InlineError message={error} />

      <div className="pt-form-actions">
        <button type="button" className="pt-btn pt-btn-ghost" onClick={sheetClose ?? onClose} disabled={saving}>
          Hủy
        </button>
        <BusyButton
          type="submit"
          className="pt-btn pt-btn-primary"
          busy={saving}
          busyLabel="Đang lưu nhật ký..."
          disabled={!fieldPhoto.file || (requiresInvoicePhoto && !invoicePhoto.file)}
        >
          Hoàn tất khai báo
        </BusyButton>
      </div>
    </form>
  );
}

/* ──────────────────────────── Chi tiết minh chứng đã khai báo ──────────────────────────── */

function MilestoneDeclarationDetail({
  title,
  subtitle,
  declaration,
}: {
  title: string;
  subtitle: string;
  declaration: CareMilestoneDeclaration;
}) {
  const badge = complianceBadge(declaration.complianceStatus);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="cp-form-summary">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span className="cp-eyebrow">{subtitle}</span>
          <StatusTag tone={badge.tone}>{badge.label}</StatusTag>
        </div>
        <strong style={{ fontSize: 15, color: "#14372f", fontVariantNumeric: "tabular-nums" }}>{title}</strong>
      </div>

      {declaration.complianceIssues && declaration.complianceIssues.length > 0 && (
        <div className={`cp-alert-box ${declaration.complianceStatus === "violation" ? "" : "is-warn"}`.trim()}>
          <strong style={{ display: "block", marginBottom: 4 }}>Đối chiếu quy trình:</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {declaration.complianceIssues.map((iss: ComplianceIssue, idx: number) => (
              <li key={idx}>{iss.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cp-detail-grid">
        <div className="cp-spec-cell">
          <span className="cp-spec-label">Ngày thực hiện</span>
          <strong className="cp-spec-val">{formatDate(declaration.performedOn)}</strong>
        </div>
        <div className="cp-spec-cell">
          <span className="cp-spec-label">Trạng thái cây thực tế</span>
          <strong className="cp-spec-val">{declaration.actualTreeState}</strong>
        </div>
        <div className="cp-spec-cell">
          <span className="cp-spec-label">Liều lượng thực hiện</span>
          <strong className="cp-spec-val">{declaration.actualDosage}</strong>
        </div>
        <div className="cp-spec-cell">
          <span className="cp-spec-label">Tọa độ GPS</span>
          <strong className="cp-spec-val">
            {declaration.gpsVerified
              ? "Khớp ranh thửa đất"
              : declaration.latitude != null
                ? `Đã ghi GPS (${declaration.gpsDistanceM ?? 0}m)`
                : "Chưa đính kèm GPS"}
          </strong>
        </div>
      </div>

      {declaration.selectedProducts?.length > 0 && (
        <div>
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4c6159", marginBottom: 6 }}>
            Vật tư đã sử dụng
          </span>
          <div className="cp-product-list">
            {declaration.selectedProducts.map((p) => (
              <span key={p} className="cp-product-item">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {(declaration.supplierName || declaration.extraInputs || declaration.pesticideName || declaration.farmerNote) && (
        <div style={{ fontSize: 13, color: "#2a443b", display: "flex", flexDirection: "column", gap: 4, fontVariantNumeric: "tabular-nums" }}>
          {declaration.supplierName && (
            <div>
              <strong>Nơi mua vật tư:</strong> {declaration.supplierName}
            </div>
          )}
          {declaration.extraInputs && (
            <div>
              <strong>Vật tư bổ sung:</strong> {declaration.extraInputs}
            </div>
          )}
          {declaration.pesticideName && (
            <div>
              <strong>Thuốc BVTV kết hợp:</strong> {declaration.pesticideName}
              {declaration.pesticideDose ? ` (${declaration.pesticideDose})` : ""}
            </div>
          )}
          {declaration.farmerNote && (
            <div>
              <strong>Ghi chú chủ hộ:</strong> {declaration.farmerNote}
            </div>
          )}
        </div>
      )}

      <div className="cp-photo-grid">
        {declaration.fieldPhotoUrl && (
          <StoredPhoto
            url={declaration.fieldPhotoUrl}
            alt={`Ảnh hiện trường ${title}`}
            caption="Ảnh hiện trường vườn"
          />
        )}
        {declaration.invoicePhotoUrl && (
          <StoredPhoto
            url={declaration.invoicePhotoUrl}
            alt={`Ảnh hóa đơn vật tư ${title}`}
            caption="Ảnh hóa đơn và nhãn vật tư"
          />
        )}
      </div>

      {declaration.journalRecordHash && (
        <div
          style={{
            padding: "8px 11px",
            borderRadius: 6,
            border: "1px solid #dfe5e2",
            background: "#f7f9f8",
            fontSize: 11.5,
            color: "#4d6159",
            fontVariantNumeric: "tabular-nums",
            wordBreak: "break-all",
          }}
        >
          Mã băm niêm phong sổ nhật ký SHA-256: <code>{declaration.journalRecordHash.slice(0, 24)}...</code>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── Component chính: Lộ trình Quy trình 2026-2027 ──────────────────────────── */

export default function CareProtocolTimeline({ initialPlotCode }: { initialPlotCode?: string }) {
  const protocol = usePortal<CareProtocolPortalResponse>("care-protocol");
  const plans = protocol.data?.plans ?? [];
  const senProRules = protocol.data?.senProRules ?? [];

  const [selectedPlotCode, setSelectedPlotCode] = useState<string>(() => {
    if (initialPlotCode) return initialPlotCode;
    if (typeof window !== "undefined") {
      const qPlot = new URLSearchParams(window.location.search).get("plotCode");
      if (qPlot) return qPlot;
    }
    return "";
  });

  const activePlan = useMemo<PlotCarePlanTimeline | null>(() => {
    if (plans.length === 0) return null;
    return plans.find((p) => p.plotCode === selectedPlotCode) ?? plans[0];
  }, [plans, selectedPlotCode]);

  const stages = useMemo(
    () => (activePlan ? groupMilestonesByStage(activePlan.milestones) : []),
    [activePlan],
  );

  const [openStages, setOpenStages] = useState<Record<string, boolean>>({});
  const [configuring, setConfiguring] = useState(false);
  const [declaringItem, setDeclaringItem] = useState<CareMilestoneItem | null>(null);
  const [declaringSenPro, setDeclaringSenPro] = useState<boolean>(false);
  const [viewingDecl, setViewingDecl] = useState<{
    title: string;
    subtitle: string;
    declaration: CareMilestoneDeclaration;
  } | null>(null);
  const [lastResult, setLastResult] = useState<DeclareCareMilestoneResponse | null>(null);

  useEffect(() => {
    if (!activePlan) return;
    const activeStageCode = activePlan.activeMilestone?.stageCode ?? stages[0]?.stageCode;
    if (activeStageCode) {
      setOpenStages((prev) => (Object.keys(prev).length === 0 ? { [activeStageCode]: true } : prev));
    }
  }, [activePlan, stages]);

  if (protocol.loading || protocol.error || !protocol.data) {
    return <StateBlock loading={protocol.loading} error={protocol.error} />;
  }

  if (!activePlan) {
    return (
      <section className="cp-section">
        <div className="cp-section-head">
          <h2 className="cp-section-title">Lộ trình chăm sóc sầu riêng 2026-2027</h2>
        </div>
        <p style={{ margin: 0, padding: "12px 0", fontSize: 13.5, color: "#5f6d66" }}>
          Hộ chưa có thửa đất nào được khai báo để lập lộ trình chăm sóc tự động.
        </p>
      </section>
    );
  }

  const badge = healthBadge(activePlan.overallHealth, activePlan.activeMilestone);
  const currentMilestone = activePlan.activeMilestone;
  const nextMilestone = activePlan.nextMilestone;

  const toggleStage = (stageCode: string) => {
    setOpenStages((prev) => ({ ...prev, [stageCode]: !prev[stageCode] }));
  };

  const bannerVariant =
    lastResult?.complianceStatus === "violation"
      ? "is-danger"
      : lastResult?.complianceStatus === "warning"
        ? "is-warn"
        : "";

  const progressVariant =
    activePlan.overallHealth === "overdue_critical"
      ? "is-danger"
      : activePlan.overallHealth === "overdue"
        ? "is-warn"
        : "";

  const currentCardVariant =
    currentMilestone?.state === "overdue_critical"
      ? "is-danger"
      : currentMilestone?.state === "overdue"
        ? "is-warn"
        : "";

  return (
    <div className="cp-root">
      {lastResult && (
        <div role="status" className={`cp-banner ${bannerVariant}`.trim()}>
          <div className="cp-banner-head">
            <strong style={{ fontSize: 14, color: "#14372f", lineHeight: 1.4 }}>
              {lastResult.complianceStatus === "compliant"
                ? "Đã ghi nhận khai báo đúng quy trình và lưu sổ nhật ký SHA-256"
                : "Đã lưu khai báo và gửi cảnh báo đối chiếu tới Ban quản trị HTX"}
            </strong>
            <button
              type="button"
              className="cp-btn cp-btn-outline cp-btn-sm"
              onClick={() => setLastResult(null)}
            >
              Đóng
            </button>
          </div>
          {lastResult.nextMilestone ? (
            <p style={{ margin: 0, fontSize: 13, color: "#29463c", lineHeight: 1.5, fontVariantNumeric: "tabular-nums" }}>
              <strong>Mốc tiếp theo:</strong> GĐ {lastResult.nextMilestone.stageOrder}{" "}
              {lastResult.nextMilestone.stageName} ({lastResult.nextMilestone.dayLabel}), dự kiến{" "}
              <strong>{formatDate(lastResult.nextMilestone.scheduledOn)}</strong> khi cây đạt trạng thái{" "}
              <strong>{lastResult.nextMilestone.treeState}</strong>: {lastResult.nextMilestone.actionSummary}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "#29463c" }}>
              Thửa vườn đã hoàn thành trọn vẹn 8 giai đoạn quy trình chăm sóc 2026-2027.
            </p>
          )}
        </div>
      )}

      {/* Khối 1: Tiến độ tổng thể & mốc cần thực hiện hiện tại */}
      <section className="cp-section">
        <div className="cp-section-head">
          <h2 className="cp-section-title">Lộ trình chăm sóc 2026-2027</h2>
          <button
            type="button"
            className="cp-btn cp-btn-outline cp-btn-sm"
            onClick={() => setConfiguring(true)}
          >
            Đồng bộ giai đoạn vườn
          </button>
        </div>

        {plans.length > 1 && (
          <div className="cp-plot-strip" role="tablist" aria-label="Chọn thửa vườn">
            {plans.map((p) => {
              const isSelected = p.plotCode === activePlan.plotCode;
              const pBadge = healthBadge(p.overallHealth, p.activeMilestone);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`cp-plot-btn ${isSelected ? "is-active" : ""}`.trim()}
                  onClick={() => {
                    setSelectedPlotCode(p.plotCode);
                    const st = p.activeMilestone?.stageCode;
                    if (st) setOpenStages({ [st]: true });
                  }}
                >
                  <span>Thửa {p.plotCode}</span>
                  <span className="cp-plot-subtag">{pBadge.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="cp-progress-box">
          <div className="cp-progress-head">
            <div className="cp-progress-meta">
              <strong style={{ fontSize: 15, color: "#14372f" }}>Thửa {activePlan.plotCode}</strong>
              <StatusTag tone={badge.tone}>{badge.label}</StatusTag>
              {activePlan.deviationCount > 0 && (
                <StatusTag tone="gold">{activePlan.deviationCount} mốc có lưu ý</StatusTag>
              )}
            </div>
            <span className="cp-progress-stat">
              Hoàn thành {activePlan.completedCount}/{activePlan.totalApplicableCount} mốc ({activePlan.progressPct}%)
            </span>
          </div>

          <div aria-hidden="true" className="cp-progress-track">
            <div
              className={`cp-progress-fill ${progressVariant}`.trim()}
              style={{ width: `${Math.max(4, activePlan.progressPct)}%` }}
            />
          </div>
        </div>

        {currentMilestone ? (
          <div className={`cp-current-card ${currentCardVariant}`.trim()}>
            <div className="cp-current-top">
              <span className="cp-eyebrow">
                Mốc hiện tại - Giai đoạn {currentMilestone.stageOrder}: {currentMilestone.stageName}
              </span>
              <StatusTag tone={milestoneStateBadge(currentMilestone).tone}>
                {milestoneStateBadge(currentMilestone).label}
              </StatusTag>
            </div>

            <div>
              <h3 className="cp-current-title">
                {currentMilestone.dayLabel}: {currentMilestone.actionSummary}
              </h3>
              {currentMilestone.notes && <p className="cp-current-notes">{currentMilestone.notes}</p>}
            </div>

            <div className="cp-spec-grid">
              <div className="cp-spec-cell">
                <span className="cp-spec-label">Khung ngày lộ trình</span>
                <strong className="cp-spec-val">
                  {formatDate(currentMilestone.scheduledOn)} - {formatDate(currentMilestone.dueOn)}
                </strong>
              </div>
              <div className="cp-spec-cell">
                <span className="cp-spec-label">Trạng thái cây chuẩn</span>
                <strong className="cp-spec-val">{currentMilestone.treeState}</strong>
              </div>
              <div className="cp-spec-cell">
                <span className="cp-spec-label">Liều lượng chuẩn</span>
                <strong className="cp-spec-val">{currentMilestone.standardDosageSummary}</strong>
              </div>
            </div>

            {currentMilestone.products.length > 0 && (
              <div className="cp-product-list">
                {currentMilestone.products.map((prod) => (
                  <span key={prod.id} className="cp-product-item">
                    {prod.name} ({prod.dosage})
                  </span>
                ))}
              </div>
            )}

            <div className="cp-hero-actions">
              <button
                type="button"
                className="cp-btn cp-btn-primary"
                onClick={() => setDeclaringItem(currentMilestone)}
              >
                Khai báo thực hiện mốc này
              </button>
              <button
                type="button"
                className="cp-btn cp-btn-outline"
                onClick={() => setDeclaringSenPro(true)}
              >
                Khai báo chặn đọt SenPro
              </button>
            </div>
          </div>
        ) : (
          <div className="cp-next-box" style={{ background: "#f2f8f4", borderColor: "#bcd9c7", color: "#14532d" }}>
            <strong>Đã hoàn tất trọn vẹn 8 giai đoạn chăm sóc vụ 2026-2027.</strong> Vui lòng tuân thủ thời gian cách ly
            trước thu hoạch và theo dõi lịch lấy mẫu tại mục Kiểm nghiệm.
          </div>
        )}

        {nextMilestone && (
          <div className="cp-next-box">
            <strong>Chuẩn bị mốc kế tiếp (dự kiến {formatDate(nextMilestone.scheduledOn)}):</strong>{" "}
            GĐ {nextMilestone.stageOrder} {nextMilestone.stageName} - {nextMilestone.dayLabel} ({nextMilestone.treeState}
            ). {nextMilestone.actionSummary}
          </div>
        )}
      </section>

      {/* Khối 2: Chi tiết 8 giai đoạn và 27 mốc theo ngày */}
      <section className="cp-section">
        <div className="cp-section-head">
          <h2 className="cp-section-title">Chi tiết 8 giai đoạn và 27 mốc theo ngày</h2>
        </div>

        <div className="cp-stage-list">
          {stages.map((stage) => {
            const expanded = Boolean(openStages[stage.stageCode]);
            const stageMod = stage.hasOverdue ? "is-overdue" : stage.hasActive ? "is-active" : "";
            return (
              <div key={stage.stageCode} className={`cp-stage ${stageMod}`.trim()}>
                <button
                  type="button"
                  className="cp-stage-btn"
                  onClick={() => toggleStage(stage.stageCode)}
                  aria-expanded={expanded}
                >
                  <div className="cp-stage-info">
                    <span className="cp-eyebrow">
                      Giai đoạn {stage.stageOrder} ({stage.stageDurationLabel})
                    </span>
                    <strong className="cp-stage-name">{stage.stageName}</strong>
                  </div>

                  <div className="cp-stage-right">
                    <span>
                      {stage.completedCount}/{stage.applicableCount} mốc
                    </span>
                    {expanded ? <ChevronUp size={17} color="#14372f" /> : <ChevronDown size={17} color="#14372f" />}
                  </div>
                </button>

                {expanded && (
                  <div className="cp-stage-body">
                    {stage.items.map((item) => {
                      const itemBadge = milestoneStateBadge(item);
                      const decl = item.declaration;
                      const canDeclare = item.state !== "completed" && item.state !== "skipped_prior";
                      const cardMod =
                        item.state === "completed"
                          ? "is-done"
                          : item.state === "overdue_critical"
                            ? "is-critical"
                            : item.state === "overdue"
                              ? "is-overdue"
                              : "";

                      return (
                        <div key={item.code} className={`cp-milestone-card ${cardMod}`.trim()}>
                          <div className="cp-milestone-head">
                            <div className="cp-milestone-date">
                              <strong style={{ fontSize: 13.5, color: "#14372f" }}>{item.dayLabel}</strong>
                              <span style={{ fontSize: 12, color: "#51665e" }}>
                                ({formatDate(item.scheduledOn)} - {formatDate(item.dueOn)})
                              </span>
                            </div>
                            <StatusTag tone={itemBadge.tone}>{itemBadge.label}</StatusTag>
                          </div>

                          <div style={{ fontSize: 13.5, color: "#1c3931", lineHeight: 1.45, fontVariantNumeric: "tabular-nums" }}>
                            <strong>Trạng thái cây: {item.treeState}.</strong> {item.actionSummary}
                          </div>

                          <div style={{ fontSize: 12.2, color: "#526860", fontVariantNumeric: "tabular-nums" }}>
                            Liều chuẩn: <strong>{item.standardDosageSummary}</strong>
                            {item.requiresInvoicePhoto
                              ? " - Cần ảnh hiện trường và hóa đơn vật tư"
                              : " - Cần ảnh hiện trường"}
                          </div>

                          <div className="cp-milestone-foot">
                            {decl ? (
                              <>
                                <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                                  Đã khai báo ngày {formatDate(decl.performedOn)}
                                  {decl.invoicePhotoUrl
                                    ? " - Đủ ảnh hiện trường và hóa đơn"
                                    : " - Đã lưu ảnh hiện trường"}
                                </span>
                                <button
                                  type="button"
                                  className="cp-btn cp-btn-outline cp-btn-sm"
                                  onClick={() =>
                                    setViewingDecl({
                                      title: `${item.dayLabel}: ${item.actionSummary}`,
                                      subtitle: `Giai đoạn ${item.stageOrder} ${item.stageName}`,
                                      declaration: decl,
                                    })
                                  }
                                >
                                  Xem minh chứng
                                </button>
                              </>
                            ) : canDeclare ? (
                              <>
                                <span style={{ fontSize: 12, color: "#5e716a" }}>Chưa khai báo</span>
                                <button
                                  type="button"
                                  className={
                                    item.state === "due_now" ||
                                    item.state === "overdue" ||
                                    item.state === "overdue_critical" ||
                                    item.state === "upcoming_current"
                                      ? "cp-btn cp-btn-primary cp-btn-sm"
                                      : "cp-btn cp-btn-outline cp-btn-sm"
                                  }
                                  onClick={() => setDeclaringItem(item)}
                                >
                                  Khai báo mốc này
                                </button>
                              </>
                            ) : (
                              <span style={{ fontSize: 12, color: "#788983" }}>
                                Giai đoạn trước thời điểm đồng bộ vườn
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Khối 3: Phác đồ chuyên biệt kiểm soát đọt SenPro */}
      <section className="cp-section">
        <div className="cp-section-head">
          <h2 className="cp-section-title">Kiểm soát đọt bất thường bằng SenPro</h2>
          <button
            type="button"
            className="cp-btn cp-btn-outline cp-btn-sm"
            onClick={() => setDeclaringSenPro(true)}
          >
            Khai báo phun SenPro
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: "#4b5c55", lineHeight: 1.5 }}>
          Áp dụng khi vườn nhú đọt non bất thường lúc tạo mầm, nuôi bông hoặc nuôi trái non. Chọn đúng tuổi đọt để pha
          tỷ lệ chuẩn:
        </p>

        <div className="cp-senpro-list">
          {senProRules.map((rule, idx) => (
            <div key={rule.code} className="cp-senpro-item">
              <div className="cp-senpro-item-top">
                <strong style={{ fontSize: 13.5, color: "#14372f" }}>Đọt {rule.shootState}</strong>
                <span className="cp-senpro-idx">0{idx + 1}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>
                Pha tỷ lệ {rule.requiredRatio} ({rule.effectLabel})
              </span>
            </div>
          ))}
        </div>

        {activePlan.senProDeclarations.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <strong style={{ fontSize: 12.5, color: "#3b5249" }}>Lịch sử khai báo SenPro gần đây</strong>
            {activePlan.senProDeclarations.slice(0, 5).map((decl) => (
              <div key={decl.id} className="cp-senpro-history-row">
                <span>
                  <strong>{formatDate(decl.performedOn)}</strong> - Đọt {decl.actualTreeState} ({decl.actualDosage})
                </span>
                <button
                  type="button"
                  className="cp-btn cp-btn-outline cp-btn-sm"
                  onClick={() =>
                    setViewingDecl({
                      title: `Phun SenPro xử lý đọt ${decl.actualTreeState}`,
                      subtitle: `Thửa ${decl.plotCode}`,
                      declaration: decl,
                    })
                  }
                >
                  Xem ảnh và hóa đơn
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {configuring && (
        <Sheet title={`Đồng bộ giai đoạn Thửa ${activePlan.plotCode}`} onClose={() => setConfiguring(false)}>
          <ConfigureCarePlanForm
            plan={activePlan}
            onSaved={() => setConfiguring(false)}
            onClose={() => setConfiguring(false)}
          />
        </Sheet>
      )}

      {declaringItem && (
        <Sheet
          title={`Khai báo: ${declaringItem.stageName} (${declaringItem.dayLabel})`}
          onClose={() => setDeclaringItem(null)}
        >
          <CareMilestoneDeclareForm
            plotCode={activePlan.plotCode}
            milestone={declaringItem}
            onSuccess={(res) => {
              setLastResult(res);
              setDeclaringItem(null);
              if (res.nextMilestone) {
                const nextStage = res.plan.milestones.find((m) => m.code === res.nextMilestone?.code)?.stageCode;
                if (nextStage) {
                  setOpenStages((prev) => ({ ...prev, [nextStage]: true }));
                }
              }
            }}
            onClose={() => setDeclaringItem(null)}
          />
        </Sheet>
      )}

      {declaringSenPro && (
        <Sheet title={`Khai báo chặn đọt SenPro - Thửa ${activePlan.plotCode}`} onClose={() => setDeclaringSenPro(false)}>
          <CareMilestoneDeclareForm
            plotCode={activePlan.plotCode}
            senProRules={senProRules}
            onSuccess={(res) => {
              setLastResult(res);
              setDeclaringSenPro(false);
            }}
            onClose={() => setDeclaringSenPro(false)}
          />
        </Sheet>
      )}

      {viewingDecl && (
        <Sheet title="Chi tiết khai báo và minh chứng" onClose={() => setViewingDecl(null)}>
          <MilestoneDeclarationDetail
            title={viewingDecl.title}
            subtitle={viewingDecl.subtitle}
            declaration={viewingDecl.declaration}
          />
        </Sheet>
      )}
    </div>
  );
}
