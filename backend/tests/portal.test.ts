import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { join, resolve } from "node:path";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import type { AppConfig } from "../src/config/configuration";
import { DatabaseService } from "../src/database/database.service";
import { NotificationsService, type RealtimeStreamEvent } from "../src/notifications/notifications.service";
import { UploadsService } from "../src/uploads/uploads.service";
import { TEST_PASSWORD } from "./constants";

const USERS = {
  admin: "0901234567",
  htx: "0912345678",
  inspector: "0923456789",
  farmerAn: "0905123456", // Hộ Nguyễn Văn An
  farmerBinh: "0912234567", // Hộ Trần Thị Bình
};

const TINY_JPEG = Buffer.from(
  "ffd8ffdb004300" +
    "08".repeat(64) +
    "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000ffc40014100100000000000000000000000000000000ffda0008010100003f003fffd9",
  "hex",
);
const TINY_PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii");

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

async function loggedIn(username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

async function uploadFile(
  agent: ReturnType<typeof request.agent>,
  purpose: string,
  buffer = TINY_JPEG,
  filename = "photo.jpg",
): Promise<number> {
  const res = await agent.post("/api/uploads").field("purpose", purpose).attach("file", buffer, filename);
  expect(res.status).toBe(201);
  expect(res.body.id).toEqual(expect.any(Number));
  return res.body.id as number;
}

describe("cổng hộ dân mở rộng (/api/portal/*)", () => {
  describe("overview, profile, plots", () => {
    it("overview trả thống kê, thông báo chưa đọc và danh sách nhắc việc", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const res = await an.get("/api/portal/overview");
      expect(res.status).toBe(200);
      expect(res.body.household).toMatchObject({
        code: "KB-VT-001-H001",
        name: "Nguyễn Văn An",
      });
      expect(res.body.stats).toEqual(
        expect.objectContaining({
          openViolations: expect.any(Number),
          pendingApprovals: expect.any(Number),
          journalLast30Days: expect.any(Number),
          harvestTotalKg: expect.any(Number),
          unreadNotifications: expect.any(Number),
        }),
      );
      expect(Array.isArray(res.body.reminders)).toBe(true);
      expect(res.body.reminders.length).toBeGreaterThan(0);
      expect(res.body.reminders[0]).toEqual(
        expect.objectContaining({
          kind: expect.any(String),
          title: expect.any(String),
          detail: expect.any(String),
          tab: expect.any(String),
        }),
      );
    });

    it("profile trả thông tin tài khoản và hộ với CCCD đã che", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const res = await an.get("/api/portal/profile");
      expect(res.status).toBe(200);
      expect(res.body.account).toMatchObject({
        fullName: "Nguyễn Văn An",
        username: USERS.farmerAn,
      });
      expect(res.body.household).toMatchObject({
        code: "KB-VT-001-H001",
        name: "Nguyễn Văn An",
        phone: USERS.farmerAn,
      });
      expect(res.body.household.cccdMasked).toMatch(/^\*{10}\d{2}$/);
      expect(res.body.household).not.toHaveProperty("cccd");
    });

    it("plots trả danh sách thửa và cờ available", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const res = await an.get("/api/portal/plots");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: expect.any(Array),
        available: expect.any(Boolean),
      });
    });
  });

  describe("journal + upload ảnh + xóa trong 24h", () => {
    it("bắt buộc có ảnh đúng mục đích của chính hộ và chỉ xóa được bản ghi tự tạo trong 24h", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const binh = await loggedIn(USERS.farmerBinh);

      // Thiếu photoId -> 400
      const noPhoto = await an.post("/api/portal/journal").send({
        plotCode: "TH1-001",
        activity: "Tưới nước",
      });
      expect(noPhoto.status).toBe(400);

      // Dùng ảnh sai mục đích (harvest thay vì journal) -> 400
      const harvestPhotoId = await uploadFile(an, "harvest");
      const wrongPurpose = await an.post("/api/portal/journal").send({
        plotCode: "TH1-001",
        activity: "Tưới nước",
        photoId: harvestPhotoId,
      });
      expect(wrongPurpose.status).toBe(400);

      // Dùng ảnh của hộ khác -> 400
      const binhPhotoId = await uploadFile(binh, "journal");
      const foreignPhoto = await an.post("/api/portal/journal").send({
        plotCode: "TH1-001",
        activity: "Tưới nước",
        photoId: binhPhotoId,
      });
      expect(foreignPhoto.status).toBe(400);

      // Tạo nhật ký hợp lệ kèm tọa độ GPS
      const photoId = await uploadFile(an, "journal");
      const created = await an.post("/api/portal/journal").send({
        plotCode: "TH1-001",
        activity: "Bón phân hữu cơ",
        detail: "15 kg/gốc",
        photoId,
        latitude: 12.885123,
        longitude: 108.234567,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        plotCode: "TH1-001",
        activity: "Bón phân hữu cơ",
        recorder: "Chủ hộ",
        hasPhoto: true,
        photoUrl: `/api/uploads/${photoId}`,
        latitude: 12.885123,
        longitude: 108.234567,
        canDelete: true,
      });

      // Chủ hộ tải được ảnh, hộ khác bị từ chối (404)
      expect((await an.get(`/api/uploads/${photoId}`)).status).toBe(200);
      expect((await binh.get(`/api/uploads/${photoId}`)).status).toBe(404);

      // Hộ khác không xóa được nhật ký của hộ An
      expect((await binh.delete(`/api/portal/journal/${created.body.id}`)).status).toBe(404);

      // Bản ghi có sẵn từ seed (không có ảnh của hộ / quá 24h) không xóa được
      const list = await an.get("/api/portal/journal");
      const seededEntry = list.body.data.find((j: { id: number; canDelete: boolean }) => !j.canDelete);
      if (seededEntry) {
        expect((await an.delete(`/api/portal/journal/${seededEntry.id}`)).status).toBe(403);
      }

      // Xóa bản ghi vừa tạo trong vòng 24h thành công
      const del = await an.delete(`/api/portal/journal/${created.body.id}`);
      expect(del.status).toBe(200);
      expect(del.body).toEqual({ ok: true });
    });
  });

  describe("spray + plotCode + nhắc việc cách ly", () => {
    it("lưu mã thửa khi ghi phun thuốc và hiện nhắc việc cách ly trên overview", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const pesticides = await an.get("/api/pesticides?pageSize=100");
      const allowed = pesticides.body.data.find((p: { status: string; isolationDays: number }) => p.status === "allowed" && p.isolationDays > 0);
      expect(allowed).toBeDefined();

      const created = await an.post("/api/portal/spray").send({
        pesticideId: allowed.id,
        dose: "0.6 lít/ha",
        areaHa: 1.2,
        source: "Cửa hàng VTNN HTX",
        plotCode: "TH1-002",
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        pesticideId: allowed.id,
        plotCode: "TH1-002",
        mrlStatus: "pass",
      });

      const list = await an.get("/api/portal/spray");
      expect(list.status).toBe(200);
      expect(list.body.data.some((s: { id: number; plotCode: string }) => s.id === created.body.id && s.plotCode === "TH1-002")).toBe(true);

      const overview = await an.get("/api/portal/overview");
      expect(overview.body.reminders.some((r: { kind: string }) => r.kind === "isolation")).toBe(true);
    });
  });

  describe("inspection & phản hồi vi phạm", () => {
    it("vi phạm nhật ký: chưa ghi nhật ký mới đúng thửa thì không báo khắc phục được; ghi xong mới gửi phản hồi", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const binh = await loggedIn(USERS.farmerBinh);

      // Vi phạm riêng cho test, trên một mã thửa chưa có nhật ký nào (CSDL test dùng chung giữa các suite)
      const PLOT = "TH1-VP99";
      const household = await db.query<{ household_id: number }>("SELECT household_id FROM users WHERE username = $1", [
        USERS.farmerAn,
      ]);
      const inserted = await db.query<{ id: number }>(
        `INSERT INTO violations (severity, title, household_label, household_id, detected_on, plot_code, description)
         VALUES ('warning', 'Nhật ký canh tác chưa cập nhật 7+ ngày', 'Nguyễn Văn An', $1, current_date, $2, 'Test')
         RETURNING id`,
        [household.rows[0].household_id, PLOT],
      );
      const violationId = inserted.rows[0].id;

      const violations = await an.get("/api/portal/violations");
      expect(violations.status).toBe(200);
      const openViolation = violations.body.data.find((v: { id: number }) => v.id === violationId);
      expect(openViolation).toMatchObject({ status: "open", isJournalViolation: true, plotCode: PLOT, lastJournalOn: null });

      // 1. Bấm "đã khắc phục" khi chưa ghi nhật ký mới kể từ ngày phát hiện -> 409
      const premature = await an.post(`/api/portal/violations/${openViolation.id}/response`).send({
        note: "Đã khắc phục",
      });
      expect(premature.status).toBe(409);
      expect(premature.body.error).toContain(`Chưa có nhật ký mới cho thửa ${PLOT}`);

      // 2. Ghi nhật ký cho thửa KHÁC không được tính là khắc phục
      const otherPhotoId = await uploadFile(an, "journal");
      const otherPlot = await an.post("/api/portal/journal").send({
        plotCode: "TH1-002",
        activity: "Làm cỏ",
        photoId: otherPhotoId,
      });
      expect(otherPlot.status).toBe(201);
      const stillBlocked = await an.post(`/api/portal/violations/${openViolation.id}/response`).send({
        note: "Đã khắc phục",
      });
      expect(stillBlocked.status).toBe(409);

      // 3. Ghi nhật ký đúng thửa vi phạm -> cán bộ thấy bằng chứng, hộ gửi được phản hồi kèm ảnh
      const journalPhotoId = await uploadFile(an, "journal");
      const journal = await an.post("/api/portal/journal").send({
        plotCode: PLOT,
        activity: "Bón phân hữu cơ",
        photoId: journalPhotoId,
      });
      expect(journal.status).toBe(201);

      const photoId = await uploadFile(an, "violation");
      const res = await an.post(`/api/portal/violations/${openViolation.id}/response`).send({
        note: "Đã bổ sung nhật ký canh tác đầy đủ và dọn vệ sinh đồng ruộng.",
        photoId,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: openViolation.id,
        farmerResponse: "Đã bổ sung nhật ký canh tác đầy đủ và dọn vệ sinh đồng ruộng.",
        farmerResponsePhotoUrl: `/api/uploads/${photoId}`,
        status: "open", // hộ không tự đóng được vi phạm, phải chờ cán bộ xác nhận
      });
      expect(res.body.farmerResponseAt).toBeTruthy();
      expect(res.body.lastJournalOn >= res.body.detectedOn).toBe(true);

      // Hộ khác không phản hồi được vi phạm của hộ An
      const cross = await binh.post(`/api/portal/violations/${openViolation.id}/response`).send({
        note: "Phản hồi chéo",
      });
      expect(cross.status).toBe(404);

      // Cán bộ thấy cờ đối chiếu nhật ký khi xem vi phạm
      const htx = await loggedIn(USERS.htx);
      const adminView = await htx.get(`/api/violations/${openViolation.id}`);
      expect(adminView.status).toBe(200);
      expect(adminView.body.isJournalViolation).toBe(true);
      expect(adminView.body.lastJournalOn >= adminView.body.detectedOn).toBe(true);

      // Kiểm tra thông báo gửi tới kiểm tra viên
      const inspector = await loggedIn(USERS.inspector);
      const notifs = await inspector.get("/api/notifications");
      expect(notifs.status).toBe(200);
      expect(notifs.body.data.some((n: { kind: string }) => n.kind === "violation")).toBe(true);

      // Dọn: xóa 2 nhật ký vừa tạo (trong 24h) và vi phạm của test để không ảnh hưởng các test khác
      expect((await an.delete(`/api/portal/journal/${otherPlot.body.id}`)).status).toBe(200);
      expect((await an.delete(`/api/portal/journal/${journal.body.id}`)).status).toBe(200);
      await db.query("DELETE FROM violations WHERE id = $1", [violationId]);
    });
  });

  describe("harvest & harvest-declarations", () => {
    it("kiểm tra A + B <= tổng sản lượng, không cho ngày tương lai, tạo và xóa khai báo submitted", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const binh = await loggedIn(USERS.farmerBinh);

      const harvest = await an.get("/api/portal/harvest");
      expect(harvest.status).toBe(200);
      expect(harvest.body.data.length).toBeGreaterThan(0);

      // A + B > weightKg -> 400
      const invalidSum = await an.post("/api/portal/harvest-declarations").send({
        plotCode: "TH1-001",
        weightKg: 500,
        gradeAKg: 350,
        gradeBKg: 200,
      });
      expect(invalidSum.status).toBe(400);

      // Ngày ở tương lai -> 400
      const future = await an.post("/api/portal/harvest-declarations").send({
        plotCode: "TH1-001",
        harvestedOn: "2999-12-31",
        weightKg: 500,
        gradeAKg: 300,
        gradeBKg: 150,
      });
      expect(future.status).toBe(400);

      // Tạo khai báo hợp lệ kèm ảnh
      const photoId = await uploadFile(an, "harvest");
      const created = await an.post("/api/portal/harvest-declarations").send({
        plotCode: "TH1-001",
        weightKg: 600,
        gradeAKg: 450,
        gradeBKg: 150,
        qualityRating: "Loại 1 (VIP)",
        note: "Quả chín đều, độ Brix cao",
        photoId,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        plotCode: "TH1-001",
        weightKg: 600,
        gradeAKg: 450,
        gradeBKg: 150,
        status: "submitted",
        photoUrl: `/api/uploads/${photoId}`,
      });

      const list = await an.get("/api/portal/harvest-declarations");
      expect(list.status).toBe(200);
      expect(list.body.data.some((d: { id: number }) => d.id === created.body.id)).toBe(true);

      // Hộ khác không xóa được
      expect((await binh.delete(`/api/portal/harvest-declarations/${created.body.id}`)).status).toBe(404);

      // Khi đã được xác nhận (confirmed) thì không xóa được (400)
      await db.query("UPDATE harvest_declarations SET status = 'confirmed' WHERE id = $1", [created.body.id]);
      expect((await an.delete(`/api/portal/harvest-declarations/${created.body.id}`)).status).toBe(400);

      // Đổi lại submitted thì xóa được
      await db.query("UPDATE harvest_declarations SET status = 'submitted' WHERE id = $1", [created.body.id]);
      const deleted = await an.delete(`/api/portal/harvest-declarations/${created.body.id}`);
      expect(deleted.status).toBe(200);
      expect(deleted.body).toEqual({ ok: true });
    });
  });

  describe("stamps (danh sách & kích hoạt nguyên tử)", () => {
    it("kích hoạt tem hợp lệ, chặn kích hoạt lại (400) và trả cùng 404 khi tem không tồn tại hoặc thuộc hộ khác", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const binh = await loggedIn(USERS.farmerBinh);

      const initial = await an.get("/api/portal/stamps");
      expect(initial.status).toBe(200);
      expect(initial.body.stats.totalAllocated).toBeGreaterThanOrEqual(10);
      expect(initial.body.stats).toMatchObject({
        totalActivated: 3,
        remaining: 7,
      });
      expect(initial.body.allocations.length).toBeGreaterThan(0);
      expect(initial.body.stamps.length).toBeGreaterThanOrEqual(10);

      // Kiểm tra giới hạn khối lượng quả (0 < x <= 15) và hạng A|B|C
      expect(
        (
          await an.post("/api/portal/stamps/activate").send({
            serialCode: "KB-H001-000004",
            plotCode: "TH1-001",
            fruitWeightKg: 20,
            grade: "A",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await an.post("/api/portal/stamps/activate").send({
            serialCode: "KB-H001-000004",
            plotCode: "TH1-001",
            fruitWeightKg: 3.5,
            grade: "D",
          })
        ).status,
      ).toBe(400);

      // Hộ Bình kích hoạt tem của hộ An -> 404 với thông báo giống hệt mã tem không tồn tại
      const crossHousehold = await binh.post("/api/portal/stamps/activate").send({
        serialCode: "KB-H001-000004",
        plotCode: "TH2-001",
        fruitWeightKg: 3.5,
        grade: "A",
      });
      const nonExistent = await binh.post("/api/portal/stamps/activate").send({
        serialCode: "KB-KHONG-TON-TAI-999",
        plotCode: "TH2-001",
        fruitWeightKg: 3.5,
        grade: "A",
      });
      expect(crossHousehold.status).toBe(404);
      expect(nonExistent.status).toBe(404);
      expect(crossHousehold.body).toEqual(nonExistent.body);

      // Hộ An kích hoạt tem KB-H001-000004 kèm ảnh
      const photoId = await uploadFile(an, "stamp");
      const activated = await an.post("/api/portal/stamps/activate").send({
        serialCode: "kb-h001-000004", // không phân biệt hoa thường
        plotCode: "TH1-001",
        fruitWeightKg: 3.7,
        grade: "A",
        photoId,
      });
      expect(activated.status).toBe(201);
      expect(activated.body).toMatchObject({
        serialCode: "KB-H001-000004",
        plotCode: "TH1-001",
        status: "activated",
        fruitWeightKg: 3.7,
        grade: "A",
        photoUrl: `/api/uploads/${photoId}`,
      });

      // Kích hoạt lại cùng mã tem -> 400
      const doubleActivate = await an.post("/api/portal/stamps/activate").send({
        serialCode: "KB-H001-000004",
        plotCode: "TH1-001",
        fruitWeightKg: 3.7,
        grade: "A",
      });
      expect(doubleActivate.status).toBe(400);
    });
  });

  describe("requests / approvals (đính kèm tệp & hủy yêu cầu)", () => {
    it("tạo hồ sơ kèm tệp đính kèm (PDF + ảnh), tính đúng docsCount và cho phép hủy khi pending", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const binh = await loggedIn(USERS.farmerBinh);

      const pdfId = await uploadFile(an, "approval", TINY_PDF, "ho-so.pdf");
      const jpgId = await uploadFile(an, "approval", TINY_JPEG, "anh-vuon.jpg");

      const created = await an.post("/api/portal/approvals").send({
        requestType: "Cấp mã số vùng trồng bổ sung",
        note: "Đề nghị thẩm định thửa mới trồng năm 2021",
        plotCode: "TH1-002",
        attachmentIds: [pdfId, jpgId],
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        requestType: "Cấp mã số vùng trồng bổ sung",
        note: "Đề nghị thẩm định thửa mới trồng năm 2021",
        plotCode: "TH1-002",
        docsCount: 2,
        status: "pending",
      });
      expect(created.body.attachments).toHaveLength(2);
      expect(created.body.attachments[0]).toEqual(
        expect.objectContaining({
          id: pdfId,
          url: `/api/uploads/${pdfId}`,
          mimeType: "application/pdf",
          originalName: "ho-so.pdf",
        }),
      );

      const list = await an.get("/api/portal/approvals");
      expect(list.status).toBe(200);
      const found = list.body.data.find((a: { id: number }) => a.id === created.body.id);
      expect(found).toBeDefined();
      expect(found.attachments).toHaveLength(2);

      // Hộ khác không hủy được
      expect((await binh.post(`/api/portal/approvals/${created.body.id}/cancel`)).status).toBe(404);

      // Chủ hộ hủy thành công khi đang pending
      const cancelled = await an.post(`/api/portal/approvals/${created.body.id}/cancel`);
      expect(cancelled.status).toBe(201);
      expect(cancelled.body.status).toBe("cancelled");

      // Hủy lần nữa -> 400
      expect((await an.post(`/api/portal/approvals/${created.body.id}/cancel`)).status).toBe(400);
    });
  });

  describe("training (đăng ký, hủy đăng ký, giới hạn sĩ số)", () => {
    it("đăng ký, hủy đăng ký cập nhật sĩ số nguyên tử và từ chối khi lớp đã đầy hoặc đã kết thúc", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const binh = await loggedIn(USERS.farmerBinh);

      const initial = await an.get("/api/portal/training");
      expect(initial.status).toBe(200);
      const openCourse = initial.body.data.find((c: { completed: boolean; myStatus: string | null; enrolled: number; capacity: number }) => !c.completed && c.myStatus === null && c.enrolled < c.capacity);
      expect(openCourse).toBeDefined();

      // Đăng ký tham gia
      const reg = await an.post(`/api/portal/training/${openCourse.id}/register`);
      expect(reg.status).toBe(201);
      expect(reg.body).toMatchObject({
        id: openCourse.id,
        enrolled: openCourse.enrolled + 1,
        myStatus: "registered",
      });

      // Đăng ký trùng -> 400
      expect((await an.post(`/api/portal/training/${openCourse.id}/register`)).status).toBe(400);

      // Hủy đăng ký
      const cancel = await an.post(`/api/portal/training/${openCourse.id}/cancel`);
      expect(cancel.status).toBe(201);
      expect(cancel.body).toMatchObject({
        id: openCourse.id,
        enrolled: openCourse.enrolled,
        myStatus: "cancelled",
      });

      // Hủy lần nữa khi không còn ở trạng thái registered -> 400
      expect((await an.post(`/api/portal/training/${openCourse.id}/cancel`)).status).toBe(400);

      // Đăng ký lại sau khi đã hủy -> thành công
      const rereg = await an.post(`/api/portal/training/${openCourse.id}/register`);
      expect(rereg.status).toBe(201);
      expect(rereg.body).toMatchObject({
        id: openCourse.id,
        enrolled: openCourse.enrolled + 1,
        myStatus: "registered",
      });

      // Lớp đã kết thúc -> từ chối đăng ký (400)
      const completedCourse = initial.body.data.find((c: { completed: boolean }) => c.completed);
      if (completedCourse) {
        expect((await an.post(`/api/portal/training/${completedCourse.id}/register`)).status).toBe(400);
      }

      // Kiểm tra giới hạn sĩ số (capacity): tạo lớp chỉ có 1 chỗ
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO training_courses (title, held_on, location, trainer, enrolled, capacity, completed, starts_at, ends_at, description)
         VALUES ('Lớp thực hành giới hạn chỗ', current_date + 2, 'Hội trường HTX', 'KS. Trần Thực Hành', 0, 1, false, '08:00', '11:30', 'Thực hành tại vườn')
         RETURNING id`,
      );
      const limitedId = rows[0].id;

      const firstReg = await an.post(`/api/portal/training/${limitedId}/register`);
      expect(firstReg.status).toBe(201);
      expect(firstReg.body).toMatchObject({
        id: limitedId,
        enrolled: 1,
        capacity: 1,
        startsAt: "08:00",
        endsAt: "11:30",
        myStatus: "registered",
      });

      // Hộ thứ hai đăng ký khi lớp đã đủ chỗ -> 400
      const fullRes = await binh.post(`/api/portal/training/${limitedId}/register`);
      expect(fullRes.status).toBe(400);
    });
  });

  describe("timeline quy trình chăm sóc 2026-2027 & cảnh báo kép (hộ dân + quản trị)", () => {
    it("tự khởi tạo đủ 27 mốc + 3 quy tắc SenPro, bắt buộc ảnh hóa đơn, tự ghi nhật ký SHA-256 và báo giai đoạn tiếp theo", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const admin = await loggedIn(USERS.admin);

      const initRes = await an.get("/api/portal/care-protocol");
      expect(initRes.status).toBe(200);
      expect(initRes.body.season).toBe("2026-2027");
      expect(initRes.body.senProRules).toHaveLength(3);
      expect(initRes.body.plans.length).toBeGreaterThan(0);

      const firstPlan = initRes.body.plans[0];
      expect(firstPlan.milestones).toHaveLength(27);
      const plotCode: string = firstPlan.plotCode;

      // Đồng bộ thửa vườn sang mốc Nuôi trái Ngày 37 tuổi trái (bắt buộc ảnh hóa đơn vật tư)
      const todayRes = await db.query<{ d: string }>(
        "SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS d",
      );
      const todayStr = todayRes.rows[0].d;

      const cfgRes = await an.post("/api/portal/care-protocol/configure").send({
        plotCode,
        mode: "current_milestone",
        milestoneCode: "nt-ngay-37",
        anchorDate: todayStr,
        note: "Đồng bộ giai đoạn nuôi trái trứng gà",
      });
      expect(cfgRes.status).toBe(200);
      expect(cfgRes.body.currentMilestoneCode).toBe("nt-ngay-37");

      const fieldPhotoId = await uploadFile(an, "journal");

      // Thiếu ảnh hóa đơn vật tư ở mốc có sử dụng phân thuốc -> 400
      const missingInvoice = await an.post("/api/portal/care-protocol/declare").send({
        plotCode,
        milestoneCode: "nt-ngay-37",
        performedOn: todayStr,
        actualTreeState: "Trái to hơn trứng gà",
        followedStandard: true,
        selectedProducts: ["Bloom", "Amino Ca+"],
        actualDosage: "Phun tỷ lệ 1:400",
        fieldPhotoId,
      });
      expect(missingInvoice.status).toBe(400);

      // Khai báo chuẩn có đủ ảnh hiện trường + ảnh hóa đơn -> thành công, tự lưu journal SHA-256 & báo mốc kế tiếp
      const invoicePhotoId = await uploadFile(an, "journal");
      const okDecl = await an.post("/api/portal/care-protocol/declare").send({
        plotCode,
        milestoneCode: "nt-ngay-37",
        performedOn: todayStr,
        actualTreeState: "Trái to hơn trứng gà",
        followedStandard: true,
        selectedProducts: ["Bloom", "Amino Ca+"],
        actualDosage: "Phun tỷ lệ 1:400",
        supplierName: "VTNN HTX Cư Né",
        fieldPhotoId,
        invoicePhotoId,
      });
      expect(okDecl.status).toBe(201);
      expect(okDecl.body.complianceStatus).toBe("compliant");
      expect(okDecl.body.nextMilestone).toMatchObject({
        code: "nt-ngay-45",
        stageOrder: "06",
      });
      expect(okDecl.body.plan.currentMilestoneCode).toBe("nt-ngay-45");

      const completedItem = okDecl.body.plan.milestones.find((m: { code: string }) => m.code === "nt-ngay-37");
      expect(completedItem?.declaration?.journalRecordHash).toMatch(/^[a-f0-9]{64}$/);
      expect(completedItem?.declaration?.fieldPhotoUrl).toContain("/api/uploads/");
      expect(completedItem?.declaration?.invoicePhotoUrl).toContain("/api/uploads/");

      // Kiểm tra thông báo mốc tiếp theo đã được gửi tới hộ dân
      const farmerNotifs = await an.get("/api/notifications");
      expect(farmerNotifs.status).toBe(200);
      expect(
        farmerNotifs.body.data.some(
          (n: { kind: string; title: string }) =>
            n.kind === "protocol" && n.title.includes("Ngày 45 tuổi trái"),
        ),
      ).toBe(true);

      // Khai báo SAI QUY TRÌNH (dùng Kali đỏ KCl trong giai đoạn nuôi trái) -> Cảnh báo tới cả Hộ dân & Quản trị viên
      const fPhoto2 = await uploadFile(an, "journal");
      const iPhoto2 = await uploadFile(an, "journal");
      const wrongDecl = await an.post("/api/portal/care-protocol/declare").send({
        plotCode,
        milestoneCode: "nt-ngay-45",
        performedOn: todayStr,
        actualTreeState: "Trái bằng nắm tay",
        followedStandard: true,
        selectedProducts: ["Brixup", "Kali Bo", "Magic One", "K2SO4 (Kali Sunfat)", "MgSO4 (Magie Sunfat)"],
        actualDosage: "500 ml Brixup / 200L",
        extraInputs: "Bón thêm Kali đỏ KCl 1kg/gốc",
        fieldPhotoId: fPhoto2,
        invoicePhotoId: iPhoto2,
      });
      expect(wrongDecl.status).toBe(201);
      expect(wrongDecl.body.complianceStatus).toBe("violation");
      expect(wrongDecl.body.complianceIssues.length).toBeGreaterThan(0);

      const farmerNotifsAfterWrong = await an.get("/api/notifications");
      expect(
        farmerNotifsAfterWrong.body.data.some(
          (n: { kind: string; title: string }) =>
            n.kind === "violation" && n.title.includes("Cảnh báo sai quy trình"),
        ),
      ).toBe(true);

      const adminNotifsAfterWrong = await admin.get("/api/notifications");
      expect(adminNotifsAfterWrong.status).toBe(200);
      expect(
        adminNotifsAfterWrong.body.data.some(
          (n: { kind: string; title: string }) =>
            n.kind === "violation" && n.title.includes("thực hiện sai phác đồ"),
        ),
      ).toBe(true);

      // Rà soát quá hạn kéo dài (>= 5 ngày chưa thực hiện) -> cảnh báo kép & chống trùng lặp
      await db.query(
        `UPDATE plot_care_plans
         SET cycle_start_on = ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 300)
         WHERE id = $1`,
        [firstPlan.id],
      );

      const scan1 = await admin.post("/api/care-protocol/scan").send({});
      expect(scan1.status).toBe(200);
      expect(scan1.body.criticalViolations).toBeGreaterThanOrEqual(1);

      const scan2 = await admin.post("/api/care-protocol/scan").send({});
      expect(scan2.status).toBe(200);
      expect(scan2.body.criticalViolations).toBe(0);

      // Admin xem danh sách & chi tiết minh chứng lộ trình
      const adminList = await admin.get("/api/care-protocol?state=deviated");
      expect(adminList.status).toBe(200);
      expect(adminList.body.data.some((p: { id: number }) => p.id === firstPlan.id)).toBe(true);

      const adminDetail = await admin.get(`/api/care-protocol/${firstPlan.id}`);
      expect(adminDetail.status).toBe(200);
      expect(adminDetail.body.milestones).toHaveLength(27);
    });

    it("hỗ trợ tải nhiều ảnh WebP + video hiện trường (MP4/MOV) cho nhật ký canh tác và khai báo mốc quy trình", async () => {
      const binh = await loggedIn(USERS.farmerBinh);
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

      const tinyWebp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x18, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
        0x0b, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
        0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0x08,
      ]);
      const tinyQuicktimeMov = Buffer.from([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
        0x71, 0x74, 0x20, 0x20, 0x00, 0x00, 0x02, 0x00,
        0x71, 0x74, 0x20, 0x20, 0x69, 0x73, 0x6f, 0x6d,
        0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x00,
      ]);

      const plotsRes = await binh.get("/api/portal/plots");
      const plotCode: string = plotsRes.body.data?.[0]?.code ?? "CN-T2-01";

      const jImg1 = await uploadFile(binh, "journal", tinyWebp, "goc-cay-1.webp");
      const jImg2 = await uploadFile(binh, "journal", tinyWebp, "tan-la-2.webp");
      const jVid = await uploadFile(binh, "journal", tinyQuicktimeMov, "quay-vuon.mov");

      const createdJournal = await binh.post("/api/portal/journal").send({
        entryOn: todayStr,
        plotCode,
        activity: "Tỉa cành tạo tán",
        detail: "Đính kèm 2 ảnh WebP và 1 video ngắn",
        photoIds: [jVid, jImg1, jImg2],
      });
      expect(createdJournal.status).toBe(201);
      // Ưu tiên ảnh chụp làm ảnh đại diện photoUrl, đồng thời giữ đủ 3 tệp trong photoUrls
      expect(createdJournal.body.photoUrl).toBe(`/api/uploads/${jImg1}`);
      expect(createdJournal.body.photoUrls).toEqual([
        `/api/uploads/${jVid}/video.mp4`,
        `/api/uploads/${jImg1}`,
        `/api/uploads/${jImg2}`,
      ]);

      // Đường dẫn có hậu tố /video.mp4 hỗ trợ HTTP Range (206) và xác thực ETag (304)
      const videoRange = await binh.get(`/api/uploads/${jVid}/video.mp4`).set("Range", "bytes=0-15");
      expect(videoRange.status).toBe(206);
      expect(videoRange.headers["cache-control"]).toBe("private, no-cache");
      const videoEtag = videoRange.headers["etag"];
      const videoReval = await binh.get(`/api/uploads/${jVid}/video.mp4`).set("If-None-Match", videoEtag);
      expect(videoReval.status).toBe(304);

      // Ghi nhận phun thuốc BVTV kèm nhiều ảnh hiện trường / nhãn bao bì và ghi chú trong luồng gộp
      const pestList = await binh.get("/api/pesticides?pageSize=20");
      const allowedPest = (pestList.body.data as Array<{ id: number; status: string }>).find((p) => p.status === "allowed");
      expect(allowedPest).toBeDefined();
      const sImg1 = await uploadFile(binh, "journal", tinyWebp, "phun-thuoc-1.webp");
      const sImg2 = await uploadFile(binh, "journal", tinyWebp, "nhan-thuoc-2.webp");
      const createdSpray = await binh.post("/api/portal/spray").send({
        sprayedOn: todayStr,
        plotCode,
        pesticideId: allowedPest!.id,
        dose: "25 ml / bình 20L",
        areaHa: 0.6,
        note: "Phun phòng rầy xanh lúc sáng sớm",
        photoIds: [sImg1, sImg2],
      });
      expect(createdSpray.status).toBe(201);
      expect(createdSpray.body.note).toBe("Phun phòng rầy xanh lúc sáng sớm");
      expect(createdSpray.body.photoUrl).toBe(`/api/uploads/${sImg1}`);
      expect(createdSpray.body.photoUrls).toEqual([
        `/api/uploads/${sImg1}`,
        `/api/uploads/${sImg2}`,
      ]);

      // Khai báo phụ lục đọt SenPro kèm nhiều ảnh hiện trường + video + nhiều ảnh hóa đơn
      const pField1 = await uploadFile(binh, "journal", tinyWebp, "dot-senpro-1.webp");
      const pField2 = await uploadFile(binh, "journal", tinyWebp, "dot-senpro-2.webp");
      const pFieldVid = await uploadFile(binh, "journal", tinyQuicktimeMov, "dot-senpro.mov");
      const pInv1 = await uploadFile(binh, "journal", tinyWebp, "hoa-don-1.webp");
      const pInv2 = await uploadFile(binh, "journal", tinyWebp, "nhan-chai-2.webp");

      const senProRes = await binh.post("/api/portal/care-protocol/declare").send({
        plotCode,
        milestoneCode: "senpro-duoi-tom",
        performedOn: todayStr,
        actualTreeState: "Đuôi tôm",
        followedStandard: true,
        selectedProducts: ["SenPro"],
        actualDosage: "Pha SenPro tỷ lệ 1:300",
        fieldPhotoIds: [pField1, pField2, pFieldVid],
        invoicePhotoIds: [pInv1, pInv2],
      });
      expect(senProRes.status).toBe(201);
      const latestSenPro = senProRes.body.plan.senProDeclarations[0];
      expect(latestSenPro.fieldPhotoUrls).toEqual([
        `/api/uploads/${pField1}`,
        `/api/uploads/${pField2}`,
        `/api/uploads/${pFieldVid}/video.mp4`,
      ]);
      expect(latestSenPro.invoicePhotoUrls).toEqual([
        `/api/uploads/${pInv1}`,
        `/api/uploads/${pInv2}`,
      ]);
    });

    it("ghi nhận đồng thời ngày thực làm + thời điểm khai báo thực tế, tính số ngày chậm, tự căn chỉnh lịch và nhắc sớm đợt sau", async () => {
      const binh = await loggedIn(USERS.farmerBinh);
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
      const addDays = (iso: string, offset: number) => {
        const [y, m, d] = iso.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d + offset));
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
      };

      const threeDaysAgo = addDays(todayStr, -3);
      const twoDaysAgo = addDays(todayStr, -2);

      const plotsRes = await binh.get("/api/portal/plots");
      const plotCode: string = plotsRes.body.data?.[0]?.code ?? "CN-T2-01";

      // Đồng bộ vườn về mốc Ngày 0 (Cơi đọt 1) mở cách đây 4 ngày
      const syncRes = await binh.post("/api/portal/care-protocol/configure").send({
        plotCode,
        mode: "current_milestone",
        milestoneCode: "cd1-ngay-0",
        anchorDate: addDays(todayStr, -4),
      });
      expect(syncRes.status).toBe(200);

      const fPhoto = await uploadFile(binh, "journal");
      const iPhoto = await uploadFile(binh, "journal");

      // Hộ thực làm từ 3 ngày trước (threeDaysAgo), hôm nay (todayStr) mới vào khai báo bù
      const lateDecl = await binh.post("/api/portal/care-protocol/declare").send({
        plotCode,
        milestoneCode: "cd1-ngay-0",
        performedOn: threeDaysAgo,
        actualTreeState: "Lá già sẵn sàng kích rễ",
        followedStandard: true,
        selectedProducts: ["Amino X", "Magic One"],
        actualDosage: "25-30L/gốc tỷ lệ 1:1000",
        fieldPhotoIds: [fPhoto],
        invoicePhotoIds: [iPhoto],
        lateReason: "Mưa lớn trên rẫy nên về nhà mới gửi khai báo",
      });
      expect(lateDecl.status).toBe(201);
      expect(lateDecl.body.declarationTiming).toMatchObject({
        performedOn: threeDaysAgo,
        declaredOn: todayStr,
        lateDeclarationDays: 3,
        nextReminderLeadDays: 3,
      });

      // Mốc tiếp theo (cd1-ngay-7: +7 ngày từ cd1-ngay-0) phải tính đúng từ ngày thực làm threeDaysAgo -> threeDaysAgo + 7
      expect(lateDecl.body.nextMilestone).toMatchObject({
        code: "cd1-ngay-7",
        scheduledOn: addDays(threeDaysAgo, 7),
      });
      expect(lateDecl.body.plan.reminderLeadDays).toBe(3);
      expect(lateDecl.body.plan.lastLateDeclarationDays).toBe(3);

      const savedMilestone = lateDecl.body.plan.milestones.find((m: { code: string }) => m.code === "cd1-ngay-0");
      expect(savedMilestone?.declaration).toMatchObject({
        performedOn: threeDaysAgo,
        declaredOn: todayStr,
        lateDeclarationDays: 3,
        lateReason: "Mưa lớn trên rẫy nên về nhà mới gửi khai báo",
      });

      // Kiểm tra thông báo nhắc nhở lần sau khai báo đúng hạn hơn
      const notifs = await binh.get("/api/notifications");
      expect(notifs.status).toBe(200);
      expect(
        notifs.body.data.some(
          (n: { body: string }) =>
            typeof n.body === "string" &&
            n.body.includes("khai báo chậm 3 ngày") &&
            n.body.includes("nhắc sớm trước 3 ngày"),
        ),
      ).toBe(true);

      // Kiểm tra nhật ký canh tác cũng tính chính xác lateDeclarationDays = 2 ngày
      const jPhoto = await uploadFile(binh, "journal");
      const lateJournal = await binh.post("/api/portal/journal").send({
        entryOn: twoDaysAgo,
        plotCode,
        activity: "Làm cỏ quanh gốc",
        photoIds: [jPhoto],
      });
      expect(lateJournal.status).toBe(201);
      expect(lateJournal.body.entryOn).toBe(twoDaysAgo);
      expect(lateJournal.body.declaredOn).toBe(todayStr);
      expect(lateJournal.body.lateDeclarationDays).toBe(2);
    });

    it("ghi nhận rõ người sửa, vai trò, thời điểm và gửi thông báo khi quản trị viên sửa nhật ký của hộ", async () => {
      const binh = await loggedIn(USERS.farmerBinh);
      const admin = await loggedIn(USERS.admin);

      const plotsRes = await binh.get("/api/portal/plots");
      const plotCode: string = plotsRes.body.data[0]?.code ?? "TH1-002";

      const photoId = await uploadFile(binh, "journal");
      const createdJournal = await binh.post("/api/portal/journal").send({
        plotCode,
        activity: "Tưới nước giữ ẩm",
        detail: "Tưới nhỏ giọt 30 phút",
        photoIds: [photoId],
      });
      expect(createdJournal.status).toBe(201);
      expect(createdJournal.body.recorder).toBe("Chủ hộ");
      expect(createdJournal.body.updatedByName).toBeNull();
      expect(createdJournal.body.editCount).toBe(0);

      const patchedJournal = await admin.patch(`/api/journal/${createdJournal.body.id}`).send({
        detail: "Tưới nhỏ giọt 45 phút quanh tán cây",
      });
      expect(patchedJournal.status).toBe(200);
      expect(patchedJournal.body.recorder).toBe("Chủ hộ");
      expect(patchedJournal.body.updatedByRole).toBe("admin");
      expect(typeof patchedJournal.body.updatedByName).toBe("string");
      expect(patchedJournal.body.updatedByName.length).toBeGreaterThan(0);
      expect(typeof patchedJournal.body.updatedAt).toBe("string");
      expect(patchedJournal.body.editCount).toBe(1);

      const portalJournalList = await binh.get("/api/portal/journal");
      const farmerViewJournal = portalJournalList.body.data.find(
        (row: { id: number }) => row.id === createdJournal.body.id,
      );
      expect(farmerViewJournal).toMatchObject({
        id: createdJournal.body.id,
        recorder: "Chủ hộ",
        updatedByName: patchedJournal.body.updatedByName,
        updatedByRole: "admin",
        editCount: 1,
      });

      const pesticidesRes = await binh.get("/api/pesticides");
      const allowedPest = (pesticidesRes.body.data as Array<{ id: number; status: string }>).find(
        (p) => p.status === "allowed",
      );
      expect(allowedPest).toBeDefined();

      const createdSpray = await binh.post("/api/portal/spray").send({
        plotCode,
        pesticideId: allowedPest!.id,
        dose: "15 ml / bình 25L",
        areaHa: 0.4,
      });
      expect(createdSpray.status).toBe(201);
      expect(createdSpray.body.recordedByRole).toBe("farmer");
      expect(createdSpray.body.updatedByName).toBeNull();
      expect(createdSpray.body.editCount).toBe(0);

      const patchedSpray = await admin.patch(`/api/spray/${createdSpray.body.id}`).send({
        dose: "20 ml / bình 25L",
      });
      expect(patchedSpray.status).toBe(200);
      expect(patchedSpray.body.recordedByRole).toBe("farmer");
      expect(patchedSpray.body.updatedByRole).toBe("admin");
      expect(patchedSpray.body.updatedByName).toBe(patchedJournal.body.updatedByName);
      expect(patchedSpray.body.editCount).toBe(1);

      const portalSprayList = await binh.get("/api/portal/spray");
      const farmerViewSpray = portalSprayList.body.data.find(
        (row: { id: number }) => row.id === createdSpray.body.id,
      );
      expect(farmerViewSpray).toMatchObject({
        id: createdSpray.body.id,
        recordedByRole: "farmer",
        updatedByName: patchedSpray.body.updatedByName,
        updatedByRole: "admin",
        editCount: 1,
      });

      const notifs = await binh.get("/api/notifications");
      expect(notifs.status).toBe(200);
      expect(
        notifs.body.data.some(
          (n: { title?: string; body?: string }) =>
            n.title === "Nhật ký canh tác đã được chỉnh sửa" &&
            typeof n.body === "string" &&
            n.body.includes(patchedJournal.body.updatedByName),
        ),
      ).toBe(true);

      await admin.delete(`/api/journal/${createdJournal.body.id}`);
      await admin.delete(`/api/spray/${createdSpray.body.id}`);
    });

    it("đồng bộ thông báo hai chiều thời gian thực giữa cập nhật nhật ký của hộ/cán bộ và thông báo/cập nhật từ Ban quản trị", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const binh = await loggedIn(USERS.farmerBinh);
      const admin = await loggedIn(USERS.admin);
      const htx = await loggedIn(USERS.htx);
      const inspector = await loggedIn(USERS.inspector);
      const notifSvc = nest.get(NotificationsService);

      const htxProfile = await htx.get("/api/auth/me");
      const anProfile = await an.get("/api/auth/me");
      const htxEvents: RealtimeStreamEvent[] = [];
      const anEvents: RealtimeStreamEvent[] = [];

      const unsubHtx = notifSvc.subscribeUserStream(htxProfile.body.user.id, "htx_officer", (ev) => {
        htxEvents.push(ev);
      });
      const unsubAn = notifSvc.subscribeUserStream(anProfile.body.user.id, "farmer", (ev) => {
        anEvents.push(ev);
      });

      try {
        // 1. Nông hộ cập nhật nhật ký canh tác -> Cán bộ HTX, Kiểm tra viên, Quản trị viên đều nhận thông báo realtime
        const plotsRes = await an.get("/api/portal/plots");
        const plotCode: string = plotsRes.body.data[0]?.code ?? "TH1-001";
        const photoId = await uploadFile(an, "journal");
        const uniqueAct = `Tỉa cành thông thoáng realtime ${Date.now()}`;

        const createdJ = await an.post("/api/portal/journal").send({
          plotCode,
          activity: uniqueAct,
          detail: "Kiểm tra đồng bộ realtime tới các vai trò HTX",
          photoIds: [photoId],
        });
        expect(createdJ.status).toBe(201);

        expect(
          htxEvents.some(
            (e) =>
              e.type === "notification" &&
              (e.item.title.includes(uniqueAct) || (e.item.body ?? "").includes(uniqueAct)),
          ),
        ).toBe(true);

        const [adminNotifs, htxNotifs, inspectorNotifs] = await Promise.all([
          admin.get("/api/notifications"),
          htx.get("/api/notifications"),
          inspector.get("/api/notifications"),
        ]);
        for (const res of [adminNotifs, htxNotifs, inspectorNotifs]) {
          expect(res.status).toBe(200);
          expect(
            res.body.data.some(
              (n: { title?: string; body?: string | null }) =>
                (typeof n.title === "string" && n.title.includes(uniqueAct)) ||
                (typeof n.body === "string" && n.body.includes(uniqueAct)),
            ),
          ).toBe(true);
        }

        // 2. Ban quản trị phát thông báo cập nhật hệ thống (severity: 'info') -> Từng hộ dân nhận realtime
        const broadcastTitle = `Cập nhật hệ thống mùa vụ ${Date.now()}`;
        const createdAlert = await admin.post("/api/system-alerts").send({
          severity: "info",
          audience: "farmer",
          title: broadcastTitle,
          message: "Đã bổ sung tính năng đồng bộ thông báo trực tiếp tới từng hộ dân.",
        });
        expect(createdAlert.status).toBe(201);
        expect(createdAlert.body.severity).toBe("info");

        expect(
          anEvents.some((e) => e.type === "notification" && e.item.title.includes(broadcastTitle)),
        ).toBe(true);
        expect(anEvents.some((e) => e.type === "system-alert" && e.active === true)).toBe(true);

        // 3. Ban quản trị đăng bản tin mới -> Từng hộ dân đều nhận thông báo realtime
        const newsTitle = `Bản tin kỹ thuật sầu riêng ${Date.now()}`;
        const createdNews = await htx.post("/api/news").send({
          category: "farming",
          title: newsTitle,
          excerpt: "Hướng dẫn chăm sóc cơi đọt sau mưa lớn tại Cư Né.",
          author: "Tổ kỹ thuật HTX",
          readTime: "3 phút đọc",
          status: "published",
          content: {
            lead: "Hướng dẫn chi tiết chăm sóc cơi đọt.",
            sections: [{ heading: "Bước 1", paragraphs: ["Thoát nước rãnh kịp thời."] }],
          },
        });
        expect(createdNews.status).toBe(201);

        const [anNotifs, binhNotifs] = await Promise.all([
          an.get("/api/notifications"),
          binh.get("/api/notifications"),
        ]);
        for (const fRes of [anNotifs, binhNotifs]) {
          expect(fRes.status).toBe(200);
          expect(
            fRes.body.data.some(
              (n: { title?: string }) => typeof n.title === "string" && n.title.includes(broadcastTitle),
            ),
          ).toBe(true);
          expect(
            fRes.body.data.some(
              (n: { title?: string }) => typeof n.title === "string" && n.title.includes(newsTitle),
            ),
          ).toBe(true);
        }

        await admin.post(`/api/system-alerts/${createdAlert.body.id}/resolve`).send({});
        await htx.delete(`/api/news/${createdNews.body.id}`);
        await admin.delete(`/api/journal/${createdJ.body.id}`);
      } finally {
        unsubHtx();
        unsubAn();
      }
    });
  });

  describe("lưu trữ vật lý phân tách riêng theo từng hộ dân", () => {
    it("tách thư mục hộ, ghi ho-so-dinh-danh.json + manifest.jsonl, chuyển tệp cán bộ về thư mục hộ và di chuyển tệp cũ", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const binh = await loggedIn(USERS.farmerBinh);
      const htx = await loggedIn(USERS.htx);
      const admin = await loggedIn(USERS.admin);
      const config = nest.get<ConfigService<AppConfig, true>>(ConfigService);
      const uploadsService = nest.get(UploadsService);
      const uploadRoot = resolve(config.get("uploads", { infer: true }).dir);

      // 1. Nông hộ tải lên trực tiếp: nằm trong thư mục riêng của hộ đó, không lẫn với hộ khác
      const anFileId = await uploadFile(an, "journal", TINY_JPEG, "anh-vuon-an.jpg");
      const binhFileId = await uploadFile(binh, "journal", TINY_JPEG, "anh-vuon-binh.jpg");

      const { rows: directRows } = await db.query<{ id: string; household_id: string; storage_key: string }>(
        "SELECT id, household_id, storage_key FROM attachments WHERE id = ANY($1::bigint[]) ORDER BY id ASC",
        [[anFileId, binhFileId]],
      );
      const anRow = directRows.find((r) => Number(r.id) === anFileId)!;
      const binhRow = directRows.find((r) => Number(r.id) === binhFileId)!;

      expect(anRow.storage_key).toMatch(/^households\/HO-\d{4}_KB-VT-001-H001_nguyen-van-an\/journal\//);
      expect(binhRow.storage_key).toMatch(/^households\/HO-\d{4}_.*_tran-thi-binh\/journal\//);

      const anFolder = anRow.storage_key.split("/").slice(0, 2).join("/");
      const identityRaw = JSON.parse(await readFile(join(uploadRoot, anFolder, "ho-so-dinh-danh.json"), "utf8"));
      expect(identityRaw).toMatchObject({
        householdId: Number(anRow.household_id),
        householdCode: "KB-VT-001-H001",
        householdName: "Nguyễn Văn An",
      });
      const manifestText = await readFile(join(uploadRoot, anFolder, "manifest.jsonl"), "utf8");
      expect(manifestText).toContain(`"attachmentId":${anFileId}`);
      expect(manifestText).not.toContain(`"attachmentId":${binhFileId}`);

      // 2. Cán bộ HTX tải ảnh trước rồi gắn vào nhật ký của hộ An: tự động chuyển từ staff-staging về đúng thư mục hộ An
      const staffFileId = await uploadFile(htx, "journal", TINY_JPEG, "can-bo-chup.jpg");
      const { rows: beforeBind } = await db.query<{ storage_key: string }>(
        "SELECT storage_key FROM attachments WHERE id = $1",
        [staffFileId],
      );
      expect(beforeBind[0].storage_key).toMatch(/^staff-staging\/journal\//);

      const anPlots = await an.get("/api/portal/plots");
      const anPlotCode: string = anPlots.body.data?.[0]?.code ?? "CN-T1-01";
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

      const createdStaffJ = await htx.post("/api/journal").send({
        entryOn: todayStr,
        householdId: Number(anRow.household_id),
        plotCode: anPlotCode,
        activity: "Kiểm tra cơi đọt",
        recorder: "Cán bộ HTX",
        photoIds: [staffFileId],
        photoId: staffFileId,
        hasPhoto: true,
      });
      expect(createdStaffJ.status).toBe(201);

      const { rows: afterBind } = await db.query<{ storage_key: string }>(
        "SELECT storage_key FROM attachments WHERE id = $1",
        [staffFileId],
      );
      expect(afterBind[0].storage_key).toMatch(/^households\/HO-\d{4}_KB-VT-001-H001_nguyen-van-an\/journal\//);

      const fetchRelocated = await an.get(`/api/uploads/${staffFileId}`);
      expect(fetchRelocated.status).toBe(200);
      expect(Buffer.from(fetchRelocated.body).equals(TINY_JPEG)).toBe(true);

      // 3. Giả lập bản ghi cũ dạng 2026/11/<uuid>.jpg rồi chạy organizeLegacyAttachments()
      const legacyKey = `2026/11/legacy-${Date.now()}.jpg`;
      await db.query("UPDATE attachments SET storage_key = $2 WHERE id = $1", [binhFileId, legacyKey]);
      const migResult = await uploadsService.organizeLegacyAttachments();
      expect(migResult.migratedKeys).toBeGreaterThanOrEqual(1);

      const { rows: afterMig } = await db.query<{ storage_key: string }>(
        "SELECT storage_key FROM attachments WHERE id = $1",
        [binhFileId],
      );
      expect(afterMig[0].storage_key).toMatch(/^households\/HO-\d{4}_.*_tran-thi-binh\/journal\//);
      const fetchMigrated = await binh.get(`/api/uploads/${binhFileId}`);
      expect(fetchMigrated.status).toBe(200);
      expect(Buffer.from(fetchMigrated.body).equals(TINY_JPEG)).toBe(true);

      await admin.delete(`/api/journal/${createdStaffJ.body.id}`);
    });
  });

  describe("phân tách thông báo tới quản trị viên: bỏ thao tác cá nhân, giữ thông báo ghi nhật ký", () => {
    it("thao tác cá nhân của nông hộ không bắn thông báo lên quản trị viên, còn ghi nhật ký canh tác báo ngay", async () => {
      const an = await loggedIn(USERS.farmerAn);
      const admin = await loggedIn(USERS.admin);

      const { rows: adminRows } = await db.query<{ id: number }>(
        "SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1",
        [USERS.admin],
      );
      const adminId = Number(adminRows[0].id);

      const { rows: maxBeforePersonal } = await db.query<{ max_id: number }>(
        "SELECT COALESCE(MAX(id), 0)::int AS max_id FROM notifications WHERE user_id = $1",
        [adminId],
      );
      const baselineId = maxBeforePersonal[0].max_id;

      // 1. Nông hộ tự cập nhật thông tin cá nhân, ảnh đại diện, tùy chọn hiển thị QR
      const avatarId = await uploadFile(an, "avatar", TINY_JPEG, "avatar-ca-nhan.jpg");
      expect((await an.patch("/api/portal/profile/avatar").send({ avatarId })).status).toBe(200);
      expect((await an.patch("/api/portal/profile/avatar").send({ avatarId: null })).status).toBe(200);
      expect((await an.patch("/api/portal/profile/trace-consent").send({ publicTraceConsent: true })).status).toBe(200);
      expect((await an.patch("/api/portal/profile/trace-consent").send({ publicTraceConsent: false })).status).toBe(200);
      expect((await an.patch("/api/auth/profile").send({ fullName: "Nguyễn Văn An" })).status).toBe(200);

      const { rows: afterPersonalNotifs } = await db.query<{ title: string }>(
        "SELECT title FROM notifications WHERE user_id = $1 AND id > $2",
        [adminId, baselineId],
      );
      expect(afterPersonalNotifs).toHaveLength(0);

      // 2. Nông hộ ghi nhật ký canh tác -> thông báo ngay tới quản trị viên
      const anPlots = await an.get("/api/portal/plots");
      const plotCode: string = anPlots.body.data?.[0]?.code ?? "CN-T1-01";
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
      const journalImgId = await uploadFile(an, "journal", TINY_JPEG, "nhat-ky-moi.jpg");

      const createdJ = await an.post("/api/portal/journal").send({
        entryOn: todayStr,
        plotCode,
        activity: "Bón phân hữu cơ định kỳ",
        detail: "Bón quanh tán sau mưa",
        photoIds: [journalImgId],
      });
      expect(createdJ.status).toBe(201);

      const { rows: afterJournalNotifs } = await db.query<{ title: string; body: string }>(
        "SELECT title, body FROM notifications WHERE user_id = $1 AND id > $2",
        [adminId, baselineId],
      );
      expect(
        afterJournalNotifs.some(
          (n) => n.title.includes("mới cập nhật nhật ký canh tác") && n.body.includes("Bón phân hữu cơ định kỳ"),
        ),
      ).toBe(true);

      await admin.delete(`/api/journal/${createdJ.body.id}`);
    });
  });
});
