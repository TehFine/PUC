import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { DatabaseService } from "../src/database/database.service";
import {
  NotificationsService,
  type RealtimeStreamEvent,
} from "../src/notifications/notifications.service";
import { TEST_PASSWORD } from "./constants";

const USERS = {
  admin: "0901234567",
  htx: "0912345678",
  inspector: "0923456789",
  villageOfficer: "0934567890", // Thôn 1
  farmerAn: "0905123456", // Hộ Nguyễn Văn An (#1, Thôn 1)
};

const TINY_JPEG = Buffer.from(
  "ffd8ffdb004300" +
    "08".repeat(64) +
    "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000ffc40014100100000000000000000000000000000000ffda0008010100003f003fffd9",
  "hex",
);

let nest: INestApplication;
let app: Server;
let db: DatabaseService;
let notifications: NotificationsService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(instance);
  await instance.init();
  await new Promise<void>((resolve) => {
    const srv = instance.getHttpServer() as Server;
    if (srv.listening) {
      resolve();
      return;
    }
    srv.listen(0, "127.0.0.1", () => resolve());
  });
  nest = instance;
  app = instance.getHttpServer() as Server;
  db = instance.get(DatabaseService);
  notifications = instance.get(NotificationsService);
});

afterAll(async () => {
  await nest.close();
});

async function loggedIn(username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return { agent, user: res.body.user as { id: number; role: string; username: string } };
}

describe("luồng thông báo và đồng bộ pending thời gian thực (SSE Realtime)", () => {
  it("Trưởng HTX yêu cầu xóa thành viên -> Phó HTX nhận ngay qua SSE + Dashboard pendingDeletions, tự thu hồi khi xử lý xong", async () => {
    const { agent: admin } = await loggedIn(USERS.admin);
    let headId = 0;
    let deputyId = 0;
    let tempHhId = 0;

    try {
      const headRes = await admin.post("/api/accounts").send({
        fullName: "Trưởng HTX Realtime",
        username: "0977001122",
        password: "Password123",
        role: "htx_head",
      });
      expect(headRes.status).toBe(201);
      headId = Number(headRes.body.id);

      const deputyRes = await admin.post("/api/accounts").send({
        fullName: "Phó HTX Realtime",
        username: "0977001133",
        password: "Password123",
        role: "htx_deputy",
      });
      expect(deputyRes.status).toBe(201);
      deputyId = Number(deputyRes.body.id);

      const { agent: headAgent } = await loggedIn("0977001122", "Password123");
      const { agent: deputyAgent } = await loggedIn("0977001133", "Password123");

      const deputyEvents: RealtimeStreamEvent[] = [];
      const headEvents: RealtimeStreamEvent[] = [];
      const unsubDeputy = notifications.subscribeUserStream(deputyId, "htx_deputy", (ev) => {
        deputyEvents.push(ev);
      });
      const unsubHead = notifications.subscribeUserStream(headId, "htx_head", (ev) => {
        headEvents.push(ev);
      });

      try {
        const hhRes = await headAgent.post("/api/households").send({
          code: "KB-VT-001-HRT1",
          name: "Hộ Kiểm Thử Realtime Xóa",
          cccd: "260777888991",
          phone: "0977112233",
          villageId: 1,
          plotCount: 0,
          areaHa: 0,
        });
        expect(hhRes.status).toBe(201);
        tempHhId = Number(hhRes.body.id);

        deputyEvents.length = 0;
        headEvents.length = 0;

        // 1. Trưởng HTX bấm xóa thành viên -> Phó HTX nhận ngay sự kiện SSE notification
        const delRes = await headAgent.delete(`/api/households/${tempHhId}`);
        expect(delRes.status).toBe(200);
        expect(delRes.body.pendingApproval).toBe(true);
        const reqId = Number(delRes.body.request.id);

        const expectedLink = `/admin?section=system&sub=deletions&id=${reqId}`;
        const pushedToDeputy = deputyEvents.find(
          (e): e is Extract<RealtimeStreamEvent, { type: "notification" }> =>
            e.type === "notification" && e.item.link === expectedLink,
        );
        expect(pushedToDeputy).toBeDefined();
        expect(pushedToDeputy?.item.kind).toBe("approval");
        expect(pushedToDeputy?.item.readAt).toBeNull();

        // Dashboard của Phó HTX phản ánh ngay pendingDeletions >= 1
        const dashBefore = await deputyAgent.get("/api/dashboard/summary");
        expect(dashBefore.status).toBe(200);
        expect(Number(dashBefore.body.counts?.pendingDeletions)).toBeGreaterThanOrEqual(1);

        // 2. Nếu Phó HTX đã đọc thông báo mà chưa duyệt, khi Trưởng HTX gửi nhắc lại -> Phó HTX nhận lại thông báo mới tức thì
        await deputyAgent.post(`/api/notifications/${pushedToDeputy!.item.id}/read`);
        deputyEvents.length = 0;

        const repeatRes = await headAgent.delete(`/api/households/${tempHhId}`);
        expect(repeatRes.status).toBe(200);
        expect(repeatRes.body.alreadyPending).toBe(true);
        expect(
          deputyEvents.some(
            (e) => e.type === "notification" && e.item.link === expectedLink,
          ),
        ).toBe(true);

        // 3. Phó HTX phê duyệt -> tự động đánh dấu đã đọc thông báo pending (notifications-sync), báo ngược cho Trưởng HTX và giảm pendingDeletions
        deputyEvents.length = 0;
        headEvents.length = 0;
        const approveRes = await deputyAgent
          .post(`/api/deletion-requests/${reqId}/approve`)
          .send({ note: "Đồng thuận xóa hồ sơ thử nghiệm" });
        expect(approveRes.status).toBe(200);
        tempHhId = 0;

        expect(deputyEvents.some((e) => e.type === "notifications-sync")).toBe(true);
        expect(
          headEvents.some(
            (e) =>
              e.type === "notification" &&
              e.item.link === "/admin?section=system&sub=deletions" &&
              e.item.title.startsWith("Đã duyệt xóa"),
          ),
        ).toBe(true);

        const deputyListAfter = await deputyAgent.get("/api/notifications");
        const remainingUnread = (deputyListAfter.body.data as Array<{ link?: string; readAt?: string | null }>).filter(
          (n) => n.link === expectedLink && !n.readAt,
        );
        expect(remainingUnread).toHaveLength(0);
      } finally {
        unsubDeputy();
        unsubHead();
      }
    } finally {
      if (tempHhId) {
        await db.query("DELETE FROM member_deletion_requests WHERE target_type = 'household' AND target_id = $1", [
          tempHhId,
        ]);
        await db.query("DELETE FROM households WHERE id = $1", [tempHhId]);
      }
      if (headId || deputyId) {
        await db.query(
          "DELETE FROM member_deletion_requests WHERE requested_by = ANY($1::bigint[]) OR reviewed_by = ANY($1::bigint[]) OR (target_type = 'account' AND target_id = ANY($1::bigint[]))",
          [[headId, deputyId].filter(Boolean)],
        );
        await db.query("DELETE FROM notifications WHERE user_id = ANY($1::bigint[])", [
          [headId, deputyId].filter(Boolean),
        ]);
        await db.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [
          [headId, deputyId].filter(Boolean),
        ]);
      }
    }
  });

  it("nông hộ cập nhật trên cổng hộ dân -> cán bộ giám sát nhận SSE tức thì đúng phân quyền RBAC; nông hộ nhận SSE khi cán bộ xử lý", async () => {
    const [htxSession, villageSession, inspectorSession, farmerSession] = await Promise.all([
      loggedIn(USERS.htx),
      loggedIn(USERS.villageOfficer),
      loggedIn(USERS.inspector),
      loggedIn(USERS.farmerAn),
    ]);

    const htxEvents: RealtimeStreamEvent[] = [];
    const villageEvents: RealtimeStreamEvent[] = [];
    const farmerEvents: RealtimeStreamEvent[] = [];

    const unsubHtx = notifications.subscribeUserStream(htxSession.user.id, "htx_officer", (ev) =>
      htxEvents.push(ev),
    );
    const unsubVillage = notifications.subscribeUserStream(
      villageSession.user.id,
      "village_officer",
      (ev) => villageEvents.push(ev),
    );
    const unsubFarmer = notifications.subscribeUserStream(farmerSession.user.id, "farmer", (ev) =>
      farmerEvents.push(ev),
    );

    let createdApprovalId = 0;
    let createdDeclId = 0;
    let createdLabId = 0;
    let createdMinuteId = 0;
    let createdJournalId = 0;
    let registeredPendingUserId = 0;

    try {
      // 1a. Thao tác cá nhân (tùy chọn hiển thị tên trên QR) KHÔNG bắn thông báo chuông lên cán bộ / quản trị viên
      htxEvents.length = 0;
      villageEvents.length = 0;
      const consentRes = await farmerSession.agent
        .patch("/api/portal/profile/trace-consent")
        .send({ publicTraceConsent: true });
      expect(consentRes.status).toBe(200);
      expect(htxEvents.some((e) => e.type === "notification")).toBe(false);
      expect(villageEvents.some((e) => e.type === "notification")).toBe(false);

      // 1b. Nông hộ ghi nhật ký canh tác -> cả Cán bộ HTX và Cán bộ Thôn 1 nhận thông báo SSE tức thì
      const jPhotoRes = await farmerSession.agent
        .post("/api/uploads")
        .field("purpose", "journal")
        .attach("file", TINY_JPEG, "journal-rt.jpg");
      expect(jPhotoRes.status).toBe(201);
      const todayForJournal = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const journalRes = await farmerSession.agent.post("/api/portal/journal").send({
        entryOn: todayForJournal,
        plotCode: "TH1-001",
        activity: "Tưới nước giữ ẩm gốc",
        detail: "Kiểm thử thông báo realtime nhật ký",
        photoIds: [jPhotoRes.body.id],
      });
      expect(journalRes.status).toBe(201);
      createdJournalId = Number(journalRes.body.id);
      expect(
        htxEvents.some(
          (e) => e.type === "notification" && e.item.kind === "protocol" && e.item.link === "/admin?section=journal",
        ),
      ).toBe(true);
      expect(
        villageEvents.some(
          (e) => e.type === "notification" && e.item.kind === "protocol" && e.item.link === "/admin?section=journal",
        ),
      ).toBe(true);

      // 2. Nông hộ nộp khai báo sản lượng thu hoạch -> Cán bộ HTX nhận SSE, Cán bộ Thôn (không có quyền harvest:read) KHÔNG nhận
      htxEvents.length = 0;
      villageEvents.length = 0;
      const declRes = await farmerSession.agent.post("/api/portal/harvest-declarations").send({
        plotCode: "TH1-001",
        weightKg: 420,
        gradeAKg: 300,
        gradeBKg: 120,
        note: "Khai báo thu hái kiểm thử realtime",
      });
      expect(declRes.status).toBe(201);
      createdDeclId = Number(declRes.body.id);
      const declLink = `/admin?section=harvest&id=${createdDeclId}`;
      expect(
        htxEvents.some((e) => e.type === "notification" && e.item.link === declLink),
      ).toBe(true);
      expect(
        villageEvents.some((e) => e.type === "notification" && e.item.kind === "harvest"),
      ).toBe(false);

      // Nông hộ hủy khai báo thu hoạch -> tự động đẩy notifications-sync thu hồi trạng thái chưa đọc
      htxEvents.length = 0;
      const cancelDecl = await farmerSession.agent.delete(
        `/api/portal/harvest-declarations/${createdDeclId}`,
      );
      expect(cancelDecl.status).toBe(200);
      createdDeclId = 0;
      expect(htxEvents.some((e) => e.type === "notifications-sync")).toBe(true);

      // 3. Nông hộ gửi yêu cầu xét duyệt hồ sơ -> Cán bộ HTX nhận SSE; Cán bộ HTX duyệt -> Nông hộ nhận SSE tức thì
      htxEvents.length = 0;
      const appRes = await farmerSession.agent.post("/api/portal/approvals").send({
        requestType: "Đề nghị kiểm tra thửa trước thu hoạch",
        plotCode: "TH1-001",
        note: "Kiểm thử realtime hồ sơ",
      });
      expect(appRes.status).toBe(201);
      createdApprovalId = Number(appRes.body.id);
      const appLink = `/admin?section=approval&id=${createdApprovalId}`;
      expect(
        htxEvents.some((e) => e.type === "notification" && e.item.link === appLink),
      ).toBe(true);

      farmerEvents.length = 0;
      htxEvents.length = 0;
      const reviewRes = await htxSession.agent
        .post(`/api/approvals/${createdApprovalId}/approve`)
        .send({ note: "Đủ điều kiện kiểm tra" });
      expect(reviewRes.status).toBe(200);
      expect(htxEvents.some((e) => e.type === "notifications-sync")).toBe(true);
      expect(
        farmerEvents.some(
          (e) => e.type === "notification" && e.item.link === "/portal?tab=home",
        ),
      ).toBe(true);

      // 4. Nông hộ mới tự đăng ký tài khoản -> Cán bộ HTX nhận ngay thông báo pending tài khoản
      htxEvents.length = 0;
      const regPhone = "0966554433";
      await db.query("DELETE FROM users WHERE username = $1 AND status = 'pending'", [regPhone]);
      const regRes = await request(app).post("/api/auth/register").send({
        fullName: "Nông Hộ Đăng Ký Realtime",
        phone: regPhone,
        password: "Password123",
        villageId: 1,
        note: "Xin gắn mã hộ Thôn 1",
      });
      expect(regRes.status).toBe(201);
      const regPush = htxEvents.find(
        (e): e is Extract<RealtimeStreamEvent, { type: "notification" }> =>
          e.type === "notification" &&
          Boolean(e.item.link?.startsWith("/admin?section=approval&sub=registrations&id=")),
      );
      expect(regPush).toBeDefined();
      registeredPendingUserId = Number(regPush!.item.link!.split("id=")[1] || 0);

      // 5. Cán bộ kiểm tra tạo biên bản & xác thực phiếu kiểm nghiệm nháp -> Nông hộ nhận SSE notification + data-sync portal
      farmerEvents.length = 0;
      const photoUpload = await inspectorSession.agent
        .post("/api/uploads")
        .field("purpose", "inspection")
        .attach("file", TINY_JPEG, "minute-rt.jpg");
      expect(photoUpload.status).toBe(201);

      const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const minRes = await inspectorSession.agent.post("/api/minutes").send({
        code: `BB-RT-${Date.now().toString().slice(-6)}`,
        heldOn: todayIso,
        location: "Thôn 1",
        officer: "Kiểm tra viên Realtime",
        result: "pass",
        householdId: 1,
        plotCode: "TH1-001",
        photoIds: [photoUpload.body.id],
      });
      expect(minRes.status).toBe(201);
      createdMinuteId = Number(minRes.body.id);
      expect(
        farmerEvents.some(
          (e) => e.type === "notification" && e.item.link === "/portal?tab=inspection",
        ),
      ).toBe(true);

      const scanUpload = await inspectorSession.agent
        .post("/api/uploads")
        .field("purpose", "lab")
        .attach("file", TINY_JPEG, "lab-rt.jpg");
      expect(scanUpload.status).toBe(201);

      const draftLab = await inspectorSession.agent.post("/api/testing").send({
        code: `KN-RT-${Date.now().toString().slice(-6)}`,
        householdId: 1,
        plotCode: "TH1-001",
        sampledOn: todayIso,
        cdMgKg: 0.02,
        yellowOPositive: false,
        residueMgKg: 0.01,
        result: "pass",
        lab: "Trung tâm Kiểm nghiệm Vùng",
        recordStatus: "draft",
      });
      expect(draftLab.status).toBe(201);
      createdLabId = Number(draftLab.body.id);

      farmerEvents.length = 0;
      const verifyLab = await inspectorSession.agent.patch(`/api/testing/${createdLabId}`).send({
        recordStatus: "verified",
        scanAttachmentId: scanUpload.body.id,
      });
      expect(verifyLab.status).toBe(200);
      expect(
        farmerEvents.some(
          (e) => e.type === "notification" && e.item.kind === "lab",
        ),
      ).toBe(true);

      // Chờ 70ms để debounce data-sync (40ms) xả sự kiện tag 'portal' tới nông hộ
      await new Promise((r) => setTimeout(r, 80));
      expect(
        farmerEvents.some(
          (e) => e.type === "data-sync" && e.tags.includes("portal"),
        ),
      ).toBe(true);
    } finally {
      unsubHtx();
      unsubVillage();
      unsubFarmer();
      if (createdApprovalId) {
        await db.query("DELETE FROM approvals WHERE id = $1", [createdApprovalId]);
      }
      if (createdDeclId) {
        await db.query("DELETE FROM harvest_declarations WHERE id = $1", [createdDeclId]);
      }
      if (createdMinuteId) {
        await db.query("DELETE FROM inspection_minutes WHERE id = $1", [createdMinuteId]);
      }
      if (createdLabId) {
        await db.query("DELETE FROM lab_tests WHERE id = $1", [createdLabId]);
      }
      if (createdJournalId) {
        await db.query("DELETE FROM journal_entries WHERE id = $1", [createdJournalId]);
      }
      await db.query("UPDATE households SET public_trace_consent = false WHERE id = 1");
      if (registeredPendingUserId) {
        await db.query("DELETE FROM users WHERE id = $1 AND status = 'pending'", [
          registeredPendingUserId,
        ]);
      }
    }
  });

  it("endpoint HTTP GET /api/notifications/stream đẩy khung SSE tức thì không bị nén đệm", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "PUC-Realtime-SSE-Test/1.0")
      .send({ username: USERS.htx, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
    const rawCookies = loginRes.headers["set-cookie"];
    const cookieHeader = (Array.isArray(rawCookies) ? rawCookies : [String(rawCookies || "")])
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
    const htxUserId = Number(loginRes.body.user.id);

    const addr = app.address() as AddressInfo;
    const receivedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: addr.port,
          path: "/api/notifications/stream",
          method: "GET",
          headers: {
            Cookie: cookieHeader,
            "User-Agent": "PUC-Realtime-SSE-Test/1.0",
            "Accept-Encoding": "gzip, deflate",
            Accept: "text/event-stream",
          },
        },
        (res) => {
          try {
            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toContain("text/event-stream");
            expect(res.headers["content-encoding"]).toBe("identity");
            expect(res.headers["cache-control"]).toContain("no-transform");
          } catch (err) {
            req.destroy();
            reject(err);
            return;
          }

          let triggered = false;
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            receivedChunks.push(chunk);
            const joined = receivedChunks.join("");
            if (!triggered && joined.includes(": connected")) {
              triggered = true;
              void notifications.notifyUsers([htxUserId], {
                kind: "system",
                title: "Kiểm tra đẩy luồng SSE trực tiếp",
                body: "Khung SSE không bị giữ trong bộ đệm nén",
                link: "/admin?section=dashboard",
              });
            }
            if (joined.includes("Kiểm tra đẩy luồng SSE trực tiếp")) {
              req.destroy();
              resolve();
            }
          });
          res.on("error", () => {
            // destroy() sau khi nhận đủ dữ liệu có thể phát ECONNRESET
          });
        },
      );
      req.on("error", (err) => {
        if (receivedChunks.join("").includes("Kiểm tra đẩy luồng SSE trực tiếp")) {
          resolve();
          return;
        }
        reject(err);
      });
      req.end();
    });

    expect(receivedChunks.join("")).toContain('"type":"notification"');
  });

  it("đồng bộ tức thì trạng thái đã đọc giữa Chuông và từng Tab qua POST /api/notifications/read-batch, :id/read, read-all trên đa phiên SSE", async () => {
    const [adminTabA, adminTabB, otherStaff] = await Promise.all([
      loggedIn(USERS.admin),
      loggedIn(USERS.admin),
      loggedIn(USERS.htx),
    ]);
    const adminId = adminTabA.user.id;
    const otherId = otherStaff.user.id;

    const streamTabA: RealtimeStreamEvent[] = [];
    const streamTabB: RealtimeStreamEvent[] = [];
    const unsubA = notifications.subscribeUserStream(adminId, "admin", (ev) => streamTabA.push(ev));
    const unsubB = notifications.subscribeUserStream(adminId, "admin", (ev) => streamTabB.push(ev));

    const createdNotifIds: number[] = [];
    try {
      // 1. Khi có 2 thông báo Cấp quyền QR và 1 thông báo Hồ sơ đến -> cả 2 phiên mở của Admin đều nhận SSE đồng thời
      await notifications.notifyUsers([adminId], {
        kind: "approval",
        title: "Yêu cầu mở quyền xem QR (QR-SYNC-01)",
        body: "Đoàn kiểm tra đề nghị mở quyền xem lô SR-SYNC-01",
        link: "/admin?section=system&sub=trace-requests&id=99001",
      });
      await notifications.notifyUsers([adminId], {
        kind: "approval",
        title: "Yêu cầu mở quyền xem QR (QR-SYNC-02)",
        body: "Đoàn kiểm tra đề nghị mở quyền xem lô SR-SYNC-02",
        link: "/admin?section=system&sub=trace-requests&id=99002",
      });
      await notifications.notifyUsers([adminId], {
        kind: "approval",
        title: "Hồ sơ chờ duyệt đồng bộ (HS-SYNC-03)",
        body: "Đề nghị kiểm tra thửa trước thu hoạch",
        link: "/admin?section=approval&id=99003",
      });
      await notifications.notifyUsers([otherId], {
        kind: "approval",
        title: "Thông báo riêng của cán bộ khác",
        body: "Không được phép bị tài khoản khác đánh dấu đã đọc",
        link: "/admin?section=approval&id=99004",
      });

      const pushedItemsA = streamTabA
        .filter((e): e is Extract<RealtimeStreamEvent, { type: "notification" }> => e.type === "notification")
        .map((e) => e.item);
      const pushedItemsB = streamTabB
        .filter((e): e is Extract<RealtimeStreamEvent, { type: "notification" }> => e.type === "notification")
        .map((e) => e.item);

      expect(pushedItemsA.length).toBeGreaterThanOrEqual(3);
      expect(pushedItemsB.length).toBeGreaterThanOrEqual(3);

      const qr1 = pushedItemsA.find((n) => n.title.includes("QR-SYNC-01"))!;
      const qr2 = pushedItemsA.find((n) => n.title.includes("QR-SYNC-02"))!;
      const hs3 = pushedItemsA.find((n) => n.title.includes("HS-SYNC-03"))!;
      expect(qr1).toBeDefined();
      expect(qr2).toBeDefined();
      expect(hs3).toBeDefined();
      createdNotifIds.push(qr1.id, qr2.id, hs3.id);

      const otherListBefore = await otherStaff.agent.get("/api/notifications");
      const otherNotif = (otherListBefore.body.data as Array<{ id: number; title: string; readAt: string | null }>).find(
        (n) => n.title === "Thông báo riêng của cán bộ khác",
      )!;
      expect(otherNotif).toBeDefined();
      createdNotifIds.push(otherNotif.id);

      // 2. Chặn payload sai định dạng hoặc kèm trường lạ (whitelist + forbidNonWhitelisted) và chặn đánh dấu hộ người khác
      const invalidEmpty = await adminTabA.agent.post("/api/notifications/read-batch").send({ ids: [] });
      expect(invalidEmpty.status).toBe(400);

      const invalidExtra = await adminTabA.agent
        .post("/api/notifications/read-batch")
        .send({ ids: [qr1.id], userId: otherId });
      expect(invalidExtra.status).toBe(400);

      const crossUserAttempt = await adminTabA.agent
        .post("/api/notifications/read-batch")
        .send({ ids: [otherNotif.id] });
      expect(crossUserAttempt.status).toBe(200);
      expect(crossUserAttempt.body.updated).toBe(0);

      const otherListAfter = await otherStaff.agent.get("/api/notifications");
      const otherStillUnread = (
        otherListAfter.body.data as Array<{ id: number; readAt: string | null }>
      ).find((n) => n.id === otherNotif.id);
      expect(otherStillUnread?.readAt).toBeNull();

      // 3. Mở xem tab Cấp quyền QR trên Tab A -> gọi read-batch cho 2 thông báo QR -> cả Tab A và Tab B nhận ngay readIds qua SSE
      streamTabA.length = 0;
      streamTabB.length = 0;

      const batchRes = await adminTabA.agent
        .post("/api/notifications/read-batch")
        .send({ ids: [qr1.id, qr2.id] });
      expect(batchRes.status).toBe(200);
      expect(batchRes.body.updated).toBe(2);
      expect(batchRes.body.readIds).toEqual(expect.arrayContaining([qr1.id, qr2.id]));

      const syncA = streamTabA.find(
        (e): e is Extract<RealtimeStreamEvent, { type: "notifications-sync" }> => e.type === "notifications-sync",
      );
      const syncB = streamTabB.find(
        (e): e is Extract<RealtimeStreamEvent, { type: "notifications-sync" }> => e.type === "notifications-sync",
      );
      expect(syncA?.readIds).toEqual(expect.arrayContaining([qr1.id, qr2.id]));
      expect(syncB?.readIds).toEqual(expect.arrayContaining([qr1.id, qr2.id]));

      const listAfterQrTab = await adminTabB.agent.get("/api/notifications");
      const byId = new Map(
        (listAfterQrTab.body.data as Array<{ id: number; readAt: string | null }>).map((n) => [n.id, n]),
      );
      expect(byId.get(qr1.id)?.readAt).toBeTruthy();
      expect(byId.get(qr2.id)?.readAt).toBeTruthy();
      expect(byId.get(hs3.id)?.readAt).toBeNull();

      // 4. Bấm "Đọc hết" trên Chuông ở Tab B -> cả Tab A và Tab B nhận ngay readAll: true đồng thời, số chưa đọc về 0
      streamTabA.length = 0;
      streamTabB.length = 0;
      const readAllRes = await adminTabB.agent.post("/api/notifications/read-all");
      expect(readAllRes.status).toBe(200);

      const syncAllA = streamTabA.find(
        (e): e is Extract<RealtimeStreamEvent, { type: "notifications-sync" }> => e.type === "notifications-sync",
      );
      const syncAllB = streamTabB.find(
        (e): e is Extract<RealtimeStreamEvent, { type: "notifications-sync" }> => e.type === "notifications-sync",
      );
      expect(syncAllA?.readAll).toBe(true);
      expect(syncAllB?.readAll).toBe(true);

      const finalAdminList = await adminTabA.agent.get("/api/notifications");
      expect(finalAdminList.body.unread).toBe(0);
    } finally {
      unsubA();
      unsubB();
      if (createdNotifIds.length > 0) {
        await db.query("DELETE FROM notifications WHERE id = ANY($1::bigint[])", [createdNotifIds]);
      }
      await db.query("DELETE FROM notifications WHERE title = 'Thông báo riêng của cán bộ khác'");
    }
  });
});
