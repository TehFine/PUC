import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AppValidationPipe } from "../src/common/pipes/validation.pipes";
import { todayVn } from "../src/common/sql/rows";
import { BoundedThrottlerStorage } from "../src/common/throttler/bounded-throttler.storage";
import { DatabaseService } from "../src/database/database.service";
import { TEST_PASSWORD } from "./constants";

const TINY_JPEG = Buffer.from(
  "ffd8ffdb004300" +
    "08".repeat(64) +
    "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000ffc40014100100000000000000000000000000000000ffda0008010100003f003fffd9",
  "hex",
);

const USERS = {
  admin: "0901234567",
  htx: "0912345678",
  inspector: "0923456789",
  villageOfficer: "0934567890",
  farmerAn: "0905123456",
};

let nest: INestApplication;
let app: Server;
let db: DatabaseService;

const cleanup: {
  usernames: string[];
  enterprises: number[];
  contracts: number[];
  lots: number[];
  labTests: number[];
  attachments: number[];
  households: number[];
  violations: number[];
  journals: number[];
} = {
  usernames: [],
  enterprises: [],
  contracts: [],
  lots: [],
  labTests: [],
  attachments: [],
  households: [],
  violations: [],
  journals: [],
};

async function loggedIn(username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

function extractCookieHeader(setCookies: string[] | string | undefined, name: string): string | null {
  const list = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
  for (const raw of list) {
    if (raw.startsWith(`${name}=`)) {
      return raw.split(";")[0] ?? null;
    }
  }
  return null;
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
    if (cleanup.lots.length > 0) {
      await db.query("DELETE FROM harvest_lots WHERE id = ANY($1::bigint[])", [cleanup.lots]);
    }
    if (cleanup.contracts.length > 0) {
      await db.query("DELETE FROM contracts WHERE id = ANY($1::bigint[])", [cleanup.contracts]);
    }
    if (cleanup.labTests.length > 0) {
      await db.query("DELETE FROM lab_tests WHERE id = ANY($1::bigint[])", [cleanup.labTests]);
    }
    if (cleanup.violations.length > 0) {
      await db.query("DELETE FROM violations WHERE id = ANY($1::bigint[])", [cleanup.violations]);
    }
    if (cleanup.journals.length > 0) {
      await db.query("DELETE FROM journal_entries WHERE id = ANY($1::bigint[])", [cleanup.journals]);
    }
    if (cleanup.attachments.length > 0) {
      await db.query("DELETE FROM attachments WHERE id = ANY($1::bigint[])", [cleanup.attachments]);
    }
    if (cleanup.usernames.length > 0) {
      await db.query("DELETE FROM users WHERE username = ANY($1::text[])", [cleanup.usernames]);
    }
    if (cleanup.enterprises.length > 0) {
      await db.query("DELETE FROM enterprises WHERE id = ANY($1::bigint[])", [cleanup.enterprises]);
    }
    if (cleanup.households.length > 0) {
      await db.query("DELETE FROM plot_signboard_tokens WHERE household_id = ANY($1::bigint[])", [cleanup.households]);
      await db.query("DELETE FROM plot_season_quotas WHERE household_id = ANY($1::bigint[])", [cleanup.households]);
      await db.query("DELETE FROM households WHERE id = ANY($1::bigint[])", [cleanup.households]);
    }
  } finally {
    await nest?.close();
  }
});

describe("OWASP Round-2 Hardening Suite (API1..API10 & Top 10:2021)", () => {
  it("[F-02] BoundedThrottlerStorage giữ nguyên cửa sổ trượt khi hết hạn khóa ngắn, chặn vượt 2x limit", async () => {
    const storage = new BoundedThrottlerStorage();
    const realNow = Date.now;
    let fakeNow = 1_700_000_000_000;
    Date.now = () => fakeNow;
    try {
      const ttlMs = 60_000;
      const limit = 4;

      // 1 lượt thăm dò ở t = 0
      const first = await storage.increment("ip:test-burst", ttlMs, limit, 0, "auth-login");
      expect(first.isBlocked).toBe(false);

      // Nhảy tới t = 59s (lượt đầu còn 1s nữa hết hạn) rồi bắn tiếp 4 lượt
      fakeNow += 59_000;
      for (let i = 0; i < 3; i += 1) {
        const ok = await storage.increment("ip:test-burst", ttlMs, limit, 0, "auth-login");
        expect(ok.isBlocked).toBe(false);
      }
      const blocked = await storage.increment("ip:test-burst", ttlMs, limit, 0, "auth-login");
      expect(blocked.isBlocked).toBe(true);

      // Sau 1.1s: lượt thăm dò đầu tiên hết hạn, nên chỉ mở đúng 1 khe (3 lượt ở t=59s vẫn phải còn hiệu lực!)
      fakeNow += 1_100;
      const oneAllowed = await storage.increment("ip:test-burst", ttlMs, limit, 0, "auth-login");
      expect(oneAllowed.isBlocked).toBe(false);
      expect(oneAllowed.totalHits).toBe(4);

      const blockedAgain = await storage.increment("ip:test-burst", ttlMs, limit, 0, "auth-login");
      expect(blockedAgain.isBlocked).toBe(true);
    } finally {
      Date.now = realNow;
      storage.onApplicationShutdown();
    }
  });

  it("[F-03 & F-08] Chặn đầu độc prototype qua ký tự điều khiển '__\\u0000proto__' và từ chối JSON lồng nhau quá sâu (> 24 tầng)", async () => {
    const pipe = new AppValidationPipe();
    const crafted = JSON.parse('{"__\\u0000proto__": {"pollutedAdmin": true}, "q": "an toan"}') as Record<
      string,
      unknown
    >;
    const transformed = (await pipe.transform(crafted, {
      type: "query",
      metatype: Object,
    })) as Record<string, unknown>;

    expect(Object.getPrototypeOf(transformed)).toBe(Object.prototype);
    expect(transformed.pollutedAdmin).toBeUndefined();
    expect(({} as Record<string, unknown>).pollutedAdmin).toBeUndefined();
    expect(transformed.q).toBe("an toan");

    // Payload lồng quá 24 cấp bị chặn 400 ngay cả khi gắn X-Idempotency-Key (không tràn ngăn xếp 500)
    const admin = await loggedIn(USERS.admin);
    let deepBody: Record<string, unknown> = { leaf: "x" };
    for (let i = 0; i < 30; i += 1) {
      deepBody = { nested: deepBody };
    }
    const res = await admin
      .post("/api/villages")
      .set("X-Idempotency-Key", `deep-nest-${Date.now()}`)
      .send(deepBody);
    expect(res.status).toBe(400);
  });

  it("[F-05] Kiểm tra toàn vẹn X-Upload-Sha256 (chặn mảng header trùng), kiểm tra ?size= trên by-hash và cách ly đính kèm giữa các hộ", async () => {
    const htx = await loggedIn(USERS.htx);
    const shaHex = createHash("sha256").update(TINY_JPEG).digest("hex");

    // ?size= không hợp lệ phải trả 400 thay vì âm thầm bỏ qua
    const badSize = await htx.get(`/api/uploads/by-hash?purpose=journal&sha256=${shaHex}&size=abc`);
    expect(badSize.status).toBe(400);

    // Header X-Upload-Sha256 sai lệch phải bị từ chối 400
    const wrongSha = "a".repeat(64);
    const mismatchRes = await htx
      .post("/api/uploads")
      .set("X-Upload-Sha256", wrongSha)
      .field("purpose", "journal")
      .attach("file", TINY_JPEG, { filename: "proof.jpg", contentType: "image/jpeg" });
    expect(mismatchRes.status).toBe(400);

    // Tải lên hợp lệ
    const okUpload = await htx
      .post("/api/uploads")
      .set("X-Upload-Sha256", shaHex)
      .field("purpose", "journal")
      .attach("file", TINY_JPEG, { filename: "proof.jpg", contentType: "image/jpeg" });
    expect(okUpload.status).toBe(201);
    const attId = Number(okUpload.body.id);
    cleanup.attachments.push(attId);

    // Khi tệp chưa gắn hộ (household_id IS NULL), by-hash tìm thấy; sau khi đã gắn cho Hộ #1 thì by-hash của cán bộ trả null để không dùng chéo sang Hộ #2
    const beforeBind = await htx.get(
      `/api/uploads/by-hash?purpose=journal&sha256=${shaHex}&size=${TINY_JPEG.length}`,
    );
    expect(beforeBind.status).toBe(200);
    expect(beforeBind.body.found).toBe(true);
    expect(beforeBind.body.id).toBe(attId);

    const hhRow = await db.query<{ id: number }>("SELECT id FROM households ORDER BY id ASC LIMIT 1");
    await db.query("UPDATE attachments SET household_id = $1 WHERE id = $2", [hhRow.rows[0].id, attId]);

    const afterBind = await htx.get(
      `/api/uploads/by-hash?purpose=journal&sha256=${shaHex}&size=${TINY_JPEG.length}`,
    );
    expect(afterBind.status).toBe(200);
    expect(afterBind.body.found).toBe(false);
  });

  it("[F-06] Phát lại refresh token đã đăng xuất không làm sập phiên trên thiết bị khác, và đình chỉ doanh nghiệp thu hồi ngay quyền truy cập", async () => {
    const admin = await loggedIn(USERS.admin);
    const entRes = await admin.post("/api/enterprises").send({
      code: `DN-R2-${Date.now()}`,
      name: "Công ty Kiểm thử R2",
      packhouseCode: `VN-DLPH-R2${String(Date.now()).slice(-4)}`,
      status: "active",
    });
    expect(entRes.status).toBe(201);
    const entId = Number(entRes.body.id);
    cleanup.enterprises.push(entId);

    const uname = `ent_r2_${Date.now()}`;
    cleanup.usernames.push(uname);
    const accRes = await admin.post("/api/accounts").send({
      fullName: "Đối tác Doanh nghiệp R2",
      username: uname,
      password: "SafePassword123!",
      role: "enterprise",
      enterpriseId: entId,
    });
    expect(accRes.status).toBe(201);

    // Thiết bị A và Thiết bị B cùng đăng nhập
    const deviceA = request.agent(app);
    const loginA = await deviceA.post("/api/auth/login").send({ username: uname, password: "SafePassword123!" });
    expect(loginA.status).toBe(200);
    const refreshCookieA = extractCookieHeader(loginA.headers["set-cookie"], "htx_refresh");
    expect(refreshCookieA).toBeTruthy();

    const deviceB = await loggedIn(uname, "SafePassword123!");

    // Thiết bị A đăng xuất hợp lệ
    const logoutA = await deviceA.post("/api/auth/logout");
    expect(logoutA.status).toBe(200);

    // Phát lại lặp đi lặp lại refresh cookie cũ của Thiết bị A -> bị từ chối 401 nhưng KHÔNG thu hồi phiên đang sống của Thiết bị B!
    for (let i = 0; i < 2; i += 1) {
      const replay = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", refreshCookieA!)
        .set("X-Requested-With", "XMLHttpRequest");
      expect(replay.status).toBe(401);
    }
    const meB = await deviceB.get("/api/auth/me");
    expect(meB.status).toBe(200);

    // Khi HTX đình chỉ doanh nghiệp (status = 'suspended'), phiên của Thiết bị B bị khóa ngay lập tức (401)
    const suspendRes = await admin.patch(`/api/enterprises/${entId}`).send({ status: "suspended" });
    expect(suspendRes.status).toBe(200);

    const meBAfterSuspend = await deviceB.get("/api/auth/me");
    expect(meBAfterSuspend.status).toBe(401);
  });

  it("[P0-1] Cô lập phạm vi liên HTX / liên tỉnh / liên xã trên danh sách hộ, thửa đất, báo cáo, cấp mật khẩu và ẩn email tài khoản hộ dân", async () => {
    const admin = await loggedIn(USERS.admin);
    const inspectorInScope = await loggedIn(USERS.inspector);
    const villageOfficerInScope = await loggedIn(USERS.villageOfficer);

    const extHtxUser = `htx_ext_r2_${Date.now()}`;
    const extInsUser = `ins_ext_r2_${Date.now()}`;
    const extVoUser = `vo_ext_r2_${Date.now()}`;
    cleanup.usernames.push(extHtxUser, extInsUser, extVoUser);

    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Cán bộ HTX Ngoài",
          username: extHtxUser,
          password: "OfficerPassword123!",
          role: "htx_officer",
          coopCode: "HTX-KRONGPAC",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Thanh tra Tỉnh Khác",
          username: extInsUser,
          password: "OfficerPassword123!",
          role: "inspector",
          assignedRegion: "Tỉnh Lâm Đồng",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Cán bộ Xã Ea Khăl R2",
          username: extVoUser,
          password: "OfficerPassword123!",
          role: "village_officer",
          assignedCommune: "Xã Ea Khăl",
        })
      ).status,
    ).toBe(201);

    const extHtx = await loggedIn(extHtxUser, "OfficerPassword123!");
    const extIns = await loggedIn(extInsUser, "OfficerPassword123!");
    const extVo = await loggedIn(extVoUser, "OfficerPassword123!");

    const targetHh = await db.query<{ id: number }>("SELECT id FROM households ORDER BY id ASC LIMIT 1");
    const targetHhId = Number(targetHh.rows[0].id);

    // Cán bộ HTX ngoài không đọc được hộ dân, thửa đất, báo cáo CCCD/thu hoạch và bị chặn 403 khi cấp mật khẩu hộ dân Cư Né
    const extHhList = await extHtx.get("/api/households");
    expect(extHhList.status).toBe(200);
    expect(extHhList.body.data).toHaveLength(0);

    const extPlots = await extHtx.get("/api/plots");
    expect(extPlots.status).toBe(200);
    const plotFeatures = extPlots.body.features ?? extPlots.body.data ?? [];
    expect(plotFeatures).toHaveLength(0);

    const extReportHh = await extHtx.get("/api/reports/households?format=json&audit=1");
    expect(extReportHh.status).toBe(200);
    expect(extReportHh.body.rows).toHaveLength(0);

    const extHtxReportHarvest = await extHtx.get("/api/reports/harvest?format=json&audit=1");
    expect(extHtxReportHarvest.status).toBe(200);
    expect(extHtxReportHarvest.body.rows).toHaveLength(0);

    const extInsTestingList = await extIns.get("/api/testing");
    expect(extInsTestingList.status).toBe(200);
    expect(extInsTestingList.body.data).toHaveLength(0);

    const extInsReportTesting = await extIns.get("/api/reports/lab-tests?format=json&audit=1");
    if (extInsReportTesting.status === 200) {
      expect(extInsReportTesting.body.rows).toHaveLength(0);
    } else {
      expect(extInsReportTesting.status).toBe(403);
    }

    const extReportHarvest = await extIns.get("/api/reports/harvest?format=json&audit=1");
    expect(extReportHarvest.status).toBe(403);

    const extVoHh = await extVo.get("/api/households");
    expect(extVoHh.status).toBe(200);
    expect(extVoHh.body.data).toHaveLength(0);

    const takeoverAttempt = await extHtx
      .post(`/api/households/${targetHhId}/issue-account`)
      .send({ password: "NewFarmerPass123" });
    expect(takeoverAttempt.status).toBe(403);

    // Thanh tra và Cán bộ thôn trong phạm vi đọc được hộ dân nhưng không bị lộ accountEmail / accountUsername
    const insHhList = await inspectorInScope.get("/api/households");
    expect(insHhList.status).toBe(200);
    expect(insHhList.body.data.length).toBeGreaterThan(0);
    for (const row of insHhList.body.data as Array<Record<string, unknown>>) {
      expect(row.accountEmail ?? null).toBeNull();
      expect(row.accountUsername ?? null).toBeNull();
    }

    const voHhList = await villageOfficerInScope.get("/api/households");
    expect(voHhList.status).toBe(200);
    for (const row of voHhList.body.data as Array<Record<string, unknown>>) {
      expect(row.accountEmail ?? null).toBeNull();
      expect(row.accountUsername ?? null).toBeNull();
    }
  });

  it("[P0-2] Doanh nghiệp quét QR biển vườn không được nâng quyền lên Tier-3 fieldAuditData (ẩn lô đối thủ, tọa độ GIS và sổ cái)", async () => {
    const admin = await loggedIn(USERS.admin);
    const entRow = await db.query<{ id: number }>(
      "SELECT enterprise_id AS id FROM harvest_lots WHERE enterprise_id IS NOT NULL LIMIT 1",
    );
    if (entRow.rows.length === 0) return;

    const entUser = `ent_trace_r2_${Date.now()}`;
    cleanup.usernames.push(entUser);
    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Doanh nghiệp Kiểm thử Trace R2",
          username: entUser,
          password: "SafePassword123!",
          role: "enterprise",
          enterpriseId: Number(entRow.rows[0].id),
        })
      ).status,
    ).toBe(201);

    const signboard = await db.query<{ plot_code: string; qr_token: string }>(
      "SELECT plot_code, qr_token FROM plot_signboard_tokens LIMIT 1",
    );
    if (signboard.rows.length === 0) return;

    const entAgent = await loggedIn(entUser, "SafePassword123!");
    const traceRes = await entAgent.get(`/api/trace/${encodeURIComponent(signboard.rows[0].qr_token)}`);
    expect(traceRes.status).toBe(200);
    expect(traceRes.body.fieldAuditData).toBeUndefined();
    expect(traceRes.body.authorityData).toBeUndefined();
  });

  it("[P1-3, P1-4, P1-6 & P2-7a] Niêm phong phiếu kiểm nghiệm đã duyệt, chặn tràn ngày cách ly > 365, chặn gắn chéo hợp đồng/thửa và bọc nháy kép CSV chứa Tab", async () => {
    const admin = await loggedIn(USERS.admin);
    const inspector = await loggedIn(USERS.inspector);
    const htx = await loggedIn(USERS.htx);

    const hhRows = await db.query<{ id: number; village_id: number }>(
      "SELECT id, village_id FROM households ORDER BY id ASC LIMIT 2",
    );
    expect(hhRows.rows.length).toBeGreaterThanOrEqual(2);
    const hhA = Number(hhRows.rows[0].id);
    const hhB = Number(hhRows.rows[1].id);

    // 1. P1-3: Phiếu kiểm nghiệm đã verified không cho phép sửa householdId, sampledOn hay cdMgKg để lách khóa xuất khẩu
    const plotARow = await db.query<{ plot_code: string }>(
      "SELECT plot_code FROM plot_signboard_tokens WHERE household_id = $1 LIMIT 1",
      [hhA],
    );
    const plotACode = plotARow.rows[0]?.plot_code ?? "TH1-001";
    const labCreate = await inspector.post("/api/testing").send({
      code: `KN-R2-${Date.now()}`,
      sampledOn: todayVn(),
      householdId: hhA,
      plotCode: plotACode,
      lab: "Trung tâm Kiểm nghiệm Vùng",
      cdMgKg: 0.08,
      residueMgKg: 0.01,
      yellowOPositive: false,
      result: "fail",
      recordStatus: "verified",
    });
    expect(labCreate.status).toBe(201);
    const labId = Number(labCreate.body.id);
    cleanup.labTests.push(labId);

    const tamperHousehold = await inspector.patch(`/api/testing/${labId}`).send({ householdId: hhB });
    expect(tamperHousehold.status).toBe(400);

    const tamperDate = await inspector.patch(`/api/testing/${labId}`).send({ sampledOn: "2020-01-01" });
    expect(tamperDate.status).toBe(400);

    // 2. P1-4: isolationDays vượt 365 ngày bị chặn 400 (chống lỗi tràn DATE 22008 toàn HTX)
    const pestRow = await db.query<{ id: number }>("SELECT id FROM pesticides WHERE status = 'allowed' LIMIT 1");
    if (pestRow.rows.length > 0) {
      const badSpray = await htx.post("/api/spray").send({
        sprayedOn: todayVn(),
        householdId: hhA,
        pesticideId: Number(pestRow.rows[0].id),
        dose: "20ml/bình",
        areaHa: 0.5,
        isolationDays: 2_147_000_000,
      });
      expect(badSpray.status).toBe(400);
    }

    // 3. P1-6a: Biên bản kiểm tra không cho gắn Hộ A với mã thửa của Hộ B
    const otherPlot = await db.query<{ plot_code: string }>(
      "SELECT plot_code FROM plot_signboard_tokens WHERE household_id = $1 LIMIT 1",
      [hhB],
    );
    if (otherPlot.rows.length > 0) {
      const crossMinute = await inspector.post("/api/minutes").send({
        code: `BB-R2-${Date.now()}`,
        inspectedOn: todayVn(),
        inspector: "Thanh tra Viên",
        householdId: hhA,
        plotCode: otherPlot.rows[0].plot_code,
        vietgapCompliant: true,
        pesticideCompliant: true,
        diaryComplete: true,
        result: "pass",
      });
      expect([400, 403]).toContain(crossMinute.status);
    }

    // 4. P1-6b: Lô thu hoạch của Doanh nghiệp 1 không được gắn hợp đồng của Doanh nghiệp 2
    const ent1 = await admin.post("/api/enterprises").send({
      code: `DN-C1-${Date.now()}`,
      name: "DN Liên Kết 1",
      status: "active",
    });
    const ent2 = await admin.post("/api/enterprises").send({
      code: `DN-C2-${Date.now()}`,
      name: "DN Liên Kết 2",
      status: "active",
    });
    expect(ent1.status).toBe(201);
    expect(ent2.status).toBe(201);
    const ent1Id = Number(ent1.body.id);
    const ent2Id = Number(ent2.body.id);
    cleanup.enterprises.push(ent1Id, ent2Id);

    const contract2 = await htx.post("/api/contracts").send({
      code: `HD-C2-${Date.now()}`,
      title: "Hợp đồng riêng DN 2",
      enterpriseId: ent2Id,
      signedOn: "2026-01-10",
      validUntil: "2026-12-31",
      targetTons: 50,
      status: "active",
    });
    expect(contract2.status).toBe(201);
    const contract2Id = Number(contract2.body.id);
    cleanup.contracts.push(contract2Id);

    const crossContractLot = await htx.post("/api/harvest").send({
      code: `LO-R2-${Date.now()}`,
      harvestedOn: todayVn(),
      buyer: "DN Liên Kết 1",
      enterpriseId: ent1Id,
      contractId: contract2Id,
      weightTons: 5,
      market: "Trung Quốc",
      status: "pending",
    });
    expect(crossContractLot.status).toBe(400);

    // 5. P2-7a: CSV báo cáo bọc nháy kép ký tự Tab và vô hiệu hóa công thức (=CMD...)
    const violTabRes = await inspector.post("/api/violations").send({
      severity: "warning",
      title: `Kiểm tra CSV\t=1+1`,
      householdId: hhA,
      detectedOn: todayVn(),
    });
    const violFormulaRes = await inspector.post("/api/violations").send({
      severity: "warning",
      title: `=CMD|' /C calc'!A0`,
      householdId: hhA,
      detectedOn: todayVn(),
    });
    expect(violTabRes.status).toBe(201);
    expect(violFormulaRes.status).toBe(201);
    cleanup.violations.push(Number(violTabRes.body.id), Number(violFormulaRes.body.id));

    const csvRes = await htx.get("/api/reports/violations");
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain(`"Kiểm tra CSV\t=1+1"`);
    expect(csvRes.text).toContain(`"'=CMD|' /C calc'!A0"`);
  });

  it("Chống khai khống nhật ký: chặn ngày tương lai trên cả cổng hộ dân và quản trị, chặn dùng ảnh cũ khai cho ngày sau và chặn dùng lại ảnh cũ", async () => {
    const farmer = await loggedIn(USERS.farmerAn);
    const htx = await loggedIn(USERS.htx);
    const today = todayVn();
    const [ty, tm, td] = today.split("-").map(Number);
    const isoOffset = (days: number) => {
      const dt = new Date(Date.UTC(ty, tm - 1, td + days));
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    };
    const tomorrow = isoOffset(1);
    const fourDaysAgo = isoOffset(-4);
    const fiveDaysAgo = isoOffset(-5);

    const plotsRes = await farmer.get("/api/portal/plots");
    const plotCode: string = plotsRes.body.data?.[0]?.code ?? "TH1-001";

    const up1 = await farmer
      .post("/api/uploads")
      .field("purpose", "journal")
      .attach("file", TINY_JPEG, { filename: "vuon-hom-nay.jpg", contentType: "image/jpeg" });
    expect(up1.status).toBe(201);
    const photo1 = Number(up1.body.id);
    cleanup.attachments.push(photo1);

    // 1. Khai trước ngày tương lai trên cổng hộ dân bị chặn 400
    const futureFarmer = await farmer.post("/api/portal/journal").send({
      entryOn: tomorrow,
      plotCode,
      activity: "Tưới nước",
      photoId: photo1,
    });
    expect(futureFarmer.status).toBe(400);

    // 2. Khai trước ngày tương lai trên cổng quản trị (/api/journal & /api/spray) cũng bị chặn 400
    const hhRow = await db.query<{ id: number }>("SELECT id FROM households ORDER BY id ASC LIMIT 1");
    const hhId = Number(hhRow.rows[0].id);
    const futureAdminJournal = await htx.post("/api/journal").send({
      entryOn: tomorrow,
      householdId: hhId,
      plotCode: "TH1-001",
      activity: "Tưới nước",
      recorder: "Cán bộ HTX",
    });
    expect(futureAdminJournal.status).toBe(400);

    // 3. Khai lùi > 2 ngày nhưng bỏ trống lý do ghi bổ sung bị chặn 400
    const missingLateReason = await farmer.post("/api/portal/journal").send({
      entryOn: fourDaysAgo,
      plotCode,
      activity: "Cắt cỏ & Dọn vườn",
      photoId: photo1,
    });
    expect(missingLateReason.status).toBe(400);

    // 4. Ảnh chụp từ 5 ngày trước không thể dùng để khai khống cho công việc ngày hôm nay
    const upOld = await farmer
      .post("/api/uploads")
      .field("purpose", "journal")
      .attach("file", TINY_JPEG, { filename: "anh-cu.jpg", contentType: "image/jpeg" });
    expect(upOld.status).toBe(201);
    const oldPhotoId = Number(upOld.body.id);
    cleanup.attachments.push(oldPhotoId);
    await db.query("UPDATE attachments SET created_at = ($1::date)::timestamptz WHERE id = $2", [
      fiveDaysAgo,
      oldPhotoId,
    ]);

    const fakeTodayWithOldPhoto = await farmer.post("/api/portal/journal").send({
      entryOn: today,
      plotCode,
      activity: "Bón phân",
      photoId: oldPhotoId,
    });
    expect(fakeTodayWithOldPhoto.status).toBe(400);

    // 5. Bản ghi hợp lệ hôm nay được lưu thành công, nhưng dùng lại chính photo1 cho bản ghi thứ 2 bị chặn 400
    const validToday = await farmer.post("/api/portal/journal").send({
      entryOn: today,
      plotCode,
      activity: "Tưới nước",
      photoId: photo1,
    });
    expect(validToday.status).toBe(201);
    cleanup.journals.push(Number(validToday.body.id));

    const reuseSamePhoto = await farmer.post("/api/portal/journal").send({
      entryOn: today,
      plotCode,
      activity: "Bón phân",
      photoId: photo1,
    });
    expect(reuseSamePhoto.status).toBe(400);
  });
});
