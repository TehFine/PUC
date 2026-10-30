import type { Pool } from "pg";

export async function seedSupplyChain(pool: Pool, options?: { log?: (msg: string) => void }) {
  const log = options?.log ?? (() => undefined);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Kiểm tra và nạp danh sách Doanh nghiệp liên kết thu mua & Nhà đóng gói
    const entCount = (await client.query<{ count: string }>("SELECT COUNT(*) FROM enterprises")).rows[0].count;
    if (Number(entCount) === 0) {
      await client.query(`
        INSERT INTO enterprises (code, name, tax_code, representative, phone, address, packhouse_code, status)
        VALUES
          ('DN-VINHPHAT', 'Công ty TNHH Nông sản Vĩnh Phát', '6001289456', 'Trần Vĩnh Phát', '0913456789', 'Km 19, QL14, Xã Cư Né, Huyện Krông Búk, Đắk Lắk', 'VN-DLPH-0089', 'active'),
          ('DN-RONGDO', 'Công ty CP Xuất Nhập Khẩu Rồng Đỏ', '0309876543', 'Lê Hoàng Dung', '0908765432', 'Tòa nhà Landmark, 720A Điện Biên Phủ, P.22, Bình Thạnh, TP.HCM', 'VN-DLPH-0112', 'active'),
          ('DN-TAYNGUYEN', 'Công ty TNHH Nông Sản Tây Nguyên Xanh', '6001345678', 'Nguyễn Văn Tây', '0982345678', 'Số 45 Lê Duẩn, Phường Tân Thành, TP. Buôn Ma Thuột, Đắk Lắk', 'VN-DLPH-0155', 'active')
        ON CONFLICT (code) DO NOTHING;
      `);
      log("✔ Đã nạp danh sách Doanh nghiệp liên kết & Cơ sở đóng gói PHC.");
    }

    // 2. Kiểm tra và nạp Hợp đồng thu mua bao tiêu
    const contractCount = (await client.query<{ count: string }>("SELECT COUNT(*) FROM contracts")).rows[0].count;
    if (Number(contractCount) === 0) {
      const vinhPhat = (await client.query<{ id: number }>("SELECT id FROM enterprises WHERE code = 'DN-VINHPHAT'")).rows[0]?.id;
      const rongDo = (await client.query<{ id: number }>("SELECT id FROM enterprises WHERE code = 'DN-RONGDO'")).rows[0]?.id;
      const tayNguyen = (await client.query<{ id: number }>("SELECT id FROM enterprises WHERE code = 'DN-TAYNGUYEN'")).rows[0]?.id;

      if (vinhPhat && rongDo && tayNguyen) {
        await client.query(`
          INSERT INTO contracts (code, enterprise_id, title, signed_on, valid_until, target_tons, price_guarantee, market, status, notes)
          VALUES
            ('HD-2024/VP-KB01', ${vinhPhat}, 'Hợp đồng bao tiêu sầu riêng Dona & Monthong xuất khẩu Trung Quốc vụ 2024', '2024-05-15', '2024-11-30', 120.00, '78.000 – 85.000 đ/kg', 'Trung Quốc', 'active', 'Cam kết kiểm nghiệm dư lượng MRL và kiểm dịch GACC đạt chuẩn.'),
            ('HD-2024/RD-KB02', ${rongDo}, 'Hợp đồng thu mua liên kết chuỗi giá trị sầu riêng Ri6 & Dona', '2024-05-20', '2024-12-15', 150.00, '75.000 – 82.000 đ/kg', 'Trung Quốc', 'active', 'Ưu tiên đóng gói tại nhà máy PHC đạt mã số xuất khẩu.'),
            ('HD-2024/TN-KB03', ${tayNguyen}, 'Hợp đồng tiêu thụ sầu riêng chuẩn VietGAP hệ thống siêu thị nội địa', '2024-06-01', '2024-10-31', 60.00, '65.000 – 72.000 đ/kg', 'Nội địa', 'active', 'Độ ngọt bình quân ≥ 32 Brix, chín tự nhiên không ngâm thuốc.')
          ON CONFLICT (code) DO NOTHING;
        `);
        log("✔ Đã nạp Hợp đồng liên kết bao tiêu nông sản.");
      }
    }

    // 3. Cập nhật liên kết lô hàng với Doanh nghiệp, Hợp đồng và thông tin sơ chế, vận chuyển
    const lots = (await client.query<{ id: number; code: string; buyer: string }>("SELECT id, code, buyer FROM harvest_lots")).rows;
    for (const lot of lots) {
      if (lot.buyer.includes("Vĩnh Phát")) {
        await client.query(`
          UPDATE harvest_lots
          SET
            enterprise_id = (SELECT id FROM enterprises WHERE code = 'DN-VINHPHAT' LIMIT 1),
            contract_id = (SELECT id FROM contracts WHERE code = 'HD-2024/VP-KB01' LIMIT 1),
            packhouse_code = 'VN-DLPH-0089',
            grade_a_pct = 72.5,
            grade_b_pct = 21.0,
            grade_c_pct = 6.5,
            avg_brix = 33.2,
            treatment_method = 'Rửa sục khí Ozone, sấy ráo khí động học, xử lý nấm sinh học',
            transporter = 'Công ty Vận tải Lạnh Á Châu Express',
            vehicle_plate = '47C-289.45',
            temperature_c = 13.5,
            departed_at = '2024-10-21T08:30:00+07:00',
            estimated_arrival = '2024-10-23T18:00:00+07:00'
          WHERE id = $1
        `, [lot.id]);
      } else if (lot.buyer.includes("Rồng Đỏ")) {
        await client.query(`
          UPDATE harvest_lots
          SET
            enterprise_id = (SELECT id FROM enterprises WHERE code = 'DN-RONGDO' LIMIT 1),
            contract_id = (SELECT id FROM contracts WHERE code = 'HD-2024/RD-KB02' LIMIT 1),
            packhouse_code = 'VN-DLPH-0112',
            grade_a_pct = 68.0,
            grade_b_pct = 24.5,
            grade_c_pct = 7.5,
            avg_brix = 32.8,
            treatment_method = 'Rửa siêu âm khử trùng, sấy mát, bao lưới xốp chống dập',
            transporter = 'Logistics Chuỗi Lạnh Tân Cảng',
            vehicle_plate = '51D-912.83',
            temperature_c = 14.0,
            departed_at = '2024-10-16T09:00:00+07:00',
            estimated_arrival = '2024-10-18T16:00:00+07:00'
          WHERE id = $1
        `, [lot.id]);
      }
    }

    // 4. Sinh tem truy xuất quả sầu riêng & thùng hàng mẫu cho lô LH-2024-038
    const lot38 = (await client.query<{ id: number }>("SELECT id FROM harvest_lots WHERE code = 'LH-2024-038'")).rows[0];
    if (lot38) {
      const itemsCount = (await client.query<{ count: string }>("SELECT COUNT(*) FROM harvest_items WHERE lot_id = $1", [lot38.id])).rows[0].count;
      if (Number(itemsCount) === 0) {
        // Sinh 6 tem quả mẫu và 3 tem thùng mẫu
        await client.query(`
          INSERT INTO harvest_items (lot_id, item_type, serial_code, weight_kg, grade, printed_at, status)
          VALUES
            (${lot38.id}, 'fruit', 'LH-2024-038-Q0001', 3.8, 'A', now(), 'active'),
            (${lot38.id}, 'fruit', 'LH-2024-038-Q0002', 3.5, 'A', now(), 'active'),
            (${lot38.id}, 'fruit', 'LH-2024-038-Q0003', 4.1, 'A', now(), 'active'),
            (${lot38.id}, 'fruit', 'LH-2024-038-Q0004', 3.2, 'B', now(), 'active'),
            (${lot38.id}, 'fruit', 'LH-2024-038-Q0005', 3.9, 'A', now(), 'active'),
            (${lot38.id}, 'box',   'LH-2024-038-T001',  18.5, 'A', now(), 'active'),
            (${lot38.id}, 'box',   'LH-2024-038-T002',  18.2, 'A', now(), 'active'),
            (${lot38.id}, 'box',   'LH-2024-038-T003',  18.0, 'B', now(), 'active')
          ON CONFLICT (serial_code) DO NOTHING;
        `);
        log("✔ Đã sinh tem mẫu (Serial quả sầu riêng & tem thùng carton).");
      }
    }

    // 5. Cấp phát tem nông hộ theo CCCD & Diện tích (Hình 2 - CheckVN)
    const householdAn = (await client.query<{ id: number }>("SELECT id FROM households WHERE code = 'KB-VT-001-H001'")).rows[0];
    if (householdAn) {
      const allocCount = (await client.query<{ count: string }>(
        "SELECT COUNT(*) FROM farmer_stamp_allocations WHERE household_id = $1",
        [householdAn.id],
      )).rows[0].count;

      if (Number(allocCount) === 0) {
        const allocRes = await client.query<{ id: number }>(`
          INSERT INTO farmer_stamp_allocations
            (allocation_code, household_id, season, max_quota_stamps, quantity_allocated, from_serial, to_serial, status, notes)
          VALUES
            ('CPT-2024-H001-01', ${householdAn.id}, 'Vụ 2024', 6800, 500, 'KB-H001-000001', 'KB-H001-000500', 'active', 'Cấp tem đợt 1 theo định mức diện tích 2.4 ha sầu riêng Dona')
          RETURNING id;
        `);
        const allocId = allocRes.rows[0].id;

        // Sinh các tem mẫu (3 tem đã kích hoạt, 7 tem sẵn sàng kích hoạt)
        await client.query(`
          INSERT INTO farmer_stamps
            (allocation_id, household_id, plot_code, serial_code, status, activated_at, fruit_weight_kg, grade, harvest_date)
          VALUES
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000001', 'activated', '2024-10-18T10:15:00+07:00', 3.6, 'A', '2024-10-18'),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000002', 'activated', '2024-10-18T10:18:00+07:00', 3.8, 'A', '2024-10-18'),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000003', 'activated', '2024-10-19T08:30:00+07:00', 3.2, 'B', '2024-10-19'),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000004', 'allocated', null, null, 'A', null),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000005', 'allocated', null, null, 'A', null),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000006', 'allocated', null, null, 'A', null),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000007', 'allocated', null, null, 'B', null),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000008', 'allocated', null, null, 'A', null),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000009', 'allocated', null, null, 'A', null),
            (${allocId}, ${householdAn.id}, 'TH1-001', 'KB-H001-000010', 'allocated', null, null, 'A', null)
          ON CONFLICT (serial_code) DO NOTHING;
        `);
        log("✔ Đã cấp tem mẫu theo CCCD và định mức diện tích cho hộ Nguyễn Văn An.");
      }

      // Khai báo thu hái tại vườn của nông hộ (Hình 1 - Bước 3)
      const declCount = (await client.query<{ count: string }>(
        "SELECT COUNT(*) FROM harvest_declarations WHERE household_id = $1",
        [householdAn.id],
      )).rows[0].count;

      if (Number(declCount) === 0) {
        await client.query(`
          INSERT INTO harvest_declarations (household_id, plot_code, harvested_on, weight_kg, grade_a_kg, grade_b_kg, quality_rating, note)
          VALUES
            (${householdAn.id}, 'TH1-001', '2024-10-18', 1250.0, 950.0, 300.0, 'Loại 1 (VIP)', 'Thu hái đợt 1 vườn sầu riêng Monthong, độ ngọt Brix 32.5, trái đều hộc'),
            (${householdAn.id}, 'TH1-002', '2024-10-24', 850.0, 680.0, 170.0, 'Loại 1 (VIP)', 'Thu hái đợt 2 chuyển giao về nhà đóng gói PHC của HTX')
        `);
        log("✔ Đã nạp khai báo nhật ký thu hái tại vườn của nông hộ.");
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
