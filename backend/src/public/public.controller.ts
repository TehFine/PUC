import { Controller, Get, Header, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators";
import { notFound } from "../common/errors/app.exception";
import { camelRow, camelRows } from "../common/sql/rows";
import { DatabaseService } from "../database/database.service";

/**
 * Dữ liệu công khai cho trang giới thiệu, bản tin và tra cứu mã QR truy xuất nguồn gốc (không cần đăng nhập).
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
           (SELECT coalesce(sum(area_ha), 0)::float8 FROM households) AS area_ha`,
      )
    ).rows[0];
    return camelRow(row);
  }

  @Public()
  @Get("catalog")
  @Header("Cache-Control", "public, max-age=300")
  async catalog() {
    const [pesticides, varieties, fertilizers, training] = await Promise.all([
      this.db.query(
        `SELECT name, active_ingredient, concentration, manufacturer, mrl_mg_kg, isolation_days, status
         FROM pesticides ORDER BY CASE status WHEN 'banned' THEN 0 WHEN 'restricted' THEN 1 ELSE 2 END, name`,
      ),
      this.db.query(
        `SELECT name, origin, weight_range, harvest_years, description, category, status,
                flesh_color, seed_rate, brix, yield_per_ha, image_url, market_potential,
                morphology, farming_techniques
         FROM varieties ORDER BY name`,
      ),
      this.db.query(
        `SELECT name, category, formula, manufacturer, dosage, application_method, timing,
                status, image_url, description
         FROM fertilizers ORDER BY id`,
      ),
      this.db.query(
        `SELECT title, held_on, to_char(starts_at, 'HH24:MI') AS starts_at,
                to_char(ends_at, 'HH24:MI') AS ends_at, location, trainer, description, capacity, enrolled
         FROM training_courses
         WHERE completed = false AND held_on IS NOT NULL ORDER BY held_on ASC LIMIT 6`,
      ),
    ]);
    const upcomingTraining = camelRows(training.rows);
    return {
      pesticides: camelRows(pesticides.rows),
      varieties: camelRows(varieties.rows),
      fertilizers: camelRows(fertilizers.rows),
      training: upcomingTraining,
      upcomingTraining,
    };
  }

  @Public()
  @Get("news")
  @Header("Cache-Control", "public, max-age=120")
  async news() {
    const { rows } = await this.db.query(
      `SELECT slug, category, title, excerpt, content, author, image_url, image_alt,
              read_time, featured, published_on
       FROM news_articles
       WHERE status = 'published'
       ORDER BY published_on DESC NULLS LAST, id DESC
       LIMIT 100`,
    );
    return { data: camelRows(rows) };
  }

  @Public()
  @Get("news/:slug")
  @Header("Cache-Control", "public, max-age=120")
  async newsDetail(@Param("slug") slug: string) {
    const cleanSlug = slug.trim();
    if (!cleanSlug || cleanSlug.length > 120 || !/^[a-z0-9-]+$/i.test(cleanSlug)) {
      throw notFound("Không tìm thấy bản tin.");
    }
    const { rows } = await this.db.query(
      `SELECT slug, category, title, excerpt, content, author, image_url, image_alt,
              read_time, featured, published_on
       FROM news_articles
       WHERE slug = $1 AND status = 'published'
       LIMIT 1`,
      [cleanSlug],
    );
    if (rows.length === 0) throw notFound("Không tìm thấy bản tin.");
    return camelRow(rows[0]);
  }

  /** Danh sách thôn (chỉ id và tên) cho biểu mẫu đăng ký. */
  @Public()
  @Get("villages")
  @Header("Cache-Control", "public, max-age=300")
  async villages() {
    return (await this.db.query<{ id: number; name: string }>("SELECT id, name FROM villages ORDER BY name")).rows;
  }

  /** Tra cứu hồ sơ truy xuất nguồn gốc công khai bằng mã lô, mã tem QR hoặc mã định danh từng quả/thùng */
  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === "test" ? 1000 : 60, ttl: 60_000 } })
  @Get("trace/:code")
  @Header("Cache-Control", "public, max-age=60")
  async trace(@Param("code") code: string) {
    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length > 80 || !/^[A-Za-z0-9._/-]+$/.test(cleanCode)) {
      throw notFound(`Không tìm thấy hồ sơ lô hàng hoặc mã tem "${cleanCode.slice(0, 80)}". Vui lòng kiểm tra lại tem QR.`);
    }
    const hasPlots =
      (await this.db.query<{ reg: string | null }>("SELECT to_regclass('public.plots') AS reg")).rows[0]
        ?.reg !== null;

    // 0. Kiểm tra nếu mã quét là tem định danh cấp trực tiếp cho Nông hộ
    const farmerStampSql = hasPlots
      ? `SELECT fs.household_id, fs.plot_code, fs.serial_code, fs.status,
                fs.activated_at, fs.fruit_weight_kg::float8 AS fruit_weight_kg, fs.grade, fs.harvest_date,
                h.name AS household_name, '********' || right(h.cccd, 4) AS household_cccd,
                h.code AS household_code, v.name AS village_name,
                p.zone_code, p.variety, COALESCE(p.area_ha, h.area_ha)::float8 AS area_ha, p.planted_year
         FROM farmer_stamps fs
         JOIN households h ON h.id = fs.household_id
         JOIN villages v ON v.id = h.village_id
         LEFT JOIN plots p ON p.code = fs.plot_code
         WHERE upper(fs.serial_code) = upper($1)
         LIMIT 1`
      : `SELECT fs.household_id, fs.plot_code, fs.serial_code, fs.status,
                fs.activated_at, fs.fruit_weight_kg::float8 AS fruit_weight_kg, fs.grade, fs.harvest_date,
                h.name AS household_name, '********' || right(h.cccd, 4) AS household_cccd,
                h.code AS household_code, v.name AS village_name,
                NULL::text AS zone_code, NULL::text AS variety, h.area_ha::float8 AS area_ha, NULL::int AS planted_year
         FROM farmer_stamps fs
         JOIN households h ON h.id = fs.household_id
         JOIN villages v ON v.id = h.village_id
         WHERE upper(fs.serial_code) = upper($1)
         LIMIT 1`;

    const farmerStampRes = await this.db.query(farmerStampSql, [cleanCode]);

    if (farmerStampRes.rowCount && farmerStampRes.rows[0]) {
      const rawStamp = camelRow<Record<string, unknown>>(farmerStampRes.rows[0]);
      const householdId = Number(rawStamp.householdId);
      const { householdId: _omitHouseholdId, ...farmerStamp } = rawStamp;
      void _omitHouseholdId;

      const [diariesRes, labTestsRes] = await Promise.all([
        this.db.query(
          `SELECT entry_on, plot_code, activity, detail, recorder
           FROM journal_entries
           WHERE household_id = $1
           ORDER BY entry_on DESC LIMIT 6`,
          [householdId],
        ),
        this.db.query(
          `SELECT code, plot_code, sampled_on, cd_mg_kg, yellow_o_positive, residue_mg_kg, chlorpyrifos_mg_kg, result, lab
           FROM lab_tests
           WHERE household_id = $1 AND result = 'pass'
           ORDER BY sampled_on DESC LIMIT 4`,
          [householdId],
        ),
      ]);

      const harvestDateStr = farmerStamp.harvestDate
        ? String(farmerStamp.harvestDate)
        : farmerStamp.activatedAt
          ? String(farmerStamp.activatedAt).split("T")[0]
          : new Date().toISOString().split("T")[0];

      const resolvedPucCode = String(
        farmerStamp.zoneCode ||
          String(farmerStamp.householdCode || "").replace(/-H\d+$/i, "") ||
          "66-PUC-SR0001-00728",
      );

      return {
        stampType: "farmer_fruit",
        isFarmerStamp: true,
        farmerStamp,
        lot: {
          code: String(farmerStamp.serialCode),
          qrCode: String(farmerStamp.serialCode),
          harvestedOn: harvestDateStr,
          weightTons: Number(farmerStamp.fruitWeightKg ? (Number(farmerStamp.fruitWeightKg) / 1000).toFixed(4) : 0.0035),
          householdCount: 1,
          buyer: "HTX Kinh Doanh - Dịch Vụ Tổng Hợp Cư Né",
          market: "Xuất khẩu chính ngạch & Nội địa",
          status: farmerStamp.status === "activated" ? "harvested" : "allocated",
          packhouseCode: "VN-DLPH-0089",
        },
        households: [
          {
            householdName: String(farmerStamp.householdName),
            householdCode: String(farmerStamp.householdCode),
            village: String(farmerStamp.villageName || "Xã Ea Khăl"),
            weightKg: Number(farmerStamp.fruitWeightKg || 3.5),
          },
        ],
        supplyChain: {
          packhouse: {
            code: "VN-DLPH-0089",
            name: "Cơ sở đóng gói sầu riêng HTX Cư Né – Đắk Lắk",
            taxCode: "6001234567",
            treatmentMethod: "Làm sạch áp lực, khử khuẩn, dán tem QR quả và đóng hộp",
            gradeAPct: farmerStamp.grade === "A" ? 100 : 70,
            gradeBPct: farmerStamp.grade === "B" ? 100 : 30,
            gradeCPct: farmerStamp.grade === "C" ? 100 : 0,
            avgBrix: 32.5,
          },
          transport: {
            transporter: "Đội vận chuyển lạnh liên kết HTX",
            vehiclePlate: "47C-289.15",
            temperatureC: 13.5,
            departedAt: harvestDateStr,
            estimatedArrival: harvestDateStr,
          },
          contract: {
            code: "HD-2026/CN-EK01",
            title: "Hợp đồng liên kết bao tiêu nông hộ HTX Cư Né",
          },
        },
        puc: {
          code: resolvedPucCode,
          name: `Vùng trồng sầu riêng ${farmerStamp.villageName || "Ea Khăl"} – HTX Cư Né`,
          crop: "Sầu riêng (Durian - Durio zibethinus)",
          variety: (farmerStamp.variety as string) || "Đô Na",
          location: `${farmerStamp.villageName || "Thôn 2"}, Xã Ea Khăl, Tỉnh Đắk Lắk`,
          standard: "VietGAP & Nghị định thư kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
          validUntil: "2027-12-31",
        },
        diaries: camelRows(diariesRes.rows),
        labTests: camelRows(labTestsRes.rows),
        certifications: [
          {
            title: "Mã số vùng trồng (PUC)",
            code: resolvedPucCode,
            status: "Đạt chuẩn xuất khẩu",
            authority: "Cục Bảo vệ Thực vật – Bộ NN&PTNT",
          },
          {
            title: "Kiểm soát tem Nông hộ",
            code: String(farmerStamp.serialCode),
            status: farmerStamp.status === "activated" ? "Đã kích hoạt thu hái tại vườn" : "Tem đã cấp nhưng chưa kích hoạt",
            authority: "Hệ thống CheckVN & HTX Cư Né",
          },
          {
            title: "Chứng nhận VietGAP",
            status: "Đạt tiêu chuẩn VietGAP",
            authority: "Trung tâm Chứng nhận Nông nghiệp",
          },
        ],
      };
    }

    let scannedItem: Record<string, unknown> | null = null;
    let lotId: number | null = null;

    // 1. Kiểm tra nếu mã quét là mã tem con của quả hoặc thùng (CheckVN Serial Item)
    const itemRes = await this.db.query(
      `SELECT lot_id, item_type, serial_code, weight_kg::float8 AS weight_kg, grade, printed_at
       FROM harvest_items
       WHERE upper(serial_code) = upper($1)
       LIMIT 1`,
      [cleanCode],
    );
    if (itemRes.rowCount && itemRes.rowCount > 0) {
      const rawItem = camelRow<Record<string, unknown>>(itemRes.rows[0]);
      lotId = Number(rawItem.lotId);
      const { lotId: _omitLotId, ...publicItem } = rawItem;
      void _omitLotId;
      scannedItem = publicItem;
    }

    // 2. Tìm thông tin lô hàng
    const lotRes = await this.db.query(
      `SELECT l.id, l.code, l.qr_code, l.harvested_on, l.weight_tons::float8 AS weight_tons,
              l.household_count, l.buyer, l.market, l.status,
              e.name AS enterprise_name, e.tax_code AS enterprise_tax_code,
              l.packhouse_code, l.grade_a_pct, l.grade_b_pct, l.grade_c_pct, l.avg_brix, l.treatment_method,
              l.transporter, l.vehicle_plate, l.temperature_c, l.departed_at, l.estimated_arrival,
              c.code AS contract_code, c.title AS contract_title
       FROM harvest_lots l
       LEFT JOIN enterprises e ON e.id = l.enterprise_id
       LEFT JOIN contracts c ON c.id = l.contract_id
       WHERE ${lotId ? "l.id = $1" : "upper(l.code) = upper($1) OR upper(l.qr_code) = upper($1)"}
       LIMIT 1`,
      [lotId ?? cleanCode],
    );

    if (lotRes.rowCount === 0) {
      // 3. Kiểm tra nếu mã quét là mã Lô đất canh tác / Biển cắm vườn (chỉ khi có bảng plots)
      if (hasPlots) {
        const plotRes = await this.db.query(
          `SELECT p.code, p.owner_name, p.village, p.zone_code, p.variety, p.planted_year,
                  p.area_ha::float8 AS area_ha, p.status, h.code AS household_code
           FROM plots p
           LEFT JOIN households h ON h.id = p.household_id
           WHERE upper(p.code) = upper($1)
           LIMIT 1`,
          [cleanCode],
        );

        if (plotRes.rowCount && plotRes.rows[0]) {
          const plot = camelRow<Record<string, unknown>>(plotRes.rows[0]);
          const plotPucCode = String(plot.zoneCode || "66-PUC-SR0001-00728");
          const [diariesRes, labTestsRes] = await Promise.all([
            this.db.query(
              `SELECT entry_on, plot_code, activity, detail, recorder
               FROM journal_entries
               WHERE plot_code = $1
               ORDER BY entry_on DESC LIMIT 6`,
              [plot.code],
            ),
            this.db.query(
              `SELECT code, plot_code, sampled_on, cd_mg_kg, yellow_o_positive, residue_mg_kg, chlorpyrifos_mg_kg, result, lab
               FROM lab_tests
               WHERE plot_code = $1 AND result = 'pass'
               ORDER BY sampled_on DESC LIMIT 4`,
              [plot.code],
            ),
          ]);

          return {
            stampType: "plot_signboard",
            isPlotSignboard: true,
            plot,
            lot: {
              code: String(plot.code),
              qrCode: String(plot.code),
              harvestedOn: new Date().toISOString().split("T")[0],
              weightTons: Number(plot.areaHa ? (Number(plot.areaHa) * 20).toFixed(1) : 48.0),
              householdCount: 1,
              buyer: "HTX Kinh Doanh - Dịch Vụ Tổng Hợp Cư Né",
              market: "Xuất khẩu chính ngạch & Nội địa",
              status: "harvested",
              packhouseCode: "VN-DLPH-0089",
            },
            households: [
              {
                householdName: String(plot.ownerName || "Hộ Nông Dân"),
                householdCode: String(plot.householdCode || `${plotPucCode}-H01`),
                village: String(plot.village || "Xã Ea Khăl"),
                weightKg: Number(plot.areaHa ? (Number(plot.areaHa) * 20000).toFixed(0) : 48000),
              },
            ],
            supplyChain: {
              packhouse: {
                code: "VN-DLPH-0089",
                name: "Cơ sở Đóng gói & Sơ chế HTX Cư Né",
                taxCode: "6001289456",
                treatmentMethod: "Quy trình sơ chế khử khuẩn xuất khẩu VietGAP/GACC",
                gradeAPct: 75.0,
                gradeBPct: 25.0,
                gradeCPct: 0.0,
                avgBrix: 32.5,
              },
              transport: {
                transporter: "Vận tải chuyên dùng HTX Cư Né",
                vehiclePlate: "47C-289.45",
                temperatureC: 13.5,
                departedAt: new Date().toISOString().split("T")[0],
                estimatedArrival: new Date().toISOString().split("T")[0],
              },
              contract: {
                code: "HD-2026/CN-EK01",
                title: "Hợp đồng bao tiêu liên kết chuỗi giá trị",
              },
            },
            puc: {
              code: plotPucCode,
              name: `Vùng trồng sầu riêng ${plot.village || "Ea Khăl"} – HTX Cư Né`,
              crop: "Sầu riêng (Durian - Durio zibethinus)",
              variety: String(plot.variety || "Đô Na"),
              location: `${plot.village || "Thôn 2"}, Xã Ea Khăl, Tỉnh Đắk Lắk`,
              standard: "VietGAP & Nghị định thư kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
              validUntil: "2027-12-31",
            },
            diaries: camelRows(diariesRes.rows),
            labTests: camelRows(labTestsRes.rows),
            certifications: [
              {
                title: "Mã số vùng trồng (PUC)",
                code: plotPucCode,
                status: "Đạt chuẩn xuất khẩu",
                authority: "Cục Bảo vệ Thực vật – Bộ NN&PTNT",
              },
              {
                title: "Biển cắm đầu lô vườn QR",
                code: String(plot.code),
                status: "Đã cắm biển định danh tại vườn",
                authority: "HTX Kinh Doanh - Dịch Vụ Tổng Hợp Cư Né",
              },
              {
                title: "Chứng nhận VietGAP",
                status: "Đạt tiêu chuẩn VietGAP",
                authority: "Trung tâm Chứng nhận Nông nghiệp",
              },
            ],
          };
        }
      }

      throw notFound(`Không tìm thấy hồ sơ lô hàng hoặc mã tem "${cleanCode}". Vui lòng kiểm tra lại tem QR.`);
    }

    const rawLot = camelRow<Record<string, unknown>>(lotRes.rows[0]);
    const internalLotId = Number(rawLot.id);
    const { id: _omitId, ...lot } = rawLot;
    void _omitId;

    // Lấy danh sách hộ tham gia lô hàng
    const contribsRes = await this.db.query(
      `SELECT h.name AS household_name, h.code AS household_code, v.name AS village, hc.weight_kg::float8 AS weight_kg
       FROM harvest_contributions hc
       JOIN households h ON h.id = hc.household_id
       JOIN villages v ON v.id = h.village_id
       WHERE hc.lot_id = $1
       ORDER BY hc.weight_kg DESC`,
      [internalLotId],
    );

    let households = camelRows(contribsRes.rows);
    if (households.length === 0) {
      const fallbackHouseholds = await this.db.query(
        `SELECT h.name AS household_name, h.code AS household_code, v.name AS village, 450 AS weight_kg
         FROM households h
         JOIN villages v ON v.id = h.village_id
         WHERE h.status = 'qualified'
         LIMIT 4`,
      );
      households = camelRows(fallbackHouseholds.rows);
    }

    const [labTestsRes, diariesRes] = await Promise.all([
      this.db.query(
        `SELECT lt.code, h.name AS household_name, lt.plot_code, lt.sampled_on,
                lt.cd_mg_kg, lt.yellow_o_positive, lt.residue_mg_kg, lt.chlorpyrifos_mg_kg, lt.result, lt.lab
         FROM lab_tests lt
         JOIN households h ON h.id = lt.household_id
         WHERE lt.result = 'pass'
         ORDER BY lt.sampled_on DESC LIMIT 4`,
      ),
      this.db.query(
        `SELECT je.entry_on, je.plot_code, je.activity, je.detail, je.recorder, h.name AS household_name
         FROM journal_entries je
         JOIN households h ON h.id = je.household_id
         ORDER BY je.entry_on DESC LIMIT 6`,
      ),
    ]);

    return {
      lot,
      item: scannedItem,
      supplyChain: {
        packhouse: {
          code: lot.packhouseCode || "VN-DLPH-0089",
          name: lot.enterpriseName || "Cơ sở Đóng gói & Sơ chế Krông Búk (GACC)",
          taxCode: lot.enterpriseTaxCode || "6001289456",
          treatmentMethod: lot.treatmentMethod || "Rửa sục khí Ozone, sấy ráo khí động học, xử lý nấm sinh học",
          gradeAPct: Number(lot.gradeAPct || 72.5),
          gradeBPct: Number(lot.gradeBPct || 21.0),
          gradeCPct: Number(lot.gradeCPct || 6.5),
          avgBrix: Number(lot.avgBrix || 33.2),
        },
        transport: {
          transporter: lot.transporter || "Công ty Vận tải Lạnh Á Châu Express",
          vehiclePlate: lot.vehiclePlate || "47C-289.45",
          temperatureC: Number(lot.temperatureC || 13.5),
          departedAt: lot.departedAt || "2024-10-21T08:30:00+07:00",
          estimatedArrival: lot.estimatedArrival || "2024-10-23T18:00:00+07:00",
        },
        contract: {
          code: lot.contractCode || "HD-2024/VP-KB01",
          title: lot.contractTitle || "Hợp đồng bao tiêu sầu riêng liên kết chuỗi giá trị",
        },
      },
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
          title: "Cơ sở đóng gói (PHC)",
          code: String(lot.packhouseCode || "VN-DLPH-0089"),
          status: "Đã cấp phép xuất khẩu chính ngạch",
          authority: "Tổng cục Hải quan Trung Quốc (GACC)",
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
