import type { Account } from "@/types/entities";
import { STATUS_CLASS } from "./settings-data";

export default function AccountsTab({ accounts }: { accounts: Account[] }) {
  return (
    <>
      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: 200 }}>
          <input type="text" className="filter-input" placeholder="Tìm tài khoản…" />
        </div>
        <select className="filter-select">
          <option>Mọi vai trò</option>
          <option>Quản trị viên</option>
          <option>Cán bộ HTX</option>
          <option>Kiểm tra viên</option>
          <option>Cán bộ Thôn</option>
          <option>Nông dân</option>
        </select>
        <select className="filter-select">
          <option>Mọi trạng thái</option>
          <option>Hoạt động</option>
          <option>Khóa</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Họ &amp; Tên</th>
              <th>SĐT / Username</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Đăng nhập cuối</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => (
              <tr key={i}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div
                      style={{
                        width: 29, height: 29,
                        background: "#e6f2eb",
                        border: "1px solid #cfe4d8",
                        borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 600, color: "var(--green-700)", flexShrink: 0,
                      }}
                    >
                      {a.name.split(" ").slice(-1)[0][0]}
                    </div>
                    <span style={{ fontWeight: 500 }}>{a.name}</span>
                  </div>
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{a.username}</td>
                <td>
                  <span
                    style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                      background: "#f2f8f4", color: "#256b45",
                      border: "1px solid #d5eadd",
                    }}
                  >
                    {a.role}
                  </span>
                </td>
                <td>
                  <span className={`badge ${STATUS_CLASS[a.statusType]}`}>{a.status}</span>
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{a.lastLogin}</td>
                <td>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button className="btn btn-outline btn-sm">Sửa</button>
                    <button className={`btn btn-sm ${a.statusType === "green" ? "btn-danger" : "btn-gold"}`}>
                      {a.statusType === "green" ? "Khóa" : "Mở"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
