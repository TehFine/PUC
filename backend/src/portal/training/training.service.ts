import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { camelRow, camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { type ClientContext, householdIdOf, TODAY_VN_SQL, withTransaction } from "../common/portal-context";

const TRAINING_COLUMNS = `c.id, c.title, c.held_on,
  to_char(c.starts_at, 'HH24:MI') AS starts_at,
  to_char(c.ends_at, 'HH24:MI') AS ends_at,
  c.location, c.trainer, c.description, c.enrolled, c.capacity, c.completed,
  tr.status AS my_status`;

/** Danh sách khóa tập huấn, đăng ký tham gia và hủy đăng ký của hộ. */
@Injectable()
export class TrainingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const householdId = householdIdOf(user);
    const { rows } = await this.db.query(
      `SELECT ${TRAINING_COLUMNS}
       FROM training_courses c
       LEFT JOIN training_registrations tr ON tr.course_id = c.id AND tr.household_id = $1
       ORDER BY c.completed ASC, c.held_on ASC NULLS LAST, c.id DESC
       LIMIT 100`,
      [householdId],
    );
    return { data: camelRows(rows) };
  }

  async register(id: number, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);

    const course = await withTransaction(this.db, async (client) => {
      const courseRes = await client.query<{
        id: number;
        title: string;
        completed: boolean;
        is_past: boolean;
      }>(
        `SELECT id, title, completed,
                (held_on IS NOT NULL AND held_on < ${TODAY_VN_SQL}) AS is_past
         FROM training_courses
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );
      if (courseRes.rowCount === 0) {
        throw notFound("Không tìm thấy lớp tập huấn.");
      }
      const row = courseRes.rows[0];
      if (row.completed || row.is_past) {
        throw badRequest("Lớp tập huấn đã kết thúc hoặc đã qua ngày tổ chức.");
      }

      const existing = await client.query<{ status: string }>(
        "SELECT status FROM training_registrations WHERE course_id = $1 AND household_id = $2 FOR UPDATE",
        [id, householdId],
      );
      const currentStatus = existing.rows[0]?.status;
      if (currentStatus === "registered" || currentStatus === "attended") {
        throw badRequest("Hộ của bạn đã đăng ký lớp tập huấn này.");
      }

      const inc = await client.query(
        `UPDATE training_courses
         SET enrolled = enrolled + 1
         WHERE id = $1 AND enrolled < capacity
         RETURNING id`,
        [id],
      );
      if (inc.rowCount === 0) {
        throw badRequest("Lớp tập huấn đã đủ số lượng học viên.");
      }

      await client.query(
        `INSERT INTO training_registrations (course_id, household_id, user_id, status, registered_at)
         VALUES ($1, $2, $3, 'registered', now())
         ON CONFLICT (course_id, household_id)
         DO UPDATE SET user_id = EXCLUDED.user_id, status = 'registered', registered_at = now()`,
        [id, householdId, user.id],
      );

      return row;
    });

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ đăng ký tập huấn", object: `Lớp tập huấn #${course.id}`, detail: course.title },
    );

    return this.findOne(id, householdId);
  }

  async cancel(id: number, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);

    const course = await withTransaction(this.db, async (client) => {
      const courseRes = await client.query<{ id: number; title: string; completed: boolean }>(
        "SELECT id, title, completed FROM training_courses WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (courseRes.rowCount === 0) {
        throw notFound("Không tìm thấy lớp tập huấn.");
      }
      const row = courseRes.rows[0];

      const updated = await client.query(
        `UPDATE training_registrations
         SET status = 'cancelled'
         WHERE course_id = $1 AND household_id = $2 AND status = 'registered'
         RETURNING id`,
        [id, householdId],
      );
      if (updated.rowCount === 0) {
        throw badRequest("Hộ chưa đăng ký hoặc không thể hủy đăng ký lớp tập huấn này.");
      }

      await client.query(
        `UPDATE training_courses
         SET enrolled = greatest(0, enrolled - 1)
         WHERE id = $1`,
        [id],
      );

      return row;
    });

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ hủy đăng ký tập huấn", object: `Lớp tập huấn #${course.id}`, detail: course.title },
    );

    return this.findOne(id, householdId);
  }

  private async findOne(id: number, householdId: number) {
    const { rows } = await this.db.query(
      `SELECT ${TRAINING_COLUMNS}
       FROM training_courses c
       LEFT JOIN training_registrations tr ON tr.course_id = c.id AND tr.household_id = $2
       WHERE c.id = $1`,
      [id, householdId],
    );
    return camelRow(rows[0]);
  }
}
