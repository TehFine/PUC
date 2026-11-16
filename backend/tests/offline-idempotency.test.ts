import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { unlink } from "node:fs/promises";
import type { Server } from "node:http";
import { join, resolve } from "node:path";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import type { AppConfig } from "../src/config/configuration";
import { DatabaseService } from "../src/database/database.service";
import { TEST_PASSWORD } from "./constants";

const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
  "hex",
);

describe("Đồng bộ vùng sóng yếu & Chống ghi trùng bằng X-Idempotency-Key", () => {
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

  async function loggedIn(username: string) {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/login").send({ username, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  it("gửi lại cùng X-Idempotency-Key sau khi rớt mạng chỉ tạo đúng 1 bản ghi nhật ký và phát lại nguyên kết quả", async () => {
    const farmerAn = await loggedIn("0905123456");

    // 1. Tải trước 2 ảnh hiện trường (checkpoint thành công từng ảnh khi sóng chập chờn)
    const up1 = await farmerAn.post("/api/uploads").field("purpose", "journal").attach("file", TINY_PNG, "anh1.png");
    const up2 = await farmerAn.post("/api/uploads").field("purpose", "journal").attach("file", TINY_PNG, "anh2.png");
    expect(up1.status).toBe(201);
    expect(up2.status).toBe(201);

    const idemKey = `puc_offline_test_${Date.now()}`;
    const payload = {
      plotCode: "TH1-001",
      activity: "Tưới nước",
      detail: "Đồng bộ tự động từ vườn sầu riêng sau khi có lại sóng 4G",
      photoId: up1.body.id,
      photoIds: [up1.body.id, up2.body.id],
    };

    // 2. Lần gửi đầu tiên thành công trên máy chủ
    const first = await farmerAn
      .post("/api/portal/journal")
      .set("X-Idempotency-Key", idemKey)
      .send(payload);
    expect(first.status).toBe(201);
    expect(first.headers["x-idempotency-replayed"]).toBeUndefined();
    const createdId = first.body.id as number;
    expect(createdId).toBeGreaterThan(0);

    try {
      // 3. Giả lập điện thoại mất sóng trước khi nhận phản hồi và tự động gửi lại cùng X-Idempotency-Key
      const retry = await farmerAn
        .post("/api/portal/journal")
        .set("X-Idempotency-Key", idemKey)
        .send(payload);
      expect(retry.status).toBe(201);
      expect(retry.headers["x-idempotency-replayed"]).toBe("true");
      expect(retry.body.id).toBe(createdId);

      // Kiểm tra danh sách nhật ký: chỉ có duy nhất 1 bản ghi với nội dung này, không bị nhân đôi
      const list = await farmerAn.get("/api/portal/journal");
      expect(list.status).toBe(200);
      const matches = (list.body.data as Array<{ id: number; detail?: string }>).filter(
        (j) => j.detail === payload.detail,
      );
      expect(matches).toHaveLength(1);

      // 4. Chặn dùng lại cùng X-Idempotency-Key cho một endpoint khác (400)
      const wrongEndpoint = await farmerAn
        .post("/api/portal/spray")
        .set("X-Idempotency-Key", idemKey)
        .send({ pesticideId: 1, dose: "20ml/16L", areaHa: 0.5 });
      expect(wrongEndpoint.status).toBe(400);
    } finally {
      await farmerAn.delete(`/api/portal/journal/${createdId}`);
    }
  });

  it("tự động khôi phục ảnh hiện trường từ PostgreSQL TOAST khi ổ đĩa tạm bị xóa (Render khởi động lại hoặc đồng bộ nhiều máy)", async () => {
    const farmerAn = await loggedIn("0905123456");
    const admin = await loggedIn("0901234567");

    const up = await farmerAn.post("/api/uploads").field("purpose", "journal").attach("file", TINY_PNG, "vuon-sau-rieng.png");
    expect(up.status).toBe(201);
    const attachmentId = up.body.id as number;

    const db = nest.get(DatabaseService);
    const cfg = nest.get<ConfigService<AppConfig, true>>(ConfigService);
    const uploadRoot = resolve(cfg.get("uploads", { infer: true }).dir);
    const { rows } = await db.query<{ storage_key: string }>(
      "SELECT storage_key FROM attachments WHERE id = $1",
      [attachmentId],
    );
    expect(rows[0]?.storage_key).toBeTruthy();

    // Giả lập ổ đĩa tạm trên đám mây bị xóa sạch sau khi container ngủ đông / redeploy
    await unlink(join(uploadRoot, rows[0].storage_key));

    // Quản trị viên mở xem ảnh hiện trường của nông hộ -> tự động khôi phục từ attachments.file_data và trả 200 OK
    const downloadRes = await admin.get(`/api/uploads/${attachmentId}`).buffer(true);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toContain("image/png");
    expect(Buffer.compare(downloadRes.body as Buffer, TINY_PNG)).toBe(0);
  });
});

