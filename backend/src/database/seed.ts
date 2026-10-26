import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import * as data from "./seed-data";
import { seedDemoFarmers } from "./seed-farmers";

// ---- chuyển đổi chuỗi hiển thị -> kiểu dữ liệu chuẩn ---------------------------------

const isoDate = (value: string): string => {
  const [d, m, y] = value.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};
const isoDateTime = (value: string): string => {
  const [date, time] = value.split(" ");
  return `${isoDate(date)}T${time}:00+07:00`;
};
const num = (value: string): number | null => {
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : null;
};

const ROLE: Record<string, string> = {
  "Quản trị viên": "admin",
  "Cán bộ HTX": "htx_officer",
  "Kiểm tra viên": "inspector",
  "Cán bộ Thôn": "village_officer",
  "Nông dân": "farmer",
};
const HOUSEHOLD_STATUS: Record<string, string> = {
  "Đủ chuẩn XK": "qualified",
  "Cần cải thiện": "improve",
  "Chờ duyệt": "pending",
  "Vi phạm": "violation",
};
const PRIORITY: Record<string, string> = { Cao: "high", TB: "medium", Thấp: "low" };
const KIND: Record<string, string> = { "Định kỳ": "periodic", "Đột xuất": "sudden", "Phúc tra": "recheck" };
const MINUTE_RESULT: Record<string, string> = { Đạt: "pass", "Không đạt": "fail", "Cần cải thiện": "improve" };
const PESTICIDE_STATUS: Record<string, string> = {
  "Được phép": "allowed",
  "Bị cấm (GACC)": "banned",
  "Hạn chế": "restricted",
};
const HARVEST_STATUS: Record<string, string> = {
  "Đã xuất": "exported",
  "Đã giao": "delivered",
  "Đang vận chuyển": "in_transit",
  "Đang lấy mẫu": "sampling",
};

export interface SeedOptions {
  password: string;
  withPlots?: boolean;
  log?: (message: string) => void;
}

/** Nạp dữ liệu mẫu. Chỉ chạy khi CSDL còn trống (chưa có người dùng). */
export async function seedDatabase(pool: Pool, options: SeedOptions): Promise<boolean> {
  const log = options.log ?? (() => undefined);
  const existing = await pool.query("SELECT 1 FROM users LIMIT 1");
  if (existing.rowCount && existing.rowCount > 0) {
    log("Bỏ qua seed: CSDL đã có dữ liệu.");
    // CSDL đã seed từ trước vẫn cần tài khoản/dữ liệu mẫu cho cổng hộ dân (chỉ thêm phần còn thiếu).
    await seedDemoFarmers(pool, { password: options.password, log });
    return false;
  }

  const passwordHash = await bcrypt.hash(options.password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const villageIds = new Map<string, number>();
    for (const v of data.villages) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO villages (name, leader, household_count, plot_count, area_ha)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [v.name, v.leader, v.households, v.plots, num(v.area)],
      );
      villageIds.set(v.name, rows[0].id);
    }

    for (const a of data.accounts) {
      const villageName = a.name.match(/\(TH(\d)\)/)?.[1];
      await client.query(
        `INSERT INTO users (full_name, username, password_hash, role, status, village_id, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          a.name,
          a.username,
          passwordHash,
          ROLE[a.role],
          a.status === "Khóa" ? "locked" : "active",
          villageName ? (villageIds.get(`Thôn ${villageName}`) ?? null) : null,
          isoDateTime(a.lastLogin),
        ],
      );
    }

    const householdIds = new Map<string, number>();
    for (const h of data.households) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO households (code, name, cccd, phone, village_id, plot_count, area_ha, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [h.code, h.name, h.cccd, h.phone, villageIds.get(h.village), h.plots, h.area, HOUSEHOLD_STATUS[h.status]],
      );
      householdIds.set(h.name, rows[0].id);
    }

    const pesticideIds = new Map<string, number>();
    for (const p of data.pesticides) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO pesticides (name, active_ingredient, concentration, manufacturer, mrl_mg_kg, isolation_days, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [p.name, p.activeIngredient, p.concentration, p.manufacturer, num(p.mrl), num(p.isolation), PESTICIDE_STATUS[p.status]],
      );
      pesticideIds.set(p.name, rows[0].id);
    }

    for (const v of data.varieties) {
      await client.query(
        `INSERT INTO varieties (name, origin, weight_range, harvest_years, description) VALUES ($1, $2, $3, $4, $5)`,
        [v.name, v.origin, v.weight, v.year, v.desc],
      );
    }

    for (const a of data.pendingApprovals) {
      await client.query(
        `INSERT INTO approvals (code, applicant_name, request_type, submitted_on, docs_count, priority)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [a.id, a.name, a.type, isoDate(a.date), a.docs, PRIORITY[a.priority]],
      );
    }

    for (const s of data.scheduleItems) {
      await client.query(
        `INSERT INTO inspection_schedule (scheduled_on, title, officer, plot_count, kind) VALUES ($1, $2, $3, $4, $5)`,
        [isoDate(s.date), s.title, s.officer, s.plots, KIND[s.type]],
      );
    }

    for (const m of data.minutesData) {
      await client.query(
        `INSERT INTO inspection_minutes (code, held_on, location, officer, result) VALUES ($1, $2, $3, $4, $5)`,
        [m.no, isoDate(m.date), m.location, m.officer, MINUTE_RESULT[m.result]],
      );
    }

    for (const j of data.journalData) {
      await client.query(
        `INSERT INTO journal_entries (entry_on, household_id, plot_code, activity, detail, recorder, has_photo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [isoDate(j.date), householdIds.get(j.household), j.plotCode, j.activity, j.detail, j.recorder, j.hasPhoto],
      );
    }

    for (const v of data.violations) {
      await client.query(
        `INSERT INTO violations (severity, title, household_label, detected_on, plot_code, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [v.type, v.title, v.household, isoDate(v.date), v.plot, v.desc],
      );
    }

    for (const s of data.sprayData) {
      await client.query(
        `INSERT INTO spray_records (sprayed_on, household_id, pesticide_id, source, dose, area_ha, isolation_days, mrl_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          isoDate(s.date),
          householdIds.get(s.household),
          pesticideIds.get(s.pesticide),
          s.source,
          s.dose,
          num(s.area),
          num(s.isolation),
          s.mrl === "Đạt" ? "pass" : "exceeded",
        ],
      );
    }

    for (const t of data.testingData) {
      const [householdName, plotCode] = t.household.split(" – ");
      await client.query(
        `INSERT INTO lab_tests
           (code, household_id, plot_code, sampled_on, cd_mg_kg, yellow_o_positive, residue_mg_kg, chlorpyrifos_mg_kg, result, lab)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          t.code,
          householdIds.get(householdName),
          plotCode,
          isoDate(t.sampleDate),
          num(t.cd),
          t.yellowO === "Dương tính",
          num(t.residue),
          t.chlorpyrifos === "KPH" ? null : num(t.chlorpyrifos),
          t.result === "Đạt" ? "pass" : "fail",
          t.lab,
        ],
      );
    }

    for (const h of data.harvestData) {
      await client.query(
        `INSERT INTO harvest_lots (code, harvested_on, weight_tons, household_count, buyer, market, qr_code, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [h.code, isoDate(h.date), num(h.weight), h.households, h.buyer, h.market, h.qr, HARVEST_STATUS[h.status]],
      );
    }

    for (const c of data.trainingCourses) {
      await client.query(
        `INSERT INTO training_courses (title, held_on, location, trainer, enrolled, capacity, completed)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [c.title, c.completed ? null : isoDate(c.date), c.location, c.trainer, c.enrolled, c.capacity, c.completed],
      );
    }

    for (const l of data.auditLog) {
      await client.query(
        `INSERT INTO audit_logs (occurred_at, user_id, user_name, ip, action, object, detail)
         VALUES ($1, (SELECT id FROM users WHERE full_name = $2), $2, $3, $4, $5, $6)`,
        [isoDateTime(l.time), l.user, l.ip, l.action, l.object, l.detail],
      );
    }

    if (options.withPlots) {
      await client.query(readFileSync(join(__dirname, "..", "..", "db", "seeds", "demo-plots.sql"), "utf8"));
    }

    await client.query("COMMIT");
    log("✔ Đã nạp dữ liệu mẫu.");
    await seedDemoFarmers(pool, { password: options.password, log });
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
