import { ROLES } from "./settings-data";

export default function RolesTab() {
  return (
    <div className="roles-grid">
      {ROLES.map((role, i) => (
        <div key={i} className="role-card">
          <div className="role-card-header">
            <div>
              <div className="role-card-name">{role.name}</div>
              <div className="role-card-count">{role.count}</div>
            </div>
          </div>
          {role.perms.map((p, j) => (
            <div key={j} className="role-perm">
              <span style={{ color: p.ok ? "var(--text-primary)" : "var(--text-muted)" }}>{p.label}</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: p.ok ? "var(--green-700)" : "var(--text-muted)",
                }}
              >
                {p.ok ? "Có" : "Không"}
              </span>
            </div>
          ))}
          <button className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: 12 }}>
            Chỉnh sửa quyền
          </button>
        </div>
      ))}
    </div>
  );
}
