import { Injectable } from "@nestjs/common";
import { AuditService, redactAuditDetailText, redactAuditObjectLabel } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { BaseCrudService } from "../../common/crud/base-crud.service";
import type { ListQueryDto } from "../../common/crud/list-query.dto";
import {
  CUNE_ADMIN_LOCATION,
  EAKHAL_ADMIN_LOCATION,
  EAKHAL_VILLAGE_SQL_REGEX,
  isStaffInCuneCoopScope,
  matchesJurisdiction,
} from "../../common/crud/village-scope";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class AuditLogService extends BaseCrudService {
  constructor(db: DatabaseService, audit: AuditService) {
    super(db, audit, {
      resource: "audit-log",
      label: "Nhật ký",
      table: "audit_logs",
      fields: `t.id, t.occurred_at, t.user_id, t.user_name, t.ip, t.action, t.object, t.detail`,
      from: `audit_logs t`,
      orderBy: "t.occurred_at DESC, t.id DESC",
      search: ["t.user_name", "t.action", "t.object", "t.detail"],
      filters: { action: "t.action", userId: "t.user_id" },
      scope: (user, params) => {
        if (user.role === "admin") return null;
        if (!isStaffInCuneCoopScope(user, true)) return "1 = 0";
        const clauses: string[] = [];
        params.push((user.coopCode || "HTX-CUNE").trim().toUpperCase());
        clauses.push(
          `(t.user_id IS NULL OR EXISTS (SELECT 1 FROM users u_sc WHERE u_sc.id = t.user_id AND UPPER(COALESCE(u_sc.coop_code, 'HTX-CUNE')) = $${params.length}))`,
        );
        const commune = user.assignedCommune?.trim() || "";
        if (commune) {
          const inCune = matchesJurisdiction(commune, [CUNE_ADMIN_LOCATION]);
          const inEaKhal = matchesJurisdiction(commune, [EAKHAL_ADMIN_LOCATION]);
          if (!inCune && !inEaKhal) return "1 = 0";
          if (inEaKhal && !inCune) {
            clauses.push(
              `EXISTS (
                 SELECT 1 FROM users u_cm
                 LEFT JOIN villages v_cm ON v_cm.id = u_cm.village_id
                 WHERE u_cm.id = t.user_id
                   AND (v_cm.name ~* '${EAKHAL_VILLAGE_SQL_REGEX}' OR COALESCE(u_cm.assigned_commune, '') ~* 'ea\\s*kh[aă]l')
               )`,
            );
          } else if (inCune && !inEaKhal) {
            clauses.push(
              `(t.user_id IS NULL OR EXISTS (
                 SELECT 1 FROM users u_cm
                 LEFT JOIN villages v_cm ON v_cm.id = u_cm.village_id
                 WHERE u_cm.id = t.user_id
                   AND (v_cm.name IS NULL OR v_cm.name !~* '${EAKHAL_VILLAGE_SQL_REGEX}')
                   AND COALESCE(u_cm.assigned_commune, '') !~* 'ea\\s*kh[aă]l'
               ))`,
            );
          }
        }
        return clauses.join(" AND ");
      },
    });
  }

  override async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const res = await super.list(user, query);
    return {
      ...res,
      data: res.data.map((row) => ({
        ...row,
        object: redactAuditObjectLabel(typeof row.object === "string" ? row.object : ""),
        detail: redactAuditDetailText(typeof row.detail === "string" ? row.detail : null),
      })),
    };
  }

  override async findOne(id: number, user: AuthUser) {
    const row = await super.findOne(id, user);
    return {
      ...row,
      object: redactAuditObjectLabel(typeof row.object === "string" ? row.object : ""),
      detail: redactAuditDetailText(typeof row.detail === "string" ? row.detail : null),
    };
  }
}
