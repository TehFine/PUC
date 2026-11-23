import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import { BaseCrudService, type WriteContext } from "../../common/crud/base-crud.service";
import { assertHouseholdInScope, isStaffInCuneCoopScope, villageScope } from "../../common/crud/village-scope";
import { forbidden, notFound } from "../../common/errors/app.exception";
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
      virtual: ["_method"],
    });
  }

  protected override prepare(input: Record<string, unknown>, context: WriteContext) {
    if (!isStaffInCuneCoopScope(context.user, false)) {
      throw forbidden("Bạn không có quyền thao tác khóa đào tạo ngoài phạm vi quản lý.");
    }
    const out: Record<string, unknown> = { ...input, _method: context.method };
    if (!context.id || context.method === "POST") {
      out.enrolled = 0;
    } else {
      delete out.enrolled;
    }
    return out;
  }

  protected override async afterWrite(id: number, input: Record<string, unknown>) {
    if (input._method === "POST") {
      await this.notifications.notifyAllFarmers({
        kind: "training",
        title: `Lớp tập huấn mới: ${String(input.title)}`,
        body: input.location ? `Địa điểm: ${String(input.location)}` : null,
        link: "/portal?tab=learn",
      });
      return;
    }
    if (input._method === "PATCH") {
      const { rows } = await this.db.query<{ title: string; location: string | null }>(
        "SELECT title, location FROM training_courses WHERE id = $1",
        [id],
      );
      if (rows[0]) {
        await this.notifications.notifyAllFarmers({
          kind: "training",
          title: `Cập nhật lớp tập huấn: ${rows[0].title}`,
          body: rows[0].location ? `Địa điểm: ${rows[0].location}` : null,
          link: "/portal?tab=learn",
        });
      }
    }
  }

  protected override guardDelete(_id: number, user: AuthUser) {
    if (!isStaffInCuneCoopScope(user, false)) {
      throw forbidden("Bạn không có quyền xóa khóa đào tạo ngoài phạm vi quản lý.");
    }
  }

  async listRegistrations(courseId: number, user?: AuthUser) {
    const course = await this.db.query("SELECT 1 FROM training_courses WHERE id = $1", [courseId]);
    if (course.rowCount === 0) throw notFound("Không tìm thấy khóa đào tạo.");
    if (user && !isStaffInCuneCoopScope(user, true)) {
      return { data: [] };
    }

    const params: unknown[] = [courseId];
    const scoped = user ? villageScope("h.village_id")(user, params) : null;
    const villageClause = scoped ? `AND (${scoped})` : "";

    const { rows } = await this.db.query(
      `SELECT r.id, r.course_id, r.household_id, h.code AS household_code, h.name AS household_name,
              h.phone, v.name AS village_name, r.status, r.registered_at, r.updated_at
       FROM training_registrations r
       JOIN households h ON h.id = r.household_id
       JOIN villages v ON v.id = h.village_id
       WHERE r.course_id = $1 ${villageClause}
       ORDER BY r.registered_at ASC, r.id ASC`,
      params,
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
    if (!isStaffInCuneCoopScope(user, true)) {
      throw forbidden("Bạn không có quyền cập nhật điểm danh ngoài phạm vi quản lý.");
    }
    const preCheck = await this.db.query<{ household_id: number }>(
      "SELECT household_id FROM training_registrations WHERE id = $1 AND course_id = $2",
      [registrationId, courseId],
    );
    if (preCheck.rowCount === 0 || !preCheck.rows[0]) throw notFound("Không tìm thấy đăng ký tập huấn.");
    await assertHouseholdInScope(this.db, { householdId: preCheck.rows[0].household_id }, user);

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
