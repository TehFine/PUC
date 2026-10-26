import bcrypt from "bcryptjs";
import type { Pool } from "pg";

/** Hộ mẫu có tài khoản đăng nhập (tên đăng nhập = số điện thoại của hộ, trùng dữ liệu trong seed-data). */
const DEMO_FARMER_PHONES = ["0905123456", "0912234567"];

/**
 * Dữ liệu mẫu cho cổng hộ dân. Chạy lặp lại được (idempotent) nên cũng áp dụng được cho CSDL đã seed từ trước:
 * chỉ thêm những gì còn thiếu. Chỉ dùng cho môi trường phát triển/kiểm thử.
 */
export async function seedDemoFarmers(
  pool: Pool,
  options: { password: string; log?: (message: string) => void },
): Promise<void> {
  const log = options.log ?? (() => undefined);
  const passwordHash = await bcrypt.hash(options.password, 12);
  const created: string[] = [];

  for (const phone of DEMO_FARMER_PHONES) {
    const household = (
      await pool.query<{ id: number; name: string; village_id: number }>(
        "SELECT id, name, village_id FROM households WHERE phone = $1",
        [phone],
      )
    ).rows[0];
    if (!household) continue;

    const inserted = await pool.query(
      `INSERT INTO users (full_name, username, password_hash, role, status, village_id, household_id)
       VALUES ($1, $2, $3, 'farmer', 'active', $4, $5)
       ON CONFLICT (username) DO NOTHING`,
      [household.name, phone, passwordHash, household.village_id, household.id],
    );
    if (inserted.rowCount) created.push(phone);

    // Sản lượng đóng góp vào hai lô thu hoạch đầu tiên.
    await pool.query(
      `INSERT INTO harvest_contributions (lot_id, household_id, weight_kg)
       SELECT l.id, $1, round((300 + (l.id * 137 % 500))::numeric, 1)
       FROM harvest_lots l ORDER BY l.id LIMIT 2
       ON CONFLICT (lot_id, household_id) DO NOTHING`,
      [household.id],
    );
  }

  const first = (
    await pool.query<{ id: number; name: string }>("SELECT id, name FROM households WHERE phone = $1", [
      DEMO_FARMER_PHONES[0],
    ])
  ).rows[0];
  if (first) {
    await pool.query(
      `INSERT INTO violations (severity, title, household_label, detected_on, plot_code, description, household_id)
       SELECT 'warning', 'Nhật ký canh tác chưa cập nhật 7+ ngày', $2, current_date - 3, 'TH1-001',
              'Theo quy định HTX, hộ cần ghi nhật ký canh tác tối thiểu 7 ngày/lần. Vui lòng cập nhật sớm.', $1
       WHERE NOT EXISTS (SELECT 1 FROM violations WHERE household_id = $1)`,
      [first.id, `${first.name} – Thôn 1`],
    );
    await pool.query(
      `INSERT INTO approvals (code, applicant_name, request_type, submitted_on, docs_count, household_id)
       SELECT 'HS-DEMO-0001', $2, 'Đăng ký thêm thửa đất', current_date - 2, 3, $1
       WHERE NOT EXISTS (SELECT 1 FROM approvals WHERE household_id = $1)`,
      [first.id, first.name],
    );
  }

  // Lịch kiểm tra sắp tới (dữ liệu seed gốc đều đã qua ngày).
  await pool.query(
    `INSERT INTO inspection_schedule (scheduled_on, title, officer, plot_count, kind)
     SELECT current_date + 5, 'Kiểm tra định kỳ vùng trồng Thôn 1', 'Lê Văn Kiểm', 12, 'periodic'
     WHERE NOT EXISTS (SELECT 1 FROM inspection_schedule WHERE scheduled_on >= current_date)`,
  );
  await pool.query(
    `INSERT INTO inspection_schedule (scheduled_on, title, officer, plot_count, kind)
     SELECT current_date + 12, 'Lấy mẫu kiểm nghiệm tồn dư thuốc BVTV', 'Lê Văn Kiểm', 8, 'recheck'
     WHERE (SELECT count(*) FROM inspection_schedule WHERE scheduled_on >= current_date) = 1`,
  );

  if (created.length > 0) log(`✔ Đã tạo tài khoản hộ dân mẫu: ${created.join(", ")}.`);
}
