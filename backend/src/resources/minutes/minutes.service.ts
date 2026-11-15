import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { verifyPlotGpsProximity } from "../../common/geo/plot-proximity";
import { publicAttachmentUrlSql } from "../../common/sql/rows";
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
        t.plot_code, t.household_id, t.photo_id, ${publicAttachmentUrlSql("t.photo_id")} AS photo_url,
        t.latitude::float8 AS latitude, t.longitude::float8 AS longitude,
        t.gps_verified, t.gps_distance_m::float8 AS gps_distance_m,
        t.server_recorded_at, t.entry_delay_hours::float8 AS entry_delay_hours,
        t.is_late_entry, t.late_reason, t.record_hash`,
      from: `inspection_minutes t`,
      orderBy: "t.held_on DESC, t.id DESC",
      search: ["t.code", "t.location", "t.officer", "t.plot_code"],
      filters: { result: "t.result", plotCode: "t.plot_code" },
      scope: (user, params) => {
        if (user.role !== "village_officer") return null;
        params.push(user.villageId ?? -1);
        return `EXISTS (SELECT 1 FROM villages v WHERE v.id = $${params.length} AND t.location ILIKE '%' || v.name || '%')`;
      },
    });
  }

  protected override async prepare(input: Record<string, unknown>, context: WriteContext) {
    const out = { ...input };
    if (out.photoId !== undefined) {
      if (out.photoId === null) {
        out.photoId = null;
      } else {
        const [validId] = await this.uploads.assertUsable(
          [Number(out.photoId)],
          context.user,
          "inspection",
          out.householdId ? Number(out.householdId) : null,
        );
        out.photoId = validId ?? null;
      }
    }

    if (out.latitude !== undefined || out.longitude !== undefined || out.plotCode !== undefined) {
      let existing: { plot_code: string | null; latitude: number | null; longitude: number | null } | undefined;
      if (context.method === "PATCH" && context.id !== undefined) {
        const ex = await this.db.query<{ plot_code: string | null; latitude: number | null; longitude: number | null }>(
          "SELECT plot_code, latitude::float8 AS latitude, longitude::float8 AS longitude FROM inspection_minutes WHERE id = $1",
          [context.id],
        );
        existing = ex.rows[0];
      }
      const effPlot =
        out.plotCode !== undefined ? (typeof out.plotCode === "string" ? out.plotCode : null) : (existing?.plot_code ?? null);
      const effLat = out.latitude !== undefined ? (out.latitude as number | null) : (existing?.latitude ?? null);
      const effLng = out.longitude !== undefined ? (out.longitude as number | null) : (existing?.longitude ?? null);

      if (effLat !== null && effLng !== null) {
        if (effPlot) {
          const check = await verifyPlotGpsProximity(this.db, effPlot, effLat, effLng);
          out.gpsVerified = check.verified;
          out.gpsDistanceM = check.distanceMeters;
        } else {
          out.gpsVerified = true;
          out.gpsDistanceM = 0;
        }
      }
    }

    return out;
  }
}
