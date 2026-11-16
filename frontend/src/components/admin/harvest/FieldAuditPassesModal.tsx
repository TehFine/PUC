"use client";

import { useEffect, useState } from "react";
import ListStatusRow from "@/components/admin/catalog/ListStatusRow";
import { hasErrors, requireFields } from "@/components/admin/shared/form-utils";
import { ConfirmDialog, FormError, Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { FormGrid, NumberField, SelectField, TextField, type Option } from "@/components/ui/form/fields";
import { useApi, useMutation } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api-client";
import type { EndorsementConfigDto, FieldAuditPassDto } from "@/types/api";
import { isSafeExternalHttpsUrl } from "@/utils/url-safety";

const LANG_OPTIONS: Option[] = [
  { value: "zh", label: "Tiếng Trung Giản thể (简体中文 - Đoàn thu mua TQ)" },
  { value: "vi", label: "Tiếng Việt (Đoàn công tác Tỉnh / Sở ngành)" },
  { value: "en", label: "Tiếng Anh (English - Đối tác quốc tế)" },
];

export default function FieldAuditPassesModal({
  canEdit,
  canEditEndorsement,
  onClose,
}: {
  canEdit: boolean;
  canEditEndorsement: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"passes" | "endorsement">("passes");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [createdSecret, setCreatedSecret] = useState<
    (FieldAuditPassDto & { passToken: string }) | null
  >(null);

  // ─── Tab 1: Thẻ Đoàn Thẩm định Thực địa ───
  const passesApi = useApi<{ data?: FieldAuditPassDto[] }>("/field-audit-passes");
  const passes = passesApi.data?.data ?? [];

  const [delegationName, setDelegationName] = useState("");
  const [organization, setOrganization] = useState("");
  const [allowedZoneCode, setAllowedZoneCode] = useState("");
  const [defaultLang, setDefaultLang] = useState<"vi" | "en" | "zh">("zh");
  const [durationHours, setDurationHours] = useState("72");
  const [passNote, setPassNote] = useState("");
  const [passErrors, setPassErrors] = useState<Record<string, string | undefined>>({});

  const createPass = useMutation(async (payload: Record<string, unknown>) => {
    return api.post<FieldAuditPassDto>("/field-audit-passes", payload);
  });

  const extractValidPassToken = (raw?: string | null): string | null => {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return /^[A-Za-z0-9_-]{12,80}$/.test(trimmed) ? trimmed : null;
  };

  const buildInviteUrl = (passToken: string, lang?: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/trace?auditPass=${encodeURIComponent(passToken)}&lang=${encodeURIComponent(lang || "zh")}`;
  };

  const handleCreatePass = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string | undefined> = requireFields(
      { delegationName },
      { delegationName: "tên đoàn công tác hoặc đối tác thu mua" },
    );
    const hrs = Number(durationHours);
    if (!Number.isFinite(hrs) || hrs < 1 || hrs > 336) {
      errs.durationHours = "Thời hạn hiệu lực từ 1 đến 336 giờ (14 ngày).";
    }
    setPassErrors(errs);
    if (hasErrors(errs)) return;

    const created = await createPass.run({
      delegationName: delegationName.trim(),
      organization: organization.trim() || undefined,
      allowedZoneCode: allowedZoneCode.trim() || undefined,
      defaultLang,
      durationHours: Math.round(hrs),
      note: passNote.trim() || undefined,
    });
    if (!created) return;
    const secretToken = extractValidPassToken(created.passToken);
    if (secretToken) {
      setCreatedSecret({ ...created, passToken: secretToken });
    }
    toast.success(`Đã cấp mã thẻ thẩm định thực địa ${created.code}.`);
    setDelegationName("");
    setOrganization("");
    setPassNote("");
    void passesApi.refresh();
  };

  const [revokingPass, setRevokingPass] = useState<FieldAuditPassDto | null>(null);
  const [revokingBusy, setRevokingBusy] = useState(false);

  const handleRevokePass = async (pass: FieldAuditPassDto) => {
    setRevokingBusy(true);
    try {
      await api.patch(`/field-audit-passes/${pass.id}/revoke`, {});
      if (createdSecret?.id === pass.id) {
        setCreatedSecret(null);
      }
      toast.success(`Đã thu hồi thẻ ${pass.code}.`);
      setRevokingPass(null);
      void passesApi.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Không thể thu hồi thẻ thẩm định."));
    } finally {
      setRevokingBusy(false);
    }
  };

  const handleCopyInvite = async (pass: FieldAuditPassDto) => {
    if (typeof window === "undefined") return;
    const secretToken =
      createdSecret?.id === pass.id
        ? createdSecret.passToken
        : extractValidPassToken(pass.passToken);

    const textToCopy = secretToken
      ? `Mã thẻ đoàn thẩm định thực địa: ${pass.code}\nĐường dẫn tra cứu và đối chứng GPS tại vườn: ${buildInviteUrl(secretToken, pass.defaultLang)}`
      : `Mã thẻ đoàn thẩm định thực địa: ${pass.code} (${pass.delegationName})`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(pass.id);
      toast.success(
        secretToken
          ? `Đã sao chép đường dẫn mời một lần của thẻ ${pass.code}.`
          : `Đã sao chép mã định danh thẻ ${pass.code}.`,
      );
      setTimeout(() => setCopiedId(null), 2200);
    } catch {
      toast.error("Không thể sao chép tự động trên trình duyệt này.");
    }
  };

  // ─── Tab 2: Cấu hình Bảo chứng Chính quyền Xã / Tỉnh ───
  const endorseApi = useApi<EndorsementConfigDto>(
    activeTab === "endorsement" ? "/harvest/endorsement-config" : null,
  );
  const [programTitle, setProgramTitle] = useState("");
  const [directiveNo, setDirectiveNo] = useState("");
  const [communeAuthority, setCommuneAuthority] = useState("");
  const [provincialAuthority, setProvincialAuthority] = useState("");
  const [officialPortalUrl, setOfficialPortalUrl] = useState("");
  const [officialDomain, setOfficialDomain] = useState("");
  const [inspectionUnit, setInspectionUnit] = useState("");
  const [endorseErrors, setEndorseErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!endorseApi.data) return;
    setProgramTitle(endorseApi.data.programTitle || "");
    setDirectiveNo(endorseApi.data.directiveNo || "");
    setCommuneAuthority(endorseApi.data.communeAuthority || "");
    setProvincialAuthority(endorseApi.data.provincialAuthority || "");
    setOfficialPortalUrl(endorseApi.data.officialPortalUrl || "");
    setOfficialDomain(endorseApi.data.officialDomain || "");
    setInspectionUnit(endorseApi.data.inspectionUnit || "");
  }, [endorseApi.data]);

  const saveEndorsement = useMutation(async (payload: Record<string, unknown>) => {
    return api.put<EndorsementConfigDto>("/harvest/endorsement-config", payload);
  });

  const handleSaveEndorsement = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = requireFields(
      {
        programTitle,
        directiveNo,
        communeAuthority,
        provincialAuthority,
        officialPortalUrl,
        officialDomain,
        inspectionUnit,
      },
      {
        programTitle: "tiêu đề chương trình điểm",
        directiveNo: "văn bản / đề án chỉ đạo",
        communeAuthority: "cơ quan cấp xã",
        provincialAuthority: "cơ quan cấp tỉnh",
        officialPortalUrl: "đường dẫn cổng thông tin chính thức",
        officialDomain: "tên miền hiển thị",
        inspectionUnit: "đơn vị giám sát",
      },
    );
    if (officialPortalUrl.trim() && !isSafeExternalHttpsUrl(officialPortalUrl.trim())) {
      errs.officialPortalUrl = "Đường dẫn cổng thông tin phải bắt đầu bằng https:// hợp lệ.";
    }
    setEndorseErrors(errs);
    if (hasErrors(errs)) return;

    const updated = await saveEndorsement.run({
      programTitle: programTitle.trim(),
      directiveNo: directiveNo.trim(),
      communeAuthority: communeAuthority.trim(),
      provincialAuthority: provincialAuthority.trim(),
      officialPortalUrl: officialPortalUrl.trim(),
      officialDomain: officialDomain.trim(),
      inspectionUnit: inspectionUnit.trim(),
    });
    if (!updated) return;
    toast.success("Đã cập nhật thông tin bảo chứng Cổng thông tin Tỉnh & UBND Xã trên toàn bộ mã QR.");
    void endorseApi.refresh();
  };

  return (
    <Modal
      title="Thẻ Đoàn Thẩm định Thực địa & Bảo chứng Chính quyền Tỉnh / Xã"
      onClose={onClose}
      width={900}
      footer={
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          className={`btn ${activeTab === "passes" ? "btn-primary" : "btn-outline"} btn-sm`}
          onClick={() => setActiveTab("passes")}
        >
          1. Cấp Thẻ Đoàn Thẩm định Thực địa (Đối tác / Tỉnh)
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "endorsement" ? "btn-primary" : "btn-outline"} btn-sm`}
          onClick={() => setActiveTab("endorsement")}
        >
          2. Cấu hình Bảo chứng UBND Xã &amp; Cổng Tỉnh
        </button>
      </div>

      {activeTab === "passes" ? (
        <>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              background: "#f4f9f5",
              border: "1px solid #d4d4d2",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "#1e293b",
              marginBottom: 14,
            }}
          >
            Khi đón đoàn đối tác Trung Quốc hoặc đoàn kiểm tra của Tỉnh đi thực tế vườn, cán bộ xã và HTX cấp một mã thẻ có thời hạn (24h - 168h). Khách mở đường dẫn mời rồi quét Bảng QR đầu thửa vườn sẽ mở được ranh giới đa giác GIS, bấm đối chứng vị trí GPS ngay tại vườn và xem nhật ký canh tác mà vẫn bảo mật tuyệt đối CCCD cùng SĐT cá nhân của nông hộ.
          </div>

          {createdSecret && (
            <div
              style={{
                padding: "12px 14px",
                marginBottom: 14,
                borderRadius: 6,
                border: "1px solid #d4d4d2",
                background: "#ffffff",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: "#14372f" }}>
                  Đường dẫn mời một lần cho thẻ {createdSecret.code} ({createdSecret.delegationName})
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void handleCopyInvite(createdSecret)}
                  >
                    {copiedId === createdSecret.id ? "Đã sao chép" : "Sao chép đường dẫn mời"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setCreatedSecret(null)}
                  >
                    Đóng thông báo
                  </button>
                </div>
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 4,
                  background: "#f7f7f5",
                  border: "1px solid #d4d4d2",
                  wordBreak: "break-all",
                  color: "#121212",
                }}
              >
                {buildInviteUrl(createdSecret.passToken, createdSecret.defaultLang)}
              </div>
              <div style={{ fontSize: 11.5, color: "#5f6d66", marginTop: 6 }}>
                Khóa bí mật chỉ hiển thị một lần ngay sau khi cấp và sẽ được ẩn trên danh sách sau khi đóng hộp thoại.
              </div>
            </div>
          )}

          {canEdit && (
            <form
              onSubmit={(e) => void handleCreatePass(e)}
              style={{
                padding: 14,
                marginBottom: 14,
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>
                Cấp mới Thẻ Đoàn Thẩm định Thực địa
              </div>
              <FormGrid>
                <TextField
                  label="Tên đoàn công tác hoặc đối tác thu mua"
                  required
                  value={delegationName}
                  onChange={setDelegationName}
                  placeholder="VD: Đoàn Thu mua Nhập khẩu Quảng Tây - Bằng Tường"
                  maxLength={160}
                  error={passErrors.delegationName}
                />
                <TextField
                  label="Tổ chức hoặc doanh nghiệp"
                  value={organization}
                  onChange={setOrganization}
                  placeholder="VD: Guangxi Fresh Fruit Import Co., Ltd"
                  maxLength={160}
                />
              </FormGrid>
              <FormGrid>
                <SelectField
                  label="Ngôn ngữ hiển thị mặc định khi quét"
                  value={defaultLang}
                  onChange={(v) => setDefaultLang(v as "vi" | "en" | "zh")}
                  options={LANG_OPTIONS}
                />
                <NumberField
                  label="Thời hạn hiệu lực (giờ)"
                  value={durationHours}
                  onChange={setDurationHours}
                  min={1}
                  max={336}
                  step={12}
                  hint="48 giờ = 2 ngày làm việc; 168 giờ = 7 ngày"
                  error={passErrors.durationHours}
                />
              </FormGrid>
              <FormGrid>
                <TextField
                  label="Giới hạn mã vùng trồng PUC (để trống = toàn xã)"
                  value={allowedZoneCode}
                  onChange={setAllowedZoneCode}
                  placeholder="VD: VN-DLOR-0086"
                  maxLength={50}
                />
                <TextField
                  label="Ghi chú đón đoàn"
                  value={passNote}
                  onChange={setPassNote}
                  placeholder="VD: Khảo sát thực địa 4 thửa mẫu thôn Cư Né"
                  maxLength={240}
                />
              </FormGrid>
              <FormError message={createPass.error} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={createPass.pending}>
                  {createPass.pending ? "Đang cấp thẻ…" : "Cấp Thẻ Đoàn Thẩm định"}
                </button>
              </div>
            </form>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã thẻ đoàn</th>
                  <th>Đoàn công tác / Đối tác</th>
                  <th>Ngôn ngữ</th>
                  <th>Phạm vi PUC</th>
                  <th>Hết hạn</th>
                  <th>Lượt quét</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                <ListStatusRow
                  colSpan={8}
                  loading={passesApi.loading}
                  error={passesApi.error}
                  empty={passes.length === 0}
                  onRetry={passesApi.refresh}
                />
                {passes.map((p) => (
                  <tr key={p.id} style={{ fontVariantNumeric: "tabular-nums" }}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700, color: "#15803d" }}>
                      {p.code}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.delegationName}</div>
                      {p.organization && (
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                          {p.organization}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {p.defaultLang === "zh" ? "简体中文" : p.defaultLang === "en" ? "English" : "Tiếng Việt"}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {p.allowedZoneCode || "Toàn xã"}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {new Date(p.expiresAt).toLocaleString("vi-VN")}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{p.accessCount}</td>
                    <td>
                      <span className={`badge ${p.isValidNow ? "badge-green" : "badge-gray"}`}>
                        {p.status === "revoked"
                          ? "Đã thu hồi"
                          : p.isValidNow
                            ? "Đang hiệu lực"
                            : "Hết hạn"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => void handleCopyInvite(p)}
                        >
                          {copiedId === p.id
                            ? "Đã chép"
                            : createdSecret?.id === p.id || extractValidPassToken(p.passToken)
                              ? "Sao chép liên kết"
                              : "Sao chép mã"}
                        </button>
                        {canEdit && p.status === "active" && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setRevokingPass(p)}
                          >
                            Thu hồi
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {revokingPass && (
            <ConfirmDialog
              title="Thu hồi thẻ thẩm định"
              message={
                <>
                  Xác nhận thu hồi mã thẻ <strong>{revokingPass.code}</strong> của đoàn{" "}
                  <strong>{revokingPass.delegationName}</strong>? Liên kết tra cứu thực địa của thẻ này sẽ ngừng hiệu lực ngay.
                </>
              }
              confirmLabel="Thu hồi thẻ"
              danger
              pending={revokingBusy}
              onConfirm={() => void handleRevokePass(revokingPass)}
              onClose={() => {
                if (!revokingBusy) setRevokingPass(null);
              }}
            />
          )}
        </>
      ) : (
        <form onSubmit={(e) => void handleSaveEndorsement(e)}>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "#1e293b",
              marginBottom: 14,
            }}
          >
            Thông tin bảo chứng dưới đây được hiển thị công khai (3 ngôn ngữ Việt - Trung - Anh) trên mọi trang quét QR của Xã. Khi Cổng thông tin điện tử Tỉnh Đắk Lắk đăng bài viết chính thức về mô hình điểm của Xã, bạn có thể dán đường dẫn bài báo (https://...) vào ô Cổng thông tin Tỉnh để đối tác bấm đối chiếu trực tiếp.
          </div>

          <TextField
            label="Tiêu đề Chương trình Mô hình điểm cấp Xã"
            required
            value={programTitle}
            onChange={setProgramTitle}
            maxLength={240}
            error={endorseErrors.programTitle}
          />
          <TextField
            label="Đề án / Văn bản chỉ đạo"
            required
            value={directiveNo}
            onChange={setDirectiveNo}
            maxLength={240}
            error={endorseErrors.directiveNo}
          />
          <FormGrid>
            <TextField
              label="Cơ quan chủ trì cấp Xã"
              required
              value={communeAuthority}
              onChange={setCommuneAuthority}
              maxLength={200}
              error={endorseErrors.communeAuthority}
            />
            <TextField
              label="Cơ quan chỉ đạo cấp Tỉnh"
              required
              value={provincialAuthority}
              onChange={setProvincialAuthority}
              maxLength={200}
              error={endorseErrors.provincialAuthority}
            />
          </FormGrid>
          <FormGrid>
            <TextField
              label="Đường dẫn Cổng thông tin Tỉnh / Bài báo chính thức (https://)"
              required
              value={officialPortalUrl}
              onChange={setOfficialPortalUrl}
              placeholder="https://daklak.gov.vn/..."
              maxLength={240}
              error={endorseErrors.officialPortalUrl}
            />
            <TextField
              label="Tên miền định danh hiển thị"
              required
              value={officialDomain}
              onChange={setOfficialDomain}
              placeholder="daklak.gov.vn"
              maxLength={160}
              error={endorseErrors.officialDomain}
            />
          </FormGrid>
          <TextField
            label="Đơn vị giám sát thực địa & thẩm định hạn ngạch"
            required
            value={inspectionUnit}
            onChange={setInspectionUnit}
            maxLength={200}
            error={endorseErrors.inspectionUnit}
          />

          <FormError message={saveEndorsement.error} />

          {canEditEndorsement && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saveEndorsement.pending || endorseApi.loading}
              >
                {saveEndorsement.pending ? "Đang lưu cấu hình…" : "Lưu Bảo chứng Cổng Tỉnh & UBND Xã"}
              </button>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
