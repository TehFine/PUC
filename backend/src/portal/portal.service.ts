import { Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { badRequest, forbidden, notFound } from "../common/errors/app.exception";
import { DatabaseService } from "../database/database.service";
import type { CreatePortalApprovalDto, CreatePortalJournalDto, CreatePortalSprayDto } from "./dto/portal.dto";

const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const camelRows = <T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])) as T);

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
const todayVn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

interface ClientContext {
  ip?: string;
}

/**
 * Dữ liệu và thao tác dành cho hộ dân. Mọi truy vấn đều bị giới hạn theo `user.householdId`
 * (lấy từ tài khoản đăng nhập, không bao giờ nhận từ client) nên một hộ không thể xem dữ liệu hộ khác.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private householdIdOf(user: AuthUser): number {
    if (user.householdId === null) {
      throw forbidden("Tài khoản chưa được liên kết với hộ nào. Vui lòng liên hệ cán bộ HTX.");
    }
    return user.householdId;
  }

  async overview(user: AuthUser) {
    const id = this.householdIdOf(user);
    const household = (
      await this.db.query(
        `SELECT h.id, h.code, h.name, h.phone, h.plot_count, h.area_ha, h.status,
                v.name AS village_name, v.leader AS village_leader
         FROM households h JOIN villages v ON v.id = h.village_id WHERE h.id = $1`,
        [id],
      )
    ).rows[0];
    if (!household) throw notFound("Không tìm thấy hộ của tài khoản này.");

    const stats = (
      await this.db.query(
        `SELECT
           (SELECT count(*)::int FROM violations WHERE household_id = $1 AND status = 'open') AS open_violations,
           (SELECT count(*)::int FROM approvals WHERE household_id = $1 AND status = 'pending') AS pending_approvals,
           (SELECT max(entry_on) FROM journal_entries WHERE household_id = $1) AS last_journal_on,
           (SELECT count(*)::int FROM journal_entries
              WHERE household_id = $1 AND entry_on >= (current_date - 30)) AS journal_last_30_days,
           (SELECT coalesce(sum(weight_kg), 0) FROM harvest_contributions WHERE household_id = $1) AS harvest_total_kg`,
        [id],
      )
    ).rows[0];

    const lastTest = (
      await this.db.query(
        `SELECT code, plot_code, sampled_on, result FROM lab_tests
         WHERE household_id = $1 ORDER BY sampled_on DESC, id DESC LIMIT 1`,
        [id],
      )
    ).rows[0];

    return {
      household: camelRows([household])[0],
      stats: camelRows([stats])[0],
      lastTest: lastTest ? camelRows([lastTest])[0] : null,
    };
  }

  /** Các thửa của hộ (khớp theo tên chủ thửa). Trả về `available: false` khi hệ thống chưa bật dữ liệu bản đồ. */
  async plots(user: AuthUser) {
    const id = this.householdIdOf(user);
    const exists = (await this.db.query("SELECT to_regclass('public.plots') AS t")).rows[0].t !== null;
    if (!exists) return { data: [], available: false };

    const { rows } = await this.db.query(
      `SELECT p.id, p.code, p.sheet_no AS sheet, p.parcel_no AS parcel, p.village, p.zone_code, p.variety, p.planted_year, p.area_ha, p.source, p.status,
              ST_AsGeoJSON(p.geom) AS geometry_json,
              ST_Y(ST_Centroid(p.geom)) AS lat,
              ST_X(ST_Centroid(p.geom)) AS lng
       FROM plots p JOIN households h ON h.id = $1 AND lower(p.owner_name) = lower(h.name)
       ORDER BY p.code`,
      [id],
    );
    return { data: camelRows(rows), available: true };
  }

  async journal(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT id, entry_on, plot_code, activity, detail, recorder, has_photo
       FROM journal_entries WHERE household_id = $1 ORDER BY entry_on DESC, id DESC LIMIT 200`,
      [this.householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async addJournal(dto: CreatePortalJournalDto, user: AuthUser, context: ClientContext) {
    const householdId = this.householdIdOf(user);
    const entryOn = dto.entryOn ?? todayVn();
    if (entryOn > todayVn()) throw badRequest("Ngày ghi nhật ký không được ở tương lai.");

    const { rows } = await this.db.query(
      `INSERT INTO journal_entries (entry_on, household_id, plot_code, activity, detail, recorder)
       VALUES ($1, $2, $3, $4, $5, 'Chủ hộ')
       RETURNING id, entry_on, plot_code, activity, detail, recorder, has_photo`,
      [entryOn, householdId, dto.plotCode, dto.activity, dto.detail ?? null],
    );
    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ ghi nhật ký", object: `Nhật ký canh tác #${rows[0].id}`, detail: `${dto.activity} – ${dto.plotCode}` },
    );
    return camelRows(rows)[0];
  }

  async spray(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT s.id, s.sprayed_on, p.name AS pesticide, p.status AS pesticide_status, s.source, s.dose,
              s.area_ha, s.isolation_days, s.mrl_status
       FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id
       WHERE s.household_id = $1 ORDER BY s.sprayed_on DESC, s.id DESC LIMIT 200`,
      [this.householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async addSpray(dto: CreatePortalSprayDto, user: AuthUser, context: ClientContext) {
    const householdId = this.householdIdOf(user);
    const sprayedOn = dto.sprayedOn ?? todayVn();
    if (sprayedOn > todayVn()) throw badRequest("Ngày phun thuốc không được ở tương lai.");

    const pesticide = (
      await this.db.query<{ name: string; status: string; isolation_days: number | null }>(
        "SELECT name, status, isolation_days FROM pesticides WHERE id = $1",
        [dto.pesticideId],
      )
    ).rows[0];
    if (!pesticide) throw badRequest("Không tìm thấy loại thuốc đã chọn.");

    // Thuốc bị cấm luôn bị ghi nhận là không đạt để cán bộ kiểm tra theo dõi.
    const mrlStatus = pesticide.status === "banned" ? "exceeded" : "pass";
    const { rows } = await this.db.query(
      `INSERT INTO spray_records (sprayed_on, household_id, pesticide_id, source, dose, area_ha, isolation_days, mrl_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [sprayedOn, householdId, dto.pesticideId, dto.source ?? null, dto.dose, dto.areaHa, pesticide.isolation_days ?? 0, mrlStatus],
    );
    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ ghi nhật ký phun thuốc", object: `Nhật ký phun thuốc #${rows[0].id}`, detail: pesticide.name },
    );
    const created = (
      await this.db.query(
        `SELECT s.id, s.sprayed_on, p.name AS pesticide, p.status AS pesticide_status, s.source, s.dose,
                s.area_ha, s.isolation_days, s.mrl_status
         FROM spray_records s JOIN pesticides p ON p.id = s.pesticide_id WHERE s.id = $1`,
        [rows[0].id],
      )
    ).rows;
    return camelRows(created)[0];
  }

  async labTests(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT id, code, plot_code, sampled_on, cd_mg_kg, yellow_o_positive, residue_mg_kg,
              chlorpyrifos_mg_kg, result, lab
       FROM lab_tests WHERE household_id = $1 ORDER BY sampled_on DESC, id DESC LIMIT 100`,
      [this.householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  /** Lịch kiểm tra sắp tới của HTX (chung cho mọi hộ). */
  async schedule(user: AuthUser) {
    this.householdIdOf(user);
    const { rows } = await this.db.query(
      `SELECT id, scheduled_on, title, officer, kind FROM inspection_schedule
       WHERE scheduled_on >= current_date ORDER BY scheduled_on ASC LIMIT 20`,
    );
    return { data: camelRows(rows) };
  }

  async violations(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT id, severity, title, detected_on, plot_code, description, status
       FROM violations WHERE household_id = $1 ORDER BY detected_on DESC, id DESC LIMIT 100`,
      [this.householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async harvest(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT c.id, l.code AS lot_code, l.qr_code, l.harvested_on, c.weight_kg, l.buyer, l.market, l.status
       FROM harvest_contributions c JOIN harvest_lots l ON l.id = c.lot_id
       WHERE c.household_id = $1 ORDER BY l.harvested_on DESC, c.id DESC LIMIT 100`,
      [this.householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async approvals(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT id, code, request_type, submitted_on, docs_count, status
       FROM approvals WHERE household_id = $1 ORDER BY submitted_on DESC, id DESC LIMIT 100`,
      [this.householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async addApproval(dto: CreatePortalApprovalDto, user: AuthUser, context: ClientContext) {
    const householdId = this.householdIdOf(user);
    const household = (await this.db.query<{ name: string }>("SELECT name FROM households WHERE id = $1", [householdId])).rows[0];
    if (!household) throw notFound("Không tìm thấy hộ của tài khoản này.");

    const code = `HS-${todayVn().replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { rows } = await this.db.query(
      `INSERT INTO approvals (code, applicant_name, request_type, submitted_on, docs_count, household_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, code, request_type, submitted_on, docs_count, status`,
      [code, household.name, dto.requestType, todayVn(), dto.docsCount ?? 0, householdId],
    );
    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ gửi hồ sơ", object: code, detail: dto.requestType },
    );
    return camelRows(rows)[0];
  }

  /** Lấy danh sách đợt cấp tem và chi tiết tem của hộ (Quy trình 1 - Bước 4 & Quy trình 2 - CheckVN) */
  async stamps(user: AuthUser) {
    const householdId = this.householdIdOf(user);

    // Thống kê tem của hộ
    const statsRes = await this.db.query<{ total: string; activated: string; allocated: string }>(
      `SELECT
         count(*)::int as total,
         count(*) filter (where status = 'activated')::int as activated,
         count(*) filter (where status = 'allocated')::int as allocated
       FROM farmer_stamps
       WHERE household_id = $1`,
      [householdId],
    );

    const stats = {
      totalAllocated: Number(statsRes.rows[0]?.total ?? 0),
      totalActivated: Number(statsRes.rows[0]?.activated ?? 0),
      remaining: Number(statsRes.rows[0]?.allocated ?? 0),
    };

    // Danh sách đợt cấp tem
    const allocs = await this.db.query(
      `SELECT id, allocation_code, allocated_on, season, max_quota_stamps, quantity_allocated, from_serial, to_serial, status, notes
       FROM farmer_stamp_allocations
       WHERE household_id = $1
       ORDER BY allocated_on DESC, id DESC`,
      [householdId],
    );

    // Danh sách 50 tem gần nhất
    const stamps = await this.db.query(
      `SELECT id, allocation_id, plot_code, serial_code, status, activated_at, fruit_weight_kg, grade, photo_url, harvest_date
       FROM farmer_stamps
       WHERE household_id = $1
       ORDER BY status = 'allocated' DESC, id DESC
       LIMIT 50`,
      [householdId],
    );

    return {
      stats,
      allocations: camelRows(allocs.rows),
      stamps: camelRows(stamps.rows),
    };
  }

  /** Nông hộ tự kích hoạt tem dán quả sầu riêng (Quy trình 1 - Bước 5 & Quy trình 2 - Nguyên tắc 3, 4) */
  async activateStamp(dto: import("./dto/portal.dto").ActivatePortalStampDto, user: AuthUser, context: ClientContext) {
    const householdId = this.householdIdOf(user);
    const cleanSerial = dto.serialCode.trim();

    // 1. Kiểm tra tem tồn tại
    const stampRes = await this.db.query<{ id: number; household_id: number; status: string; serial_code: string }>(
      `SELECT id, household_id, status, serial_code FROM farmer_stamps WHERE upper(serial_code) = upper($1) LIMIT 1`,
      [cleanSerial],
    );

    if (stampRes.rowCount === 0) {
      throw notFound(`Không tìm thấy mã tem "${cleanSerial}" trên hệ thống.`);
    }

    const stamp = stampRes.rows[0];

    // 2. Chống trà trộn / hoán đổi tem (Quy trình 2 - Nguyên tắc 4):
    // Chỉ có chính hộ được cấp mới có quyền kích hoạt tem của mình
    if (Number(stamp.household_id) !== householdId) {
      throw forbidden(`Tem "${cleanSerial}" thuộc về hộ nông dân khác. Hệ thống ngăn chặn việc kích hoạt chéo hoặc hoán đổi tem!`);
    }

    // 3. Kiểm tra tem đã kích hoạt trước đó chưa
    if (stamp.status === "activated") {
      throw badRequest(`Tem "${cleanSerial}" đã được kích hoạt trước đó.`);
    }

    // 4. Kích hoạt tem
    const today = todayVn();
    const updated = await this.db.query(
      `UPDATE farmer_stamps
       SET
         status = 'activated',
         activated_at = now(),
         plot_code = $1,
         fruit_weight_kg = $2,
         grade = $3,
         photo_url = $4,
         harvest_date = $5
       WHERE id = $6
       RETURNING id, allocation_id, plot_code, serial_code, status, activated_at, fruit_weight_kg, grade, photo_url, harvest_date`,
      [dto.plotCode, dto.fruitWeightKg, dto.grade ?? "A", dto.photoUrl ?? null, today, stamp.id],
    );

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Nông hộ kích hoạt tem quả", object: stamp.serial_code, detail: `Lô ${dto.plotCode}, khối lượng ${dto.fruitWeightKg} kg, hạng ${dto.grade ?? "A"}` },
    );

    return camelRows(updated.rows)[0];
  }

  /** Lấy danh sách khai báo thu hái tại vườn của hộ */
  async harvestDeclarations(user: AuthUser) {
    const householdId = this.householdIdOf(user);
    const { rows } = await this.db.query(
      `SELECT id, plot_code, harvested_on, weight_kg, grade_a_kg, grade_b_kg, quality_rating, photo_url, note, created_at
       FROM harvest_declarations
       WHERE household_id = $1
       ORDER BY harvested_on DESC, id DESC LIMIT 50`,
      [householdId],
    );
    return { data: camelRows(rows) };
  }

  /** Nông hộ tự khai báo nhật ký thu hái tại vườn (Quy trình 1 - Bước 3) */
  async addHarvestDeclaration(dto: import("./dto/portal.dto").CreateHarvestDeclarationDto, user: AuthUser, context: ClientContext) {
    const householdId = this.householdIdOf(user);
    const date = dto.harvestedOn || todayVn();

    const { rows } = await this.db.query(
      `INSERT INTO harvest_declarations
         (household_id, plot_code, harvested_on, weight_kg, grade_a_kg, grade_b_kg, quality_rating, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, plot_code, harvested_on, weight_kg, grade_a_kg, grade_b_kg, quality_rating, photo_url, note, created_at`,
      [householdId, dto.plotCode, date, dto.weightKg, dto.gradeAKg ?? 0, dto.gradeBKg ?? 0, dto.qualityRating || "Loại 1 (VIP)", dto.note ?? null],
    );

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Nông hộ khai báo thu hái", object: dto.plotCode, detail: `Sản lượng ${dto.weightKg} kg, ngày ${date}` },
    );

    return camelRows(rows)[0];
  }
}
