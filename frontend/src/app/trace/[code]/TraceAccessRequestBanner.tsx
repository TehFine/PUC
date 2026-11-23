"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT, getServerCalibratedDate } from "@/lib/api-client";
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
  defaultRequesterName?: string | null;
  externalOpenTrigger?: number;
  onGrantActivated: (passToken: string, grantedTier: "enterprise" | "authority") => void;
}

const COPY: Record<
  TraceLang,
  {
    bannerTitle: string;
    bannerDesc: string;
    openBtn: string;
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
    bannerTitle: "Đoàn công tác hoặc đơn vị thanh tra cần cấp quyền xem hồ sơ đánh giá?",
    bannerDesc:
      "Nếu đoàn kiểm tra hoặc đối tác xuống làm việc đột xuất chưa có lịch báo trước, gửi yêu cầu trực tiếp để Quản trị viên phê duyệt và mở quyền xem chi tiết ngay tức thời trên trang này.",
    openBtn: "Yêu cầu cấp quyền xem hồ sơ",
    pendingTitleFmt: (code) => `ĐANG CHỜ PHÊ DUYỆT CẤP QUYỀN (${code})`,
    pendingDesc:
      "Hệ thống đã phát thông báo thời gian thực tới Quản trị viên và Ban điều hành HTX. Trang này sẽ tự động mở khóa hồ sơ đánh giá ngay khi được phê duyệt.",
    rejectedTitleFmt: (code) => `YÊU CẦU CẤP QUYỀN CHƯA ĐƯỢC CHẤP THUẬN (${code})`,
    rejectedDescFmt: (note) =>
      note
        ? `Phản hồi từ Ban quản trị: ${note}`
        : "Yêu cầu chưa được phê duyệt. Quý đoàn có thể đối chiếu lại thông tin và gửi lại yêu cầu.",
    retryBtn: "Gửi lại yêu cầu",
    modalTitle: "Đề nghị cấp quyền xem hồ sơ đánh giá đột xuất",
    modalSub:
      "Thông báo khẩn sẽ gửi tức thời tới Quản trị viên HTX. Màn hình đang mở sẽ tự động hiển thị hồ sơ mở rộng ngay sau khi được duyệt.",
    nameLabel: "Họ tên người đại diện",
    namePh: "Nhập họ và tên trưởng đoàn hoặc cán bộ kiểm tra...",
    orgLabel: "Đoàn công tác / Cơ quan / Công ty",
    orgPh: "Ví dụ: Đoàn kiểm tra Chi cục TT và BVTV hoặc Công ty thu mua...",
    phoneLabel: "Số điện thoại liên hệ trực tiếp",
    phonePh: "Nhập số điện thoại để Quản trị viên đối chiếu khi cần...",
    tierLabel: "Mức quyền hồ sơ đề nghị mở",
    tierOptEnterprise: "Cấp 2 - Hồ sơ Đánh giá Đối tác và Thẩm định Thực địa vườn",
    tierOptAuthority: "Cấp 3 - Hồ sơ Thanh tra Quản lý Nhà nước (Toàn diện)",
    purposeLabel: "Nội dung làm việc / Lý do kiểm tra đột xuất",
    purposePh: "Nêu ngắn gọn mục đích thẩm định vùng trồng, kiểm tra lô hàng hoặc truy vết...",
    cancelBtn: "Đóng",
    submitBtn: "Gửi yêu cầu phê duyệt ngay",
    submittingBtn: "Đang gửi yêu cầu...",
    defaultErr: "Chưa thể gửi yêu cầu lúc này. Vui lòng kiểm tra thông tin và thử lại.",
  },
  en: {
    bannerTitle: "Visiting delegation or inspection team needing extended dossier access?",
    bannerDesc:
      "Unannounced buyer delegations or regulatory teams can send a live access request to Cooperative Administrators to unlock detailed assessment records right on this screen.",
    openBtn: "Request Assessment Access",
    pendingTitleFmt: (code) => `AWAITING ADMINISTRATOR APPROVAL (${code})`,
    pendingDesc:
      "A real-time alert has been sent to Cooperative Administrators. This page will automatically unlock the extended dossier the moment it is approved.",
    rejectedTitleFmt: (code) => `ACCESS REQUEST DECLINED (${code})`,
    rejectedDescFmt: (note) =>
      note
        ? `Administrator note: ${note}`
        : "This request was declined. You may update your delegation details and submit again.",
    retryBtn: "Submit New Request",
    modalTitle: "Request On-Site Extended Traceability Access",
    modalSub:
      "An instant notification will be delivered to Cooperative Administrators. Your screen will unlock automatically upon approval.",
    nameLabel: "Representative Full Name",
    namePh: "Enter delegation lead or inspector name...",
    orgLabel: "Delegation / Company / Agency",
    orgPh: "e.g. Import Quality Audit Team or Regulatory Authority...",
    phoneLabel: "Direct Contact Phone",
    phonePh: "Phone number for quick verification...",
    tierLabel: "Requested Access Tier",
    tierOptEnterprise: "Tier 2 - Partner Assessment & On-Site Orchard Audit",
    tierOptAuthority: "Tier 3 - Full Regulatory Inspection Dossier",
    purposeLabel: "Inspection / Assessment Purpose",
    purposePh: "Briefly state the purpose of this unscheduled audit or inspection...",
    cancelBtn: "Cancel",
    submitBtn: "Send Live Request",
    submittingBtn: "Sending...",
    defaultErr: "Unable to submit request. Please check all fields and retry.",
  },
  zh: {
    bannerTitle: "临时到访考察团或监管抽检组需申请查看评估档案？",
    bannerDesc:
      "如采购考察团或监管人员临时到访未提前预约，可直接向合作社管理员发送实时授权申请，审批通过后本页面将自动解锁详细评估档案。",
    openBtn: "申请查看评估档案权限",
    pendingTitleFmt: (code) => `正在等待管理员实时审批（${code}）`,
    pendingDesc:
      "系统已向合作社管理员发送实时通知。管理员批准后，当前页面将自动刷新并解锁扩展档案，无需手动操作。",
    rejectedTitleFmt: (code) => `权限申请未获通过（${code}）`,
    rejectedDescFmt: (note) =>
      note ? `管理员回复：${note}` : "当前申请未获通过，请核对单位与联系信息后重新提交。",
    retryBtn: "重新提交申请",
    modalTitle: "申请临时解锁扩展溯源与评估档案",
    modalSub: "提交后将立即推送至合作社管理端，审批通过后当前页面自动生效。",
    nameLabel: "代表人姓名",
    namePh: "请输入考察团负责人或抽检人员姓名...",
    orgLabel: "所属考察团 / 企业 / 监管单位",
    orgPh: "例如：进口采购品控组 或 检疫监管部门...",
    phoneLabel: "联系电话",
    phonePh: "请输入便于核实的联系电话...",
    tierLabel: "申请解锁级别",
    tierOptEnterprise: "二级权限 - 采购商评估与果园实地核查档案",
    tierOptAuthority: "三级权限 - 政府监管与全面稽核档案",
    purposeLabel: "现场核查或评估事由",
    purposePh: "请简要说明本次临时现场考察、验货或抽检事由...",
    cancelBtn: "取消",
    submitBtn: "立即发送审批申请",
    submittingBtn: "正在发送...",
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
      parsed.clientSecret &&
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
      setModalOpen(false);
    } catch {
      setFormError(c.defaultErr);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {savedReq?.status === "pending" ? (
        <section className="tr-access-req-card is-pending no-print" role="status">
          <div className="tr-access-req-copy">
            <strong className="tr-access-req-title">
              {c.pendingTitleFmt(savedReq.requestCode)}
            </strong>
            <p className="tr-access-req-desc">{c.pendingDesc}</p>
          </div>
        </section>
      ) : savedReq?.status === "rejected" ? (
        <section className="tr-access-req-card is-rejected no-print" role="status">
          <div className="tr-access-req-copy">
            <strong className="tr-access-req-title">
              {c.rejectedTitleFmt(savedReq.requestCode)}
            </strong>
            <p className="tr-access-req-desc">
              {c.rejectedDescFmt(savedReq.reviewNote ?? null)}
            </p>
          </div>
          <button
            type="button"
            className="tr-access-req-btn"
            onClick={openRequestModal}
          >
            {c.retryBtn}
          </button>
        </section>
      ) : savedReq?.status !== "approved" ? (
        <section className="tr-access-req-card no-print">
          <div className="tr-access-req-copy">
            <strong className="tr-access-req-title">{c.bannerTitle}</strong>
            <p className="tr-access-req-desc">{c.bannerDesc}</p>
          </div>
          <button
            type="button"
            className="tr-access-req-btn"
            onClick={openRequestModal}
          >
            {c.openBtn}
          </button>
        </section>
      ) : null}

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
              <div>
                <h2 id="tr-req-modal-heading" className="tr-req-modal-title">
                  {c.modalTitle}
                </h2>
                <p className="tr-req-modal-sub">{c.modalSub}</p>
              </div>
              <button
                type="button"
                className="tr-req-modal-close"
                aria-label={c.cancelBtn}
                disabled={submitting}
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form className="tr-req-modal-form" onSubmit={(e) => void handleSubmit(e)}>
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
                  onClick={() => setModalOpen(false)}
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
