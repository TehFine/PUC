import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AppCacheService } from "../src/common/cache/app-cache.service";
import { TEST_PASSWORD } from "./constants";

const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
  "hex",
);

describe("AppCacheService (Singleflight, chống Race Đọc-Ghi & phân miền SQL)", () => {
  it("gộp 20 truy vấn đồng thời (Singleflight) thành đúng 1 lần gọi hàm tải dữ liệu", async () => {
    const cache = new AppCacheService(200);
    try {
      let loaderRuns = 0;
      const loader = async () => {
        loaderRuns += 1;
        await new Promise((r) => setTimeout(r, 25));
        return { count: 42 };
      };

      const results = await Promise.all(
        Array.from({ length: 20 }, () => cache.getOrLoad("test:singleflight", 10_000, ["catalog"], loader)),
      );
      expect(loaderRuns).toBe(1);
      expect(results).toHaveLength(20);
      expect(results.every((r) => r.count === 42)).toBe(true);
      expect(cache.stats().coalescedInflight).toBe(19);
    } finally {
      cache.onApplicationShutdown();
    }
  });

  it("chống Race Condition Đọc-Ghi: không lưu kết quả cũ vào đệm nếu có lệnh ghi xảy ra trong lúc SELECT đang chạy", async () => {
    const cache = new AppCacheService(200);
    try {
      let resolveSlowSelect!: (v: { version: number }) => void;
      const slowPromise = cache.getOrLoad(
        "catalog:pesticides",
        60_000,
        ["catalog"],
        () =>
          new Promise<{ version: number }>((resolve) => {
            resolveSlowSelect = resolve;
          }),
      );

      // Trong lúc SELECT cũ đang chờ kết quả, một lệnh UPDATE bảng pesticides hoàn tất
      cache.onSqlMutation("UPDATE pesticides SET status = 'banned' WHERE id = 1");

      // SELECT cũ trả về phiên bản cũ (version: 1)
      resolveSlowSelect({ version: 1 });
      const firstResult = await slowPromise;
      expect(firstResult).toEqual({ version: 1 });

      // Khóa không được lưu bản cũ vào bộ nhớ đệm -> lần đọc kế tiếp phải tải lại bản mới (version: 2)
      const secondResult = await cache.getOrLoad("catalog:pesticides", 60_000, ["catalog"], async () => ({
        version: 2,
      }));
      expect(secondResult).toEqual({ version: 2 });
    } finally {
      cache.onApplicationShutdown();
    }
  });

  it("ghi bảng nhật ký truy vết (audit_logs, trace_scan_logs) không làm mất đệm nghiệp vụ", async () => {
    const cache = new AppCacheService(200);
    try {
      cache.set("plots:list:all", { features: [1, 2, 3] }, 60_000, ["plots"]);
      cache.onSqlMutation("INSERT INTO audit_logs (actor_name, action, object) VALUES ('Admin', 'Xem', 'Bản đồ')");
      cache.onSqlMutation("INSERT INTO trace_scan_logs (lot_code, viewer_tier) VALUES ('LH-01', 'public')");

      expect(cache.get("plots:list:all")).toEqual({ features: [1, 2, 3] });

      // Nhưng khi cập nhật bảng plots thì xóa đệm tức thì
      cache.onSqlMutation("UPDATE plots SET status = 'approved' WHERE id = 1");
      expect(cache.get("plots:list:all")).toBeUndefined();
    } finally {
      cache.onApplicationShutdown();
    }
  });
});

describe("Hệ thống Cache đa tầng E2E (ETag 304, tự động làm mới sau ghi, cô lập phạm vi & thu hồi phiên)", () => {
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

  it("cấp ETag cho JSON công khai, trả 304 (0 byte) khi chưa đổi và tự làm mới 200 ngay lập tức khi cập nhật danh mục", async () => {
    const first = await request(app).get("/api/public/catalog");
    expect(first.status).toBe(200);
    const etag1 = first.headers["etag"] as string | undefined;
    expect(etag1).toBeTruthy();

    // Đối chiếu lại với If-None-Match -> 304 Not Modified (không tốn băng thông tải lại JSON)
    const reval = await request(app).get("/api/public/catalog").set("If-None-Match", etag1!);
    expect(reval.status).toBe(304);
    expect(reval.text).toBe("");

    // Admin thêm thuốc BVTV mới -> DatabaseService tự động xóa tag "catalog"
    const admin = await loggedIn("0901234567");
    const uniqueName = `Thuốc Sinh Học CacheTest ${Date.now()}`;
    const created = await admin.post("/api/pesticides").send({
      name: uniqueName,
      activeIngredient: "Azadirachtin 0.3%",
      isolationDays: 3,
      status: "allowed",
    });
    expect(created.status).toBe(201);

    try {
      // Gọi lại ngay với ETag cũ phải nhận 200 OK kèm dữ liệu mới và ETag mới
      const afterWrite = await request(app).get("/api/public/catalog").set("If-None-Match", etag1!);
      expect(afterWrite.status).toBe(200);
      expect(afterWrite.headers["etag"]).not.toBe(etag1);
      expect(afterWrite.body.pesticides.some((p: { name: string }) => p.name === uniqueName)).toBe(true);
    } finally {
      await admin.delete(`/api/pesticides/${created.body.id}`);
    }
  });

  it("cô lập chặt chẽ phạm vi dữ liệu đệm giữa Quản trị viên và Cán bộ thôn trên Dashboard & Bản đồ", async () => {
    const admin = await loggedIn("0901234567");
    const villageOfficer = await loggedIn("0934567890"); // Cán bộ Thôn 1

    const [adminDash, voDash] = await Promise.all([
      admin.get("/api/dashboard/summary"),
      villageOfficer.get("/api/dashboard/summary"),
    ]);
    expect(adminDash.status).toBe(200);
    expect(voDash.status).toBe(200);
    expect(adminDash.body.villages.length).toBeGreaterThan(voDash.body.villages.length);
    expect(voDash.body.villages).toHaveLength(1);
    expect(adminDash.headers["etag"]).not.toBe(voDash.headers["etag"]);

    // Cán bộ thôn gửi If-None-Match nhận đúng 304 trên giỏ phạm vi của mình
    const voReval = await villageOfficer
      .get("/api/dashboard/summary")
      .set("If-None-Match", voDash.headers["etag"] as string);
    expect(voReval.status).toBe(304);
  });

  it("đệm phiên xác thực nhưng thu hồi tức thì 0ms ngay khi đăng xuất và giữ nguyên kiểm tra phân quyền trên 304 ảnh", async () => {
    const farmerAn = await loggedIn("0905123456");
    const farmerBinh = await loggedIn("0912234567");

    // Hộ An tải ảnh minh chứng lên -> xem lần 1 (200) -> xem lần 2 với ETag (304 siêu nhanh)
    const up = await farmerAn
      .post("/api/uploads")
      .field("purpose", "journal")
      .attach("file", TINY_PNG, "leaf.png");
    expect(up.status).toBe(201);
    const fileUrl = `/api/uploads/${up.body.id}`;

    const dl1 = await farmerAn.get(fileUrl);
    expect(dl1.status).toBe(200);
    const imgEtag = dl1.headers["etag"] as string;
    expect(imgEtag).toBeTruthy();

    const dl2 = await farmerAn.get(fileUrl).set("If-None-Match", imgEtag);
    expect(dl2.status).toBe(304);

    // Hộ Bình gửi đúng ETag ảnh của Hộ An vẫn bị chặn 404 (kiểm tra quyền trước khi trả 304)
    const unauthorized304 = await farmerBinh.get(fileUrl).set("If-None-Match", imgEtag);
    expect(unauthorized304.status).toBe(404);

    // Hộ An đang có phiên ấm trong bộ nhớ đệm `auth`, khi bấm đăng xuất phải bị chặn 401 ngay lập tức
    expect((await farmerAn.get("/api/auth/me")).status).toBe(200);
    expect((await farmerAn.post("/api/auth/logout")).status).toBe(200);
    expect((await farmerAn.get("/api/auth/me")).status).toBe(401);
  });
});

