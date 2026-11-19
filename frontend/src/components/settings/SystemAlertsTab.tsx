"use client";

import { FormEvent, useState } from "react";
import { notifyCountsChanged } from "@/components/admin/shared/counts-events";
import { toast } from "@/components/ui/Toast";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import { checkSystemHealth, notifySystemAlertsChanged } from "@/lib/system-alert";
import type {
  HealthCheckResponse,
  SystemAlertAudience,
  SystemAlertListResponse,
  SystemAlertSeverity,
} from "@/types/notifications";
import { formatDate } from "@/utils/format";

const TEMPLATES: {
  label: string;
  severity: SystemAlertSeverity;
  audience: SystemAlertAudience;
  title: string;
  message: string;
}[] = [
  {
    label: "Cập nhật hệ thống",
    severity: "info",
    audience: "farmer",
    title: "Cập nhật tính năng và danh mục kỹ thuật trên hệ thống",
    message:
      "Ban quản trị HTX vừa cập nhật nội dung mới trên hệ thống. Bà con mở mục Kiến thức và Nhật ký để xem hướng dẫn chi tiết.",
  },
  {
    label: "Chậm đồng bộ tạm thời",
    severity: "critical",
    audience: "all",
    title: "Hệ thống đang xử lý chậm hơn bình thường",
    message:
      "Kỹ thuật HTX đang khắc phục. Vui lòng giữ ảnh vừa chụp và thử lại sau ít phút.",
  },
  {
    label: "Bảo trì định kỳ",
    severity: "warning",
    audience: "all",
    title: "Hệ thống bảo trì ngắn trong 15 phút",
    message:
      "Vui lòng lưu lại nội dung đang nhập và quay lại sau ít phút.",
  },
  {
    label: "Tạm ngưng cấp tem mới",
    severity: "critical",
    audience: "farmer",
    title: "Tạm ngưng cấp mã tem mới để rà soát",
    message:
      "Hộ cần xuất lô gấp vui lòng gọi hỗ trợ HTX theo số bên dưới.",
  },
];

const AUDIENCE_LABELS: Record<SystemAlertAudience, string> = {
  all: "Toàn bộ người dùng",
  farmer: "Tất cả hộ nông dân",
  staff: "Cán bộ quản trị HTX",
};

const SEVERITY_META: Record<
  SystemAlertSeverity,
  { label: string; badgeClass: string; bg: string; color: string }
> = {
  info: { label: "Thông báo chung", badgeClass: "badge-green", bg: "#f3f7ee", color: "#14372f" },
  warning: { label: "Bảo trì", badgeClass: "badge-amber", bg: "#fff7ed", color: "#9a6712" },
  critical: { label: "Khẩn cấp", badgeClass: "badge-red", bg: "#fef2f2", color: "#b91c1c" },
};

export default function SystemAlertsTab() {
  const { data, loading, error, refresh } = useApi<SystemAlertListResponse>("/system-alerts");
  const health = useApi<HealthCheckResponse>("/health");

  const [severity, setSeverity] = useState<SystemAlertSeverity>("info");
  const [audience, setAudience] = useState<SystemAlertAudience>("all");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const activeAlert = data?.active ?? null;
  const rows = data?.data ?? [];
  const isHealthy = health.data?.status === "ok" && health.data?.database === "up";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error("Vui lòng nhập tiêu đề và nội dung thông báo.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/system-alerts", {
        severity,
        audience,
        title: title.trim(),
        message: message.trim(),
      });
      setTitle("");
      setMessage("");
      toast.success("Đã phát thông báo tới người dùng theo thời gian thực.");
      await refresh();
      notifySystemAlertsChanged();
      notifyCountsChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể phát thông báo hệ thống."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: number) => {
    setResolvingId(id);
    try {
      await api.post(`/system-alerts/${id}/resolve`);
      toast.success("Đã đóng hiển thị dải thông báo trên đầu màn hình.");
      await refresh();
      notifySystemAlertsChanged();
      notifyCountsChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể cập nhật trạng thái thông báo."));
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Trạng thái sức khỏe tự động */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "16px 20px" }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1.35,
              color: health.loading ? "#0f172a" : isHealthy ? "#14372f" : "#b91c1c",
            }}
          >
            {health.loading
              ? "Đang kiểm tra kết nối máy chủ và cơ sở dữ liệu…"
              : isHealthy
                ? "Máy chủ và cơ sở dữ liệu hoạt động ổn định"
                : "Cảnh báo: Phát hiện gián đoạn kết nối máy chủ hoặc cơ sở dữ liệu"}
          </div>
          <div style={{ fontSize: 13, color: "#5f6d66", lineHeight: 1.5, marginTop: 4 }}>
            Khi máy chủ gặp lỗi 5xx hoặc mất kết nối, toàn bộ người dùng đang mở ứng dụng sẽ tự động nhận cảnh báo khẩn ngay trên đầu màn hình.
          </div>
        </div>
        <footer className="dash-bento-footer">
          <button
            type="button"
            className="dash-bento-footer-btn"
            disabled={health.loading}
            onClick={() => {
              void health.refresh();
              void checkSystemHealth();
            }}
          >
            {health.loading ? "Đang kiểm tra…" : "Kiểm tra lại ngay"}
          </button>
        </footer>
      </div>

      {/* Cảnh báo / thông báo đang bật (nếu có) */}
      {activeAlert && (
        <div
          className="card"
          style={{
            padding: "18px 20px",
            border: "1px solid #d4d4d2",
            background: (SEVERITY_META[activeAlert.severity] ?? SEVERITY_META.info).bg,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: (SEVERITY_META[activeAlert.severity] ?? SEVERITY_META.info).color,
                marginBottom: 4,
              }}
            >
              ĐANG PHÁT TRÊN MÀN HÌNH NGƯỜI DÙNG - {AUDIENCE_LABELS[activeAlert.audience]}
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: "#14372f", marginBottom: 4 }}>
              {activeAlert.title}
            </div>
            <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.5 }}>{activeAlert.message}</div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={resolvingId === activeAlert.id}
            onClick={() => void handleResolve(activeAlert.id)}
          >
            {resolvingId === activeAlert.id
              ? "Đang cập nhật…"
              : activeAlert.severity === "info"
                ? "Đóng dải thông báo"
                : "Đánh dấu đã khắc phục"}
          </button>
        </div>
      )}

      {/* Biểu mẫu phát thông báo mới */}
      <form className="card" onSubmit={handleSubmit} style={{ padding: "20px", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#14372f" }}>
              Phát thông báo Ban quản trị, cập nhật hoặc bảo trì hệ thống
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#5f6d66" }}>
              Gửi tức thời tới chuông Thông báo của từng hộ dân và cán bộ theo thời gian thực, đồng thời hiển thị trên đầu màn hình.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setSeverity(tpl.severity);
                  setAudience(tpl.audience);
                  setTitle(tpl.title);
                  setMessage(tpl.message);
                }}
              >
                Mẫu: {tpl.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              Loại thông báo
            </label>
            <select
              className="filter-select"
              style={{ width: "100%" }}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as SystemAlertSeverity)}
            >
              <option value="info">Thông báo Ban quản trị và cập nhật hệ thống</option>
              <option value="warning">Cảnh báo, bảo trì kỹ thuật</option>
              <option value="critical">Khẩn cấp, sự cố hệ thống</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              Đối tượng nhận thông báo
            </label>
            <select
              className="filter-select"
              style={{ width: "100%" }}
              value={audience}
              onChange={(e) => setAudience(e.target.value as SystemAlertAudience)}
            >
              <option value="all">Toàn bộ người dùng (Hộ nông dân và Cán bộ)</option>
              <option value="farmer">Tất cả hộ nông dân</option>
              <option value="staff">Chỉ cán bộ quản trị HTX</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            Tiêu đề ngắn gọn
          </label>
          <input
            type="text"
            className="form-input"
            maxLength={160}
            placeholder="Ví dụ: Cập nhật quy trình chăm sóc và danh mục thuốc BVTV mới"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            Nội dung chi tiết gửi tới người dùng
          </label>
          <textarea
            className="form-input"
            rows={3}
            maxLength={600}
            placeholder="Nhập nội dung thông báo của Ban quản trị hoặc hướng dẫn cho từng hộ dân…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Đang phát thông báo…" : "Phát thông báo ngay"}
          </button>
        </div>
      </form>

      {/* Lịch sử thông báo khẩn */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thời gian phát</th>
              <th>Mức độ</th>
              <th>Đối tượng</th>
              <th>Nội dung thông báo</th>
              <th>Người phát</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                  Đang tải lịch sử thông báo khẩn…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "#b91c1c" }}>
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                  Chưa có thông báo sự cố hoặc bảo trì nào được phát.
                </td>
              </tr>
            )}
            {rows.map((item) => {
              const sevMeta = SEVERITY_META[item.severity] ?? SEVERITY_META.info;
              return (
                <tr key={item.id}>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatDate(item.createdAt)}</td>
                  <td>
                    <span className={`badge ${sevMeta.badgeClass}`}>{sevMeta.label}</span>
                  </td>
                  <td>{AUDIENCE_LABELS[item.audience]}</td>
                  <td style={{ maxWidth: 360 }}>
                    <div style={{ fontWeight: 600, color: "#14372f" }}>{item.title}</div>
                    <div style={{ fontSize: 12.5, color: "#475569", marginTop: 2 }}>{item.message}</div>
                  </td>
                  <td>{item.createdByName || "Hệ thống"}</td>
                  <td>
                    {item.active ? (
                      <span className={`badge ${item.severity === "info" ? "badge-green" : "badge-red"}`}>
                        Đang phát
                      </span>
                    ) : (
                      <span className="badge badge-green">
                        {item.severity === "info" ? "Đã đóng" : "Đã khắc phục"}
                      </span>
                    )}
                  </td>
                  <td>
                    {item.active ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={resolvingId === item.id}
                        onClick={() => void handleResolve(item.id)}
                      >
                        {item.severity === "info" ? "Đóng hiển thị" : "Đã khắc phục"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "#8a968f" }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
