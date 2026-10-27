import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { TEST_PASSWORD } from "./constants";

const USERS = {
  admin: "0901234567",
  htx: "0912345678",
  inspector: "0923456789",
  villageOfficer: "0934567890", // Phạm Văn Ba – Thôn 1
  lockoutTarget: "0945678901", // Nguyễn Thị Cúc – chỉ dùng cho test khóa tài khoản
  lockedFarmer: "0956789012", // Võ Văn Đức – bị khóa sẵn
  farmerAn: "0905123456", // Hộ Nguyễn Văn An (tài khoản hộ dân mẫu)
  farmerBinh: "0912234567", // Hộ Trần Thị Bình
};

let nest: INestApplication;
let app: Server;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(instance);
  await instance.init();
  nest = instance;
  app = instance.getHttpServer() as Server;
});

afterAll(async () => {
  await nest.close();
});

async function login(username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  return { agent, res };
}

async function loggedIn(username: string, password = TEST_PASSWORD) {
  const { agent, res } = await login(username, password);
  expect(res.status).toBe(200);
  return agent;
}

describe("health", () => {
  it("báo CSDL hoạt động", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });
});

describe("xác thực", () => {
  it("từ chối truy cập khi chưa đăng nhập", async () => {
    expect((await request(app).get("/api/households")).status).toBe(401);
    expect((await request(app).get("/api/plots")).status).toBe(401);
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
  });

  it("đăng nhập sai mật khẩu trả 401, không lộ tài khoản có tồn tại hay không", async () => {
    const wrongPassword = await login(USERS.admin, "sai-mat-khau-1");
    const unknownUser = await login("khong-ton-tai", "sai-mat-khau-1");
    expect(wrongPassword.res.status).toBe(401);
    expect(unknownUser.res.status).toBe(401);
    expect(wrongPassword.res.body.error).toBe(unknownUser.res.body.error);
  });

  it("đăng nhập đúng đặt cookie httpOnly và không trả mật khẩu", async () => {
    const { res } = await login(USERS.admin);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: USERS.admin, role: "admin" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const cookies = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookies).toMatch(/htx_access=.*HttpOnly/i);
    expect(cookies).toMatch(/htx_refresh=.*HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);
  });

  it("/me trả vai trò và quyền", async () => {
    const agent = await loggedIn(USERS.inspector);
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("inspector");
    expect(res.body.permissions.minutes).toContain("create");
    expect(res.body.permissions.accounts).toBeUndefined();
  });

  it("tài khoản bị khóa không đăng nhập được", async () => {
    const { res } = await login(USERS.lockedFarmer);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_DISABLED");
  });

  it("khóa tạm sau 5 lần sai mật khẩu, kể cả khi sau đó nhập đúng", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await login(USERS.lockoutTarget, "sai-mat-khau-1")).res.status).toBe(401);
    }
    const { res } = await login(USERS.lockoutTarget);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("ACCOUNT_LOCKED");
  });

  it("refresh xoay vòng token và từ chối token cũ", async () => {
    const { agent, res: loginRes } = await login(USERS.htx);
    const oldRefresh = (loginRes.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("htx_refresh="))!;

    const refreshed = await agent.post("/api/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const replay = await request(app).post("/api/auth/refresh").set("Cookie", oldRefresh.split(";")[0]);
    expect(replay.status).toBe(401);
  });

  it("đăng xuất thu hồi phiên", async () => {
    const agent = await loggedIn(USERS.htx);
    expect((await agent.post("/api/auth/logout")).status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    expect((await agent.post("/api/auth/refresh")).status).toBe(401);
  });

  it("chặn yêu cầu ghi từ Origin lạ (CSRF)", async () => {
    const agent = await loggedIn(USERS.admin);
    const res = await agent.post("/api/villages").set("Origin", "http://evil.example").send({ name: "Thôn X" });
    expect(res.status).toBe(403);
  });
});

describe("phân quyền theo vai trò", () => {
  it("Cán bộ HTX đọc/ghi hộ nhưng không quản lý tài khoản hay xem audit", async () => {
    const agent = await loggedIn(USERS.htx);
    expect((await agent.get("/api/households")).status).toBe(200);
    expect((await agent.get("/api/accounts")).status).toBe(403);
    expect((await agent.get("/api/audit-log")).status).toBe(403);
  });

  it("Kiểm tra viên tạo được biên bản nhưng không duyệt hồ sơ", async () => {
    const agent = await loggedIn(USERS.inspector);
    const created = await agent.post("/api/minutes").send({
      code: "BB-TEST-001",
      heldOn: "2024-11-01",
      location: "Thôn 1 – kiểm tra thử",
      officer: "KS. Lê Văn Kiểm",
      result: "pass",
    });
    expect(created.status).toBe(201);
    expect(created.body.heldOn).toBe("2024-11-01");
    const approve = await agent.patch("/api/approvals/1").send({ status: "approved" });
    expect(approve.status).toBe(403);
  });

  it("Cán bộ HTX duyệt hồ sơ và hệ thống ghi người duyệt", async () => {
    const agent = await loggedIn(USERS.htx);
    const res = await agent.patch("/api/approvals/1").send({ status: "approved" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.reviewedAt).toBeTruthy();
  });

  it("Cán bộ Thôn chỉ thấy hộ trong thôn của mình", async () => {
    const agent = await loggedIn(USERS.villageOfficer);
    const res = await agent.get("/api/households");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.data.every((h: { villageName: string }) => h.villageName === "Thôn 1")).toBe(true);

    const other = await agent.get("/api/households/2"); // Trần Thị Bình – Thôn 2
    expect(other.status).toBe(404);
  });

  it("Số CCCD chỉ hiện đầy đủ với quản trị viên và cán bộ HTX; vai trò khác bị che và không dò được", async () => {
    const full = await (await loggedIn(USERS.htx)).get("/api/households/1");
    expect(full.body.cccd).toMatch(/^\d{12}$/);

    for (const username of [USERS.villageOfficer, USERS.inspector]) {
      const agent = await loggedIn(username);
      const one = await agent.get("/api/households/1");
      expect(one.body.cccd).toBe(`********${full.body.cccd.slice(-4)}`);
      const list = await agent.get("/api/households");
      expect(list.body.data.every((h: { cccd: string }) => /^\*+\d{4}$/.test(h.cccd))).toBe(true);
      // Tìm theo CCCD đầy đủ không được trả kết quả (không dò được qua ô tìm kiếm).
      const probe = await agent.get(`/api/households?q=${full.body.cccd}`);
      expect(probe.body.total).toBe(0);
    }
  });

  it("Cán bộ Thôn không ghi nhật ký cho hộ ngoài thôn", async () => {
    const agent = await loggedIn(USERS.villageOfficer);
    const body = { entryOn: "2024-11-02", plotCode: "TH2-001", activity: "Tưới nước", recorder: "Cán bộ Thôn" };
    expect((await agent.post("/api/journal").send({ ...body, householdId: 2 })).status).toBe(403);
    expect((await agent.post("/api/journal").send({ ...body, householdId: 1 })).status).toBe(201);
  });

  it("Nông dân chỉ xem được danh mục", async () => {
    const admin = await loggedIn(USERS.admin);
    const created = await admin
      .post("/api/accounts")
      .send({ fullName: "Nông Dân Thử", username: "0999000111", password: "Farmer123", role: "farmer" });
    expect(created.status).toBe(201);

    const farmer = await loggedIn("0999000111", "Farmer123");
    expect((await farmer.get("/api/pesticides")).status).toBe(200);
    expect((await farmer.get("/api/households")).status).toBe(403);
    expect((await farmer.post("/api/pesticides").send({})).status).toBe(403);
  });
});

describe("kiểm tra dữ liệu đầu vào", () => {
  const valid = {
    code: "KB-VT-T01-H001",
    name: "Hộ Thử Nghiệm",
    cccd: "260111222333",
    phone: "0901112233",
    villageId: 1,
    plotCount: 2,
    areaHa: 1.5,
  };

  it("trả 400 kèm chi tiết khi sai định dạng", async () => {
    const agent = await loggedIn(USERS.admin);
    const res = await agent.post("/api/households").send({ ...valid, cccd: "123", phone: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(["cccd", "phone"]);
  });

  it("từ chối trường lạ (chống mass assignment)", async () => {
    const agent = await loggedIn(USERS.admin);
    const res = await agent.post("/api/households").send({ ...valid, id: 999, createdAt: "2000-01-01" });
    expect(res.status).toBe(400);
  });

  it("tạo được, trùng khóa trả 409, khóa ngoại sai trả 409", async () => {
    const agent = await loggedIn(USERS.admin);
    const created = await agent.post("/api/households").send(valid);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("pending"); // mặc định của CSDL
    expect(created.body.villageName).toBe("Thôn 1");

    expect((await agent.post("/api/households").send(valid)).status).toBe(409);
    expect((await agent.post("/api/households").send({ ...valid, code: "X-1", cccd: "260111222444", villageId: 9999 })).status).toBe(409);
  });

  it("PATCH một phần không làm mất các trường khác", async () => {
    const agent = await loggedIn(USERS.admin);
    const created = await agent.post("/api/households").send({ ...valid, code: "KB-VT-T01-H002", cccd: "260111222555" });
    const res = await agent.patch(`/api/households/${created.body.id}`).send({ status: "qualified" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("qualified");
    expect(res.body.plotCount).toBe(2);
    expect(res.body.areaHa).toBe(1.5);
  });

  it("id không hợp lệ trả 404, ngày không hợp lệ trả 400", async () => {
    const agent = await loggedIn(USERS.admin);
    expect((await agent.get("/api/households/abc")).status).toBe(404);
    expect((await agent.get("/api/households/987654")).status).toBe(404);
    const res = await agent.post("/api/minutes").send({ code: "BB-X", heldOn: "2024-13-45", location: "a", officer: "b", result: "pass" });
    expect(res.status).toBe(400);
  });

  it("phân trang và tìm kiếm", async () => {
    const agent = await loggedIn(USERS.admin);
    const page = await agent.get("/api/households?pageSize=3&page=2");
    expect(page.body.data).toHaveLength(3);
    expect(page.body.pageSize).toBe(3);
    const search = await agent.get("/api/households?q=Nguy%E1%BB%85n%20V%C4%83n%20An");
    expect(search.body.data.length).toBeGreaterThanOrEqual(1);
    expect((await agent.get("/api/households?pageSize=100000")).status).toBe(400);
  });

  it("tìm kiếm không bị SQL injection", async () => {
    const agent = await loggedIn(USERS.admin);
    const res = await agent.get("/api/households?q=" + encodeURIComponent("'; DROP TABLE households; --"));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect((await agent.get("/api/households")).body.total).toBeGreaterThan(0);
  });
});

describe("tài khoản và audit log", () => {
  it("không trả băm mật khẩu và không tự khóa/xóa chính mình", async () => {
    const agent = await loggedIn(USERS.admin);
    const list = await agent.get("/api/accounts");
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toMatch(/password|hash|\$2[aby]\$/i);

    const me = list.body.data.find((a: { username: string }) => a.username === USERS.admin);
    expect((await agent.patch(`/api/accounts/${me.id}`).send({ status: "locked" })).status).toBe(403);
    expect((await agent.delete(`/api/accounts/${me.id}`)).status).toBe(403);
  });

  it("khóa tài khoản có hiệu lực ngay với phiên đang đăng nhập", async () => {
    const admin = await loggedIn(USERS.admin);
    const victim = await admin
      .post("/api/accounts")
      .send({ fullName: "Kiểm Tra Khóa", username: "0999000222", password: "Victim1234", role: "inspector" });
    const session = await loggedIn("0999000222", "Victim1234");
    expect((await session.get("/api/auth/me")).status).toBe(200);

    expect((await admin.patch(`/api/accounts/${victim.body.id}`).send({ status: "locked" })).status).toBe(200);
    expect((await session.get("/api/auth/me")).status).toBe(401);
    expect((await session.post("/api/auth/refresh")).status).toBe(401);
  });

  it("ghi audit log cho thao tác thay đổi dữ liệu", async () => {
    const agent = await loggedIn(USERS.admin);
    await agent.post("/api/villages").send({ name: "Thôn Audit" });
    const logs = await agent.get("/api/audit-log?pageSize=20");
    expect(logs.status).toBe(200);
    expect(logs.body.data[0]).toMatchObject({ action: "Tạo mới", userName: "Nguyễn Khoa" });
    expect(logs.body.data[0].object).toMatch(/^Thôn #\d+$/);
  });

  it("audit log chỉ đọc", async () => {
    const agent = await loggedIn(USERS.admin);
    expect((await agent.post("/api/audit-log").send({})).status).toBe(404);
    expect((await agent.delete("/api/audit-log/1")).status).toBe(404);
  });
});

describe("lỗi chung và thửa đất", () => {
  it("đường dẫn không tồn tại trả 404 đúng định dạng", async () => {
    const res = await request(app).get("/api/khong-co");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Không tìm thấy đường dẫn.", code: "NOT_FOUND" });
  });

  it("JSON hỏng trả 400, body quá lớn trả 413", async () => {
    const agent = await loggedIn(USERS.admin);
    const broken = await agent.post("/api/villages").set("Content-Type", "application/json").send("{oops");
    expect(broken.status).toBe(400);
    expect(broken.body.code).toBe("BAD_REQUEST");

    const huge = await agent.post("/api/villages").send({ name: "x".repeat(1_200_000) });
    expect(huge.status).toBe(413);
    expect(huge.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("đăng nhập thiếu trường trả 400 kèm chi tiết", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(["username", "password"]));
  });

  it("thửa đất: phân quyền và kiểm tra hình học trước khi chạm CSDL", async () => {
    const inspector = await loggedIn(USERS.inspector);
    expect((await inspector.post("/api/plots").send({ code: "T1", geometry: {} })).status).toBe(403);

    const admin = await loggedIn(USERS.admin);
    const badType = await admin.post("/api/plots").send({ code: "T1", geometry: "không phải hình học" });
    expect(badType.status).toBe(400);
    const emptyRing = await admin.post("/api/plots").send({ code: "T1", geometry: { type: "Polygon", coordinates: [] } });
    expect(emptyRing.status).toBe(400);
    const notCollection = await admin.post("/api/plots/import").send({ collection: { type: "Feature" } });
    expect(notCollection.status).toBe(400);
  });
});

describe("cổng hộ dân (/api/portal)", () => {
  it("chỉ tài khoản nông dân được dùng; cán bộ và khách bị từ chối", async () => {
    expect((await request(app).get("/api/portal/overview")).status).toBe(401);
    const admin = await loggedIn(USERS.admin);
    expect((await admin.get("/api/portal/overview")).status).toBe(403);
    const htx = await loggedIn(USERS.htx);
    expect((await htx.post("/api/portal/journal").send({ plotCode: "TH1-001", activity: "Tưới nước" })).status).toBe(403);
  });

  it("phiên đăng nhập của hộ dân chỉ có quyền portal và danh mục", async () => {
    const { res } = await login(USERS.farmerAn);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: "farmer" });
    expect(res.body.user.householdId).toEqual(expect.any(Number));
    expect(res.body.permissions.portal).toEqual(["read", "create"]);
    expect(res.body.permissions.households).toBeUndefined();
    expect(res.body.permissions.accounts).toBeUndefined();
  });

  it("hộ dân không đọc được dữ liệu quản trị của HTX", async () => {
    const farmer = await loggedIn(USERS.farmerAn);
    for (const path of ["/api/households", "/api/journal", "/api/violations", "/api/accounts", "/api/audit-log"]) {
      expect((await farmer.get(path)).status).toBe(403);
    }
    expect((await farmer.get("/api/pesticides")).status).toBe(200);
  });

  it("tổng quan, nhật ký, vi phạm, thu hoạch, lịch chỉ là của hộ đang đăng nhập", async () => {
    const an = await loggedIn(USERS.farmerAn);
    const overview = await an.get("/api/portal/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.household.name).toBe("Nguyễn Văn An");
    expect(overview.body.household).not.toHaveProperty("cccd");

    const journal = await an.get("/api/portal/journal");
    expect(journal.status).toBe(200);
    expect(journal.body.data.length).toBeGreaterThan(0);

    const binh = await loggedIn(USERS.farmerBinh);
    const binhOverview = await binh.get("/api/portal/overview");
    expect(binhOverview.body.household.name).toBe("Trần Thị Bình");
    const binhJournal = await binh.get("/api/portal/journal");
    const anIds = new Set(journal.body.data.map((row: { id: number }) => row.id));
    expect(binhJournal.body.data.every((row: { id: number }) => !anIds.has(row.id))).toBe(true);

    expect((await an.get("/api/portal/violations")).body.data.length).toBeGreaterThan(0);
    expect((await binh.get("/api/portal/violations")).body.data).toEqual([]);
    expect((await an.get("/api/portal/harvest")).body.data.length).toBeGreaterThan(0);
    expect((await an.get("/api/portal/schedule")).status).toBe(200);
    expect((await an.get("/api/portal/lab-tests")).status).toBe(200);
    expect((await an.get("/api/portal/plots")).status).toBe(200);
  });

  it("tự ghi nhật ký: hộ lấy từ tài khoản, không nhận householdId từ client, không ghi ngày tương lai", async () => {
    const an = await loggedIn(USERS.farmerAn);
    const created = await an.post("/api/portal/journal").send({ plotCode: "TH1-001", activity: "Tưới nước", detail: "800 lít/cây" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ activity: "Tưới nước", recorder: "Chủ hộ" });

    const spoof = await an.post("/api/portal/journal").send({ plotCode: "TH1-001", activity: "Bón phân", householdId: 2 });
    expect(spoof.status).toBe(400);

    const future = await an.post("/api/portal/journal").send({ plotCode: "TH1-001", activity: "Bón phân", entryOn: "2999-01-01" });
    expect(future.status).toBe(400);

    const mine = await an.get("/api/portal/journal");
    expect(mine.body.data.some((row: { id: number }) => row.id === created.body.id)).toBe(true);
    const binh = await loggedIn(USERS.farmerBinh);
    const theirs = await binh.get("/api/portal/journal");
    expect(theirs.body.data.some((row: { id: number }) => row.id === created.body.id)).toBe(false);
  });

  it("ghi phun thuốc: thuốc bị cấm bị đánh dấu không đạt, thuốc lạ bị từ chối", async () => {
    const an = await loggedIn(USERS.farmerAn);
    const pesticides = await an.get("/api/pesticides?pageSize=100");
    const banned = pesticides.body.data.find((p: { status: string }) => p.status === "banned");
    const allowed = pesticides.body.data.find((p: { status: string }) => p.status === "allowed");

    const ok = await an.post("/api/portal/spray").send({ pesticideId: allowed.id, dose: "0.5 lít/ha", areaHa: 0.8 });
    expect(ok.status).toBe(201);
    expect(ok.body.mrlStatus).toBe("pass");

    const bad = await an.post("/api/portal/spray").send({ pesticideId: banned.id, dose: "1 lít/ha", areaHa: 0.5 });
    expect(bad.status).toBe(201);
    expect(bad.body.mrlStatus).toBe("exceeded");

    expect((await an.post("/api/portal/spray").send({ pesticideId: 999999, dose: "1", areaHa: 1 })).status).toBe(400);
    expect((await an.post("/api/portal/spray").send({ pesticideId: allowed.id, dose: "1", areaHa: -2 })).status).toBe(400);
  });

  it("gửi hồ sơ xin duyệt hiện ở danh sách duyệt của cán bộ HTX", async () => {
    const an = await loggedIn(USERS.farmerAn);
    const created = await an.post("/api/portal/approvals").send({ requestType: "Đăng ký vùng trồng mới", docsCount: 2 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "pending", requestType: "Đăng ký vùng trồng mới" });

    const htx = await loggedIn(USERS.htx);
    const list = await htx.get("/api/approvals?pageSize=100");
    expect(list.body.data.some((row: { code: string }) => row.code === created.body.code)).toBe(true);
  });
});

describe("dữ liệu công khai (/api/public)", () => {
  it("không cần đăng nhập và chỉ trả số liệu tổng hợp, không lộ dữ liệu hộ", async () => {
    const overview = await request(app).get("/api/public/overview");
    expect(overview.status).toBe(200);
    expect(overview.body).toEqual({
      households: expect.any(Number),
      qualifiedHouseholds: expect.any(Number),
      villages: expect.any(Number),
      plots: expect.any(Number),
      areaHa: expect.any(Number),
    });

    const catalog = await request(app).get("/api/public/catalog");
    expect(catalog.status).toBe(200);
    expect(catalog.body.pesticides.length).toBeGreaterThan(0);
    expect(catalog.body.varieties.length).toBeGreaterThan(0);
    const text = JSON.stringify(catalog.body) + JSON.stringify(overview.body);
    expect(text).not.toMatch(/cccd|phone|password|username|Nguyễn Văn An/i);
  });

  it("các route công khai chỉ cho phép đọc", async () => {
    expect((await request(app).post("/api/public/overview").send({})).status).toBe(404);
  });
});

describe("đăng ký tài khoản hộ dân (/api/auth/register)", () => {
  const PHONE_A = "0987000111";
  const PHONE_B = "0987000222";
  const newUser = (phone: string, extra: Record<string, unknown> = {}) => ({
    fullName: "Hộ Đăng Ký Thử",
    phone,
    password: "Matkhau123",
    ...extra,
  });

  it("danh sách thôn công khai chỉ gồm id và tên", async () => {
    const res = await request(app).get("/api/public/villages");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"]);
  });

  it("từ chối dữ liệu sai và không nhận vai trò hay trạng thái từ client", async () => {
    expect((await request(app).post("/api/auth/register").send(newUser("12345"))).status).toBe(400);
    expect((await request(app).post("/api/auth/register").send({ ...newUser(PHONE_A), password: "chiconchu" })).status).toBe(400);
    const forged = await request(app).post("/api/auth/register").send(newUser(PHONE_A, { role: "admin", status: "active" }));
    expect(forged.status).toBe(400);
    expect((await login(PHONE_A, "Matkhau123")).res.status).toBe(401);
  });

  it("đăng ký tạo tài khoản chờ duyệt: chưa đăng nhập được, trùng số điện thoại bị từ chối", async () => {
    const created = await request(app).post("/api/auth/register").send(newUser(PHONE_A));
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ status: "pending" });

    const pending = await login(PHONE_A, "Matkhau123");
    expect(pending.res.status).toBe(403);
    expect(pending.res.body.code).toBe("ACCOUNT_PENDING");
    expect((await login(PHONE_A, "sai-mat-khau-1")).res.status).toBe(401);

    expect((await request(app).post("/api/auth/register").send(newUser(PHONE_A))).status).toBe(409);
    expect((await request(app).post("/api/auth/register").send(newUser(USERS.farmerAn))).status).toBe(409);
  });

  it("chỉ quản trị viên và cán bộ HTX xem được danh sách chờ duyệt", async () => {
    expect((await request(app).get("/api/registrations")).status).toBe(401);
    for (const username of [USERS.farmerAn, USERS.inspector, USERS.villageOfficer]) {
      const agent = await loggedIn(username);
      expect((await agent.get("/api/registrations")).status).toBe(403);
    }
    const htx = await loggedIn(USERS.htx);
    const list = await htx.get("/api/registrations");
    expect(list.status).toBe(200);
    const row = list.body.data.find((item: { phone: string }) => item.phone === PHONE_A);
    expect(row).toMatchObject({ fullName: "Hộ Đăng Ký Thử", phone: PHONE_A });
    expect(JSON.stringify(list.body)).not.toMatch(/password|hash/i);
  });

  it("duyệt: gắn vào hộ rồi mới đăng nhập được; mỗi hộ chỉ một tài khoản", async () => {
    const htx = await loggedIn(USERS.htx);
    await request(app).post("/api/auth/register").send(newUser(PHONE_B));
    const pending = (await htx.get("/api/registrations")).body.data as { id: number; phone: string }[];
    const a = pending.find((item) => item.phone === PHONE_A)!;
    const b = pending.find((item) => item.phone === PHONE_B)!;

    const available = (await htx.get("/api/registrations/households")).body.data as { id: number }[];
    expect(available.length).toBeGreaterThan(0);
    const householdId = available[0].id;

    expect((await htx.post(`/api/registrations/${a.id}/approve`).send({})).status).toBe(400);
    expect((await htx.post(`/api/registrations/${a.id}/approve`).send({ householdId: 999999 })).status).toBe(404);

    expect((await htx.post(`/api/registrations/${a.id}/approve`).send({ householdId })).status).toBe(200);
    expect((await htx.post(`/api/registrations/${a.id}/approve`).send({ householdId })).status).toBe(404); // đã duyệt
    expect((await htx.post(`/api/registrations/${b.id}/approve`).send({ householdId })).status).toBe(409); // hộ đã có tài khoản

    const farmer = await loggedIn(PHONE_A, "Matkhau123");
    expect((await farmer.get("/api/portal/overview")).status).toBe(200);
    expect((await farmer.get("/api/registrations")).status).toBe(403);

    const stillAvailable = (await htx.get("/api/registrations/households")).body.data as { id: number }[];
    expect(stillAvailable.some((item) => item.id === householdId)).toBe(false);
  });

  it("từ chối đăng ký xóa tài khoản chờ duyệt", async () => {
    const htx = await loggedIn(USERS.htx);
    const pending = (await htx.get("/api/registrations")).body.data as { id: number; phone: string }[];
    const b = pending.find((item) => item.phone === PHONE_B)!;
    expect((await htx.post(`/api/registrations/${b.id}/reject`)).status).toBe(200);
    expect((await htx.post(`/api/registrations/${b.id}/reject`)).status).toBe(404);
    expect((await login(PHONE_B, "Matkhau123")).res.status).toBe(401);
  });

  it("không thể duyệt hoặc từ chối tài khoản đang hoạt động qua API đăng ký", async () => {
    const admin = await loggedIn(USERS.admin);
    const accounts = (await admin.get("/api/accounts?pageSize=100")).body.data as { id: number; username: string }[];
    const active = accounts.find((item) => item.username === USERS.farmerBinh)!;
    const htx = await loggedIn(USERS.htx);
    expect((await htx.post(`/api/registrations/${active.id}/reject`)).status).toBe(404);
    expect((await login(USERS.farmerBinh)).res.status).toBe(200);
  });
});
