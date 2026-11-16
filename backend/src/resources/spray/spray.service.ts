import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, villageScope } from "../../common/crud/village-scope";
import { badRequest } from "../../common/errors/app.exception";
import { attachmentUrlSql, attachmentUrlsSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { INSPECTION_ROLES } from "../../portal/common/admin-links";
import { assertPlotOwned } from "../../portal/common/portal-context";
import { UploadsService } from "../../uploads/uploads.service";

const SEALED_LEDGER_ERR =
  "Bản ghi sổ cái đã quá thời hạn 24 giờ niêm phong hoặc đã gắn với lô xuất khẩu, không thể chỉnh sửa/xóa.";

interface ExistingSprayRow {
  pesticide_id: number;
  server_recorded_at: Date | string | null;
  sprayed_on: string;
  household_id: number;
  plot_code: string | null;
  isolation_days: number | null;
}

@Injectable()
export class SprayService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
  ) {
    super(db, audit, {
      resource: "spray",
      label: "Nhật ký phun thuốc",
      table: "spray_records",
      fields: `t.id, t.sprayed_on, t.household_id, h.name AS household_name, t.plot_code,
      t.pesticide_id, p.name AS pesticide_name, t.source, t.dose, t.area_ha, t.isolation_days, t.mrl_status,
      t.note, t.photo_id, t.photo_ids,
      ${attachmentUrlSql("t.photo_id")} AS photo_url,
      ${attachmentUrlsSql("t.photo_ids", "t.photo_id")} AS photo_urls,
      t.server_recorded_at,
      to_char(t.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS declared_on,
      GREATEST(0, ((t.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - t.sprayed_on))::int AS late_declaration_days,
      t.entry_delay_hours::float8 AS entry_delay_hours,
      t.is_late_entry, t.late_reason, t.record_hash`,
      from: `spray_records t JOIN households h ON h.id = t.household_id
      JOIN pesticides p ON p.id = t.pesticide_id`,
      orderBy: "t.sprayed_on DESC, t.id DESC",
      search: ["h.name", "p.name", "t.source", "t.plot_code"],
      filters: { householdId: "t.household_id", pesticideId: "t.pesticide_id", mrlStatus: "t.mrl_status" },
      scope: villageScope("h.village_id"),
      virtual: ["_notifyAlert"],
    });
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

  private async assertSprayEditable(existing: {
    server_recorded_at: Date | string | null;
    household_id: number;
    plot_code: string | null;
  }) {
    if (existing.server_recorded_at) {
      const recordedMs = new Date(existing.server_recorded_at).getTime();
      if (Number.isFinite(recordedMs) && Date.now() - recordedMs > 24 * 3600_000) {
        throw badRequest(SEALED_LEDGER_ERR);
      }
    }
    await this.assertNotExportLocked(Number(existing.household_id), existing.plot_code, existing.server_recorded_at);
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    await assertHouseholdInScope(this.db, input, context.user);
    const out: Record<string, unknown> = { ...input };

    let existing: ExistingSprayRow | undefined;
    if (context.method === "PATCH" && context.id !== undefined) {
      const exRes = await this.db.query<ExistingSprayRow>(
        "SELECT pesticide_id, server_recorded_at, sprayed_on::text AS sprayed_on, household_id, plot_code, isolation_days FROM spray_records WHERE id = $1",
        [context.id],
      );
      existing = exRes.rows[0];
      if (!existing) {
        return out;
      }
      await this.assertSprayEditable(existing);
    }

    const effectiveHouseholdId = Number(out.householdId ?? existing?.household_id ?? 0);
    const rawPlotCode =
      out.plotCode !== undefined ? (typeof out.plotCode === "string" ? out.plotCode.trim() : null) : (existing?.plot_code ?? null);
    const effectivePlotCode = rawPlotCode && rawPlotCode.length > 0 ? rawPlotCode : null;

    if (effectiveHouseholdId > 0 && effectivePlotCode) {
      out.plotCode = await assertPlotOwned(this.db, effectiveHouseholdId, effectivePlotCode);
    } else if (out.plotCode !== undefined) {
      out.plotCode = null;
    }

    const rawPhotoIds = [
      ...(Array.isArray(out.photoIds) ? (out.photoIds as number[]) : []),
      ...(typeof out.photoId === "number" && out.photoId > 0 ? [out.photoId] : []),
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
    }

    if (
      context.method === "PATCH" &&
      existing &&
      (effectiveHouseholdId !== Number(existing.household_id) ||
        (out.plotCode ?? existing.plot_code ?? null) !== (existing.plot_code ?? null))
    ) {
      await this.assertNotExportLocked(effectiveHouseholdId, (out.plotCode as string | null | undefined) ?? existing.plot_code);
    }

    const effectivePesticideId =
      out.pesticideId !== undefined && out.pesticideId !== null ? out.pesticideId : existing?.pesticide_id;
    if (effectivePesticideId !== undefined && effectivePesticideId !== null) {
      const { rows } = await this.db.query<{ name: string; status: string; isolation_days: number | null }>(
        "SELECT name, status, isolation_days FROM pesticides WHERE id = $1",
        [effectivePesticideId],
      );
      if (rows.length === 0) throw badRequest("Thuốc BVTV không tồn tại.");
      const pesticide = rows[0];

      const requestedIsolation =
        input.isolationDays !== undefined
          ? Number(input.isolationDays ?? 0)
          : input.pesticideId === undefined
            ? Number(existing?.isolation_days ?? 0)
            : 0;
      out.isolationDays = Math.max(requestedIsolation, Number(pesticide.isolation_days ?? 0));
      out.mrlStatus = pesticide.status === "banned" || pesticide.status === "restricted" ? "exceeded" : "pass";

      const isHazardous = pesticide.status === "banned" || pesticide.status === "restricted";
      if (isHazardous) {
        let shouldNotify = context.method === "POST";
        if (context.method === "PATCH" && existing && Number(existing.pesticide_id) !== Number(effectivePesticideId)) {
          const prevPest = await this.db.query<{ status: string }>("SELECT status FROM pesticides WHERE id = $1", [
            existing.pesticide_id,
          ]);
          const prevStatus = prevPest.rows[0]?.status;
          shouldNotify = prevStatus !== "banned" && prevStatus !== "restricted";
        }
        if (shouldNotify) {
          out._notifyAlert = {
            pesticideName: pesticide.name,
            pesticideStatus: pesticide.status,
            householdId: effectiveHouseholdId,
            plotCode: (out.plotCode as string | null | undefined) ?? existing?.plot_code ?? null,
          };
        }
      }
    }
    return out;
  }

  protected override async afterWrite(id: number, input: Record<string, unknown>) {
    const alert = input._notifyAlert as
      | { pesticideName: string; pesticideStatus: string; householdId: number; plotCode: string | null }
      | undefined;
    if (!alert) return;

    const statusLabel = alert.pesticideStatus === "banned" ? "cấm sử dụng" : "hạn chế sử dụng";
    const plotText = alert.plotCode ? `, thửa ${alert.plotCode}` : "";
    await this.notifications.notifyRoles(INSPECTION_ROLES, {
      kind: "violation",
      title: `Cảnh báo ghi nhận thuốc BVTV ${statusLabel}: ${alert.pesticideName}`,
      body: `Bản ghi phun thuốc #${id} (hộ #${alert.householdId}${plotText}) sử dụng hoạt chất ${statusLabel}.`,
      link: "/admin?section=spray",
    });
  }

  protected override async guardDelete(id: number, _user: AuthUser) {
    const { rows } = await this.db.query<{
      server_recorded_at: Date | string | null;
      household_id: number;
      plot_code: string | null;
    }>("SELECT server_recorded_at, household_id, plot_code FROM spray_records WHERE id = $1", [id]);
    if (rows[0]) {
      await this.assertSprayEditable(rows[0]);
    }
  }
}
