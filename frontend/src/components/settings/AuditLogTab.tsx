import type { AuditLogEntry } from "@/types/entities";
import { ACTION_COLORS } from "./settings-data";

export default function AuditLogTab({ auditLog }: { auditLog: AuditLogEntry[] }) {
  return (
    <>
      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: 200 }}>
          <input type="text" className="filter-input" placeholder="Tìm theo người dùng, hành động…" />
        </div>
        <select className="filter-select">
          <option>Mọi hành động</option>
          <option>Duyệt hồ sơ</option>
          <option>Cập nhật</option>
          <option>Xuất báo cáo</option>
          <option>Cảnh báo</option>
        </select>
        <input type="date" className="filter-select" defaultValue="2024-10-25" />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người dùng</th>
              <th>Địa chỉ IP</th>
              <th>Hành động</th>
              <th>Đối tượng</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((log, i) => (
              <tr key={i}>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  {log.time}
                </td>
                <td style={{ fontWeight: 500 }}>{log.user}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{log.ip}</td>
                <td>
                  <span className={`badge ${ACTION_COLORS[log.action] || "badge-gray"}`}>{log.action}</span>
                </td>
                <td style={{ fontSize: 12, color: "#256b45", fontFamily: "monospace" }}>{log.object}</td>
                <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{log.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="table-footer">
          <span>Hiển thị 6 trong tổng số 1.247 thao tác</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-outline btn-sm">Xuất audit log</button>
            <div className="pagination">
              {[1, 2, 3, "…", 208].map((p, i) => (
                <button key={i} className={`pg-btn ${p === 1 ? "active" : ""}`}>{p}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
