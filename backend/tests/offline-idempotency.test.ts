import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { createHash } from "node:crypto";
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
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000c49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
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

  it("chống tải trùng BYTEA bằng X-Upload-Sha256 + GET /api/uploads/by-hash, chặn tệp lỗi bit và cô lập chặt giữa các hộ", async () => {
    const farmerAn = await loggedIn("0905123456");
    const farmerBinh = await loggedIn("0912234567");

    // Tạo một tệp PNG hợp lệ duy nhất bằng cách thêm chunk tEXt vào trước IEND của TINY_PNG
    const uniqueText = Buffer.from(`orchard_dedup_${Date.now()}`, "ascii");
    const textKeyword = Buffer.from("Comment\0", "ascii");
    const chunkData = Buffer.concat([textKeyword, uniqueText]);
    const chunkType = Buffer.from("tEXt", "ascii");
    // Tính CRC32 chuẩn của PNG cho tEXt chunk (hoặc dùng JPEG hợp lệ có phần đệm APP0/COM ở trước EOI)
    // Dùng JPEG tối giản hợp lệ kèm comment duy nhất để detectType luôn nhận image/jpeg
    const baseJpegTail = Buffer.from(
      "ffdb004300" +
        "08".repeat(64) +
        "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000ffc40014100100000000000000000000000000000000ffda0008010100003f003fffd9",
      "hex",
    );
    const uniqueComment = Buffer.from(`PUC-ORCHARD-${Date.now()}`, "ascii");
    const comLen = Buffer.alloc(2);
    comLen.writeUInt16BE(uniqueComment.length + 2, 0);
    const uniqueJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.from("JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00", "binary"),
      Buffer.from([0xff, 0xfe]),
      comLen,
      uniqueComment,
      baseJpegTail,
    ]);
    void chunkData;
    void chunkType;

    const sha256 = createHash("sha256").update(uniqueJpeg).digest("hex");

    // 1. Trước khi tải lên: kiểm tra by-hash trả found: false
    const preCheck = await farmerAn
      .get("/api/uploads/by-hash")
      .query({ purpose: "journal", sha256, size: uniqueJpeg.length });
    expect(preCheck.status).toBe(200);
    expect(preCheck.body).toEqual({ found: false });

    // 2. Gửi sai X-Upload-Sha256 (giả lập đứt mạng/lỗi bit trên sóng 2G) -> bị từ chối 400
    const corrupted = await farmerAn
      .post("/api/uploads")
      .set("X-Upload-Sha256", "0".repeat(64))
      .field("purpose", "journal")
      .attach("file", uniqueJpeg, "ray-sau-rieng.jpg");
    expect(corrupted.status).toBe(400);

    // 3. Tải lên hợp lệ lần 1 kèm X-Upload-Sha256
    const firstUp = await farmerAn
      .post("/api/uploads")
      .set("X-Upload-Sha256", sha256)
      .field("purpose", "journal")
      .attach("file", uniqueJpeg, "ray-sau-rieng.jpg");
    expect(firstUp.status).toBe(201);
    expect(firstUp.body.sha256).toBe(sha256);
    const savedId = firstUp.body.id as number;

    // 4. Hộ An thử tải lại cùng ảnh (giả lập rớt phản hồi chiều về) -> trả về đúng ID cũ, không nhân đôi dòng CSDL
    const retryUp = await farmerAn
      .post("/api/uploads")
      .set("X-Upload-Sha256", sha256)
      .field("purpose", "journal")
      .attach("file", uniqueJpeg, "ray-sau-rieng.jpg");
    expect(retryUp.status).toBe(201);
    expect(retryUp.body.id).toBe(savedId);
    expect(retryUp.body.deduplicated).toBe(true);

    // 5. Kiểm tra nhanh bằng by-hash cho Hộ An -> found: true (tiết kiệm băng thông tải lại)
    const afterCheck = await farmerAn
      .get("/api/uploads/by-hash")
      .query({ purpose: "journal", sha256, size: uniqueJpeg.length });
    expect(afterCheck.status).toBe(200);
    expect(afterCheck.body.found).toBe(true);
    expect(afterCheck.body.id).toBe(savedId);

    // 6. Hộ Bình kiểm tra cùng mã băm của Hộ An -> found: false (cô lập tuyệt đối giữa các hộ)
    const otherCheck = await farmerBinh
      .get("/api/uploads/by-hash")
      .query({ purpose: "journal", sha256, size: uniqueJpeg.length });
    expect(otherCheck.status).toBe(200);
    expect(otherCheck.body).toEqual({ found: false });

    const db = nest.get(DatabaseService);
    const countRes = await db.query<{ cnt: string }>(
      "SELECT COUNT(*)::text AS cnt FROM attachments WHERE sha256_hex = $1",
      [sha256],
    );
    expect(Number(countRes.rows[0]?.cnt)).toBe(1);
  });

  it("xác thực đa tầng nhật ký ngoại tuyến (vé time-anchor, in_app_camera, biển QR vườn, tọa độ GPS) cho cả canh tác và phun thuốc", async () => {
    const farmerAn = await loggedIn("0905123456");
    const admin = await loggedIn("0901234567");

    // 1. Lấy vé neo thời gian từ máy chủ trước khi lên rẫy mất sóng
    const overviewRes = await farmerAn.get("/api/portal/overview");
    expect(overviewRes.status).toBe(200);
    expect(overviewRes.body.timeAnchor?.token).toBeTruthy();

    const anchorRes = await farmerAn.get("/api/portal/time-anchor");
    expect(anchorRes.status).toBe(200);
    const anchorToken = anchorRes.body.token as string;
    const anchorServerMs = Number(anchorRes.body.serverTimeMs);
    expect(anchorToken).toMatch(/^v1\.\d+\.\d+\.\d+\.[a-f0-9]+\.[a-f0-9]{64}$/);
    expect(anchorServerMs).toBeGreaterThan(1_700_000_000_000);

    // 2. Đọc thông tin thửa đất kèm mã QR biển vườn và tâm đa giác của hộ An
    const plotsRes = await farmerAn.get("/api/portal/plots");
    expect(plotsRes.status).toBe(200);
    const firstPlot = (plotsRes.body.data as Array<{
      code: string;
      qrToken?: string | null;
      lat?: number | null;
      lng?: number | null;
    }>)[0];
    expect(firstPlot?.code).toBeTruthy();
    expect(firstPlot?.qrToken).toBeTruthy();

    function makeDistinctJpeg(tag: string): Buffer {
      const tail = Buffer.from(
        "ffdb004300" +
          "08".repeat(64) +
          "ffc0000b080001000101011100ffc40014000100000000000000000000000000000000ffc40014100100000000000000000000000000000000ffda0008010100003f003fffd9",
        "hex",
      );
      const comment = Buffer.from(`PUC-FIELD-${tag}-${Date.now()}`, "ascii");
      const len = Buffer.alloc(2);
      len.writeUInt16BE(comment.length + 2, 0);
      return Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        Buffer.from("JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00", "binary"),
        Buffer.from([0xff, 0xfe]),
        len,
        comment,
        tail,
      ]);
    }

    const upJournal = await farmerAn
      .post("/api/uploads")
      .field("purpose", "journal")
      .attach("file", makeDistinctJpeg("journal-1"), "chup-truc-tiep-tai-ray.jpg");
    const upSpray = await farmerAn
      .post("/api/uploads")
      .field("purpose", "journal")
      .attach("file", makeDistinctJpeg("spray-1"), "chup-phun-thuoc.jpg");
    const upSuspicious = await farmerAn
      .post("/api/uploads")
      .field("purpose", "journal")
      .attach("file", makeDistinctJpeg("suspicious-1"), "anh-thu-vien.jpg");
    expect(upJournal.status).toBe(201);
    expect(upSpray.status).toBe(201);
    expect(upSuspicious.status).toBe(201);

    const createdJournalIds: number[] = [];
    let createdSprayId: number | null = null;

    try {
      // 3. Bản ghi thực địa chuẩn (chụp trực tiếp + quét QR biển vườn + GPS khớp thửa + đồng hồ đơn điệu khớp) -> Mức 1
      const capturedIso = new Date(anchorServerMs + 1_500).toISOString();
      const goodJournal = await farmerAn.post("/api/portal/journal").send({
        plotCode: firstPlot.code,
        activity: "Tưới nước",
        detail: "Tưới giữ ẩm gốc sầu riêng tại rẫy không có 4G",
        photoId: upJournal.body.id,
        photoIds: [upJournal.body.id],
        latitude: firstPlot.lat ?? 13.128,
        longitude: firstPlot.lng ?? 108.186,
        gpsAccuracyM: 14.5,
        captureSource: "in_app_camera",
        clientCapturedAt: capturedIso,
        timeAnchorToken: anchorToken,
        monotonicElapsedMs: 1_500,
        offlineQueued: true,
        signboardQrToken: `/t/${firstPlot.qrToken}`,
      });
      expect(goodJournal.status).toBe(201);
      createdJournalIds.push(goodJournal.body.id as number);
      expect(goodJournal.body.trustLevel).toBe(1);
      expect(goodJournal.body.signboardQrVerified).toBe(true);
      expect(goodJournal.body.offlineQueued).toBe(true);
      expect(goodJournal.body.captureSource).toBe("in_app_camera");
      expect(goodJournal.body.trustFlags).toEqual(
        expect.arrayContaining(["in_app_camera", "signboard_qr", "time_anchored", "offline_sync"]),
      );

      // Chặn dùng lại ảnh của bản ghi trước cho bản ghi mới (400)
      const reusedAttempt = await farmerAn.post("/api/portal/journal").send({
        plotCode: firstPlot.code,
        activity: "Làm cỏ",
        photoId: upJournal.body.id,
        photoIds: [upJournal.body.id],
      });
      expect(reusedAttempt.status).toBe(400);

      // 4. Nhật ký phun thuốc cũng hỗ trợ đầy đủ GPS + biển QR + trustLevel Mức 1
      const goodSpray = await farmerAn.post("/api/portal/spray").send({
        pesticideId: 1,
        dose: "20 ml / bình 20L",
        areaHa: 0.5,
        plotCode: firstPlot.code,
        note: "Phun phòng rầy xanh sáng sớm",
        photoId: upSpray.body.id,
        photoIds: [upSpray.body.id],
        latitude: firstPlot.lat ?? 13.128,
        longitude: firstPlot.lng ?? 108.186,
        gpsAccuracyM: 16,
        captureSource: "in_app_camera",
        clientCapturedAt: capturedIso,
        timeAnchorToken: anchorToken,
        monotonicElapsedMs: 1_500,
        offlineQueued: true,
        signboardQrToken: firstPlot.qrToken,
      });
      expect(goodSpray.status).toBe(201);
      createdSprayId = goodSpray.body.id as number;
      expect(goodSpray.body.trustLevel).toBe(1);
      expect(goodSpray.body.signboardQrVerified).toBe(true);
      expect(goodSpray.body.gpsAccuracyM).toBeCloseTo(16, 1);

      // 5. Hồ sơ truy xuất thửa đất phản ánh đúng trustLevel và signboardQrVerified cho đoàn kiểm tra
      const traceRes = await admin.get(`/api/trace/${encodeURIComponent(firstPlot.qrToken!)}`);
      expect(traceRes.status).toBe(200);
      const authDiaries = (traceRes.body.authorityData?.cultivationDiaries ?? []) as Array<{
        detail?: string | null;
        trustLevel?: number;
        signboardQrVerified?: boolean;
        offlineQueued?: boolean;
      }>;
      const tracedEntry = authDiaries.find(
        (d) => d.detail === "Tưới giữ ẩm gốc sầu riêng tại rẫy không có 4G",
      );
      expect(tracedEntry).toBeDefined();
      expect(tracedEntry?.trustLevel).toBe(1);
      expect(tracedEntry?.signboardQrVerified).toBe(true);
      expect(tracedEntry?.offlineQueued).toBe(true);

      // 6. Phát hiện gian lận: vặn lùi đồng hồ máy 2 giờ trước vé timeAnchor + tọa độ cách xa hàng trăm km + ảnh từ thư viện -> Mức 3
      const rolledBackIso = new Date(anchorServerMs - 2 * 3_600_000).toISOString();
      const suspiciousJournal = await farmerAn.post("/api/portal/journal").send({
        plotCode: firstPlot.code,
        activity: "Bón phân",
        detail: "Bản ghi giả lập chỉnh lùi giờ và đứng ngoài thửa",
        photoId: upSuspicious.body.id,
        photoIds: [upSuspicious.body.id],
        latitude: 10.7769,
        longitude: 106.7009,
        gpsAccuracyM: 12,
        captureSource: "upload",
        clientCapturedAt: rolledBackIso,
        timeAnchorToken: anchorToken,
        offlineQueued: true,
        signboardQrToken: "QR_GIA_MAO_9999",
      });
      expect(suspiciousJournal.status).toBe(201);
      const suspiciousId = suspiciousJournal.body.id as number;
      createdJournalIds.push(suspiciousId);
      expect(suspiciousJournal.body.trustLevel).toBe(3);
      expect(suspiciousJournal.body.gpsVerified).toBe(false);
      expect(suspiciousJournal.body.signboardQrVerified).toBe(false);
      expect(suspiciousJournal.body.trustFlags).toEqual(
        expect.arrayContaining([
          "clock_skew",
          "outside_plot",
          "gallery_upload",
          "invalid_signboard_qr",
        ]),
      );

      // 7. Khi cán bộ HTX kiểm tra thực tế và bấm xác minh -> bản ghi thăng hạng lên Mức 1 (staff_verified)
      const verifyRes = await admin
        .post(`/api/journal/${suspiciousId}/verify`)
        .send({ verified: true });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.verificationStatus).toBe("verified");
      expect(verifyRes.body.trustLevel).toBe(1);
      expect(verifyRes.body.trustFlags).toContain("staff_verified");
    } finally {
      if (createdSprayId) {
        await admin.delete(`/api/spray/${createdSprayId}`);
      }
      for (const jId of createdJournalIds) {
        await admin.delete(`/api/journal/${jId}`);
      }
    }
  });
});

