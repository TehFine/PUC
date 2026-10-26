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
      `SELECT p.code, p.village, p.zone_code, p.variety, p.planted_year, p.area_ha, p.source, p.status
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
      `SELECT c.id, l.code AS lot_code, l.harvested_on, c.weight_kg, l.buyer, l.market, l.status
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
}
