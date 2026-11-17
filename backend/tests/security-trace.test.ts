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
