"use client";

import { useState } from "react";
import AccountsTab from "@/components/settings/AccountsTab";
import AuditLogTab from "@/components/settings/AuditLogTab";
import RolesTab from "@/components/settings/RolesTab";
import { useResource } from "@/hooks/use-resource";
import { mapAccount, mapAuditLog } from "@/lib/mappers";

type Tab = "accounts" | "roles" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "accounts", label: "Tài khoản" },
  { id: "roles", label: "Phân quyền" },
  { id: "audit", label: "Nhật ký thao tác" },
];

export default function SystemSettings() {
  const { data: accounts } = useResource("accounts", mapAccount);
  const { data: auditLog } = useResource("audit-log", mapAuditLog);
  const [tab, setTab] = useState<Tab>("accounts");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Quản Trị Hệ Thống</h1>
        </div>
        <div className="header-actions">
          {tab === "accounts" && <button className="btn btn-primary">Thêm tài khoản</button>}
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsTab accounts={accounts} />}
      {tab === "roles" && <RolesTab />}
      {tab === "audit" && <AuditLogTab auditLog={auditLog} />}
    </>
  );
}
