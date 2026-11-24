"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT, getServerCalibratedDate } from "@/lib/api-client";
import { useBackLayer } from "@/lib/back-navigation";
import { buildSignedSecurityHeaders } from "@/lib/request-security";
import type { TraceLang } from "./trace-i18n";

const TRACE_REQ_SESSION_KEY = "puc_trace_access_req_v1";

interface SavedTraceReqSession {
  requestCode: string;
  clientSecret: string;
  scannedCode: string;
  requestedTier: "enterprise" | "authority";
  status: "pending" | "approved" | "rejected" | "revoked" | "expired";
  reviewNote?: string | null;
  reviewedByName?: string | null;
}

interface TraceAccessRequestBannerProps {
  scannedCode: string;
  lang: TraceLang;
  actualTier: "public" | "enterprise" | "authority";
  isAuthenticated: boolean;
  fieldAuditPassActive: boolean;
  loginHref: string;
  auditPassInput: string;
  onAuditPassInputChange: (val: string) => void;
  onApplyAuditPass: (e: FormEvent) => void;
  switchingTier: boolean;
  defaultRequesterName?: string | null;
  externalOpenTrigger?: number;
  onGrantActivated: (passToken: string, grantedTier: "enterprise" | "authority") => void;
}

const COPY: Record<
  TraceLang,
  {
    cardTitle: string;
    cardDesc: string;
    havePassLabel: string;
    passPlaceholder: string;
    passSubmitBtn: string;
    noPassLabel: string;
    requestBtn: string;
    loginBtn: string;
    upgradeTitle: string;
    upgradeDesc: string;
    pendingTitleFmt: (code: string) => string;
    pendingDesc: string;
    rejectedTitleFmt: (code: string) => string;
    rejectedDescFmt: (note: string | null) => string;
    retryBtn: string;
    modalTitle: string;
    modalSub: string;
    nameLabel: string;
    namePh: string;
    orgLabel: string;
    orgPh: string;
    phoneLabel: string;
    phonePh: string;
    tierLabel: string;
    tierOptEnterprise: string;
    tierOptAuthority: string;
    purposeLabel: string;
    purposePh: string;
    cancelBtn: string;
    submitBtn: string;
    submittingBtn: string;
    defaultErr: string;
  }
> = {
  vi: {
    cardTitle: "Mở hồ sơ chi tiết cho Đoàn kiểm tra và Đối tác",
    cardDesc:
      "Nhập mã thẻ được cấp để xem ngay, hoặc gửi yêu cầu nếu đoàn làm việc đột xuất chưa có mã.",
    havePassLabel: "Đã có mã thẻ thẩm định",
    passPlaceholder: "Nhập mã thẻ được cấp...",
    passSubmitBtn: "Mở hồ sơ",
    noPassLabel: "Chưa có mã thẻ",
    requestBtn: "Yêu cầu cấp quyền",
    loginBtn: "Đăng nhập",
    upgradeTitle: "Cần xem hồ sơ cấp cơ quan thanh tra?",
    upgradeDesc: "Gửi yêu cầu để Quản trị viên mở quyền xem toàn diện ngay trên trang này.",
    pendingTitleFmt: (code) => `Đang chờ duyệt (${code})`,
    pendingDesc: "Trang sẽ tự động mở hồ sơ chi tiết ngay khi Quản trị viên phê duyệt.",
    rejectedTitleFmt: (code) => `Chưa được duyệt (${code})`,
    rejectedDescFmt: (note) =>
      note ? `Phản hồi: ${note}` : "Vui lòng kiểm tra lại thông tin và gửi lại yêu cầu.",
    retryBtn: "Gửi lại yêu cầu",
    modalTitle: "Yêu cầu quyền xem hồ sơ chi tiết",
    modalSub: "Hồ sơ sẽ tự động mở ngay khi Quản trị viên phê duyệt.",
    nameLabel: "Họ tên người đại diện",
    namePh: "Nhập họ tên trưởng đoàn hoặc cán bộ...",
    orgLabel: "Đơn vị công tác",
    orgPh: "Tên đoàn kiểm tra, cơ quan hoặc công ty...",
    phoneLabel: "Số điện thoại liên hệ",
    phonePh: "Nhập số điện thoại đối chiếu...",
    tierLabel: "Mức hồ sơ cần mở",
    tierOptEnterprise: "Hồ sơ Đối tác và Kiểm tra tại vườn",
    tierOptAuthority: "Hồ sơ Thanh tra cơ quan quản lý",
    purposeLabel: "Lý do làm việc",
    purposePh: "Nêu ngắn gọn mục đích thẩm định vùng trồng hoặc kiểm tra lô hàng...",
    cancelBtn: "Hủy",
    submitBtn: "Gửi yêu cầu",
    submittingBtn: "Đang gửi...",
    defaultErr: "Chưa thể gửi yêu cầu lúc này. Vui lòng kiểm tra thông tin và thử lại.",
  },
  en: {
    cardTitle: "Extended Dossier for Inspectors and Partners",
    cardDesc:
      "Enter your issued pass code to view immediately, or send a request for unscheduled visits.",
    havePassLabel: "Have an audit pass code",
    passPlaceholder: "Enter issued pass code...",
    passSubmitBtn: "Unlock",
    noPassLabel: "No pass code yet",
    requestBtn: "Request Access",
    loginBtn: "Sign In",
    upgradeTitle: "Need full regulatory inspection access?",
    upgradeDesc: "Send a request for Administrators to unlock the full dossier on this page.",
    pendingTitleFmt: (code) => `Awaiting approval (${code})`,
    pendingDesc: "This page will automatically unlock the dossier once approved.",
    rejectedTitleFmt: (code) => `Request declined (${code})`,
    rejectedDescFmt: (note) =>
      note ? `Note: ${note}` : "Please check your details and submit again.",
    retryBtn: "Resubmit",
    modalTitle: "Request Extended Dossier Access",
    modalSub: "The dossier unlocks automatically once approved by an administrator.",
    nameLabel: "Representative Name",
    namePh: "Enter delegation lead or inspector name...",
    orgLabel: "Organization / Agency",
    orgPh: "Inspection team, company, or authority...",
    phoneLabel: "Contact Phone",
    phonePh: "Direct phone number...",
    tierLabel: "Requested Dossier Scope",
    tierOptEnterprise: "Partner Assessment & Orchard Audit",
    tierOptAuthority: "Regulatory Inspection Dossier",
    purposeLabel: "Inspection Purpose",
    purposePh: "Briefly state the purpose of this audit or inspection...",
    cancelBtn: "Cancel",
    submitBtn: "Send Request",
    submittingBtn: "Sending...",
    defaultErr: "Unable to submit request. Please check all fields and retry.",
  },
  zh: {
    cardTitle: "考察团与合作方详细档案",
    cardDesc: "输入已发放的通行码即可查看，临时到访无通行码可在线申请授权。",
    havePassLabel: "已有核验通行码",
    passPlaceholder: "输入已发放的通行码...",
    passSubmitBtn: "立即开启",
    noPassLabel: "暂无通行码",
    requestBtn: "申请临时授权",
    loginBtn: "账号登录",
    upgradeTitle: "需要查看监管稽核完整档案？",
    upgradeDesc: "向管理员发送实时申请，审批通过后本页将直接解锁完整档案。",
    pendingTitleFmt: (code) => `等待审批（${code}）`,
    pendingDesc: "管理员批准后，当前页面将自动解锁详细档案。",
    rejectedTitleFmt: (code) => `申请未通过（${code}）`,
    rejectedDescFmt: (note) =>
      note ? `回复：${note}` : "请核对单位与联系信息后重新提交。",
    retryBtn: "重新提交",
    modalTitle: "申请查看详细档案权限",
    modalSub: "管理员批准后，当前页面将自动解锁档案。",
    nameLabel: "代表人姓名",
    namePh: "请输入考察团负责人或抽检人员姓名...",
    orgLabel: "所属单位",
    orgPh: "考察团、采购企业或监管部门名称...",
    phoneLabel: "联系电话",
    phonePh: "请输入联系电话...",
    tierLabel: "申请查看范围",
    tierOptEnterprise: "合作方评估与果园核查档案",
    tierOptAuthority: "监管部门全面稽核档案",
    purposeLabel: "核查事由",
    purposePh: "请简要说明本次现场考察、验货或抽检事由...",
    cancelBtn: "取消",
    submitBtn: "提交申请",
    submittingBtn: "正在提交...",
    defaultErr: "暂时无法提交申请，请检查填写内容后重试。",
  },
};

function readSavedReq(scannedCode: string): SavedTraceReqSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TRACE_REQ_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedTraceReqSession;
    if (
      parsed &&
      parsed.requestCode &&
      (parsed.clientSecret || parsed.status !== "pending") &&
      parsed.scannedCode?.toUpperCase() === scannedCode.toUpperCase()
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeSavedReq(val: SavedTraceReqSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!val) {
      window.sessionStorage.removeItem(TRACE_REQ_SESSION_KEY);
    } else {
      window.sessionStorage.setItem(TRACE_REQ_SESSION_KEY, JSON.stringify(val));
    }
  } catch {
    // ignore
  }
}

export default function TraceAccessRequestBanner({
  scannedCode,
  lang,
  actualTier,
  isAuthenticated,
  fieldAuditPassActive,
  loginHref,
  auditPassInput,
  onAuditPassInputChange,
  onApplyAuditPass,
  switchingTier,
  defaultRequesterName,
  externalOpenTrigger = 0,
  onGrantActivated,
}: TraceAccessRequestBannerProps) {
  const c = COPY[lang];
  const [savedReq, setSavedReq] = useState<SavedTraceReqSession | null>(() =>
    readSavedReq(scannedCode),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [requesterName, setRequesterName] = useState(defaultRequesterName || "");
  const [organization, setOrganization] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [requestedTier, setRequestedTier] = useState<"enterprise" | "authority">(
    actualTier === "enterprise" ? "authority" : "enterprise",
  );
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [prevScannedCode, setPrevScannedCode] = useState(scannedCode);
  if (prevScannedCode !== scannedCode) {
    setPrevScannedCode(scannedCode);
    setSavedReq(readSavedReq(scannedCode));
  }

  const [prevExternalTrigger, setPrevExternalTrigger] = useState(externalOpenTrigger);
  if (prevExternalTrigger !== externalOpenTrigger) {
    setPrevExternalTrigger(externalOpenTrigger);
    if (externalOpenTrigger > 0) {
      setFormError(null);
      if (!requesterName && defaultRequesterName) {
        setRequesterName(defaultRequesterName);
      }
      setModalOpen(true);
    }
  }

  const closeModal = useCallback(() => {
    if (!submitting) {
      setModalOpen(false);
    }
  }, [submitting]);

  useBackLayer(modalOpen, closeModal);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.stopPropagation();
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, submitting]);

  const openRequestModal = () => {
    setFormError(null);
    if (!requesterName && defaultRequesterName) {
      setRequesterName(defaultRequesterName);
    }
    setModalOpen(true);
  };

  const checkPendingStatus = useCallback(async () => {
    const current = readSavedReq(scannedCode);
    if (!current || current.status !== "pending") return;
    try {
      const res = await fetch(
        `/api/public/trace-access-requests/${encodeURIComponent(current.requestCode)}/status`,
        {
          credentials: "same-origin",
          headers: { "x-trace-req-secret": current.clientSecret },
          cache: "no-store",
        },
      );
      if (!res.ok) return;
      const body = (await res.json()) as {
        status: "pending" | "approved" | "rejected" | "revoked" | "expired";
        grantedTier?: "enterprise" | "authority" | null;
        grantedPassToken?: string | null;
        reviewNote?: string | null;
        reviewedByName?: string | null;
      };

      if (body.status === "approved" && body.grantedPassToken) {
        const nextState: SavedTraceReqSession = {
          ...current,
          clientSecret: "",
          status: "approved",
          reviewNote: body.reviewNote,
          reviewedByName: body.reviewedByName,
        };
        writeSavedReq(nextState);
        setSavedReq(nextState);
        onGrantActivated(
          body.grantedPassToken,
          body.grantedTier ?? current.requestedTier,
        );
      } else if (body.status !== "pending") {
        const nextState: SavedTraceReqSession = {
          ...current,
          clientSecret: "",
          status: body.status,
          reviewNote: body.reviewNote,
          reviewedByName: body.reviewedByName,
        };
        writeSavedReq(nextState);
        setSavedReq(nextState);
      }
    } catch {
      // ignore transient network glitches while waiting
    }
  }, [onGrantActivated, scannedCode]);

  useEffect(() => {
    if (!savedReq || savedReq.status !== "pending") return;

    const initTimer = window.setTimeout(() => {
      void checkPendingStatus();
    }, 0);

    let es: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      try {
        es = new EventSource("/api/public/trace-stream");
        es.onmessage = () => {
          void checkPendingStatus();
        };
      } catch {
        es = null;
      }
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void checkPendingStatus();
      }
    }, 6_000);

    const onWake = () => {
      if (document.visibilityState === "visible") {
        void checkPendingStatus();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      window.clearTimeout(initTimer);
      es?.close();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [checkPendingStatus, savedReq]);

  useEffect(() => {
    const clearOnLogout = () => {
      writeSavedReq(null);
      setSavedReq(null);
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, clearOnLogout);
    window.addEventListener(AUTH_EXPIRED_EVENT, clearOnLogout);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, clearOnLogout);
      window.removeEventListener(AUTH_EXPIRED_EVENT, clearOnLogout);
    };
  }, []);

  if (actualTier === "authority") {
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const bodyStr = JSON.stringify({
        scannedCode,
        requesterName: requesterName.trim(),
        organization: organization.trim(),
        contactPhone: contactPhone.trim(),
        purpose: purpose.trim(),
        requestedTier,
      });
      const res = await fetch("/api/public/trace-access-requests", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...buildSignedSecurityHeaders(
            "POST",
            "/api/public/trace-access-requests",
            bodyStr,
            getServerCalibratedDate().getTime(),
          ),
        },
        body: bodyStr,
      });
      const payload = (await res.json().catch(() => null)) as
        | {
          requestCode?: string;
          clientSecret?: string;
          status?: "pending";
          message?: string | string[];
        }
        | null;
      if (!res.ok || !payload?.requestCode || !payload?.clientSecret) {
        const errMsg = Array.isArray(payload?.message)
          ? payload.message[0]
          : payload?.message || c.defaultErr;
        setFormError(errMsg);
        return;
      }
      const nextSession: SavedTraceReqSession = {
        requestCode: payload.requestCode,
        clientSecret: payload.clientSecret,
        scannedCode,
        requestedTier,
        status: "pending",
      };
      writeSavedReq(nextSession);
      setSavedReq(nextSession);
      setPurpose("");
      setModalOpen(false);
    } catch {
      setFormError(c.defaultErr);
    } finally {
      setSubmitting(false);
    }
  };

  const showPassInput = !fieldAuditPassActive && actualTier === "public" && !isAuthenticated;
  const isApproved = savedReq?.status === "approved";

  const renderRequestSection = () => {
    if (savedReq?.status === "pending") {
      return (
        <div className="tr-uac-status" role="status">
          <strong className="tr-uac-status-title is-pending">
            {c.pendingTitleFmt(savedReq.requestCode)}
          </strong>
          <p className="tr-uac-status-note">{c.pendingDesc}</p>
        </div>
      );
    }
    if (savedReq?.status === "rejected") {
      return (
        <div className="tr-uac-status" role="status">
          <strong className="tr-uac-status-title is-rejected">
            {c.rejectedTitleFmt(savedReq.requestCode)}
          </strong>
          <p className="tr-uac-status-note">
            {c.rejectedDescFmt(savedReq.reviewNote ?? null)}
          </p>
          <div className="tr-uac-actions">
            <button
              type="button"
              className="tr-uac-btn-outline is-strong"
              onClick={openRequestModal}
            >
              {c.retryBtn}
            </button>
          </div>
        </div>
      );
    }
    return (
      <>
        <span className="tr-uac-label">{c.noPassLabel}</span>
        <div className="tr-uac-actions">
          <button
            type="button"
            className="tr-uac-btn-outline is-strong"
            onClick={openRequestModal}
          >
            {c.requestBtn}
          </button>
          {!isAuthenticated && (
            <Link href={loginHref} className="tr-uac-btn-outline">
              {c.loginBtn}
            </Link>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      {!isApproved &&
        (showPassInput ? (
          <section className="tr-unified-access-card no-print" aria-label={c.cardTitle}>
            <div className="tr-uac-head">
              <strong className="tr-uac-title">{c.cardTitle}</strong>
              <p className="tr-uac-desc">{c.cardDesc}</p>
            </div>

            <div className="tr-uac-body">
              <div className="tr-uac-col">
                <span className="tr-uac-label">{c.havePassLabel}</span>
                <form
                  className="tr-uac-pass-form"
                  autoComplete="off"
                  onSubmit={onApplyAuditPass}
                >
                  <input
                    type="text"
                    className="tr-uac-input"
                    value={auditPassInput}
                    onChange={(e) => onAuditPassInputChange(e.target.value)}
                    placeholder={c.passPlaceholder}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    className="tr-uac-btn-solid"
                    disabled={switchingTier || !auditPassInput.trim()}
                  >
                    {c.passSubmitBtn}
                  </button>
                </form>
              </div>

              <div className="tr-uac-col">{renderRequestSection()}</div>
            </div>
          </section>
        ) : (
          <section className="tr-unified-access-card is-compact no-print" aria-label={c.upgradeTitle}>
            {savedReq?.status === "pending" || savedReq?.status === "rejected" ? (
              <div className="tr-uac-single">{renderRequestSection()}</div>
            ) : (
              <div className="tr-uac-single is-inline">
                <div className="tr-uac-single-copy">
                  <strong className="tr-uac-title">
                    {actualTier === "enterprise" ? c.upgradeTitle : c.cardTitle}
                  </strong>
                  <p className="tr-uac-desc">
                    {actualTier === "enterprise" ? c.upgradeDesc : c.cardDesc}
                  </p>
                </div>
                <button
                  type="button"
                  className="tr-uac-btn-solid"
                  onClick={openRequestModal}
                >
                  {c.requestBtn}
                </button>
              </div>
            )}
          </section>
        ))}

      {modalOpen && (
        <div
          className="tr-req-modal-backdrop no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tr-req-modal-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setModalOpen(false);
            }
          }}
        >
          <div className="tr-req-modal-panel">
            <div className="tr-req-modal-head">
              <h2 id="tr-req-modal-heading" className="tr-req-modal-title">
                {c.modalTitle}
              </h2>
              <p className="tr-req-modal-sub">{c.modalSub}</p>
              <button
                type="button"
                className="tr-req-modal-close"
                aria-label={c.cancelBtn}
                disabled={submitting}
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            <form
              className="tr-req-modal-form"
              autoComplete="off"
              onSubmit={(e) => void handleSubmit(e)}
            >
              {formError && (
                <div className="tr-req-modal-error" role="alert">
                  {formError}
                </div>
              )}

              <div className="tr-req-field-row">
                <label className="tr-req-field">
                  <span>{c.nameLabel}</span>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="off"
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    placeholder={c.namePh}
                  />
                </label>

                <label className="tr-req-field">
                  <span>{c.phoneLabel}</span>
                  <input
                    type="tel"
                    required
                    minLength={8}
                    maxLength={20}
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    spellCheck={false}
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder={c.phonePh}
                  />
                </label>
              </div>

              <label className="tr-req-field">
                <span>{c.orgLabel}</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={160}
                  autoComplete="off"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder={c.orgPh}
                />
              </label>

              <label className="tr-req-field">
                <span>{c.tierLabel}</span>
                <select
                  value={requestedTier}
                  onChange={(e) =>
                    setRequestedTier(e.target.value as "enterprise" | "authority")
                  }
                >
                  {actualTier === "public" && (
                    <option value="enterprise">{c.tierOptEnterprise}</option>
                  )}
                  <option value="authority">{c.tierOptAuthority}</option>
                </select>
              </label>

              <label className="tr-req-field">
                <span>{c.purposeLabel}</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  autoComplete="off"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder={c.purposePh}
                />
              </label>

              <div className="tr-req-modal-actions">
                <button
                  type="button"
                  className="tr-req-btn-secondary"
                  disabled={submitting}
                  onClick={closeModal}
                >
                  {c.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="tr-req-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? c.submittingBtn : c.submitBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
