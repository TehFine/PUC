"use client";

import { useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import { TextAreaField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { HarvestPlanRecord } from "@/types/harvest";

function todayIso(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function HarvestPlanNotifyModal({
  plan,
  onClose,
  onDone,
}: {
  plan: HarvestPlanRecord;
  onClose: () => void;
  onDone: () => void;
}) {
  const [harvestDate, setHarvestDate] = useState(plan.computedHarvestOn || todayIso());
  const [estimatedYield, setEstimatedYield] = useState(String(plan.estimatedYieldKg || ""));
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const yieldNum = estimatedYield.trim() ? Number(estimatedYield) : undefined;
    return api.post("/harvest-plan/notify", {
      householdId: plan.householdId,
      plotCode: plan.plotCode,
      harvestDate,
      estimatedYieldKg: yieldNum && Number.isFinite(yieldNum) && yieldNum > 0 ? yieldNum : undefined,
      note: note.trim() || undefined,
    });
  });

  const submit = async () => {
    if (!harvestDate) {
      setLocalError("Vui lòng chọn ngày thu hoạch dự kiến.");
      return;
    }
    if (plan.phiSafeOn && harvestDate < plan.phiSafeOn) {
      setLocalError(
        `Ngày thu hoạch phải từ ngày ${plan.phiSafeOn} trở đi để đảm bảo hết thời gian cách ly thuốc (${plan.lastPesticide || "BVTV"}).`,
      );
      return;
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(`Đã gửi thông báo lịch thu hoạch tới hộ ${plan.householdName}.`);
      onDone();
    }
  };

  return (
    <FormModal
      title="Thông báo lịch thu hoạch dự kiến cho hộ dân"
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      submitLabel="Gửi thông báo qua hệ thống"
      width={540}
    >
      <div
        style={{
          marginBottom: 14,
          padding: "10px 12px",
          borderRadius: 10,
          background: "#f8fafc",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text-secondary)",
        }}
      >
        <div>
          Hộ canh tác: <strong style={{ color: "#14372f" }}>{plan.householdName}</strong> ({plan.householdCode}) · Thửa{" "}
          <strong>{plan.plotCode}</strong> ({plan.variety} · {plan.areaHa} ha)
        </div>
        <div style={{ marginTop: 4 }}>
          Căn cứ tính toán: <strong>{plan.calculationBasis}</strong>
        </div>
        {plan.phiSafeOn && (
          <div style={{ marginTop: 4, color: plan.inIsolation ? "#b45309" : "#166534" }}>
            An toàn cách ly thuốc BVTV từ ngày: <strong>{plan.phiSafeOn}</strong>
            {plan.lastPesticide ? ` (${plan.lastPesticide})` : ""}
          </div>
        )}
      </div>

      <TextField
        label="Ngày thu hoạch dự kiến (HTX tính toán)"
        type="date"
        required
        value={harvestDate}
        onChange={setHarvestDate}
        hint="Hệ thống tự động đề xuất dựa trên nhật ký chăm sóc và thời gian cách ly thuốc của hộ dân."
      />

      <TextField
        label="Sản lượng dự kiến thu hái (kg)"
        inputMode="numeric"
        value={estimatedYield}
        onChange={setEstimatedYield}
        placeholder="VD: 12000"
      />

      <TextAreaField
        label="Ghi chú dặn dò gửi hộ dân (tùy chọn)"
        value={note}
        onChange={setNote}
        rows={3}
        placeholder="VD: Đề nghị hộ ngưng tưới nước trước ngày cắt 5 ngày, chuẩn bị lối vào cho cán bộ KCS kiểm định…"
      />
    </FormModal>
  );
}

