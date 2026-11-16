import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { villageScope } from "../../common/crud/village-scope";
import { badRequest, forbidden } from "../../common/errors/app.exception";
import { verifyPlotGpsProximity } from "../../common/geo/plot-proximity";
import { publicAttachmentUrlSql, publicAttachmentUrlsSql } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { UploadsService } from "../../uploads/uploads.service";

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

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
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
      }>(
        `SELECT household_id, village_id, location, plot_code,
                latitude::float8 AS latitude, longitude::float8 AS longitude
         FROM inspection_minutes
         WHERE id = $1`,
        [context.id],
      );
      existing = ex.rows[0];
    }

    const effHouseholdId =
      out.householdId !== undefined
        ? out.householdId !== null
          ? Number(out.householdId)
          : null
        : existing?.household_id !== null && existing?.household_id !== undefined
          ? Number(existing.household_id)
          : null;
    const effPlot =
      out.plotCode !== undefined
        ? typeof out.plotCode === "string" && out.plotCode.trim()
          ? out.plotCode.trim()
          : null
        : existing?.plot_code ?? null;
    const effLocation =
      out.location !== undefined
        ? typeof out.location === "string"
          ? out.location.trim()
          : ""
        : existing?.location ?? "";

    let resolvedVillageId: number | null | undefined;

    if (effHouseholdId !== null) {
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
      resolvedVillageId = hhVillageId;
    } else if (effPlot) {
      try {
        const plotRes = await this.db.query<{ village_id: number | null }>(
          `SELECT COALESCE(h.village_id, v.id) AS village_id
           FROM plots p
           LEFT JOIN households h ON h.id = p.household_id
           LEFT JOIN villages v ON lower(btrim(v.name)) = lower(btrim(p.village))
           WHERE COALESCE(to_jsonb(p)->>'code', to_jsonb(p)->>'plot_code') = $1
           LIMIT 1`,
          [effPlot],
        );
        const plotRow = plotRes.rows[0];
        if (plotRow) {
          const plotVillageId = plotRow.village_id !== null ? Number(plotRow.village_id) : null;
          if (context.user.role === "village_officer") {
            if (!context.user.villageId || (plotVillageId !== null && plotVillageId !== Number(context.user.villageId))) {
              throw forbidden("Cán bộ thôn chỉ được lập hoặc cập nhật biên bản cho thửa đất thuộc thôn mình phụ trách.");
            }
          }
          if (plotVillageId !== null) {
            resolvedVillageId = plotVillageId;
          }
        }
      } catch (error) {
        if (error instanceof Error && "status" in error) throw error;
        // Bảng plots có thể chưa được khởi tạo trong môi trường tối giản.
      }
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
