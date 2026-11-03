import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { DatabaseService } from "../src/database/database.service";
import { TEST_PASSWORD } from "./constants";

const USERS = {
  admin: "0901234567",
  htx: "0912345678",
  inspector: "0923456789",
  farmerAn: "0905123456", // Hộ Nguyễn Văn An
  farmerBinh: "0912234567", // Hộ Trần Thị Bình
};

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
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
      expect(res.body.household.cccdMasked).toMatch(/^\*{8}\d{4}$/);
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
});
