"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import AccountsTab from "@/components/settings/AccountsTab";
import AuditLogTab from "@/components/settings/AuditLogTab";
import RolesTab from "@/components/settings/RolesTab";
import SystemAlertsTab from "@/components/settings/SystemAlertsTab";
import { useUrlSubTab } from "@/lib/back-navigation";

type Tab = "accounts" | "roles" | "alerts" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "accounts", label: "Tài khoản" },
  { id: "roles", label: "Phân quyền" },
  { id: "alerts", label: "Thông báo khẩn" },
  { id: "audit", label: "Nhật ký thao tác" },
];

export default function SystemSettings() {
  const { can } = useAuth();
  const canCreateAccounts = can("accounts", "create");
  const [tab, setTab] = useState<Tab>("accounts");
  const selectTab = useUrlSubTab<Tab>(
    "sub",
    tab,
    setTab,
    "accounts",
    (raw): raw is Tab => raw === "accounts" || raw === "roles" || raw === "alerts" || raw === "audit",
  );
  const [createTrigger, setCreateTrigger] = useState(0);

  return (
    <>
      {tab === "accounts" && canCreateAccounts && (
        <div className="page-header">
          <div className="header-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCreateTrigger((c) => c + 1)}>
              Thêm tài khoản
            </button>
          </div>
        </div>
      )}

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsTab createTrigger={createTrigger} />}
      {tab === "roles" && <RolesTab />}
      {tab === "alerts" && <SystemAlertsTab />}
      {tab === "audit" && <AuditLogTab />}
    </>
  );
}
