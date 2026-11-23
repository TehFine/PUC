import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import {
  assertHouseholdInScope,
  isStaffInCuneCoopScope,
  isStaffInParcelScope,
  villageScope,
} from "../../common/crud/village-scope";
import { badRequest, forbidden } from "../../common/errors/app.exception";
import { verifyPlotGpsProximity } from "../../common/geo/plot-proximity";
import { publicAttachmentUrlSql, publicAttachmentUrlsSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { assertPlotOwned } from "../../portal/common/portal-context";
import { UploadsService } from "../../uploads/uploads.service";

const SEALED_MINUTE_ERR =
  "Biên bản kiểm tra đã quá thời hạn 24 giờ niêm phong hoặc đã gắn với lô xuất khẩu, không thể chỉnh sửa hoặc xóa.";

interface MinuteSealRow {
  server_recorded_at: Date | string | null;
  household_id: number | null;
  plot_code: string | null;
}

@Injectable()
export class MinutesService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly uploads: UploadsService,
  ) {
    super(db, audit, {
      resource: "minutes",
      label: "Biên bản kiểm tra",
      table: "inspection_minutes",
      fields: `t.id, t.code, t.held_on, t.location, t.officer, t.result,
        t.plot_code, t.household_id, t.village_id, t.photo_id, t.photo_ids,
        ${publicAttachmentUrlSql("t.photo_id")} AS photo_url,
        ${publicAttachmentUrlsSql("t.photo_ids", "t.photo_id")} AS photo_urls,
        t.latitude::float8 AS latitude, t.longitude::float8 AS longitude,
        t.gps_verified, t.gps_distance_m::float8 AS gps_distance_m,
        t.server_recorded_at, t.entry_delay_hours::float8 AS entry_delay_hours,
        t.is_late_entry, t.late_reason, t.record_hash`,
      from: `inspection_minutes t`,
      orderBy: "t.held_on DESC, t.id DESC",
      search: ["t.code", "t.location", "t.officer", "t.plot_code"],
      filters: { result: "t.result", plotCode: "t.plot_code", villageId: "t.village_id" },
      scope: villageScope("t.village_id"),
    });
  }

  private async matchExactVillageInLocation(location: string): Promise<number | null> {
    const trimmed = location.normalize("NFC").trim();
    if (!trimmed) return null;
    const { rows } = await this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages ORDER BY id ASC");
    const candidates = new Set<string>([trimmed.toLowerCase()]);
    for (const part of trimmed.split(/[,;\-–—/|]+/)) {
      const p = part.trim().toLowerCase();
      if (p) candidates.add(p);
    }
    for (const v of rows) {
      const vName = v.name.normalize("NFC").trim().toLowerCase();
      if (vName && candidates.has(vName)) {
        return Number(v.id);
      }
    }
    return null;
  }

  /**
   * Niêm phong sổ cái biên bản kiểm tra: chỉ sửa hoặc xóa trong 24 giờ kể từ thời điểm máy chủ ghi nhận
   * và khi hộ, thửa liên quan chưa đóng góp vào lô đang vận chuyển, đã giao hoặc đã xuất khẩu lập sau biên bản.
   */
  private async assertMinuteEditable(row: MinuteSealRow) {
    if (row.server_recorded_at) {
      const recordedMs = new Date(row.server_recorded_at).getTime();
      if (Number.isFinite(recordedMs) && Date.now() - recordedMs > 24 * 3600_000) {
        throw badRequest(SEALED_MINUTE_ERR);
      }
    }
    const householdId = row.household_id !== null && row.household_id !== undefined ? Number(row.household_id) : null;
    const plotCode = typeof row.plot_code === "string" ? row.plot_code.trim() : "";
    if (!householdId && !plotCode) return;
    const recIso = row.server_recorded_at ? new Date(row.server_recorded_at).toISOString() : null;
    const locked = await this.db.query(
      `SELECT 1
       FROM harvest_contributions hc
       JOIN harvest_lots hl ON hl.id = hc.lot_id
       WHERE hl.status IN ('in_transit', 'delivered', 'exported')
         AND (
           ($1::bigint IS NOT NULL AND hc.household_id = $1
             AND ($2 = '' OR btrim(hc.plot_code) = '' OR upper(hc.plot_code) = upper($2)))
           OR ($1::bigint IS NULL AND $2 <> '' AND upper(hc.plot_code) = upper($2))
         )
         AND ($3::timestamptz IS NULL OR hl.created_at >= $3::timestamptz)
       LIMIT 1`,
      [householdId, plotCode, recIso],
    );
    if ((locked.rowCount ?? 0) > 0) {
      throw badRequest(SEALED_MINUTE_ERR);
    }
  }

  protected override async guardDelete(id: number, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền xóa biên bản ngoài phạm vi quản lý.");
    }
    const { rows } = await this.db.query<MinuteSealRow & { village_id: number | null; village_name: string | null }>(
      `SELECT m.server_recorded_at, m.household_id, m.plot_code, m.village_id, v.name AS village_name
       FROM inspection_minutes m
       LEFT JOIN villages v ON v.id = m.village_id
       WHERE m.id = $1`,
      [id],
    );
    if (rows[0]) {
      if (rows[0].household_id !== null) {
        await assertHouseholdInScope(this.db, { householdId: rows[0].household_id }, user);
      } else {
        const officerVillageName =
          user.role === "village_officer" && user.villageId
            ? (await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [user.villageId])).rows[0]?.name ?? null
            : null;
        if (
          !isStaffInParcelScope(
            user,
            {
              villageId: rows[0].village_id,
              villageName: rows[0].village_name,
              plotCode: rows[0].plot_code,
            },
            officerVillageName,
          )
        ) {
          throw forbidden("Biên bản này không thuộc phạm vi quản lý của bạn.");
        }
      }
      await this.assertMinuteEditable(rows[0]);
    }
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, true)) {
      throw forbidden("Bạn không có quyền lập hoặc cập nhật biên bản ngoài phạm vi quản lý.");
    }
    const out = { ...input };
    delete out.gpsVerified;
    delete out.gpsDistanceM;

    let existing:
      | {
          household_id: number | null;
          village_id: number | null;
          location: string | null;
          plot_code: string | null;
          latitude: number | null;
          longitude: number | null;
          server_recorded_at: Date | string | null;
        }
      | undefined;

    if (context.method === "PATCH" && context.id !== undefined) {
      const ex = await this.db.query<{
        household_id: number | null;
        village_id: number | null;
        location: string | null;
        plot_code: string | null;
        latitude: number | null;
        longitude: number | null;
        server_recorded_at: Date | string | null;
      }>(
        `SELECT household_id, village_id, location, plot_code,
                latitude::float8 AS latitude, longitude::float8 AS longitude, server_recorded_at
         FROM inspection_minutes
         WHERE id = $1`,
        [context.id],
      );
      existing = ex.rows[0];
      if (existing) {
        if (existing.household_id !== null) {
          await assertHouseholdInScope(this.db, { householdId: existing.household_id }, context.user);
        }
        await this.assertMinuteEditable(existing);
      }
    }

    const effHouseholdId =
      out.householdId !== undefined
        ? out.householdId !== null
          ? Number(out.householdId)
          : null
        : existing?.household_id !== null && existing?.household_id !== undefined
          ? Number(existing.household_id)
          : null;
    let effPlot =
      out.plotCode !== undefined
        ? typeof out.plotCode === "string" && out.plotCode.trim()
          ? out.plotCode.trim()
          : null
        : existing?.plot_code ?? null;
    if (out.plotCode !== undefined && !effPlot) {
      out.plotCode = null;
    }
    const effLocation =
      out.location !== undefined
        ? typeof out.location === "string"
          ? out.location.trim()
          : ""
        : existing?.location ?? "";

    const officerVillageName =
      context.user.role === "village_officer" && context.user.villageId
        ? (await this.db.query<{ name: string }>("SELECT name FROM villages WHERE id = $1", [context.user.villageId])).rows[0]?.name ?? null
        : null;

    let resolvedVillageId: number | null | undefined;

    if (effHouseholdId !== null) {
      await assertHouseholdInScope(this.db, { householdId: effHouseholdId }, context.user);
      const hhRes = await this.db.query<{ village_id: number | null }>(
        "SELECT village_id FROM households WHERE id = $1",
        [effHouseholdId],
      );
      const hh = hhRes.rows[0];
      if (!hh) {
        throw badRequest("Hộ nông dân đã chọn không tồn tại.");
      }
      const hhVillageId = hh.village_id !== null ? Number(hh.village_id) : null;
      if (context.user.role === "village_officer") {
        if (!context.user.villageId || hhVillageId !== Number(context.user.villageId)) {
          throw forbidden("Cán bộ thôn chỉ được lập hoặc cập nhật biên bản cho hộ thuộc thôn mình phụ trách.");
        }
      }
      if (effPlot) {
        const cleanPlot = await assertPlotOwned(this.db, effHouseholdId, effPlot);
        effPlot = cleanPlot;
        if (out.plotCode !== undefined || context.method === "POST") {
          out.plotCode = cleanPlot;
        }
      }
      resolvedVillageId = hhVillageId;
    } else if (effPlot) {
      let plotMeta: {
        village_id: number | null;
        village_name: string | null;
        zone_code: string | null;
        plot_code: string;
      } | null = null;
      try {
        const plotRes = await this.db.query<{
          village_id: number | null;
          village_name: string | null;
          zone_code: string | null;
          plot_code: string;
        }>(
          `SELECT COALESCE(h.village_id, v.id) AS village_id,
                  COALESCE(v_hh.name, p.village) AS village_name,
                  p.zone_code,
                  p.code AS plot_code
           FROM plots p
           LEFT JOIN households h ON h.id = p.household_id
           LEFT JOIN villages v_hh ON v_hh.id = h.village_id
           LEFT JOIN villages v ON lower(btrim(v.name)) = lower(btrim(p.village))
           WHERE upper(p.code) = upper(btrim($1))
           LIMIT 1`,
          [effPlot],
        );
        if (plotRes.rows[0]) {
          plotMeta = plotRes.rows[0];
        }
      } catch (error) {
        if (error instanceof Error && "status" in error) throw error;
        // Bảng plots có thể chưa được khởi tạo trong môi trường tối giản.
      }

      if (!plotMeta) {
        try {
          const sbRes = await this.db.query<{
            village_id: number | null;
            village_name: string | null;
            zone_code: string | null;
            plot_code: string;
          }>(
            `SELECT h.village_id,
                    COALESCE(v.name, pst.village_name) AS village_name,
                    pst.zone_code,
                    pst.plot_code
             FROM plot_signboard_tokens pst
             LEFT JOIN households h ON h.id = pst.household_id
             LEFT JOIN villages v ON v.id = h.village_id
             WHERE upper(btrim(pst.plot_code)) = upper(btrim($1))
             LIMIT 1`,
            [effPlot],
          );
          if (sbRes.rows[0]) {
            plotMeta = sbRes.rows[0];
          }
        } catch (error) {
          if (error instanceof Error && "status" in error) throw error;
        }
      }

      if (plotMeta) {
        const plotVillageId = plotMeta.village_id !== null ? Number(plotMeta.village_id) : null;
        if (
          !isStaffInParcelScope(
            context.user,
            {
              villageId: plotVillageId,
              villageName: plotMeta.village_name,
              zoneCode: plotMeta.zone_code,
              plotCode: plotMeta.plot_code,
            },
            officerVillageName,
          )
        ) {
          throw forbidden("Thửa đất không thuộc địa bàn quản lý của bạn.");
        }
        effPlot = plotMeta.plot_code;
        if (out.plotCode !== undefined || context.method === "POST") {
          out.plotCode = plotMeta.plot_code;
        }
        if (plotVillageId !== null) {
          resolvedVillageId = plotVillageId;
        }
      } else if (
        !isStaffInParcelScope(context.user, { plotCode: effPlot }, officerVillageName)
      ) {
        throw forbidden("Thửa đất không thuộc địa bàn quản lý của bạn.");
      }
    } else if (!isStaffInCuneCoopScope(context.user, false)) {
      throw forbidden("Bạn không có quyền lập biên bản ngoài phạm vi quản lý.");
    }

    if (context.user.role === "village_officer") {
      if (out.villageId !== undefined && out.villageId !== null && Number(out.villageId) !== Number(context.user.villageId)) {
        throw forbidden("Cán bộ thôn chỉ được lập biên bản trong phạm vi thôn mình phụ trách.");
      }
      out.villageId = context.user.villageId ?? null;
    } else if (resolvedVillageId !== undefined) {
      out.villageId = resolvedVillageId;
    } else if (out.villageId !== undefined) {
      if (out.villageId === null) {
        out.villageId = null;
      } else {
        const vCheck = await this.db.query("SELECT 1 FROM villages WHERE id = $1", [Number(out.villageId)]);
        if ((vCheck.rowCount ?? 0) === 0) {
          throw badRequest("Thôn đã chọn không tồn tại.");
        }
        out.villageId = Number(out.villageId);
      }
    } else if (
      context.method === "POST" ||
      out.location !== undefined ||
      out.householdId !== undefined ||
      out.plotCode !== undefined
    ) {
      out.villageId = await this.matchExactVillageInLocation(effLocation);
    }

    if (out.photoIds !== undefined || out.photoId !== undefined) {
      const explicitArray = Array.isArray(out.photoIds) ? (out.photoIds as number[]) : undefined;
      const single = out.photoId !== undefined && out.photoId !== null ? Number(out.photoId) : null;
      const rawIds = explicitArray !== undefined ? explicitArray : single !== null ? [single] : [];
      if (rawIds.length === 0) {
        out.photoId = null;
        out.photoIds = [];
      } else {
        const media = await this.uploads.assertUsableDetailed(
          rawIds,
          context.user,
          "inspection",
          effHouseholdId,
        );
        out.photoId = media.primaryId;
        out.photoIds = media.ids;
      }
    }

    if (
      context.method === "POST" ||
      out.latitude !== undefined ||
      out.longitude !== undefined ||
      out.plotCode !== undefined
    ) {
      const effLat = out.latitude !== undefined ? (out.latitude as number | null) : (existing?.latitude ?? null);
      const effLng = out.longitude !== undefined ? (out.longitude as number | null) : (existing?.longitude ?? null);

      if (effLat !== null && effLat !== undefined && effLng !== null && effLng !== undefined) {
        if (effPlot) {
          const check = await verifyPlotGpsProximity(this.db, effPlot, effLat, effLng);
          out.gpsVerified = check.verified;
          out.gpsDistanceM = check.distanceMeters;
        } else {
          out.gpsVerified = false;
          out.gpsDistanceM = null;
        }
      } else if (out.latitude !== undefined || out.longitude !== undefined) {
        out.gpsVerified = false;
        out.gpsDistanceM = null;
      }
    }

    return out;
  }
}
