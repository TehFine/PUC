"use client";

import { useState } from "react";
import AccountsTab from "@/components/settings/AccountsTab";
import AuditLogTab from "@/components/settings/AuditLogTab";
import RolesTab from "@/components/settings/RolesTab";

type Tab = "accounts" | "roles" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "accounts", label: "Tài khoản" },
  { id: "roles", label: "Phân quyền" },
  { id: "audit", label: "Nhật ký thao tác" },
];

export default function SystemSettings() {
  const [tab, setTab] = useState<Tab>("accounts");
  const [createTrigger, setCreateTrigger] = useState(0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Quản Trị Hệ Thống</h1>
        </div>
        <div className="header-actions">
          {tab === "accounts" && (
            <button type="button" className="btn btn-primary" onClick={() => setCreateTrigger((c) => c + 1)}>
              Thêm tài khoản
            </button>
          )}
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsTab createTrigger={createTrigger} />}
      {tab === "roles" && <RolesTab />}
      {tab === "audit" && <AuditLogTab />}
    </>
  );
}
