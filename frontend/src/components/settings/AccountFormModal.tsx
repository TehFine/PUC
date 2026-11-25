"use client";

import { useEffect, useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import { str } from "@/components/admin/catalog/form-utils";
import { FormGrid, SelectField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { isCoopStaffRole } from "@/constants/roles";
import { useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { AccountRecord, AccountStatus } from "@/types/accounts";
import type { Role } from "@/types/api";
import type { VillageRecord } from "@/types/catalog";
import type { EnterpriseRecord, HouseholdOption } from "@/types/harvest";
import { ROLE_LABELS } from "./settings-data";

export default function AccountFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: AccountRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const villages = useApiList<VillageRecord>("villages");
  const households = useApiList<HouseholdOption>("households");
  const enterprises = useApiList<EnterpriseRecord>("enterprises");

  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(initial?.role ?? "farmer");
  const [status, setStatus] = useState<AccountStatus>(initial?.status ?? "active");
  const [villageId, setVillageId] = useState(str(initial?.villageId));
  const [householdId, setHouseholdId] = useState(str(initial?.householdId));
  const [enterpriseId, setEnterpriseId] = useState(str(initial?.enterpriseId));
  const [assignedCommune, setAssignedCommune] = useState(initial?.assignedCommune ?? "Xã Krông Búk");
  const [assignedRegion, setAssignedRegion] = useState(initial?.assignedRegion ?? "Tỉnh Đắk Lắk");
  const [coopCode, setCoopCode] = useState(initial?.coopCode ?? "HTX-CUNE");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const wipe = () => setPassword("");
    window.addEventListener("pagehide", wipe);
    return () => {
      window.removeEventListener("pagehide", wipe);
      wipe();
    };
  }, []);

  const { run, pending, error } = useMutation(async () => {
    const body: Record<string, unknown> = {
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim() ? email.trim().toLowerCase() : null,
      role,
      status,
      villageId: villageId ? Number(villageId) : null,
      householdId: role === "farmer" && householdId ? Number(householdId) : null,
      enterpriseId: role === "enterprise" && enterpriseId ? Number(enterpriseId) : null,
      assignedCommune:
        role === "village_officer" && assignedCommune.trim() ? assignedCommune.trim() : null,
      assignedRegion:
        role === "inspector" && assignedRegion.trim() ? assignedRegion.trim() : null,
      coopCode: coopCode.trim() ? coopCode.trim().toUpperCase() : "HTX-CUNE",
    };
    if (password.length > 0) {
      body.password = password;
    }
    return initial ? api.patch(`/accounts/${initial.id}`, body) : api.post("/accounts", body);
  });

  const submit = async () => {
    if (!fullName.trim() || !username.trim()) {
      return setLocalError("Vui lòng nhập họ tên và tên đăng nhập.");
    }
    if (!/^[0-9A-Za-z._-]{3,64}$/.test(username.trim())) {
      return setLocalError("Tên đăng nhập gồm 3 đến 64 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
    }
    if (!initial && password.length === 0) {
      return setLocalError("Vui lòng nhập mật khẩu khởi tạo cho tài khoản mới.");
    }
    if (password.length > 0) {
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return setLocalError("Mật khẩu cần tối thiểu 8 ký tự, bao gồm cả chữ cái và chữ số.");
      }
      if (new TextEncoder().encode(password.normalize("NFC")).length > 72) {
        return setLocalError("Mật khẩu tối đa 72 byte UTF-8.");
      }
    }
    if (role === "enterprise" && !enterpriseId) {
      return setLocalError(
        "Vui lòng chọn Doanh nghiệp hoặc Cơ sở đóng gói để gắn phạm vi xem chi tiết lô hàng.",
      );
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      setPassword("");
      toast.success(initial ? "Đã cập nhật tài khoản." : "Đã tạo tài khoản mới.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa tài khoản: ${initial.username}` : "Thêm tài khoản mới"}
      onClose={() => {
        setPassword("");
        onClose();
      }}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      width={620}
    >
      <FormGrid>
        <TextField label="Họ và Tên" required value={fullName} onChange={setFullName} maxLength={100} autoComplete="off" />
        <TextField
          label="Tên đăng nhập / SĐT"
          required
          value={username}
          onChange={setUsername}
          maxLength={64}
          autoComplete="off"
          placeholder="VD: 0912345678 hoặc cb_thon1"
        />
        <TextField
          label="Email Google liên kết (tùy chọn)"
          type="email"
          value={email}
          onChange={setEmail}
          maxLength={120}
          autoComplete="off"
          placeholder="VD: tenban@gmail.com"
        />
        <div>
          <TextField
            label={initial ? "Đặt lại mật khẩu (để trống nếu giữ nguyên)" : "Mật khẩu khởi tạo"}
            type={showPassword ? "text" : "password"}
            required={!initial}
            value={password}
            onChange={setPassword}
            placeholder="Ít nhất 8 ký tự gồm chữ và số"
            autoComplete="off"
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 5,
              fontSize: 12,
              color: "var(--text-secondary)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            <span>Hiện mật khẩu</span>
          </label>
        </div>
        <SelectField
          label="Vai trò"
          required
          value={role}
          onChange={(v) => setRole(v as Role)}
          options={(Object.entries(ROLE_LABELS) as [Role, string][]).map(([value, label]) => ({ value, label }))}
        />
        <SelectField
          label="Trạng thái"
          required
          value={status}
          onChange={(v) => setStatus(v as AccountStatus)}
          options={[
            { value: "active", label: "Hoạt động" },
            { value: "locked", label: "Khóa" },
          ]}
        />
        {role === "enterprise" && (
          <SelectField
            label="Doanh nghiệp / Cơ sở đóng gói thuộc quyền"
            required
            value={enterpriseId}
            onChange={setEnterpriseId}
            placeholder="— Chọn doanh nghiệp liên kết —"
            options={enterprises.rows.map((ent) => ({
              value: String(ent.id),
              label: `${ent.code} – ${ent.name}${ent.packhouseCode ? ` (PHC: ${ent.packhouseCode})` : ""}`,
            }))}
          />
        )}
        {role === "village_officer" && (
          <TextField
            label="Xã phụ trách (phạm vi truy xuất thửa nguồn)"
            value={assignedCommune}
            onChange={setAssignedCommune}
            maxLength={120}
            placeholder="VD: Xã Krông Búk"
          />
        )}
        {role === "inspector" && (
          <TextField
            label="Địa bàn quản lý được giao"
            value={assignedRegion}
            onChange={setAssignedRegion}
            maxLength={120}
            placeholder="VD: Tỉnh Đắk Lắk hoặc Xã Krông Búk"
          />
        )}
        {isCoopStaffRole(role) && (
          <TextField
            label="Mã HTX quản lý"
            value={coopCode}
            onChange={setCoopCode}
            maxLength={40}
            placeholder="VD: HTX-CUNE"
          />
        )}
        {(role === "village_officer" || role === "farmer") && (
          <SelectField
            label="Thôn phụ trách (tùy chọn)"
            value={villageId}
            onChange={setVillageId}
            placeholder="— Tất cả thôn trong xã —"
            options={villages.rows.map((v) => ({ value: String(v.id), label: v.name }))}
          />
        )}
        {role === "farmer" && (
          <SelectField
            label="Gắn với hộ nông dân (cho vai trò Nông dân)"
            value={householdId}
            onChange={setHouseholdId}
            placeholder="— Không gắn hộ —"
            options={households.rows.map((h) => ({
              value: String(h.id),
              label: `${h.code} – ${h.name}${h.villageName ? ` (${h.villageName})` : ""}`,
            }))}
          />
        )}
      </FormGrid>
    </FormModal>
  );
}
