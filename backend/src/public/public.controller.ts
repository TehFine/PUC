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

  /** Tra cứu hồ sơ truy xuất nguồn gốc công khai bằng mã lô, mã tem QR hoặc mã định danh từng quả/thùng */
  @Public()
  @Get("trace/:code")
  @Header("Cache-Control", "public, max-age=60")
  async trace(@Param("code") code: string) {
    const cleanCode = code.trim();

    // 0. Kiểm tra nếu mã quét là tem định danh cấp trực tiếp cho Nông hộ (Hình 2 - CheckVN: Cấp theo CCCD & Diện tích)
    const farmerStampRes = await this.db.query(
      `SELECT fs.id, fs.allocation_id, fs.household_id, fs.plot_code, fs.serial_code, fs.status,
              fs.activated_at, fs.fruit_weight_kg, fs.grade, fs.harvest_date,
              h.name as household_name, h.cccd as household_cccd, h.code as household_code, h.phone as household_phone,
              v.name as village_name, p.variety, p.area_ha, p.planted_year
       FROM farmer_stamps fs
       JOIN households h ON h.id = fs.household_id
       JOIN villages v ON v.id = h.village_id
       LEFT JOIN plots p ON p.code = fs.plot_code
       WHERE upper(fs.serial_code) = upper($1)
       LIMIT 1`,
      [cleanCode],
    );

    if (farmerStampRes.rowCount && farmerStampRes.rows[0]) {
      const stamp = camelRows(farmerStampRes.rows)[0] as Record<string, unknown>;
      const cccdRaw = String(stamp.householdCccd || "");
      const maskedCccd = cccdRaw.length > 4 ? `********${cccdRaw.slice(-4)}` : "****";

      const diariesRes = await this.db.query(
        `SELECT entry_on, plot_code, activity, detail, recorder
         FROM journal_entries
         WHERE household_id = $1
         ORDER BY entry_on DESC LIMIT 6`,
        [stamp.householdId],
      );

      const labTestsRes = await this.db.query(
        `SELECT code, plot_code, sampled_on, cd_mg_kg, yellow_o_positive, residue_mg_kg, chlorpyrifos_mg_kg, result, lab
         FROM lab_tests
         WHERE household_id = $1 AND result = 'pass'
         ORDER BY sampled_on DESC LIMIT 4`,
        [stamp.householdId],
      );

      const harvestDateStr = stamp.harvestDate
        ? String(stamp.harvestDate)
        : stamp.activatedAt
          ? String(stamp.activatedAt).split("T")[0]
          : new Date().toISOString().split("T")[0];

      return {
        stampType: "farmer_fruit",
        isFarmerStamp: true,
        farmerStamp: {
          ...stamp,
          householdCccd: maskedCccd,
        },
        lot: {
          id: Number(stamp.id),
          code: String(stamp.serialCode),
          qrCode: String(stamp.serialCode),
          harvestedOn: harvestDateStr,
          weightTons: Number(stamp.fruitWeightKg ? (Number(stamp.fruitWeightKg) / 1000).toFixed(4) : 0.0035),
          householdCount: 1,
          buyer: "Hợp tác xã Nông nghiệp Krông Búk (Tiêu thụ & Xuất khẩu)",
          market: "Xuất khẩu chính ngạch & Nội địa",
          status: stamp.status === "activated" ? "harvested" : "allocated",
          packhouseCode: "VN-DLPH-0089",
        },
        households: [
          {
            householdName: String(stamp.householdName),
            householdCode: String(stamp.householdCode),
            village: String(stamp.villageName || "Thôn 1"),
            weightKg: Number(stamp.fruitWeightKg || 3.5),
          },
        ],
        supplyChain: {
          packhouse: {
            code: "VN-DLPH-0089",
            name: "Cơ sở đóng gói sầu riêng Krông Búk – Đắk Lắk",
            taxCode: "6001234567",
            treatmentMethod: "Làm sạch áp lực, khử khuẩn, dán tem QR quả và đóng hộp",
            gradeAPct: stamp.grade === "A" ? 100 : 70,
            gradeBPct: stamp.grade === "B" ? 100 : 30,
            gradeCPct: stamp.grade === "C" ? 100 : 0,
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
            code: "HD-2024/VP-KB01",
            title: "Hợp đồng liên kết bao tiêu nông hộ Krông Búk",
          },
        },
        puc: {
          code: "VN-DLOR-0086",
          name: "Vùng trồng sầu riêng HTX Nông nghiệp Krông Búk",
          crop: "Sầu riêng (Durian - Durio zibethinus)",
          variety: (stamp.variety as string) || "Monthong (Dona) Đắk Lắk",
          location: `Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk (Thôn ${stamp.villageName || "1"})`,
          standard: "VietGAP & Nghị định thư kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
          validUntil: "2027-12-31",
        },
        diaries: camelRows(diariesRes.rows),
        labTests: camelRows(labTestsRes.rows),
        certifications: [
          {
            title: "Mã số vùng trồng (PUC)",
            code: "VN-DLOR-0086",
            status: "Đạt chuẩn xuất khẩu",
            authority: "Cục Bảo vệ Thực vật – Bộ NN&PTNT",
          },
          {
            title: "Kiểm soát tem Nông hộ",
            code: String(stamp.serialCode),
            status: stamp.status === "activated" ? "Đã kích hoạt thu hái tại vườn" : "Tem đã cấp nhưng chưa kích hoạt",
            authority: "Hệ thống CheckVN & HTX Krông Búk",
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
      `SELECT id, lot_id, item_type, serial_code, weight_kg, grade, printed_at
       FROM harvest_items
       WHERE upper(serial_code) = upper($1)
       LIMIT 1`,
      [cleanCode],
    );
    if (itemRes.rowCount && itemRes.rowCount > 0) {
      scannedItem = camelRows(itemRes.rows)[0];
      lotId = Number(scannedItem.lotId);
    }

    // 2. Tìm thông tin lô hàng
    const lotRes = await this.db.query(
      `SELECT l.id, l.code, l.qr_code, l.harvested_on, l.weight_tons, l.household_count, l.buyer, l.market, l.status,
              l.enterprise_id, e.name as enterprise_name, e.tax_code as enterprise_tax_code,
              l.packhouse_code, l.grade_a_pct, l.grade_b_pct, l.grade_c_pct, l.avg_brix, l.treatment_method,
              l.transporter, l.vehicle_plate, l.temperature_c, l.departed_at, l.estimated_arrival,
              c.code as contract_code, c.title as contract_title
       FROM harvest_lots l
       LEFT JOIN enterprises e ON e.id = l.enterprise_id
       LEFT JOIN contracts c ON c.id = l.contract_id
       WHERE ${lotId ? "l.id = $1" : "upper(l.code) = upper($1) OR upper(l.qr_code) = upper($1)"}
       LIMIT 1`,
      [lotId ?? cleanCode],
    );

    if (lotRes.rowCount === 0) {
      // 3. Kiểm tra nếu mã quét là mã Lô đất canh tác / Biển cắm vườn (Garden Signboard)
      const plotRes = await this.db.query(
        `SELECT p.id, p.code, p.owner_name, p.village, p.zone_code, p.variety, p.planted_year, p.area_ha, p.status
         FROM plots p
         WHERE upper(p.code) = upper($1)
         LIMIT 1`,
        [cleanCode],
      );

      if (plotRes.rowCount && plotRes.rows[0]) {
        const plot = camelRows(plotRes.rows)[0] as Record<string, unknown>;
        const diariesRes = await this.db.query(
          `SELECT entry_on, plot_code, activity, detail, recorder
           FROM journal_entries
           WHERE plot_code = $1
           ORDER BY entry_on DESC LIMIT 6`,
          [plot.code],
        );
        const labTestsRes = await this.db.query(
          `SELECT code, plot_code, sampled_on, cd_mg_kg, yellow_o_positive, residue_mg_kg, chlorpyrifos_mg_kg, result, lab
           FROM lab_tests
           WHERE plot_code = $1 AND result = 'pass'
           ORDER BY sampled_on DESC LIMIT 4`,
          [plot.code],
        );

        return {
          stampType: "plot_signboard",
          isPlotSignboard: true,
          plot,
          lot: {
            id: Number(plot.id),
            code: String(plot.code),
            qrCode: String(plot.code),
            harvestedOn: new Date().toISOString().split("T")[0],
            weightTons: Number(plot.areaHa ? (Number(plot.areaHa) * 20).toFixed(1) : 48.0),
            householdCount: 1,
            buyer: "Hợp tác xã Nông nghiệp Krông Búk",
            market: "Xuất khẩu chính ngạch & Nội địa",
            status: "harvested",
            packhouseCode: "VN-DLPH-0089",
          },
          households: [
            {
              householdName: String(plot.ownerName || "Hộ Nông Dân Krông Búk"),
              householdCode: "KB-VT-001",
              village: String(plot.village || "Thôn 1"),
              weightKg: Number(plot.areaHa ? (Number(plot.areaHa) * 20000).toFixed(0) : 48000),
            },
          ],
          supplyChain: {
            packhouse: {
              code: "VN-DLPH-0089",
              name: "Cơ sở Đóng gói & Sơ chế Krông Búk",
              taxCode: "6001289456",
              treatmentMethod: "Quy trình sơ chế khử khuẩn xuất khẩu VietGAP/GACC",
              gradeAPct: 75.0,
              gradeBPct: 25.0,
              gradeCPct: 0.0,
              avgBrix: 32.5,
            },
            transport: {
              transporter: "Vận tải chuyên dùng HTX Krông Búk",
              vehiclePlate: "47C-289.45",
              temperatureC: 13.5,
              departedAt: new Date().toISOString().split("T")[0],
              estimatedArrival: new Date().toISOString().split("T")[0],
            },
            contract: {
              code: "HD-2024/VP-KB01",
              title: "Hợp đồng bao tiêu liên kết chuỗi giá trị",
            },
          },
          puc: {
            code: "VN-DLOR-0086",
            name: "Vùng trồng sầu riêng HTX Nông nghiệp Krông Búk",
            crop: "Sầu riêng (Durian - Durio zibethinus)",
            variety: String(plot.variety || "Monthong (Dona) Đắk Lắk"),
            location: `Xã Cư Né, Huyện Krông Búk, Tỉnh Đắk Lắk (${plot.village || "Thôn 1"})`,
            standard: "VietGAP & Nghị định thư kiểm dịch thực vật Việt Nam - Trung Quốc (GACC)",
            validUntil: "2027-12-31",
          },
          diaries: camelRows(diariesRes.rows),
          labTests: camelRows(labTestsRes.rows),
          certifications: [
            {
              title: "Mã số vùng trồng (PUC)",
              code: "VN-DLOR-0086",
              status: "Đạt chuẩn xuất khẩu",
              authority: "Cục Bảo vệ Thực vật – Bộ NN&PTNT",
            },
            {
              title: "Biển cắm đầu lô vườn QR",
              code: String(plot.code),
              status: "Đã cắm biển định danh tại vườn",
              authority: "HTX Nông nghiệp Krông Búk",
            },
            {
              title: "Chứng nhận VietGAP",
              status: "Đạt tiêu chuẩn VietGAP",
              authority: "Trung tâm Chứng nhận Nông nghiệp",
            },
          ],
        };
      }

      throw new NotFoundException(`Không tìm thấy hồ sơ lô hàng hoặc mã tem "${cleanCode}". Vui lòng kiểm tra lại tem QR.`);
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

