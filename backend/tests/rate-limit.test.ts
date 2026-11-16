import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { BoundedThrottlerStorage } from "../src/common/throttler/bounded-throttler.storage";
import { TEST_PASSWORD } from "./constants";

describe("BoundedThrottlerStorage (chống tràn bộ nhớ & chống xóa khóa đang bị phạt)", () => {
  it("giữ nguyên trạng thái bị khóa phạt ngay cả khi kẻ tấn công bơm tràn hàng loạt khóa mới vượt maxKeys", async () => {
    const storage = new BoundedThrottlerStorage(100, 60_000);
    try {
      for (let i = 0; i < 3; i += 1) {
        const res = await storage.increment("attacker-key", 60_000, 3, 60_000, "default");
        expect(res.isBlocked).toBe(false);
      }
      const blocked = await storage.increment("attacker-key", 60_000, 3, 60_000, "default");
      expect(blocked.isBlocked).toBe(true);
      expect(blocked.timeToBlockExpire).toBeGreaterThan(0);

      // Bơm 250 khóa rác không bị chặn (gấp 2.5 lần trần maxKeys = 100)
      for (let i = 0; i < 250; i += 1) {
        await storage.increment(`noise-key-${i}`, 60_000, 10, 60_000, "default");
      }

      expect(storage.size).toBeLessThanOrEqual(100);

      // Khóa của kẻ tấn công vẫn phải đang bị chặn, không bị xóa trắng như .clear()
      const stillBlocked = await storage.increment("attacker-key", 60_000, 3, 60_000, "default");
      expect(stillBlocked.isBlocked).toBe(true);
      expect(stillBlocked.timeToBlockExpire).toBeGreaterThan(0);
    } finally {
      storage.onApplicationShutdown();
    }
  });
});

describe("Hệ thống Rate Limit đa tầng (burst, write, route & cô lập theo user/IP)", () => {
  let nest: INestApplication;
  let app: Server;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const k of [
      "RATE_LIMIT_ENFORCE",
      "RATE_LIMIT_BURST_MAX",
      "RATE_LIMIT_WRITE_MAX",
      "RATE_LIMIT_DEFAULT_MAX",
      "TRUST_PROXY",
    ]) {
      savedEnv[k] = process.env[k];
    }

    process.env.RATE_LIMIT_ENFORCE = "true";
    process.env.RATE_LIMIT_BURST_MAX = "12";
    process.env.RATE_LIMIT_WRITE_MAX = "5";
    process.env.RATE_LIMIT_DEFAULT_MAX = "50";
    process.env.TRUST_PROXY = "loopback";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(instance);
    await instance.init();
    nest = instance;
    app = instance.getHttpServer() as Server;
  });

  afterAll(async () => {
    await nest.close();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  async function loginFromIp(username: string, clientIp: string) {
    const agent = request.agent(app);
    const res = await agent
      .post("/api/auth/login")
      .set("X-Forwarded-For", clientIp)
      .send({ username, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  it("cô lập hạn ngạch theo userId cho người dùng đã đăng nhập dùng chung 1 IP mạng, đồng thời chặn xoay proxy IP", async () => {
    const sharedWifiIp = "203.0.113.50";
    const farmerAn = await loginFromIp("0905123456", sharedWifiIp);
    const farmerBinh = await loginFromIp("0912234567", sharedWifiIp);

    // Hộ An thực hiện 5 thao tác POST hợp lệ (đạt trần RATE_LIMIT_WRITE_MAX = 5)
    for (let i = 0; i < 5; i += 1) {
      const okRes = await farmerAn.post("/api/notifications/read-all").set("X-Forwarded-For", sharedWifiIp);
      expect(okRes.status).toBe(200);
    }

    // Lần thứ 6 của Hộ An bị chặn 429 kèm chuẩn header Retry-After và retryAfterSeconds
    const blockedAn = await farmerAn.post("/api/notifications/read-all").set("X-Forwarded-For", sharedWifiIp);
    expect(blockedAn.status).toBe(429);
    expect(blockedAn.body.code).toBe("RATE_LIMITED");
    expect(typeof blockedAn.body.retryAfterSeconds).toBe("number");
    expect(blockedAn.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(blockedAn.headers["retry-after"])).toBeGreaterThan(0);
    expect(blockedAn.headers["x-ratelimit-remaining"]).toBe("0");

    // Hộ An cố tình đổi sang IP khác vẫn bị chặn vì đã định danh theo user:id
    const rotatedIpAttempt = await farmerAn.post("/api/notifications/read-all").set("X-Forwarded-For", "198.51.100.99");
    expect(rotatedIpAttempt.status).toBe(429);

    // Trong khi đó Hộ Bình ngồi cùng mạng Wi-Fi (cùng IP 203.0.113.50) vẫn thao tác bình thường
    const binhOk = await farmerBinh.post("/api/notifications/read-all").set("X-Forwarded-For", sharedWifiIp);
    expect(binhOk.status).toBe(200);
  });

  it("chặn dồn dập (global burst) xuyên qua nhiều endpoint công khai khác nhau trên cùng một IP", async () => {
    const botIp = "198.51.100.210";
    const publicPaths = ["/api/public/villages", "/api/public/overview", "/api/public/news"];

    // RATE_LIMIT_BURST_MAX = 12 lượt / 10 giây tính tổng trên toàn bộ các API
    for (let i = 0; i < 12; i += 1) {
      const path = publicPaths[i % publicPaths.length]!;
      const res = await request(app).get(path).set("X-Forwarded-For", botIp);
      expect(res.status).toBe(200);
    }

    const burstBlocked = await request(app).get("/api/public/catalog").set("X-Forwarded-For", botIp);
    expect(burstBlocked.status).toBe(429);
    expect(burstBlocked.body.code).toBe("RATE_LIMITED");
    expect(Number(burstBlocked.headers["retry-after"])).toBeGreaterThan(0);

    // Người dùng từ IP khác truy cập công khai vẫn hoạt động bình thường
    const cleanVisitor = await request(app).get("/api/public/villages").set("X-Forwarded-For", "198.51.100.211");
    expect(cleanVisitor.status).toBe(200);
  });

  it("áp dụng giới hạn chuyên biệt trên các tác vụ nặng như quét lộ trình (/api/care-protocol/scan: tối đa 4 lần/phút)", async () => {
    const admin = await loginFromIp("0901234567", "203.0.113.88");
    // Lưu ý: login không tính vào user:admin vì /auth/login là @Public() tính theo IP.
    for (let i = 0; i < 4; i += 1) {
      const res = await admin.post("/api/care-protocol/scan").set("X-Forwarded-For", "203.0.113.88");
      expect(res.status).toBe(200);
    }
    const fifthScan = await admin.post("/api/care-protocol/scan").set("X-Forwarded-For", "203.0.113.88");
    expect(fifthScan.status).toBe(429);
    expect(fifthScan.body.code).toBe("RATE_LIMITED");
  });
});

