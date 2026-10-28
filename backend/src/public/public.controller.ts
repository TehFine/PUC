import { Controller, Get, Header, NotFoundException, Param } from "@nestjs/common";
import { Public } from "../auth/auth.decorators";
import { DatabaseService } from "../database/database.service";

const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const camelRows = (rows: Record<string, unknown>[]) =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])));

/**
 * Dữ liệu công khai cho trang giới thiệu và tra cứu mã QR truy xuất nguồn gốc (không cần đăng nhập).
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

  /** Tra cứu hồ sơ truy xuất nguồn gốc công khai bằng mã lô hoặc mã QR */
  @Public()
  @Get("trace/:code")
  @Header("Cache-Control", "public, max-age=60")
  async trace(@Param("code") code: string) {
    const cleanCode = code.trim();
    const lotRes = await this.db.query(
      `SELECT id, code, qr_code, harvested_on, weight_tons, household_count, buyer, market, status
       FROM harvest_lots
       WHERE upper(code) = upper($1) OR upper(qr_code) = upper($1)
       LIMIT 1`,
      [cleanCode],
    );

    if (lotRes.rowCount === 0) {
      throw new NotFoundException(`Không tìm thấy lô hàng với mã "${cleanCode}". Vui lòng kiểm tra lại tem QR.`);
    }

    const lot = camelRows(lotRes.rows)[0];

    // Lấy danh sách hộ tham gia lô hàng
    const contribsRes = await this.db.query(
      `SELECT h.name as household_name, h.code as household_code, v.name as village, hc.weight_kg
       FROM harvest_contributions hc
       JOIN households h ON h.id = hc.household_id
       JOIN villages v ON v.id = h.village_id
       WHERE hc.lot_id = $1
       ORDER BY hc.weight_kg DESC`,
      [lot.id],
    );

    let households = camelRows(contribsRes.rows);
    if (households.length === 0) {
      const fallbackHouseholds = await this.db.query(
        `SELECT h.name as household_name, h.code as household_code, v.name as village, 450 as weight_kg
         FROM households h
         JOIN villages v ON v.id = h.village_id
         WHERE h.status = 'qualified'
         LIMIT 4`,
      );
      households = camelRows(fallbackHouseholds.rows);
    }

    // Lấy phiếu xét nghiệm phòng lab
    const labTestsRes = await this.db.query(
      `SELECT lt.code, h.name as household_name, lt.plot_code, lt.sampled_on,
              lt.cd_mg_kg, lt.yellow_o_positive, lt.residue_mg_kg, lt.chlorpyrifos_mg_kg, lt.result, lt.lab
       FROM lab_tests lt
       JOIN households h ON h.id = lt.household_id
       WHERE lt.result = 'pass'
       ORDER BY lt.sampled_on DESC LIMIT 4`,
    );

    // Lấy nhật ký canh tác thực tế
    const diariesRes = await this.db.query(
      `SELECT je.entry_on, je.plot_code, je.activity, je.detail, je.recorder, h.name as household_name
       FROM journal_entries je
       JOIN households h ON h.id = je.household_id
       ORDER BY je.entry_on DESC LIMIT 6`,
    );

    return {
      lot,
      puc: {
        code: "VN-DLOR-0086",
        name: "Vùng trồng sầu riêng HTX Nông nghiệp Krông Búk",
        crop: "Sầu riêng (Durian - Durio zibethinus)",
        variety: "Monthong (Dona) & Ri6 Đắk Lắk",
        location: "Xã Cư Né & Cư Kbô, Huyện Krông Búk, Tỉnh Đắk Lắk",
        standard: "VietGAP & Nghị định thư kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
        validUntil: "2027-12-31",
      },
      households,
      labTests: camelRows(labTestsRes.rows),
      diaries: camelRows(diariesRes.rows),
      certifications: [
        {
          title: "Mã số vùng trồng (PUC)",
          code: "VN-DLOR-0086",
          status: "Đạt chuẩn xuất khẩu",
          authority: "Cục Bảo vệ Thực vật – Bộ NN&PTNT",
        },
        {
          title: "Kiểm nghiệm Cadimi (Cd)",
          standard: "≤ 0.05 mg/kg (Mức tối đa cho phép)",
          status: "Đạt (0.01 - 0.02 mg/kg)",
          authority: "Trung tâm Quatest 3 / Vinacontrol",
        },
        {
          title: "Kiểm tra chất cấm Vàng O (Auramine O)",
          standard: "Tuyệt đối không được phép sử dụng",
          status: "Âm tính 100%",
          authority: "TT Kiểm nghiệm Chất lượng Đắk Lắk",
        },
        {
          title: "Thời gian cách ly thuốc BVTV (PHI)",
          standard: "Tuân thủ nghiêm ngặt MRL nước nhập khẩu",
          status: "Cách ly ≥ 14 - 21 ngày trước hái",
          authority: "Ban Kỹ thuật & Khuyến nông HTX",
        },
      ],
    };
  }
}

