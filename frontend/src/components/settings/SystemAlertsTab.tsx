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
    label: "Sự cố gián đoạn đồng bộ",
    severity: "critical",
    audience: "all",
    title: "Hệ thống đang khắc phục sự cố đồng bộ dữ liệu",
    message:
      "Một số thao tác gửi nhật ký hoặc tra cứu có thể chậm hơn bình thường. Kỹ thuật HTX đang xử lý khẩn — bà con vui lòng giữ ảnh hiện trường và thử lại sau ít phút.",
  },
  {
    label: "Bảo trì nâng cấp máy chủ",
    severity: "warning",
    audience: "all",
    title: "Thông báo bảo trì & nâng cấp hệ thống định kỳ",
    message:
      "Hệ thống dự kiến bảo trì ngắn trong khoảng 15–20 phút để nâng cấp hiệu năng. Vui lòng lưu lại các biểu mẫu đang nhập dở.",
  },
  {
    label: "Nhắc khẩn hộ nông dân",
    severity: "critical",
    audience: "farmer",
    title: "Tạm ngưng cấp mã tem mới để rà soát dữ liệu vùng trồng",
    message:
      "HTX đang đối soát đồng bộ mã vùng trồng. Các hộ cần xuất lô gấp vui lòng liên hệ trực tiếp Hotline kỹ thuật HTX 0366 663 778.",
  },
];

const AUDIENCE_LABELS: Record<SystemAlertAudience, string> = {
  all: "Toàn bộ người dùng",
  farmer: "Tất cả hộ nông dân",
  staff: "Cán bộ quản trị HTX",
};

export default function SystemAlertsTab() {
  const { data, loading, error, refresh } = useApi<SystemAlertListResponse>("/system-alerts");
  const health = useApi<HealthCheckResponse>("/health");

  const [severity, setSeverity] = useState<SystemAlertSeverity>("critical");
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
      toast.error("Vui lòng nhập tiêu đề và nội dung thông báo khẩn.");
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
      toast.success("Đã phát thông báo khẩn tới người dùng trên toàn hệ thống.");
      await refresh();
      notifySystemAlertsChanged();
      notifyCountsChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể phát thông báo khẩn."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: number) => {
    setResolvingId(id);
    try {
      await api.post(`/system-alerts/${id}/resolve`);
      toast.success("Đã gỡ cảnh báo khẩn và đánh dấu sự cố đã khắc phục.");
      await refresh();
      notifySystemAlertsChanged();
      notifyCountsChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể cập nhật trạng thái sự cố."));
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
          padding: "16px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: "50%",
              background: health.loading ? "#94a3b8" : isHealthy ? "#16a34a" : "#dc2626",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: "#0f172a" }}>
              {health.loading
                ? "Đang kiểm tra kết nối máy chủ & CSDL…"
                : isHealthy
                  ? "Máy chủ & Cơ sở dữ liệu hoạt động ổn định"
                  : "Cảnh báo: Phát hiện gián đoạn kết nối máy chủ / CSDL"}
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2 }}>
              Khi máy chủ gặp lỗi 5xx hoặc mất kết nối, toàn bộ người dùng đang mở ứng dụng sẽ tự động nhận cảnh báo khẩn ngay trên đầu màn hình.
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            void health.refresh();
            void checkSystemHealth();
          }}
        >
          Kiểm tra lại ngay
        </button>
      </div>

      {/* Cảnh báo đang bật (nếu có) */}
      {activeAlert && (
        <div
          className="card"
          style={{
            padding: "18px 20px",
            border: activeAlert.severity === "critical" ? "1.5px solid #fca5a5" : "1.5px solid #fdba74",
            background: activeAlert.severity === "critical" ? "#fef2f2" : "#fff7ed",
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
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: activeAlert.severity === "critical" ? "#b91c1c" : "#c2410c",
                marginBottom: 4,
              }}
            >
              ĐANG PHÁT TRÊN MÀN HÌNH NGƯỜI DÙNG · {AUDIENCE_LABELS[activeAlert.audience]}
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
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
            {resolvingId === activeAlert.id ? "Đang cập nhật…" : "Đánh dấu đã khắc phục"}
          </button>
        </div>
      )}

      {/* Biểu mẫu phát thông báo khẩn mới */}
      <form className="card" onSubmit={handleSubmit} style={{ padding: "20px", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              Phát thông báo khẩn / bảo trì hệ thống
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#64748b" }}>
              Hiển thị tức thời trên đầu màn hình mọi thiết bị đang truy cập và gửi đồng thời vào chuông Thông báo.
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
              Mức độ cảnh báo
            </label>
            <select
              className="filter-select"
              style={{ width: "100%" }}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as SystemAlertSeverity)}
            >
              <option value="critical">Khẩn cấp – Sự cố hệ thống (Đỏ)</option>
              <option value="warning">Cảnh báo – Bảo trì kỹ thuật (Cam)</option>
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
              <option value="all">Toàn bộ người dùng (Nông dân & Cán bộ)</option>
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
            placeholder="Ví dụ: Hệ thống đang khắc phục sự cố đồng bộ dữ liệu"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            Nội dung hướng dẫn người dùng
          </label>
          <textarea
            className="form-input"
            rows={3}
            maxLength={600}
            placeholder="Nhập nguyên nhân ngắn gọn, hướng dẫn tạm thời cho hộ dân/cán bộ và thời gian dự kiến khắc phục…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Đang phát thông báo…" : "Phát thông báo khẩn ngay"}
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
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{formatDate(item.createdAt)}</td>
                <td>
                  <span className={`badge ${item.severity === "critical" ? "badge-red" : "badge-amber"}`}>
                    {item.severity === "critical" ? "Khẩn cấp" : "Bảo trì"}
                  </span>
                </td>
                <td>{AUDIENCE_LABELS[item.audience]}</td>
                <td style={{ maxWidth: 360 }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                  <div style={{ fontSize: 12.5, color: "#475569", marginTop: 2 }}>{item.message}</div>
                </td>
                <td>{item.createdByName || "Hệ thống"}</td>
                <td>
                  {item.active ? (
                    <span className="badge badge-red">Đang phát</span>
                  ) : (
                    <span className="badge badge-green">Đã khắc phục</span>
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
                      Đã khắc phục
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
