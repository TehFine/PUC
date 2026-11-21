import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, isStaffInCuneCoopScope, villageScope } from "../../common/crud/village-scope";
import { badRequest, forbidden } from "../../common/errors/app.exception";
import { attachmentUrlSql, attachmentUrlsSql, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { assertPlotOwned } from "../../portal/common/portal-context";
import { UploadsService } from "../../uploads/uploads.service";

const SEALED_LEDGER_ERR =
  "Bản ghi sổ cái đã quá thời hạn 24 giờ niêm phong hoặc đã gắn với lô xuất khẩu, không thể chỉnh sửa/xóa.";

const STAFF_ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  htx_head: "Trưởng HTX",
  htx_deputy: "Phó HTX",
  support_specialist: "Chuyên viên hỗ trợ hệ thống",
  htx_officer: "Cán bộ HTX",
  inspector: "Cán bộ kiểm tra",
  village_officer: "Cán bộ thôn",
  enterprise: "Doanh nghiệp",
  farmer: "Chủ hộ",
};

interface ExistingJournalRow {
  household_id: number;
  plot_code: string | null;
  activity: string;
  server_recorded_at: Date | string | null;
  photo_id: number | null;
  photo_ids: number[] | null;
  edit_count: number | null;
}

@Injectable()
export class JournalService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
  ) {
    super(db, audit, {
      resource: "journal",
      label: "Nhật ký canh tác",
      table: "journal_entries",
      fields: `t.id, t.entry_on, t.household_id, h.name AS household_name, t.plot_code,
      t.activity, t.detail, t.recorder, t.has_photo, t.photo_id, t.photo_ids,
      ${attachmentUrlSql("t.photo_id")} AS photo_url,
      ${attachmentUrlsSql("t.photo_ids", "t.photo_id")} AS photo_urls,
      t.latitude, t.longitude,
      t.server_recorded_at,
      to_char(t.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS declared_on,
      GREATEST(0, ((t.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - t.entry_on))::int AS late_declaration_days,
      t.entry_delay_hours::float8 AS entry_delay_hours,
      t.is_late_entry, t.late_reason, t.record_hash, t.gps_verified, t.gps_distance_m::float8 AS gps_distance_m,
      t.updated_by_user_id, t.updated_by_name, t.updated_by_role, t.updated_at, t.edit_count`,
      from: `journal_entries t JOIN households h ON h.id = t.household_id`,
      orderBy: "t.entry_on DESC, t.id DESC",
      search: ["h.name", "t.plot_code", "t.activity", "t.detail", "t.updated_by_name"],
      filters: { householdId: "t.household_id", activity: "t.activity" },
      scope: villageScope("h.village_id"),
      virtual: ["_notifyHouseholdEdit", "_notifyJournalChange"],
    });
  }

  protected override auditAction(method: "POST" | "PATCH"): string | undefined {
    return method === "PATCH" ? "Chỉnh sửa nhật ký" : undefined;
  }

  private async assertNotExportLocked(
    householdId: number,
    plotCode: string | null | undefined,
    recordedAt?: Date | string | null,
  ) {
    if (!householdId || householdId <= 0) return;
    const cleanPlot = typeof plotCode === "string" ? plotCode.trim() : "";
    const recIso = recordedAt ? new Date(recordedAt).toISOString() : null;
    const locked = await this.db.query(
      `SELECT 1
       FROM harvest_contributions hc
       JOIN harvest_lots hl ON hl.id = hc.lot_id
       WHERE hc.household_id = $1
         AND hl.status IN ('in_transit', 'delivered', 'exported')
         AND ($2 = '' OR hc.plot_code IS NULL OR btrim(hc.plot_code) = '' OR upper(hc.plot_code) = upper($2))
         AND ($3::timestamptz IS NULL OR hl.created_at >= $3::timestamptz)
       LIMIT 1`,
      [householdId, cleanPlot, recIso],
    );
    if ((locked.rowCount ?? 0) > 0) {
      throw badRequest(SEALED_LEDGER_ERR);
    }
  }

  private async assertJournalEditable(existing: ExistingJournalRow) {
    if (existing.server_recorded_at) {
      const recordedMs = new Date(existing.server_recorded_at).getTime();
      if (Number.isFinite(recordedMs) && Date.now() - recordedMs > 24 * 3600_000) {
        throw badRequest(SEALED_LEDGER_ERR);
      }
    }
    await this.assertNotExportLocked(Number(existing.household_id), existing.plot_code, existing.server_recorded_at);
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, true)) {
      throw forbidden("Bạn không có quyền thao tác nhật ký canh tác ngoài phạm vi quản lý.");
    }
    await assertHouseholdInScope(this.db, input, context.user);
    const out: Record<string, unknown> = { ...input };
    delete out.updatedByUserId;
    delete out.updatedByName;
    delete out.updatedByRole;
    delete out.updatedAt;
    delete out.editCount;

    if (typeof out.entryOn === "string" && out.entryOn > todayVn()) {
      throw badRequest("Ngày thực hiện không được ở tương lai. Chỉ ghi nhận nhật ký cho công việc đã thực hiện.");
    }

    let existing: ExistingJournalRow | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const exRes = await this.db.query<ExistingJournalRow>(
        "SELECT household_id, plot_code, activity, server_recorded_at, photo_id, photo_ids, edit_count FROM journal_entries WHERE id = $1",
        [context.id],
      );
      existing = exRes.rows[0];
      if (!existing) {
        delete out.recorder;
        delete out.hasPhoto;
        return out;
      }
      await assertHouseholdInScope(this.db, { householdId: existing.household_id }, context.user);
      await this.assertJournalEditable(existing);
      delete out.recorder;
      out.updatedByUserId = context.user.id;
      out.updatedByName = context.user.fullName;
      out.updatedByRole = context.user.role;
      out.updatedAt = new Date().toISOString();
      out.editCount = Number(existing.edit_count ?? 0) + 1;
    } else {
      out.recorder = context.user.fullName;
    }

    const effectiveHouseholdId = Number(out.householdId ?? existing?.household_id ?? 0);
    const effectivePlotCode =
      out.plotCode !== undefined ? (typeof out.plotCode === "string" ? out.plotCode : null) : (existing?.plot_code ?? null);
    if (effectiveHouseholdId > 0 && effectivePlotCode) {
      out.plotCode = await assertPlotOwned(this.db, effectiveHouseholdId, effectivePlotCode);
    }

    if (out.photoIds !== undefined || out.photoId !== undefined) {
      const explicitArray = Array.isArray(out.photoIds) ? (out.photoIds as number[]) : undefined;
      const single = typeof out.photoId === "number" && out.photoId > 0 ? out.photoId : null;
      const rawPhotoIds = [
        ...(explicitArray ?? []),
        ...(single !== null ? [single] : []),
      ];
      if (rawPhotoIds.length > 0) {
        const media = await this.uploads.assertUsableDetailed(
          rawPhotoIds,
          context.user,
          "journal",
          effectiveHouseholdId > 0 ? effectiveHouseholdId : null,
        );
        out.photoId = media.primaryId;
        out.photoIds = media.ids;
        out.hasPhoto = Boolean(media.primaryId || media.ids.length > 0);
      } else {
        out.photoId = null;
        out.photoIds = [];
        out.hasPhoto = false;
      }
    } else if (context.method === "POST") {
      out.hasPhoto = false;
    } else {
      out.hasPhoto = Boolean(
        existing?.photo_id || (Array.isArray(existing?.photo_ids) && existing.photo_ids.length > 0),
      );
    }

    if (
      context.method === "PATCH" &&
      existing &&
      (effectiveHouseholdId !== Number(existing.household_id) ||
        (out.plotCode ?? existing.plot_code ?? null) !== (existing.plot_code ?? null))
    ) {
      await this.assertNotExportLocked(effectiveHouseholdId, (out.plotCode as string | null | undefined) ?? existing.plot_code);
    }

    if (effectiveHouseholdId > 0) {
      const activityName =
        typeof out.activity === "string" && out.activity.trim()
          ? out.activity.trim()
          : (existing?.activity ?? "Chăm sóc vườn");
      const resolvedPlotCode = (typeof out.plotCode === "string" ? out.plotCode : existing?.plot_code) ?? null;

      if (context.method === "PATCH" && existing && context.user.role !== "farmer") {
        out._notifyHouseholdEdit = {
          householdId: effectiveHouseholdId,
          activity: activityName,
          plotCode: resolvedPlotCode,
          actorName: context.user.fullName,
          actorRole: context.user.role,
        };
      }

      out._notifyJournalChange = {
        method: context.method,
        householdId: effectiveHouseholdId,
        activity: activityName,
        plotCode: resolvedPlotCode,
        actorId: context.user.id,
        actorName: context.user.fullName,
        actorRole: context.user.role,
      };
    }

    return out;
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    const editInfo = input._notifyHouseholdEdit as
      | {
          householdId: number;
          activity: string;
          plotCode: string | null;
          actorName: string;
          actorRole: string;
        }
      | undefined;
    if (editInfo) {
      const roleLabel = STAFF_ROLE_LABELS[editInfo.actorRole] ?? "Cán bộ";
      const plotText = editInfo.plotCode ? ` tại thửa ${editInfo.plotCode}` : "";
      await this.notifications.notifyHousehold(editInfo.householdId, {
        kind: "protocol",
        title: "Nhật ký canh tác đã được chỉnh sửa",
        body: `Bản ghi "${editInfo.activity}"${plotText} đã được ${roleLabel} ${editInfo.actorName} cập nhật.`,
        link: "/portal?tab=diary",
      });
    }

    const changeInfo = input._notifyJournalChange as
      | {
          method: "POST" | "PATCH";
          householdId: number;
          activity: string;
          plotCode: string | null;
          actorId: number;
          actorName: string;
          actorRole: string;
        }
      | undefined;
    if (!changeInfo) return;

    const hhRes = await this.db.query<{ name: string }>(
      "SELECT name FROM households WHERE id = $1",
      [changeInfo.householdId],
    );
    const rawName = (hhRes.rows[0]?.name || `#${changeInfo.householdId}`).trim();
    const farmerName = rawName.replace(/^hộ\s+/i, "").trim() || rawName;
    const roleLabel = STAFF_ROLE_LABELS[changeInfo.actorRole] ?? "Cán bộ";
    const plotText = changeInfo.plotCode ? ` tại thửa ${changeInfo.plotCode}` : "";
    const shortPlot = changeInfo.plotCode ? `, thửa ${changeInfo.plotCode}` : "";

    if (changeInfo.method === "POST" && changeInfo.actorRole !== "farmer") {
      await this.notifications.notifyHousehold(changeInfo.householdId, {
        kind: "protocol",
        title: "Cán bộ vừa ghi nhận nhật ký canh tác mới",
        body: `${roleLabel} ${changeInfo.actorName} đã ghi nhận "${changeInfo.activity}"${plotText} cho hộ của bạn.`,
        link: "/portal?tab=diary",
      });
    }

    await this.notifications.notifyOversightForHousehold(
      changeInfo.householdId,
      {
        kind: "protocol",
        title: `${farmerName} mới cập nhật nhật ký canh tác`,
        body:
          changeInfo.actorRole === "farmer"
            ? `${changeInfo.activity}${shortPlot}`
            : `${changeInfo.activity}${shortPlot} (${roleLabel} ${changeInfo.actorName})`,
        link: "/admin?section=journal",
      },
      { excludeUserId: changeInfo.actorId },
    );
  }

  protected override async guardDelete(id: number, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền xóa nhật ký canh tác ngoài phạm vi quản lý.");
    }
    const { rows } = await this.db.query<ExistingJournalRow>(
      "SELECT household_id, plot_code, activity, server_recorded_at, photo_id, photo_ids, edit_count FROM journal_entries WHERE id = $1",
      [id],
    );
    if (rows[0]) {
      await assertHouseholdInScope(this.db, { householdId: rows[0].household_id }, user);
      await this.assertJournalEditable(rows[0]);
    }
  }
}
