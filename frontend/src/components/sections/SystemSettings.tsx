"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  ADMIN_SYSTEM_TAB_EVENT,
  consumePendingSystemTab,
  onCountsChanged,
  type AdminSystemTabId,
} from "@/components/admin/shared/counts-events";
import { useAuth } from "@/components/auth/AuthProvider";
import AccountsTab from "@/components/settings/AccountsTab";
import { api } from "@/lib/api-client";
import { ADMIN_LAST_URL_KEY, readInitialUrlSubTab, useUrlSubTab } from "@/lib/back-navigation";
import { useAutoCenterDock } from "@/lib/dock-scroll";

const AuditLogTab = dynamic(() => import("@/components/settings/AuditLogTab"));
const DeletionRequestsTab = dynamic(() => import("@/components/settings/DeletionRequestsTab"));
const RolesTab = dynamic(() => import("@/components/settings/RolesTab"));
const SystemAlertsTab = dynamic(() => import("@/components/settings/SystemAlertsTab"));
const TraceAccessRequestsTab = dynamic(() => import("@/components/settings/TraceAccessRequestsTab"));

type Tab = AdminSystemTabId;

const isSystemTab = (raw: string): raw is Tab =>
  raw === "accounts" ||
  raw === "deletions" ||
  raw === "trace-requests" ||
  raw === "roles" ||
  raw === "alerts" ||
  raw === "audit";

export default function SystemSettings() {
  const { can } = useAuth();
  const canCreateAccounts = can("accounts", "create");
  const canReadDeletionRequests = can("deletion-requests", "read");
  const canReadTraceRequests = can("trace-requests", "read");

  const [tab, setTab] = useState<Tab>(
    () =>
      consumePendingSystemTab() ??
      readInitialUrlSubTab("sub", "accounts", isSystemTab, ADMIN_LAST_URL_KEY),
  );
  const selectTab = useUrlSubTab<Tab>(
    "sub",
    tab,
    setTab,
    "accounts",
    isSystemTab,
  );
  const [createTrigger, setCreateTrigger] = useState(0);
  const [pendingDeletions, setPendingDeletions] = useState(0);
  const [pendingTraceRequests, setPendingTraceRequests] = useState(0);

  const refreshPendingCounts = useCallback(() => {
    if (canReadDeletionRequests) {
      api
        .get<{ pendingCount?: number; total?: number }>(
          "/deletion-requests?status=pending&pageSize=1",
        )
        .then((res) => {
          setPendingDeletions(res.pendingCount ?? res.total ?? 0);
        })
        .catch(() => {
          // ignore transient errors
        });
    }
    if (canReadTraceRequests) {
      api
        .get<{ pendingCount?: number; total?: number }>(
          "/trace-requests?status=pending&pageSize=1",
        )
        .then((res) => {
          setPendingTraceRequests(res.pendingCount ?? res.total ?? 0);
        })
        .catch(() => {
          // ignore transient errors
        });
    }
  }, [canReadDeletionRequests, canReadTraceRequests]);

  useEffect(() => {
    refreshPendingCounts();
    const unsub = onCountsChanged(refreshPendingCounts);
    return unsub;
  }, [refreshPendingCounts]);

  useEffect(() => {
    const handler = (event: Event) => {
      const storedTab = consumePendingSystemTab();
      const nextTab = (event as CustomEvent<string>).detail ?? storedTab;
      if (nextTab && isSystemTab(nextTab)) {
        selectTab(nextTab);
      }
    };
    window.addEventListener(ADMIN_SYSTEM_TAB_EVENT, handler);
    return () => window.removeEventListener(ADMIN_SYSTEM_TAB_EVENT, handler);
  }, [selectTab]);

  const tabBarRef = useAutoCenterDock<HTMLDivElement>(tab);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "accounts", label: "Tài khoản" },
    ...(canReadTraceRequests
      ? [
        {
          id: "trace-requests" as const,
          label: "Cấp quyền QR",
          badge: pendingTraceRequests,
        },
      ]
      : []),
    ...(canReadDeletionRequests
      ? [
        {
          id: "deletions" as const,
          label: "Duyệt xóa",
          badge: pendingDeletions,
        },
      ]
      : []),
    { id: "roles", label: "Phân quyền" },
    { id: "alerts", label: "Phát thông báo" },
    { id: "audit", label: "Nhật ký thao tác" },
  ];

  return (
    <>
      {tab === "accounts" && canCreateAccounts && (
        <div className="page-header">
          <div className="header-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreateTrigger((c) => c + 1)}
            >
              Thêm tài khoản
            </button>
          </div>
        </div>
      )}

      <div className="tab-bar" ref={tabBarRef}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            <span>{t.label}</span>
            {t.badge && t.badge > 0 ? <span className="tab-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsTab createTrigger={createTrigger} />}
      {tab === "trace-requests" && canReadTraceRequests && (
        <TraceAccessRequestsTab
          onReviewed={refreshPendingCounts}
          onPendingCountSync={setPendingTraceRequests}
        />
      )}
      {tab === "deletions" && (
        <DeletionRequestsTab
          onReviewed={refreshPendingCounts}
          onPendingCountSync={setPendingDeletions}
        />
      )}
      {tab === "roles" && <RolesTab />}
      {tab === "alerts" && <SystemAlertsTab />}
      {tab === "audit" && <AuditLogTab />}
    </>
  );
}
