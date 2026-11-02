import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { notFound } from "../../common/errors/app.exception";
import { camelRow, camelRows } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { invalidState } from "../shared/state";
import type { UpdateRegistrationStatusDto } from "./training.dto";

@Injectable()
export class TrainingService extends BaseCrudService {
  constructor(
    db: DatabaseService,
    audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {
    super(db, audit, {
      resource: "training",
      label: "Khóa đào tạo",
      table: "training_courses",
      fields: `t.id, t.title, t.held_on, to_char(t.starts_at, 'HH24:MI') AS starts_at,
      to_char(t.ends_at, 'HH24:MI') AS ends_at, t.location, t.trainer,
      t.description, t.enrolled, t.capacity, t.completed`,
      from: `training_courses t`,
      orderBy: "t.completed, t.held_on NULLS LAST, t.id",
      search: ["t.title", "t.trainer", "t.location", "t.description"],
      filters: { completed: "t.completed" },
    });
  }

  protected override prepare(input: Record<string, unknown>, context: WriteContext) {
    return { ...input, _method: context.method };
  }

  protected override async afterWrite(_id: number, input: Record<string, unknown>) {
    if (input._method === "POST") {
      await this.notifications.notifyAllFarmers({
        kind: "training",
        title: `Lớp tập huấn mới: ${String(input.title)}`,
        body: input.location ? `Địa điểm: ${String(input.location)}` : null,
        link: "/portal?tab=learn",
      });
    }
  }

  async listRegistrations(courseId: number) {
    const course = await this.db.query("SELECT 1 FROM training_courses WHERE id = $1", [courseId]);
    if (course.rowCount === 0) throw notFound("Không tìm thấy khóa đào tạo.");

    const { rows } = await this.db.query(
      `SELECT r.id, r.course_id, r.household_id, h.code AS household_code, h.name AS household_name,
              h.phone, v.name AS village_name, r.status, r.registered_at, r.updated_at
       FROM training_registrations r
       JOIN households h ON h.id = r.household_id
       JOIN villages v ON v.id = h.village_id
       WHERE r.course_id = $1
       ORDER BY r.registered_at ASC, r.id ASC`,
      [courseId],
    );
    return { data: camelRows(rows) };
  }

  async updateRegistration(
    courseId: number,
    registrationId: number,
    dto: UpdateRegistrationStatusDto,
    user: AuthUser,
    ip?: string,
  ) {
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ id: number; status: string }>(
        "SELECT id, status FROM training_registrations WHERE id = $1 AND course_id = $2 FOR UPDATE",
        [registrationId, courseId],
      );
      if (current.rowCount === 0) throw notFound("Không tìm thấy đăng ký tập huấn.");
      const prev = current.rows[0].status;

      if (prev !== dto.status) {
        if (prev !== "cancelled" && dto.status === "cancelled") {
          await client.query("UPDATE training_courses SET enrolled = GREATEST(0, enrolled - 1) WHERE id = $1", [
            courseId,
          ]);
        } else if (prev === "cancelled" && dto.status !== "cancelled") {
          const updated = await client.query(
            "UPDATE training_courses SET enrolled = enrolled + 1 WHERE id = $1 AND enrolled < capacity",
            [courseId],
          );
          if (updated.rowCount === 0) {
            throw invalidState("Lớp tập huấn đã đủ học viên.");
          }
        }
        await client.query("UPDATE training_registrations SET status = $1 WHERE id = $2", [
          dto.status,
          registrationId,
        ]);
      }

      const { rows } = await client.query(
        `SELECT r.id, r.course_id, r.household_id, h.code AS household_code, h.name AS household_name,
                h.phone, v.name AS village_name, r.status, r.registered_at, r.updated_at
         FROM training_registrations r
         JOIN households h ON h.id = r.household_id
         JOIN villages v ON v.id = h.village_id
         WHERE r.id = $1`,
        [registrationId],
      );
      await client.query("COMMIT");

      await this.audit.write(
        { ip, user },
        {
          action: "Cập nhật điểm danh tập huấn",
          object: `Đăng ký #${registrationId}`,
          detail: `Khóa #${courseId}: ${dto.status}`,
        },
      );
      return camelRow(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
