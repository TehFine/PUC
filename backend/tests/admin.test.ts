import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { JWT_AUDIENCE, JWT_ISSUER } from "../src/auth/tokens.service";
import { generateTotpCode } from "../src/common/crypto/totp";
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
    expect(stampTrace.body.farmerStamp).not.toHaveProperty("householdCccd");
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

    // Xem trước JSON (không ghi audit) vs Xuất từ modal (audit=1) + Việt hóa nhãn enum
    const sysAdmin = await loggedIn(USERS.admin);
    const previewViolations = await htx.get("/api/reports/violations?format=json&from=2024-01-01&to=2026-12-31");
    expect(previewViolations.status).toBe(200);
    expect(Array.isArray(previewViolations.body.headers)).toBe(true);
    for (const row of previewViolations.body.rows as string[][]) {
      expect(["critical", "warning", "open", "resolved"]).not.toContain(row[3]);
      expect(["critical", "warning", "open", "resolved"]).not.toContain(row[5]);
    }

    const beforeCount = Number(
      (
        await db.query<{ cnt: string }>(
          `SELECT count(*)::text AS cnt FROM audit_logs WHERE action = 'Xuất báo cáo' AND object = 'Báo cáo training-registrations'`,
        )
      ).rows[0].cnt,
    );
    expect((await htx.get("/api/reports/training-registrations?format=json")).status).toBe(200);
    const afterPreviewCount = Number(
      (
        await db.query<{ cnt: string }>(
          `SELECT count(*)::text AS cnt FROM audit_logs WHERE action = 'Xuất báo cáo' AND object = 'Báo cáo training-registrations'`,
        )
      ).rows[0].cnt,
    );
    expect(afterPreviewCount).toBe(beforeCount);

    const auditedJson = await htx.get("/api/reports/training-registrations?format=json&audit=1");
    expect(auditedJson.status).toBe(200);
    for (const row of auditedJson.body.rows as string[][]) {
      expect(["registered", "attended", "absent", "cancelled"]).not.toContain(row[6]);
    }
    const logs = await sysAdmin.get("/api/audit-log?pageSize=10");
    expect(logs.status).toBe(200);
    expect(
      (logs.body.data as Array<{ action: string; object: string }>).some(
        (l) => l.action === "Xuất báo cáo" && l.object === "Báo cáo training-registrations",
      ),
    ).toBe(true);
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

  it("CRIT-01 & CRIT-02: issue-account không tự bịa email @gmail.com và chặn htx_officer ghi đè tài khoản admin", async () => {
    const htx = await loggedIn(USERS.htx);
    const admin = await loggedIn(USERS.admin);

    const hh = await htx.post("/api/households").send({
      code: "KB-SEC-HH01",
      name: "Hộ Kiểm Thử Bảo Mật",
      cccd: "260777666555",
      phone: "0971112233",
      villageId: 1,
      plotCount: 1,
      areaHa: 1.2,
      status: "qualified",
    });
    expect(hh.status).toBe(201);

    // Thử truyền username trùng với quản trị viên -> phải bị chặn 409 CONFLICT
    const hijackAttempt = await htx.post(`/api/households/${hh.body.id}/issue-account`).send({
      username: USERS.admin,
      password: "HijackPassword123",
    });
    expect(hijackAttempt.status).toBe(409);

    // Tài khoản admin vẫn nguyên vẹn vai trò và mật khẩu
    const adminMe = await admin.get("/api/auth/me");
    expect(adminMe.status).toBe(200);
    expect(adminMe.body.user.role).toBe("admin");

    // Cấp tài khoản hợp lệ cho nông hộ -> không tự sinh email giả @gmail.com
    const issued = await htx.post(`/api/households/${hh.body.id}/issue-account`).send({
      username: "0971112233",
      password: "FarmerPassword123",
    });
    expect(issued.status).toBe(200);
    expect(issued.body.email).toBeNull();
    const userInDb = await db.query<{ role: string; email: string | null }>(
      "SELECT role, email FROM users WHERE id = $1",
      [issued.body.accountId],
    );
    expect(userInDb.rows[0].role).toBe("farmer");
    expect(userInDb.rows[0].email).toBeNull();
  });

  it("CRIT-03 & HIGH-01: chặn chiếm quyền cán bộ qua verify-cccd SĐT hộ và tắt Google demo mặc định", async () => {
    const htx = await loggedIn(USERS.htx);

    // Tạo hộ có SĐT trùng với username của inspector
    const hhSamePhone = await htx.post("/api/households").send({
      code: "KB-SEC-HH02",
      name: "Hộ Trùng SĐT Cán Bộ",
      cccd: "260444333222",
      phone: USERS.inspector,
      villageId: 1,
      plotCount: 1,
      areaHa: 1.0,
      status: "qualified",
    });
    expect(hhSamePhone.status).toBe(201);

    // Kẻ tấn công thử đặt lại mật khẩu tài khoản inspector bằng CCCD của hộ vừa tạo -> phải thất bại 400
    const cccdReset = await request(app).post("/api/auth/forgot-password/verify-cccd").send({
      username: USERS.inspector,
      cccd: "260444333222",
      newPassword: "AttackerPassword123",
    });
    expect(cccdReset.status).toBe(400);

    // Google demo mode bị tắt mặc định khi chưa cấu hình GOOGLE_CLIENT_ID
    const gConfig = await request(app).get("/api/auth/google/config");
    expect(gConfig.status).toBe(200);
    expect(gConfig.body.mode).toBe("disabled");

    const gLogin = await request(app).post("/api/auth/google").send({});
    expect(gLogin.status).toBe(401);
  });

  it("HIGH-03: htx_officer không được duyệt đặt lại mật khẩu cho cán bộ và chặn ghi đè yêu cầu pending", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);

    const staffAcc = await admin.post("/api/accounts").send({
      fullName: "Cán bộ Test Reset",
      username: "0965554433",
      password: "OldStaffPassword123",
      role: "inspector",
    });
    expect(staffAcc.status).toBe(201);

    // Gửi yêu cầu đặt lại mật khẩu lần 1
    const req1 = await request(app).post("/api/auth/forgot-password/request").send({
      username: "0965554433",
      fullName: "Cán bộ Test Reset",
      newPassword: "FirstValidPassword123",
      note: "Quên mật khẩu lần 1",
    });
    expect(req1.status).toBe(200);

    // Kẻ khác gửi đè yêu cầu thứ 2 khi yêu cầu 1 chưa hết hạn -> phản hồi đồng nhất nhưng không ghi đè hash
    const req2 = await request(app).post("/api/auth/forgot-password/request").send({
      username: "0965554433",
      fullName: "Cán bộ Test Reset",
      newPassword: "HijackedSecondPassword999",
      note: "Ghi đè trái phép",
    });
    expect(req2.status).toBe(200);

    const reqRow = await db.query<{ id: number }>(
      `SELECT id FROM password_reset_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
      [staffAcc.body.id],
    );
    expect(reqRow.rows).toHaveLength(1);
    const resetId = reqRow.rows[0].id;

    // htx_officer không thấy và không được duyệt yêu cầu của cán bộ (403)
    const htxList = await htx.get("/api/registrations/password-resets?status=pending");
    expect(htxList.status).toBe(200);
    expect((htxList.body.data as Array<{ id: number }>).some((r) => r.id === resetId)).toBe(false);
    expect((await htx.post(`/api/registrations/password-resets/${resetId}/approve`)).status).toBe(403);

    // Admin duyệt -> hệ thống tự cấp mật khẩu tạm thời 1 lần (không áp dụng bất kỳ mật khẩu nào do request không xác thực gửi lên)
    const approveRes = await admin.post(`/api/registrations/password-resets/${resetId}/approve`);
    expect(approveRes.status).toBe(200);
    expect(typeof approveRes.body.temporaryPassword).toBe("string");
    expect(approveRes.body.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect((await login("0965554433", "HijackedSecondPassword999")).res.status).toBe(401);
    expect((await login("0965554433", "FirstValidPassword123")).res.status).toBe(401);
    expect((await login("0965554433", approveRes.body.temporaryPassword)).res.status).toBe(200);
  });

  it("HIGH-05, HIGH-06, MED-04 & MED-08: chống DoS phiên đang hoạt động, thu hồi JWT ngay khi logout, xác thực đổi email và giữ MRL thuốc cấm khi PATCH", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);

    const acc = await admin.post("/api/accounts").send({
      fullName: "Tài khoản Kiểm Thử Phiên",
      username: "0961112299",
      password: "SessionPassword123",
      role: "village_officer",
      villageId: 1,
    });
    expect(acc.status).toBe(201);

    const { agent: activeSession, res: loginRes } = await login("0961112299", "SessionPassword123");
    expect(loginRes.status).toBe(200);
    const setCookies = (loginRes.headers["set-cookie"] as unknown as string[]) ?? [];
    const accessCookie = setCookies.find((c) => c.startsWith("htx_access="))?.split(";")[0] ?? "";
    expect(accessCookie).toContain("htx_access=");

    // HIGH-01 & HIGH-06: Gắn email mới bắt buộc kèm cả mật khẩu hiện tại VÀ chứng thực Google OAuth thật (chặn gán trước email giả/lộ mật khẩu)
    expect(
      (await activeSession.patch("/api/auth/profile").send({ email: "canbo.thuc@htx.vn" })).status,
    ).toBe(400);
    expect(
      (
        await activeSession
          .patch("/api/auth/profile")
          .send({ email: "nongho.12345@gmail.com", currentPassword: "SessionPassword123" })
      ).status,
    ).toBe(400);
    expect(
      (
        await activeSession
          .patch("/api/auth/profile")
          .send({ email: "canbo.thuc@htx.vn", currentPassword: "SessionPassword123" })
      ).status,
    ).toBe(400);
    const okProfile = await activeSession
      .patch("/api/auth/profile")
      .send({ fullName: "Cán bộ Kiểm Thử Phiên Đã Cập Nhật", email: null, currentPassword: "SessionPassword123" });
    expect(okProfile.status).toBe(200);
    expect(okProfile.body.user.fullName).toBe("Cán bộ Kiểm Thử Phiên Đã Cập Nhật");
    expect(okProfile.body.user.email).toBeNull();

    // HIGH-05: Kẻ bên ngoài cố tình nhập sai mật khẩu 5 lần gây khóa đăng nhập mới (429),
    // nhưng KHÔNG được đánh sập phiên làm việc hợp lệ đang mở sẵn của chủ tài khoản
    for (let i = 0; i < 5; i += 1) {
      await request(app).post("/api/auth/login").send({ username: "0961112299", password: "WrongExternalPassword999" });
    }
    expect((await login("0961112299", "SessionPassword123")).res.status).toBe(429);
    expect((await activeSession.get("/api/auth/me")).status).toBe(200);

    // MED-08: Khi người dùng bấm Đăng xuất, JWT access token cũ bị vô hiệu hóa ngay lập tức nhờ token_version
    expect((await activeSession.post("/api/auth/logout")).status).toBe(200);
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", accessCookie)).status,
    ).toBe(401);

    // MED-04: PATCH bản ghi phun thuốc cấm mà bỏ trống pesticideId không được lách mrlStatus thành 'pass'
    const pesticides = await htx.get("/api/pesticides?pageSize=100");
    const banned = pesticides.body.data.find((p: { status: string }) => p.status === "banned");
    const sprayCreated = await htx.post("/api/spray").send({
      sprayedOn: "2024-11-08",
      householdId: 1,
      pesticideId: banned.id,
      plotCode: "TH1-001",
      dose: "0.4 lít/ha",
      areaHa: 0.5,
    });
    expect(sprayCreated.status).toBe(201);
    expect(sprayCreated.body.mrlStatus).toBe("exceeded");

    const sprayPatched = await htx
      .patch(`/api/spray/${sprayCreated.body.id}`)
      .send({ mrlStatus: "pass", dose: "0.3 lít/ha" });
    expect(sprayPatched.status).toBe(200);
    expect(sprayPatched.body.mrlStatus).toBe("exceeded");
    await admin.delete(`/api/spray/${sprayCreated.body.id}`);
  });

  it("Truy xuất QR 3 cấp độ: bảo mật dữ liệu cá nhân công khai, phân quyền Doanh nghiệp - Cơ quan quản lý và ghi nhật ký kiểm toán", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);
    const inspector = await loggedIn(USERS.inspector);
    const farmerAn = await loggedIn(USERS.farmerAn);

    // 1. Cấp 1 (Công khai): không lộ buyer, hợp đồng, tọa độ/thửa, nhật ký thuốc, vi phạm hay tên hộ chưa đồng ý; chặn leo thang qua ?view=authority
    const pubRes = await request(app).get("/api/public/trace/LH-2024-038?view=authority");
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.accessControl.viewerTier).toBe("public");
    expect(pubRes.body.publicData.timeline).toHaveLength(5);
    expect(pubRes.body.publicData.growingZone.coarseMap.radiusMeters).toBe(2500);
    expect(pubRes.body.publicData.producer.consentedHouseholds).toEqual([]);
    expect(pubRes.body.lot).not.toHaveProperty("buyer");
    expect(pubRes.body).not.toHaveProperty("enterpriseData");
    expect(pubRes.body).not.toHaveProperty("authorityData");
    expect(pubRes.body).not.toHaveProperty("diaries");
    expect(pubRes.body).not.toHaveProperty("households");

    // 2. Nông hộ bật đồng ý công khai tên trên QR -> hiển thị tên ở Cấp 1; tắt lại -> ẩn ngay lập tức
    const consentOn = await farmerAn.patch("/api/portal/profile/trace-consent").send({ publicTraceConsent: true });
    expect(consentOn.status).toBe(200);
    expect(consentOn.body.publicTraceConsent).toBe(true);

    const pubAfterConsent = await request(app).get("/api/public/trace/LH-2024-038");
    expect(pubAfterConsent.body.publicData.producer.consentedHouseholds).toContain("Nguyễn Văn An");

    const consentOff = await farmerAn.patch("/api/portal/profile/trace-consent").send({ publicTraceConsent: false });
    expect(consentOff.status).toBe(200);
    expect(consentOff.body.publicTraceConsent).toBe(false);

    // 3. Tạo tài khoản vai trò 'enterprise' gắn đúng doanh nghiệp sở hữu lô (DN-VINHPHAT) -> xem được Cấp 2 (sourceZones, detailedLabTests), không xem được Cấp 3 & bị chặn khỏi /api/households
    const vinhPhatList = await admin.get("/api/enterprises?q=DN-VINHPHAT");
    const vinhPhatEnt = (vinhPhatList.body.data as Array<{ id: number; code: string }>).find(
      (e) => e.code === "DN-VINHPHAT",
    );
    expect(vinhPhatEnt).toBeDefined();

    const entAcc = await admin.post("/api/accounts").send({
      fullName: "CSĐG Sầu Riêng Xuất Khẩu",
      username: "0988776655",
      password: "EnterprisePassword123",
      role: "enterprise",
      enterpriseId: vinhPhatEnt!.id,
    });
    expect(entAcc.status).toBe(201);

    const enterpriseAgent = await loggedIn("0988776655", "EnterprisePassword123");
    expect((await enterpriseAgent.get("/api/households")).status).toBe(403);
    expect((await enterpriseAgent.get("/api/spray")).status).toBe(403);
    expect((await enterpriseAgent.get("/api/harvest")).status).toBe(200);

    const entTrace = await enterpriseAgent.get("/api/public/trace/LH-2024-038");
    expect(entTrace.status).toBe(200);
    expect(entTrace.body.accessControl.viewerTier).toBe("enterprise");
    expect(entTrace.body.accessControl.auditLogged).toBe(true);
    expect(Array.isArray(entTrace.body.enterpriseData.sourceZones)).toBe(true);
    expect(entTrace.body).not.toHaveProperty("authorityData");

    // 4. Cấp 3 (Cơ quan quản lý - Thanh tra): xem đủ cả Cấp 2 + Cấp 3 (hộ/thửa nguồn, nhật ký canh tác, biên bản kiểm tra) và hỗ trợ xem trước Cấp 1
    const authTrace = await inspector.get("/api/public/trace/LH-2024-038");
    expect(authTrace.status).toBe(200);
    expect(authTrace.body.accessControl.viewerTier).toBe("authority");
    expect(authTrace.body.accessControl.auditLogged).toBe(true);
    expect(authTrace.body.enterpriseData).toBeDefined();
    expect(authTrace.body.authorityData.sourceHouseholds.length).toBeGreaterThan(0);
    expect(Array.isArray(authTrace.body.authorityData.cultivationDiaries)).toBe(true);
    expect(Array.isArray(authTrace.body.authorityData.inspectionMinutes)).toBe(true);

    const previewPublic = await inspector.get("/api/public/trace/LH-2024-038?view=public");
    expect(previewPublic.status).toBe(200);
    expect(previewPublic.body.accessControl.viewerTier).toBe("public");
    expect(previewPublic.body.accessControl.actualTier).toBe("authority");
    expect(previewPublic.body).not.toHaveProperty("enterpriseData");
    expect(previewPublic.body).not.toHaveProperty("authorityData");

    // Kiểm tra mọi lượt xem mở rộng đã được ghi vào audit_logs
    const auditLogs = await admin.get("/api/audit-log?search=LH-2024-038&pageSize=20");
    expect(auditLogs.status).toBe(200);
    expect(
      (auditLogs.body.data as Array<{ action: string; object: string }>).some(
        (l) => l.action === "Tra cứu QR mở rộng" && l.object === "Mã QR LH-2024-038",
      ),
    ).toBe(true);

    // 5. Tải bản scan PDF phiếu kiểm nghiệm & thu hồi lô hàng trên máy chủ
    const tinyPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");
    const labUpload = await inspector
      .post("/api/uploads")
      .field("purpose", "lab")
      .attach("file", tinyPdf, "phieu-kiem-nghiem.pdf");
    expect(labUpload.status).toBe(201);

    const labCreated = await inspector.post("/api/testing").send({
      code: "MK-SCAN-2026",
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: "2025-11-10",
      cdMgKg: 0.012,
      yellowOPositive: false,
      residueMgKg: 0.015,
      result: "pass",
      lab: "Quatest 3",
      scanAttachmentId: labUpload.body.id,
    });
    expect(labCreated.status).toBe(201);
    expect(labCreated.body.scanUrl).toMatch(/^\/api\/public\/files\/[A-Za-z0-9_-]{16,64}$/);
    expect((await request(app).get(labCreated.body.scanUrl)).status).toBe(200);
    expect((await request(app).get(`/api/public/files/${labUpload.body.id}`)).status).toBe(404);

    const lotCreated = await htx.post("/api/harvest").send({
      code: "LH-REVOKE-2026",
      variety: "Monthong (Dona)",
      harvestedOn: "2025-11-10",
      packedOn: "2025-11-11",
      weightTons: 12.5,
      buyer: "Đối Tác Ẩn Danh Thương Mại",
      market: "Xuất khẩu Trung Quốc",
      status: "revoked",
      revokedReason: "Thu hồi kiểm tra lại niêm phong thùng",
      phytosanitaryCertNo: "KDTV-VN-2026-0889",
    });
    expect(lotCreated.status).toBe(201);

    const revokedTrace = await request(app).get("/api/public/trace/LH-REVOKE-2026");
    expect(revokedTrace.status).toBe(200);
    expect(revokedTrace.body.publicData.lotIdentity.status).toBe("revoked");
    expect(revokedTrace.body.publicData.verification.isAbnormal).toBe(true);
    expect(revokedTrace.body.publicData.phytosanitary.certNo).toBe("KDTV-VN-2026-0889");
    expect(JSON.stringify(revokedTrace.body)).not.toContain("Đối Tác Ẩn Danh Thương Mại");
  });

  it("Mục 4 (4a, 4b, 4c, 4f): liên kết Lô - Thửa nguồn truy vết sự cố, token ngẫu nhiên chống giả đa quốc gia, trạng thái PUC/PHC thời gian thực và ẩn bản nháp", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);
    const inspector = await loggedIn(USERS.inspector);

    // Tạo cơ sở đóng gói (PHC) để kiểm thử trạng thái thời gian thực (4c)
    const entCreated = await htx.post("/api/enterprises").send({
      code: "DN-PHC-LIVE01",
      name: "CSĐG Xuất Khẩu Cư Né 01",
      packhouseCode: "VN-DLPH-9901",
      address: "Xã Cư Né, Krông Búk, Đắk Lắk",
      status: "active",
    });
    expect(entCreated.status).toBe(201);

    // Tạo lô hàng mới -> tự sinh qrToken ngẫu nhiên 14 ký tự Base62 (4b)
    const lotRes = await htx.post("/api/harvest").send({
      code: "LH-HARDEN-2026",
      enterpriseId: entCreated.body.id,
      variety: "Monthong (Dona)",
      harvestedOn: "2026-06-10",
      packedOn: "2026-06-11",
      weightTons: 6.0,
      buyer: "CSĐG Xuất Khẩu Cư Né 01",
      market: "Xuất khẩu Trung Quốc",
      status: "exported",
      packhouseCode: "VN-DLPH-9901",
    });
    expect(lotRes.status).toBe(201);
    expect(lotRes.body.qrToken).toMatch(/^[0-9A-Za-z]{14}$/);
    const lotId = lotRes.body.id;
    const lotToken = lotRes.body.qrToken as string;

    // (4a) Kiểm tra danh sách thửa của hộ & ghi nhận đóng góp chi tiết tới từng thửa nguồn (lot <-> plot_code)
    const hhPlots = await htx.get("/api/harvest-plan/household-plots?householdId=1");
    expect(hhPlots.status).toBe(200);
    expect(Array.isArray(hhPlots.body.data)).toBe(true);

    // Thử gắn thửa không thuộc Hộ 1 -> bị từ chối 400
    const badContrib = await htx.post(`/api/harvest/${lotId}/contributions`).send({
      householdId: 1,
      plotCode: "TH2-001",
      weightKg: 1000,
    });
    expect(badContrib.status).toBe(400);

    // Gắn đúng thửa nguồn của Hộ 1 (TH1-001) và Hộ 2 (TH2-001)
    expect(
      (
        await htx.post(`/api/harvest/${lotId}/contributions`).send({
          householdId: 1,
          plotCode: "TH1-001",
          weightKg: 3200,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await htx.post(`/api/harvest/${lotId}/contributions`).send({
          householdId: 2,
          plotCode: "TH2-001",
          weightKg: 2800,
        })
      ).status,
    ).toBe(201);

    // Truy vết xuôi từ thửa nguồn TH1-001 -> phát hiện ngay lô LH-HARDEN-2026 bị ảnh hưởng
    const forwardTrace = await inspector.get("/api/harvest/incident-trace?plotCode=TH1-001");
    expect(forwardTrace.status).toBe(200);
    expect(
      (forwardTrace.body.affectedLots as Array<{ lotCode: string }>).some((l) => l.lotCode === "LH-HARDEN-2026"),
    ).toBe(true);

    // Truy vết ngược từ lô LH-HARDEN-2026 -> ra đúng 2 thửa nguồn TH1-001 và TH2-001
    const backwardTrace = await inspector.get("/api/harvest/incident-trace?lotCode=LH-HARDEN-2026");
    expect(backwardTrace.status).toBe(200);
    const parcelCodes = (backwardTrace.body.sourceParcels as Array<{ plotCode: string }>).map((p) => p.plotCode);
    expect(parcelCodes).toEqual(expect.arrayContaining(["TH1-001", "TH2-001"]));

    // Phân quyền: tài khoản doanh nghiệp (enterprise) KHÔNG được gọi incident-trace để dò danh sách hộ/thửa cá nhân (403)
    const entUserRes = await admin.post("/api/accounts").send({
      fullName: "Doanh Nghiệp Kiểm Thử 4a",
      username: "0988776644",
      password: "EnterprisePassword123",
      role: "enterprise",
    });
    expect(entUserRes.status).toBe(201);
    const entAgent = await loggedIn("0988776644", "EnterprisePassword123");
    expect((await entAgent.get("/api/harvest/incident-trace?lotCode=LH-HARDEN-2026")).status).toBe(403);

    // (4b) Sinh tem thùng (box) -> mỗi thùng có qrToken ngẫu nhiên 14 ký tự; quét từ VN rồi CN -> bật cảnh báo multi_country
    const genBoxes = await htx.post(`/api/harvest/${lotId}/generate-items`).send({
      itemType: "box",
      count: 2,
      weightKg: 18,
      grade: "A",
    });
    expect(genBoxes.status).toBe(201);
    expect(genBoxes.body.data).toHaveLength(2);
    const boxToken = genBoxes.body.data[0].qrToken as string;
    expect(boxToken).toMatch(/^[0-9A-Za-z]{14}$/);
    expect(genBoxes.body.data[0].pucCode).toBeTruthy();

    const scanVn = await request(app)
      .get(`/api/public/trace/${boxToken}`)
      .set("CF-IPCountry", "VN")
      .set("User-Agent", "Scanner-VN/1.0");
    expect(scanVn.status).toBe(200);
    expect(scanVn.body.publicData.lotIdentity.lotCode).toBe("LH-HARDEN-2026");
    expect(scanVn.body.publicData.verification.warningReason).toBeNull();

    const scanCn = await request(app)
      .get(`/api/public/trace/${boxToken}`)
      .set("CF-IPCountry", "CN")
      .set("User-Agent", "WeChat-CN/8.0");
    expect(scanCn.status).toBe(200);
    expect(scanCn.body.publicData.verification.isAbnormal).toBe(true);
    expect(scanCn.body.publicData.verification.warningReason).toBe("multi_country");
    expect(scanCn.body.publicData.verification.countries24h).toEqual(expect.arrayContaining(["VN", "CN"]));

    // (4c) Tạm dừng cơ sở đóng gói (PHC) trên máy chủ -> quét lại token lô thấy ngay cảnh báo thời gian thực
    expect(
      (await htx.patch(`/api/enterprises/${entCreated.body.id}`).send({ status: "suspended" })).status,
    ).toBe(200);
    const scanPhcSuspended = await request(app).get(`/api/public/trace/${lotToken}`);
    expect(scanPhcSuspended.status).toBe(200);
    expect(scanPhcSuspended.body.publicData.realtimeStatus.hasSuspensionAlert).toBe(true);
    expect(scanPhcSuspended.body.publicData.packhouse.status).toBe("suspended");
    expect(scanPhcSuspended.body.publicData.verification.warningReason).toBe("realtime_suspended");

    // Khôi phục PHC -> tạm dừng Mã vùng trồng (PUC) -> quét lại thấy ngay cảnh báo PUC tạm dừng
    expect((await htx.patch(`/api/enterprises/${entCreated.body.id}`).send({ status: "active" })).status).toBe(200);
    const activePucCode = scanPhcSuspended.body.publicData.growingZone.pucCode as string;
    expect(
      (
        await htx.patch(`/api/growing-zones/${encodeURIComponent(activePucCode)}`).send({
          status: "suspended",
          statusNote: "Tạm dừng để kiểm tra bổ sung mẫu đất",
        })
      ).status,
    ).toBe(200);

    const scanPucSuspended = await request(app).get(`/api/public/trace/${lotToken}`);
    expect(scanPucSuspended.status).toBe(200);
    expect(scanPucSuspended.body.publicData.realtimeStatus.hasSuspensionAlert).toBe(true);
    expect(scanPucSuspended.body.publicData.growingZone.status).toBe("suspended");

    // Khôi phục lại PUC về active
    expect(
      (
        await htx.patch(`/api/growing-zones/${encodeURIComponent(activePucCode)}`).send({
          status: "active",
          statusNote: null,
        })
      ).status,
    ).toBe(200);

    // (4f) Phiếu kiểm nghiệm trạng thái 'draft' KHÔNG hiển thị trên QR công khai & bị ẩn khỏi doanh nghiệp, chỉ hiện khi 'verified'
    const draftLab = await inspector.post("/api/testing").send({
      code: "MK-DRAFT-2026",
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: "2026-06-09",
      cdMgKg: 0.011,
      yellowOPositive: false,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Phòng Thử Nghiệm Nội Bộ",
      recordStatus: "draft",
    });
    expect(draftLab.status).toBe(201);
    expect(draftLab.body.recordStatus).toBe("draft");

    const entLabList = await entAgent.get("/api/testing?q=MK-DRAFT-2026");
    expect(entLabList.status).toBe(200);
    expect(entLabList.body.data).toHaveLength(0);

    const pubWithDraft = await request(app).get(`/api/public/trace/${lotToken}`);
    expect(pubWithDraft.status).toBe(200);
    expect(
      (pubWithDraft.body.publicData.labTests as Array<{ code: string }>).some((t) => t.code === "MK-DRAFT-2026"),
    ).toBe(false);

    // Duyệt sang 'verified' -> xuất hiện ngay trên QR công khai
    expect(
      (await inspector.patch(`/api/testing/${draftLab.body.id}`).send({ recordStatus: "verified" })).status,
    ).toBe(200);
    const pubWithVerified = await request(app).get(`/api/public/trace/${lotToken}`);
    expect(
      (pubWithVerified.body.publicData.labTests as Array<{ code: string }>).some((t) => t.code === "MK-DRAFT-2026"),
    ).toBe(true);

    // Tem nông hộ mới cấp phát (chưa kích hoạt - allocated) -> quét qua qrToken báo 'unverified'
    const stampAlloc = await htx.post("/api/stamp-allocations").send({
      householdId: 1,
      plotCode: "TH1-001",
      quantity: 1,
    });
    expect(stampAlloc.status).toBe(201);
    const stampRows = await htx.get(`/api/stamp-allocations/${stampAlloc.body.id}/stamps`);
    const unactivatedToken = stampRows.body.data[0].qrToken as string;
    expect(unactivatedToken).toMatch(/^[0-9A-Za-z]{14}$/);

    const unactivatedScan = await request(app).get(`/api/public/trace/${unactivatedToken}`);
    expect(unactivatedScan.status).toBe(200);
    expect(unactivatedScan.body.publicData.lotIdentity.status).toBe("unverified");

    // Thu hồi dải tem kiểm thử để không làm lệch thống kê tem còn lại của Hộ 1 ở các bộ test kế tiếp
    expect((await htx.post(`/api/stamp-allocations/${stampAlloc.body.id}/revoke`)).status).toBe(200);
  });

  it("Một mã QR duy nhất với phân quyền theo phạm vi máy chủ (RBAC kèm Scope), API PWA /api/trace/:code, 2FA OTP, đăng xuất từ xa và nhật ký minh bạch", async () => {
    const admin = await loggedIn(USERS.admin);

    // 1. API quét trong PWA (/api/trace/:code) bắt buộc phải đăng nhập; khách quét chưa đăng nhập dùng /api/public/trace/:code
    expect((await request(app).get("/api/trace/LH-2024-038")).status).toBe(401);
    const spoofAttempt = await request(app)
      .get("/api/public/trace/LH-2024-038?view=authority")
      .set("X-Forwarded-For", "127.0.0.1")
      .set("User-Agent", "PUC-Authority-Internal-Scanner/9.0")
      .set("CF-IPCountry", "VN");
    expect(spoofAttempt.status).toBe(200);
    expect(spoofAttempt.body.accessControl.viewerTier).toBe("public");
    expect(spoofAttempt.body).not.toHaveProperty("enterpriseData");
    expect(spoofAttempt.body).not.toHaveProperty("authorityData");

    const lotQrToken = spoofAttempt.body.publicData.lotIdentity.qrToken as string;
    expect(lotQrToken).toBeTruthy();

    // 2. Cô lập phạm vi Doanh nghiệp: Doanh nghiệp A (DN-VINHPHAT) xem được chi tiết lô LH-2024-038, Doanh nghiệp B (DN-RONGDO) bị từ chối chi tiết trên cùng mã QR
    const allEnts = await admin.get("/api/enterprises");
    const entRows = allEnts.body.data as Array<{ id: number; code: string }>;
    const vinhPhat = entRows.find((e) => e.code === "DN-VINHPHAT")!;
    const rongDo = entRows.find((e) => e.code === "DN-RONGDO")!;
    expect(vinhPhat).toBeDefined();
    expect(rongDo).toBeDefined();

    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Đối Tác Vĩnh Phát Scope",
          username: "ent_vinhphat_scope",
          password: "EnterprisePassword123",
          role: "enterprise",
          enterpriseId: vinhPhat.id,
        })
      ).status,
    ).toBe(201);

    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Đối Tác Rồng Đỏ Scope",
          username: "ent_rongdo_scope",
          password: "EnterprisePassword123",
          role: "enterprise",
          enterpriseId: rongDo.id,
        })
      ).status,
    ).toBe(201);

    const entAAgent = await loggedIn("ent_vinhphat_scope", "EnterprisePassword123");
    const entBAgent = await loggedIn("ent_rongdo_scope", "EnterprisePassword123");

    // Doanh nghiệp A quét token lô của mình qua API PWA có xác thực -> nhận Cấp 2
    const entAScan = await entAAgent.get(`/api/trace/${lotQrToken}`);
    expect(entAScan.status).toBe(200);
    expect(entAScan.body.accessControl.viewerTier).toBe("enterprise");
    expect(entAScan.body.accessControl.scopeDenied).toBe(false);
    expect(entAScan.body.enterpriseData).toBeDefined();
    expect(entAScan.body).not.toHaveProperty("authorityData");

    // Doanh nghiệp B quét CÙNG token lô của Doanh nghiệp A -> chỉ thấy bản công khai kèm cảnh báo không có quyền xem chi tiết
    const entBScanForeign = await entBAgent.get(`/api/trace/${lotQrToken}`);
    expect(entBScanForeign.status).toBe(200);
    expect(entBScanForeign.body.accessControl.viewerTier).toBe("public");
    expect(entBScanForeign.body.accessControl.scopeDenied).toBe(true);
    expect(entBScanForeign.body.accessControl.scopeDeniedMessage).toBe("Bạn không có quyền xem chi tiết lô này");
    expect(entBScanForeign.body).not.toHaveProperty("enterpriseData");
    expect(entBScanForeign.body).not.toHaveProperty("authorityData");

    // Doanh nghiệp B quét lô thuộc sở hữu của Rồng Đỏ (LH-2024-037) -> được cấp Cấp 2 hợp lệ
    const entBScanOwn = await entBAgent.get("/api/trace/LH-2024-037");
    expect(entBScanOwn.status).toBe(200);
    expect(entBScanOwn.body.accessControl.viewerTier).toBe("enterprise");
    expect(entBScanOwn.body.accessControl.scopeDenied).toBe(false);
    expect(entBScanOwn.body.enterpriseData).toBeDefined();

    // Danh sách /api/harvest của Doanh nghiệp B chỉ trả về lô của Rồng Đỏ, không rò rỉ lô LH-2024-038 của Vĩnh Phát
    const entBHarvestList = await entBAgent.get("/api/harvest");
    expect(entBHarvestList.status).toBe(200);
    const entBLotCodes = (entBHarvestList.body.data as Array<{ code: string }>).map((l) => l.code);
    expect(entBLotCodes).toContain("LH-2024-037");
    expect(entBLotCodes).not.toContain("LH-2024-038");

    // 3. Cô lập phạm vi Cán bộ xã, Thanh tra địa bàn và Quản trị HTX khác
    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Cán Bộ Xã Ea Khăl",
          username: "cb_xa_eakhal",
          password: "OfficerPassword123",
          role: "village_officer",
          assignedCommune: "Xã Ea Khăl",
        })
      ).status,
    ).toBe(201);

    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Thanh Tra Lâm Đồng",
          username: "tt_lamdong",
          password: "OfficerPassword123",
          role: "inspector",
          assignedRegion: "Tỉnh Lâm Đồng",
        })
      ).status,
    ).toBe(201);

    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Quản Trị HTX Khác",
          username: "cb_htx_khac",
          password: "OfficerPassword123",
          role: "htx_officer",
          coopCode: "HTX-KRONGPAC",
        })
      ).status,
    ).toBe(201);

    for (const uname of ["cb_xa_eakhal", "tt_lamdong", "cb_htx_khac"]) {
      const outScopeAgent = await loggedIn(uname, "OfficerPassword123");
      const outRes = await outScopeAgent.get(`/api/trace/${lotQrToken}`);
      expect(outRes.status).toBe(200);
      expect(outRes.body.accessControl.viewerTier).toBe("public");
      expect(outRes.body.accessControl.scopeDenied).toBe(true);
      expect(outRes.body.accessControl.scopeDeniedMessage).toBe("Bạn không có quyền xem chi tiết lô này");
      expect(outRes.body).not.toHaveProperty("enterpriseData");
      expect(outRes.body).not.toHaveProperty("authorityData");
    }

    // 4. Vòng đời Xác thực 2 lớp (2FA TOTP + Backup Codes)
    expect(
      (
        await admin.post("/api/accounts").send({
          fullName: "Thanh Tra Có Bảo Mật 2FA",
          username: "tt_daklak_2fa",
          password: "SecurePassword123",
          role: "inspector",
          assignedRegion: "Tỉnh Đắk Lắk",
        })
      ).status,
    ).toBe(201);

    const mfaSetupAgent = await loggedIn("tt_daklak_2fa", "SecurePassword123");
    const setupRes = await mfaSetupAgent.post("/api/auth/2fa/setup");
    expect(setupRes.status).toBe(200);
    expect(setupRes.body.secret).toMatch(/^[A-Z2-7]{16,}$/);
    expect(setupRes.body.otpauthUrl).toContain("otpauth://totp/");

    const validTotp = generateTotpCode(setupRes.body.secret);
    const enableRes = await mfaSetupAgent.post("/api/auth/2fa/enable").send({ code: validTotp });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.enabled).toBe(true);
    expect(enableRes.body.backupCodes).toHaveLength(8);
    const firstBackupCode = enableRes.body.backupCodes[0] as string;

    // Đăng nhập mới trên thiết bị khác -> yêu cầu OTP bước 2, chưa cấp cookie phiên
    const step1Agent = request.agent(app);
    const step1Res = await step1Agent.post("/api/auth/login").send({
      username: "tt_daklak_2fa",
      password: "SecurePassword123",
    });
    expect(step1Res.status).toBe(200);
    expect(step1Res.body.mfaRequired).toBe(true);
    expect(step1Res.body.challengeToken).toBeTruthy();
    expect((await step1Agent.get("/api/auth/me")).status).toBe(401);

    // Nhập sai OTP -> 401
    const wrongOtp = validTotp === "000000" ? "111111" : "000000";
    const badOtpRes = await step1Agent.post("/api/auth/verify-otp").send({
      challengeToken: step1Res.body.challengeToken,
      code: wrongOtp,
    });
    expect(badOtpRes.status).toBe(401);

    // Nhập đúng TOTP -> cấp phiên hợp lệ & xem được Cấp 3 đúng địa bàn Đắk Lắk
    const goodOtpRes = await step1Agent.post("/api/auth/verify-otp").send({
      challengeToken: step1Res.body.challengeToken,
      code: generateTotpCode(setupRes.body.secret),
    });
    expect(goodOtpRes.status).toBe(200);
    expect(goodOtpRes.body.user.twoFactorEnabled).toBe(true);

    const daklakScan = await step1Agent.get(`/api/trace/${lotQrToken}`);
    expect(daklakScan.status).toBe(200);
    expect(daklakScan.body.accessControl.viewerTier).toBe("authority");
    expect(daklakScan.body.authorityData).toBeDefined();

    // Dùng thử 1 mã dự phòng (backup code) trên thiết bị thứ 2 -> thành công 1 lần duy nhất
    const backupAgent = request.agent(app);
    const challenge2 = await backupAgent.post("/api/auth/login").send({
      username: "tt_daklak_2fa",
      password: "SecurePassword123",
    });
    expect(challenge2.body.mfaRequired).toBe(true);
    const backupVerify = await backupAgent.post("/api/auth/verify-otp").send({
      challengeToken: challenge2.body.challengeToken,
      code: firstBackupCode,
    });
    expect(backupVerify.status).toBe(200);

    // Dùng lại đúng mã dự phòng vừa tiêu thụ -> bị từ chối 401
    const challenge3 = await request(app).post("/api/auth/login").send({
      username: "tt_daklak_2fa",
      password: "SecurePassword123",
    });
    const reusedBackup = await request(app).post("/api/auth/verify-otp").send({
      challengeToken: challenge3.body.challengeToken,
      code: firstBackupCode,
    });
    expect(reusedBackup.status).toBe(401);

    // 5. Đăng xuất từ xa theo từng thiết bị (Remote Session Revocation): vô hiệu hóa ngay tức thì access token của thiết bị B
    const sessionsRes = await step1Agent.get("/api/auth/sessions");
    expect(sessionsRes.status).toBe(200);
    const sessionRows = sessionsRes.body.data as Array<{ id: number; isCurrent: boolean }>;
    expect(sessionRows.length).toBeGreaterThanOrEqual(2);
    const otherSession = sessionRows.find((s) => !s.isCurrent)!;
    expect(otherSession).toBeDefined();

    const revokeRes = await step1Agent.delete(`/api/auth/sessions/${otherSession.id}`);
    expect(revokeRes.status).toBe(200);

    // Thiết bị B (backupAgent) bị thu hồi ngay lập tức dù JWT chưa hết hạn thời gian; thiết bị A vẫn hoạt động bình thường
    expect((await backupAgent.get("/api/auth/me")).status).toBe(401);
    expect((await backupAgent.get(`/api/trace/${lotQrToken}`)).status).toBe(401);
    expect((await step1Agent.get("/api/auth/me")).status).toBe(200);

    // 6. Nhật ký minh bạch lượt xem chi tiết QR (/api/harvest/trace-access-logs) lưu đủ cả lượt hợp lệ lẫn lượt bị chặn ngoài phạm vi
    const accessLogsRes = await admin.get("/api/harvest/trace-access-logs?lotCode=LH-2024-038&limit=50");
    expect(accessLogsRes.status).toBe(200);
    const logItems = accessLogsRes.body.data as Array<{
      username: string;
      scopeGranted: boolean;
      viewerTier: string;
    }>;
    expect(logItems.some((l) => l.username === "ent_vinhphat_scope" && l.scopeGranted === true && l.viewerTier === "enterprise")).toBe(
      true,
    );
    expect(logItems.some((l) => l.username === "ent_rongdo_scope" && l.scopeGranted === false && l.viewerTier === "public")).toBe(
      true,
    );
    expect(logItems.some((l) => l.username === "tt_lamdong" && l.scopeGranted === false)).toBe(true);
    expect(logItems.some((l) => l.username === "tt_daklak_2fa" && l.scopeGranted === true && l.viewerTier === "authority")).toBe(
      true,
    );
  });

  it("5 trụ cột minh bạch mô hình điểm cấp xã: Sổ cái băm SHA-256 chống lùi ngày, Khóa hạn ngạch Mass-Balance & PHI, Biển QR Vườn & Thẻ Đoàn Thẩm định GPS thực địa, Xác thực chéo ISO/IEC 17025 và Bảo chứng Tỉnh - Xã", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);
    const inspector = await loggedIn(USERS.inspector);
    const farmerAn = await loggedIn(USERS.farmerAn);
    const entCheck = await loggedIn("ent_vinhphat_scope", "EnterprisePassword123");

    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const isoDaysOffset = (offsetDays: number) => {
      const vnNow = new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400 * 1000);
      return vnNow.toISOString().slice(0, 10);
    };
    const todayVnIso = isoDaysOffset(0);

    // Lấy thông tin bảng QR thửa đất TH1-001 đã khởi tạo (qrToken, tâm đa giác GIS)
    const signboardsRes = await htx.get("/api/harvest/plot-signboards?q=TH1-001");
    expect(signboardsRes.status).toBe(200);
    const plotSignboard = (
      signboardsRes.body.data as Array<{
        plotCode: string;
        qrToken: string;
        zoneCode: string;
        centerLat: number;
        centerLng: number;
      }>
    ).find((p) => p.plotCode === "TH1-001");
    expect(plotSignboard).toBeDefined();
    const plotQrToken = plotSignboard!.qrToken;
    const centerLat = Number(plotSignboard!.centerLat);
    const centerLng = Number(plotSignboard!.centerLng);

    // ─── TRỤ CỘT 1: Chống sửa lùi ngày (>7 ngày bị từ chối), đánh dấu >48h, niêm phong SHA-256 & khóa cách ly PHI ───
    const journalPhotoRes = await farmerAn
      .post("/api/uploads")
      .field("purpose", "journal")
      .attach("file", tinyJpeg, "garden.jpg");
    expect(journalPhotoRes.status).toBe(201);

    const tooOldJournal = await farmerAn.post("/api/portal/journal").send({
      entryOn: isoDaysOffset(-10),
      plotCode: "TH1-001",
      activity: "Tỉa cành tạo tán",
      detail: "Thử ghi lùi quá 7 ngày",
      photoId: journalPhotoRes.body.id,
    });
    expect(tooOldJournal.status).toBe(400);

    const lateJournalPhotoRes = await farmerAn
      .post("/api/uploads")
      .field("purpose", "journal")
      .attach("file", tinyJpeg, "garden-late.jpg");
    expect(lateJournalPhotoRes.status).toBe(201);

    const validLateJournal = await farmerAn.post("/api/portal/journal").send({
      entryOn: isoDaysOffset(-4),
      plotCode: "TH1-001",
      activity: "Bón phân hữu cơ",
      detail: "Bón phân vi sinh quanh tán",
      photoId: lateJournalPhotoRes.body.id,
      latitude: centerLat,
      longitude: centerLng,
      lateReason: "Vườn xa mất sóng di động nên cập nhật bổ sung",
    });
    expect(validLateJournal.status).toBe(201);
    expect(validLateJournal.body.isLateEntry).toBe(true);
    expect(validLateJournal.body.gpsVerified).toBe(true);
    expect(validLateJournal.body.recordHash).toMatch(/^[0-9a-f]{64}$/);

    // Kiểm tra niêm phong chuỗi băm SHA-256 trên trang QR công khai
    const traceIntegrityRes = await request(app).get("/api/public/trace/LH-2024-038");
    expect(traceIntegrityRes.status).toBe(200);
    expect(traceIntegrityRes.body.publicData.integritySeal.hashAlgorithm).toBe("SHA-256");
    expect(traceIntegrityRes.body.publicData.integritySeal.chainVerified).toBe(true);
    expect(traceIntegrityRes.body.publicData.integritySeal.totalSealedRecords).toBeGreaterThan(0);

    // Khóa tự động cách ly PHI khi gom lô thu hoạch
    const pestRes = await htx.get("/api/pesticides?pageSize=50");
    const phiPesticide = (
      pestRes.body.data as Array<{ id: number; status: string; isolationDays: number }>
    ).find((p) => p.status === "allowed" && Number(p.isolationDays) >= 7);
    expect(phiPesticide).toBeDefined();

    const activeSpray = await farmerAn.post("/api/portal/spray").send({
      sprayedOn: todayVnIso,
      pesticideId: phiPesticide!.id,
      dose: "20ml / bình 16L",
      areaHa: 0.8,
      plotCode: "TH1-001",
    });
    expect(activeSpray.status).toBe(201);
    expect(activeSpray.body.recordHash).toMatch(/^[0-9a-f]{64}$/);

    const phiLot = await htx.post("/api/harvest").send({
      code: "LH-PHI-LOCK-2026",
      variety: "Monthong (Dona)",
      harvestedOn: todayVnIso,
      packedOn: todayVnIso,
      weightTons: 2.0,
      buyer: "Công ty Kiểm Thử PHI",
      market: "Trung Quốc",
      status: "sampling",
    });
    expect(phiLot.status).toBe(201);

    const blockedByPhi = await htx.post(`/api/harvest/${phiLot.body.id}/contributions`).send({
      householdId: 1,
      plotCode: "TH1-001",
      weightKg: 500,
    });
    expect(blockedByPhi.status).toBe(400);

    // Dọn bản ghi phun vừa thử để tiếp tục kiểm thử hạn ngạch sản lượng
    expect((await admin.delete(`/api/spray/${activeSpray.body.id}`)).status).toBe(200);
    expect((await admin.delete(`/api/harvest/${phiLot.body.id}`)).status).toBe(200);

    // ─── TRỤ CỘT 2: Khóa trần sản lượng đầu vụ Mass-Balance chống trà trộn hàng ngoài vùng ───
    // Doanh nghiệp không được xem danh sách hạn ngạch hộ dân nội bộ hay thẻ đoàn thẩm định (403)
    expect((await entCheck.get("/api/harvest/plot-quotas")).status).toBe(403);
    expect((await entCheck.get("/api/harvest/plot-signboards")).status).toBe(403);
    expect((await entCheck.get("/api/field-audit-passes")).status).toBe(403);

    // Ở bài test trước, thửa TH1-001 đã đóng góp 3200 kg trong năm 2026 (lô LH-HARDEN-2026).
    // Đặt trần thẩm định năm 2026 của TH1-001 = 5000 kg -> chỉ còn dư 1800 kg.
    const upsertQuotaRes = await htx.put("/api/harvest/plot-quotas").send({
      seasonYear: 2026,
      householdId: 1,
      plotCode: "TH1-001",
      zoneCode: plotSignboard!.zoneCode || "VN-DLOR-0086",
      areaHa: 1.2,
      treeCount: 160,
      maxQuotaKg: 5000,
      assessedBy: "Tổ Giám sát Kỹ thuật UBND Xã Cư Né",
      assessedOn: "2026-03-15",
    });
    expect(upsertQuotaRes.status).toBe(200);

    const quotaLot = await htx.post("/api/harvest").send({
      code: "LH-QUOTA-LOCK-2026",
      variety: "Monthong (Dona)",
      harvestedOn: "2026-07-15",
      packedOn: "2026-07-16",
      weightTons: 2.0,
      buyer: "Công ty Kiểm Thử Mass-Balance",
      market: "Trung Quốc",
      status: "exported",
    });
    expect(quotaLot.status).toBe(201);

    // Góp thêm 2500 kg (3200 + 2500 = 5700 > 5000 kg) -> máy chủ chặn cứng 400
    const overQuotaRes = await htx.post(`/api/harvest/${quotaLot.body.id}/contributions`).send({
      householdId: 1,
      plotCode: "TH1-001",
      weightKg: 2500,
    });
    expect(overQuotaRes.status).toBe(400);

    // Góp đúng 1500 kg trong hạn mức (3200 + 1500 = 4700 <= 5000 kg) -> thành công 201
    const withinQuotaRes = await htx.post(`/api/harvest/${quotaLot.body.id}/contributions`).send({
      householdId: 1,
      plotCode: "TH1-001",
      weightKg: 1500,
    });
    expect(withinQuotaRes.status).toBe(201);

    const checkQuotaList = await htx.get("/api/harvest/plot-quotas?seasonYear=2026&q=TH1-001");
    expect(checkQuotaList.status).toBe(200);
    expect(checkQuotaList.body.data[0].usedKg).toBe(4700);
    expect(checkQuotaList.body.data[0].remainingKg).toBe(300);

    // ─── TRỤ CỘT 3: Biển QR Thửa vườn, Thẻ Đoàn Thẩm định Thực địa & Đối chiếu GPS sống tại vườn ───
    const anonPlotScan = await request(app).get(`/api/public/trace/${plotQrToken}`);
    expect(anonPlotScan.status).toBe(200);
    expect(anonPlotScan.body.isPlotSignboard).toBe(true);
    expect(anonPlotScan.body.accessControl.viewerTier).toBe("public");
    expect(anonPlotScan.body).not.toHaveProperty("fieldAuditData");

    // Khách vãng lai không có Thẻ Đoàn gọi verify-gps -> 403
    expect(
      (
        await request(app)
          .post(`/api/public/trace/${plotQrToken}/verify-gps`)
          .send({ latitude: centerLat, longitude: centerLng })
      ).status,
    ).toBe(403);

    // HTX cấp Thẻ Đoàn Thẩm định Thực địa cho Đoàn thu mua Trung Quốc
    const passCreated = await htx.post("/api/field-audit-passes").send({
      delegationName: "Đoàn Thương nhân Nhập khẩu Quảng Tây",
      organization: "Guangxi Fruit Import Group",
      allowedZoneCode: plotSignboard!.zoneCode,
      defaultLang: "zh",
      durationHours: 48,
      note: "Thẩm định thực địa vùng trồng mẫu xã Cư Né",
    });
    expect(passCreated.status).toBe(201);
    const passToken = passCreated.body.passToken as string;
    const passId = passCreated.body.id as number;
    expect(passToken.length).toBeGreaterThanOrEqual(16);

    // Đoàn quét mã Biển QR Vườn kèm Thẻ Đoàn -> mở khóa fieldAuditData nhưng tuyệt đối KHÔNG rò rỉ SĐT/CCCD hộ dân
    const auditPlotScan = await request(app).get(
      `/api/public/trace/${plotQrToken}?auditPass=${encodeURIComponent(passToken)}`,
    );
    expect(auditPlotScan.status).toBe(200);
    expect(auditPlotScan.body.accessControl.fieldAuditPass?.active).toBe(true);
    expect(auditPlotScan.body.accessControl.auditLogged).toBe(true);
    expect(auditPlotScan.body.fieldAuditData).toBeDefined();
    expect(auditPlotScan.body.fieldAuditData.plotProfile.plotCode).toBe("TH1-001");
    const serializedAudit = JSON.stringify(auditPlotScan.body);
    expect(serializedAudit).not.toContain("0905123456");
    expect(serializedAudit).not.toContain("cccd");

    // Đoàn bấm đối chiếu GPS ngay tại tâm thửa đất -> verified: true, insidePolygon: true
    const gpsInside = await request(app)
      .post(`/api/public/trace/${plotQrToken}/verify-gps`)
      .send({
        latitude: centerLat,
        longitude: centerLng,
        accuracyMeters: 6,
        auditPass: passToken,
      });
    expect(gpsInside.status).toBe(200);
    expect(gpsInside.body.verified).toBe(true);
    expect(gpsInside.body.insidePolygon).toBe(true);
    expect(gpsInside.body.distanceMeters).toBe(0);

    // Đoàn đứng cách xa 15 km bấm đối chiếu GPS -> verified: false, insidePolygon: false
    const gpsOutside = await request(app)
      .post(`/api/public/trace/${plotQrToken}/verify-gps`)
      .send({
        latitude: centerLat + 0.15,
        longitude: centerLng + 0.15,
        accuracyMeters: 8,
        auditPass: passToken,
      });
    expect(gpsOutside.status).toBe(200);
    expect(gpsOutside.body.verified).toBe(false);
    expect(gpsOutside.body.insidePolygon).toBe(false);
    expect(gpsOutside.body.distanceMeters).toBeGreaterThan(1000);

    // Thu hồi Thẻ Đoàn từ xa -> quét lại hạ về public ngay lập tức và khóa verify-gps (403)
    expect((await htx.patch(`/api/field-audit-passes/${passId}/revoke`)).status).toBe(200);
    const revokedPassScan = await request(app).get(
      `/api/public/trace/${plotQrToken}?auditPass=${encodeURIComponent(passToken)}`,
    );
    expect(revokedPassScan.status).toBe(200);
    expect(revokedPassScan.body.accessControl.fieldAuditPass?.active).toBe(false);
    expect(revokedPassScan.body).not.toHaveProperty("fieldAuditData");
    expect(
      (
        await request(app)
          .post(`/api/public/trace/${plotQrToken}/verify-gps`)
          .send({ latitude: centerLat, longitude: centerLng, auditPass: passToken })
      ).status,
    ).toBe(403);

    // ─── TRỤ CỘT 4: Xác thực chéo độc lập ISO/IEC 17025 (chặn http://, nhận https://) & Biên bản gắn GPS + ảnh ───
    const badHttpLab = await inspector.post("/api/testing").send({
      code: "MK-BAD-URL-2026",
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: "2026-07-10",
      cdMgKg: 0.014,
      residueMgKg: 0.018,
      result: "pass",
      lab: "Quatest 3",
      externalVerifyUrl: "http://insecure-lab.example.com/verify",
    });
    expect(badHttpLab.status).toBe(400);

    const isoLab = await inspector.post("/api/testing").send({
      code: "MK-ISO17025-2026",
      householdId: 1,
      plotCode: "TH1-001",
      sampledOn: "2026-07-10",
      cdMgKg: 0.014,
      yellowOPositive: false,
      residueMgKg: 0.018,
      result: "pass",
      recordStatus: "verified",
      lab: "Trung tâm Kỹ thuật Tiêu chuẩn Đo lường Chất lượng 3 (QUATEST 3)",
      labAccreditationCode: "ISO/IEC 17025:2017 - VILAS 004",
      externalVerifyCode: "QT3-2026-88991",
      externalVerifyUrl: "https://quatest3.com.vn/tra-cuu/QT3-2026-88991",
    });
    expect(isoLab.status).toBe(201);
    expect(isoLab.body.externalVerifyUrl).toBe("https://quatest3.com.vn/tra-cuu/QT3-2026-88991");

    const inspPhoto = await inspector
      .post("/api/uploads")
      .field("purpose", "inspection")
      .attach("file", tinyJpeg, "inspection.jpg");
    expect(inspPhoto.status).toBe(201);

    const geoMinute = await inspector.post("/api/minutes").send({
      code: "BB-GEO-2026-01",
      heldOn: todayVnIso,
      location: "Thôn 1 - Xã Cư Né",
      plotCode: "TH1-001",
      officer: "KS. Trần Quốc Bảo",
      result: "pass",
      photoId: inspPhoto.body.id,
      latitude: centerLat,
      longitude: centerLng,
    });
    expect(geoMinute.status).toBe(201);
    expect(geoMinute.body.gpsVerified).toBe(true);
    expect(geoMinute.body.recordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(geoMinute.body.photoUrl).toMatch(/^\/api\/public\/files\/[A-Za-z0-9_-]{16,64}$/);
    expect(geoMinute.body.photoUrl).toBe(inspPhoto.body.url);

    // ─── TRỤ CỘT 5: Bảo chứng Chính quyền Tỉnh - Xã & Ma trận đối chứng độc lập 3 bên ───
    expect(
      (
        await htx.put("/api/harvest/endorsement-config").send({
          programTitle: "Mô hình điểm Truy xuất nguồn gốc Sầu riêng xuất khẩu cấp Xã",
          communeAuthority: "UBND Xã Cư Né - Huyện Krông Búk",
          provincialAuthority: "UBND Tỉnh Đắk Lắk - Sở Nông nghiệp & Môi trường",
          officialPortalUrl: "http://daklak.gov.vn/khong-https",
        })
      ).status,
    ).toBe(400);

    const endorseUpdated = await htx.put("/api/harvest/endorsement-config").send({
      programTitle: "Mô hình điểm Truy xuất nguồn gốc Sầu riêng xuất khẩu cấp Xã",
      directiveNo: "Kế hoạch thí điểm chuyển đổi số nông nghiệp Tỉnh Đắk Lắk 2026",
      communeAuthority: "UBND Xã Cư Né - Huyện Krông Búk",
      provincialAuthority: "UBND Tỉnh Đắk Lắk - Sở Nông nghiệp & Môi trường",
      officialPortalUrl: "https://daklak.gov.vn/chuyen-doi-so-sau-rieng-cu-ne",
      officialDomain: "daklak.gov.vn",
      inspectionUnit: "Tổ Giám sát Kỹ thuật Cộng đồng Xã Cư Né",
    });
    expect(endorseUpdated.status).toBe(200);

    const finalLotTrace = await request(app).get(`/api/public/trace/${quotaLot.body.qrToken}`);
    expect(finalLotTrace.status).toBe(200);
    expect(finalLotTrace.body.publicData.governance.governmentEndorsement.officialPortalUrl).toBe(
      "https://daklak.gov.vn/chuyen-doi-so-sau-rieng-cu-ne",
    );
    expect(finalLotTrace.body.publicData.governance.threePartyAttestation).toHaveLength(3);
    const verifiedIsoTest = (
      finalLotTrace.body.publicData.labTests as Array<{ code: string; externalVerifyUrl: string | null }>
    ).find((t) => t.code === "MK-ISO17025-2026");
    expect(verifiedIsoTest?.externalVerifyUrl).toBe("https://quatest3.com.vn/tra-cuu/QT3-2026-88991");
  });

  it("Gia cố bảo mật 019: ẩn passToken mẫu, X-Audit-Pass, chặn enterprise ngoài phạm vi verify-gps, khóa Cd/Vàng O, chống xóa hộ có lịch sử và lọc ký tự NUL", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);
    const inspector = await loggedIn(USERS.inspector);

    // 1. /api/public/trace-samples không bao giờ rò rỉ passToken công khai
    const samples = await request(app).get("/api/public/trace-samples");
    expect(samples.status).toBe(200);
    expect(samples.body.demoAuditPass).toBeNull();
    expect(JSON.stringify(samples.body)).not.toContain("passToken");

    // 2. Cấp thẻ đoàn mới -> chỉ trả passToken 1 lần khi POST, danh sách GET che kín, mã ngắn FAP-* bị từ chối, header X-Audit-Pass hoạt động
    const signboardsRes = await htx.get("/api/harvest/plot-signboards");
    const targetSignboard = (
      signboardsRes.body.data as Array<{
        plotCode: string;
        qrToken: string;
        zoneCode: string;
        centerLat: number;
        centerLng: number;
      }>
    ).find((s) => s.plotCode === "TH1-001")!;

    const newPass = await htx.post("/api/field-audit-passes").send({
      delegationName: "Đoàn Kiểm tra Bảo mật Header",
      organization: "GACC Security Check",
      allowedZoneCode: targetSignboard.zoneCode,
      defaultLang: "zh",
      durationHours: 24,
    });
    expect(newPass.status).toBe(201);
    const secretToken = newPass.body.passToken as string;
    const shortCode = newPass.body.code as string;
    expect(secretToken.length).toBeGreaterThanOrEqual(20);

    const listedPasses = await htx.get("/api/field-audit-passes");
    expect(listedPasses.status).toBe(200);
    expect(JSON.stringify(listedPasses.body)).not.toContain(secretToken);

    // Dùng mã định danh ngắn FAP-* không mở khóa được hồ sơ thực địa
    const shortCodeAttempt = await request(app)
      .get(`/api/public/trace/${targetSignboard.qrToken}`)
      .set("X-Audit-Pass", shortCode);
    expect(shortCodeAttempt.status).toBe(200);
    expect(shortCodeAttempt.body.accessControl.fieldAuditPass?.active).toBe(false);
    expect(shortCodeAttempt.body).not.toHaveProperty("fieldAuditData");

    // Dùng X-Audit-Pass với passToken đầy đủ mở khóa thành công mà không cần đẩy vào URL query
    const headerPassScan = await request(app)
      .get(`/api/public/trace/${targetSignboard.qrToken}`)
      .set("X-Audit-Pass", secretToken);
    expect(headerPassScan.status).toBe(200);
    expect(headerPassScan.body.accessControl.fieldAuditPass?.active).toBe(true);
    expect(headerPassScan.body.fieldAuditData).toBeDefined();

    // 3. Doanh nghiệp ngoài phạm vi lô của thửa TH1-001 bị chặn verify-gps (403)
    const foreignEnt = await admin.post("/api/enterprises").send({
      code: "DN-NGOAI-PHAM-VI-019",
      name: "Doanh nghiệp Ngoài Phạm Vi Kiểm Thử",
      taxCode: "0399887766",
      representative: "Ông Ngoài Vùng",
      phone: "0909998877",
      address: "TP. Hồ Chí Minh",
      status: "active",
    });
    expect(foreignEnt.status).toBe(201);
    const foreignEntId = foreignEnt.body.id as number;
    const outScopeUser = await admin.post("/api/accounts").send({
      fullName: "Đối tác Ngoài Phạm Vi GPS",
      username: "0966001122",
      password: "Password123",
      role: "enterprise",
      enterpriseId: foreignEntId,
    });
    expect(outScopeUser.status).toBe(201);
    const foreignEntAgent = await loggedIn("0966001122", "Password123");
    const foreignGpsRes = await foreignEntAgent
      .post(`/api/public/trace/${targetSignboard.qrToken}/verify-gps`)
      .send({ latitude: targetSignboard.centerLat, longitude: targetSignboard.centerLng });
    expect(foreignGpsRes.status).toBe(403);

    // 4. Kiểm nghiệm: Vàng O dương tính hoặc Cadimi vượt ngưỡng bị từ chối cứng (400) nếu gửi result: 'pass'
    const badPassLab = await inspector.post("/api/testing").send({
      code: "MK-YELLOWO-LOCK-019",
      householdId: 2,
      plotCode: "TH2-001",
      sampledOn: "2026-07-12",
      cdMgKg: 0.08,
      yellowOPositive: true,
      residueMgKg: 0.01,
      result: "pass",
      lab: "Vinacontrol",
    });
    expect(badPassLab.status).toBe(400);

    // 5. Vi phạm: Chặn gỡ householdId thành null khi PATCH vi phạm đã gắn hộ
    const violList = await inspector.get("/api/violations?pageSize=20");
    const linkedViolation = (violList.body.data as Array<{ id: number; householdId: number | null }>).find(
      (v) => v.householdId !== null,
    );
    if (linkedViolation) {
      const detachAttempt = await inspector
        .patch(`/api/violations/${linkedViolation.id}`)
        .send({ householdId: null });
      expect(detachAttempt.status).toBe(400);
    }

    // 6. Hộ nông dân có lịch sử nhật ký / tem / lô thu hoạch bị chặn xóa vĩnh viễn
    const deleteHhWithHistory = await admin.delete("/api/households/1");
    expect([400, 409]).toContain(deleteHhWithHistory.status);

    // 7. Ký tự NUL (\u0000) bị từ chối/loại bỏ an toàn ở tầng kiểm tra đầu vào (400/200), tuyệt đối không lọt xuống PostgreSQL gây lỗi 500
    const nulSearch = await htx.get(`/api/households?q=${encodeURIComponent("Nguyễn\u0000Văn")}`);
    expect([200, 400]).toContain(nulSearch.status);

    // 8. /api/health ẩn cảnh báo nội bộ với khách vãng lai và xóa tên người tạo khi hiển thị cho cán bộ
    const staffAlert = await admin.post("/api/system-alerts").send({
      severity: "warning",
      title: "Cảnh báo nội bộ cán bộ 019",
      message: "Chỉ hiển thị cho cán bộ nội bộ.",
      audience: "staff",
    });
    expect(staffAlert.status).toBe(201);
    const publicHealth = await request(app).get("/api/health");
    expect(publicHealth.status).toBe(200);
    expect(publicHealth.body.alert).toBeNull();

    const staffHealth = await htx.get("/api/health");
    expect(staffHealth.status).toBe(200);
    expect(staffHealth.body.alert?.id).toBe(staffAlert.body.id);
    expect(staffHealth.body.alert?.createdByName).toBeNull();
    expect(staffHealth.body.alert?.createdBy).toBeNull();

    expect((await admin.post(`/api/system-alerts/${staffAlert.body.id}/resolve`).send({})).status).toBe(200);
  });
});
