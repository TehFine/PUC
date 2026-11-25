import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { DatabaseService } from "../src/database/database.service";
import { UploadsService } from "../src/uploads/uploads.service";
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
const qrTokens: { lot: string; emptyLot: string; plotA: string; plotB: string } = {
  lot: "",
  emptyLot: "",
  plotA: "",
  plotB: "",
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
    const sbIns = await db.query<{ qr_token: string }>(
      `INSERT INTO plot_signboard_tokens (plot_code, household_id, village_name, area_ha, tree_count, center_lat, center_lng)
       VALUES ($1, $2, $3, 1.2, 180, $4, $5)
       RETURNING qr_token`,
      [plot, hid, vname, FX.centerLat, FX.centerLng],
    );
    if (plot === FX.hhA.plot) qrTokens.plotA = sbIns.rows[0].qr_token;
    if (plot === FX.hhB.plot) qrTokens.plotB = sbIns.rows[0].qr_token;
  }

  // Lô ghép nguyên liệu 2 thôn và lô mới tạo chưa có hộ đóng góp
  const lotRes = await db.query<{ id: number; qr_token: string }>(
    `INSERT INTO harvest_lots (code, harvested_on, weight_tons, household_count, buyer, market, status)
     VALUES ($1, '2020-01-10', 0.3, 2, 'Bên mua kiểm thử', 'Trung Quốc', 'exported') RETURNING id, qr_token`,
    [FX.lot],
  );
  ids.lot = Number(lotRes.rows[0].id);
  qrTokens.lot = lotRes.rows[0].qr_token;
  const emptyRes = await db.query<{ id: number; qr_token: string }>(
    `INSERT INTO harvest_lots (code, harvested_on, weight_tons, household_count, buyer, market, status)
     VALUES ($1, '2020-01-11', 0.1, 0, 'Bên mua kiểm thử', 'Trung Quốc', 'sampling') RETURNING id, qr_token`,
    [FX.emptyLot],
  );
  ids.emptyLot = Number(emptyRes.rows[0].id);
  qrTokens.emptyLot = emptyRes.rows[0].qr_token;
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
  it("trang công khai chỉ mở qua qr_token ngẫu nhiên và không lấy bù biên bản của hộ khác vào mốc kiểm tra", async () => {
    expect((await request(app).get(`/api/public/trace/${FX.lot}`)).status).toBe(404);
    const res = await request(app).get(`/api/public/trace/${qrTokens.lot}`);
    expect(res.status).toBe(200);
    const body = res.body as TraceBody;
    expect(body.accessControl.viewerTier).toBe("public");
    expect(body).not.toHaveProperty("authorityData");
    expect([FX.minuteA, FX.minuteB]).toContain(communeMinuteCode(body));
    expect(codesOf(body.publicData.labTests)).not.toContain(FX.labDraft);
  });

  it("lô chưa có hộ đóng góp: danh sách kiểm nghiệm và biên bản đều rỗng", async () => {
    expect((await request(app).get(`/api/public/trace/${FX.emptyLot}`)).status).toBe(404);
    const pub = await request(app).get(`/api/public/trace/${qrTokens.emptyLot}`);
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
    const initialRes = await request(app).get(`/api/public/trace/${qrTokens.lot}`);
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

      const bgRes = await request(app).get(`/api/public/trace/${qrTokens.lot}?bg=1`);
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
      // 1. Người tiêu dùng công khai (qua qr_token): thấy đủ 2 hộ góp lô kèm mã hộ tra cứu kỹ thuật và tỷ trọng %, chỉ hiện tên hộ đã đồng ý (hhA), ẩn hoàn toàn tên hhB, mã thửa, kg, SĐT, CCCD
      const pubRes = await request(app).get(`/api/public/trace/${qrTokens.lot}`);
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

      // 2. Đoàn thanh tra đột xuất gửi yêu cầu cấp quyền trên trang QR vừa quét (chặn dò mã lô tuần tự khi chưa đăng nhập)
      await db.query("DELETE FROM trace_access_requests WHERE contact_phone = '0988776655'");
      expect(
        (
          await request(app).post("/api/public/trace-access-requests").send({
            scannedCode: FX.lot,
            requesterName: "Trưởng đoàn Nguyễn Thanh Tùng",
            organization: "Đoàn kiểm tra đột xuất Chi cục TT và BVTV",
            contactPhone: "0988776655",
            purpose: "Thử dò mã lô tuần tự không qua QR",
            requestedTier: "authority",
          })
        ).status,
      ).toBe(404);
      const createRes = await request(app)
        .post("/api/public/trace-access-requests")
        .send({
          scannedCode: qrTokens.lot,
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
        .get(`/api/public/trace/${qrTokens.lot}?bg=1`)
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
        .get(`/api/public/trace/${qrTokens.lot}?bg=1`)
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
      // 1. Hai khách ẩn danh cùng IP gửi yêu cầu cho cùng mã QR -> không ghi đè clientSecret của người đầu tiên
      await db.query("DELETE FROM trace_access_requests WHERE contact_phone = '0977665544'");
      const req1 = await request(app).post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.lot,
        requesterName: "Đoàn 1",
        organization: "Chi cục Kiểm tra 1",
        contactPhone: "0977665544",
        purpose: "Kiểm tra hồ sơ lô xuất khẩu đợt 1",
        requestedTier: "enterprise",
      });
      expect(req1.status).toBe(201);
      createdReqCodes.push(req1.body.requestCode as string);

      const req2 = await request(app).post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.lot,
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

      // 5. Chặn dò mã tuần tự khi chưa đăng nhập (404), nhưng vẫn chuẩn hóa tra cứu tiền tố tiếng Việt ("Thửa ...", "Lô: ..."), mã vùng PUC trên kênh PWA đã xác thực
      expect((await request(app).get(`/api/public/trace/${encodeURIComponent(`Thửa ${FX.hhA.plot}`)}`)).status).toBe(404);
      expect((await request(app).get(`/api/public/trace/${encodeURIComponent(`Lô: ${FX.lot}`)}`)).status).toBe(404);
      expect((await request(app).get("/api/public/trace/VN-DLOR-0086")).status).toBe(404);
      const prefixedPlot = await inspector.get(`/api/trace/${encodeURIComponent(`Thửa ${FX.hhA.plot}`)}`);
      expect(prefixedPlot.status).toBe(200);
      const prefixedLot = await inspector.get(`/api/trace/${encodeURIComponent(`Lô: ${FX.lot}`)}`);
      expect(prefixedLot.status).toBe(200);
      const pucLookup = await inspector.get("/api/trace/VN-DLOR-0086");
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
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000c49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
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
          // Khách ẩn danh cầm public_token trần không thể tải trộm ảnh hiện trường của hộ dân (404)
          const pubFieldAnon = await request(app).get(`/api/public/files/${fieldAttRow.public_token}`);
          expect(pubFieldAnon.status).toBe(404);
          // Chủ hộ đăng nhập đúng phạm vi xem được ảnh hiện trường (200 + private, no-store)
          const ownerFieldOk = await farmer.get(`/api/public/files/${fieldAttRow.public_token}`);
          expect(ownerFieldOk.status).toBe(200);
          expect(String(ownerFieldOk.headers["cache-control"] || "")).toContain("no-store");
          // Ảnh hóa đơn vật tư bị khóa tuyệt đối trên /api/public/files/:token kể cả khi đã đăng nhập
          const pubInvoiceAttempt = await request(app).get(`/api/public/files/${attRow.public_token}`);
          expect(pubInvoiceAttempt.status).toBe(404);
          const ownerInvoicePubAttempt = await farmer.get(`/api/public/files/${attRow.public_token}`);
          expect(ownerInvoicePubAttempt.status).toBe(404);
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
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000c49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
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
      // 1. Chặn dò mã hộ ẩn danh (404); ở Cấp 1 công khai (?view=public hoặc quét qr_token bảng thửa) khi hộ CHƯA đồng ý: ẩn ảnh profile, họ tên, SĐT, CCCD, ảnh nhật ký, nhưng hiện chính xác lịch sử đóng góp lô xã
      expect((await request(app).get(`/api/public/trace/${encodeURIComponent(`Mã hộ: ${FX.hhA.code}`)}`)).status).toBe(404);
      const pubHhUnconsented = await htxOfficer.get(
        `/api/trace/${encodeURIComponent(`Mã hộ: ${FX.hhA.code}`)}?view=public`,
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

      // Tương tự khi quét Bảng cắm ở vườn bằng qr_token ở Cấp 1 khi hộ chưa đồng ý
      expect((await request(app).get(`/api/public/trace/${FX.hhA.plot}`)).status).toBe(404);
      const pubPlotUnconsented = await request(app).get(`/api/public/trace/${qrTokens.plotA}`);
      expect(pubPlotUnconsented.status).toBe(200);
      expect(pubPlotUnconsented.body.isPlotSignboard).toBe(true);
      expect(pubPlotUnconsented.body.farmerProfile.avatarUrl).toBeNull();
      expect(pubPlotUnconsented.body.communeLotContributions.totalContributedKg).toBe(100);

      // 2. Cấp 1 công khai khi hộ ĐÃ đồng ý: hiện ảnh profile thật và tên chủ hộ trên tờ A4 của Bảng cắm vườn, vẫn ẩn SĐT/CCCD/nhật ký nội bộ
      await db.query("UPDATE households SET public_trace_consent = true WHERE id = $1", [ids.hhA]);
      const pubHhConsented = await request(app).get(`/api/public/trace/${qrTokens.plotA}`);
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

      // 5. Đoàn thanh tra đột xuất có thể gửi yêu cầu cấp quyền trực tiếp trên Bảng QR Thửa Vườn (chặn dò Mã hộ tuần tự ẩn danh)
      expect(
        (
          await request(app).post("/api/public/trace-access-requests").send({
            scannedCode: FX.hhA.code,
            requesterName: "Đoàn Thanh tra Nông hộ",
            organization: "Chi cục Trồng trọt và BVTV",
            contactPhone: "0977112233",
            purpose: "Thử dò mã hộ ẩn danh",
            requestedTier: "authority",
          })
        ).status,
      ).toBe(404);
      const reqOnHh = await request(app)
        .post("/api/public/trace-access-requests")
        .send({
          scannedCode: qrTokens.plotA,
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
        scannedCode: qrTokens.plotA,
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
      const insEdgeLot = await db.query<{ id: number; qr_token: string }>(
        `INSERT INTO harvest_lots (code, harvested_on, weight_tons, household_count, buyer, market, status)
         VALUES ($1, '2026-06-01', 1.5, 0, 'Test Buyer', 'Nội địa', 'sampling') RETURNING id, qr_token`,
        [lotPrefixEdgeCode],
      );
      lotPrefixId = Number(insEdgeLot.rows[0].id);
      expect((await request(app).get(`/api/public/trace/${lotPrefixEdgeCode}`)).status).toBe(404);
      const edgeLookup = await request(app).get(`/api/public/trace/${insEdgeLot.rows[0].qr_token}`);
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
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000c49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
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

  test("Ngày xác thực hồ sơ (dossierVerifiedOn): lấy đúng mốc nghiệm thu HTX/cơ sở thu mua hoặc biên bản thực địa, không nhảy theo ngày quét mã", async () => {
    const packedLotCode = `LH-VERIFIED-${Date.now()}`;
    try {
      const packedLotIns = await db.query<{ qr_token: string }>(
        `INSERT INTO harvest_lots (code, harvested_on, packed_on, weight_tons, household_count, buyer, market, status)
         VALUES ($1, '2024-07-10', '2024-07-12', 0.5, 1, 'Cơ sở thu mua kiểm thử', 'Trung Quốc', 'in_transit')
         RETURNING qr_token`,
        [packedLotCode],
      );
      const packedLotQrToken = packedLotIns.rows[0].qr_token;
      const inspector = await loggedIn(USERS.inspector);

      // 1. Lô đã xuất khẩu (harvested_on = 2020-01-10 -> packed 2020-01-11 -> exported 2020-01-12)
      const exportedLotRes = await request(app).get(`/api/public/trace/${encodeURIComponent(qrTokens.lot)}`);
      expect(exportedLotRes.status).toBe(200);
      expect(exportedLotRes.body.publicData.lotIdentity.dossierVerifiedOn).toBe("2020-01-12");
      expect(exportedLotRes.body.publicData.verification.dossierVerifiedOn).toBe("2020-01-12");
      expect(exportedLotRes.body.publicData.verification.verifiedAt.slice(0, 10)).not.toBe("2020-01-12");

      // 2. Lô đang vận chuyển đã nghiệm thu đóng gói tại cơ sở thu mua (packed_on = 2024-07-12)
      const inTransitLotRes = await request(app).get(`/api/public/trace/${encodeURIComponent(packedLotQrToken)}`);
      expect(inTransitLotRes.status).toBe(200);
      expect(inTransitLotRes.body.publicData.lotIdentity.dossierVerifiedOn).toBe("2024-07-12");

      // 3. Lô mới lập đang chờ lấy mẫu kiểm định trước xuất (status = 'sampling') -> chờ xác thực (null)
      const samplingLotRes = await request(app).get(`/api/public/trace/${encodeURIComponent(qrTokens.emptyLot)}`);
      expect(samplingLotRes.status).toBe(200);
      expect(samplingLotRes.body.publicData.lotIdentity.dossierVerifiedOn).toBeNull();

      // 4. Hồ sơ thửa đất & nông hộ đã duyệt -> lấy đúng ngày biên bản kiểm tra thực địa (2020-01-06)
      const plotRes = await request(app).get(`/api/public/trace/${encodeURIComponent(qrTokens.plotA)}`);
      expect(plotRes.status).toBe(200);
      expect(plotRes.body.publicData.lotIdentity.dossierVerifiedOn).toBe("2020-01-06");

      const hhRes = await inspector.get(`/api/trace/${encodeURIComponent(FX.hhA.code)}?view=public`);
      expect(hhRes.status).toBe(200);
      expect(hhRes.body.publicData.lotIdentity.dossierVerifiedOn).toBe("2020-01-06");
    } finally {
      await db.query("DELETE FROM harvest_lots WHERE code = $1", [packedLotCode]);
    }
  });
});

describe("ND37-GACC-EVENTS-IMMUTABLE-RBAC: chuẩn Nghị định 37/2026, GACC, mã sự kiện trọng yếu, xác minh nhật ký và kiểm toán bất biến 3 tầng", () => {
  it("phân quyền chặt chẽ ai được xem / ai được xác minh cho dữ liệu NĐ 37, GACC, ảnh sản phẩm lô, mã sự kiện EVT và nhật ký kiểm toán bất biến", async () => {
    const admin = await loggedIn("0901234567");
    const htxOfficer = await loggedIn("0912345678");
    const inspector = await loggedIn(USERS.inspector);
    const villageOfficer = await loggedIn(USERS.villageOfficer);
    const farmer = await loggedIn(FX.farmerUsername);

    const ts = Date.now();
    const nd37LotCode = `LH-ND37-${ts}`;
    const entOwnerCode = `ENT-ND37-OWN-${ts}`;
    const entRivalCode = `ENT-ND37-RIV-${ts}`;
    const entOwnerUser = `ent_nd37_own_${ts}`;
    const entRivalUser = `ent_nd37_riv_${ts}`;
    const outStaffUser = `insp_nd37_out_${ts}`;
    const todayIso = new Date().toISOString().slice(0, 10);

    const tinyPng = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000c49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
      "hex",
    );

    const origZoneRes = await db.query<{
      code: string;
      status: string;
      gacc_code: string | null;
      mard_approved_on: string | null;
      gacc_approved_on: string | null;
    }>(
      `SELECT g.code, g.status, g.gacc_code, g.mard_approved_on::text, g.gacc_approved_on::text
       FROM growing_zones g
       LEFT JOIN plot_signboard_tokens pst
         ON upper(pst.zone_code) = upper(g.code) AND pst.plot_code = $1
       ORDER BY (pst.plot_code IS NOT NULL) DESC, CASE WHEN g.status = 'active' THEN 0 ELSE 1 END, g.code ASC
       LIMIT 1`,
      [FX.hhA.plot],
    );
    const primaryZone = origZoneRes.rows[0];
    expect(primaryZone).toBeDefined();

    const curEndorseGet = await admin.get("/api/harvest/endorsement-config");
    expect(curEndorseGet.status).toBe(200);
    const origEndorse = curEndorseGet.body as {
      programTitle: string;
      directiveNo: string;
      communeAuthority: string;
      provincialAuthority: string;
      officialPortalUrl: string;
      officialDomain: string;
      inspectionUnit: string;
      coopLegalName: string;
      coopTaxCode: string | null;
      coopAddress: string;
    };

    const htxOfficerNameRes = await db.query<{ full_name: string }>(
      "SELECT full_name FROM users WHERE username = '0912345678'",
    );
    const htxOfficerFullName = htxOfficerNameRes.rows[0]?.full_name || "Cán bộ HTX";

    let entOwnerId = 0;
    let entRivalId = 0;
    let nd37LotId = 0;
    let journalAId = 0;
    let journalBId = 0;
    let sprayAId = 0;
    const attachmentIds: number[] = [];
    const reqCodes: string[] = [];

    try {
      // 1. Khởi tạo 2 doanh nghiệp (chủ lô & đối thủ) kèm mã đăng ký GACC trên doanh nghiệp chủ lô
      const createEntOwner = await admin.post("/api/enterprises").send({
        code: entOwnerCode,
        name: "Công ty Xuất khẩu Sầu riêng Chính Ngạch",
        packhouseCode: `VN-DLPH-ND37-${String(ts).slice(-4)}`,
        gaccCode: "CVN240999888",
        mardApprovedOn: "2025-05-10",
        gaccApprovedOn: "2025-06-20",
        address: "Quốc lộ 14, Xã Krông Búk, Tỉnh Đắk Lắk",
        status: "active",
      });
      expect(createEntOwner.status).toBe(201);
      entOwnerId = Number(createEntOwner.body.id);

      const createEntRival = await admin.post("/api/enterprises").send({
        code: entRivalCode,
        name: "Công ty Đối thủ Ngoài Lô",
        packhouseCode: `VN-DLPH-RIV-${String(ts).slice(-4)}`,
        status: "active",
      });
      expect(createEntRival.status).toBe(201);
      entRivalId = Number(createEntRival.body.id);

      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Đại diện Doanh nghiệp Chủ Lô",
            username: entOwnerUser,
            password: TEST_PASSWORD,
            role: "enterprise",
            enterpriseId: entOwnerId,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Đại diện Doanh nghiệp Đối Thủ",
            username: entRivalUser,
            password: TEST_PASSWORD,
            role: "enterprise",
            enterpriseId: entRivalId,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Thanh tra Ngoài Địa Bàn",
            username: outStaffUser,
            password: TEST_PASSWORD,
            role: "inspector",
            assignedRegion: "Tỉnh Lâm Đồng",
          })
        ).status,
      ).toBe(201);

      const entOwnerAgent = await loggedIn(entOwnerUser);
      const entRivalAgent = await loggedIn(entRivalUser);
      const outStaffAgent = await loggedIn(outStaffUser);

      // 2. Cập nhật mã GACC cho vùng trồng & thông tin pháp nhân HTX
      const patchZoneRes = await admin.patch(`/api/growing-zones/${encodeURIComponent(primaryZone.code)}`).send({
        status: primaryZone.status as "active",
        gaccCode: "CVN240111222",
        mardApprovedOn: "2025-03-01",
        gaccApprovedOn: "2025-04-15",
      });
      expect(patchZoneRes.status).toBe(200);
      expect(patchZoneRes.body.gaccCode).toBe("CVN240111222");

      const putEndorseRes = await admin.put("/api/harvest/endorsement-config").send({
        programTitle: origEndorse.programTitle,
        directiveNo: origEndorse.directiveNo,
        communeAuthority: origEndorse.communeAuthority,
        provincialAuthority: origEndorse.provincialAuthority,
        officialPortalUrl: origEndorse.officialPortalUrl,
        officialDomain: origEndorse.officialDomain,
        inspectionUnit: origEndorse.inspectionUnit,
        coopLegalName: "Hợp tác xã Kinh doanh - Dịch vụ Tổng hợp Cư Né",
        coopTaxCode: "6001778899",
        coopAddress: "Thôn 1, Xã Krông Búk, Tỉnh Đắk Lắk",
      });
      expect(putEndorseRes.status).toBe(200);
      expect(putEndorseRes.body.coopTaxCode).toBe("6001778899");

      // 3. Kiểm tra cô lập ảnh sản phẩm lô hàng (purpose='harvest'): chưa gắn vào harvest_lots.product_image_id phải 404
      const lotPhotoUp = await htxOfficer
        .post("/api/uploads")
        .field("purpose", "harvest")
        .attach("file", tinyPng, "lot-product-nd37.png");
      expect(lotPhotoUp.status).toBe(201);
      const lotPhotoId = Number(lotPhotoUp.body.id);
      attachmentIds.push(lotPhotoId);

      const unlinkedHarvestUp = await htxOfficer
        .post("/api/uploads")
        .field("purpose", "harvest")
        .attach("file", tinyPng, "harvest-internal-draft.png");
      expect(unlinkedHarvestUp.status).toBe(201);
      const unlinkedHarvestId = Number(unlinkedHarvestUp.body.id);
      attachmentIds.push(unlinkedHarvestId);

      const tokRows = await db.query<{ id: number; public_token: string }>(
        "SELECT id, public_token FROM attachments WHERE id = ANY($1::bigint[])",
        [[lotPhotoId, unlinkedHarvestId]],
      );
      const lotPhotoToken = tokRows.rows.find((r) => Number(r.id) === lotPhotoId)!.public_token;
      const unlinkedHarvestToken = tokRows.rows.find((r) => Number(r.id) === unlinkedHarvestId)!.public_token;

      expect((await request(app).get(`/api/public/files/${lotPhotoToken}`)).status).toBe(404);
      expect((await request(app).get(`/api/public/files/${unlinkedHarvestToken}`)).status).toBe(404);

      // 4. Tạo lô hàng mới ở khâu lấy mẫu & nghiệm thu sang xuất khẩu kèm chuẩn NĐ 37 (ghi vết vào immutable_change_logs + sinh sự kiện EVT)
      const createLotRes = await htxOfficer.post("/api/harvest").send({
        code: nd37LotCode,
        variety: "Monthong",
        harvestedOn: "2026-08-10",
        packedOn: "2026-08-11",
        weightTons: 1.2,
        enterpriseId: entOwnerId,
        buyer: "Đối tác Nhập khẩu Bí Mật Thượng Hải",
        market: "Trung Quốc (GACC)",
        status: "sampling",
      });
      expect(createLotRes.status).toBe(201);
      nd37LotId = Number(createLotRes.body.id);

      // Gắn 2 hộ đóng góp từ Thôn 1 (hhA) và Thôn 2 (hhB) qua API để tự động đồng bộ sự kiện EVT
      expect(
        (
          await htxOfficer.post(`/api/harvest/${nd37LotId}/contributions`).send({
            householdId: ids.hhA,
            plotCode: FX.hhA.plot,
            weightKg: 500,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await htxOfficer.post(`/api/harvest/${nd37LotId}/contributions`).send({
            householdId: ids.hhB,
            plotCode: FX.hhB.plot,
            weightKg: 700,
          })
        ).status,
      ).toBe(201);

      // Chặn cán bộ khác (admin) gắn chiếm dụng tệp staging chưa liên kết của htxOfficer (400)
      expect(
        (
          await admin.patch(`/api/harvest/${nd37LotId}`).send({
            productImageId: unlinkedHarvestId,
          })
        ).status,
      ).toBe(400);

      // Chính người tải lên (htxOfficer) gắn ảnh sản phẩm lô hàng thành công (lô vẫn đang ở trạng thái sampling trước xuất)
      expect(
        (
          await htxOfficer.patch(`/api/harvest/${nd37LotId}`).send({
            productImageId: lotPhotoId,
          })
        ).status,
      ).toBe(200);

      // Ảnh đã gắn với harvest_lots.product_image_id được mở công khai (200), còn ảnh harvest nháp vẫn 404!
      expect((await request(app).get(`/api/public/files/${lotPhotoToken}`)).status).toBe(200);
      expect((await request(app).get(`/api/public/files/${unlinkedHarvestToken}`)).status).toBe(404);

      // 5. Tạo nhật ký chăm sóc & phun thuốc trước khi chốt xuất khẩu lô, kiểm tra RBAC xác minh và cơ chế tự hủy xác minh khi sửa nội dung
      const createJournalARes = await htxOfficer.post("/api/journal").send({
        entryOn: todayIso,
        householdId: ids.hhA,
        plotCode: FX.hhA.plot,
        activity: "Bón phân hữu cơ vi sinh",
        detail: "Bón 3kg/gốc quanh tán",
      });
      expect(createJournalARes.status).toBe(201);
      journalAId = Number(createJournalARes.body.id);
      expect(createJournalARes.body.verificationStatus).toBe("self_declared");

      const createJournalBRes = await htxOfficer.post("/api/journal").send({
        entryOn: todayIso,
        householdId: ids.hhB,
        plotCode: FX.hhB.plot,
        activity: "Tưới nước nhỏ giọt",
        detail: "Tưới ẩm đầu ngày",
      });
      expect(createJournalBRes.status).toBe(201);
      journalBId = Number(createJournalBRes.body.id);

      // Sửa nhật ký hộ B để tạo bản ghi immutable_change_logs thuộc Thôn 2
      expect(
        (
          await admin.patch(`/api/journal/${journalBId}`).send({
            detail: "Tưới ẩm đầu ngày 45 phút",
          })
        ).status,
      ).toBe(200);

      const pestRes = await db.query<{ id: number }>("SELECT id FROM pesticides WHERE status = 'allowed' LIMIT 1");
      const pesticideId = Number(pestRes.rows[0].id);
      const createSprayARes = await htxOfficer.post("/api/spray").send({
        sprayedOn: "2026-07-01",
        householdId: ids.hhA,
        plotCode: FX.hhA.plot,
        pesticideId,
        dose: "20ml / bình 20L",
        areaHa: 1.0,
        isolationDays: 14,
        lateReason: "Đối chiếu bổ sung sổ phun đầu vụ",
      });
      expect(createSprayARes.status).toBe(201);
      sprayAId = Number(createSprayARes.body.id);
      expect(createSprayARes.body.verificationStatus).toBe("self_declared");

      // Chặn nông hộ, doanh nghiệp, cán bộ thôn và thanh tra ngoài địa bàn tự ý bấm xác minh nhật ký (403)
      expect((await farmer.post(`/api/journal/${journalAId}/verify`).send({ verified: true })).status).toBe(403);
      expect((await entOwnerAgent.post(`/api/journal/${journalAId}/verify`).send({ verified: true })).status).toBe(403);
      expect((await villageOfficer.post(`/api/journal/${journalAId}/verify`).send({ verified: true })).status).toBe(
        403,
      );
      expect((await outStaffAgent.post(`/api/journal/${journalAId}/verify`).send({ verified: true })).status).toBe(403);
      expect((await farmer.post(`/api/spray/${sprayAId}/verify`).send({ verified: true })).status).toBe(403);
      expect((await villageOfficer.post(`/api/spray/${sprayAId}/verify`).send({ verified: true })).status).toBe(403);

      // Cán bộ kỹ thuật HTX trong phạm vi xác minh thành công (200)
      const verifyJournalRes = await htxOfficer.post(`/api/journal/${journalAId}/verify`).send({ verified: true });
      expect(verifyJournalRes.status).toBe(200);
      expect(verifyJournalRes.body.verificationStatus).toBe("verified");
      expect(verifyJournalRes.body.verifiedByName).toBeTruthy();

      const verifySprayRes = await htxOfficer.post(`/api/spray/${sprayAId}/verify`).send({ verified: true });
      expect(verifySprayRes.status).toBe(200);
      expect(verifySprayRes.body.verificationStatus).toBe("verified");

      // Nếu nội dung nhật ký bị sửa sau khi đã xác minh -> trigger tự động đưa về 'self_declared'
      const editAfterVerifyRes = await htxOfficer.patch(`/api/journal/${journalAId}`).send({
        detail: "Bón 3.5kg/gốc quanh tán sau mưa",
      });
      expect(editAfterVerifyRes.status).toBe(200);
      expect(editAfterVerifyRes.body.verificationStatus).toBe("self_declared");
      expect(editAfterVerifyRes.body.verifiedAt).toBeNull();

      // Xác minh lại sau khi đã kiểm tra nội dung mới
      const reVerifyRes = await htxOfficer.post(`/api/journal/${journalAId}/verify`).send({ verified: true });
      expect(reVerifyRes.status).toBe(200);
      expect(reVerifyRes.body.verificationStatus).toBe("verified");

      // Nghiệm thu lô hàng sang trạng thái xuất khẩu qua API (kích hoạt trigger immutable_change_logs + bảo toàn productImageId)
      const patchLotRes = await admin.patch(`/api/harvest/${nd37LotId}`).send({
        brandName: "Cư Né Durian Select",
        expiryOn: "2026-09-15",
        storageCondition: "Bảo quản mát 13°C đến 15°C, độ ẩm 85% đến 90%",
        productImageId: lotPhotoId,
        exportedOn: "2026-08-12",
        weightTons: 1.5,
        status: "exported",
      });
      expect(patchLotRes.status).toBe(200);
      expect(patchLotRes.body.brandName).toBe("Cư Né Durian Select");
      expect(patchLotRes.body.productImageUrl).toContain(lotPhotoToken);

      // 6. CẤP 1 (Công khai qua qr_token): thấy đủ trường NĐ 37, GACC, tổng đếm nhật ký đã xác minh & mã sự kiện EVT, KHÔNG lộ dữ liệu nội bộ; chặn dò theo mã lô tuần tự
      expect((await request(app).get(`/api/public/trace/${encodeURIComponent(nd37LotCode)}`)).status).toBe(404);
      const pubLotRes = await request(app).get(`/api/public/trace/${encodeURIComponent(patchLotRes.body.qrToken as string)}`);
      expect(pubLotRes.status).toBe(200);
      const pubData = pubLotRes.body.publicData;
      expect(pubData.lotIdentity.brandName).toBe("Cư Né Durian Select");
      expect(pubData.lotIdentity.expiryOn).toBe("2026-09-15");
      expect(pubData.lotIdentity.storageCondition).toContain("13°C");
      expect(pubData.lotIdentity.productImageUrl).toContain(lotPhotoToken);
      expect(pubData.growingZone.gaccCode).toBe("CVN240111222");
      expect(pubData.growingZone.geoCheck?.checkedPlotCount).toBe(2);
      expect(pubData.packhouse.gaccCode).toBe("CVN240999888");
      expect(pubData.producer.coopTaxCode).toBe("6001778899");
      expect(pubData.integritySeal.chainVerified).toBe(true);
      expect(pubData.integritySeal.verifiedDiaryRecords).toBeGreaterThanOrEqual(2);
      expect(typeof pubData.integritySeal.selfDeclaredDiaryRecords).toBe("number");

      const expectedHarvestEvt = `EVT-${nd37LotCode}-02-HARV`;
      const timelineSteps = pubData.timeline as Array<{
        key: string;
        eventCode: string;
        recordedByName?: string | null;
      }>;
      expect(timelineSteps.find((s) => s.key === "harvest")?.eventCode).toBe(expectedHarvestEvt);
      for (const st of timelineSteps) {
        expect(st.eventCode).toMatch(/^EVT-/);
        expect(st.recordedByName ?? null).toBeNull();
      }
      expect(pubLotRes.body).not.toHaveProperty("enterpriseData");
      expect(pubLotRes.body).not.toHaveProperty("authorityData");
      const pubSerialized = JSON.stringify(pubLotRes.body);
      expect(pubSerialized).not.toContain("Đối tác Nhập khẩu Bí Mật Thượng Hải");
      expect(pubSerialized).not.toContain(htxOfficerFullName);
      expect(pubSerialized).not.toContain("immutableChangeLogs");

      // Tra cứu trực tiếp bằng Mã sự kiện trọng yếu (EVT-...): chặn dò ẩn danh (404), mở trên kênh PWA đã xác thực
      expect(
        (await request(app).get(`/api/public/trace/${encodeURIComponent(`Mã sự kiện: ${expectedHarvestEvt}`)}`)).status,
      ).toBe(404);
      const evtLookupRes = await inspector.get(
        `/api/trace/${encodeURIComponent(`Mã sự kiện: ${expectedHarvestEvt}`)}?view=public`,
      );
      expect(evtLookupRes.status).toBe(200);
      expect(evtLookupRes.body.publicData.lotIdentity.lotCode).toBe(nd37LotCode);
      expect(evtLookupRes.body.publicData.lotIdentity.matchedEventCode).toBe(expectedHarvestEvt);
      expect(evtLookupRes.body).not.toHaveProperty("authorityData");

      // 7. CẤP 2 (Doanh nghiệp chủ lô vs Doanh nghiệp đối thủ)
      const rivalTrace = await entRivalAgent.get(`/api/trace/${encodeURIComponent(nd37LotCode)}`);
      expect(rivalTrace.status).toBe(200);
      expect(rivalTrace.body.accessControl.scopeDenied).toBe(true);
      expect(rivalTrace.body.accessControl.viewerTier).toBe("public");
      expect(rivalTrace.body).not.toHaveProperty("enterpriseData");

      const ownerTrace = await entOwnerAgent.get(`/api/trace/${encodeURIComponent(nd37LotCode)}`);
      expect(ownerTrace.status).toBe(200);
      expect(ownerTrace.body.accessControl.viewerTier).toBe("enterprise");
      expect(ownerTrace.body).not.toHaveProperty("authorityData");
      expect(ownerTrace.body.enterpriseData.zoneGeoCheck?.checkedPlotCount).toBe(2);

      const ownerEvidence = ownerTrace.body.enterpriseData.evidenceLogs as Array<{
        activity: string;
        verificationStatus: string;
        verifiedByLabel: string | null;
        verifiedByName?: string;
      }>;
      const verifiedEv = ownerEvidence.find((e) => e.activity === "Bón phân hữu cơ vi sinh")!;
      expect(verifiedEv).toBeDefined();
      expect(verifiedEv.verificationStatus).toBe("verified");
      expect(verifiedEv.verifiedByLabel).toBe("Ban Kỹ thuật HTX");
      expect(verifiedEv.verifiedByName).toBeUndefined();
      // Doanh nghiệp bên ngoài KHÔNG được thấy họ tên cá nhân của cán bộ HTX hoặc nhật ký kiểm toán bất biến
      const ownerSerialized = JSON.stringify(ownerTrace.body);
      expect(ownerSerialized).not.toContain(htxOfficerFullName);
      expect(ownerSerialized).not.toContain("immutableChangeLogs");
      expect(ownerSerialized).not.toContain("Đối tác Nhập khẩu Bí Mật Thượng Hải");

      // 8. CẤP 3 (Thanh tra trong địa bàn vs Cán bộ Thôn 1 vs Quyền tạm thời)
      const inspTrace = await inspector.get(`/api/trace/${encodeURIComponent(nd37LotCode)}`);
      expect(inspTrace.status).toBe(200);
      expect(inspTrace.body.accessControl.viewerTier).toBe("authority");
      const inspDiaries = inspTrace.body.authorityData.cultivationDiaries as Array<{
        activity: string;
        verificationStatus: string;
        verifiedByName: string | null;
      }>;
      const inspVerifiedDiary = inspDiaries.find((d) => d.activity === "Bón phân hữu cơ vi sinh")!;
      expect(inspVerifiedDiary.verificationStatus).toBe("verified");
      expect(inspVerifiedDiary.verifiedByName).toBe(htxOfficerFullName);

      const inspImmutable = inspTrace.body.authorityData.immutableChangeLogs as Array<{
        id: number;
        tableName: string;
        recordId: number;
        oldData: Record<string, unknown>;
        newData: Record<string, unknown> | null;
        entryHash: string;
      }>;
      expect(Array.isArray(inspImmutable)).toBe(true);
      expect(inspImmutable.some((l) => l.tableName === "harvest_lots" && l.recordId === nd37LotId)).toBe(true);
      expect(inspImmutable.some((l) => l.tableName === "journal_entries" && l.recordId === journalAId)).toBe(true);
      expect(inspImmutable.some((l) => l.tableName === "journal_entries" && l.recordId === journalBId)).toBe(true);
      const immSerialized = JSON.stringify(inspImmutable);
      expect(immSerialized).not.toContain("Đối tác Nhập khẩu Bí Mật Thượng Hải");
      expect(immSerialized).not.toContain("qr_token");
      expect(immSerialized).not.toContain("enterprise_id");

      // Cán bộ Thôn 1 xem lô ghép 2 thôn: CHỈ được thấy immutableChangeLogs của hộ Thôn 1 (journalAId), KHÔNG thấy cấp lô thương mại hay hộ Thôn 2 (journalBId)
      const voTrace = await villageOfficer.get(`/api/trace/${encodeURIComponent(nd37LotCode)}`);
      expect(voTrace.status).toBe(200);
      expect(voTrace.body.accessControl.viewerTier).toBe("authority");
      const voImmutable = voTrace.body.authorityData.immutableChangeLogs as Array<{
        tableName: string;
        recordId: number;
      }>;
      expect(voImmutable.some((l) => l.tableName === "journal_entries" && l.recordId === journalAId)).toBe(true);
      expect(voImmutable.some((l) => l.tableName === "harvest_lots")).toBe(false);
      expect(voImmutable.some((l) => l.recordId === journalBId)).toBe(false);

      // Đoàn kiểm tra tạm thời (record grant): thấy được immutableChangeLogs nhưng tên cá nhân cán bộ được thay bằng chức danh
      const tempReq = await outStaffAgent.post("/api/public/trace-access-requests").send({
        scannedCode: nd37LotCode,
        requesterName: "Đoàn Kiểm Tra Liên Tỉnh",
        organization: "Cục Chất lượng, Chế biến và Phát triển thị trường",
        contactPhone: "0988776655",
        purpose: "Kiểm tra nhật ký bất biến theo Nghị định 37",
        requestedTier: "authority",
      });
      expect(tempReq.status).toBe(201);
      reqCodes.push(tempReq.body.requestCode as string);
      const tempReqId = Number(
        (
          await db.query<{ id: number }>("SELECT id FROM trace_access_requests WHERE request_code = $1", [
            tempReq.body.requestCode,
          ])
        ).rows[0].id,
      );
      expect((await admin.post(`/api/trace-requests/${tempReqId}/approve`).send({ grantedTier: "authority" })).status).toBe(
        200,
      );
      const tempGrantTrace = await outStaffAgent.get(`/api/trace/${encodeURIComponent(nd37LotCode)}`);
      expect(tempGrantTrace.status).toBe(200);
      expect(tempGrantTrace.body.accessControl.viewerTier).toBe("authority");
      const tempImm = tempGrantTrace.body.authorityData.immutableChangeLogs as Array<{ actorLabel: string }>;
      expect(tempImm.length).toBeGreaterThan(0);
      expect(JSON.stringify(tempImm)).not.toContain(htxOfficerFullName);

      // 9. Khóa cứng cấp PostgreSQL: cấm tuyệt đối UPDATE và DELETE trên bảng immutable_change_logs
      const sampleLogId = inspImmutable[0]!.id;
      await expect(
        db.query("UPDATE immutable_change_logs SET actor_name = 'Giả mạo' WHERE id = $1", [sampleLogId]),
      ).rejects.toThrow(/immutable_change_logs/);
      await expect(
        db.query("DELETE FROM immutable_change_logs WHERE id = $1", [sampleLogId]),
      ).rejects.toThrow(/immutable_change_logs/);
    } finally {
      if (reqCodes.length > 0) {
        await db.query("DELETE FROM trace_access_requests WHERE request_code = ANY($1::text[])", [reqCodes]);
      }
      if (sprayAId) {
        await db.query("DELETE FROM spray_records WHERE id = $1", [sprayAId]);
      }
      const jIds = [journalAId, journalBId].filter(Boolean);
      if (jIds.length > 0) {
        await db.query("DELETE FROM journal_entries WHERE id = ANY($1::bigint[])", [jIds]);
      }
      if (nd37LotId) {
        await db.query("DELETE FROM trace_detail_access_logs WHERE lot_code = $1", [nd37LotCode]);
        await db.query("DELETE FROM trace_scan_logs WHERE resolved_lot_code = $1", [nd37LotCode]);
        await db.query("DELETE FROM harvest_lots WHERE id = $1", [nd37LotId]);
      }
      if (attachmentIds.length > 0) {
        await db.query("DELETE FROM attachments WHERE id = ANY($1::bigint[])", [attachmentIds]);
      }
      await db.query("DELETE FROM users WHERE username = ANY($1::text[])", [
        [entOwnerUser, entRivalUser, outStaffUser],
      ]);
      const eIds = [entOwnerId, entRivalId].filter(Boolean);
      if (eIds.length > 0) {
        await db.query("DELETE FROM enterprises WHERE id = ANY($1::bigint[])", [eIds]);
      }
      await db.query(
        `UPDATE growing_zones
         SET gacc_code = $2, mard_approved_on = $3::date, gacc_approved_on = $4::date
         WHERE code = $1`,
        [
          primaryZone.code,
          primaryZone.gacc_code,
          primaryZone.mard_approved_on,
          primaryZone.gacc_approved_on,
        ],
      );
      if (origEndorse) {
        await db.query(
          `UPDATE commune_endorsement_config
           SET coop_legal_name = $1, coop_tax_code = $2, coop_address = $3
           WHERE id = 1`,
          [origEndorse.coopLegalName, origEndorse.coopTaxCode, origEndorse.coopAddress],
        );
      }
    }
  });

  it("cập nhật tức thời mọi số liệu trên hồ sơ A4 (xóa cache L1) và trả đủ danh sách lớn (>35 bản ghi) phục vụ phân trang nhiều tờ A4", async () => {
    const admin = await loggedIn("0901234567");
    const htxOfficer = await loggedIn("0912345678");
    const inspector = await loggedIn(USERS.inspector);
    const ts = Date.now();
    const todayIso = new Date().toISOString().slice(0, 10);
    const bulkLotCode = `DL-BULK-${String(ts).slice(-6)}`;
    let bulkLotId = 0;
    const bulkJournalIds: number[] = [];

    try {
      // 1. Tạo lô hàng mới kèm đóng góp ban đầu và đọc lần đầu để nạp vào bộ nhớ đệm L1 ("trace")
      const createRes = await htxOfficer.post("/api/harvest").send({
        code: bulkLotCode,
        variety: "Monthong",
        harvestedOn: "2026-07-02",
        packedOn: "2026-07-03",
        weightTons: 1.2,
        buyer: "Công ty Thực phẩm Xuất khẩu A4",
        market: "Trung Quốc (GACC)",
        status: "sampling",
        brandName: "Nhãn Cũ A4",
        avgBrix: 25.5,
        gradeAPct: 82,
        gradeBPct: 14,
        gradeCPct: 4,
      });
      expect(createRes.status).toBe(201);
      bulkLotId = Number(createRes.body.id);

      expect(
        (
          await htxOfficer.post(`/api/harvest/${bulkLotId}/contributions`).send({
            householdId: ids.hhA,
            plotCode: FX.hhA.plot,
            weightKg: 600,
          })
        ).status,
      ).toBe(201);

      const bulkLotQrToken = (
        await db.query<{ qr_token: string }>("SELECT qr_token FROM harvest_lots WHERE id = $1", [bulkLotId])
      ).rows[0].qr_token;
      const pubInitial = await request(app).get(`/api/public/trace/${encodeURIComponent(bulkLotQrToken)}`);
      expect(pubInitial.status).toBe(200);
      expect(Number(pubInitial.body.publicData.lotIdentity.weightTons)).toBeCloseTo(1.2, 2);
      expect(pubInitial.body.publicData.lotIdentity.brandName).toBe("Nhãn Cũ A4");
      expect(Number(pubInitial.body.publicData.lotIdentity.avgBrix)).toBeCloseTo(25.5, 1);
      expect(pubInitial.body.publicData.producer.participatingHouseholdCount).toBe(1);

      // 2. Cập nhật số liệu lô hàng & bổ sung hộ đóng góp thứ 2 qua API -> phản ánh tức thời trên hồ sơ A4 không bị kẹt cache L1
      expect(
        (
          await htxOfficer.post(`/api/harvest/${bulkLotId}/contributions`).send({
            householdId: ids.hhB,
            plotCode: FX.hhB.plot,
            weightKg: 850,
          })
        ).status,
      ).toBe(201);

      const patchRes = await admin.patch(`/api/harvest/${bulkLotId}`).send({
        weightTons: 1.45,
        brandName: "Nhãn Mới Đắk Lắk A4",
        avgBrix: 28.4,
        gradeAPct: 91,
        gradeBPct: 7,
        gradeCPct: 2,
        expiryOn: "2026-08-18",
      });
      expect(patchRes.status).toBe(200);

      const pubAfterPatch = await request(app).get(`/api/public/trace/${encodeURIComponent(bulkLotQrToken)}`);
      expect(pubAfterPatch.status).toBe(200);
      expect(Number(pubAfterPatch.body.publicData.lotIdentity.weightTons)).toBeCloseTo(1.45, 2);
      expect(pubAfterPatch.body.publicData.lotIdentity.brandName).toBe("Nhãn Mới Đắk Lắk A4");
      expect(Number(pubAfterPatch.body.publicData.lotIdentity.avgBrix)).toBeCloseTo(28.4, 1);
      expect(pubAfterPatch.body.publicData.lotIdentity.gradeAPct).toBe(91);
      expect(pubAfterPatch.body.publicData.lotIdentity.expiryOn).toBe("2026-08-18");
      expect(pubAfterPatch.body.publicData.producer.participatingHouseholdCount).toBe(2);

      // 3. Tải lên đồng loạt 36 bản ghi nhật ký canh tác (vượt giới hạn 20/25 cũ) và kiểm tra hồ sơ Cấp 3 trả đủ cho phân trang A4
      for (let idx = 1; idx <= 36; idx += 1) {
        const jRes = await htxOfficer.post("/api/journal").send({
          householdId: ids.hhA,
          plotCode: FX.hhA.plot,
          entryOn: todayIso,
          activity: `Tưới nhỏ giọt và tỉa cành đợt ${String(idx).padStart(2, "0")}`,
          detail: `Kiểm tra ẩm độ gốc lô A4 lượt ${idx}`,
        });
        expect(jRes.status).toBe(201);
        bulkJournalIds.push(Number(jRes.body.id));
      }

      // Xác minh bản ghi mới nhất và kiểm tra bộ đếm trên tờ A4 tăng tức thời
      const verifyLatest = await htxOfficer
        .post(`/api/journal/${bulkJournalIds[bulkJournalIds.length - 1]}/verify`)
        .send({ verified: true });
      expect(verifyLatest.status).toBe(200);

      const inspLotAfterBulk = await inspector.get(`/api/trace/${encodeURIComponent(bulkLotCode)}`);
      expect(inspLotAfterBulk.status).toBe(200);
      expect(inspLotAfterBulk.body.authorityData.cultivationDiaries.length).toBeGreaterThanOrEqual(36);
      expect(inspLotAfterBulk.body.publicData.integritySeal.totalSealedRecords).toBeGreaterThanOrEqual(36);
      expect(inspLotAfterBulk.body.publicData.integritySeal.verifiedDiaryRecords).toBeGreaterThanOrEqual(1);

      const inspPlotAfterBulk = await inspector.get(`/api/trace/${encodeURIComponent(FX.hhA.plot)}`);
      expect(inspPlotAfterBulk.status).toBe(200);
      expect(inspPlotAfterBulk.body.authorityData.cultivationDiaries.length).toBeGreaterThanOrEqual(36);
      expect(inspPlotAfterBulk.body.fieldAuditData.sealedLedger.length).toBeGreaterThanOrEqual(36);
    } finally {
      if (bulkJournalIds.length > 0) {
        await db.query("DELETE FROM journal_entries WHERE id = ANY($1::bigint[])", [bulkJournalIds]);
      }
      if (bulkLotId) {
        await db.query("DELETE FROM trace_detail_access_logs WHERE lot_code = $1", [bulkLotCode]);
        await db.query("DELETE FROM trace_scan_logs WHERE resolved_lot_code = $1", [bulkLotCode]);
        await db.query("DELETE FROM harvest_lots WHERE id = $1", [bulkLotId]);
      }
    }
  });

  it("bảo vệ dữ liệu ảnh hộ dân: khử sạch EXIF/GPS/XMP, chặn Pixel Bomb, khóa vé ký số st1 thu hồi tức thời và dọn tệp nháp mồ côi", async () => {
    const admin = await loggedIn("0901234567");
    const farmer = await loggedIn(FX.farmerUsername);
    const uploadsSvc = nest.get(UploadsService);
    const createdAttachmentIds: number[] = [];
    let createdJournalId = 0;
    let passId = 0;

    const jpegBodyTail = Buffer.from(
      "ffdb004300" +
      "08".repeat(64) +
      "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000ffc40014100100000000000000000000000000000000ffda0008010100003f003fffd9",
      "hex",
    );

    // 1. Tạo tệp JPEG có phân đoạn APP1 EXIF chứa Orientation=6 + chuỗi GPS nhà riêng / số sê-ri máy + COM nhạy cảm
    const secretExifLeak = Buffer.from(
      "GPS-HOME-12.893412-108.234567-iPhone15Pro-Serial998877-HoNguyenVanA",
      "ascii",
    );
    const tiffHeaderAndIfd = Buffer.alloc(26 + secretExifLeak.length);
    tiffHeaderAndIfd.write("MM", 0, "ascii");
    tiffHeaderAndIfd.writeUInt16BE(0x002a, 2);
    tiffHeaderAndIfd.writeUInt32BE(8, 4); // IFD0 tại offset 8
    tiffHeaderAndIfd.writeUInt16BE(1, 8); // 1 entry (Orientation = 6)
    tiffHeaderAndIfd.writeUInt16BE(0x0112, 10);
    tiffHeaderAndIfd.writeUInt16BE(3, 12);
    tiffHeaderAndIfd.writeUInt32BE(1, 14);
    tiffHeaderAndIfd.writeUInt16BE(6, 18);
    tiffHeaderAndIfd.writeUInt32BE(0, 22);
    secretExifLeak.copy(tiffHeaderAndIfd, 26);

    const app1Payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiffHeaderAndIfd]);
    const app1Seg = Buffer.alloc(4 + app1Payload.length);
    app1Seg[0] = 0xff;
    app1Seg[1] = 0xe1;
    app1Seg.writeUInt16BE(2 + app1Payload.length, 2);
    app1Payload.copy(app1Seg, 4);

    const comSecret = Buffer.from("SecretHomeAddressComment123", "ascii");
    const comSeg = Buffer.alloc(4 + comSecret.length);
    comSeg[0] = 0xff;
    comSeg[1] = 0xfe;
    comSeg.writeUInt16BE(2 + comSecret.length, 2);
    comSecret.copy(comSeg, 4);

    const exifJpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), app1Seg, comSeg, jpegBodyTail]);

    try {
      const upExifJpeg = await farmer
        .post("/api/uploads")
        .field("purpose", "journal")
        .attach("file", exifJpeg, "anh-vuon-co-gps.jpg");
      expect(upExifJpeg.status).toBe(201);
      const exifAttId = Number(upExifJpeg.body.id);
      createdAttachmentIds.push(exifAttId);

      const dlCleanJpeg = await farmer.get(`/api/uploads/${exifAttId}`).buffer(true);
      expect(dlCleanJpeg.status).toBe(200);
      const savedJpegBuf = Buffer.from(dlCleanJpeg.body as Buffer);
      expect(savedJpegBuf[0]).toBe(0xff);
      expect(savedJpegBuf[1]).toBe(0xd8);
      expect(savedJpegBuf.includes(Buffer.from("GPS-HOME-12.893412", "ascii"))).toBe(false);
      expect(savedJpegBuf.includes(Buffer.from("Serial998877", "ascii"))).toBe(false);
      expect(savedJpegBuf.includes(Buffer.from("SecretHomeAddressComment123", "ascii"))).toBe(false);
      // Cờ xoay Orientation=6 tối giản (36 byte) vẫn được giữ lại để ảnh chụp dọc không bị nằm ngang
      expect(savedJpegBuf[2]).toBe(0xff);
      expect(savedJpegBuf[3]).toBe(0xe1);
      expect(savedJpegBuf.readUInt16BE(4)).toBe(34);

      // Cột file_data trong PostgreSQL cũng lưu đúng bản sạch đã bóc EXIF
      const dbDataRow = await db.query<{ file_data: Buffer }>(
        "SELECT file_data FROM attachments WHERE id = $1",
        [exifAttId],
      );
      expect(dbDataRow.rows[0].file_data.includes(Buffer.from("Serial998877", "ascii"))).toBe(false);

      // 2. Bóc sạch chunk tEXt/eXIf trong PNG và chặn cứng Pixel Bomb (PNG 12000x12000 & JPEG 10000x10000)
      const basePng = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000c49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
        "hex",
      );
      const pngSecretPayload = Buffer.from("Author\0ChuHoBiMat999", "ascii");
      const pngTextChunk = Buffer.alloc(12 + pngSecretPayload.length);
      pngTextChunk.writeUInt32BE(pngSecretPayload.length, 0);
      pngTextChunk.write("tEXt", 4, "ascii");
      pngSecretPayload.copy(pngTextChunk, 8);
      const pngWithMeta = Buffer.concat([
        basePng.subarray(0, basePng.length - 12),
        pngTextChunk,
        basePng.subarray(basePng.length - 12),
      ]);

      const upPngMeta = await farmer
        .post("/api/uploads")
        .field("purpose", "journal")
        .attach("file", pngWithMeta, "anh-co-text.png");
      expect(upPngMeta.status).toBe(201);
      const pngMetaId = Number(upPngMeta.body.id);
      createdAttachmentIds.push(pngMetaId);

      const dlCleanPng = await farmer.get(`/api/uploads/${pngMetaId}`).buffer(true);
      expect(dlCleanPng.status).toBe(200);
      expect(Buffer.from(dlCleanPng.body as Buffer).includes(Buffer.from("ChuHoBiMat999", "ascii"))).toBe(false);

      // Pixel Bomb PNG (12000 x 12000 = 144 MP) -> bị chặn 400 ngay tại cổng tải lên
      const bombPng = Buffer.from(basePng);
      bombPng.writeUInt32BE(12_000, 16);
      bombPng.writeUInt32BE(12_000, 20);
      const resBombPng = await farmer
        .post("/api/uploads")
        .field("purpose", "journal")
        .attach("file", bombPng, "pixel-bomb.png");
      expect(resBombPng.status).toBe(400);

      // Pixel Bomb JPEG (10000 x 10000 = 100 MP) -> bị chặn 400
      const bombJpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), jpegBodyTail]);
      const sofOffset = bombJpeg.indexOf(Buffer.from([0xff, 0xc0]));
      bombJpeg.writeUInt16BE(10_000, sofOffset + 5);
      bombJpeg.writeUInt16BE(10_000, sofOffset + 7);
      const resBombJpeg = await farmer
        .post("/api/uploads")
        .field("purpose", "journal")
        .attach("file", bombJpeg, "pixel-bomb.jpg");
      expect(resBombJpeg.status).toBe(400);

      // 3. Vé ký số ngắn hạn (st1.) cho ảnh nhật ký hộ dân & thu hồi tức thời khi khóa thẻ thẩm định
      const todayIso = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      const jCreate = await farmer.post("/api/portal/journal").send({
        entryOn: todayIso,
        plotCode: FX.hhA.plot,
        activity: "Tỉa cành thông tán chống nấm",
        detail: "Kiểm tra khóa vé ảnh hộ dân",
        photoId: exifAttId,
      });
      expect(jCreate.status).toBe(201);
      createdJournalId = Number(jCreate.body.id);

      const bareTokenRow = await db.query<{ public_token: string }>(
        "SELECT public_token FROM attachments WHERE id = $1",
        [exifAttId],
      );
      const barePubToken = bareTokenRow.rows[0].public_token;

      // Khách ẩn danh gọi thẳng bare public_token bị từ chối 404
      expect((await request(app).get(`/api/public/files/${barePubToken}`)).status).toBe(404);

      const passCreate = await admin.post("/api/field-audit-passes").send({
        delegationName: "Đoàn Kiểm Tra Bảo Mật Ảnh Hộ Dân",
        organization: "Chi cục Trồng trọt & BVTV",
        durationHours: 4,
      });
      expect(passCreate.status).toBe(201);
      passId = Number(passCreate.body.id);
      const passToken = passCreate.body.passToken as string;

      const auditTraceRes = await request(app)
        .get(`/api/public/trace/${encodeURIComponent(FX.hhA.plot)}`)
        .set("x-audit-pass", passToken);
      expect(auditTraceRes.status).toBe(200);

      const evidenceLogs = auditTraceRes.body.enterpriseData?.evidenceLogs as Array<{
        activity: string;
        detail: string | null;
        photoUrl: string | null;
      }>;
      expect(Array.isArray(evidenceLogs)).toBe(true);
      const targetDiary = evidenceLogs.find((d) => d.detail === "Kiểm tra khóa vé ảnh hộ dân");
      expect(targetDiary?.photoUrl).toMatch(/^\/api\/public\/files\/st1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      const signedPhotoUrl = targetDiary!.photoUrl!;
      expect(signedPhotoUrl).not.toContain(barePubToken);

      // Xem ảnh bằng vé ký số hợp lệ -> 200 OK kèm Cache-Control: private, no-store, max-age=0
      const okTicketFetch = await request(app).get(signedPhotoUrl);
      expect(okTicketFetch.status).toBe(200);
      expect(String(okTicketFetch.headers["cache-control"] || "")).toContain("no-store");

      // Giả mạo chữ ký HMAC 1 ký tự -> từ chối 404
      const lastChar = signedPhotoUrl.slice(-1) === "A" ? "B" : "A";
      const tamperedUrl = signedPhotoUrl.slice(0, -1) + lastChar;
      expect((await request(app).get(tamperedUrl)).status).toBe(404);

      // Thu hồi thẻ thẩm định -> đường dẫn ảnh đã sao chép trước đó lập tức bị khóa 404 ngay tức thì!
      const revokeRes = await admin.patch(`/api/field-audit-passes/${passId}/revoke`);
      expect(revokeRes.status).toBe(200);
      expect((await request(app).get(signedPhotoUrl)).status).toBe(404);

      // 4. Dọn dẹp tệp nháp mồ côi quá 48 giờ nhưng giữ nguyên tuyệt đối tệp đã gắn nhật ký
      await db.query(
        "UPDATE attachments SET created_at = now() - interval '72 hours' WHERE id = ANY($1::bigint[])",
        [[pngMetaId, exifAttId]],
      );
      const sweptCount = await uploadsSvc.cleanupExpiredOrphanAttachments(48);
      expect(sweptCount).toBeGreaterThanOrEqual(1);

      const remainCheck = await db.query<{ id: number }>(
        "SELECT id FROM attachments WHERE id = ANY($1::bigint[])",
        [[pngMetaId, exifAttId]],
      );
      const remainIds = remainCheck.rows.map((r) => Number(r.id));
      // pngMetaId chưa gắn bản ghi nên đã được dọn sạch; exifAttId đã gắn vào journal_entries nên được giữ nguyên!
      expect(remainIds).not.toContain(pngMetaId);
      expect(remainIds).toContain(exifAttId);
    } finally {
      if (passId) {
        await db.query("DELETE FROM field_audit_passes WHERE id = $1", [passId]);
      }
      if (createdJournalId) {
        await db.query("DELETE FROM journal_entries WHERE id = $1", [createdJournalId]);
      }
      if (createdAttachmentIds.length > 0) {
        await db.query("DELETE FROM attachments WHERE id = ANY($1::bigint[])", [createdAttachmentIds]);
      }
    }
  });

  it("chặn mỗi thiết bị chỉ gửi 1 yêu cầu cho tới khi hết hạn xem, cảnh báo lần 1-2, khóa tạm 5 phút ở lần 3 và cô lập xã trên trace-requests", async () => {
    const admin = await loggedIn("0901234567");
    const { TraceDeviceGuardService } = await import("../src/common/trace-device/trace-device-guard.service");
    const deviceGuard = nest.get(TraceDeviceGuardService);

    const deviceA = request.agent(app);
    const deviceB = request.agent(app);
    const createdReqCodes: string[] = [];
    const eaKhalSpecUser = `spec_eakhal_${Date.now()}`;

    try {
      // 1. Thiết bị A quét QR lần đầu -> nhận cookie định danh thiết bị ký HMAC (htx_trace_did)
      const initialScanA = await deviceA.get(`/api/public/trace/${qrTokens.lot}`);
      expect(initialScanA.status).toBe(200);
      const setCookiesA = initialScanA.headers["set-cookie"];
      expect(JSON.stringify(setCookiesA || [])).toContain("htx_trace_did=");

      // 2. Thiết bị A gửi yêu cầu cấp quyền lần đầu -> thành công 201 (pending)
      const firstReqA = await deviceA.post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.lot,
        requesterName: "Đoàn Kiểm Tra Thiết Bị A",
        organization: "Chi cục Kiểm định Chất lượng",
        contactPhone: "0911222333",
        purpose: "Kiểm tra hồ sơ truy xuất lô hàng lần đầu",
        requestedTier: "authority",
      });
      expect(firstReqA.status).toBe(201);
      const reqCodeA = firstReqA.body.requestCode as string;
      const secretA = firstReqA.body.clientSecret as string;
      createdReqCodes.push(reqCodeA);

      // 3. Cố tình gửi lặp lần 1 (khi đang chờ duyệt) -> cảnh báo 1/3 (429 TRACE_REQUEST_WARNING)
      const warn1 = await deviceA.post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.plotA,
        requesterName: "Đoàn Kiểm Tra Thiết Bị A",
        organization: "Chi cục Kiểm định Chất lượng",
        contactPhone: "0911222333",
        purpose: "Cố tình gửi thêm yêu cầu thứ 2 khi chưa hết hạn",
        requestedTier: "authority",
      });
      expect(warn1.status).toBe(429);
      expect(warn1.body.code).toBe("TRACE_REQUEST_WARNING");
      expect(warn1.body.strike).toBe(1);
      expect(warn1.body.maxStrikes).toBe(3);
      expect(String(warn1.body.error)).toContain("1/3");

      // 4. Cố tình gửi lặp lần 2 -> cảnh báo 2/3
      const warn2 = await deviceA.post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.lot,
        requesterName: "Đoàn Kiểm Tra Thiết Bị A",
        organization: "Chi cục Kiểm định Chất lượng",
        contactPhone: "0911222333",
        purpose: "Cố tình gửi lặp lần 2",
        requestedTier: "authority",
      });
      expect(warn2.status).toBe(429);
      expect(warn2.body.code).toBe("TRACE_REQUEST_WARNING");
      expect(warn2.body.strike).toBe(2);
      expect(String(warn2.body.error)).toContain("2/3");

      // 5. Cố tình gửi lặp lần 3 -> khóa thiết bị A trong 5 phút (300 giây) trên toàn bộ trang truy xuất QR
      const blocked3 = await deviceA.post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.lot,
        requesterName: "Đoàn Kiểm Tra Thiết Bị A",
        organization: "Chi cục Kiểm định Chất lượng",
        contactPhone: "0911222333",
        purpose: "Cố tình gửi lặp lần 3",
        requestedTier: "authority",
      });
      expect(blocked3.status).toBe(429);
      expect(blocked3.body.code).toBe("TRACE_DEVICE_BLOCKED");
      expect(blocked3.body.strike).toBe(3);
      expect(blocked3.body.retryAfterSeconds).toBeGreaterThanOrEqual(295);
      expect(blocked3.body.retryAfterSeconds).toBeLessThanOrEqual(300);

      // Thiết bị A bị chặn truy cập vào hồ sơ QR, GPS và trạng thái yêu cầu trong suốt 5 phút tạm khóa
      const traceWhileBlocked = await deviceA.get(`/api/public/trace/${qrTokens.lot}`);
      expect(traceWhileBlocked.status).toBe(429);
      expect(traceWhileBlocked.body.code).toBe("TRACE_DEVICE_BLOCKED");

      const gpsWhileBlocked = await deviceA
        .post(`/api/public/trace/${qrTokens.plotA}/verify-gps`)
        .send({ latitude: FX.centerLat, longitude: FX.centerLng, accuracyMeters: 5 });
      expect(gpsWhileBlocked.status).toBe(429);
      expect(gpsWhileBlocked.body.code).toBe("TRACE_DEVICE_BLOCKED");

      const statusWhileBlocked = await deviceA
        .get(`/api/public/trace-access-requests/${reqCodeA}/status`)
        .set("x-trace-req-secret", secretA);
      expect(statusWhileBlocked.status).toBe(429);

      // 6. Thiết bị B (điện thoại khác cùng mạng Wi-Fi / NAT IP) vẫn quét QR và gửi 1 yêu cầu hợp lệ bình thường
      const scanB = await deviceB.get(`/api/public/trace/${qrTokens.lot}`);
      expect(scanB.status).toBe(200);
      const reqB1 = await deviceB.post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.lot,
        requesterName: "Đoàn Kiểm Tra Thiết Bị B",
        organization: "Đơn vị Độc lập Cùng Wi-Fi",
        contactPhone: "0944555666",
        purpose: "Kiểm tra độc lập trên thiết bị khác",
        requestedTier: "enterprise",
      });
      expect(reqB1.status).toBe(201);
      const reqCodeB1 = reqB1.body.requestCode as string;
      createdReqCodes.push(reqCodeB1);

      // Duyệt yêu cầu của Thiết bị B (còn hạn xem) -> Thiết bị B chưa hết thời gian xem nên gửi tiếp sẽ bị nhắc nhở 1/3
      const reqBRow = await db.query<{ id: number }>(
        "SELECT id FROM trace_access_requests WHERE request_code = $1",
        [reqCodeB1],
      );
      const reqBId = Number(reqBRow.rows[0].id);
      expect((await admin.post(`/api/trace-requests/${reqBId}/approve`).send({ durationHours: 2 })).status).toBe(200);

      const warnBWhileActive = await deviceB.post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.plotA,
        requesterName: "Đoàn Kiểm Tra Thiết Bị B",
        organization: "Đơn vị Độc lập Cùng Wi-Fi",
        contactPhone: "0944555666",
        purpose: "Xin thêm khi thời hạn xem trước đó vẫn còn",
        requestedTier: "authority",
      });
      expect(warnBWhileActive.status).toBe(429);
      expect(warnBWhileActive.body.code).toBe("TRACE_REQUEST_WARNING");
      expect(warnBWhileActive.body.existingStatus).toBe("approved");
      expect(warnBWhileActive.body.strike).toBe(1);

      // Khi hết thời gian xem (expires_at <= now()) -> Thiết bị B được phép gửi yêu cầu mới hợp lệ ngay!
      await db.query(
        "UPDATE trace_access_requests SET expires_at = now() - interval '1 minute' WHERE id = $1",
        [reqBId],
      );
      const reqB2AfterExpiry = await deviceB.post("/api/public/trace-access-requests").send({
        scannedCode: qrTokens.plotA,
        requesterName: "Đoàn Kiểm Tra Thiết Bị B",
        organization: "Đơn vị Độc lập Cùng Wi-Fi",
        contactPhone: "0944555666",
        purpose: "Yêu cầu lại hợp lệ sau khi hết thời gian xem",
        requestedTier: "authority",
      });
      expect(reqB2AfterExpiry.status).toBe(201);
      createdReqCodes.push(reqB2AfterExpiry.body.requestCode as string);

      // 7. Khi hết 5 phút tạm khóa -> Thiết bị A tự động được vào lại trang truy xuất QR bình thường
      await deviceGuard.expireActiveBlocksForTest();
      const traceAfterUnlockA = await deviceA.get(`/api/public/trace/${qrTokens.lot}`);
      expect(traceAfterUnlockA.status).toBe(200);

      // 8. Chống dò mã yêu cầu (403 đồng nhất thay vì 404) & cô lập phạm vi xã trên /api/trace-requests
      const probeNonExistent = await deviceB
        .get("/api/public/trace-access-requests/YCCQ-2099-ZZZZZZ/status")
        .set("x-trace-req-secret", "random-invalid-secret-probe");
      expect(probeNonExistent.status).toBe(403);

      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Chuyên viên Hỗ trợ Xã Ea Khăl",
            username: eaKhalSpecUser,
            password: TEST_PASSWORD,
            role: "support_specialist",
            assignedCommune: "Xã Ea Khăl",
          })
        ).status,
      ).toBe(201);
      const eaKhalSpec = await loggedIn(eaKhalSpecUser);

      // Yêu cầu reqCodeA thuộc Xã Krông Búk -> chuyên viên Xã Ea Khăl không thấy trong danh sách và bị chặn 403 khi duyệt/từ chối
      const scopedList = await eaKhalSpec.get("/api/trace-requests");
      expect(scopedList.status).toBe(200);
      const visibleCodes = (scopedList.body.data as Array<{ requestCode: string }>).map((r) => r.requestCode);
      expect(visibleCodes).not.toContain(reqCodeA);

      const reqARow = await db.query<{ id: number }>(
        "SELECT id FROM trace_access_requests WHERE request_code = $1",
        [reqCodeA],
      );
      const reqAId = Number(reqARow.rows[0].id);
      expect((await eaKhalSpec.post(`/api/trace-requests/${reqAId}/approve`).send({})).status).toBe(403);
      expect((await eaKhalSpec.post(`/api/trace-requests/${reqAId}/reject`).send({})).status).toBe(403);

      // 9. Kiểm tra hợp lệ nghiêm ngặt các trường nhập liệu: SĐT đúng 10 chữ số bắt đầu bằng 0, chặn chuỗi rỗng/ký tự rác/HTML
      const deviceValidCheck = request.agent(app);
      const baseValidPayload = {
        scannedCode: qrTokens.lot,
        requesterName: "Trưởng đoàn Kiểm định",
        organization: "Chi cục Kiểm định Nông lâm sản",
        contactPhone: "0912345678",
        purpose: "Kiểm tra thực địa chất lượng lô sầu riêng",
        requestedTier: "enterprise",
      };

      for (const badPhone of [
        "091234567",    // 9 chữ số
        "09123456789",  // 11 chữ số
        "1912345678",   // không bắt đầu bằng 0
        "0000000000",   // toàn số 0
        "09123abcde",   // chứa chữ cái
        "........",     // ký tự chấm từng lọt regex cũ
      ]) {
        const resPhone = await deviceValidCheck
          .post("/api/public/trace-access-requests")
          .send({ ...baseValidPayload, contactPhone: badPhone });
        expect(resPhone.status).toBe(400);
      }

      for (const badField of [
        { requesterName: "     " },
        { requesterName: "123456" },
        { requesterName: "<script>alert(1)</script>" },
        { organization: "   " },
        { organization: "12345" },
        { organization: "<img src=x onerror=1>" },
        { purpose: "       " },
        { purpose: "1234567" },
        { purpose: "Kiểm tra <script>alert(1)</script>" },
      ]) {
        const resBad = await deviceValidCheck
          .post("/api/public/trace-access-requests")
          .send({ ...baseValidPayload, ...badField });
        expect(resBad.status).toBe(400);
      }

      // Chặn thẻ HTML hoặc durationHours ngoài biên khi Quản trị viên phê duyệt / từ chối
      expect(
        (
          await admin
            .post(`/api/trace-requests/${reqAId}/approve`)
            .send({ durationHours: 999, note: "Ghi chú hợp lệ" })
        ).status,
      ).toBe(400);
      expect(
        (
          await admin
            .post(`/api/trace-requests/${reqAId}/reject`)
            .send({ note: "<script>alert(1)</script>" })
        ).status,
      ).toBe(400);

      // Cho phép SĐT 10 chữ số có dấu cách phân tách ("0912 345 678" -> chuẩn hóa lưu "0912345678")
      const spacedPhoneRes = await deviceValidCheck
        .post("/api/public/trace-access-requests")
        .send({ ...baseValidPayload, contactPhone: "0912 345 678" });
      expect(spacedPhoneRes.status).toBe(201);
      createdReqCodes.push(spacedPhoneRes.body.requestCode as string);
      const savedPhoneRow = await db.query<{ contact_phone: string }>(
        "SELECT contact_phone FROM trace_access_requests WHERE request_code = $1",
        [spacedPhoneRes.body.requestCode],
      );
      expect(savedPhoneRow.rows[0]?.contact_phone).toBe("0912345678");
    } finally {
      await deviceGuard.expireActiveBlocksForTest();
      await db.query("DELETE FROM trace_device_guards");
      if (createdReqCodes.length > 0) {
        await db.query("DELETE FROM trace_access_requests WHERE request_code = ANY($1::text[])", [createdReqCodes]);
      }
      await db.query("DELETE FROM users WHERE username = $1", [eaKhalSpecUser]);
    }
  });
});
