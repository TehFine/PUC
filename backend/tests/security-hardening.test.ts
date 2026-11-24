import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { createHash, createHmac, webcrypto } from "node:crypto";
import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import vm from "node:vm";
import request from "supertest";
import ts from "typescript";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { SecurityDefenseService } from "../src/auth/security-defense.service";
import { DatabaseService } from "../src/database/database.service";
import { NotificationsService, type RealtimeStreamEvent } from "../src/notifications/notifications.service";
import { TEST_PASSWORD } from "./constants";

interface FrontendRequestSecurityModule {
  sha256HexUtf8: (text: string) => string;
  hmacSha256Hex: (keyText: string, messageText: string) => string;
  generateRequestNonce: () => string;
  readCsrfSigningCookie: () => string | null;
  buildSignedSecurityHeaders: (
    method: string,
    fullApiPath: string,
    rawBody: string | undefined,
    calibratedNowMs: number,
  ) => Record<string, string>;
  copySensitiveWithAutoClear: (text: string, ttlMs?: number) => Promise<boolean>;
}

function loadFrontendSecurityRuntime(cookieRef: { cookie: string }, clipboardLog: string[]): FrontendRequestSecurityModule {
  const filePath = path.resolve(__dirname, "../../frontend/src/lib/request-security.ts");
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const modExports = {} as FrontendRequestSecurityModule;
  const sandbox = {
    exports: modExports,
    module: { exports: modExports },
    TextEncoder,
    Uint8Array,
    Uint32Array,
    DataView,
    Math,
    setTimeout,
    clearTimeout,
    crypto: webcrypto,
    document: {
      get cookie() {
        return cookieRef.cookie;
      },
    },
    navigator: {
      clipboard: {
        writeText: async (txt: string) => {
          clipboardLog.push(txt);
        },
      },
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: "request-security.ts" });
  return sandbox.module.exports;
}

function extractCookieValue(setCookies: string[] | string | undefined, name: string): string | null {
  const list = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
  for (const raw of list) {
    const firstPart = raw.split(";")[0] ?? "";
    const eq = firstPart.indexOf("=");
    if (eq > 0 && firstPart.slice(0, eq).trim() === name) {
      return decodeURIComponent(firstPart.slice(eq + 1).trim());
    }
  }
  return null;
}

const ADMIN_USERNAME = "0901234567";
const HTX_USERNAME = "0912345678";
const VILLAGE_PREFIX = "Thôn Kiểm Thử Bảo Mật ";

let nest: INestApplication;
let app: Server;
let db: DatabaseService;
let defense: SecurityDefenseService;
let notifications: NotificationsService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(instance);
  await instance.init();
  nest = instance;
  app = instance.getHttpServer() as Server;
  db = instance.get(DatabaseService);
  defense = instance.get(SecurityDefenseService);
  notifications = instance.get(NotificationsService);
});

afterEach(() => {
  defense.clearState();
});

afterAll(async () => {
  delete process.env.ANTI_REPLAY_ENFORCE;
  try {
    await db.query("DELETE FROM villages WHERE name LIKE $1", [`${VILLAGE_PREFIX}%`]);
    await db.query(
      "DELETE FROM notifications WHERE title LIKE 'Cảnh báo bảo mật:%' OR title = 'Đã thu hồi một phiên đăng nhập có dấu hiệu bất thường'",
    );
    await db.query(
      "DELETE FROM audit_logs WHERE action IN ('Chặn can thiệp gói tin API', 'Chặn đánh cắp phiên đăng nhập')",
    );
  } finally {
    await nest.close();
  }
});

describe("1. Kiểm tra chống lưu mật khẩu, chống rò rỉ bộ nhớ trình duyệt & đồng bộ mật mã giao diện", () => {
  it("đồng bộ tuyệt đối thuật toán SHA-256, HMAC-SHA256 và tự động xóa clipboard của frontend với Node crypto", async () => {
    const cookieRef = { cookie: "" };
    const clipboardLog: string[] = [];
    const feSec = loadFrontendSecurityRuntime(cookieRef, clipboardLog);

    const vectors = [
      "",
      "POST\n/api/auth/login\n1795378000000\nAbCdEfGhIjKlMnOpQrSt\n{\"username\":\"0901234567\"}",
      "Hợp tác xã Sầu riêng Cư Né - Đắk Lắk - Kiểm tra tiếng Việt UTF-8 100%",
      "x".repeat(512),
    ];

    for (const sample of vectors) {
      const expectedSha = createHash("sha256").update(sample, "utf8").digest("hex");
      expect(feSec.sha256HexUtf8(sample)).toBe(expectedSha);
    }

    const keys = [
      "short-session-csrf-key",
      "k".repeat(96), // Khóa dài hơn 1 block 64-byte để kiểm tra nhánh rút gọn khóa HMAC chuẩn RFC 2104
    ];
    for (const k of keys) {
      for (const sample of vectors) {
        const expectedHmac = createHmac("sha256", k).update(sample, "utf8").digest("hex");
        expect(feSec.hmacSha256Hex(k, sample)).toBe(expectedHmac);
      }
    }

    const nonceA = feSec.generateRequestNonce();
    const nonceB = feSec.generateRequestNonce();
    expect(nonceA).toMatch(/^[A-Za-z0-9_-]{20}$/);
    expect(nonceA).not.toBe(nonceB);

    const copied = await feSec.copySensitiveWithAutoClear("MatKhauTam123!", 35);
    expect(copied).toBe(true);
    expect(clipboardLog).toEqual(["MatKhauTam123!"]);
    await new Promise((resolve) => setTimeout(resolve, 65));
    expect(clipboardLog).toEqual(["MatKhauTam123!", ""]);
  });

  it("đảm bảo các biểu mẫu xác thực & quản trị chặn trình duyệt lưu mật khẩu và không rò rỉ thông tin nhạy cảm", () => {
    const feRoot = path.resolve(__dirname, "../../frontend");
    const readFe = (rel: string) => fs.readFileSync(path.join(feRoot, rel), "utf8");

    const authFields = readFe("src/components/auth/auth-fields.tsx");
    expect(authFields).toContain('autoComplete = "off"');
    expect(authFields).toContain('data-lpignore="true"');
    expect(authFields).toContain('data-1p-ignore="true"');
    expect(authFields).toContain('spellCheck={false}');

    const loginPage = readFe("src/app/login/page.tsx");
    expect(loginPage).toContain('autoComplete="off"');
    expect(loginPage).not.toContain("?username=");
    expect(loginPage).toContain('setPassword("")');

    const forgotPage = readFe("src/app/forgot-password/page.tsx");
    expect(forgotPage).toContain('autoComplete="off"');
    expect(forgotPage).toContain('cccd: "", newPassword: "", confirm: ""');
    expect(forgotPage).not.toContain("searchParams");

    const accountModal = readFe("src/components/settings/AccountFormModal.tsx");
    expect(accountModal).not.toContain('autoComplete="new-password"');
    expect(accountModal).toContain('autoComplete="off"');

    const householdModal = readFe("src/components/admin/households/HouseholdAccountModal.tsx");
    expect(householdModal).not.toContain("Math.random()");
    expect(householdModal).toContain("copySensitiveWithAutoClear");

    const authProvider = readFe("src/components/auth/AuthProvider.tsx");
    expect(authProvider).toContain('result.user.role === "farmer"');
    expect(authProvider).toContain("puc-map-tiles-v1");

    const offlineSync = readFe("src/lib/offline-sync.ts");
    expect(offlineSync).toContain('session?.user?.role !== "farmer"');

    const traceView = readFe("src/app/trace/[code]/TraceView.tsx");
    expect(traceView).not.toContain('searchParams.get("auditPass")');

    const nextConfig = readFe("next.config.ts");
    expect(nextConfig).toContain("removeConsole");
    expect(nextConfig).toContain('source: "/sw.js"');
  });
});

describe("2. Chặn công cụ dò quét lỗ hổng, quét endpoint nhạy cảm & gói tin URI dị dạng", () => {
  it("chặn ngay các User-Agent của công cụ tấn công / dò quét API tự động (403 FORBIDDEN)", async () => {
    const scannerUAs = [
      "sqlmap/1.8.2#stable (https://sqlmap.org)",
      "Mozilla/5.0 (compatible; Nuclei - Open-source project)",
      "ffuf/v2.1.0",
      "Nikto/2.5.0",
      "gobuster/3.6",
    ];

    for (const ua of scannerUAs) {
      const res = await request(app).get("/api/public/trace-samples").set("User-Agent", ua);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(res.headers["cache-control"]).toContain("no-store");
    }
  });

  it("chặn các đường dẫn dò cấu hình máy chủ, tài liệu Swagger/OpenAPI/GraphQL và leo thư mục (404 NOT_FOUND)", async () => {
    const probePaths = [
      "/.env",
      "/.env.production",
      "/.git/config",
      "/swagger",
      "/api/swagger-ui",
      "/api/api-docs",
      "/api/openapi.json",
      "/api/graphql",
      "/actuator/env",
      "/phpinfo.php",
      "/api/..%2f..%2fetc/passwd",
    ];

    for (const probe of probePaths) {
      const res = await request(app).get(probe);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
  });

  it("xử lý an toàn đường dẫn chứa chuỗi mã hóa phần trăm dị dạng (400 BAD_REQUEST thay vì lỗi 500)", async () => {
    const res = await request(app).get("/api/public/trace/%E0%A4%A");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });
});

describe("3. Chặn trích xuất dữ liệu API chéo trang qua Sec-Fetch-Site (Cross-Site Fetch Metadata)", () => {
  it("từ chối yêu cầu GET nội bộ mang Sec-Fetch-Site: cross-site kể cả khi có cookie phiên Admin", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: ADMIN_USERNAME, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);

    const blockedMe = await agent.get("/api/auth/me").set("Sec-Fetch-Site", "cross-site");
    expect(blockedMe.status).toBe(403);
    expect(blockedMe.body.code).toBe("FORBIDDEN");

    const blockedHouseholds = await agent.get("/api/households").set("Sec-Fetch-Site", "cross-site");
    expect(blockedHouseholds.status).toBe(403);
    expect(blockedHouseholds.body.code).toBe("FORBIDDEN");

    const sameOriginMe = await agent.get("/api/auth/me").set("Sec-Fetch-Site", "same-origin");
    expect(sameOriginMe.status).toBe(200);
    expect(sameOriginMe.body.user.username).toBe(ADMIN_USERNAME);

    // Endpoint công khai phục vụ quét mã QR từ ứng dụng ngoài vẫn hoạt động bình thường
    const publicSamples = await request(app)
      .get("/api/public/trace-samples")
      .set("Sec-Fetch-Site", "cross-site");
    expect(publicSamples.status).toBe(200);
  });
});

describe("4. Chống bắt gói tin phát lại (Anti-Replay) & chống giả mạo nội dung/đường dẫn API (RequestIntegrityGuard)", () => {
  it("cấp khóa phiên htx_csrf khi đăng nhập và chặn mọi hành vi bắt gói, phát lại hoặc sửa payload/endpoint", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: ADMIN_USERNAME, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);

    const setCookies = loginRes.headers["set-cookie"] as unknown as string[];
    expect(Array.isArray(setCookies)).toBe(true);
    const accessLine = setCookies.find((c) => c.startsWith("htx_access=")) ?? "";
    const refreshLine = setCookies.find((c) => c.startsWith("htx_refresh=")) ?? "";
    const csrfLine = setCookies.find((c) => c.startsWith("htx_csrf=")) ?? "";

    expect(accessLine.toLowerCase()).toContain("httponly");
    expect(refreshLine.toLowerCase()).toContain("httponly");
    expect(csrfLine).toContain("htx_csrf=");
    expect(csrfLine.toLowerCase()).not.toContain("httponly");
    expect(csrfLine.toLowerCase()).toContain("samesite=lax");

    const csrfKey = extractCookieValue(setCookies, "htx_csrf");
    expect(csrfKey).toBeTruthy();
    expect((csrfKey ?? "").length).toBeGreaterThanOrEqual(32);

    const cookieRef = { cookie: `htx_csrf=${encodeURIComponent(csrfKey ?? "")}` };
    const feSec = loadFrontendSecurityRuntime(cookieRef, []);

    process.env.ANTI_REPLAY_ENFORCE = "true";
    try {
      // 4.1. Dùng công cụ bên ngoài (curl/Postman) gửi thẳng POST không kèm chữ ký toàn vẹn -> 403 INTEGRITY_REQUIRED
      const unsignedRes = await agent
        .post("/api/villages")
        .send({ name: `${VILLAGE_PREFIX}Unsigned` });
      expect(unsignedRes.status).toBe(403);
      expect(unsignedRes.body.code).toBe("INTEGRITY_REQUIRED");

      // 4.2. Yêu cầu hợp lệ được ký bởi bộ ký của Frontend -> 201 Thành công
      const validBody = JSON.stringify({ name: `${VILLAGE_PREFIX}ValidSigned01` });
      const validHeaders = feSec.buildSignedSecurityHeaders(
        "POST",
        "/api/villages",
        validBody,
        Date.now(),
      );
      expect(validHeaders["X-PUC-Signature"]).toMatch(/^[0-9a-f]{64}$/);

      const acceptedRes = await agent
        .post("/api/villages")
        .set("Content-Type", "application/json")
        .set(validHeaders)
        .send(validBody);
      expect(acceptedRes.status).toBe(201);

      // 4.3. Tấn công phát lại (Replay Attack): bắt nguyên gói tin vừa gửi thành công và phát lại lần 2 -> 403 REPLAY_DETECTED
      const replayRes = await agent
        .post("/api/villages")
        .set("Content-Type", "application/json")
        .set(validHeaders)
        .send(validBody);
      expect(replayRes.status).toBe(403);
      expect(replayRes.body.code).toBe("REPLAY_DETECTED");

      // 4.4. Tấn công sửa nội dung gói tin (Body Tampering qua proxy Burp Suite) -> 403 PAYLOAD_TAMPERED
      const origBody = JSON.stringify({ name: `${VILLAGE_PREFIX}OrigBody` });
      const tamperedBody = JSON.stringify({ name: `${VILLAGE_PREFIX}TamperedByProxy`, areaHa: 999 });
      const tamperHeaders = feSec.buildSignedSecurityHeaders(
        "POST",
        "/api/villages",
        origBody,
        Date.now(),
      );
      const bodyTamperRes = await agent
        .post("/api/villages")
        .set("Content-Type", "application/json")
        .set(tamperHeaders)
        .send(tamperedBody);
      expect(bodyTamperRes.status).toBe(403);
      expect(bodyTamperRes.body.code).toBe("PAYLOAD_TAMPERED");

      // 4.5. Tấn công tráo đường dẫn Endpoint / Query String bằng chữ ký của endpoint khác -> 403 PAYLOAD_TAMPERED
      defense.clearState();
      const pathHeaders = feSec.buildSignedSecurityHeaders(
        "POST",
        "/api/villages",
        origBody,
        Date.now(),
      );
      const pathTamperRes = await agent
        .post("/api/villages?bypass=1")
        .set("Content-Type", "application/json")
        .set(pathHeaders)
        .send(origBody);
      expect(pathTamperRes.status).toBe(403);
      expect(pathTamperRes.body.code).toBe("PAYLOAD_TAMPERED");

      // 4.6. Gói tin quá hạn thời gian thực (> 120 giây) -> 403 REQUEST_EXPIRED
      const expiredHeaders = feSec.buildSignedSecurityHeaders(
        "POST",
        "/api/villages",
        origBody,
        Date.now() - 300_000,
      );
      const expiredRes = await agent
        .post("/api/villages")
        .set("Content-Type", "application/json")
        .set(expiredHeaders)
        .send(origBody);
      expect(expiredRes.status).toBe(403);
      expect(expiredRes.body.code).toBe("REQUEST_EXPIRED");

      // 4.7. Có tính lại SHA-256 payload hợp lệ nhưng giả mạo chữ ký phiên HMAC-SHA256 -> 403 INVALID_SIGNATURE
      cookieRef.cookie = `htx_csrf=${"f".repeat(48)}`;
      const forgedHeaders = feSec.buildSignedSecurityHeaders(
        "POST",
        "/api/villages",
        origBody,
        Date.now(),
      );
      const forgedRes = await agent
        .post("/api/villages")
        .set("Content-Type", "application/json")
        .set(forgedHeaders)
        .send(origBody);
      expect(forgedRes.status).toBe(403);
      expect(forgedRes.body.code).toBe("INVALID_SIGNATURE");

      // 4.8. Bỏ trống chữ ký phiên X-PUC-Signature khi đang dùng phiên có htx_csrf -> 403 SIGNATURE_REQUIRED
      cookieRef.cookie = "";
      const missingSigHeaders = feSec.buildSignedSecurityHeaders(
        "POST",
        "/api/villages",
        origBody,
        Date.now(),
      );
      expect(missingSigHeaders["X-PUC-Signature"]).toBeUndefined();
      const missingSigRes = await agent
        .post("/api/villages")
        .set("Content-Type", "application/json")
        .set(missingSigHeaders)
        .send(origBody);
      expect(missingSigRes.status).toBe(403);
      expect(missingSigRes.body.code).toBe("SIGNATURE_REQUIRED");

      // 4.9. Trùng lặp dữ liệu trả mã chuẩn CONFLICT thay vì làm lộ mã SQLSTATE DB_23505 của PostgreSQL
      cookieRef.cookie = `htx_csrf=${encodeURIComponent(csrfKey ?? "")}`;
      const dupHeaders = feSec.buildSignedSecurityHeaders(
        "POST",
        "/api/villages",
        validBody,
        Date.now(),
      );
      const dupRes = await agent
        .post("/api/villages")
        .set("Content-Type", "application/json")
        .set(dupHeaders)
        .send(validBody);
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe("CONFLICT");
      expect(String(dupRes.body.code)).not.toContain("DB_");

      // 4.10. Giả mạo Content-Type: multipart/form-data trên endpoint JSON để lách chữ ký -> bị chặn 403 INTEGRITY_REQUIRED
      defense.clearState();
      const spoofedMultipartRes = await agent
        .post("/api/villages")
        .field("name", `${VILLAGE_PREFIX}MultipartBypass`);
      expect(spoofedMultipartRes.status).toBe(403);
      expect(spoofedMultipartRes.body.code).toBe("INTEGRITY_REQUIRED");

      // 4.11. Bóc bỏ đồng thời cả cookie htx_csrf lẫn header X-PUC-Signature (chỉ giữ htx_access + SHA-256 trần) -> vẫn bị chặn 403 SIGNATURE_REQUIRED
      defense.clearState();
      const rawAccessOnly = extractCookieValue(setCookies, "htx_access")!;
      cookieRef.cookie = "";
      const strippedCsrfBody = JSON.stringify({ name: `${VILLAGE_PREFIX}StrippedBothCsrfAndSig` });
      const unkeyedHeaders = feSec.buildSignedSecurityHeaders(
        "POST",
        "/api/villages",
        strippedCsrfBody,
        Date.now(),
      );
      expect(unkeyedHeaders["X-PUC-Signature"]).toBeUndefined();
      const strippedBothRes = await request(app)
        .post("/api/villages")
        .set("Cookie", `htx_access=${encodeURIComponent(rawAccessOnly)}`)
        .set("Content-Type", "application/json")
        .set(unkeyedHeaders)
        .send(strippedCsrfBody);
      expect(strippedBothRes.status).toBe(403);
      expect(strippedBothRes.body.code).toBe("SIGNATURE_REQUIRED");
    } finally {
      delete process.env.ANTI_REPLAY_ENFORCE;
    }
  });
});

describe("5. Ẩn thông số hạ tầng nhạy cảm trên /api/health & chống nhiễm bộ nhớ đệm qua Vary: Cookie", () => {
  it("ẩn dbLatencyMs đối với người gọi ẩn danh nhưng vẫn trả đầy đủ cho Quản trị viên", async () => {
    const anonHealth = await request(app).get("/api/health");
    expect(anonHealth.status).toBe(200);
    expect(anonHealth.body.status).toBe("ok");
    expect(anonHealth.body.dbLatencyMs).toBeNull();

    const adminAgent = request.agent(app);
    const loginRes = await adminAgent
      .post("/api/auth/login")
      .send({ username: ADMIN_USERNAME, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);

    const adminHealth = await adminAgent.get("/api/health");
    expect(adminHealth.status).toBe(200);
    expect(typeof adminHealth.body.dbLatencyMs).toBe("number");

    const samplesRes = await request(app)
      .get("/api/public/trace-samples")
      .set("Accept-Encoding", "gzip");
    expect(samplesRes.status).toBe(200);
    expect(String(samplesRes.headers["vary"] ?? "").toLowerCase()).toContain("cookie");
  });
});

describe("6. Tự động thu hồi phiên, khóa tạm thiết bị 15 phút & đẩy cảnh báo realtime khi phát hiện dùng Burp Suite can thiệp gói tin", () => {
  it("thu hồi ngay phiên đăng nhập trong CSDL, cách ly thiết bị (429 SECURITY_QUARANTINED) và bắn thông báo SSE cho Quản trị viên sau 3 lần sửa gói tin", async () => {
    const adminRow = await db.query<{ id: number }>("SELECT id FROM users WHERE username = $1", [ADMIN_USERNAME]);
    const adminId = Number(adminRow.rows[0].id);
    const liveAlerts: RealtimeStreamEvent[] = [];
    const unsubscribe = notifications.subscribeUserStream(adminId, "admin", (ev) => {
      liveAlerts.push(ev);
    });

    const browserUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    try {
      const loginRes = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", browserUa)
        .send({ username: HTX_USERNAME, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);

      const setCookies = loginRes.headers["set-cookie"] as unknown as string[];
      const accessToken = extractCookieValue(setCookies, "htx_access")!;
      const csrfKey = extractCookieValue(setCookies, "htx_csrf")!;
      const cookieHeader = `htx_access=${encodeURIComponent(accessToken)}; htx_csrf=${encodeURIComponent(csrfKey)}`;

      const feSec = loadFrontendSecurityRuntime({ cookie: `htx_csrf=${encodeURIComponent(csrfKey)}` }, []);
      const origBody = JSON.stringify({ name: `${VILLAGE_PREFIX}LegitPayload` });
      const tamperedBody = JSON.stringify({ name: `${VILLAGE_PREFIX}BurpModified`, areaHa: 888 });

      // Lần 1 & Lần 2 sửa payload trong Burp Repeater -> bị từ chối 403 PAYLOAD_TAMPERED (tích lũy 2 + 2 = 4 điểm)
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const headers = feSec.buildSignedSecurityHeaders("POST", "/api/villages", origBody, Date.now());
        const res = await request(app)
          .post("/api/villages")
          .set("User-Agent", browserUa)
          .set("Cookie", cookieHeader)
          .set("Content-Type", "application/json")
          .set(headers)
          .send(tamperedBody);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("PAYLOAD_TAMPERED");
      }

      // Lần 3 sửa payload trong Burp Repeater -> chạm ngưỡng 6 điểm -> KÍCH HOẠT PHÒNG THỦ CHỦ ĐỘNG!
      const thirdHeaders = feSec.buildSignedSecurityHeaders("POST", "/api/villages", origBody, Date.now());
      const lockdownRes = await request(app)
        .post("/api/villages")
        .set("User-Agent", browserUa)
        .set("Cookie", cookieHeader)
        .set("Content-Type", "application/json")
        .set(thirdHeaders)
        .send(tamperedBody);
      expect(lockdownRes.status).toBe(429);
      expect(lockdownRes.body.code).toBe("SECURITY_QUARANTINED");
      expect(Number(lockdownRes.headers["retry-after"])).toBeGreaterThan(0);

      // Mọi yêu cầu tiếp theo từ thiết bị này (kể cả GET) đều bị chặn ngay tại cổng chắn HTTP Shield trước khi vào DB
      const blockedGet = await request(app)
        .get("/api/auth/me")
        .set("User-Agent", browserUa)
        .set("Cookie", cookieHeader);
      expect(blockedGet.status).toBe(429);
      expect(blockedGet.body.code).toBe("SECURITY_QUARANTINED");

      // Kể cả sau khi hết thời gian cách ly tạm thời, cookie phiên cũ vẫn vĩnh viễn vô hiệu do đã bị thu hồi trong PostgreSQL
      defense.clearState();
      const afterQuarantineMe = await request(app)
        .get("/api/auth/me")
        .set("User-Agent", browserUa)
        .set("Cookie", cookieHeader);
      expect(afterQuarantineMe.status).toBe(401);

      // Kiểm tra thông báo thời gian thực tới Quản trị viên và Nhật ký kiểm toán bảo mật
      expect(
        liveAlerts.some(
          (ev) =>
            ev.type === "notification" &&
            ev.item.title.includes("Chặn hành vi can thiệp gói tin API") &&
            (ev.item.body ?? "").includes(HTX_USERNAME),
        ),
      ).toBe(true);

      const auditCheck = await db.query<{ cnt: string }>(
        "SELECT count(*)::text AS cnt FROM audit_logs WHERE action = 'Chặn can thiệp gói tin API' AND object = $1",
        [HTX_USERNAME],
      );
      expect(Number(auditCheck.rows[0].cnt)).toBeGreaterThanOrEqual(1);
    } finally {
      unsubscribe();
    }
  });
});

describe("7. Khóa chặt phiên theo thiết bị (Session Binding) chống đánh cắp cookie sang công cụ bên ngoài", () => {
  it("cho phép trình duyệt tự cập nhật phiên bản bình thường nhưng thu hồi ngay phiên khi cookie bị dán sang Python/curl", async () => {
    const adminRow = await db.query<{ id: number }>("SELECT id FROM users WHERE username = $1", [ADMIN_USERNAME]);
    const adminId = Number(adminRow.rows[0].id);
    const liveAlerts: RealtimeStreamEvent[] = [];
    const unsubscribe = notifications.subscribeUserStream(adminId, "admin", (ev) => {
      liveAlerts.push(ev);
    });

    const chrome131Win =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const chrome132Win =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

    try {
      const loginRes = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", chrome131Win)
        .send({ username: HTX_USERNAME, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);

      const setCookies = loginRes.headers["set-cookie"] as unknown as string[];
      const accessToken = extractCookieValue(setCookies, "htx_access")!;
      const refreshToken = extractCookieValue(setCookies, "htx_refresh")!;
      const cookieHeader = `htx_access=${encodeURIComponent(accessToken)}`;

      // 7.1. Trình duyệt Chrome tự nâng cấp từ bản 131 lên 132 trên cùng hệ điều hành Windows -> hoạt động mượt mà
      const upgradedOk = await request(app)
        .get("/api/auth/me")
        .set("User-Agent", chrome132Win)
        .set("Cookie", cookieHeader);
      expect(upgradedOk.status).toBe(200);
      expect(upgradedOk.body.user.username).toBe(HTX_USERNAME);

      // 7.2. Kẻ xấu đánh cắp cookie htx_access mang sang script Python -> bị chặn 401 SESSION_BINDING_MISMATCH & hủy phiên ngay!
      const hijackedRes = await request(app)
        .get("/api/auth/me")
        .set("User-Agent", "python-requests/2.32.3")
        .set("Cookie", cookieHeader);
      expect(hijackedRes.status).toBe(401);
      expect(hijackedRes.body.code).toBe("SESSION_BINDING_MISMATCH");

      // Phiên đó đã bị thu hồi ngay trong PostgreSQL nên dùng lại cookie đó không còn hiệu lực
      const deadSessionRes = await request(app)
        .get("/api/auth/me")
        .set("User-Agent", chrome131Win)
        .set("Cookie", cookieHeader);
      expect(deadSessionRes.status).toBe(401);

      // 7.3. Kẻ xấu đánh cắp cả htx_refresh mang sang curl để xin cấp mới token -> bị từ chối 401 & thu hồi toàn bộ họ phiên
      const login2 = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", chrome131Win)
        .send({ username: HTX_USERNAME, password: TEST_PASSWORD });
      expect(login2.status).toBe(200);
      const refresh2 = extractCookieValue(login2.headers["set-cookie"] as unknown as string[], "htx_refresh")!;

      const hijackRefreshRes = await request(app)
        .post("/api/auth/refresh")
        .set("User-Agent", "curl/8.7.1")
        .set("Cookie", `htx_refresh=${encodeURIComponent(refresh2)}`);
      expect(hijackRefreshRes.status).toBe(401);

      expect(
        liveAlerts.some(
          (ev) =>
            ev.type === "notification" &&
            ev.item.title.includes("Chặn nghi vấn đánh cắp cookie phiên") &&
            (ev.item.body ?? "").includes(HTX_USERNAME),
        ),
      ).toBe(true);

      const auditCheck = await db.query<{ cnt: string }>(
        "SELECT count(*)::text AS cnt FROM audit_logs WHERE action = 'Chặn đánh cắp phiên đăng nhập' AND object = $1",
        [HTX_USERNAME],
      );
      expect(Number(auditCheck.rows[0].cnt)).toBeGreaterThanOrEqual(1);
    } finally {
      unsubscribe();
    }
  });
});


