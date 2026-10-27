import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../audit/audit.service";
import type { ResourceKey } from "../../auth/permissions";
import { DatabaseService } from "../../database/database.service";
import { badRequest, notFound } from "../errors/app.exception";
import type { ListQueryDto } from "./list-query.dto";

type Input = Record<string, unknown>;

export interface CrudConfig {
  resource: ResourceKey;
  /** Tên hiển thị trong nhật ký thao tác. */
  label: string;
  table: string;
  /** Danh sách cột SELECT (bảng chính có bí danh `t`). Tên cột snake_case được trả về dạng camelCase. */
  fields: string;
  from: string;
  orderBy: string;
  search?: string[];
  /** Cột được tìm kiếm tùy theo người dùng (ví dụ ẩn cột nhạy cảm với một số vai trò); mặc định dùng `search`. */
  searchFor?: (user: AuthUser) => string[];
  /** Tham số query -> cột SQL dùng so sánh bằng. */
  filters?: Record<string, string>;
  /** Trường có trong DTO nhưng không phải cột (ví dụ password). */
  virtual?: string[];
  /** Ràng buộc phạm vi dữ liệu theo người dùng, trả về mệnh đề SQL (có thể thêm tham số). */
  scope?: (user: AuthUser, params: unknown[]) => string | null;
}

export interface WriteContext {
  user: AuthUser;
  ip?: string;
  method: "POST" | "PATCH";
  id?: number;
}

const toSnake = (key: string) => key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const mapRow = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value]));

// Tên trường đi vào câu SQL chỉ được là chữ cái (DTO đã loại trường lạ; đây là lớp chặn thứ hai).
const SAFE_FIELD = /^[a-zA-Z]+$/;

/**
 * Dịch vụ CRUD dùng chung cho các nhóm dữ liệu: phân trang, tìm kiếm, lọc, phạm vi theo người dùng,
 * ghi audit. Lớp con khai báo cấu hình và ghi đè các hook khi cần.
 */
export abstract class BaseCrudService {
  protected constructor(
    protected readonly db: DatabaseService,
    protected readonly audit: AuditService,
    protected readonly config: CrudConfig,
  ) {}

  // ---- hook cho lớp con ----------------------------------------------------------------

  protected prepare(input: Input, _context: WriteContext): Promise<Input> | Input {
    return input;
  }

  protected afterWrite(_id: number, _input: Input): Promise<void> | void {}

  protected guardDelete(_id: number, _user: AuthUser): Promise<void> | void {}

  protected auditAction(_method: "POST" | "PATCH", _input: Input): string | undefined {
    return undefined;
  }

  // ---- thao tác ------------------------------------------------------------------------

  async list(user: AuthUser, query: ListQueryDto & Record<string, unknown>) {
    const { config } = this;
    const { page, pageSize, q } = query;
    const params: unknown[] = [];
    const conditions: string[] = [];

    const scoped = config.scope?.(user, params);
    if (scoped) conditions.push(scoped);

    for (const [param, column] of Object.entries(config.filters ?? {})) {
      const value = query[param];
      if (value === undefined) continue;
      if (typeof value !== "string") throw badRequest(`Tham số ${param} không hợp lệ.`);
      params.push(value);
      conditions.push(`${column} = $${params.length}`);
    }

    const searchColumns = config.searchFor?.(user) ?? config.search;
    if (q && searchColumns?.length) {
      params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
      const ref = `$${params.length}`;
      conditions.push(`(${searchColumns.map((column) => `${column}::text ILIKE ${ref}`).join(" OR ")})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = (
      await this.db.query<{ total: number }>(`SELECT count(*)::int AS total FROM ${config.from} ${where}`, params)
    ).rows[0].total;

    const { rows } = await this.db.query(
      `SELECT ${config.fields} FROM ${config.from} ${where} ORDER BY ${config.orderBy}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { data: rows.map(mapRow), total, page, pageSize };
  }

  async findOne(id: number, user: AuthUser) {
    const row = await this.loadOne(id, user);
    if (!row) throw notFound();
    return row;
  }

  async create(dto: object, user: AuthUser, ip?: string) {
    const input = await this.prepare({ ...dto }, { user, ip, method: "POST" });

    const entries = this.writeColumns(input);
    if (entries.length === 0) throw badRequest("Không có dữ liệu để lưu.");
    const columns = entries.map(([key]) => toSnake(key));
    const placeholders = entries.map((_, index) => `$${index + 1}`);
    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO ${this.config.table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING id`,
      entries.map(([, value]) => value),
    );
    const id = rows[0].id;
    await this.afterWrite(id, input);

    await this.audit.write(
      { ip, user },
      { action: this.auditAction("POST", input) ?? "Tạo mới", object: `${this.config.label} #${id}` },
    );
    return this.loadOne(id, user);
  }

  async update(id: number, dto: object, user: AuthUser, ip?: string) {
    if (!(await this.loadOne(id, user))) throw notFound();

    const input = await this.prepare({ ...dto }, { user, ip, method: "PATCH", id });
    const entries = this.writeColumns(input);
    if (entries.length === 0) throw badRequest("Không có trường nào để cập nhật.");

    const assignments = entries.map(([key], index) => `${toSnake(key)} = $${index + 1}`);
    await this.db.query(
      `UPDATE ${this.config.table} SET ${assignments.join(", ")} WHERE id = $${entries.length + 1}`,
      [...entries.map(([, value]) => value), id],
    );
    await this.afterWrite(id, input);

    const changed = entries.map(([key]) => key).filter((key) => key !== "passwordHash");
    await this.audit.write(
      { ip, user },
      {
        action: this.auditAction("PATCH", input) ?? "Cập nhật",
        object: `${this.config.label} #${id}`,
        detail: `Trường: ${changed.join(", ")}`,
      },
    );
    return this.loadOne(id, user);
  }

  async remove(id: number, user: AuthUser, ip?: string) {
    if (!(await this.loadOne(id, user))) throw notFound();
    await this.guardDelete(id, user);

    await this.db.query(`DELETE FROM ${this.config.table} WHERE id = $1`, [id]);
    await this.audit.write({ ip, user }, { action: "Xóa", object: `${this.config.label} #${id}` });
    return { ok: true };
  }

  // ---- nội bộ --------------------------------------------------------------------------

  private async loadOne(id: number, user: AuthUser) {
    const params: unknown[] = [id];
    const conditions = ["t.id = $1"];
    const scoped = this.config.scope?.(user, params);
    if (scoped) conditions.push(scoped);
    const { rows } = await this.db.query(
      `SELECT ${this.config.fields} FROM ${this.config.from} WHERE ${conditions.join(" AND ")}`,
      params,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  private writeColumns(input: Input): [string, unknown][] {
    const virtual = new Set(this.config.virtual ?? []);
    return Object.entries(input).filter(
      ([key, value]) => value !== undefined && !virtual.has(key) && SAFE_FIELD.test(key),
    );
  }
}
