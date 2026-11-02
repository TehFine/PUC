"use client";

import { useMemo } from "react";
import { useApiList } from "@/hooks/use-api";
import type { AccountRecord } from "@/types/accounts";
import type { Role } from "@/types/api";
import { ROLES } from "./settings-data";

export default function RolesTab() {
  const accounts = useApiList<AccountRecord>("accounts", { pageSize: 500 });

  const countByRole = useMemo(() => {
    const map: Record<Role, number> = {
      admin: 0,
      htx_officer: 0,
      inspector: 0,
      village_officer: 0,
      farmer: 0,
    };
    for (const acc of accounts.rows) {
      if (acc.role in map) {
        map[acc.role] += 1;
      }
    }
    return map;
  }, [accounts.rows]);

  return (
    <div className="roles-grid">
      {ROLES.map((roleItem) => {
        const count = countByRole[roleItem.role] ?? 0;
        return (
          <div key={roleItem.role} className="role-card">
            <div className="role-card-header">
              <div>
                <div className="role-card-name">{roleItem.name}</div>
                <div className="role-card-count">
                  {accounts.loading ? "Đang tính…" : `${count} tài khoản`}
                </div>
              </div>
            </div>
            {roleItem.perms.map((p, j) => (
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
          </div>
        );
      })}
    </div>
  );
}
