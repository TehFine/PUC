import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/auth-user";
import { badRequest, notFound } from "../../common/errors/app.exception";
import { camelRow, camelRows, todayVn } from "../../common/sql/rows";
import { DatabaseService } from "../../database/database.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { UploadsService } from "../../uploads/uploads.service";
import { ADMIN_LINKS, HTX_ROLES } from "../common/admin-links";
import { assertPlotOwned, type ClientContext, householdIdOf, withTransaction } from "../common/portal-context";
import type { CreatePortalApprovalDto } from "./requests.dto";

const APPROVAL_COLUMNS = `ap.id, ap.code, ap.request_type, ap.submitted_on, ap.docs_count, ap.status,
  ap.note, ap.plot_code, ap.review_note, ap.reviewed_at,
  coalesce(
    (SELECT json_agg(
       json_build_object(
         'id', a.id,
         'url', '/api/uploads/' || a.id,
         'mimeType', a.mime_type,
         'originalName', a.original_name
       ) ORDER BY a.id
     )
     FROM approval_attachments aa
     JOIN attachments a ON a.id = aa.attachment_id
     WHERE aa.approval_id = ap.id),
    '[]'::json
  ) AS attachments`;

/** Hồ sơ yêu cầu gửi HTX của hộ. */
@Injectable()
export class RequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser) {
    const { rows } = await this.db.query(
      `SELECT ${APPROVAL_COLUMNS}
       FROM approvals ap
       WHERE ap.household_id = $1
       ORDER BY ap.submitted_on DESC, ap.id DESC LIMIT 100`,
      [householdIdOf(user)],
    );
    return { data: camelRows(rows) };
  }

  async create(dto: CreatePortalApprovalDto, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const household = (
      await this.db.query<{ name: string }>("SELECT name FROM households WHERE id = $1", [householdId])
    ).rows[0];
    if (!household) throw notFound("Không tìm thấy hộ của tài khoản này.");

    const plotCode = dto.plotCode ? await assertPlotOwned(this.db, householdId, dto.plotCode) : null;
    const attachmentIds = await this.uploads.assertUsable(dto.attachmentIds, user, "approval");
    const docsCount = dto.attachmentIds !== undefined ? attachmentIds.length : (dto.docsCount ?? 0);
    const code = `HS-${todayVn().replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

    const id = await withTransaction(this.db, async (client) => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO approvals (code, applicant_name, request_type, submitted_on, docs_count, household_id, note, plot_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [code, household.name, dto.requestType, todayVn(), docsCount, householdId, dto.note ?? null, plotCode],
      );
      const approvalId = inserted.rows[0].id;
      if (attachmentIds.length > 0) {
        await client.query(
          `INSERT INTO approval_attachments (approval_id, attachment_id)
           SELECT $1, unnest($2::bigint[])`,
          [approvalId, attachmentIds],
        );
      }
      return approvalId;
    });

    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ gửi hồ sơ", object: code, detail: dto.requestType },
    );
    await this.notifications.notifyRoles(HTX_ROLES, {
      kind: "approval",
      title: `Hộ ${household.name} gửi hồ sơ "${dto.requestType}"`,
      body: dto.note ? dto.note.slice(0, 200) : `Mã hồ sơ: ${code}`,
      link: ADMIN_LINKS.approval,
    });

    const { rows } = await this.db.query(`SELECT ${APPROVAL_COLUMNS} FROM approvals ap WHERE ap.id = $1`, [id]);
    return camelRow(rows[0]);
  }

  async cancel(id: number, user: AuthUser, context: ClientContext) {
    const householdId = householdIdOf(user);
    const updated = await this.db.query<{ id: number; code: string; request_type: string }>(
      `UPDATE approvals
       SET status = 'cancelled'
       WHERE id = $1 AND household_id = $2 AND status = 'pending'
       RETURNING id, code, request_type`,
      [id, householdId],
    );
    if (updated.rowCount === 0) {
      const exists = await this.db.query<{ status: string }>(
        "SELECT status FROM approvals WHERE id = $1 AND household_id = $2",
        [id, householdId],
      );
      if (exists.rowCount === 0) throw notFound("Không tìm thấy hồ sơ yêu cầu.");
      throw badRequest("Chỉ hủy được hồ sơ đang ở trạng thái chờ duyệt.");
    }
    const row = updated.rows[0];
    await this.audit.write(
      { ip: context.ip, user },
      { action: "Hộ hủy hồ sơ", object: row.code, detail: row.request_type },
    );
    const { rows } = await this.db.query(`SELECT ${APPROVAL_COLUMNS} FROM approvals ap WHERE ap.id = $1`, [id]);
    return camelRow(rows[0]);
  }
}
