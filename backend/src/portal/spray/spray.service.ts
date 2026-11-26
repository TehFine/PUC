import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, forbidden, notFound } from "../../common/errors/app.exception";
import { attachmentUrlSql, attachmentUrlsSql, camelRow, camelRows, nowClockVn, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { UploadsService } from "../../uploads/uploads.service";
import { ADMIN_LINKS } from "../common/admin-links";
import { evaluateFieldEvidence } from "../common/field-evidence";
import { assertPlotOwned, type ClientContext, householdIdOf } from "../common/portal-context";
import type { CreatePortalSprayDto } from "./spray.dto";

function diffCalendarDays(laterIso: string, earlierIso: string): number {
  const a = new Date(`${laterIso}T00:00:00Z`).getTime();
  const b = new Date(`${earlierIso}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

function shortFarmerName(raw: string | null | undefined, fallback: string): string {
  const base = (raw || fallback || "").trim();
  return base.replace(/^hộ\s+/i, "").trim() || base;
}

/** Điều kiện khớp thửa giữa bản ghi phun `s` và bản ghi nghiệp vụ khác (thửa rỗng ở một trong hai bên coi như cả hộ). */
const plotMatchSql = (column: string) =>
  `(s.plot_code IS NULL OR btrim(s.plot_code) = '' OR ${column} IS NULL OR btrim(${column}) = '' OR upper(btrim(${column})) = upper(btrim(s.plot_code)))`;

/**
 * Bản ghi phun thuốc hộ được tự xóa (sổ cái niêm phong 24 giờ):
 * - Do chính hộ nhập trên cổng hộ dân (không xóa được bản ghi do cán bộ ghi nhận).
 * - Trong vòng 24 giờ sau khi nhập, không dùng thuốc cấm hoặc hạn chế (cần lưu vết giám sát).
 * - Chưa có lô thu hoạch, kích hoạt tem hay khai báo thu hái nào của hộ, thửa đó kể từ ngày phun
 *   (chặn xóa dấu vết cách ly PHI ngay trước khi kích hoạt tem hoặc xuất lô).
 */
const SPRAY_DELETABLE_SQL = `s.recorded_by_role = 'farmer'
  AND s.created_at > now() - interval '24 hours'
  AND p.status NOT IN ('banned', 'restricted')
  AND NOT EXISTS (
    SELECT 1 FROM harvest_contributions hc
    JOIN harvest_lots hl ON hl.id = hc.lot_id
    WHERE hc.household_id = s.household_id
      AND hl.status <> 'revoked'
      AND ${plotMatchSql("hc.plot_code")}
      AND (hl.harvested_on >= s.sprayed_on OR hl.created_at >= s.created_at)
  )
  AND NOT EXISTS (
    SELECT 1 FROM farmer_stamps fs
    WHERE fs.household_id = s.household_id
      AND fs.status = 'activated'
      AND ${plotMatchSql("fs.plot_code")}
      AND COALESCE(fs.harvest_date, (fs.activated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, s.sprayed_on) >= s.sprayed_on
  )
  AND NOT EXISTS (
    SELECT 1 FROM harvest_declarations hd
    WHERE hd.household_id = s.household_id
      AND hd.status <> 'rejected'
      AND ${plotMatchSql("hd.plot_code")}
      AND (hd.harvested_on >= s.sprayed_on OR hd.created_at >= s.created_at)
  )`;

/** Thuốc hạn chế hoặc cấm luôn ghi nhận vượt ngưỡng MRL, thống nhất với SprayService phía quản trị. */
export function mrlStatusForPesticide(status: string | null | undefined): "pass" | "exceeded" {
  return status === "banned" || status === "restricted" ? "exceeded" : "pass";
}

const SPRAY_COLUMNS = `s.id, s.sprayed_on, s.plot_code, s.pesticide_id, p.name AS pesticide, p.status AS pesticide_status, s.source,
  s.dose, s.area_ha, s.isolation_days, (s.sprayed_on + s.isolation_days) AS isolation_ends_on, s.mrl_status, s.note,
  ${attachmentUrlSql("s.photo_id")} AS photo_url,
  ${attachmentUrlsSql("s.photo_ids", "s.photo_id")} AS photo_urls,
  s.latitude, s.longitude, s.gps_accuracy_m::float8 AS gps_accuracy_m, s.gps_verified, s.gps_distance_m::float8 AS gps_distance_m,
  s.capture_source, s.client_captured_at, s.offline_queued, s.signboard_qr_verified, s.trust_level, s.trust_flags,
  s.created_at,
  s.server_recorded_at,
  to_char(s.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS declared_on,
  GREATEST(0, ((s.server_recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - s.sprayed_on))::int AS late_declaration_days,
  s.entry_delay_hours::float8 AS entry_delay_hours, s.is_late_entry, s.late_reason, s.record_hash,
  s.verification_status, s.verified_at,
  s.recorded_by_role, s.updated_by_name, s.updated_by_role, s.updated_at, s.edit_count,
  (${SPRAY_DELETABLE_SQL}) AS can_delete`;

/** Nhật ký phun thuốc của hộ. */
@Injectable()
export class SprayService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
  ) { }

  async list(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT ${SPRAY_COLUMNS}
       FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id
       WHERE s.household_id = $1 ORDER BY s.sprayed_on DESC, s.id DESC LIMIT 200`,
      [householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async create(dto: CreatePortalSprayDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const today = todayVn();
    const sprayedOn = dto.sprayedOn ?? today;
    if (sprayedOn > today) {
      throw badRequest("Ngày phun thuốc không được ở tương lai. Chỉ được ghi nhận sau khi đã phun thực tế tại vườn.");
    }
    const backdatedDays = diffCalendarDays(today, sprayedOn);
    if (backdatedDays > 7) {
      throw badRequest(
        "Không được ghi lùi nhật ký phun thuốc quá 7 ngày để đảm bảo tính toàn vẹn thời gian cách ly (PHI). Vui lòng liên hệ cán bộ kỹ thuật xã để ghi nhận bổ sung.",
      );
    }
    if (backdatedDays > 2 && (!dto.lateReason || dto.lateReason.trim().length < 5)) {
      throw badRequest("Bản ghi phun thuốc khai báo chậm trên 2 ngày bắt buộc phải nêu rõ lý do ghi bổ sung.");
    }
    const plotCode = dto.plotCode ? await assertPlotOwned(this.db, householdId, dto.plotCode) : null;

    const pesticide = (
      await this.db.query<{ name: string; status: string; isolation_days: number | null }>(
        "SELECT name, status, isolation_days FROM pesticides WHERE id = $1",
        [dto.pesticideId],
      )
    ).rows[0];
    if (!pesticide) throw badRequest("Không tìm thấy loại thuốc đã chọn.");

    // Thuốc cấm hoặc hạn chế luôn bị ghi nhận là không đạt để cán bộ kiểm tra theo dõi và cảnh báo ngay.
    const mrlStatus = mrlStatusForPesticide(pesticide.status);
    const rawPhotoIds = [
      ...(dto.photoIds ?? []),
      ...(dto.photoId ? [dto.photoId] : []),
    ];
    const media =
      rawPhotoIds.length > 0
        ? await this.uploads.assertUsableDetailed(rawPhotoIds, user, "journal", householdId)
        : { ids: [] as number[], primaryId: null };

    if (media.ids.length > 0) {
      const attMetaRes = await this.db.query<{ earliest_upload_on: string | null }>(
        `SELECT MIN(to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')) AS earliest_upload_on
           FROM attachments
          WHERE id = ANY($1::bigint[])`,
        [media.ids],
      );
      const earliestUploadOn = attMetaRes.rows[0]?.earliest_upload_on;
      if (earliestUploadOn && sprayedOn > earliestUploadOn) {
        throw badRequest(
          "Ảnh hiện trường đã được chụp và tải lên trước ngày phun đã chọn, không thể dùng để khai trước công việc chưa thực hiện.",
        );
      }
      const reusedSprayPhotoRes = await this.db.query(
        `SELECT 1
           FROM spray_records
          WHERE household_id = $1
            AND (photo_id = ANY($2::bigint[]) OR photo_ids && $2::bigint[])
          LIMIT 1`,
        [householdId, media.ids],
      );
      if ((reusedSprayPhotoRes.rowCount ?? 0) > 0) {
        throw badRequest(
          "Ảnh hiện trường này đã được sử dụng cho một bản ghi phun thuốc khác. Vui lòng chụp ảnh thực tế mới tại vườn.",
        );
      }
    }

    const evidence = await evaluateFieldEvidence(this.db, user, {
      plotCode,
      activityDateIso: sprayedOn,
      todayVnIso: today,
      latitude: dto.latitude,
      longitude: dto.longitude,
      gpsAccuracyM: dto.gpsAccuracyM,
      captureSource: dto.captureSource ?? "camera",
      clientCapturedAt: dto.clientCapturedAt,
      timeAnchorToken: dto.timeAnchorToken,
      monotonicElapsedMs: dto.monotonicElapsedMs,
      offlineQueued: dto.offlineQueued,
      signboardQrToken: dto.signboardQrToken,
    });

    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO spray_records
         (sprayed_on, household_id, pesticide_id, source, dose, area_ha, isolation_days, mrl_status, plot_code, note, photo_id, photo_ids,
          latitude, longitude, gps_accuracy_m, gps_verified, gps_distance_m, capture_source,
          client_captured_at, offline_queued, signboard_qr_verified, trust_level, trust_flags,
          late_reason, recorded_by_role, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::bigint[],
               $13, $14, $15, $16, $17, $18, $19::timestamptz, $20, $21, $22, $23::text[],
               $24, 'farmer', $25) RETURNING id`,
      [
        sprayedOn,
        householdId,
        dto.pesticideId,
        dto.source ?? null,
        dto.dose,
        dto.areaHa,
        pesticide.isolation_days ?? 0,
        mrlStatus,
        plotCode,
        dto.note?.trim() || null,
        media.primaryId,
        media.ids,
        dto.latitude ?? null,
        dto.longitude ?? null,
        evidence.gpsAccuracyM,
        evidence.gpsCheck.verified,
        evidence.gpsCheck.distanceMeters,
        evidence.captureSource,
        evidence.clientCapturedAt,
        evidence.offlineQueued,
        evidence.signboardQrVerified,
        evidence.trustLevel,
        evidence.trustFlags,
        dto.lateReason ?? null,
        user.id,
      ],
    );

    const id = rows[0].id;
    if (backdatedDays >= 1) {
      const [sy, sm, sd] = sprayedOn.split("-");
      const [ty, tm, td] = today.split("-");
      await this.notifications.notifyHousehold(householdId, {
        kind: "schedule",
        title: `Ghi nhận khai báo phun thuốc chậm ${backdatedDays} ngày`,
        body: `${plotCode ? `Thửa ${plotCode}: ` : ""}Đã lưu đồng thời ngày phun ${sd}/${sm}/${sy} và ngày khai báo ${td}/${tm}/${ty}. Thời gian cách ly PHI vẫn tính chính xác từ ngày phun ${sd}/${sm}/${sy}. Lần tới vui lòng cập nhật ngay trong ngày phun.`,
        link: "/portal?tab=diary",
      });
    }

    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Hộ ghi nhật ký phun thuốc",
        object: `Nhật ký phun thuốc #${id}`,
        detail: `${pesticide.name}${plotCode ? ` - ${plotCode}` : ""} (phun ${sprayedOn}, khai báo ${today}, chậm ${Math.max(0, backdatedDays)} ngày)`,
      },
    );

    const hhRes = await this.db.query<{ name: string }>(
      "SELECT name FROM households WHERE id = $1",
      [householdId],
    );
    const farmerName = shortFarmerName(hhRes.rows[0]?.name, user.fullName);
    const [syFmt, smFmt, sdFmt] = sprayedOn.split("-");
    const clock = nowClockVn();
    const sprayTimeNote =
      sprayedOn === today
        ? `${sdFmt}/${smFmt}/${syFmt} ${clock.hm}`
        : `phun ${sdFmt}/${smFmt}/${syFmt}, cập nhật ${clock.dmyHm}`;

    if (pesticide.status === "banned" || pesticide.status === "restricted") {
      await this.notifications.notifyOversightForHousehold(householdId, {
        kind: "violation",
        title:
          pesticide.status === "banned"
            ? `Cảnh báo: ${farmerName} khai báo thuốc cấm`
            : `Lưu ý: ${farmerName} phun thuốc hạn chế`,
        body: `${pesticide.name}${plotCode ? `, thửa ${plotCode}` : ""}, liều ${dto.dose} (${sprayTimeNote})`,
        link: `${ADMIN_LINKS.journal}&sub=spray`,
      });
    } else {
      await this.notifications.notifyOversightForHousehold(householdId, {
        kind: "protocol",
        title: `${farmerName} mới cập nhật nhật ký canh tác`,
        body: `Phun thuốc ${pesticide.name}${plotCode ? `, thửa ${plotCode}` : ""} (${sprayTimeNote})`,
        link: `${ADMIN_LINKS.journal}&sub=spray`,
      });
    }

    const created = await this.db.query(
      `SELECT ${SPRAY_COLUMNS} FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id WHERE s.id = $1`,
      [id],
    );
    return camelRow(created.rows[0]);
  }

  /**
   * Cho phép hộ xóa bản ghi phun thuốc tự nhập nhầm trong vòng 24 giờ. Không xóa được bản ghi do cán bộ ghi nhận,
   * bản ghi thuốc cấm hoặc hạn chế, hay bản ghi đã có thu hoạch, kích hoạt tem, lô hàng phát sinh sau ngày phun.
   */
  async remove(id: number, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const deleted = await this.db.withActorTransaction(user, (client) =>
      client.query<{ id: number; pesticide: string; plot_code: string | null }>(
        `DELETE FROM spray_records s
         USING pesticides p
         WHERE s.id = $1
           AND s.household_id = $2
           AND p.id = s.pesticide_id
           AND ${SPRAY_DELETABLE_SQL}
         RETURNING s.id, p.name AS pesticide, s.plot_code`,
        [id, householdId],
      ),
    );
    if (deleted.rowCount === 0) {
      const exists = await this.db.query<{ status: string; farmer_created: boolean; within_24h: boolean }>(
        `SELECT p.status,
                (s.recorded_by_role = 'farmer') AS farmer_created,
                (s.created_at > now() - interval '24 hours') AS within_24h
         FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id
         WHERE s.id = $1 AND s.household_id = $2`,
        [id, householdId],
      );
      if (exists.rowCount === 0) throw notFound("Không tìm thấy bản ghi phun thuốc.");
      const found = exists.rows[0];
      if (found.status === "banned") {
        throw forbidden("Bản ghi khai báo thuốc cấm đã được chuyển tới cán bộ kỹ thuật HTX để hỗ trợ xử lý, không thể tự xóa.");
      }
      if (found.status === "restricted") {
        throw forbidden("Bản ghi thuốc hạn chế cần lưu vết giám sát, không thể tự xóa. Vui lòng liên hệ cán bộ kỹ thuật HTX.");
      }
      if (!found.farmer_created) {
        throw forbidden("Bản ghi do cán bộ ghi nhận, hộ không thể tự xóa.");
      }
      if (!found.within_24h) {
        throw forbidden("Chỉ xóa được bản ghi phun thuốc trong vòng 24 giờ sau khi nhập.");
      }
      throw forbidden("Bản ghi đã gắn với thu hái, kích hoạt tem hoặc lô hàng sau ngày phun, không thể xóa.");
    }
    const row = deleted.rows[0];
    await this.audit.write(
      { ip: context.ip, user },
      {
        action: "Hộ xóa nhật ký phun thuốc",
        object: `Nhật ký phun thuốc #${row.id}`,
        detail: `${row.pesticide}${row.plot_code ? ` – ${row.plot_code}` : ""}`,
      },
    );

    const hhRes = await this.db.query<{ name: string }>(
      "SELECT name FROM households WHERE id = $1",
      [householdId],
    );
    const farmerName = shortFarmerName(hhRes.rows[0]?.name, user.fullName);
    await this.notifications.notifyOversightForHousehold(householdId, {
      kind: "protocol",
      title: `${farmerName} vừa xóa nhật ký phun thuốc`,
      body: `${row.pesticide}${row.plot_code ? `, thửa ${row.plot_code}` : ""}`,
      link: `${ADMIN_LINKS.journal}&sub=spray`,
    });
    return { ok: true };
  }
}
