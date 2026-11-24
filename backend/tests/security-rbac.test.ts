import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { todayVn } from "../src/common/sql/rows";
import { DatabaseService } from "../src/database/database.service";
import { TEST_PASSWORD } from "./constants";

const TINY_JPEG = Buffer.from(
  "ffd8ffdb004300" +
    "08".repeat(64) +
    "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000ffc40014100100000000000000000000000000000000ffda0008010100003f003fffd9",
  "hex",
);
const TINY_PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii");

const USERS = {
  admin: "0901234567",
  htx: "0912345678",
  inspector: "0923456789",
  villageOfficer: "0934567890", // Thôn 1
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

let nest: INestApplication;
let app: Server;
let db: DatabaseService;

const cleanup: {
  contracts: number[];
  enterprises: number[];
  lots: number[];
  households: number[];
  usernames: string[];
  schedules: number[];
  labTests: number[];
  minutes: number[];
  sprays: number[];
  pesticides: number[];
  stampAllocations: number[];
} = {
  contracts: [],
  enterprises: [],
  lots: [],
  households: [],
  usernames: [],
  schedules: [],
  labTests: [],
  minutes: [],
  sprays: [],
  pesticides: [],
  stampAllocations: [],
};

async function loggedIn(username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

async function villageIdOf(name: string): Promise<number> {
  const res = await db.query<{ id: number }>("SELECT id FROM villages WHERE name = $1", [name]);
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
});

afterAll(async () => {
  try {
    if (cleanup.stampAllocations.length > 0) {
      await db.query("DELETE FROM farmer_stamp_allocations WHERE id = ANY($1::bigint[])", [cleanup.stampAllocations]);
    }
    if (cleanup.schedules.length > 0) {
      await db.query("DELETE FROM inspection_schedule WHERE id = ANY($1::bigint[])", [cleanup.schedules]);
    }
    if (cleanup.minutes.length > 0) {
      await db.query("DELETE FROM inspection_minutes WHERE id = ANY($1::bigint[])", [cleanup.minutes]);
    }
    if (cleanup.sprays.length > 0) {
      await db.query("DELETE FROM spray_records WHERE id = ANY($1::bigint[])", [cleanup.sprays]);
    }
    if (cleanup.labTests.length > 0) {
      await db.query("DELETE FROM lab_tests WHERE id = ANY($1::bigint[])", [cleanup.labTests]);
    }
    if (cleanup.lots.length > 0) {
      await db.query("DELETE FROM harvest_lots WHERE id = ANY($1::bigint[])", [cleanup.lots]);
    }
    if (cleanup.contracts.length > 0) {
      await db.query("DELETE FROM contracts WHERE id = ANY($1::bigint[])", [cleanup.contracts]);
    }
    if (cleanup.usernames.length > 0) {
      await db.query("DELETE FROM users WHERE username = ANY($1::text[])", [cleanup.usernames]);
    }
    if (cleanup.enterprises.length > 0) {
      await db.query("DELETE FROM enterprises WHERE id = ANY($1::bigint[])", [cleanup.enterprises]);
    }
    if (cleanup.households.length > 0) {
      await db.query("DELETE FROM harvest_declarations WHERE household_id = ANY($1::bigint[])", [cleanup.households]);
      await db.query("DELETE FROM plot_season_quotas WHERE household_id = ANY($1::bigint[])", [cleanup.households]);
      await db.query("DELETE FROM plot_signboard_tokens WHERE household_id = ANY($1::bigint[])", [cleanup.households]);
      await db.query("DELETE FROM households WHERE id = ANY($1::bigint[])", [cleanup.households]);
    }
    if (cleanup.pesticides.length > 0) {
      await db.query("DELETE FROM pesticides WHERE id = ANY($1::bigint[])", [cleanup.pesticides]);
    }
  } finally {
    await nest.close();
  }
});

describe("SEC-01, SEC-02 & SEC-04: cách ly dữ liệu thương mại, tệp đính kèm và bộ đệm dashboard giữa các doanh nghiệp", () => {
  it("cách ly hợp đồng (SEC-01), tệp tải lên & token công khai (SEC-02), và khóa cache dashboard (SEC-04)", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);
    const inspector = await loggedIn(USERS.inspector);
    const [v1, v2] = await Promise.all([villageIdOf("Thôn 1"), villageIdOf("Thôn 2")]);

    // Tạo 2 doanh nghiệp độc lập A và B kèm tài khoản
    const entARes = await htx.post("/api/enterprises").send({
      code: "DN-SECRBAC-A",
      name: "Doanh Nghiệp Kiểm Thử Alpha",
      taxCode: "6009990001",
      representative: "Đại Diện Alpha",
      phone: "0981000001",
      address: "Krông Búk, Đắk Lắk",
      packhouseCode: "VN-DLPH-9001",
      status: "active",
    });
    const entBRes = await htx.post("/api/enterprises").send({
      code: "DN-SECRBAC-B",
      name: "Doanh Nghiệp Kiểm Thử Beta",
      taxCode: "6009990002",
      representative: "Đại Diện Beta",
      phone: "0981000002",
      address: "Ea H'Leo, Đắk Lắk",
      packhouseCode: "VN-DLPH-9002",
      status: "active",
    });
    expect(entARes.status).toBe(201);
    expect(entBRes.status).toBe(201);
    const entAId = Number(entARes.body.id);
    const entBId = Number(entBRes.body.id);
    cleanup.enterprises.push(entAId, entBId);

    for (const [uname, eid] of [
      ["ent_sec_alpha", entAId],
      ["ent_sec_beta", entBId],
      ["ent_sec_unassigned", null],
    ] as const) {
      cleanup.usernames.push(uname);
      const acc = await admin.post("/api/accounts").send({
        fullName: `Tài khoản ${uname}`,
        username: uname,
        password: "EntSecPassword123",
        role: "enterprise",
        ...(eid ? { enterpriseId: eid } : {}),
      });
      expect(acc.status).toBe(201);
    }

    // SEC-01: Hợp đồng riêng của Alpha và Beta
    const conARes = await htx.post("/api/contracts").send({
      code: "HD-SEC01-ALPHA",
      enterpriseId: entAId,
      title: "Hợp đồng bao tiêu Alpha",
      signedOn: "2026-01-10",
      validUntil: "2026-12-31",
      targetTons: 120,
      priceGuarantee: "82.000 đ/kg",
      market: "Trung Quốc",
      status: "active",
      notes: "Bí mật giá thu mua của Alpha",
    });
    const conBRes = await htx.post("/api/contracts").send({
      code: "HD-SEC01-BETA",
      enterpriseId: entBId,
      title: "Hợp đồng bao tiêu Beta",
      signedOn: "2026-01-12",
      validUntil: "2026-12-31",
      targetTons: 260,
      priceGuarantee: "91.000 đ/kg",
      market: "Trung Quốc",
      status: "active",
      notes: "Bí mật giá thu mua của Beta",
    });
    expect(conARes.status).toBe(201);
    expect(conBRes.status).toBe(201);
    const conAId = Number(conARes.body.id);
    const conBId = Number(conBRes.body.id);
    cleanup.contracts.push(conAId, conBId);

    const entA = await loggedIn("ent_sec_alpha", "EntSecPassword123");
    const entB = await loggedIn("ent_sec_beta", "EntSecPassword123");
    const entNone = await loggedIn("ent_sec_unassigned", "EntSecPassword123");

    // Alpha chỉ thấy hợp đồng của Alpha, kể cả khi cố truyền ?enterpriseId=entBId
    const listA = await entA.get(`/api/contracts?enterpriseId=${entBId}`);
    expect(listA.status).toBe(200);
    expect((listA.body.data as Array<{ id: number }>).map((c) => c.id)).toEqual([conAId]);
    expect(JSON.stringify(listA.body)).not.toContain("91.000");

    expect((await entA.get(`/api/contracts/${conAId}`)).status).toBe(200);
    expect((await entA.get(`/api/contracts/${conBId}`)).status).toBe(404);
    expect((await entNone.get("/api/contracts")).body.data).toEqual([]);
    expect((await entNone.get(`/api/contracts/${conAId}`)).status).toBe(404);

    // Danh bạ doanh nghiệp (/api/enterprises): Alpha không đọc được mã số thuế của Beta
    const entDirA = await entA.get("/api/enterprises");
    expect(entDirA.status).toBe(200);
    expect((entDirA.body.data as Array<{ id: number }>).map((e) => e.id)).toEqual([entAId]);
    expect((await entA.get(`/api/enterprises/${entBId}`)).status).toBe(404);

    // Tạo 2 hộ cung ứng riêng cho Alpha (hhA) và Beta (hhB) kèm tài khoản hộ dân
    const hhARes = await htx.post("/api/households").send({
      code: "SEC02-T1-H701",
      name: "Hộ Nguồn Alpha",
      cccd: "260700000701",
      phone: "0972000701",
      villageId: v1,
      plotCount: 1,
      areaHa: 1.5,
      status: "qualified",
    });
    const hhBRes = await htx.post("/api/households").send({
      code: "SEC02-T2-H702",
      name: "Hộ Nguồn Beta",
      cccd: "260700000702",
      phone: "0972000702",
      villageId: v2,
      plotCount: 1,
      areaHa: 1.6,
      status: "qualified",
    });
    expect(hhARes.status).toBe(201);
    expect(hhBRes.status).toBe(201);
    const hhAId = Number(hhARes.body.id);
    const hhBId = Number(hhBRes.body.id);
    cleanup.households.push(hhAId, hhBId);

    await db.query(
      `INSERT INTO plot_signboard_tokens (plot_code, household_id, village_name, area_ha, tree_count)
       VALUES ('SEC02-PA-01', $1, 'Thôn 1', 1.5, 180),
              ('SEC02-PB-01', $2, 'Thôn 2', 1.6, 200)`,
      [hhAId, hhBId],
    );

    const pwHash = await bcrypt.hash(TEST_PASSWORD, 12);
    cleanup.usernames.push("0972000701", "0972000702");
    await db.query(
      `INSERT INTO users (full_name, username, password_hash, role, status, village_id, household_id)
       VALUES ('Hộ Nguồn Alpha', '0972000701', $1, 'farmer', 'active', $2, $3),
              ('Hộ Nguồn Beta', '0972000702', $1, 'farmer', 'active', $4, $5)`,
      [pwHash, v1, hhAId, v2, hhBId],
    );

    // Lô thu mua riêng của Alpha (1.2 tấn) và Beta (4.5 tấn)
    const lotARes = await htx.post("/api/harvest").send({
      code: "LH-SEC04-ALPHA",
      variety: "Ri6",
      harvestedOn: "2026-05-10",
      weightTons: 1.2,
      buyer: "Alpha",
      market: "Trung Quốc",
      enterpriseId: entAId,
      contractId: conAId,
      status: "sampling",
    });
    const lotBRes = await htx.post("/api/harvest").send({
      code: "LH-SEC04-BETA",
      variety: "Monthong (Dona)",
      harvestedOn: "2026-05-11",
      weightTons: 4.5,
      buyer: "Beta",
      market: "Trung Quốc",
      enterpriseId: entBId,
      contractId: conBId,
      status: "sampling",
    });
    expect(lotARes.status).toBe(201);
    expect(lotBRes.status).toBe(201);
    const lotAId = Number(lotARes.body.id);
    const lotBId = Number(lotBRes.body.id);
    cleanup.lots.push(lotAId, lotBId);

    expect(
      (
        await htx.post(`/api/harvest/${lotAId}/contributions`).send({
          householdId: hhAId,
          plotCode: "SEC02-PA-01",
          weightKg: 1200,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await htx.post(`/api/harvest/${lotBId}/contributions`).send({
          householdId: hhBId,
          plotCode: "SEC02-PB-01",
          weightKg: 4500,
        })
      ).status,
    ).toBe(201);

    // SEC-02: Tải lên tệp khai báo thu hoạch (của hộ Beta không thuộc Alpha), tệp stamp, tệp lab chưa gắn, lab nháp và lab verified
    const farmerB = await loggedIn("0972000702");
    const harvestUploadB = await farmerB
      .post("/api/uploads")
      .field("purpose", "harvest")
      .attach("file", TINY_JPEG, "harvest-b.jpg");
    expect(harvestUploadB.status).toBe(201);
    const declB = await farmerB.post("/api/portal/harvest-declarations").send({
      plotCode: "SEC02-PB-01",
      weightKg: 500,
      photoId: harvestUploadB.body.id,
    });
    expect(declB.status).toBe(201);

    const stampUploadB = await farmerB
      .post("/api/uploads")
      .field("purpose", "stamp")
      .attach("file", TINY_JPEG, "stamp-b.jpg");
    expect(stampUploadB.status).toBe(201);

    const unattachedLabUp = await inspector
      .post("/api/uploads")
      .field("purpose", "lab")
      .attach("file", TINY_PDF, "orphan-lab.pdf");
    const draftLabUp = await inspector
      .post("/api/uploads")
      .field("purpose", "lab")
      .attach("file", TINY_PDF, "draft-lab.pdf");
    const verifiedLabAUp = await inspector
      .post("/api/uploads")
      .field("purpose", "lab")
      .attach("file", TINY_PDF, "verified-a.pdf");
    const verifiedLabBUp = await inspector
      .post("/api/uploads")
      .field("purpose", "lab")
      .attach("file", TINY_PDF, "verified-b.pdf");
    expect(unattachedLabUp.status).toBe(201);
    expect(draftLabUp.status).toBe(201);
    expect(verifiedLabAUp.status).toBe(201);
    expect(verifiedLabBUp.status).toBe(201);
    // Tệp lab mới tải lên chỉ trả đường dẫn nội bộ /api/uploads/:id, chưa mở public
    expect(String(unattachedLabUp.body.url)).toBe(`/api/uploads/${unattachedLabUp.body.id}`);

    const draftLab = await inspector.post("/api/testing").send({
      code: "MK-SEC02-DRAFT-A",
      householdId: hhAId,
      plotCode: "SEC02-PA-01",
      sampledOn: "2026-05-01",
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Vinacontrol",
      recordStatus: "draft",
      scanAttachmentId: draftLabUp.body.id,
    });
    const verifiedLabA = await inspector.post("/api/testing").send({
      code: "MK-SEC02-VER-A",
      householdId: hhAId,
      plotCode: "SEC02-PA-01",
      sampledOn: "2026-05-02",
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Vinacontrol",
      recordStatus: "verified",
      scanAttachmentId: verifiedLabAUp.body.id,
    });
    const verifiedLabB = await inspector.post("/api/testing").send({
      code: "MK-SEC02-VER-B",
      householdId: hhBId,
      plotCode: "SEC02-PB-01",
      sampledOn: "2026-05-02",
      cdMgKg: 0.02,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Quatest 3",
      recordStatus: "verified",
      scanAttachmentId: verifiedLabBUp.body.id,
    });
    expect(draftLab.status).toBe(201);
    expect(verifiedLabA.status).toBe(201);
    expect(verifiedLabB.status).toBe(201);
    cleanup.labTests.push(Number(draftLab.body.id), Number(verifiedLabA.body.id), Number(verifiedLabB.body.id));

    // Doanh nghiệp Alpha bị chặn tải: khai báo hộ Beta, tem, lab chưa gắn, lab nháp của chính hộ Alpha, và lab verified của hộ Beta
    expect((await entA.get(`/api/uploads/${harvestUploadB.body.id}`)).status).toBe(404);
    expect((await entA.get(`/api/uploads/${stampUploadB.body.id}`)).status).toBe(404);
    expect((await entA.get(`/api/uploads/${unattachedLabUp.body.id}`)).status).toBe(404);
    expect((await entA.get(`/api/uploads/${draftLabUp.body.id}`)).status).toBe(404);
    expect((await entA.get(`/api/uploads/${verifiedLabBUp.body.id}`)).status).toBe(404);
    // Nhưng tải được bản scan kiểm nghiệm đã verified của nguồn cung thuộc lô của Alpha
    expect((await entA.get(`/api/uploads/${verifiedLabAUp.body.id}`)).status).toBe(200);

    // Kiểm tra /api/public/files/:token bằng token thật trong DB: chặn lab chưa gắn, lab nháp, harvest và stamp
    const tokenRows = await db.query<{ id: number; public_token: string }>(
      "SELECT id, public_token FROM attachments WHERE id = ANY($1::bigint[])",
      [
        [
          harvestUploadB.body.id,
          stampUploadB.body.id,
          unattachedLabUp.body.id,
          draftLabUp.body.id,
          verifiedLabAUp.body.id,
        ],
      ],
    );
    const tokById = new Map(tokenRows.rows.map((r) => [Number(r.id), r.public_token]));
    expect((await request(app).get(`/api/public/files/${tokById.get(harvestUploadB.body.id)}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/files/${tokById.get(stampUploadB.body.id)}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/files/${tokById.get(unattachedLabUp.body.id)}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/files/${tokById.get(draftLabUp.body.id)}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/files/${tokById.get(verifiedLabAUp.body.id)}`)).status).toBe(200);

    // GET /api/testing của Alpha chỉ trả phiếu verified của nguồn cung Alpha và ẩn scanAttachmentId/householdId
    const testingA = await entA.get("/api/testing");
    expect(testingA.status).toBe(200);
    const codesA = (testingA.body.data as Array<{ code: string; householdId?: unknown; scanAttachmentId?: unknown }>).map(
      (r) => r.code,
    );
    expect(codesA).toContain("MK-SEC02-VER-A");
    expect(codesA).not.toContain("MK-SEC02-DRAFT-A");
    expect(codesA).not.toContain("MK-SEC02-VER-B");
    expect(testingA.body.data[0].householdId).toBeUndefined();
    expect(testingA.body.data[0].scanAttachmentId).toBeUndefined();

    // SEC-04: /api/dashboard/summary tách biệt bộ nhớ đệm L1 và số liệu giữa Alpha và Beta
    const dashA = await entA.get("/api/dashboard/summary");
    const dashB = await entB.get("/api/dashboard/summary");
    expect(dashA.status).toBe(200);
    expect(dashB.status).toBe(200);

    expect(dashA.body.harvest.lots).toBe(1);
    expect(dashA.body.harvest.tons).toBeCloseTo(1.2, 3);
    expect(dashA.body.counts.harvestTons).toBeCloseTo(1.2, 3);
    expect(dashA.body.counts.labTests).toBe(1);
    expect(dashA.body.villages).toEqual([]);

    expect(dashB.body.harvest.lots).toBe(1);
    expect(dashB.body.harvest.tons).toBeCloseTo(4.5, 3);
    expect(dashB.body.counts.harvestTons).toBeCloseTo(4.5, 3);
    expect(dashB.body.counts.labTests).toBe(1);
    expect(dashB.body.villages).toEqual([]);
  });
});

describe("SEC-11: ẩn lịch kiểm tra đột xuất (sudden) và phiếu kiểm nghiệm nháp khỏi cổng hộ dân", () => {
  it("ẩn trên /api/portal/schedule, /api/portal/overview, /api/portal/lab-tests và gỡ thông báo khi đổi sang sudden", async () => {
    const htx = await loggedIn(USERS.htx);
    const inspector = await loggedIn(USERS.inspector);
    const farmerAn = await loggedIn("0905123456"); // householdId = 1

    const tomorrow = addDays(todayVn(), 2);
    const suddenTitle = `Thanh tra đột xuất bí mật SEC11 ${Date.now()}`;
    const periodicTitle = `Kiểm tra định kỳ công khai SEC11 ${Date.now()}`;

    const suddenRes = await htx.post("/api/schedule").send({
      scheduledOn: tomorrow,
      title: suddenTitle,
      officer: "Đoàn Kiểm Tra Đột Xuất",
      plotCount: 3,
      kind: "sudden",
    });
    const periodicRes = await htx.post("/api/schedule").send({
      scheduledOn: tomorrow,
      title: periodicTitle,
      officer: "Cán Bộ Kỹ Thuật HTX",
      plotCount: 4,
      kind: "periodic",
    });
    expect(suddenRes.status).toBe(201);
    expect(periodicRes.status).toBe(201);
    cleanup.schedules.push(Number(suddenRes.body.id), Number(periodicRes.body.id));

    const draftCode = `MK-SEC11-DRAFT-${Date.now()}`;
    const verifiedCode = `MK-SEC11-VER-${Date.now()}`;
    const draftLab = await inspector.post("/api/testing").send({
      code: draftCode,
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: "2035-01-02",
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Phòng Nội Bộ",
      recordStatus: "draft",
    });
    const verifiedLab = await inspector.post("/api/testing").send({
      code: verifiedCode,
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: "2035-01-01",
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Vinacontrol",
      recordStatus: "verified",
    });
    expect(draftLab.status).toBe(201);
    expect(verifiedLab.status).toBe(201);
    cleanup.labTests.push(Number(draftLab.body.id), Number(verifiedLab.body.id));

    const [schedRes, overviewRes, labsRes, notifsRes] = await Promise.all([
      farmerAn.get("/api/portal/schedule"),
      farmerAn.get("/api/portal/overview"),
      farmerAn.get("/api/portal/lab-tests"),
      farmerAn.get("/api/notifications"),
    ]);
    expect(schedRes.status).toBe(200);
    expect(overviewRes.status).toBe(200);
    expect(labsRes.status).toBe(200);
    expect(notifsRes.status).toBe(200);

    expect(JSON.stringify(schedRes.body)).not.toContain(suddenTitle);
    expect(JSON.stringify(schedRes.body)).toContain(periodicTitle);
    expect(JSON.stringify(overviewRes.body)).not.toContain(suddenTitle);
    expect(JSON.stringify(overviewRes.body)).not.toContain(draftCode);
    expect(overviewRes.body.lastTest?.code).toBe(verifiedCode);

    const farmerLabCodes = (labsRes.body.data as Array<{ code: string }>).map((l) => l.code);
    expect(farmerLabCodes).toContain(verifiedCode);
    expect(farmerLabCodes).not.toContain(draftCode);
    expect(JSON.stringify(notifsRes.body)).not.toContain(suddenTitle);
    expect(JSON.stringify(notifsRes.body)).toContain(periodicTitle);

    // Chuyển đợt định kỳ sang đột xuất -> thông báo lịch đã gửi cho hộ dân bị thu hồi ngay
    const patchedToSudden = await htx.patch(`/api/schedule/${periodicRes.body.id}`).send({ kind: "sudden" });
    expect(patchedToSudden.status).toBe(200);
    const notifsAfter = await farmerAn.get("/api/notifications");
    expect(JSON.stringify(notifsAfter.body)).not.toContain(periodicTitle);
  });
});

describe("SEC-15: đóng góp plotCode rỗng vẫn kiểm tra PHI/kiểm nghiệm/hạn ngạch và cấp tem hai vùng -H01 không đụng khóa", () => {
  it("chặn đóng góp khi đang cách ly PHI hoặc rớt kiểm nghiệm dù không có thửa, tính gộp hạn ngạch và cấp tem 2 hộ -H01", async () => {
    const htx = await loggedIn(USERS.htx);
    const inspector = await loggedIn(USERS.inspector);
    const villageOfficer = await loggedIn(USERS.villageOfficer);
    const [v1, v2] = await Promise.all([villageIdOf("Thôn 1"), villageIdOf("Thôn 2")]);

    // Hộ mới chưa có bất kỳ bản ghi nào trong plots / plot_signboard_tokens / plot_season_quotas
    const hhBlankRes = await htx.post("/api/households").send({
      code: "SEC15-BLANK-H601",
      name: "Hộ Chưa Gán Thửa SEC15",
      cccd: "260600000601",
      phone: "0971000601",
      villageId: v2,
      plotCount: 1,
      areaHa: 1.0,
      status: "qualified",
    });
    expect(hhBlankRes.status).toBe(201);
    const hhBlankId = Number(hhBlankRes.body.id);
    cleanup.households.push(hhBlankId);

    const lotRes = await htx.post("/api/harvest").send({
      code: "LH-SEC15-LOCK-2026",
      variety: "Ri6",
      harvestedOn: "2026-06-20",
      weightTons: 2.0,
      buyer: "Đối tác Kiểm Thử SEC15",
      market: "Trung Quốc",
      status: "sampling",
    });
    expect(lotRes.status).toBe(201);
    const lotId = Number(lotRes.body.id);
    cleanup.lots.push(lotId);

    // 1. Ghi nhận phun thuốc còn trong thời gian cách ly PHI (phun 18/06, cách ly 10 ngày -> tới 28/06 > 20/06)
    const pesRes = await db.query<{ id: number }>(
      "SELECT id FROM pesticides WHERE status = 'allowed' AND isolation_days > 0 ORDER BY id ASC LIMIT 1",
    );
    const sprayRes = await htx.post("/api/spray").send({
      sprayedOn: "2026-06-18",
      householdId: hhBlankId,
      pesticideId: Number(pesRes.rows[0].id),
      dose: "25ml/16L",
      areaHa: 0.8,
      isolationDays: 10,
      lateReason: "Bổ sung kiểm thử PHI",
    });
    expect(sprayRes.status).toBe(201);
    cleanup.sprays.push(Number(sprayRes.body.id));

    // Đóng góp không truyền plotCode -> vẫn bị khóa PHI 400
    const phiBlocked = await htx.post(`/api/harvest/${lotId}/contributions`).send({
      householdId: hhBlankId,
      weightKg: 300,
    });
    expect(phiBlocked.status).toBe(400);
    expect(phiBlocked.body.error).toContain("PHI");

    // Xóa bản ghi phun để kiểm tra tiếp khóa phiếu kiểm nghiệm Không đạt khi plotCode rỗng
    await db.query("DELETE FROM spray_records WHERE id = $1", [sprayRes.body.id]);

    const failLab = await inspector.post("/api/testing").send({
      code: "MK-SEC15-FAIL",
      householdId: hhBlankId,
      plotCode: "TH-CHUA-KHAI",
      sampledOn: "2026-06-15",
      cdMgKg: 0.09,
      yellowOPositive: false,
      residueMgKg: 0.02,
      result: "fail",
      lab: "Quatest 3",
      recordStatus: "verified",
    });
    expect(failLab.status).toBe(201);
    cleanup.labTests.push(Number(failLab.body.id));

    const labBlocked = await htx.post(`/api/harvest/${lotId}/contributions`).send({
      householdId: hhBlankId,
      weightKg: 300,
    });
    expect(labBlocked.status).toBe(400);
    expect(labBlocked.body.error).toContain("MK-SEC15-FAIL");

    // Sau khi có mẫu tái kiểm đạt trên cùng thửa -> cho phép đóng góp (plot_code = '')
    const passLab = await inspector.post("/api/testing").send({
      code: "MK-SEC15-REPASS",
      householdId: hhBlankId,
      plotCode: "TH-CHUA-KHAI",
      sampledOn: "2026-06-19",
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Quatest 3",
      recordStatus: "verified",
    });
    expect(passLab.status).toBe(201);
    cleanup.labTests.push(Number(passLab.body.id));

    const firstBlankContrib = await htx.post(`/api/harvest/${lotId}/contributions`).send({
      householdId: hhBlankId,
      weightKg: 700,
    });
    expect(firstBlankContrib.status).toBe(201);

    // Cán bộ Thôn 1 không có hộ nào trong lô này (chỉ có hộ Thôn 2) -> bị chặn 404 trên contributions và incident-trace
    expect((await villageOfficer.get(`/api/harvest/${lotId}/contributions`)).status).toBe(404);
    expect((await villageOfficer.get("/api/harvest/incident-trace?lotCode=LH-SEC15-LOCK-2026")).status).toBe(404);

    // incident-trace theo thửa Thôn 1: cán bộ thôn nhận labTests = [] (không có testing:read), cán bộ HTX không thấy phiếu draft
    const draftIncidentLab = await inspector.post("/api/testing").send({
      code: "MK-SEC17-INC-DRAFT",
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: "2026-06-19",
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Phòng Nội Bộ",
      recordStatus: "draft",
    });
    expect(draftIncidentLab.status).toBe(201);
    cleanup.labTests.push(Number(draftIncidentLab.body.id));

    const voPlotTrace = await villageOfficer.get("/api/harvest/incident-trace?plotCode=TH1-001");
    expect(voPlotTrace.status).toBe(200);
    expect(voPlotTrace.body.labTests).toEqual([]);

    const htxPlotTrace = await htx.get("/api/harvest/incident-trace?plotCode=TH1-001");
    expect(htxPlotTrace.status).toBe(200);
    expect((htxPlotTrace.body.labTests as Array<{ code: string }>).map((t) => t.code)).not.toContain(
      "MK-SEC17-INC-DRAFT",
    );

    // Thiết lập hạn ngạch năm 2026 = 1000 kg cho hộ này, rồi góp thêm vào lô thứ 2: 700 kg cũ (plot_code='') phải được tính vào đã dùng
    await db.query(
      `INSERT INTO plot_signboard_tokens (plot_code, household_id, village_name, area_ha, tree_count)
       VALUES ('SEC15-P601', $1, 'Thôn 2', 1.0, 120)`,
      [hhBlankId],
    );
    const quotaSet = await htx.put("/api/harvest/plot-quotas").send({
      seasonYear: 2026,
      householdId: hhBlankId,
      plotCode: "SEC15-P601",
      zoneCode: "VN-DLOR-0086",
      areaHa: 1.0,
      treeCount: 120,
      maxQuotaKg: 1000,
    });
    expect(quotaSet.status).toBe(200);

    const lot2Res = await htx.post("/api/harvest").send({
      code: "LH-SEC15-QUOTA2-2026",
      variety: "Ri6",
      harvestedOn: "2026-06-25",
      weightTons: 1.0,
      buyer: "Đối tác Kiểm Thử SEC15",
      market: "Trung Quốc",
      status: "sampling",
    });
    expect(lot2Res.status).toBe(201);
    cleanup.lots.push(Number(lot2Res.body.id));

    // Góp thêm 400 kg (700 kg cũ có plot_code='' + 400 = 1100 > 1000 kg) -> chặn 400!
    const overPriorBlankQuota = await htx.post(`/api/harvest/${lot2Res.body.id}/contributions`).send({
      householdId: hhBlankId,
      weightKg: 400,
    });
    expect(overPriorBlankQuota.status).toBe(400);

    // 2. Hai hộ khác vùng cùng có hậu tố -H01 cấp tem đồng thời (Promise.all) và cấp tiếp đợt 2 không đụng UNIQUE
    const hhZ1 = await htx.post("/api/households").send({
      code: "VN-ZONEA-H01",
      name: "Hộ Vùng A H01",
      cccd: "260600000611",
      phone: "0971000611",
      villageId: v1,
      plotCount: 1,
      areaHa: 1.2,
      status: "qualified",
    });
    const hhZ2 = await htx.post("/api/households").send({
      code: "VN-ZONEB-H01",
      name: "Hộ Vùng B H01",
      cccd: "260600000612",
      phone: "0971000612",
      villageId: v2,
      plotCount: 1,
      areaHa: 1.2,
      status: "qualified",
    });
    expect(hhZ1.status).toBe(201);
    expect(hhZ2.status).toBe(201);
    cleanup.households.push(Number(hhZ1.body.id), Number(hhZ2.body.id));

    const [alloc1, alloc2] = await Promise.all([
      htx.post("/api/stamp-allocations").send({ householdId: hhZ1.body.id, quantity: 4 }),
      htx.post("/api/stamp-allocations").send({ householdId: hhZ2.body.id, quantity: 4 }),
    ]);
    expect(alloc1.status).toBe(201);
    expect(alloc2.status).toBe(201);
    cleanup.stampAllocations.push(Number(alloc1.body.id), Number(alloc2.body.id));
    expect(alloc1.body.allocationCode).not.toBe(alloc2.body.allocationCode);
    expect(alloc1.body.fromSerial).not.toBe(alloc2.body.fromSerial);

    const alloc2Next = await htx.post("/api/stamp-allocations").send({ householdId: hhZ2.body.id, quantity: 3 });
    expect(alloc2Next.status).toBe(201);
    cleanup.stampAllocations.push(Number(alloc2Next.body.id));
  });
});

describe("SEC-16: niêm phong sổ cái 24 giờ trên biên bản, phiếu kiểm nghiệm đã duyệt và nhật ký phun thuốc cổng hộ dân", () => {
  it("chặn sửa/xóa biên bản quá 24h, chặn xóa phiếu kiểm nghiệm verified, và chặn hộ dân xóa bản ghi phun của cán bộ hoặc thuốc hạn chế", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);
    const inspector = await loggedIn(USERS.inspector);
    const farmerAn = await loggedIn("0905123456"); // householdId = 1

    // 1. Biên bản kiểm tra mới tạo sửa được trong 24h, nhưng sau khi quá 24h bị khóa cả sửa lẫn xóa
    const minuteRes = await inspector.post("/api/minutes").send({
      code: `BB-SEC16-${Date.now()}`,
      heldOn: todayVn(),
      location: "Thôn 1, Xã Cư Né",
      officer: "KS. Thanh Tra SEC16",
      result: "pass",
      householdId: 1,
      plotCode: "TH1-001",
    });
    expect(minuteRes.status).toBe(201);
    const minuteId = Number(minuteRes.body.id);
    cleanup.minutes.push(minuteId);

    expect((await inspector.patch(`/api/minutes/${minuteId}`).send({ location: "Thôn 1 (đã cập nhật)" })).status).toBe(
      200,
    );

    const ageClient = await db.pool.connect();
    try {
      await ageClient.query("BEGIN");
      await ageClient.query("SELECT set_config('puc.rechaining', 'on', true)");
      await ageClient.query(
        "UPDATE inspection_minutes SET server_recorded_at = now() - interval '25 hours' WHERE id = $1",
        [minuteId],
      );
      await ageClient.query("COMMIT");
    } finally {
      ageClient.release();
    }
    expect((await inspector.patch(`/api/minutes/${minuteId}`).send({ result: "fail" })).status).toBe(400);
    expect((await admin.delete(`/api/minutes/${minuteId}`)).status).toBe(400);

    // 2. Phiếu kiểm nghiệm đã verified không cho phép xóa (kể cả admin); phiếu draft vẫn xóa được
    const verLab = await inspector.post("/api/testing").send({
      code: `MK-SEC16-VER-${Date.now()}`,
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: todayVn(),
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Vinacontrol",
      recordStatus: "verified",
    });
    const draftLab = await inspector.post("/api/testing").send({
      code: `MK-SEC16-DRF-${Date.now()}`,
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: todayVn(),
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Phòng Nội Bộ",
      recordStatus: "draft",
    });
    expect(verLab.status).toBe(201);
    expect(draftLab.status).toBe(201);
    cleanup.labTests.push(Number(verLab.body.id));

    expect((await admin.delete(`/api/testing/${verLab.body.id}`)).status).toBe(400);
    expect((await admin.delete(`/api/testing/${draftLab.body.id}`)).status).toBe(200);

    // 3. Cổng hộ dân: hộ không xóa được bản ghi phun do cán bộ tạo và bản ghi thuốc hạn chế (restricted), ngay cả trong 24h
    const restrictedPes = await htx.post("/api/pesticides").send({
      name: `Thuốc Hạn Chế SEC16 ${Date.now()}`,
      activeIngredient: "Chlorpyrifos-methyl kiểm soát",
      isolationDays: 21,
      status: "restricted",
    });
    expect(restrictedPes.status).toBe(201);
    const restrictedPesId = Number(restrictedPes.body.id);
    cleanup.pesticides.push(restrictedPesId);

    const normalPes = await db.query<{ id: number }>(
      "SELECT id FROM pesticides WHERE status = 'allowed' ORDER BY id ASC LIMIT 1",
    );
    const normalPesId = Number(normalPes.rows[0].id);

    // Cán bộ HTX tạo bản ghi phun cho Hộ 1
    const officerSpray = await htx.post("/api/spray").send({
      sprayedOn: todayVn(),
      householdId: 1,
      pesticideId: normalPesId,
      plotCode: "TH1-001",
      dose: "20ml/16L",
      areaHa: 0.5,
    });
    expect(officerSpray.status).toBe(201);
    cleanup.sprays.push(Number(officerSpray.body.id));

    // Hộ dân tự nhập bản ghi thuốc hạn chế (kèm ảnh hiện trường)
    const up = await farmerAn.post("/api/uploads").field("purpose", "journal").attach("file", TINY_JPEG, "sec16-spray.jpg");
    expect(up.status).toBe(201);

    const farmerRestrictedSpray = await farmerAn.post("/api/portal/spray").send({
      pesticideId: restrictedPesId,
      plotCode: "TH1-001",
      dose: "15ml/16L",
      areaHa: 0.4,
      photoId: up.body.id,
    });
    expect(farmerRestrictedSpray.status).toBe(201);
    expect(farmerRestrictedSpray.body.mrlStatus).toBe("exceeded");
    expect(farmerRestrictedSpray.body.canDelete).toBe(false);
    cleanup.sprays.push(Number(farmerRestrictedSpray.body.id));

    // Cả hai bản ghi đều bị từ chối 403 khi nông hộ cố xóa qua cổng hộ dân
    const delOfficer = await farmerAn.delete(`/api/portal/spray/${officerSpray.body.id}`);
    expect(delOfficer.status).toBe(403);

    const delRestricted = await farmerAn.delete(`/api/portal/spray/${farmerRestrictedSpray.body.id}`);
    expect(delRestricted.status).toBe(403);
  });
});
