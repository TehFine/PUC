"use client";

import { useState } from "react";
import FormModal from "@/components/admin/catalog/FormModal";
import { str } from "@/components/admin/catalog/form-utils";
import { FormGrid, SelectField, TextField } from "@/components/ui/form/fields";
import { toast } from "@/components/ui/Toast";
import { useApiList, useMutation } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import type { AccountRecord, AccountStatus } from "@/types/accounts";
import type { Role } from "@/types/api";
import type { VillageRecord } from "@/types/catalog";
import type { HouseholdOption } from "@/types/harvest";
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

  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(initial?.role ?? "farmer");
  const [status, setStatus] = useState<AccountStatus>(initial?.status ?? "active");
  const [villageId, setVillageId] = useState(str(initial?.villageId));
  const [householdId, setHouseholdId] = useState(str(initial?.householdId));
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error } = useMutation(async () => {
    const body: Record<string, unknown> = {
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim() ? email.trim().toLowerCase() : null,
      role,
      status,
      villageId: villageId ? Number(villageId) : null,
      householdId: householdId ? Number(householdId) : null,
    };
    if (password.trim()) {
      body.password = password.trim();
    }
    return initial ? api.patch(`/accounts/${initial.id}`, body) : api.post("/accounts", body);
  });

  const submit = async () => {
    if (!fullName.trim() || !username.trim()) {
      return setLocalError("Vui lòng nhập họ tên và tên đăng nhập.");
    }
    if (!/^[0-9A-Za-z._-]{3,64}$/.test(username.trim())) {
      return setLocalError("Tên đăng nhập gồm 3–64 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
    }
    if (!initial && !password.trim()) {
      return setLocalError("Vui lòng nhập mật khẩu khởi tạo cho tài khoản mới.");
    }
    if (password.trim()) {
      if (password.trim().length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return setLocalError("Mật khẩu cần tối thiểu 8 ký tự, bao gồm cả chữ cái và chữ số.");
      }
    }
    setLocalError(null);
    if ((await run()) !== undefined) {
      toast.success(initial ? "Đã cập nhật tài khoản." : "Đã tạo tài khoản mới.");
      onSaved();
    }
  };

  return (
    <FormModal
      title={initial ? `Sửa tài khoản: ${initial.username}` : "Thêm tài khoản mới"}
      onClose={onClose}
      onSubmit={() => void submit()}
      pending={pending}
      error={localError ?? error}
      width={620}
    >
      <FormGrid>
        <TextField label="Họ & Tên" required value={fullName} onChange={setFullName} maxLength={100} />
        <TextField
          label="Tên đăng nhập / SĐT"
          required
          value={username}
          onChange={setUsername}
          maxLength={64}
          placeholder="VD: 0912345678 hoặc cb_thon1"
        />
        <TextField
          label="Email Google liên kết (tùy chọn)"
          type="email"
          value={email}
          onChange={setEmail}
          maxLength={120}
          placeholder="VD: tenban@gmail.com"
        />
        <TextField
          label={initial ? "Đặt lại mật khẩu (để trống nếu giữ nguyên)" : "Mật khẩu khởi tạo"}
          type="password"
          required={!initial}
          value={password}
          onChange={setPassword}
          placeholder="Ít nhất 8 ký tự gồm chữ và số"
          autoComplete="new-password"
        />
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
        <SelectField
          label="Thôn phụ trách (tùy chọn)"
          value={villageId}
          onChange={setVillageId}
          placeholder="— Không gắn thôn —"
          options={villages.rows.map((v) => ({ value: String(v.id), label: v.name }))}
        />
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
      </FormGrid>
    </FormModal>
  );
}
