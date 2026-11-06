import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { JWT_AUDIENCE, JWT_ISSUER } from "../src/auth/tokens.service";
import { loadConfig } from "../src/config/configuration";
import { DatabaseService } from "../src/database/database.service";
import { TEST_PASSWORD } from "./constants";

const USERS = {
  admin: "0901234567",
  htx: "0912345678",
  inspector: "0923456789",
  villageOfficer: "0934567890", // Thôn 1
  farmerAn: "0905123456", // Hộ Nguyễn Văn An (#1)
  farmerBinh: "0912234567", // Hộ Trần Thị Bình (#2)
};

let nest: INestApplication;
let app: Server;
let db: DatabaseService;

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

describe("vá bảo mật đăng nhập và truy xuất công khai", () => {
  it("không cho phép đăng nhập bằng bí danh vai trò hay số điện thoại hộ chưa có tài khoản", async () => {
    for (const alias of ["admin", "htx", "inspector", "village", "farmer", "0978345678"]) {
      const { res } = await login(alias);
      expect(res.status).toBe(401);
    }
  });

  it("/api/public/trace hoạt động khi không có bảng plots và che thông tin nhạy cảm", async () => {
    const stampTrace = await request(app).get("/api/public/trace/KB-H001-000001");
    expect(stampTrace.status).toBe(200);
    expect(stampTrace.body.isFarmerStamp).toBe(true);
    expect(stampTrace.body.farmerStamp.householdCccd).toBe("********6789");
    expect(stampTrace.body.farmerStamp).not.toHaveProperty("householdPhone");
    expect(stampTrace.body.farmerStamp).not.toHaveProperty("id");
    expect(stampTrace.body.farmerStamp).not.toHaveProperty("allocationId");
    expect(stampTrace.body.farmerStamp).not.toHaveProperty("householdId");
    expect(stampTrace.body.lot).not.toHaveProperty("id");

    const itemTrace = await request(app).get("/api/public/trace/LH-2024-038-Q0001");
    expect(itemTrace.status).toBe(200);
    expect(itemTrace.body.item.serialCode).toBe("LH-2024-038-Q0001");
    expect(itemTrace.body.item).not.toHaveProperty("id");
    expect(itemTrace.body.item).not.toHaveProperty("lotId");
    expect(itemTrace.body.lot).not.toHaveProperty("id");

    const missing = await request(app).get("/api/public/trace/MA-KHONG-TON-TAI");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("NOT_FOUND");
  });
});

describe("nhập danh sách hộ (/api/households/import)", () => {
  it("tạo mới, cập nhật theo code và báo lỗi từng dòng", async () => {
    const htx = await loggedIn(USERS.htx);
    const res = await htx.post("/api/households/import").send({
      rows: [
        {
          code: "KB-IMP-001",
          name: "Hộ Nhập Lô 1",
          cccd: "260999888771",
          phone: "0908887771",
          villageId: 1,
          plotCount: 2,
          areaHa: 1.8,
          status: "qualified",
        },
        {
          code: "KB-VT-001-H001", // Đã có -> cập nhật
          name: "Nguyễn Văn An",
          cccd: "260123456789",
          phone: "0905123456",
          villageId: 1,
          plotCount: 4,
          areaHa: 2.5,
          status: "qualified",
        },
        {
          code: "KB-IMP-BAD",
          name: "Hộ Lỗi CCCD",
          cccd: "123",
          phone: "khong-hop-le",
          villageId: 1,
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.updated).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(3);
  });
});

describe("duyệt hồ sơ, đóng vi phạm, lịch, kiểm nghiệm, phun thuốc, tập huấn", () => {
  it("duyệt và từ chối hồ sơ qua POST /:id/approve và /:id/reject kèm thông báo cho hộ", async () => {
    const htx = await loggedIn(USERS.htx);
    const farmer = await loggedIn(USERS.farmerAn);

    const created = await htx.post("/api/approvals").send({
      code: "HS-ADMIN-001",
      applicantName: "Nguyễn Văn An",
      requestType: "Cấp mới mã thửa",
      submittedOn: "2024-11-01",
      householdId: 1,
      plotCode: "TH1-009",
      note: "Hồ sơ đầy đủ",
    });
    expect(created.status).toBe(201);

    const detail = await htx.get(`/api/approvals/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.attachments)).toBe(true);

    const approved = await htx
      .post(`/api/approvals/${created.body.id}/approve`)
      .send({ note: "Đạt yêu cầu thực địa" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");
    expect(approved.body.reviewNote).toBe("Đạt yêu cầu thực địa");

    // Duyệt lại hồ sơ đã duyệt phải trả 409 INVALID_STATE
    const again = await htx.post(`/api/approvals/${created.body.id}/approve`).send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVALID_STATE");

    const notifs = await farmer.get("/api/notifications");
    expect(notifs.status).toBe(200);
    expect(notifs.body.data.some((n: { kind: string; title: string }) => n.kind === "approval" && n.title.includes("HS-ADMIN-001"))).toBe(true);
  });

  it("tạo vi phạm gắn householdId tự điền nhãn hộ và đóng vi phạm qua POST /:id/resolve", async () => {
    const inspector = await loggedIn(USERS.inspector);
    const farmer = await loggedIn(USERS.farmerAn);

    const created = await inspector.post("/api/violations").send({
      severity: "warning",
      title: "Chưa tỉa cành tạo tán sau thu hoạch",
      householdId: 1,
      detectedOn: "2024-11-02",
      plotCode: "TH1-001",
      description: "Cần tỉa cành trong 7 ngày.",
    });
    expect(created.status).toBe(201);
    expect(created.body.householdLabel).toContain("Nguyễn Văn An");

    const resolved = await inspector
      .post(`/api/violations/${created.body.id}/resolve`)
      .send({ resolutionNotes: "Đã kiểm tra thực địa, hộ đã tỉa cành đạt chuẩn." });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe("resolved");
    expect(resolved.body.resolutionNotes).toContain("đạt chuẩn");
    expect(resolved.body.resolvedOn).toBeTruthy();

    expect(
      (await inspector.post(`/api/violations/${created.body.id}/resolve`).send({ resolutionNotes: "Lần 2" })).status,
    ).toBe(409);

    const notifs = await farmer.get("/api/notifications");
    expect(notifs.body.data.some((n: { kind: string }) => n.kind === "violation")).toBe(true);
  });

  it("tạo lịch kiểm tra, kết quả kiểm nghiệm và phun thuốc có plotCode", async () => {
    const inspector = await loggedIn(USERS.inspector);
    const htx = await loggedIn(USERS.htx);
    const farmer = await loggedIn(USERS.farmerAn);

    const sched = await inspector.post("/api/schedule").send({
      scheduledOn: "2025-05-10",
      title: "Kiểm tra định kỳ trước thu hoạch",
      officer: "KS. Lê Văn Kiểm",
      plotCount: 10,
      kind: "periodic",
    });
    expect(sched.status).toBe(201);

    const testRes = await inspector.post("/api/testing").send({
      code: "MK-ADMIN-901",
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: "2024-11-01",
      cdMgKg: 0.01,
      yellowOPositive: false,
      residueMgKg: 0.02,
      result: "pass",
      lab: "Quatest 3",
    });
    expect(testRes.status).toBe(201);

    const sprayRes = await htx.post("/api/spray").send({
      sprayedOn: "2024-11-01",
      householdId: 1,
      pesticideId: 1,
      plotCode: "TH1-001",
      dose: "0.4 lít/ha",
      areaHa: 1.0,
    });
    expect(sprayRes.status).toBe(201);
    expect(sprayRes.body.plotCode).toBe("TH1-001");
    expect(sprayRes.body.mrlStatus).toBe("pass");

    const notifs = await farmer.get("/api/notifications");
    expect(notifs.body.data.some((n: { kind: string }) => n.kind === "schedule")).toBe(true);
    expect(notifs.body.data.some((n: { kind: string }) => n.kind === "lab")).toBe(true);
  });

  it("quản lý lớp tập huấn và điểm danh học viên", async () => {
    const htx = await loggedIn(USERS.htx);
    const course = await htx.post("/api/training").send({
      title: "Tập huấn quản trị vùng trồng số",
      heldOn: "2025-06-15",
      startsAt: "08:00",
      endsAt: "11:30",
      location: "Hội trường HTX",
      trainer: "KS. Nguyễn Minh Tuấn",
      description: "Hướng dẫn chi tiết ghi chép nhật ký điện tử",
      enrolled: 1,
      capacity: 30,
    });
    expect(course.status).toBe(201);
    expect(course.body.startsAt).toBe("08:00");
    expect(course.body.endsAt).toBe("11:30");

    const ins = await db.query<{ id: number }>(
      `INSERT INTO training_registrations (course_id, household_id, status)
       VALUES ($1, 1, 'registered') RETURNING id`,
      [course.body.id],
    );
    const regId = ins.rows[0].id;

    const regs = await htx.get(`/api/training/${course.body.id}/registrations`);
    expect(regs.status).toBe(200);
    expect(regs.body.data).toHaveLength(1);
    expect(regs.body.data[0].householdName).toBe("Nguyễn Văn An");

    const attended = await htx
      .patch(`/api/training/${course.body.id}/registrations/${regId}`)
      .send({ status: "attended" });
    expect(attended.status).toBe(200);
    expect(attended.body.status).toBe("attended");

    const cancelled = await htx
      .patch(`/api/training/${course.body.id}/registrations/${regId}`)
      .send({ status: "cancelled" });
    expect(cancelled.status).toBe(200);
    const afterCancel = await htx.get(`/api/training/${course.body.id}`);
    expect(afterCancel.body.enrolled).toBe(0);
  });
});

describe("danh mục phân bón và giống mở rộng", () => {
  it("CRUD phân bón và giống có trường nông học JSONB", async () => {
    const htx = await loggedIn(USERS.htx);

    const fertList = await htx.get("/api/fertilizers?category=organic");
    expect(fertList.status).toBe(200);
    expect(fertList.body.total).toBeGreaterThan(0);

    const createdFert = await htx.post("/api/fertilizers").send({
      name: "Phân Hữu Cơ Vi Sinh Krông Búk Gold",
      category: "organic",
      formula: "OM 65% + Humic 10%",
      manufacturer: "HTX Krông Búk Bio",
      dosage: "5 kg/gốc",
      applicationMethod: "Bón quanh tán",
      timing: "Sau thu hoạch",
      status: "encouraged",
      imageUrl: "/fertilizers/organic.png",
      description: "Chuyên dùng cải tạo đất bazan",
    });
    expect(createdFert.status).toBe(201);
    expect(createdFert.body.category).toBe("organic");

    const createdVar = await htx.post("/api/varieties").send({
      name: "Sầu riêng Chuồng Bò Tuyển Chọn",
      origin: "Đồng bằng sông Cửu Long",
      weightRange: "1.8 – 2.8 kg/trái",
      harvestYears: "95 – 100 ngày",
      category: "native",
      status: "allowed",
      fleshColor: "Vàng kem",
      seedRate: "Hạt lép 70%",
      brix: "33%",
      yieldPerHa: "16 tấn/ha",
      imageUrl: "/varieties/ri6.png",
      morphology: ["Quả tròn bầu", "Gai to đều"],
      farmingTechniques: {
        density: "8m x 8m",
        pollination: "Tự nhiên kết hợp bổ sung",
        thinning: "Giữ 50 quả/cây",
        specialNotes: "Chịu hạn khá",
      },
    });
    expect(createdVar.status).toBe(201);
    expect(createdVar.body.morphology).toEqual(["Quả tròn bầu", "Gai to đều"]);
    expect(createdVar.body.farmingTechniques.density).toBe("8m x 8m");

    const pubCat = await request(app).get("/api/public/catalog");
    expect(pubCat.status).toBe(200);
    expect(pubCat.body.fertilizers.length).toBeGreaterThan(0);
    expect(pubCat.body.upcomingTraining).toBeDefined();
  });
});

describe("lô thu hoạch, khai báo thu hoạch và cấp phát tem", () => {
  it("phân quyền sinh tem lô hàng, giới hạn count <= 2000 và quản lý đóng góp hộ", async () => {
    const inspector = await loggedIn(USERS.inspector);
    const htx = await loggedIn(USERS.htx);

    expect(
      (await inspector.post("/api/harvest/1/generate-items").send({ count: 2, itemType: "fruit" })).status,
    ).toBe(403);
    expect(
      (await htx.post("/api/harvest/1/generate-items").send({ count: 2500, itemType: "fruit" })).status,
    ).toBe(400);

    const gen = await htx
      .post("/api/harvest/1/generate-items")
      .send({ count: 2, itemType: "fruit", grade: "A", weightKg: 3.6 });
    expect(gen.status).toBe(201);
    expect(gen.body.data).toHaveLength(2);

    const upserted = await htx
      .post("/api/harvest/1/contributions")
      .send({ householdId: 3, weightKg: 620.5 });
    expect(upserted.status).toBe(201);
    expect(upserted.body.weightKg).toBe(620.5);

    const contribs = await htx.get("/api/harvest/1/contributions");
    expect(contribs.status).toBe(200);
    const lotAfterAdd = await htx.get("/api/harvest/1");
    expect(lotAfterAdd.body.householdCount).toBe(contribs.body.data.length);

    const del = await htx.delete(`/api/harvest/1/contributions/${upserted.body.id}`);
    expect(del.status).toBe(200);
    const lotAfterDel = await htx.get("/api/harvest/1");
    expect(lotAfterDel.body.householdCount).toBe(contribs.body.data.length - 1);
  });

  it("xác nhận và từ chối khai báo thu hoạch của hộ", async () => {
    const htx = await loggedIn(USERS.htx);
    const list = await htx.get("/api/harvest-declarations?status=submitted");
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);

    const firstId = list.body.data[0].id;
    const secondId = list.body.data[1].id;

    const confirmed = await htx
      .post(`/api/harvest-declarations/${firstId}/confirm`)
      .send({ note: "Đã đối chiếu sổ cân tại PHC" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("confirmed");

    const rejected = await htx
      .post(`/api/harvest-declarations/${secondId}/reject`)
      .send({ note: "Cần bổ sung phiếu cân chi tiết" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("rejected");
  });

  it("cấp phát dải tem mới nối tiếp số thứ tự, xem danh sách tem và thu hồi", async () => {
    const htx = await loggedIn(USERS.htx);

    const alloc = await htx.post("/api/stamp-allocations").send({
      householdId: 1,
      plotCode: "TH1-001",
      season: "Vụ 2025",
      quantity: 5,
      notes: "Cấp bổ sung đợt 2",
    });
    expect(alloc.status).toBe(201);
    expect(alloc.body.fromSerial).toBe("KB-H001-000501");
    expect(alloc.body.toSerial).toBe("KB-H001-000505");
    expect(alloc.body.quantityAllocated).toBe(5);

    const stamps = await htx.get(`/api/stamp-allocations/${alloc.body.id}/stamps`);
    expect(stamps.status).toBe(200);
    expect(stamps.body.data).toHaveLength(5);

    const revoked = await htx.post(`/api/stamp-allocations/${alloc.body.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe("revoked");

    const stampsAfter = await htx.get(`/api/stamp-allocations/${alloc.body.id}/stamps`);
    expect(stampsAfter.body.data.every((s: { status: string }) => s.status === "revoked")).toBe(true);
  });
});

describe("bản tin, bảng điều khiển và xuất báo cáo CSV", () => {
  it("CRUD bản tin, tự sinh slug tiếng Việt, xuất bản và gỡ xuất bản", async () => {
    const pubList = await request(app).get("/api/public/news");
    expect(pubList.status).toBe(200);
    expect(pubList.body.data.length).toBeGreaterThanOrEqual(4);

    const firstSlug = pubList.body.data[0].slug;
    expect((await request(app).get(`/api/public/news/${firstSlug}`)).status).toBe(200);

    const htx = await loggedIn(USERS.htx);
    const created = await htx.post("/api/news").send({
      category: "farming",
      title: "Hướng dẫn chăm sóc sầu riêng sau thu hoạch Đắk Lắk",
      excerpt: "Các bước tỉa cành, rửa vườn và bón phân hữu cơ phục hồi cây.",
      author: "Ban Kỹ thuật HTX",
      readTime: "4 phút đọc",
      content: {
        lead: "Sau thu hoạch là thời điểm vàng để phục hồi bộ rễ và tán lá.",
        sections: [
          {
            heading: "Bước 1: Tỉa cành và vệ sinh vườn",
            paragraphs: ["Cắt bỏ cành khô, cành sâu bệnh và cuống quả còn sót lại."],
            bulletPoints: ["Quét vôi gốc cây", "Khử khuẩn vết cắt"],
          },
        ],
        takeaway: "Chăm sóc đúng quy trình giúp cây ra hoa đồng loạt vụ tới.",
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe("huong-dan-cham-soc-sau-rieng-sau-thu-hoach-dak-lak");
    expect(created.body.status).toBe("draft");

    // Bản nháp chưa hiển thị công khai
    expect((await request(app).get(`/api/public/news/${created.body.slug}`)).status).toBe(404);

    const published = await htx.post(`/api/news/${created.body.id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe("published");
    expect((await request(app).get(`/api/public/news/${created.body.slug}`)).status).toBe(200);

    const unpublished = await htx.post(`/api/news/${created.body.id}/unpublish`);
    expect(unpublished.status).toBe(200);
    expect(unpublished.body.status).toBe("draft");
    expect((await request(app).get(`/api/public/news/${created.body.slug}`)).status).toBe(404);
  });

  it("GET /api/dashboard/summary trả số liệu tổng hợp và giới hạn theo thôn cho cán bộ thôn", async () => {
    const admin = await loggedIn(USERS.admin);
    const full = await admin.get("/api/dashboard/summary");
    expect(full.status).toBe(200);
    expect(full.body.counts.households).toBeGreaterThan(2);
    expect(full.body.villages.length).toBeGreaterThan(1);
    expect(full.body.journalTrend).toHaveLength(6);

    const villageOfficer = await loggedIn(USERS.villageOfficer);
    const scoped = await villageOfficer.get("/api/dashboard/summary");
    expect(scoped.status).toBe(200);
    expect(scoped.body.villages).toHaveLength(1);
    expect(scoped.body.villages[0].name).toBe("Thôn 1");
    expect(scoped.body.counts.households).toBeLessThan(full.body.counts.households);
  });

  it("GET /api/reports/:type xuất CSV UTF-8 có BOM cho cả 7 loại báo cáo", async () => {
    const htx = await loggedIn(USERS.htx);
    const types = [
      "households",
      "journal",
      "spray",
      "lab-tests",
      "violations",
      "harvest",
      "training-registrations",
    ];
    for (const type of types) {
      const res = await htx.get(`/api/reports/${type}?from=2024-01-01&to=2026-12-31`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.headers["content-disposition"]).toContain(`filename="${type}.csv"`);
      expect(res.text.startsWith("\uFEFF")).toBe(true);
      expect(res.text.split("\r\n").length).toBeGreaterThanOrEqual(2);
    }

    expect((await htx.get("/api/reports/loai-la")).status).toBe(400);
  });
});

describe("kiểm thử bảo mật theo bộ kỹ năng Anthropic-Cybersecurity-Skills", () => {
  it("JWT Security: từ chối alg=none, sai secret, sai issuer/audience và token hết hạn", async () => {
    const secret = process.env.JWT_ACCESS_SECRET!;
    const jwt = new JwtService({ secret });

    // 1. alg: none
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const nonePayload = Buffer.from(
      JSON.stringify({ sub: "1", iss: JWT_ISSUER, aud: JWT_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 900 }),
    ).toString("base64url");
    const noneToken = `${noneHeader}.${nonePayload}.`;
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", `htx_access=${noneToken}`)).status,
    ).toBe(401);

    // 2. Sai secret
    const wrongSecretJwt = new JwtService({ secret: "wrong-secret-wrong-secret-wrong-secret-1234" });
    const badSigToken = await wrongSecretJwt.signAsync(
      {},
      { subject: "1", algorithm: "HS256", issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: 900 },
    );
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", `htx_access=${badSigToken}`)).status,
    ).toBe(401);

    // 3. Sai issuer hoặc thiếu audience
    const wrongIssToken = await jwt.signAsync(
      {},
      { subject: "1", algorithm: "HS256", issuer: "other-service", audience: JWT_AUDIENCE, expiresIn: 900 },
    );
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", `htx_access=${wrongIssToken}`)).status,
    ).toBe(401);

    const wrongAudToken = await jwt.signAsync(
      {},
      { subject: "1", algorithm: "HS256", issuer: JWT_ISSUER, audience: "other-client", expiresIn: 900 },
    );
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", `htx_access=${wrongAudToken}`)).status,
    ).toBe(401);

    // 4. Token đã hết hạn
    const expiredToken = await jwt.signAsync(
      {},
      { subject: "1", algorithm: "HS256", issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: -60 },
    );
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", `htx_access=${expiredToken}`)).status,
    ).toBe(401);
  });

  it("CORS & CSRF: không phản chiếu Origin lạ/null, chặn Sec-Fetch-Site: cross-site và cấm cấu hình CORS_ORIGIN=*", async () => {
    const evilOrigin = await request(app).get("/api/public/overview").set("Origin", "https://evil.example.com");
    expect(evilOrigin.headers["access-control-allow-origin"]).toBeUndefined();

    const nullOrigin = await request(app).get("/api/public/overview").set("Origin", "null");
    expect(nullOrigin.headers["access-control-allow-origin"]).toBeUndefined();

    const trustedOrigin = await request(app).get("/api/public/overview").set("Origin", "http://localhost:3000");
    expect(trustedOrigin.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(trustedOrigin.headers["access-control-allow-credentials"]).toBe("true");

    const admin = await loggedIn(USERS.admin);
    const crossSite = await admin
      .post("/api/villages")
      .set("Origin", "http://localhost:3000")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ name: "Thôn CrossSite" });
    expect(crossSite.status).toBe(403);

    expect(() =>
      loadConfig({
        ...process.env,
        CORS_ORIGIN: "*",
      }),
    ).toThrow(/CORS_ORIGIN/);

    expect(() =>
      loadConfig({
        ...process.env,
        CORS_ORIGIN: "null",
      }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it("BOPLA & Logic nghiệp vụ: không cho giả mạo mrlStatus='pass' khi phun thuốc cấm", async () => {
    const htx = await loggedIn(USERS.htx);
    const pesticides = await htx.get("/api/pesticides?pageSize=100");
    const banned = pesticides.body.data.find((p: { status: string }) => p.status === "banned");
    expect(banned).toBeDefined();

    const created = await htx.post("/api/spray").send({
      sprayedOn: "2024-11-05",
      householdId: 1,
      pesticideId: banned.id,
      plotCode: "TH1-001",
      dose: "0.5 lít/ha",
      areaHa: 0.5,
      mrlStatus: "pass",
      isolationDays: 0,
    });
    expect(created.status).toBe(201);
    expect(created.body.mrlStatus).toBe("exceeded");
  });

  it("BOLA: Cán bộ Thôn 1 chỉ xem/điểm danh được học viên thuộc Thôn 1 trong lớp tập huấn", async () => {
    const htx = await loggedIn(USERS.htx);
    const villageOfficer = await loggedIn(USERS.villageOfficer);

    const course = await htx.post("/api/training").send({
      title: "Lớp kiểm tra phân quyền thôn",
      heldOn: "2025-07-01",
      location: "Hội trường",
      trainer: "KS. Kiểm Tra",
      capacity: 30,
    });
    expect(course.status).toBe(201);

    // Gắn 1 hộ Thôn 1 (id=1) và 1 hộ Thôn 2 (id=2)
    await db.query(
      `INSERT INTO training_registrations (course_id, household_id, status)
       VALUES ($1, 1, 'registered'), ($1, 2, 'registered')`,
      [course.body.id],
    );

    const scopedRegs = await villageOfficer.get(`/api/training/${course.body.id}/registrations`);
    expect(scopedRegs.status).toBe(200);
    expect(scopedRegs.body.data).toHaveLength(1);
    expect(scopedRegs.body.data[0].householdId).toBe(1);
  });

  it("Đổi mật khẩu: khóa tài khoản và thu hồi phiên sau 5 lần nhập sai mật khẩu hiện tại", async () => {
    const admin = await loggedIn(USERS.admin);
    const temp = await admin.post("/api/accounts").send({
      fullName: "Tài khoản Test Đổi MK",
      username: "0999888777",
      password: "Password123",
      role: "inspector",
    });
    expect(temp.status).toBe(201);

    const userAgent = await loggedIn("0999888777", "Password123");
    for (let i = 0; i < 5; i += 1) {
      const res = await userAgent.post("/api/auth/change-password").send({
        currentPassword: "SaiMatKhauHienTai999",
        newPassword: "NewPassword123",
      });
      expect(res.status).toBe(400);
    }

    // Sau 5 lần sai, phiên hiện tại bị chặn ngay lập tức (401 do locked_until) và đăng nhập lại bị 429 ACCOUNT_LOCKED
    expect((await userAgent.get("/api/auth/me")).status).toBe(401);
    const relogin = await login("0999888777", "Password123");
    expect(relogin.res.status).toBe(429);
    expect(relogin.res.body.code).toBe("ACCOUNT_LOCKED");
  });

  it("Chống Race Condition brute-force: gửi song song 6 request sai mật khẩu vẫn khóa tài khoản nguyên tử", async () => {
    const admin = await loggedIn(USERS.admin);
    const temp = await admin.post("/api/accounts").send({
      fullName: "Tài khoản Test Race Lockout",
      username: "0999888778",
      password: "Password123",
      role: "inspector",
    });
    expect(temp.status).toBe(201);

    await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app)
          .post("/api/auth/login")
          .send({ username: "0999888778", password: "WrongPassword999" }),
      ),
    );

    const after = await login("0999888778", "Password123");
    expect(after.res.status).toBe(429);
    expect(after.res.body.code).toBe("ACCOUNT_LOCKED");
  });

  it("Phân quyền tải tệp (Uploads RBAC): chặn cán bộ thôn/kiểm tra viên tải tệp công khai (news/catalog) hoặc sai nghiệp vụ", async () => {
    const villageOfficer = await loggedIn(USERS.villageOfficer);
    const inspector = await loggedIn(USERS.inspector);
    const htx = await loggedIn(USERS.htx);
    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    // Cán bộ thôn không được tải ảnh bản tin/danh mục công khai hoặc vi phạm
    expect(
      (await villageOfficer.post("/api/uploads").field("purpose", "news").attach("file", tinyJpeg, "news.jpg")).status,
    ).toBe(403);
    expect(
      (await villageOfficer.post("/api/uploads").field("purpose", "catalog").attach("file", tinyJpeg, "cat.jpg")).status,
    ).toBe(403);
    expect(
      (await villageOfficer.post("/api/uploads").field("purpose", "violation").attach("file", tinyJpeg, "viol.jpg")).status,
    ).toBe(403);

    // Nhưng cán bộ thôn được tải ảnh nhật ký canh tác
    expect(
      (await villageOfficer.post("/api/uploads").field("purpose", "journal").attach("file", tinyJpeg, "journal.jpg")).status,
    ).toBe(201);

    // Kiểm tra viên không được tải ảnh bản tin công khai hoặc nhật ký
    expect(
      (await inspector.post("/api/uploads").field("purpose", "news").attach("file", tinyJpeg, "news.jpg")).status,
    ).toBe(403);
    expect(
      (await inspector.post("/api/uploads").field("purpose", "journal").attach("file", tinyJpeg, "journal.jpg")).status,
    ).toBe(403);

    // Cán bộ HTX được tải ảnh bản tin công khai
    expect((await htx.post("/api/uploads").field("purpose", "news").attach("file", tinyJpeg, "news.jpg")).status).toBe(
      201,
    );
  });

  it("Cấp phát & thu hồi tem: kiểm tra quyền sở hữu thửa đất của hộ và thu hồi nguyên tử", async () => {
    const htx = await loggedIn(USERS.htx);

    // Hộ 1 không sở hữu thửa TH2-001 (thuộc Hộ 2) -> từ chối 400
    const badPlot = await htx.post("/api/stamp-allocations").send({
      householdId: 1,
      plotCode: "TH2-001",
      quantity: 5,
    });
    expect(badPlot.status).toBe(400);

    // Cấp phát hợp lệ cho Hộ 1 với thửa TH1-001
    const okAlloc = await htx.post("/api/stamp-allocations").send({
      householdId: 1,
      plotCode: "TH1-001",
      quantity: 3,
    });
    expect(okAlloc.status).toBe(201);

    // Thu hồi nguyên tử cả đợt cấp phát và các tem con
    const revoked = await htx.post(`/api/stamp-allocations/${okAlloc.body.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe("revoked");

    const stamps = await htx.get(`/api/stamp-allocations/${okAlloc.body.id}/stamps`);
    expect(stamps.status).toBe(200);
    expect(stamps.body.data.every((s: { status: string }) => s.status === "revoked")).toBe(true);
  });

  it("Security Headers Audit: phản hồi API có đầy đủ header chống Clickjacking, MIME-sniffing, CORP và Permissions-Policy", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("Tối ưu Media & Video: nhận diện video MP4 theo magic-bytes, hỗ trợ HTTP Range (206 Partial Content) và ETag (304)", async () => {
    const htx = await loggedIn(USERS.htx);
    // Hộp ftyp chuẩn ISO Base Media (MP4) 32 bytes
    const tinyMp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // size=32, 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // 'isom', minor_version
      0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // compatible_brands
      0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x00,
    ]);

    // Danh mục sản phẩm (catalog) chỉ nhận ảnh, từ chối video (400)
    const badCatalogVideo = await htx
      .post("/api/uploads")
      .field("purpose", "catalog")
      .attach("file", tinyMp4, "clip.mp4");
    expect(badCatalogVideo.status).toBe(400);

    // Nhật ký hiện trường (journal) nhận video MP4 (201)
    const up = await htx.post("/api/uploads").field("purpose", "journal").attach("file", tinyMp4, "field-clip.mp4");
    expect(up.status).toBe(201);
    expect(up.body.mimeType).toBe("video/mp4");

    // Tải toàn bộ: có Content-Length, Accept-Ranges: bytes, ETag
    const full = await htx.get(`/api/uploads/${up.body.id}`);
    expect(full.status).toBe(200);
    expect(full.headers["content-type"]).toBe("video/mp4");
    expect(full.headers["accept-ranges"]).toBe("bytes");
    expect(full.headers["content-length"]).toBe("32");
    const etag = full.headers["etag"];
    expect(etag).toBeDefined();

    // Tải một phần (HTTP Range Request cho tua video): 206 Partial Content
    const partial = await htx.get(`/api/uploads/${up.body.id}`).set("Range", "bytes=0-11");
    expect(partial.status).toBe(206);
    expect(partial.headers["content-range"]).toBe("bytes 0-11/32");
    expect(partial.headers["content-length"]).toBe("12");

    // Kiểm tra bộ nhớ đệm If-None-Match -> 304 Not Modified
    const cached = await htx.get(`/api/uploads/${up.body.id}`).set("If-None-Match", etag);
    expect(cached.status).toBe(304);
  });
});
