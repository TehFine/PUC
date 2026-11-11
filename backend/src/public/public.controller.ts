import { Controller, Get, Header, Param } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators";
import { notFound } from "../common/errors/app.exception";
import { camelRow, camelRows, publicAttachmentUrlSql } from "../common/sql/rows";
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

  /** Danh sách mã lô thu hoạch & mã tem mẫu để hiển thị trên trang cổng tra cứu công khai `/trace`. */
  @Public()
  @Get("trace-samples")
  @Header("Cache-Control", "public, max-age=120")
  async traceSamples() {
    const [lotsRes, stampsRes, plotsRes] = await Promise.all([
      this.db.query(
        `SELECT 'lot'::text AS sample_type, code, harvested_on, (weight_tons * 1000)::float8 AS weight_kg,
                NULL::float8 AS area_ha, buyer, market, status
         FROM harvest_lots
         ORDER BY harvested_on DESC, id DESC
         LIMIT 6`,
      ),
      this.db.query(
        `SELECT fs.serial_code AS code, fs.fruit_weight_kg::float8 AS weight_kg, fs.grade,
                COALESCE(fs.harvest_date::text, fs.activated_at::date::text) AS issued_at,
                fs.plot_code AS lot_code, h.name AS household_name
         FROM farmer_stamps fs
         JOIN households h ON h.id = fs.household_id
         ORDER BY fs.activated_at DESC NULLS LAST, fs.id DESC
         LIMIT 6`,
      ),
      this.db.query(
        `SELECT 'plot'::text AS sample_type, p.code, NULL::date AS harvested_on, NULL::float8 AS weight_kg,
                p.area_ha::float8 AS area_ha,
                ('Hộ ' || COALESCE(p.owner_name, h.name, 'thành viên HTX')) AS buyer,
                COALESCE(p.zone_code, '66-PUC-SR0001-00728') AS market,
                p.status
         FROM plots p
         LEFT JOIN households h ON h.id = p.household_id
         ORDER BY p.id ASC
         LIMIT 6`,
      ),
    ]);
    return {
      lots: camelRows(lotsRes.rows.length > 0 ? lotsRes.rows : plotsRes.rows),
      stamps: camelRows(stampsRes.rows),
    };
  }

  /** Chuẩn hóa địa danh hành chính thực tế từ tên thôn và mã vùng trồng (Ea Khăl vs Cư Né - Krông Búk). */
  private resolveLocationDisplay(village?: unknown, zoneCode?: unknown): string {
    const v = typeof village === "string" ? village.trim() : "";
    const z = typeof zoneCode === "string" ? zoneCode.trim() : "";
    if (v && (/xã\s/i.test(v) || /đắk\s*lắk/i.test(v))) {
      return /đắk\s*lắk/i.test(v) ? v : `${v}, Tỉnh Đắk Lắk`;
    }
    const isEaKhal = /ea\s*kh[aă]l|ea\s*k'?s[oô]/i.test(v) || /^66-PUC-SR0001-/i.test(z);
    const commune = isEaKhal ? "Xã Ea Khăl, Tỉnh Đắk Lắk" : "Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk";
    return v ? `${v}, ${commune}` : commune;
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
    const verifiedAt = new Date().toISOString();
    const hasPlots =
      (await this.db.query<{ reg: string | null }>("SELECT to_regclass('public.plots') AS reg")).rows[0]
        ?.reg !== null;

    // 0. Kiểm tra nếu mã quét là tem định danh cấp trực tiếp cho Nông hộ
    const farmerStampSql = hasPlots
      ? `SELECT fs.household_id, fs.plot_code, fs.serial_code, fs.status,
                fs.activated_at, fs.fruit_weight_kg::float8 AS fruit_weight_kg, fs.grade, fs.harvest_date,
                h.name AS household_name, h.status AS household_status,
                h.code AS household_code, v.name AS village_name,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                p.zone_code, p.variety, COALESCE(p.area_ha, h.area_ha)::float8 AS area_ha, p.planted_year,
                p.sheet_no, p.parcel_no, p.source AS plot_source, p.status AS plot_status,
                ST_AsGeoJSON(p.geom) AS geometry_json,
                ST_Y(ST_Centroid(p.geom))::float8 AS lat,
                ST_X(ST_Centroid(p.geom))::float8 AS lng
         FROM farmer_stamps fs
         JOIN households h ON h.id = fs.household_id
         JOIN villages v ON v.id = h.village_id
         LEFT JOIN plots p ON upper(p.code) = upper(fs.plot_code)
         WHERE upper(fs.serial_code) = upper($1)
         LIMIT 1`
      : `SELECT fs.household_id, fs.plot_code, fs.serial_code, fs.status,
                fs.activated_at, fs.fruit_weight_kg::float8 AS fruit_weight_kg, fs.grade, fs.harvest_date,
                h.name AS household_name, h.status AS household_status,
                h.code AS household_code, v.name AS village_name,
                ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                NULL::text AS zone_code, NULL::text AS variety, h.area_ha::float8 AS area_ha, NULL::int AS planted_year,
                NULL::text AS sheet_no, NULL::text AS parcel_no, NULL::text AS plot_source, NULL::text AS plot_status,
                NULL::text AS geometry_json, NULL::float8 AS lat, NULL::float8 AS lng
         FROM farmer_stamps fs
         JOIN households h ON h.id = fs.household_id
         JOIN villages v ON v.id = h.village_id
         WHERE upper(fs.serial_code) = upper($1)
         LIMIT 1`;

    const farmerStampRes = await this.db.query(farmerStampSql, [cleanCode]);

    if (farmerStampRes.rowCount && farmerStampRes.rows[0]) {
      const rawStamp = camelRow<Record<string, unknown>>(farmerStampRes.rows[0]);
      const householdId = Number(rawStamp.householdId);
      const stampPlotCode = typeof rawStamp.plotCode === "string" && rawStamp.plotCode.trim() ? rawStamp.plotCode.trim() : null;
      const { householdId: _omitHouseholdId, ...farmerStamp } = rawStamp;
      void _omitHouseholdId;

      const [diariesRes, labTestsRes, contribSumRes] = await Promise.all([
        this.db.query(
          `SELECT entry_on, plot_code, activity, detail, recorder, kind, mrl_status, isolation_days
           FROM (
             SELECT sr.sprayed_on AS entry_on,
                    COALESCE(sr.plot_code, '') AS plot_code,
                    ('Phun thuốc BVTV (' || p.name || ')') AS activity,
                    ('Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày (' ||
                      CASE
                        WHEN sr.mrl_status <> 'pass' THEN 'VƯỢT NGƯỠNG'
                        WHEN sr.isolation_days > 0 AND (sr.sprayed_on + sr.isolation_days) > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                          THEN 'ĐANG CÁCH LY ĐẾN ' || to_char(sr.sprayed_on + sr.isolation_days, 'DD/MM/YYYY')
                        ELSE 'AN TOÀN'
                      END || ')') AS detail,
                    h.name AS recorder,
                    'spray'::text AS kind,
                    sr.mrl_status,
                    sr.isolation_days,
                    sr.id AS sort_id
             FROM spray_records sr
             JOIN pesticides p ON p.id = sr.pesticide_id
             JOIN households h ON h.id = sr.household_id
             WHERE sr.household_id = $1
             UNION ALL
             SELECT je.entry_on,
                    je.plot_code,
                    je.activity,
                    je.detail,
                    je.recorder,
                    'journal'::text AS kind,
                    NULL::text AS mrl_status,
                    NULL::int AS isolation_days,
                    je.id AS sort_id
             FROM journal_entries je
             WHERE je.household_id = $1
           ) combined
           ORDER BY entry_on DESC, sort_id DESC
           LIMIT 10`,
          [householdId],
        ),
        this.db.query(
          `SELECT code, plot_code, sampled_on, cd_mg_kg::float8 AS cd_mg_kg, yellow_o_positive,
                  residue_mg_kg::float8 AS residue_mg_kg, chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg, result, lab
           FROM lab_tests
           WHERE household_id = $1
           ORDER BY (CASE WHEN $2::text IS NOT NULL AND upper(plot_code) = upper($2) THEN 0 ELSE 1 END),
                    sampled_on DESC, id DESC
           LIMIT 4`,
          [householdId, stampPlotCode],
        ),
        this.db.query<{ contributed_kg: number; lot_count: number }>(
          `SELECT COALESCE(SUM(hc.weight_kg), 0)::float8 AS contributed_kg,
                  COUNT(*)::int AS lot_count
           FROM harvest_contributions hc
           WHERE hc.household_id = $1`,
          [householdId],
        ),
      ]);

      const stampWeightKg =
        farmerStamp.fruitWeightKg !== null && farmerStamp.fruitWeightKg !== undefined
          ? Number(farmerStamp.fruitWeightKg)
          : null;
      const contribRow = contribSumRes.rows[0] ?? { contributed_kg: 0, lot_count: 0 };

      const harvestDateStr = farmerStamp.harvestDate
        ? String(farmerStamp.harvestDate)
        : farmerStamp.activatedAt
          ? String(farmerStamp.activatedAt).split("T")[0]
          : "";

      const derivedZoneFromHousehold = String(farmerStamp.householdCode || "").replace(/-(?:H|T)\d+$/i, "");
      const resolvedPucCode = String(
        farmerStamp.zoneCode ||
          (derivedZoneFromHousehold && derivedZoneFromHousehold !== farmerStamp.householdCode
            ? derivedZoneFromHousehold
            : "VN-DLOR-0086"),
      );
      const stampLocation = this.resolveLocationDisplay(farmerStamp.villageName, resolvedPucCode);
      const stampLabTests = camelRows<{ result: string; code: string }>(labTestsRes.rows);

      return {
        verifiedAt,
        stampType: "farmer_fruit",
        isFarmerStamp: true,
        farmerStamp,
        lot:
          stampWeightKg !== null
            ? {
                code: String(farmerStamp.serialCode),
                qrCode: String(farmerStamp.serialCode),
                harvestedOn: harvestDateStr,
                weightTons: Number((stampWeightKg / 1000).toFixed(4)),
                householdCount: 1,
                buyer: "HTX Kinh Doanh - Dịch Vụ Tổng Hợp Cư Né",
                market: "Xuất khẩu chính ngạch & Nội địa",
                status: farmerStamp.status === "activated" ? "harvested" : "allocated",
                packhouseCode: "VN-DLPH-0089",
              }
            : null,
        households: [
          {
            householdName: String(farmerStamp.householdName),
            householdCode: String(farmerStamp.householdCode),
            village: String(farmerStamp.villageName || "Chưa gán thôn"),
            avatarUrl: (farmerStamp.avatarUrl as string | null) ?? null,
            weightKg: stampWeightKg,
            contributedKg: contribRow.contributed_kg > 0 ? contribRow.contributed_kg : null,
            lotCount: contribRow.lot_count,
            areaHa: farmerStamp.areaHa !== null && farmerStamp.areaHa !== undefined ? Number(farmerStamp.areaHa) : null,
          },
        ],
        puc: {
          code: resolvedPucCode,
          name: `Vùng trồng sầu riêng ${farmerStamp.villageName || "HTX Cư Né"}`,
          crop: "Sầu riêng (Durian - Durio zibethinus)",
          variety: (farmerStamp.variety as string) || "Chưa cập nhật giống",
          location: stampLocation,
          standard: "VietGAP & Nghị định thư kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
          validUntil: "2027-12-31",
        },
        diaries: camelRows(diariesRes.rows),
        labTests: stampLabTests,
        certifications: [
          {
            title: "Mã số vùng trồng (PUC)",
            code: resolvedPucCode,
            status:
              farmerStamp.plotStatus === "violation" || farmerStamp.householdStatus === "violation"
                ? "Tạm dừng mã vùng trồng"
                : farmerStamp.plotStatus === "pending" || farmerStamp.householdStatus === "pending"
                  ? "Đang thẩm định hồ sơ"
                  : "Đã cấp mã vùng trồng",
            authority: "Chi cục Trồng trọt & BVTV Đắk Lắk / Cục BVTV",
          },
          {
            title: "Kiểm soát tem Nông hộ",
            code: String(farmerStamp.serialCode),
            status:
              farmerStamp.status === "activated"
                ? "Đã kích hoạt thu hái tại vườn"
                : farmerStamp.status === "revoked"
                  ? "Tem đã thu hồi"
                  : "Tem đã cấp nhưng chưa kích hoạt",
            authority: "Hệ thống quản lý HTX Cư Né",
          },
          {
            title: "Kiểm nghiệm an toàn thực phẩm",
            code: stampLabTests[0]?.code,
            status: stampLabTests[0]
              ? stampLabTests[0].result === "pass"
                ? "Mẫu gần nhất đạt chuẩn"
                : "Mẫu gần nhất không đạt"
              : "Chưa có mẫu kiểm nghiệm",
            authority: "Đơn vị kiểm nghiệm độc lập",
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
              l.packhouse_code, l.grade_a_pct::float8 AS grade_a_pct, l.grade_b_pct::float8 AS grade_b_pct,
              l.grade_c_pct::float8 AS grade_c_pct, l.avg_brix::float8 AS avg_brix, l.treatment_method,
              l.transporter, l.vehicle_plate, l.temperature_c::float8 AS temperature_c, l.departed_at, l.estimated_arrival,
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
          `SELECT p.household_id, p.code, p.sheet_no, p.parcel_no, p.source,
                  COALESCE(p.owner_name, h.name) AS owner_name,
                  COALESCE(p.village, v.name) AS village, p.zone_code, p.variety, p.planted_year,
                  p.area_ha::float8 AS area_ha,
                  ROUND((ST_Area(p.geom::geography) / 10000.0)::numeric, 4)::float8 AS gis_area_ha,
                  p.status, p.updated_at,
                  h.code AS household_code, h.status AS household_status,
                  ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
                  ST_AsGeoJSON(p.geom) AS geometry_json,
                  ST_Y(ST_Centroid(p.geom))::float8 AS lat,
                  ST_X(ST_Centroid(p.geom))::float8 AS lng
           FROM plots p
           LEFT JOIN households h ON h.id = p.household_id
           LEFT JOIN villages v ON v.id = h.village_id
           WHERE upper(p.code) = upper($1)
           LIMIT 1`,
          [cleanCode],
        );

        if (plotRes.rowCount && plotRes.rows[0]) {
          const rawPlot = camelRow<Record<string, unknown>>(plotRes.rows[0]);
          const plotHouseholdId =
            rawPlot.householdId !== null && rawPlot.householdId !== undefined
              ? Number(rawPlot.householdId)
              : null;
          const { householdId: _omitPlotHouseholdId, ...plot } = rawPlot;
          void _omitPlotHouseholdId;

          const derivedHouseholdZone = String(plot.householdCode || "").replace(/-(?:H|T)\d+$/i, "");
          const realZoneCode =
            typeof plot.zoneCode === "string" && plot.zoneCode.trim()
              ? plot.zoneCode.trim()
              : derivedHouseholdZone && derivedHouseholdZone !== plot.householdCode
                ? derivedHouseholdZone
                : null;
          const plotPucCode = realZoneCode || "Chưa cấp mã PUC";
          const plotLocation = this.resolveLocationDisplay(plot.village, realZoneCode);

          const [diariesRes, diaryStatsRes, labTestsRes, violationsRes, plotContribsRes] = await Promise.all([
            this.db.query(
              `SELECT entry_on, plot_code, activity, detail, recorder, kind, mrl_status, isolation_days
               FROM (
                 SELECT sr.sprayed_on AS entry_on,
                        COALESCE(sr.plot_code, $1::text) AS plot_code,
                        ('Phun thuốc BVTV (' || p.name || ')') AS activity,
                        ('Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày (' ||
                          CASE
                            WHEN sr.mrl_status <> 'pass' THEN 'VƯỢT NGƯỠNG'
                            WHEN sr.isolation_days > 0 AND (sr.sprayed_on + sr.isolation_days) > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                              THEN 'ĐANG CÁCH LY ĐẾN ' || to_char(sr.sprayed_on + sr.isolation_days, 'DD/MM/YYYY')
                            ELSE 'AN TOÀN'
                          END || ')') AS detail,
                        h.name AS recorder,
                        'spray'::text AS kind,
                        sr.mrl_status,
                        sr.isolation_days,
                        sr.id AS sort_id
                 FROM spray_records sr
                 JOIN pesticides p ON p.id = sr.pesticide_id
                 JOIN households h ON h.id = sr.household_id
                 WHERE upper(sr.plot_code) = upper($1)
                    OR ($2::bigint IS NOT NULL AND sr.household_id = $2 AND (sr.plot_code IS NULL OR sr.plot_code = ''))
                 UNION ALL
                 SELECT je.entry_on,
                        je.plot_code,
                        je.activity,
                        je.detail,
                        je.recorder,
                        'journal'::text AS kind,
                        NULL::text AS mrl_status,
                        NULL::int AS isolation_days,
                        je.id AS sort_id
                 FROM journal_entries je
                 WHERE upper(je.plot_code) = upper($1)
               ) combined
               ORDER BY entry_on DESC, sort_id DESC
               LIMIT 10`,
              [plot.code, plotHouseholdId],
            ),
            this.db.query<{
              diary_count: number;
              last_diary_on: string | null;
              active_isolation_until: string | null;
              has_mrl_violation: boolean;
            }>(
              `WITH plot_sprays AS (
                 SELECT sr.sprayed_on, sr.isolation_days, sr.mrl_status
                 FROM spray_records sr
                 WHERE upper(sr.plot_code) = upper($1)
                    OR ($2::bigint IS NOT NULL AND sr.household_id = $2 AND (sr.plot_code IS NULL OR sr.plot_code = ''))
               ),
               plot_journals AS (
                 SELECT je.entry_on
                 FROM journal_entries je
                 WHERE upper(je.plot_code) = upper($1)
               )
               SELECT (
                        (SELECT COUNT(*) FROM plot_sprays) +
                        (SELECT COUNT(*) FROM plot_journals)
                      )::int AS diary_count,
                      GREATEST(
                        (SELECT MAX(sprayed_on) FROM plot_sprays),
                        (SELECT MAX(entry_on) FROM plot_journals)
                      )::text AS last_diary_on,
                      (
                        SELECT MAX(sprayed_on + isolation_days)::text
                        FROM plot_sprays
                        WHERE isolation_days > 0
                          AND (sprayed_on + isolation_days) > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                      ) AS active_isolation_until,
                      COALESCE((SELECT BOOL_OR(mrl_status <> 'pass') FROM plot_sprays), false) AS has_mrl_violation`,
              [plot.code, plotHouseholdId],
            ),
            this.db.query(
              `SELECT code, plot_code, sampled_on, cd_mg_kg::float8 AS cd_mg_kg, yellow_o_positive,
                      residue_mg_kg::float8 AS residue_mg_kg, chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg, result, lab
               FROM lab_tests
               WHERE upper(plot_code) = upper($1)
               ORDER BY sampled_on DESC, id DESC
               LIMIT 4`,
              [plot.code],
            ),
            this.db.query(
              `SELECT severity, title, detected_on, plot_code, description
               FROM violations
               WHERE status = 'open'
                 AND (
                   upper(plot_code) = upper($1)
                   OR ($2::bigint IS NOT NULL AND household_id = $2 AND (plot_code IS NULL OR upper(plot_code) = upper($1)))
                 )
               ORDER BY detected_on DESC, id DESC
               LIMIT 5`,
              [plot.code, plotHouseholdId],
            ),
            plotHouseholdId
              ? this.db.query(
                  `SELECT hl.code, hl.qr_code, hl.harvested_on, hl.weight_tons::float8 AS weight_tons,
                          hl.household_count, hl.buyer, hl.market, hl.status, hl.packhouse_code,
                          hc.weight_kg::float8 AS contributed_kg
                   FROM harvest_contributions hc
                   JOIN harvest_lots hl ON hl.id = hc.lot_id
                   WHERE hc.household_id = $1
                   ORDER BY hl.harvested_on DESC, hc.id DESC`,
                  [plotHouseholdId],
                )
              : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
          ]);

          const realPlotContribs = camelRows<{
            code: string;
            qrCode: string | null;
            harvestedOn: string;
            weightTons: number;
            householdCount: number;
            buyer: string;
            market: string;
            status: string;
            packhouseCode: string | null;
            contributedKg: number;
          }>(plotContribsRes.rows);

          const totalContributedKg = realPlotContribs.reduce(
            (sum, item) => sum + Number(item.contributedKg || 0),
            0,
          );
          const latestRealLot = realPlotContribs[0] ?? null;
          const statsRow = diaryStatsRes.rows[0] ?? {
            diary_count: 0,
            last_diary_on: null,
            active_isolation_until: null,
            has_mrl_violation: false,
          };
          const openViolations = camelRows<{
            severity: "critical" | "warning";
            title: string;
            detectedOn: string;
            plotCode: string | null;
            description: string | null;
          }>(violationsRes.rows);
          const plotLabTests = camelRows<{
            code: string;
            plotCode: string;
            sampledOn: string;
            cdMgKg: number;
            yellowOPositive: boolean;
            residueMgKg: number;
            chlorpyrifosMgKg: number | null;
            result: string;
            lab: string;
          }>(labTestsRes.rows);
          const latestLab = plotLabTests[0] ?? null;

          return {
            verifiedAt,
            stampType: "plot_signboard",
            isPlotSignboard: true,
            plot: {
              ...plot,
              zoneCode: realZoneCode,
            },
            compliance: {
              plotStatus: String(plot.status || "pending"),
              householdStatus: (plot.householdStatus as string | null) ?? null,
              hasZoneCode: Boolean(realZoneCode),
              hasGisBoundary: Boolean(plot.geometryJson),
              gisSource: (plot.source as string | null) ?? "declared",
              diaryCount: Number(statsRow.diary_count || 0),
              lastDiaryOn: statsRow.last_diary_on,
              activeIsolationUntil: statsRow.active_isolation_until,
              hasMrlViolation: Boolean(statsRow.has_mrl_violation),
              openViolationsCount: openViolations.length,
              openViolations,
              latestLabResult: latestLab ? latestLab.result : null,
              latestLabCode: latestLab ? latestLab.code : null,
            },
            lot: latestRealLot
              ? {
                  code: latestRealLot.code,
                  qrCode: latestRealLot.qrCode || latestRealLot.code,
                  harvestedOn: latestRealLot.harvestedOn,
                  weightTons: latestRealLot.weightTons,
                  householdCount: latestRealLot.householdCount,
                  buyer: latestRealLot.buyer,
                  market: latestRealLot.market,
                  status: latestRealLot.status,
                  packhouseCode: latestRealLot.packhouseCode || undefined,
                }
              : null,
            households: [
              {
                householdName: String(plot.ownerName || "Chưa cập nhật chủ hộ"),
                householdCode: String(plot.householdCode || "Chưa gán mã hộ"),
                village: String(plot.village || "Chưa gán thôn"),
                avatarUrl: (plot.avatarUrl as string | null) ?? null,
                weightKg: totalContributedKg > 0 ? totalContributedKg : null,
                contributedKg: totalContributedKg > 0 ? totalContributedKg : null,
                lotCount: realPlotContribs.length,
                areaHa: plot.areaHa !== null && plot.areaHa !== undefined ? Number(plot.areaHa) : null,
              },
            ],
            puc: {
              code: plotPucCode,
              name: plot.village
                ? `Vùng trồng sầu riêng ${plot.village} – HTX Cư Né`
                : "Vùng trồng sầu riêng liên kết HTX Cư Né",
              crop: "Sầu riêng (Durian - Durio zibethinus)",
              variety: String(plot.variety || "Chưa cập nhật giống"),
              location: plotLocation,
              standard: "VietGAP & Nghị định thư kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
              validUntil: "2027-12-31",
            },
            diaries: camelRows(diariesRes.rows),
            labTests: plotLabTests,
            certifications: [
              {
                title: "Mã số vùng trồng (PUC)",
                code: realZoneCode ?? undefined,
                status:
                  !realZoneCode
                    ? "Chưa được cấp mã vùng trồng"
                    : plot.status === "approved"
                      ? "Đã cấp mã & duyệt ranh giới"
                      : plot.status === "pending"
                        ? "Đang chờ thẩm định hồ sơ"
                        : plot.status === "improve"
                          ? "Cần khắc phục kỹ thuật"
                          : "Tạm dừng mã vùng trồng",
                authority: "Chi cục Trồng trọt & BVTV tỉnh Đắk Lắk",
              },
              {
                title: "Thực hành canh tác VietGAP",
                status:
                  openViolations.length > 0 || statsRow.has_mrl_violation
                    ? "Đang có cảnh báo vi phạm kỹ thuật"
                    : statsRow.active_isolation_until
                      ? `Đang cách ly thuốc BVTV đến ${statsRow.active_isolation_until}`
                      : Number(statsRow.diary_count || 0) > 0
                        ? `Đã ghi nhận ${statsRow.diary_count} nhật ký canh tác`
                        : "Chưa ghi nhận nhật ký canh tác trên hệ thống",
                authority: "Ban Kỹ thuật & Khuyến nông HTX Cư Né",
              },
              {
                title: "Kiểm nghiệm an toàn thực phẩm (GACC)",
                code: latestLab?.code,
                status: latestLab
                  ? latestLab.result === "pass"
                    ? "Mẫu kiểm nghiệm gần nhất đạt chuẩn"
                    : "Mẫu kiểm nghiệm gần nhất vượt ngưỡng"
                  : "Chưa có phiếu kiểm nghiệm cho lô đất này",
                authority: latestLab?.lab || "Trung tâm kiểm nghiệm được chỉ định",
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

    // Lấy danh sách hộ thực tế đã đóng góp vào lô hàng (không tự bịa số liệu khi chưa có đóng góp)
    const contribsRes = await this.db.query(
      `SELECT h.name AS household_name, h.code AS household_code, v.name AS village,
              ${publicAttachmentUrlSql("h.avatar_id")} AS avatar_url,
              hc.weight_kg::float8 AS weight_kg
       FROM harvest_contributions hc
       JOIN households h ON h.id = hc.household_id
       JOIN villages v ON v.id = h.village_id
       WHERE hc.lot_id = $1
       ORDER BY hc.weight_kg DESC`,
      [internalLotId],
    );

    const households = camelRows(contribsRes.rows);

    const [labTestsRes, diariesRes] = await Promise.all([
      this.db.query(
        `SELECT lt.code, h.name AS household_name, lt.plot_code, lt.sampled_on,
                lt.cd_mg_kg::float8 AS cd_mg_kg, lt.yellow_o_positive,
                lt.residue_mg_kg::float8 AS residue_mg_kg, lt.chlorpyrifos_mg_kg::float8 AS chlorpyrifos_mg_kg,
                lt.result, lt.lab
         FROM lab_tests lt
         JOIN households h ON h.id = lt.household_id
         WHERE EXISTS (SELECT 1 FROM harvest_contributions hc WHERE hc.lot_id = $1 AND hc.household_id = lt.household_id)
         ORDER BY lt.sampled_on DESC, lt.id DESC
         LIMIT 4`,
        [internalLotId],
      ),
      this.db.query(
        `SELECT entry_on, plot_code, activity, detail, recorder, household_name, kind, mrl_status, isolation_days
         FROM (
           SELECT sr.sprayed_on AS entry_on,
                  COALESCE(sr.plot_code, '') AS plot_code,
                  ('Phun thuốc BVTV (' || p.name || ')') AS activity,
                  ('Liều lượng: ' || sr.dose || ' | Cách ly PHI: ' || sr.isolation_days || ' ngày (' ||
                    CASE
                      WHEN sr.mrl_status <> 'pass' THEN 'VƯỢT NGƯỠNG'
                      WHEN sr.isolation_days > 0 AND (sr.sprayed_on + sr.isolation_days) > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                        THEN 'ĐANG CÁCH LY ĐẾN ' || to_char(sr.sprayed_on + sr.isolation_days, 'DD/MM/YYYY')
                      ELSE 'AN TOÀN'
                    END || ')') AS detail,
                  h.name AS recorder,
                  h.name AS household_name,
                  'spray'::text AS kind,
                  sr.mrl_status,
                  sr.isolation_days,
                  sr.id AS sort_id
           FROM spray_records sr
           JOIN pesticides p ON p.id = sr.pesticide_id
           JOIN households h ON h.id = sr.household_id
           WHERE EXISTS (SELECT 1 FROM harvest_contributions hc WHERE hc.lot_id = $1 AND hc.household_id = sr.household_id)
           UNION ALL
           SELECT je.entry_on,
                  je.plot_code,
                  je.activity,
                  je.detail,
                  je.recorder,
                  h.name AS household_name,
                  'journal'::text AS kind,
                  NULL::text AS mrl_status,
                  NULL::int AS isolation_days,
                  je.id AS sort_id
           FROM journal_entries je
           JOIN households h ON h.id = je.household_id
           WHERE EXISTS (SELECT 1 FROM harvest_contributions hc WHERE hc.lot_id = $1 AND hc.household_id = je.household_id)
         ) combined
         ORDER BY entry_on DESC, sort_id DESC
         LIMIT 10`,
        [internalLotId],
      ),
    ]);

    const lotLabTests = camelRows<{
      code: string;
      householdName?: string;
      plotCode: string;
      sampledOn: string;
      cdMgKg: number;
      yellowOPositive: boolean;
      residueMgKg: number;
      chlorpyrifosMgKg: number | null;
      result: string;
      lab: string;
    }>(labTestsRes.rows);
    const latestLotLab = lotLabTests[0] ?? null;

    return {
      verifiedAt,
      lot,
      item: scannedItem,
      supplyChain: {
        packhouse: {
          code: (lot.packhouseCode as string) || "VN-DLPH-0089",
          name: (lot.enterpriseName as string) || "Cơ sở Đóng gói & Sơ chế HTX Cư Né",
          taxCode: (lot.enterpriseTaxCode as string) || "",
          treatmentMethod: (lot.treatmentMethod as string) || "",
          gradeAPct: lot.gradeAPct !== null && lot.gradeAPct !== undefined ? Number(lot.gradeAPct) : null,
          gradeBPct: lot.gradeBPct !== null && lot.gradeBPct !== undefined ? Number(lot.gradeBPct) : null,
          gradeCPct: lot.gradeCPct !== null && lot.gradeCPct !== undefined ? Number(lot.gradeCPct) : null,
          avgBrix: lot.avgBrix !== null && lot.avgBrix !== undefined ? Number(lot.avgBrix) : null,
        },
        transport: {
          transporter: (lot.transporter as string) || "",
          vehiclePlate: (lot.vehiclePlate as string) || "",
          temperatureC: lot.temperatureC !== null && lot.temperatureC !== undefined ? Number(lot.temperatureC) : null,
          departedAt: (lot.departedAt as string) || "",
          estimatedArrival: (lot.estimatedArrival as string) || "",
        },
        ...(lot.contractCode
          ? {
              contract: {
                code: String(lot.contractCode),
                title: String(lot.contractTitle || "Hợp đồng liên kết tiêu thụ nông sản"),
              },
            }
          : {}),
      },
      puc: {
        code: "VN-DLOR-0086",
        name: "Vùng trồng sầu riêng HTX Nông nghiệp Cư Né",
        crop: "Sầu riêng (Durian - Durio zibethinus)",
        variety: "Monthong (Đô Na) & Ri6 Đắk Lắk",
        location: "Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk",
        standard: "VietGAP & Nghị định thư kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
        validUntil: "2027-12-31",
      },
      households,
      labTests: lotLabTests,
      diaries: camelRows(diariesRes.rows),
      certifications: [
        {
          title: "Mã số vùng trồng (PUC)",
          code: "VN-DLOR-0086",
          status: "Đã đăng ký xuất khẩu",
          authority: "Cục Bảo vệ Thực vật – Bộ NN&PTNT",
        },
        {
          title: "Cơ sở đóng gói (PHC)",
          code: String(lot.packhouseCode || "VN-DLPH-0089"),
          status: "Đủ điều kiện đóng gói xuất khẩu",
          authority: "Tổng cục Hải quan Trung Quốc (GACC)",
        },
        {
          title: "Kiểm nghiệm Cadimi (Cd)",
          standard: "≤ 0.05 mg/kg (Mức tối đa cho phép)",
          status: latestLotLab
            ? Number(latestLotLab.cdMgKg) <= 0.05
              ? `Đạt (${latestLotLab.cdMgKg} mg/kg)`
              : `Vượt ngưỡng (${latestLotLab.cdMgKg} mg/kg)`
            : "Chưa có phiếu kiểm nghiệm",
          authority: latestLotLab?.lab || "Đơn vị kiểm nghiệm độc lập",
        },
        {
          title: "Kiểm tra chất cấm Vàng O (Auramine O)",
          standard: "Tuyệt đối không được phép sử dụng",
          status: latestLotLab
            ? latestLotLab.yellowOPositive
              ? "Không đạt (Phát hiện dương tính)"
              : "Âm tính (Không phát hiện)"
            : "Chưa có phiếu kiểm nghiệm",
          authority: latestLotLab?.lab || "Đơn vị kiểm nghiệm độc lập",
        },
      ],
    };
  }
}
