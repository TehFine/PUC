import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { DatabaseService } from "../src/database/database.service";
import { TEST_PASSWORD } from "./constants";

/**
 * Kiểm thử hồi quy bảo mật truy xuất QR:
 * - SEC-03: cán bộ thôn chỉ thấy hộ/thửa/nhật ký thuộc thôn mình trong authorityData, không thấy vi phạm nội bộ
 *   và phiếu kiểm nghiệm nháp; CCCD chỉ giữ 2 số cuối; vi phạm khớp theo household_id (không ILIKE).
 * - SEC-09: biên bản kiểm tra luôn lọc theo hộ/thửa nguồn; lô chưa có nguồn đóng góp không lấy bù phiếu kiểm nghiệm.
 * - SEC-17 (truy xuất): nhật ký đối chứng GPS không lộ họ tên chủ hộ chưa đồng ý công khai.
 */

const USERS = {
  inspector: "0923456789",
  villageOfficer: "0934567890", // Phạm Văn Ba – Thôn 1
};

const FX = {
  hhA: { code: "SEC-T1-H901", name: "Hộ Kiểm Thử Thôn Một", cccd: "260900000189", phone: "0900000901", plot: "SEC-T1-P01" },
  hhB: { code: "SEC-T2-H902", name: "Hộ Kiểm Thử Thôn Hai", cccd: "260900000277", phone: "0900000902", plot: "SEC-T2-P01" },
  lot: "LH-SEC03-2026",
  emptyLot: "LH-SEC09-EMPTY",
  farmerUsername: "0900000901",
  minuteA: "BB-SEC-A",
  minuteB: "BB-SEC-B",
  minuteForeign: "BB-SEC-X",
  violationA: "Vi phạm kiểm thử hộ thôn một",
  violationB: "Vi phạm kiểm thử hộ thôn hai",
  violationLegacyLabel: "Vi phạm nhãn trùng tên không gắn hộ",
  labDraft: "MK-SEC-A-DRAFT",
  labVerifiedA: "MK-SEC-A-OK",
  labVerifiedB: "MK-SEC-B-OK",
  centerLat: 13.2,
  centerLng: 108.3,
};

let nest: INestApplication;
let app: Server;
let db: DatabaseService;
const ids: { hhA: number; hhB: number; lot: number; emptyLot: number; farmerUser: number } = {
  hhA: 0,
  hhB: 0,
  lot: 0,
  emptyLot: 0,
  farmerUser: 0,
};

async function loggedIn(username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

async function villageId(name: string): Promise<number> {
  const res = await db.query<{ id: number }>("SELECT id FROM villages WHERE name = $1", [name]);
  return Number(res.rows[0].id);
}

async function insertHousehold(h: typeof FX.hhA, vid: number): Promise<number> {
  const res = await db.query<{ id: number }>(
    `INSERT INTO households (code, name, cccd, phone, village_id, plot_count, area_ha, status, public_trace_consent)
     VALUES ($1, $2, $3, $4, $5, 1, 1.2, 'qualified', false)
     RETURNING id`,
    [h.code, h.name, h.cccd, h.phone, vid],
  );
  return Number(res.rows[0].id);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(instance);
  await instance.init();
  nest = instance;
  app = instance.getHttpServer() as Server;
  db = instance.get(DatabaseService);

  const [village1, village2] = await Promise.all([villageId("Thôn 1"), villageId("Thôn 2")]);
  ids.hhA = await insertHousehold(FX.hhA, village1);
  ids.hhB = await insertHousehold(FX.hhB, village2);

  // Biển QR thửa (môi trường test không có PostGIS nên dùng plot_signboard_tokens làm thửa nguồn)
  for (const [hid, plot, vname] of [
    [ids.hhA, FX.hhA.plot, "Thôn 1"],
    [ids.hhB, FX.hhB.plot, "Thôn 2"],
  ] as const) {
    await db.query(
      `INSERT INTO plot_signboard_tokens (plot_code, household_id, village_name, area_ha, tree_count, center_lat, center_lng)
       VALUES ($1, $2, $3, 1.2, 180, $4, $5)`,
      [plot, hid, vname, FX.centerLat, FX.centerLng],
    );
  }

  // Lô ghép nguyên liệu 2 thôn và lô mới tạo chưa có hộ đóng góp
  const lotRes = await db.query<{ id: number }>(
    `INSERT INTO harvest_lots (code, harvested_on, weight_tons, household_count, buyer, market, status)
     VALUES ($1, '2020-01-10', 0.3, 2, 'Bên mua kiểm thử', 'Trung Quốc', 'exported') RETURNING id`,
    [FX.lot],
  );
  ids.lot = Number(lotRes.rows[0].id);
  const emptyRes = await db.query<{ id: number }>(
    `INSERT INTO harvest_lots (code, harvested_on, weight_tons, household_count, buyer, market, status)
     VALUES ($1, '2020-01-11', 0.1, 0, 'Bên mua kiểm thử', 'Trung Quốc', 'sampling') RETURNING id`,
    [FX.emptyLot],
  );
  ids.emptyLot = Number(emptyRes.rows[0].id);
  await db.query(
    `INSERT INTO harvest_contributions (lot_id, household_id, plot_code, weight_kg)
     VALUES ($1, $2, $3, 100), ($1, $4, $5, 200)`,
    [ids.lot, ids.hhA, FX.hhA.plot, ids.hhB, FX.hhB.plot],
  );

  await db.query(
    `INSERT INTO journal_entries (entry_on, household_id, plot_code, activity, detail, recorder, has_photo)
     VALUES ('2020-01-05', $1, $2, 'Bón phân', 'Nhật ký hộ thôn một', 'Chủ hộ', false),
            ('2020-01-05', $3, $4, 'Bón phân', 'Nhật ký hộ thôn hai', 'Chủ hộ', false)`,
    [ids.hhA, FX.hhA.plot, ids.hhB, FX.hhB.plot],
  );

  // Biên bản: 2 biên bản đúng hộ nguồn và 1 biên bản không liên quan có ngày mới nhất (mã cũ lấy bù biên bản này)
  await db.query(
    `INSERT INTO inspection_minutes (code, held_on, location, officer, result, household_id, plot_code)
     VALUES ($1, '2020-01-06', 'Thôn 1', 'KS. Kiểm Thử', 'pass', $2, $3),
            ($4, '2020-01-07', 'Thôn 2', 'KS. Kiểm Thử', 'pass', $5, $6),
            ($7, '2030-01-01', 'Thôn 6', 'KS. Ngoài Phạm Vi', 'fail', NULL, NULL)`,
    [FX.minuteA, ids.hhA, FX.hhA.plot, FX.minuteB, ids.hhB, FX.hhB.plot, FX.minuteForeign],
  );

  // Vi phạm: gắn đúng household_id và 1 bản ghi cũ chỉ trùng nhãn chữ (mã cũ khớp ILIKE nhầm)
  await db.query(
    `INSERT INTO violations (severity, title, household_label, detected_on, plot_code, description, household_id)
     VALUES ('warning', $1, $2, '2020-01-08', $3, 'Kiểm thử', $4),
            ('warning', $5, $6, '2020-01-08', $7, 'Kiểm thử', $8),
            ('critical', $9, $10, '2020-01-09', 'ZZ-SEC-OTHER', 'Kiểm thử', NULL)`,
    [
      FX.violationA,
      FX.hhA.name,
      FX.hhA.plot,
      ids.hhA,
      FX.violationB,
      FX.hhB.name,
      FX.hhB.plot,
      ids.hhB,
      FX.violationLegacyLabel,
      `${FX.hhA.name} – KB-VT-001-H001 – Thôn 6`,
    ],
  );

  await db.query(
    `INSERT INTO lab_tests (code, household_id, plot_code, sampled_on, cd_mg_kg, yellow_o_positive, residue_mg_kg, result, lab, record_status)
     VALUES ($1, $2, $3, '2020-01-04', 0.01, false, 0.01, 'pass', 'Phòng Nội Bộ', 'draft'),
            ($4, $2, $3, '2020-01-03', 0.01, false, 0.01, 'pass', 'Vinacontrol', 'verified'),
            ($5, $6, $7, '2020-01-03', 0.02, false, 0.02, 'pass', 'Quatest 3', 'verified')`,
    [FX.labDraft, ids.hhA, FX.hhA.plot, FX.labVerifiedA, FX.labVerifiedB, ids.hhB, FX.hhB.plot],
  );

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const farmerRes = await db.query<{ id: number }>(
    `INSERT INTO users (full_name, username, password_hash, role, status, village_id, household_id)
     VALUES ($1, $2, $3, 'farmer', 'active', $4, $5) RETURNING id`,
    [FX.hhA.name, FX.farmerUsername, passwordHash, village1, ids.hhA],
  );
  ids.farmerUser = Number(farmerRes.rows[0].id);
});

afterAll(async () => {
  try {
    const hhIds = [ids.hhA, ids.hhB].filter(Boolean);
    await db.query("DELETE FROM field_gps_checkins WHERE upper(plot_code) = ANY($1::text[])", [[FX.hhA.plot, FX.hhB.plot]]);
    await db.query("DELETE FROM violations WHERE title = ANY($1::text[])", [
      [FX.violationA, FX.violationB, FX.violationLegacyLabel],
    ]);
    await db.query("DELETE FROM inspection_minutes WHERE code = ANY($1::text[])", [
      [FX.minuteA, FX.minuteB, FX.minuteForeign],
    ]);
    await db.query("DELETE FROM harvest_lots WHERE code = ANY($1::text[])", [[FX.lot, FX.emptyLot]]);
    await db.query("DELETE FROM lab_tests WHERE household_id = ANY($1::bigint[])", [hhIds]);
    await db.query("DELETE FROM journal_entries WHERE household_id = ANY($1::bigint[])", [hhIds]);
    await db.query("DELETE FROM plot_signboard_tokens WHERE household_id = ANY($1::bigint[])", [hhIds]);
    await db.query("DELETE FROM users WHERE username = $1", [FX.farmerUsername]);
    await db.query("DELETE FROM households WHERE id = ANY($1::bigint[])", [hhIds]);
  } finally {
    await nest.close();
  }
});

type TraceBody = {
  accessControl: { viewerTier: string };
  publicData: {
    labTests: Array<{ code: string }>;
    governance: { threePartyAttestation: Array<{ partyKey: string; evidenceCode: string }> };
  };
  enterpriseData?: {
    detailedLabTests: Array<{ code: string }>;
    fieldAuditSourcePlots?: Array<{ plotCode: string }>;
  };
  authorityData?: {
    sourceHouseholds: Array<{
      householdCode: string;
      cccdMasked: string | null;
      plots: Array<{ plotCode: string }>;
    }>;
    cultivationDiaries: Array<{ householdName: string; detail: string }>;
    inspectionMinutes: Array<{ code: string }>;
    internalViolations: Array<{ title: string }>;
  };
  fieldAuditData?: { recentGpsCheckins: Array<{ actorLabel: string }>; inspectionHistory: Array<{ code: string }> };
};

const codesOf = (rows: Array<{ code: string }> | undefined) => (rows ?? []).map((r) => r.code);
const communeMinuteCode = (body: TraceBody) =>
  body.publicData.governance.threePartyAttestation.find((p) => p.partyKey === "commune_gov")?.evidenceCode;

describe("SEC-03: cán bộ thôn chỉ xem dữ liệu Cấp 3 của hộ trong thôn mình", () => {
  it("lô ghép 2 thôn: lọc hộ, thửa, nhật ký, biên bản; ẩn vi phạm nội bộ và phiếu kiểm nghiệm nháp", async () => {
    const officer = await loggedIn(USERS.villageOfficer);
    const res = await officer.get(`/api/trace/${FX.lot}`);
    expect(res.status).toBe(200);
    const body = res.body as TraceBody;
    expect(body.accessControl.viewerTier).toBe("authority");
    const auth = body.authorityData!;
    expect(auth).toBeDefined();

    expect(auth.sourceHouseholds.map((h) => h.householdCode)).toEqual([FX.hhA.code]);
    expect(auth.sourceHouseholds[0].cccdMasked).toBe("**********89");
    expect(auth.sourceHouseholds[0].plots.map((p) => p.plotCode)).toEqual([FX.hhA.plot]);

    const serializedAuthority = JSON.stringify(auth);
    expect(serializedAuthority).not.toContain(FX.hhB.phone);
    expect(serializedAuthority).not.toContain(FX.hhB.name);
    expect(serializedAuthority).not.toContain(FX.hhB.plot);
    expect(auth.cultivationDiaries.some((d) => d.detail === "Nhật ký hộ thôn một")).toBe(true);

    const minuteCodes = codesOf(auth.inspectionMinutes);
    expect(minuteCodes).toContain(FX.minuteA);
    expect(minuteCodes).not.toContain(FX.minuteB);
    expect(minuteCodes).not.toContain(FX.minuteForeign);

    // Không có quyền violations:read và testing:read
    expect(auth.internalViolations).toEqual([]);
    expect(codesOf(body.publicData.labTests)).not.toContain(FX.labDraft);
    expect(codesOf(body.enterpriseData?.detailedLabTests)).not.toContain(FX.labDraft);
    expect(codesOf(body.enterpriseData?.detailedLabTests)).toContain(FX.labVerifiedA);
    expect((body.enterpriseData?.fieldAuditSourcePlots ?? []).map((p) => p.plotCode)).not.toContain(FX.hhB.plot);
  });

  it("thanh tra (có quyền) vẫn xem đủ cả 2 thôn, vi phạm khớp theo household_id và phiếu nháp", async () => {
    const inspector = await loggedIn(USERS.inspector);
    const res = await inspector.get(`/api/trace/${FX.lot}`);
    expect(res.status).toBe(200);
    const body = res.body as TraceBody;
    expect(body.accessControl.viewerTier).toBe("authority");
    const auth = body.authorityData!;

    expect(auth.sourceHouseholds.map((h) => h.householdCode).sort()).toEqual([FX.hhA.code, FX.hhB.code].sort());
    const maskB = auth.sourceHouseholds.find((h) => h.householdCode === FX.hhB.code)?.cccdMasked;
    expect(maskB).toBe("**********77");
    for (const h of auth.sourceHouseholds) {
      expect(h.cccdMasked).toMatch(/^\*{10}\d{2}$/);
    }

    const minuteCodes = codesOf(auth.inspectionMinutes);
    expect(minuteCodes).toEqual(expect.arrayContaining([FX.minuteA, FX.minuteB]));
    expect(minuteCodes).not.toContain(FX.minuteForeign);

    const violationTitles = auth.internalViolations.map((v) => v.title);
    expect(violationTitles).toEqual(expect.arrayContaining([FX.violationA, FX.violationB]));
    expect(violationTitles).not.toContain(FX.violationLegacyLabel);

    expect(codesOf(body.enterpriseData?.detailedLabTests)).toContain(FX.labDraft);
    expect(communeMinuteCode(body)).not.toBe(FX.minuteForeign);
  });

  it("tem nông hộ: cán bộ thôn không thấy vi phạm nội bộ; thanh tra không nhận vi phạm chỉ trùng nhãn chữ", async () => {
    const officer = await loggedIn(USERS.villageOfficer);
    const officerRes = await officer.get("/api/trace/KB-H001-000001");
    expect(officerRes.status).toBe(200);
    const officerBody = officerRes.body as TraceBody;
    expect(officerBody.accessControl.viewerTier).toBe("authority");
    expect(officerBody.authorityData!.internalViolations).toEqual([]);
    expect(officerBody.authorityData!.sourceHouseholds[0].cccdMasked).toMatch(/^\*{10}\d{2}$/);
    expect(codesOf(officerBody.authorityData!.inspectionMinutes)).not.toContain(FX.minuteForeign);

    const inspector = await loggedIn(USERS.inspector);
    const inspectorRes = await inspector.get("/api/trace/KB-H001-000001");
    expect(inspectorRes.status).toBe(200);
    const inspectorBody = inspectorRes.body as TraceBody;
    const titles = inspectorBody.authorityData!.internalViolations.map((v) => v.title);
    expect(titles).not.toContain(FX.violationLegacyLabel);
    expect(codesOf(inspectorBody.authorityData!.inspectionMinutes)).not.toContain(FX.minuteForeign);
    expect(communeMinuteCode(inspectorBody)).not.toBe(FX.minuteForeign);
  });
});

describe("SEC-09: biên bản và phiếu kiểm nghiệm chỉ trong phạm vi nguồn của lô/thửa", () => {
  it("trang công khai không lấy bù biên bản của hộ khác vào mốc kiểm tra", async () => {
    const res = await request(app).get(`/api/public/trace/${FX.lot}`);
    expect(res.status).toBe(200);
    const body = res.body as TraceBody;
    expect(body.accessControl.viewerTier).toBe("public");
    expect(body).not.toHaveProperty("authorityData");
    expect([FX.minuteA, FX.minuteB]).toContain(communeMinuteCode(body));
    expect(codesOf(body.publicData.labTests)).not.toContain(FX.labDraft);
  });

  it("lô chưa có hộ đóng góp: danh sách kiểm nghiệm và biên bản đều rỗng", async () => {
    const pub = await request(app).get(`/api/public/trace/${FX.emptyLot}`);
    expect(pub.status).toBe(200);
    expect((pub.body as TraceBody).publicData.labTests).toEqual([]);
    expect(communeMinuteCode(pub.body as TraceBody)).not.toBe(FX.minuteForeign);

    const inspector = await loggedIn(USERS.inspector);
    const auth = await inspector.get(`/api/trace/${FX.emptyLot}`);
    expect(auth.status).toBe(200);
    const body = auth.body as TraceBody;
    expect(body.publicData.labTests).toEqual([]);
    expect(body.enterpriseData?.detailedLabTests ?? []).toEqual([]);
    expect(body.authorityData?.inspectionMinutes).toEqual([]);
    expect(body.authorityData?.internalViolations).toEqual([]);
  });

  it("hồ sơ thẩm định thửa chỉ liệt kê biên bản của thửa/hộ đó", async () => {
    const inspector = await loggedIn(USERS.inspector);
    const res = await inspector.get(`/api/trace/${FX.hhA.plot}`);
    expect(res.status).toBe(200);
    const body = res.body as TraceBody;
    const history = codesOf(body.fieldAuditData?.inspectionHistory);
    expect(history).toContain(FX.minuteA);
    expect(history).not.toContain(FX.minuteB);
    expect(history).not.toContain(FX.minuteForeign);
    expect(codesOf(body.authorityData?.inspectionMinutes)).not.toContain(FX.minuteForeign);
    expect(body.authorityData!.sourceHouseholds[0].cccdMasked).toBe("**********89");
  });
});

describe("SEC-17: nhật ký đối chứng GPS không lộ họ tên chủ hộ chưa đồng ý công khai", () => {
  it("lưu và hiển thị nhãn trung tính khi chưa đồng ý; hiển thị tên khi đã đồng ý", async () => {
    const farmer = await loggedIn(FX.farmerUsername);
    const gpsRes = await farmer
      .post(`/api/trace/${FX.hhA.plot}/verify-gps`)
      .send({ latitude: FX.centerLat, longitude: FX.centerLng, accuracyMeters: 5 });
    expect(gpsRes.status).toBe(200);
    expect(gpsRes.body.actorLabel).toBe("Chủ hộ thành viên HTX");
    expect(JSON.stringify(gpsRes.body)).not.toContain(FX.hhA.name);

    const stored = await db.query<{ actor_label: string }>(
      "SELECT actor_label FROM field_gps_checkins WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
      [ids.farmerUser],
    );
    expect(stored.rows[0].actor_label).toBe("Chủ hộ thành viên HTX");

    // Bản ghi cũ đã lỡ lưu họ tên chủ hộ: vẫn phải hiển thị nhãn trung tính
    await db.query(
      `INSERT INTO field_gps_checkins (plot_code, user_id, actor_label, latitude, longitude, inside_polygon, distance_m, verified)
       VALUES ($1, $2, $3, $4, $5, true, 0, true)`,
      [FX.hhA.plot, ids.farmerUser, `${FX.hhA.name} (farmer)`, FX.centerLat, FX.centerLng],
    );

    const inspector = await loggedIn(USERS.inspector);
    const hidden = await inspector.get(`/api/trace/${FX.hhA.plot}`);
    expect(hidden.status).toBe(200);
    const hiddenCheckins = (hidden.body as TraceBody).fieldAuditData!.recentGpsCheckins;
    expect(hiddenCheckins.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(hiddenCheckins)).not.toContain(FX.hhA.name);
    expect(hiddenCheckins.every((c) => c.actorLabel === "Chủ hộ thành viên HTX")).toBe(true);

    // Hộ đồng ý công khai: hiển thị đúng tên như trước (không ảnh hưởng người dùng hợp lệ)
    await db.query("UPDATE households SET public_trace_consent = true WHERE id = $1", [ids.hhA]);
    try {
      const shown = await inspector.get(`/api/trace/${FX.hhA.plot}`);
      expect(shown.status).toBe(200);
      const shownCheckins = (shown.body as TraceBody).fieldAuditData!.recentGpsCheckins;
      expect(shownCheckins.some((c) => c.actorLabel.includes(FX.hhA.name))).toBe(true);

      const consentedGps = await farmer
        .post(`/api/trace/${FX.hhA.plot}/verify-gps`)
        .send({ latitude: FX.centerLat, longitude: FX.centerLng, accuracyMeters: 5 });
      expect(consentedGps.status).toBe(200);
      expect(consentedGps.body.actorLabel).toContain(FX.hhA.name);
    } finally {
      await db.query("UPDATE households SET public_trace_consent = false WHERE id = $1", [ids.hhA]);
    }
  });
});

describe("LIVE-TRACE: cập nhật dữ liệu lô hàng thời gian thực và làm mới ngầm không tăng lượt quét", () => {
  it("phản ánh ngay thông số lô mới cập nhật, phát sự kiện SSE và giữ nguyên bộ đếm quét khi bg=1", async () => {
    const initialRes = await request(app).get(`/api/public/trace/${FX.lot}`);
    expect(initialRes.status).toBe(200);
    const scansBefore = Number(initialRes.body.publicData.verification.totalScans);

    const { TraceabilityService } = await import("../src/public/traceability.service");
    const traceService = nest.get(TraceabilityService);
    const receivedEvents: Array<{ type: string; epoch: number }> = [];
    const unsub = traceService.subscribeTraceStream("127.0.0.1", (ev) => {
      receivedEvents.push(ev);
    });

    const prevLot = await db.query<{
      weight_tons: number;
      status: string;
      avg_brix: number | null;
      grade_a_pct: number | null;
      treatment_method: string | null;
      transporter: string | null;
      vehicle_plate: string | null;
      temperature_c: number | null;
    }>(
      `SELECT weight_tons::float8 AS weight_tons, status, avg_brix::float8 AS avg_brix,
              grade_a_pct::float8 AS grade_a_pct, treatment_method, transporter, vehicle_plate,
              temperature_c::float8 AS temperature_c
       FROM harvest_lots WHERE id = $1`,
      [ids.lot],
    );

    try {
      await db.query(
        `UPDATE harvest_lots
         SET weight_tons = 18.5,
             avg_brix = 27.4,
             grade_a_pct = 88,
             treatment_method = 'Làm sạch khí nén tiêu chuẩn xuất khẩu',
             transporter = 'Vận tải lạnh Tây Nguyên',
             vehicle_plate = '47C-998.88',
             temperature_c = 13.5,
             status = 'in_transit'
         WHERE id = $1`,
        [ids.lot],
      );

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(receivedEvents.some((e) => e.type === "trace-updated")).toBe(true);

      const bgRes = await request(app).get(`/api/public/trace/${FX.lot}?bg=1`);
      expect(bgRes.status).toBe(200);
      expect(Number(bgRes.body.publicData.verification.totalScans)).toBe(scansBefore);
      expect(bgRes.body.publicData.lotIdentity.weightTons).toBe(18.5);
      expect(bgRes.body.publicData.lotIdentity.rawLotStatus).toBe("in_transit");
      expect(bgRes.body.publicData.lotIdentity.avgBrix).toBe(27.4);
      expect(bgRes.body.publicData.lotIdentity.vehiclePlate).toBe("47C-998.88");

      const timelineText = JSON.stringify(bgRes.body.publicData.timeline);
      expect(timelineText).toContain("27.4° Brix");
      expect(timelineText).toContain("88%");
      expect(timelineText).toContain("47C-998.88");
      expect(timelineText).toContain("13.5°C");
    } finally {
      unsub();
      const orig = prevLot.rows[0];
      if (orig) {
        await db.query(
          `UPDATE harvest_lots
           SET weight_tons = $2, status = $3, avg_brix = $4, grade_a_pct = $5,
               treatment_method = $6, transporter = $7, vehicle_plate = $8, temperature_c = $9
           WHERE id = $1`,
          [
            ids.lot,
            orig.weight_tons,
            orig.status,
            orig.avg_brix,
            orig.grade_a_pct,
            orig.treatment_method,
            orig.transporter,
            orig.vehicle_plate,
            orig.temperature_c,
          ],
        );
      }
    }
  });
});

describe("DOSSIER-CONTRIB: bảng kê hộ đóng góp trên hồ sơ lô hàng phân quyền 3 cấp", () => {
  it("che thông tin cá nhân ở chế độ công khai, giới hạn theo thôn cho cán bộ thôn và mở đầy đủ cho thanh tra", async () => {
    await db.query("UPDATE households SET public_trace_consent = true WHERE id = $1", [ids.hhA]);
    try {
      // 1. Người tiêu dùng công khai: thấy đủ 2 hộ góp lô kèm mã hộ tra cứu kỹ thuật và tỷ trọng %, chỉ hiện tên hộ đã đồng ý (hhA), ẩn hoàn toàn tên hhB, mã thửa, kg, SĐT, CCCD
      const pubRes = await request(app).get(`/api/public/trace/${FX.lot}`);
      expect(pubRes.status).toBe(200);
      const pubRows = pubRes.body.publicData.producer.dossierContributors as Array<Record<string, unknown>>;
      expect(pubRes.body.publicData.producer.dossierContributorsTier).toBe("public");
      expect(pubRows).toHaveLength(2);
      const pubRowB = pubRows.find((r) => r.sharePct === 66.7)!;
      const pubRowA = pubRows.find((r) => r.sharePct === 33.3)!;
      expect(pubRowB.displayName).toBeNull();
      expect(pubRowB.householdCode).toBe(FX.hhB.code);
      expect(pubRowB.plotCode).toBeNull();
      expect(pubRowB.weightKg).toBeNull();
      expect(pubRowB.phone).toBeNull();
      expect(pubRowA.displayName).toBe(FX.hhA.name);
      expect(pubRowA.householdCode).toBe(FX.hhA.code);
      expect(pubRowA.plotCode).toBeNull();
      expect(pubRowA.weightKg).toBeNull();

      // 2. Cán bộ Thôn 1: chỉ xem chi tiết Cấp 3 của hộ thuộc Thôn 1 (hhA), hộ Thôn 2 (hhB) bị ẩn về mức công khai
      const officer = await loggedIn(USERS.villageOfficer);
      const offRes = await officer.get(`/api/trace/${FX.lot}`);
      expect(offRes.status).toBe(200);
      const offRows = offRes.body.publicData.producer.dossierContributors as Array<Record<string, unknown>>;
      const offRowA = offRows.find((r) => r.householdCode === FX.hhA.code)!;
      const offRowB = offRows.find((r) => r.householdCode === FX.hhB.code)!;
      expect(offRowA.visibilityLevel).toBe("authority");
      expect(offRowA.weightKg).toBe(100);
      expect(offRowA.plotCode).toBe(FX.hhA.plot);
      expect(offRowA.cccdMasked).toBe("**********89");
      expect(offRowB.visibilityLevel).toBe("public");
      expect(offRowB.displayName).toBeNull();
      expect(offRowB.plotCode).toBeNull();
      expect(offRowB.phone).toBeNull();

      // 3. Thanh tra toàn địa bàn: xem đầy đủ cả 2 hộ đóng góp trong lô
      const inspector = await loggedIn(USERS.inspector);
      const insRes = await inspector.get(`/api/trace/${FX.lot}`);
      expect(insRes.status).toBe(200);
      const insRows = insRes.body.publicData.producer.dossierContributors as Array<Record<string, unknown>>;
      expect(insRows).toHaveLength(2);
      expect(insRows.every((r) => r.visibilityLevel === "authority")).toBe(true);
      expect(insRows.map((r) => r.householdCode).sort()).toEqual([FX.hhA.code, FX.hhB.code].sort());
    } finally {
      await db.query("UPDATE households SET public_trace_consent = false WHERE id = $1", [ids.hhA]);
    }
  });
});

describe("TRACE-ACCESS-REQ: cấp quyền xem hồ sơ đánh giá đột xuất thời gian thực và thu hồi từ xa", () => {
  it("gửi thông báo tức thời tới ban quản trị, mở khóa Cấp 3 ngay khi duyệt và thu hồi tức thời", async () => {
    const admin = await loggedIn("0901234567");
    const htxOfficer = await loggedIn("0912345678");
    const { TraceabilityService } = await import("../src/public/traceability.service");
    const traceService = nest.get(TraceabilityService);
    const streamEvents: Array<{ type: string; epoch: number }> = [];
    const unsub = traceService.subscribeTraceStream("127.0.0.1", (ev) => {
      streamEvents.push(ev);
    });

    let createdReqId = 0;
    let createdReqCode = "";
    try {
      // 1. Nông hộ đăng nhập quét QR vẫn hiện rõ họ tên và vai trò nhưng ở mức công khai (Cấp 1)
      const farmer = await loggedIn(FX.farmerUsername);
      const farmerTrace = await farmer.get(`/api/trace/${FX.lot}`);
      expect(farmerTrace.status).toBe(200);
      expect(farmerTrace.body.accessControl.isAuthenticated).toBe(true);
      expect(farmerTrace.body.accessControl.viewerRole).toBe("farmer");
      expect(farmerTrace.body.accessControl.viewerName).toBe(FX.hhA.name);
      expect(farmerTrace.body.accessControl.actualTier).toBe("public");

      // 2. Đoàn thanh tra đột xuất gửi yêu cầu cấp quyền trên trang vừa quét
      await db.query("DELETE FROM trace_access_requests WHERE contact_phone = '0988776655'");
      const createRes = await request(app)
        .post("/api/public/trace-access-requests")
        .send({
          scannedCode: FX.lot,
          requesterName: "Trưởng đoàn Nguyễn Thanh Tùng",
          organization: "Đoàn kiểm tra đột xuất Chi cục TT và BVTV",
          contactPhone: "0988776655",
          purpose: "Kiểm tra đột xuất hồ sơ vùng trồng và nhật ký canh tác lô xuất khẩu",
          requestedTier: "authority",
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe("pending");
      expect(typeof createRes.body.requestCode).toBe("string");
      expect(typeof createRes.body.clientSecret).toBe("string");
      createdReqCode = createRes.body.requestCode as string;
      const clientSecret = createRes.body.clientSecret as string;

      // Xác minh thông báo thời gian thực đã ghi tới Ban quản trị (admin, htx_head, htx_deputy, support_specialist)
      const notifRes = await db.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM notifications n
         JOIN users u ON u.id = n.user_id
         WHERE n.link LIKE $1
           AND u.role IN ('admin', 'htx_head', 'htx_deputy', 'support_specialist')`,
        ["%/admin?section=system&sub=trace-requests%"],
      );
      expect(Number(notifRes.rows[0].cnt)).toBeGreaterThanOrEqual(1);

      // Sai mã bí mật phiên -> từ chối 403; đúng mã bí mật -> trả pending chưa lộ token
      const badStatus = await request(app)
        .get(`/api/public/trace-access-requests/${createdReqCode}/status`)
        .set("x-trace-req-secret", "wrong-secret-token-value");
      expect(badStatus.status).toBe(403);

      const pendingStatus = await request(app)
        .get(`/api/public/trace-access-requests/${createdReqCode}/status`)
        .set("x-trace-req-secret", clientSecret);
      expect(pendingStatus.status).toBe(200);
      expect(pendingStatus.body.status).toBe("pending");
      expect(pendingStatus.body.grantedPassToken).toBeNull();

      // 3. Cán bộ thường bị từ chối 403; Quản trị viên tra cứu danh sách chờ duyệt và phê duyệt mở quyền Cấp 3
      const deniedList = await htxOfficer.get("/api/trace-requests?status=pending");
      expect(deniedList.status).toBe(403);

      const listRes = await admin.get("/api/trace-requests?status=pending");
      expect(listRes.status).toBe(200);
      const found = (listRes.body.data as Array<{ id: number; requestCode: string }>).find(
        (r) => r.requestCode === createdReqCode,
      );
      expect(found).toBeDefined();
      createdReqId = found!.id;

      streamEvents.length = 0;
      const approveRes = await admin.post(`/api/trace-requests/${createdReqId}/approve`).send({
        grantedTier: "authority",
        scopeMode: "zone",
        durationHours: 12,
        note: "Đồng ý mở quyền phục vụ đoàn thanh tra đột xuất tại hiện trường",
      });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe("approved");

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(streamEvents.some((e) => e.type === "trace-updated")).toBe(true);

      // 4. Màn hình người yêu cầu nhận ngay grantedPassToken và mở khóa hồ sơ Cấp 3 trực tiếp
      const approvedStatus = await request(app)
        .get(`/api/public/trace-access-requests/${createdReqCode}/status`)
        .set("x-trace-req-secret", clientSecret);
      expect(approvedStatus.status).toBe(200);
      expect(approvedStatus.body.status).toBe("approved");
      const passToken = approvedStatus.body.grantedPassToken as string;
      expect(typeof passToken).toBe("string");
      expect(passToken.length).toBeGreaterThan(10);

      const unlockedTrace = await request(app)
        .get(`/api/public/trace/${FX.lot}?bg=1`)
        .set("x-audit-pass", passToken);
      expect(unlockedTrace.status).toBe(200);
      expect(unlockedTrace.body.accessControl.actualTier).toBe("authority");
      expect(unlockedTrace.body.accessControl.viewerTier).toBe("authority");
      expect(unlockedTrace.body.accessControl.temporaryGrant?.active).toBe(true);
      expect(unlockedTrace.body.accessControl.temporaryGrant?.requestCode).toBe(createdReqCode);
      expect(unlockedTrace.body.authorityData).toBeDefined();
      expect(unlockedTrace.body.enterpriseData).toBeDefined();

      // Bảo vệ tuyệt đối PII nông hộ khi mở khóa tạm thời không đăng nhập: che SĐT, ẩn tên chưa đồng ý và chặn lộ vi phạm nội bộ
      const serializedGrantPayload = JSON.stringify(unlockedTrace.body);
      expect(serializedGrantPayload).not.toContain(FX.hhA.phone);
      expect(serializedGrantPayload).not.toContain(FX.hhB.phone);
      expect(serializedGrantPayload).not.toContain(FX.hhA.name);
      expect(serializedGrantPayload).not.toContain(FX.hhB.name);
      expect(unlockedTrace.body.authorityData.internalViolations).toEqual([]);
      for (const hh of unlockedTrace.body.authorityData.sourceHouseholds as Array<{ phone: string | null; householdName: string }>) {
        expect(hh.phone).toMatch(/^\d{3}\*+\d{2}$/);
        expect(hh.householdName).toMatch(/^Hộ thành viên /);
      }

      // 5. Quản trị viên thu hồi quyền từ xa -> phiên xem trên trang QR hạ ngay về Công khai (Cấp 1)
      const revokeRes = await admin.post(`/api/trace-requests/${createdReqId}/revoke`).send({
        note: "Đoàn kiểm tra đã kết thúc buổi làm việc",
      });
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.status).toBe("revoked");

      const afterRevoke = await request(app)
        .get(`/api/public/trace/${FX.lot}?bg=1`)
        .set("x-audit-pass", passToken);
      expect(afterRevoke.status).toBe(200);
      expect(afterRevoke.body.accessControl.actualTier).toBe("public");
      expect(afterRevoke.body.accessControl.viewerTier).toBe("public");
      expect(afterRevoke.body.accessControl.temporaryGrant).toBeNull();
      expect(afterRevoke.body).not.toHaveProperty("authorityData");
    } finally {
      unsub();
      if (createdReqCode) {
        await db.query("DELETE FROM trace_access_requests WHERE request_code = $1", [createdReqCode]);
      }
      if (createdReqId) {
        await db.query(
          "DELETE FROM notifications WHERE link LIKE $1",
          [`%/admin?section=system&sub=trace-requests%`],
        );
      }
    }
  });

  it("chặn ghi đè clientSecret khi trùng IP, cô lập scope=record không nhảy sang biển vườn, chặn lộ nhật ký chéo thửa và không gây bão SSE khi dùng thẻ thẩm định", async () => {
    const admin = await loggedIn("0901234567");
    const farmer = await loggedIn(FX.farmerUsername);
    const { TraceabilityService } = await import("../src/public/traceability.service");
    const traceService = nest.get(TraceabilityService);
    const sseEvents: Array<{ type: string; epoch: number }> = [];
    const unsub = traceService.subscribeTraceStream("127.0.0.1", (ev) => sseEvents.push(ev));

    const extraPlot = "SEC-T1-P02-ISOLATED";
    const createdReqCodes: string[] = [];
    let auditPassId = 0;
    let extOfficerUsername = "";

    try {
      // 1. Hai khách ẩn danh cùng IP gửi yêu cầu cho cùng mã -> không ghi đè clientSecret của người đầu tiên
      await db.query("DELETE FROM trace_access_requests WHERE contact_phone = '0977665544'");
      const req1 = await request(app).post("/api/public/trace-access-requests").send({
        scannedCode: FX.lot,
        requesterName: "Đoàn 1",
        organization: "Chi cục Kiểm tra 1",
        contactPhone: "0977665544",
        purpose: "Kiểm tra hồ sơ lô xuất khẩu đợt 1",
        requestedTier: "enterprise",
      });
      expect(req1.status).toBe(201);
      createdReqCodes.push(req1.body.requestCode as string);

      const req2 = await request(app).post("/api/public/trace-access-requests").send({
        scannedCode: FX.lot,
        requesterName: "Đoàn 2 Giả Mạo",
        organization: "Đơn vị khác cùng mạng",
        contactPhone: "0977665544",
        purpose: "Thử ghi đè bí mật phiên",
        requestedTier: "authority",
      });
      expect(req2.status).toBe(201);
      createdReqCodes.push(req2.body.requestCode as string);
      expect(req2.body.requestCode).not.toBe(req1.body.requestCode);

      // Người thứ nhất vẫn dùng được clientSecret của mình và giữ đúng mức enterprise đã xin
      const st1 = await request(app)
        .get(`/api/public/trace-access-requests/${req1.body.requestCode}/status`)
        .set("x-trace-req-secret", req1.body.clientSecret as string);
      expect(st1.status).toBe(200);
      expect(st1.body.requestedTier).toBe("enterprise");

      // 2. Cấp quyền scopeMode='record' trên Lô KHÔNG được phép dùng chéo sang Biển QR Thửa Đất để lấy đa giác GIS
      const req1Row = await db.query<{ id: number }>(
        "SELECT id FROM trace_access_requests WHERE request_code = $1",
        [req1.body.requestCode],
      );
      const approveRecord = await admin.post(`/api/trace-requests/${req1Row.rows[0].id}/approve`).send({
        grantedTier: "authority",
        scopeMode: "record",
        durationHours: 4,
      });
      expect(approveRecord.status).toBe(200);
      const st1Approved = await request(app)
        .get(`/api/public/trace-access-requests/${req1.body.requestCode}/status`)
        .set("x-trace-req-secret", req1.body.clientSecret as string);
      const recordLotToken = st1Approved.body.grantedPassToken as string;

      const lotOk = await request(app)
        .get(`/api/public/trace/${FX.lot}?bg=1`)
        .set("x-audit-pass", recordLotToken);
      expect(lotOk.status).toBe(200);
      expect(lotOk.body.accessControl.viewerTier).toBe("authority");

      const replayOnPlot = await request(app)
        .get(`/api/public/trace/${FX.hhA.plot}?bg=1`)
        .set("x-audit-pass", recordLotToken);
      expect(replayOnPlot.status).toBe(200);
      expect(replayOnPlot.body.accessControl.viewerTier).toBe("public");
      expect(replayOnPlot.body.fieldAuditData).toBeUndefined();

      // 3. Hồ sơ thẩm định thửa P01 không bị rò rỉ nhật ký của thửa P02 cùng chủ hộ
      await db.query(
        `INSERT INTO plot_signboard_tokens (plot_code, household_id, village_name, area_ha, tree_count, center_lat, center_lng)
         VALUES ($1, $2, 'Thôn 1', 0.8, 120, $3, $4)`,
        [extraPlot, ids.hhA, FX.centerLat, FX.centerLng],
      );
      await db.query(
        `INSERT INTO journal_entries (entry_on, household_id, plot_code, activity, detail, recorder, has_photo)
         VALUES ('2020-01-09', $1, $2, 'Tỉa cành', 'Bí mật riêng của thửa P02 không thuộc P01', 'Chủ hộ', false)`,
        [ids.hhA, extraPlot],
      );

      const inspector = await loggedIn(USERS.inspector);
      const p01Trace = await inspector.get(`/api/trace/${FX.hhA.plot}`);
      expect(p01Trace.status).toBe(200);
      expect(JSON.stringify(p01Trace.body.fieldAuditData?.sealedLedger ?? [])).not.toContain(
        "Bí mật riêng của thửa P02 không thuộc P01",
      );
      expect(JSON.stringify(p01Trace.body.authorityData?.cultivationDiaries ?? [])).not.toContain(
        "Bí mật riêng của thửa P02 không thuộc P01",
      );

      // 4. Thẻ Đoàn Thẩm định làm mới ngầm (?bg=1) không tăng access_count và không phát SSE trace-updated gây vòng lặp
      const passRes = await admin.post("/api/field-audit-passes").send({
        delegationName: "Đoàn Kiểm Thử Không Bão SSE",
        organization: "Sở NN&MT",
        durationHours: 24,
      });
      expect(passRes.status).toBe(201);
      auditPassId = Number(passRes.body.id);
      const auditToken = passRes.body.passToken as string;

      await new Promise((r) => setTimeout(r, 180));
      sseEvents.length = 0;

      const initialScan = await request(app)
        .get(`/api/public/trace/${FX.hhA.plot}`)
        .set("x-audit-pass", auditToken);
      expect(initialScan.status).toBe(200);
      expect(initialScan.body.fieldAuditData).toBeDefined();

      const countAfterFirst = Number(
        (await db.query<{ access_count: number }>("SELECT access_count FROM field_audit_passes WHERE id = $1", [auditPassId]))
          .rows[0].access_count,
      );
      expect(countAfterFirst).toBe(1);

      const bgScan = await request(app)
        .get(`/api/public/trace/${FX.hhA.plot}?bg=1`)
        .set("x-audit-pass", auditToken);
      expect(bgScan.status).toBe(200);
      await new Promise((r) => setTimeout(r, 180));
      expect(sseEvents).toHaveLength(0);

      const countAfterBg = Number(
        (await db.query<{ access_count: number }>("SELECT access_count FROM field_audit_passes WHERE id = $1", [auditPassId]))
          .rows[0].access_count,
      );
      expect(countAfterBg).toBe(1);

      // 5. Chuẩn hóa tra cứu tiền tố tiếng Việt ("Thửa ...", "Lô: ..."), mã vùng PUC và khối lượng tem mẫu
      const prefixedPlot = await request(app).get(`/api/public/trace/${encodeURIComponent(`Thửa ${FX.hhA.plot}`)}`);
      expect(prefixedPlot.status).toBe(200);
      const prefixedLot = await request(app).get(`/api/public/trace/${encodeURIComponent(`Lô: ${FX.lot}`)}`);
      expect(prefixedLot.status).toBe(200);
      const pucLookup = await request(app).get("/api/public/trace/VN-DLOR-0086");
      expect(pucLookup.status).toBe(200);
      const samplesRes = await request(app).get("/api/public/trace-samples");
      expect(samplesRes.status).toBe(200);
      const fruitStamps = (samplesRes.body.stamps as Array<{ unitType?: string; weightKg?: number | null }>).filter(
        (s) => s.unitType === "fruit",
      );
      for (const st of fruitStamps) {
        expect(st).toHaveProperty("weightKg");
      }

      // 6. ETag tải tệp không lộ public_token & chặn truy cập công khai ảnh hóa đơn mua vật tư nông hộ
      const tinyPng = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
        "hex",
      );
      const upInvoice = await farmer.post("/api/uploads").field("purpose", "journal").attach("file", tinyPng, "invoice.png");
      expect(upInvoice.status).toBe(201);
      const attRow = (
        await db.query<{ public_token: string }>("SELECT public_token FROM attachments WHERE id = $1", [upInvoice.body.id])
      ).rows[0];
      const dlInvoice = await farmer.get(`/api/uploads/${upInvoice.body.id}`);
      expect(dlInvoice.status).toBe(200);
      expect(String(dlInvoice.headers["etag"] || "")).not.toContain(attRow.public_token);

      // Gắn tệp vào cột invoice_photo_id / invoice_photo_ids -> /api/public/files/:token phải từ chối 404
      if (
        (
          await db.query<{ reg: string | null }>("SELECT to_regclass('public.care_milestone_declarations') AS reg")
        ).rows[0]?.reg
      ) {
        const upField = await farmer.post("/api/uploads").field("purpose", "journal").attach("file", tinyPng, "field.png");
        expect(upField.status).toBe(201);
        const fieldAttRow = (
          await db.query<{ public_token: string }>("SELECT public_token FROM attachments WHERE id = $1", [upField.body.id])
        ).rows[0];

        const planIns = await db.query<{ id: number }>(
          `INSERT INTO plot_care_plans (household_id, plot_code, season, status)
           VALUES ($1, $2, '2026-2027-TEST', 'active')
           ON CONFLICT (household_id, plot_code, season) DO UPDATE SET updated_at = now()
           RETURNING id`,
          [ids.hhA, FX.hhA.plot],
        );
        const planId = Number(planIns.rows[0].id);
        await db.query(
          `INSERT INTO care_milestone_declarations
             (plan_id, household_id, plot_code, stage_code, milestone_code, performed_on,
              expected_tree_state, actual_tree_state, actual_dosage,
              field_photo_id, invoice_photo_id, invoice_photo_ids, compliance_status)
           VALUES ($1, $2, $3, 'stage-1', 'cb-rua-vuon', CURRENT_DATE,
                   'Bình thường', 'Bình thường', 'Đúng liều',
                   $4, $5, $6::bigint[], 'compliant')`,
          [planId, ids.hhA, FX.hhA.plot, Number(upField.body.id), Number(upInvoice.body.id), [Number(upInvoice.body.id)]],
        );
        try {
          const pubFieldOk = await request(app).get(`/api/public/files/${fieldAttRow.public_token}`);
          expect(pubFieldOk.status).toBe(200);
          const pubInvoiceAttempt = await request(app).get(`/api/public/files/${attRow.public_token}`);
          expect(pubInvoiceAttempt.status).toBe(404);
        } finally {
          await db.query("DELETE FROM plot_care_plans WHERE id = $1", [planId]);
        }
      }

      // 7. GET /api/registrations/households áp dụng đúng phạm vi coopCode (không lộ hộ dân Cư Né cho cán bộ HTX ngoài)
      extOfficerUsername = `ext_reg_scope_${Date.now()}`;
      const extAcc = await admin.post("/api/accounts").send({
        fullName: "Cán bộ HTX Khác",
        username: extOfficerUsername,
        password: TEST_PASSWORD,
        role: "htx_officer",
        coopCode: "HTX-OTHER",
      });
      expect(extAcc.status).toBe(201);
      const extAgent = await loggedIn(extOfficerUsername);
      const regHhRes = await extAgent.get("/api/registrations/households");
      expect(regHhRes.status).toBe(200);
      expect(regHhRes.body.data).toEqual([]);
    } finally {
      unsub();
      await db.query("DELETE FROM journal_entries WHERE plot_code = $1", [extraPlot]);
      await db.query("DELETE FROM plot_signboard_tokens WHERE plot_code = $1", [extraPlot]);
      if (createdReqCodes.length > 0) {
        await db.query("DELETE FROM trace_access_requests WHERE request_code = ANY($1::text[])", [createdReqCodes]);
      }
      if (auditPassId) {
        await db.query("DELETE FROM field_audit_passes WHERE id = $1", [auditPassId]);
      }
      if (extOfficerUsername) {
        await db.query("DELETE FROM users WHERE username = $1", [extOfficerUsername]);
      }
    }
  });
});

describe("HOUSEHOLD-TRACE & PHOTO-EVIDENCE: tra cứu mã hộ, ảnh profile, đóng góp lô xã và đa ảnh minh chứng 3 cấp", () => {
  it("liên thông từ lô -> mã hộ & bảng cắm vườn, bảo vệ PII/ảnh chưa đồng ý ở Cấp 1, mở đa ảnh hiện trường (loại trừ hóa đơn) ở Cấp 2-3", async () => {
    const htxOfficer = await loggedIn("0912345678");
    const villageOfficer = await loggedIn(USERS.villageOfficer);

    const tinyPng = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
      "hex",
    );

    const insertTestAttachment = async (purpose: "avatar" | "journal", name: string) => {
      const r = await db.query<{ id: number; public_token: string }>(
        `INSERT INTO attachments (owner_user_id, household_id, purpose, storage_key, original_name, mime_type, size_bytes, file_data)
         VALUES ($1, $2, $3, $4, $5, 'image/png', $6, $7)
         RETURNING id, public_token`,
        [
          ids.farmerUser,
          ids.hhA,
          purpose,
          `system/test-hh-trace-${Date.now()}-${name}`,
          name,
          tinyPng.length,
          tinyPng,
        ],
      );
      return { id: Number(r.rows[0].id), publicToken: r.rows[0].public_token };
    };

    const [attAvatar, attField1, attField2, attSpray, attInvoice] = await Promise.all([
      insertTestAttachment("avatar", "avatar.png"),
      insertTestAttachment("journal", "care-1.png"),
      insertTestAttachment("journal", "care-2.png"),
      insertTestAttachment("journal", "spray-1.png"),
      insertTestAttachment("journal", "invoice-secret.png"),
    ]);
    const avatarToken = attAvatar.publicToken;
    const invoiceToken = attInvoice.publicToken;

    await db.query("UPDATE households SET avatar_id = $2, public_trace_consent = false WHERE id = $1", [
      ids.hhA,
      attAvatar.id,
    ]);

    const pestRes = await db.query<{ id: number }>("SELECT id FROM pesticides WHERE status = 'allowed' LIMIT 1");
    const pesticideId = Number(pestRes.rows[0].id);

    const insertedJournal = await db.query<{ id: number }>(
      `INSERT INTO journal_entries (entry_on, household_id, plot_code, activity, detail, recorder, has_photo, photo_id, photo_ids)
       VALUES ('2020-01-06', $1, $2, 'Tỉa cành tạo tán', 'Ảnh minh chứng tỉa cành và hóa đơn đính nhầm', $3, true, $4, $5::bigint[])
       RETURNING id`,
      [
        ids.hhA,
        FX.hhA.plot,
        FX.hhA.name,
        attField1.id,
        [attField1.id, attField2.id, attInvoice.id],
      ],
    );
    const insertedSpray = await db.query<{ id: number }>(
      `INSERT INTO spray_records (sprayed_on, household_id, plot_code, pesticide_id, dose, area_ha, isolation_days, mrl_status, photo_id, photo_ids)
       VALUES ('2019-12-01', $1, $2, $3, '15ml / bình 16L', 1.0, 7, 'pass', $4, $5::bigint[])
       RETURNING id`,
      [ids.hhA, FX.hhA.plot, pesticideId, attSpray.id, [attSpray.id]],
    );

    let planId: number | null = null;
    if (
      (await db.query<{ reg: string | null }>("SELECT to_regclass('public.care_milestone_declarations') AS reg")).rows[0]
        ?.reg
    ) {
      const planIns = await db.query<{ id: number }>(
        `INSERT INTO plot_care_plans (household_id, plot_code, season, status)
         VALUES ($1, $2, '2026-2027-HH-TRACE', 'active')
         ON CONFLICT (household_id, plot_code, season) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [ids.hhA, FX.hhA.plot],
      );
      planId = Number(planIns.rows[0].id);
      await db.query(
        `INSERT INTO care_milestone_declarations
           (plan_id, household_id, plot_code, stage_code, milestone_code, performed_on,
            expected_tree_state, actual_tree_state, actual_dosage,
            field_photo_id, invoice_photo_id, invoice_photo_ids, compliance_status)
         VALUES ($1, $2, $3, 'stage-1', 'cb-tiacanh-hh', CURRENT_DATE,
                 'Khỏe', 'Khỏe', 'Đúng liều',
                 $4, $5, $6::bigint[], 'compliant')`,
        [planId, ids.hhA, FX.hhA.plot, attField1.id, attInvoice.id, [attInvoice.id]],
      );
    }

    let hhReqCode = "";
    try {
      // 1. Cấp 1 công khai khi hộ CHƯA đồng ý: tra cứu Mã hộ (kể cả tiền tố "Mã hộ:") ẩn ảnh profile, họ tên, SĐT, CCCD, ảnh nhật ký, nhưng hiện chính xác lịch sử đóng góp lô xã
      const pubHhUnconsented = await request(app).get(
        `/api/public/trace/${encodeURIComponent(`Mã hộ: ${FX.hhA.code}`)}`,
      );
      expect(pubHhUnconsented.status).toBe(200);
      expect(pubHhUnconsented.body.isHouseholdDossier).toBe(true);
      expect(pubHhUnconsented.body.farmerProfile.householdCode).toBe(FX.hhA.code);
      expect(pubHhUnconsented.body.farmerProfile.isAnonymized).toBe(true);
      expect(pubHhUnconsented.body.farmerProfile.avatarUrl).toBeNull();
      expect(pubHhUnconsented.body.communeLotContributions.totalLots).toBe(1);
      expect(pubHhUnconsented.body.communeLotContributions.totalContributedKg).toBe(100);
      expect(pubHhUnconsented.body.communeLotContributions.lots[0].lotCode).toBe(FX.lot);
      expect(pubHhUnconsented.body.communeLotContributions.lots[0].sharePct).toBe(33.3);
      expect(pubHhUnconsented.body).not.toHaveProperty("enterpriseData");
      expect(pubHhUnconsented.body).not.toHaveProperty("authorityData");
      const rawPubText = JSON.stringify(pubHhUnconsented.body);
      expect(rawPubText).not.toContain(FX.hhA.name);
      expect(rawPubText).not.toContain(FX.hhA.phone);
      expect(rawPubText).not.toContain(FX.hhA.cccd);
      expect(rawPubText).not.toContain(avatarToken);
      expect(rawPubText).not.toContain(invoiceToken);

      // Tương tự khi quét Bảng cắm ở vườn ở Cấp 1 khi hộ chưa đồng ý
      const pubPlotUnconsented = await request(app).get(`/api/public/trace/${FX.hhA.plot}`);
      expect(pubPlotUnconsented.status).toBe(200);
      expect(pubPlotUnconsented.body.isPlotSignboard).toBe(true);
      expect(pubPlotUnconsented.body.farmerProfile.avatarUrl).toBeNull();
      expect(pubPlotUnconsented.body.communeLotContributions.totalContributedKg).toBe(100);

      // 2. Cấp 1 công khai khi hộ ĐÃ đồng ý: hiện ảnh profile thật và tên chủ hộ trên tờ A4 của Mã hộ & Bảng cắm vườn, vẫn ẩn SĐT/CCCD/nhật ký nội bộ
      await db.query("UPDATE households SET public_trace_consent = true WHERE id = $1", [ids.hhA]);
      const pubHhConsented = await request(app).get(`/api/public/trace/${FX.hhA.code}`);
      expect(pubHhConsented.status).toBe(200);
      expect(pubHhConsented.body.farmerProfile.isAnonymized).toBe(false);
      expect(pubHhConsented.body.farmerProfile.displayName).toBe(FX.hhA.name);
      expect(pubHhConsented.body.farmerProfile.avatarUrl).toContain(avatarToken);
      expect((await request(app).get(pubHhConsented.body.farmerProfile.avatarUrl)).status).toBe(200);
      expect(JSON.stringify(pubHhConsented.body)).not.toContain(FX.hhA.phone);

      await db.query("UPDATE households SET public_trace_consent = false WHERE id = $1", [ids.hhA]);

      // 3. Cấp 2 (Cán bộ HTX / Đối tác): xem được evidenceLogs đa ảnh của cả nhật ký chăm sóc và phun BVTV, loại trừ hoàn toàn ảnh hóa đơn
      const htxHhRes = await htxOfficer.get(`/api/trace/${FX.hhA.code}`);
      expect(htxHhRes.status).toBe(200);
      expect(htxHhRes.body.accessControl.viewerTier).toBe("enterprise");
      const evLogs = htxHhRes.body.enterpriseData.evidenceLogs as Array<{
        kind: string;
        activity: string;
        photoUrls: string[];
      }>;
      expect(Array.isArray(evLogs)).toBe(true);
      const journalEv = evLogs.find((e) => e.activity === "Tỉa cành tạo tán")!;
      const sprayEv = evLogs.find((e) => e.kind === "spray")!;
      expect(journalEv).toBeDefined();
      expect(journalEv.photoUrls).toHaveLength(2);
      expect(JSON.stringify(journalEv.photoUrls)).not.toContain(invoiceToken);
      expect(sprayEv).toBeDefined();
      expect(sprayEv.photoUrls).toHaveLength(1);
      expect((await request(app).get(sprayEv.photoUrls[0])).status).toBe(200);

      // 4. Cấp 3 (Cán bộ thôn): đúng thôn (hhA) xem đủ ảnh profile & đa ảnh nhật ký; khác thôn (hhB) bị chặn scopeDenied về Cấp 1
      const offOwnVillage = await villageOfficer.get(`/api/trace/${FX.hhA.code}`);
      expect(offOwnVillage.status).toBe(200);
      expect(offOwnVillage.body.accessControl.viewerTier).toBe("authority");
      expect(offOwnVillage.body.farmerProfile.avatarUrl).toContain(avatarToken);
      const authDiaries = offOwnVillage.body.authorityData.cultivationDiaries as Array<{
        kind: string;
        activity: string;
        photoUrls: string[];
      }>;
      expect(authDiaries.find((d) => d.activity === "Tỉa cành tạo tán")!.photoUrls).toHaveLength(2);
      expect(authDiaries.find((d) => d.kind === "spray")!.photoUrls).toHaveLength(1);
      expect(JSON.stringify(authDiaries)).not.toContain(invoiceToken);

      const offOtherVillage = await villageOfficer.get(`/api/trace/${FX.hhB.code}`);
      expect(offOtherVillage.status).toBe(200);
      expect(offOtherVillage.body.accessControl.scopeDenied).toBe(true);
      expect(offOtherVillage.body.accessControl.viewerTier).toBe("public");
      expect(offOtherVillage.body).not.toHaveProperty("authorityData");

      // 5. Đoàn thanh tra đột xuất có thể gửi yêu cầu cấp quyền trực tiếp trên hồ sơ Mã hộ
      const reqOnHh = await request(app)
        .post("/api/public/trace-access-requests")
        .send({
          scannedCode: FX.hhA.code,
          requesterName: "Đoàn Thanh tra Nông hộ",
          organization: "Chi cục Trồng trọt và BVTV",
          contactPhone: "0977112233",
          purpose: "Đối chiếu hình ảnh minh chứng canh tác của hộ thành viên",
          requestedTier: "authority",
        });
      expect(reqOnHh.status).toBe(201);
      hhReqCode = reqOnHh.body.requestCode as string;
    } finally {
      if (hhReqCode) {
        await db.query("DELETE FROM trace_access_requests WHERE request_code = $1", [hhReqCode]);
      }
      if (planId) {
        await db.query("DELETE FROM plot_care_plans WHERE id = $1", [planId]);
      }
      await db.query("DELETE FROM spray_records WHERE id = $1", [insertedSpray.rows[0].id]);
      await db.query("DELETE FROM journal_entries WHERE id = $1", [insertedJournal.rows[0].id]);
      await db.query("UPDATE households SET avatar_id = NULL, public_trace_consent = false WHERE id = $1", [ids.hhA]);
      await db.query("DELETE FROM attachments WHERE id = ANY($1::bigint[])", [
        [attAvatar.id, attField1.id, attField2.id, attSpray.id, attInvoice.id],
      ]);
    }
  });
});

describe("BYPASS-DEFENSE: chống vượt rào phạm vi doanh nghiệp, ghép quyền tạm thời, dùng chéo khóa và lộ tệp nháp", () => {
  it("chặn doanh nghiệp có hợp đồng khung vượt rào xem thửa/hộ đối thủ, chặn lộ biển số lạnh và chống dò tọa độ GPS 3 điểm", async () => {
    const admin = await loggedIn("0901234567");
    const ts = Date.now();
    const entACode = `ENT-A-${ts}`;
    const entBCode = `ENT-B-${ts}`;
    const entAUser = `ent_a_${ts}`;
    const entBUser = `ent_b_${ts}`;
    let entAId = 0;
    let entBId = 0;
    const contractIds: number[] = [];

    try {
      const insEntA = await db.query<{ id: number }>(
        `INSERT INTO enterprises (code, name, packhouse_code, status)
         VALUES ($1, 'CSĐG Hợp Lệ A', 'PHC-SECA', 'active') RETURNING id`,
        [entACode],
      );
      const insEntB = await db.query<{ id: number }>(
        `INSERT INTO enterprises (code, name, packhouse_code, status)
         VALUES ($1, 'CSĐG Đối Thủ B', 'PHC-SECB', 'active') RETURNING id`,
        [entBCode],
      );
      entAId = Number(insEntA.rows[0].id);
      entBId = Number(insEntB.rows[0].id);

      const cA = await db.query<{ id: number }>(
        `INSERT INTO contracts (code, enterprise_id, title, signed_on, valid_until, target_tons, status)
         VALUES ($1, $2, 'Hợp đồng khung A', CURRENT_DATE, CURRENT_DATE + 180, 100, 'active') RETURNING id`,
        [`HD-A-${ts}`, entAId],
      );
      const cB = await db.query<{ id: number }>(
        `INSERT INTO contracts (code, enterprise_id, title, signed_on, valid_until, target_tons, status)
         VALUES ($1, $2, 'Hợp đồng khung B', CURRENT_DATE, CURRENT_DATE + 180, 100, 'active') RETURNING id`,
        [`HD-B-${ts}`, entBId],
      );
      contractIds.push(Number(cA.rows[0].id), Number(cB.rows[0].id));

      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Đối tác A",
            username: entAUser,
            password: TEST_PASSWORD,
            role: "enterprise",
            enterpriseId: entAId,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Đối tác B",
            username: entBUser,
            password: TEST_PASSWORD,
            role: "enterprise",
            enterpriseId: entBId,
          })
        ).status,
      ).toBe(201);

      await db.query(
        `UPDATE harvest_lots
         SET enterprise_id = $2,
             transporter = 'Vận Tải Lạnh Nội Bộ A',
             vehicle_plate = '47C-777.99',
             temperature_c = 13.2
         WHERE id = $1`,
        [ids.lot, entAId],
      );

      const agentA = await loggedIn(entAUser);
      const agentB = await loggedIn(entBUser);

      // 1. Doanh nghiệp đối thủ B (dù có hợp đồng active trong bảng contracts) bị chặn scopeDenied trên cả thửa, mã hộ và verify-gps
      const bPlot = await agentB.get(`/api/trace/${FX.hhA.plot}`);
      expect(bPlot.status).toBe(200);
      expect(bPlot.body.accessControl.scopeDenied).toBe(true);
      expect(bPlot.body.accessControl.viewerTier).toBe("public");
      expect(bPlot.body).not.toHaveProperty("enterpriseData");
      expect(JSON.stringify(bPlot.body)).not.toContain("47C-777.99");

      const bHh = await agentB.get(`/api/trace/${FX.hhA.code}`);
      expect(bHh.status).toBe(200);
      expect(bHh.body.accessControl.scopeDenied).toBe(true);
      expect(bHh.body.accessControl.viewerTier).toBe("public");
      expect(bHh.body).not.toHaveProperty("enterpriseData");

      const bGps = await agentB
        .post(`/api/trace/${FX.hhA.plot}/verify-gps`)
        .send({ latitude: FX.centerLat, longitude: FX.centerLng, accuracyMeters: 8 });
      expect(bGps.status).toBe(403);

      // 2. Doanh nghiệp A thực sự thu mua lô được phép xem Cấp 2 của thửa nguồn, nhưng verify-gps che khoảng cách/tọa độ để chống dò tam giác đạc
      const aPlot = await agentA.get(`/api/trace/${FX.hhA.plot}`);
      expect(aPlot.status).toBe(200);
      expect(aPlot.body.accessControl.scopeDenied).toBe(false);
      expect(aPlot.body.accessControl.viewerTier).toBe("enterprise");
      expect(aPlot.body.enterpriseData?.packingSpecs?.vehiclePlate).toBe("47C-777.99");

      const aGps = await agentA
        .post(`/api/trace/${FX.hhA.plot}/verify-gps`)
        .send({ latitude: FX.centerLat, longitude: FX.centerLng, accuracyMeters: 8 });
      expect(aGps.status).toBe(200);
      expect(typeof aGps.body.verified).toBe("boolean");
      expect(aGps.body.centerLat).toBeNull();
      expect(aGps.body.centerLng).toBeNull();
      expect(aGps.body.distanceMeters).toBeNull();
      expect(aGps.body.insidePolygon).toBeNull();
    } finally {
      await db.query(
        `UPDATE harvest_lots
         SET enterprise_id = NULL, transporter = NULL, vehicle_plate = NULL, temperature_c = NULL
         WHERE id = $1`,
        [ids.lot],
      );
      await db.query("DELETE FROM users WHERE username = ANY($1::text[])", [[entAUser, entBUser]]);
      if (contractIds.length > 0) {
        await db.query("DELETE FROM contracts WHERE id = ANY($1::bigint[])", [contractIds]);
      }
      const entIds = [entAId, entBId].filter(Boolean);
      if (entIds.length > 0) {
        await db.query("DELETE FROM enterprises WHERE id = ANY($1::bigint[])", [entIds]);
      }
    }
  });

  it("chặn leo thang ghép quyền (cán bộ ngoài địa bàn + cấp quyền tạm thời), chặn hạ cấp ?view=enterprise lộ nhật ký thôn khác và cô lập scope=record", async () => {
    const admin = await loggedIn("0901234567");
    const villageOfficer = await loggedIn(USERS.villageOfficer);
    const ts = Date.now();
    const outRegionUsername = `insp_lamdong_${ts}`;
    const privateSiblingPlot = "SEC-T1-P99-PRIVATE";
    const lotPrefixEdgeCode = `LOT-2026-SAFE${String(ts).slice(-4)}`;
    const reqCodes: string[] = [];
    let lotPrefixId = 0;

    try {
      // 1. Cán bộ Thôn 1 truyền ?view=enterprise trên lô ghép 2 thôn -> tuyệt đối không lộ nhật ký Thôn 2
      const downgradedOfficerLot = await villageOfficer.get(`/api/trace/${FX.lot}?view=enterprise`);
      expect(downgradedOfficerLot.status).toBe(200);
      expect(downgradedOfficerLot.body.accessControl.viewerTier).toBe("enterprise");
      const tier2Text = JSON.stringify(downgradedOfficerLot.body.enterpriseData ?? {});
      expect(tier2Text).toContain("Nhật ký hộ thôn một");
      expect(tier2Text).not.toContain("Nhật ký hộ thôn hai");
      expect(tier2Text).not.toContain(FX.hhB.code);

      // 2. Tạo thanh tra ngoài địa bàn (Tỉnh Lâm Đồng) + cấp quyền tạm thời Cấp 3 trên FX.lot -> vẫn phải che SĐT gốc, ẩn tên chưa đồng ý, ẩn phiếu nháp và ẩn vi phạm nội bộ!
      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Thanh tra Ngoài Vùng",
            username: outRegionUsername,
            password: TEST_PASSWORD,
            role: "inspector",
            assignedRegion: "Tỉnh Lâm Đồng",
          })
        ).status,
      ).toBe(201);
      const outInspector = await loggedIn(outRegionUsername);

      const outBase = await outInspector.get(`/api/trace/${FX.lot}`);
      expect(outBase.body.accessControl.scopeDenied).toBe(true);
      expect(outBase.body.accessControl.viewerTier).toBe("public");

      const grantReq = await outInspector.post("/api/public/trace-access-requests").send({
        scannedCode: FX.lot,
        requesterName: "Thanh tra Lâm Đồng",
        organization: "Chi cục Lâm Đồng",
        contactPhone: "0966554433",
        purpose: "Đối chiếu liên tỉnh lô sầu riêng",
        requestedTier: "authority",
      });
      expect(grantReq.status).toBe(201);
      reqCodes.push(grantReq.body.requestCode as string);

      const grantId = Number(
        (
          await db.query<{ id: number }>("SELECT id FROM trace_access_requests WHERE request_code = $1", [
            grantReq.body.requestCode,
          ])
        ).rows[0].id,
      );
      expect((await admin.post(`/api/trace-requests/${grantId}/approve`).send({ grantedTier: "authority" })).status).toBe(
        200,
      );

      const elevatedOutInspector = await outInspector.get(`/api/trace/${FX.lot}`);
      expect(elevatedOutInspector.status).toBe(200);
      expect(elevatedOutInspector.body.accessControl.viewerTier).toBe("authority");
      expect(elevatedOutInspector.body.accessControl.temporaryGrant?.scopeMode).toBe("record");
      const elevatedPayload = JSON.stringify(elevatedOutInspector.body);
      expect(elevatedPayload).not.toContain(FX.hhA.phone);
      expect(elevatedPayload).not.toContain(FX.hhB.phone);
      expect(elevatedPayload).not.toContain(FX.hhA.name);
      expect(elevatedPayload).not.toContain(FX.hhB.name);
      expect(elevatedPayload).not.toContain(FX.labDraft);
      expect(elevatedOutInspector.body.authorityData.internalViolations).toEqual([]);

      // Cấp quyền record của Lô KHÔNG mở khóa tem nông hộ độc lập
      const stampAttempt = await outInspector.get("/api/trace/KB-H001-000001");
      expect(stampAttempt.status).toBe(200);
      expect(stampAttempt.body.accessControl.viewerTier).toBe("public");
      expect(stampAttempt.body).not.toHaveProperty("authorityData");

      // 3. Cán bộ Thôn 1 xin quyền tạm thời trên hộ Thôn 2 -> SĐT và tên hộ Thôn 2 vẫn được che như khách đoàn kiểm tra
      const voGrantReq = await villageOfficer.post("/api/public/trace-access-requests").send({
        scannedCode: FX.hhB.code,
        requesterName: "Cán bộ Thôn 1",
        organization: "UBND Xã",
        contactPhone: "0955443322",
        purpose: "Xem đối chiếu chéo thôn 2",
        requestedTier: "authority",
      });
      expect(voGrantReq.status).toBe(201);
      reqCodes.push(voGrantReq.body.requestCode as string);
      const voGrantId = Number(
        (
          await db.query<{ id: number }>("SELECT id FROM trace_access_requests WHERE request_code = $1", [
            voGrantReq.body.requestCode,
          ])
        ).rows[0].id,
      );
      expect((await admin.post(`/api/trace-requests/${voGrantId}/approve`).send({ grantedTier: "authority" })).status).toBe(
        200,
      );

      const voOnHhB = await villageOfficer.get(`/api/trace/${FX.hhB.code}`);
      expect(voOnHhB.status).toBe(200);
      expect(voOnHhB.body.accessControl.viewerTier).toBe("authority");
      const voHhBSerialized = JSON.stringify(voOnHhB.body);
      expect(voHhBSerialized).not.toContain(FX.hhB.phone);
      expect(voHhBSerialized).not.toContain(FX.hhB.name);
      expect(voOnHhB.body.authorityData.internalViolations).toEqual([]);

      // 4. Cấp quyền mặc định giữ nguyên scope='record' trên 1 thửa P01 -> không tự mở khóa sang Mã hộ hay thửa P99 cùng chủ hộ; chặn tự duyệt
      const adminSelfReq = await admin.post("/api/public/trace-access-requests").send({
        scannedCode: FX.hhA.plot,
        requesterName: "Admin Tự Xin",
        organization: "Nội bộ",
        contactPhone: "0944332211",
        purpose: "Thử tự phê duyệt",
        requestedTier: "authority",
      });
      expect(adminSelfReq.status).toBe(201);
      reqCodes.push(adminSelfReq.body.requestCode as string);
      const adminSelfId = Number(
        (
          await db.query<{ id: number }>("SELECT id FROM trace_access_requests WHERE request_code = $1", [
            adminSelfReq.body.requestCode,
          ])
        ).rows[0].id,
      );
      expect((await admin.post(`/api/trace-requests/${adminSelfId}/approve`).send({})).status).toBe(403);

      await db.query(
        `INSERT INTO plot_signboard_tokens (plot_code, household_id, village_name, area_ha, tree_count, center_lat, center_lng)
         VALUES ($1, $2, 'Thôn 1', 0.9, 130, $3, $4)`,
        [privateSiblingPlot, ids.hhA, FX.centerLat, FX.centerLng],
      );

      const plotOnlyReq = await request(app).post("/api/public/trace-access-requests").send({
        scannedCode: FX.hhA.plot,
        requesterName: "Đoàn Kiểm Thử 1 Thửa",
        organization: "Đoàn Độc Lập",
        contactPhone: "0933221100",
        purpose: "Chỉ xin xem duy nhất thửa P01",
        requestedTier: "authority",
      });
      expect(plotOnlyReq.status).toBe(201);
      reqCodes.push(plotOnlyReq.body.requestCode as string);
      const plotOnlyId = Number(
        (
          await db.query<{ id: number }>("SELECT id FROM trace_access_requests WHERE request_code = $1", [
            plotOnlyReq.body.requestCode,
          ])
        ).rows[0].id,
      );
      const plotApproveRes = await admin.post(`/api/trace-requests/${plotOnlyId}/approve`).send({});
      expect(plotApproveRes.status).toBe(200);
      expect(plotApproveRes.body.scopeMode).toBe("record");

      const plotStatusRes = await request(app)
        .get(`/api/public/trace-access-requests/${plotOnlyReq.body.requestCode}/status`)
        .set("x-trace-req-secret", plotOnlyReq.body.clientSecret as string);
      const singlePlotPass = plotStatusRes.body.grantedPassToken as string;

      const okOnP01 = await request(app).get(`/api/public/trace/${FX.hhA.plot}`).set("x-audit-pass", singlePlotPass);
      expect(okOnP01.body.accessControl.viewerTier).toBe("authority");

      const blockedOnHh = await request(app).get(`/api/public/trace/${FX.hhA.code}`).set("x-audit-pass", singlePlotPass);
      expect(blockedOnHh.body.accessControl.viewerTier).toBe("public");
      expect(blockedOnHh.body).not.toHaveProperty("authorityData");

      const blockedOnP99 = await request(app)
        .get(`/api/public/trace/${privateSiblingPlot}`)
        .set("x-audit-pass", singlePlotPass);
      expect(blockedOnP99.body.accessControl.viewerTier).toBe("public");
      expect(blockedOnP99.body.fieldAuditData).toBeUndefined();

      // 5. Chặn lạm dụng ?bg=1 ngay lượt gọi đầu tiên để né nhật ký kiểm toán & giữ nguyên mã bắt đầu bằng LOT-...
      const insEdgeLot = await db.query<{ id: number }>(
        `INSERT INTO harvest_lots (code, harvested_on, weight_tons, household_count, buyer, market, status)
         VALUES ($1, '2026-06-01', 1.5, 0, 'Test Buyer', 'Nội địa', 'sampling') RETURNING id`,
        [lotPrefixEdgeCode],
      );
      lotPrefixId = Number(insEdgeLot.rows[0].id);
      const edgeLookup = await request(app).get(`/api/public/trace/${lotPrefixEdgeCode}`);
      expect(edgeLookup.status).toBe(200);
      expect(edgeLookup.body.lot.code).toBe(lotPrefixEdgeCode);

      const inspector = await loggedIn(USERS.inspector);
      const firstHitWithBg = await inspector.get(`/api/trace/${lotPrefixEdgeCode}?bg=1`);
      expect(firstHitWithBg.status).toBe(200);
      const logAfterFirstBg = await db.query<{ cnt: number }>(
        "SELECT COUNT(*)::int AS cnt FROM trace_detail_access_logs WHERE lot_code = $1",
        [lotPrefixEdgeCode],
      );
      expect(logAfterFirstBg.rows[0].cnt).toBe(1);

      const secondHitWithBg = await inspector.get(`/api/trace/${lotPrefixEdgeCode}?bg=1`);
      expect(secondHitWithBg.status).toBe(200);
      const logAfterSecondBg = await db.query<{ cnt: number }>(
        "SELECT COUNT(*)::int AS cnt FROM trace_detail_access_logs WHERE lot_code = $1",
        [lotPrefixEdgeCode],
      );
      expect(logAfterSecondBg.rows[0].cnt).toBe(1);
    } finally {
      if (lotPrefixId) {
        await db.query("DELETE FROM trace_detail_access_logs WHERE lot_code = $1", [lotPrefixEdgeCode]);
        await db.query("DELETE FROM trace_scan_logs WHERE resolved_lot_code = $1", [lotPrefixEdgeCode]);
        await db.query("DELETE FROM harvest_lots WHERE id = $1", [lotPrefixId]);
      }
      await db.query("DELETE FROM plot_signboard_tokens WHERE plot_code = $1", [privateSiblingPlot]);
      if (reqCodes.length > 0) {
        await db.query("DELETE FROM trace_access_requests WHERE request_code = ANY($1::text[])", [reqCodes]);
      }
      await db.query("DELETE FROM users WHERE username = $1", [outRegionUsername]);
    }
  });

  it("chặn truy cập công khai ảnh nhật ký/hóa đơn chưa gắn bản ghi, ảnh đại diện chưa đồng ý và tệp nháp không gắn hộ giữa các cán bộ", async () => {
    const admin = await loggedIn("0901234567");
    const farmer = await loggedIn(FX.farmerUsername);
    const htxOfficer1 = await loggedIn("0912345678");
    const villageOfficer = await loggedIn(USERS.villageOfficer);
    const officer2Username = `htx_off2_${Date.now()}`;
    const createdAttachmentIds: number[] = [];

    const tinyPng = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
      "hex",
    );

    try {
      // 1. Ảnh purpose='journal' vừa tải lên nhưng chưa gắn vào nhật ký / khai báo hiện trường -> /api/public/files/:token chặn 404
      const unlinkedJournalUp = await farmer
        .post("/api/uploads")
        .field("purpose", "journal")
        .attach("file", tinyPng, "draft-invoice.png");
      expect(unlinkedJournalUp.status).toBe(201);
      createdAttachmentIds.push(Number(unlinkedJournalUp.body.id));
      const unlinkedToken = (
        await db.query<{ public_token: string }>("SELECT public_token FROM attachments WHERE id = $1", [
          unlinkedJournalUp.body.id,
        ])
      ).rows[0].public_token;

      expect((await request(app).get(`/api/public/files/${unlinkedToken}`)).status).toBe(404);
      expect((await farmer.get(`/api/uploads/${unlinkedJournalUp.body.id}`)).status).toBe(200);

      // 2. Ảnh đại diện hộ khi public_trace_consent = false -> chặn 404 đối với khách ẩn danh, nhưng chủ hộ và cán bộ đúng thôn vẫn xem được qua cookie phiên
      const avatarUp = await farmer
        .post("/api/uploads")
        .field("purpose", "avatar")
        .attach("file", tinyPng, "farmer-avatar.png");
      expect(avatarUp.status).toBe(201);
      createdAttachmentIds.push(Number(avatarUp.body.id));
      const avatarTok = (
        await db.query<{ public_token: string }>("SELECT public_token FROM attachments WHERE id = $1", [
          avatarUp.body.id,
        ])
      ).rows[0].public_token;

      await db.query("UPDATE households SET avatar_id = $2, public_trace_consent = false WHERE id = $1", [
        ids.hhA,
        avatarUp.body.id,
      ]);

      expect((await request(app).get(`/api/public/files/${avatarTok}`)).status).toBe(404);
      const ownerAvatarRes = await farmer.get(`/api/public/files/${avatarTok}`);
      expect(ownerAvatarRes.status).toBe(200);
      expect(String(ownerAvatarRes.headers["cache-control"] || "")).toContain("private");
      expect((await villageOfficer.get(`/api/public/files/${avatarTok}`)).status).toBe(200);

      // 3. Tệp nháp household_id = NULL do cán bộ 1 tải lên nhưng chưa gắn phiếu -> cán bộ 2 không thể dò ID tuần tự
      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Cán bộ HTX 2",
            username: officer2Username,
            password: TEST_PASSWORD,
            role: "htx_officer",
          })
        ).status,
      ).toBe(201);
      const htxOfficer2 = await loggedIn(officer2Username);

      const unlinkedApprovalUp = await htxOfficer1
        .post("/api/uploads")
        .field("purpose", "approval")
        .attach("file", tinyPng, "staging-approval.png");
      expect(unlinkedApprovalUp.status).toBe(201);
      createdAttachmentIds.push(Number(unlinkedApprovalUp.body.id));
      const unlinkedApprovalTok = (
        await db.query<{ public_token: string }>("SELECT public_token FROM attachments WHERE id = $1", [
          unlinkedApprovalUp.body.id,
        ])
      ).rows[0].public_token;

      expect((await htxOfficer1.get(`/api/uploads/${unlinkedApprovalUp.body.id}`)).status).toBe(200);
      expect((await htxOfficer2.get(`/api/uploads/${unlinkedApprovalUp.body.id}`)).status).toBe(404);
      expect((await request(app).get(`/api/public/files/${unlinkedApprovalTok}`)).status).toBe(404);

      const inspector = await loggedIn(USERS.inspector);
      const unlinkedInspUp = await inspector
        .post("/api/uploads")
        .field("purpose", "inspection")
        .attach("file", tinyPng, "staging-minute.png");
      expect(unlinkedInspUp.status).toBe(201);
      createdAttachmentIds.push(Number(unlinkedInspUp.body.id));
      const unlinkedInspTok = (
        await db.query<{ public_token: string }>("SELECT public_token FROM attachments WHERE id = $1", [
          unlinkedInspUp.body.id,
        ])
      ).rows[0].public_token;
      expect((await inspector.get(`/api/uploads/${unlinkedInspUp.body.id}`)).status).toBe(200);
      expect((await htxOfficer2.get(`/api/uploads/${unlinkedInspUp.body.id}`)).status).toBe(404);
      expect((await request(app).get(`/api/public/files/${unlinkedInspTok}`)).status).toBe(404);
    } finally {
      await db.query("UPDATE households SET avatar_id = NULL, public_trace_consent = false WHERE id = $1", [ids.hhA]);
      if (createdAttachmentIds.length > 0) {
        await db.query("DELETE FROM attachments WHERE id = ANY($1::bigint[])", [createdAttachmentIds]);
      }
      await db.query("DELETE FROM users WHERE username = $1", [officer2Username]);
    }
  });
});
