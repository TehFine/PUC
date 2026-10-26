import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../auth/auth.decorators";
import { DatabaseService } from "../database/database.service";

const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const camelRows = (rows: Record<string, unknown>[]) =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])));

/**
 * Dữ liệu công khai cho trang giới thiệu (không cần đăng nhập).
 * Chỉ gồm số liệu tổng hợp và danh mục dùng chung; tuyệt đối không có thông tin từng hộ, tài khoản hay thửa đất.
 */
@Controller("public")
export class PublicController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get("overview")
  @Header("Cache-Control", "public, max-age=300")
  async overview() {
    const row = (
      await this.db.query(
        `SELECT
           (SELECT count(*)::int FROM households) AS households,
           (SELECT count(*)::int FROM households WHERE status = 'qualified') AS qualified_households,
           (SELECT count(*)::int FROM villages) AS villages,
           (SELECT coalesce(sum(plot_count), 0)::int FROM households) AS plots,
           (SELECT coalesce(sum(area_ha), 0) FROM households) AS area_ha`,
      )
    ).rows[0];
    return camelRows([row])[0];
  }

  @Public()
  @Get("catalog")
  @Header("Cache-Control", "public, max-age=300")
  async catalog() {
    const [pesticides, varieties, training] = await Promise.all([
      this.db.query(
        `SELECT name, active_ingredient, concentration, mrl_mg_kg, isolation_days, status
         FROM pesticides ORDER BY CASE status WHEN 'banned' THEN 0 WHEN 'restricted' THEN 1 ELSE 2 END, name`,
      ),
      this.db.query(`SELECT name, origin, weight_range, harvest_years, description FROM varieties ORDER BY name`),
      this.db.query(
        `SELECT title, held_on, location, trainer, capacity, enrolled FROM training_courses
         WHERE completed = false AND held_on IS NOT NULL ORDER BY held_on ASC LIMIT 6`,
      ),
    ]);
    return {
      pesticides: camelRows(pesticides.rows),
      varieties: camelRows(varieties.rows),
      training: camelRows(training.rows),
    };
  }

  /** Danh sách thôn (chỉ id và tên) cho biểu mẫu đăng ký. */
  @Public()
  @Get("villages")
  @Header("Cache-Control", "public, max-age=300")
  async villages() {
    return (await this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages ORDER BY name")).rows;
  }
}
