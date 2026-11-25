import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { createHash, webcrypto } from "node:crypto";
import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import vm from "node:vm";
import request from "supertest";
import ts from "typescript";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { SecurityDefenseService } from "../src/auth/security-defense.service";
import { generateTotpCode } from "../src/common/crypto/totp";
import { DatabaseService } from "../src/database/database.service";
import { TEST_PASSWORD } from "./constants";

const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000c49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
  "hex",
);

interface FrontendRequestSecurityModule {
  buildSignedSecurityHeaders: (
    method: string,
    fullApiPath: string,
    rawBody: string | undefined,
    calibratedNowMs: number,
  ) => Record<string, string>;
}

function loadFrontendSecurityRuntime(cookieRef: { cookie: string }): FrontendRequestSecurityModule {
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
        writeText: async () => undefined,
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

let nest: INestApplication;
let app: Server;
let db: DatabaseService;
let defense: SecurityDefenseService;

const createdUsernames: string[] = [];
const createdHouseholdIds: number[] = [];
const createdPassIds: number[] = [];
const createdVillageNames: string[] = [];

async function loggedIn(username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(instance);
  await instance.init();
  nest = instance;
  app = instance.getHttpServer() as Server;
  db = instance.get(DatabaseService);
  defense = instance.get(SecurityDefenseService);
});

afterEach(() => {
  defense.clearState();
  delete process.env.ANTI_REPLAY_ENFORCE;
});

afterAll(async () => {
  delete process.env.ANTI_REPLAY_ENFORCE;
  try {
    if (createdPassIds.length > 0) {
      await db.query("DELETE FROM field_audit_passes WHERE id = ANY($1::bigint[])", [createdPassIds]);
    }
    if (createdHouseholdIds.length > 0) {
      await db.query("DELETE FROM member_deletion_requests WHERE target_type = 'household' AND target_id = ANY($1::bigint[])", [
        createdHouseholdIds,
      ]);
      await db.query("DELETE FROM violations WHERE household_id = ANY($1::bigint[])", [createdHouseholdIds]);
      await db.query("DELETE FROM households WHERE id = ANY($1::bigint[])", [createdHouseholdIds]);
    }
    if (createdUsernames.length > 0) {
      await db.query(
        "DELETE FROM member_deletion_requests WHERE target_type = 'account' AND target_id IN (SELECT id FROM users WHERE username = ANY($1::text[]))",
        [createdUsernames],
      );
      await db.query("DELETE FROM users WHERE username = ANY($1::text[])", [createdUsernames]);
    }
    if (createdVillageNames.length > 0) {
      await db.query("DELETE FROM villages WHERE name = ANY($1::text[])", [createdVillageNames]);
    }
  } finally {
    await nest.close();
  }
});

describe("VULN-01: Bảo vệ kiểm soát chéo hai người (Dual-Control Separation of Duties)", () => {
  it("chặn Trưởng HTX tự tạo/đặt lại Phó HTX và chặn Admin xoay vòng Phó HTX khi đang có yêu cầu xóa chờ duyệt", async () => {
    const admin = await loggedIn(ADMIN_USERNAME);
    const ts = Date.now();
    const headUser = `audit_head_${ts}`;
    const deputyUser = `audit_deputy_${ts}`;
    const puppetDeputyUser = `audit_puppet_${ts}`;
    const targetFarmerUser = `0978${String(ts).slice(-6)}`;
    createdUsernames.push(headUser, deputyUser, puppetDeputyUser, targetFarmerUser);

    const headCreated = await admin.post("/api/accounts").send({
      fullName: "Trưởng HTX Kiểm Thử Bảo Mật",
      username: headUser,
      password: "HeadPassword123",
      role: "htx_head",
    });
    expect(headCreated.status).toBe(201);

    const deputyCreated = await admin.post("/api/accounts").send({
      fullName: "Phó HTX Độc Lập",
      username: deputyUser,
      password: "DeputyPassword123",
      role: "htx_deputy",
    });
    expect(deputyCreated.status).toBe(201);
    const deputyId = Number(deputyCreated.body.id);

    const headAgent = await loggedIn(headUser, "HeadPassword123");

    // 1. Trưởng HTX không được tự tạo tài khoản Phó HTX hay đặt lại mật khẩu / 2FA của Phó HTX
    expect(
      (
        await headAgent.post("/api/accounts").send({
          fullName: "Phó HTX Giả Lập",
          username: puppetDeputyUser,
          password: "PuppetPassword123",
          role: "htx_deputy",
        })
      ).status,
    ).toBe(403);

    expect(
      (await headAgent.patch(`/api/accounts/${deputyId}`).send({ password: "HijackPassword123" })).status,
    ).toBe(403);

    expect((await headAgent.post(`/api/accounts/${deputyId}/reset-2fa`).send({})).status).toBe(403);

    // 2. Khi Admin đang có yêu cầu xóa chờ duyệt, Admin không được tạo thêm Phó HTX mới hoặc đặt lại mật khẩu Phó HTX để tự duyệt
    const targetAcc = await admin.post("/api/accounts").send({
      fullName: "Tài Khoản Mục Tiêu Xóa",
      username: targetFarmerUser,
      password: "FarmerPassword123",
      role: "farmer",
    });
    expect(targetAcc.status).toBe(201);
    const targetAccId = Number(targetAcc.body.id);

    const delReq = await admin.delete(`/api/accounts/${targetAccId}`);
    expect([200, 201]).toContain(delReq.status);
    const delReqId = Number(delReq.body.request?.id ?? delReq.body.id);
    expect(delReqId).toBeGreaterThan(0);

    try {
      expect(
        (
          await admin.post("/api/accounts").send({
            fullName: "Phó HTX Tạo Khi Đang Chờ Xóa",
            username: puppetDeputyUser,
            password: "PuppetPassword123",
            role: "htx_deputy",
          })
        ).status,
      ).toBe(403);

      expect(
        (await admin.patch(`/api/accounts/${deputyId}`).send({ password: "ResetWhilePending123" })).status,
      ).toBe(403);
    } finally {
      await admin.post(`/api/deletion-requests/${delReqId}/cancel`).send({});
      await db.query("DELETE FROM users WHERE id = $1", [deputyId]);
    }
  });
});

describe("VULN-02 & VULN-08: Chữ ký toàn vẹn trên /api/plots/import, /api/uploads và đăng xuất an toàn", () => {
  it("bắt buộc ký số trên /api/plots/import và /api/uploads khi bật ANTI_REPLAY_ENFORCE, đồng thời cho phép /api/auth/logout", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: ADMIN_USERNAME, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
    const setCookies = loginRes.headers["set-cookie"] as unknown as string[];
    const accessToken = extractCookieValue(setCookies, "htx_access")!;
    const refreshToken = extractCookieValue(setCookies, "htx_refresh")!;
    const csrfKey = extractCookieValue(setCookies, "htx_csrf")!;
    const cookieHeader = `htx_access=${encodeURIComponent(accessToken)}; htx_refresh=${encodeURIComponent(refreshToken)}; htx_csrf=${encodeURIComponent(csrfKey)}`;
    const feSec = loadFrontendSecurityRuntime({ cookie: `htx_csrf=${encodeURIComponent(csrfKey)}` });

    process.env.ANTI_REPLAY_ENFORCE = "true";

    // 1. Gửi thẳng /api/plots/import không chữ ký -> 403 INTEGRITY_REQUIRED (không còn lỗ hổng rawBody === undefined)
    const unsignedImport = await request(app)
      .post("/api/plots/import")
      .set("Cookie", cookieHeader)
      .send({ collection: { type: "FeatureCollection", features: [] } });
    expect(unsignedImport.status).toBe(403);
    expect(unsignedImport.body.code).toBe("INTEGRITY_REQUIRED");

    // 2. Sửa nội dung JSON trên /api/plots/import qua proxy -> 403 PAYLOAD_TAMPERED
    defense.clearState();
    const origImportBody = JSON.stringify({ collection: { type: "FeatureCollection", features: [] } });
    const tamperedImportBody = JSON.stringify({
      sourceRef: "tampered",
      collection: { type: "FeatureCollection", features: [] },
    });
    const importHeaders = feSec.buildSignedSecurityHeaders("POST", "/api/plots/import", origImportBody, Date.now());
    const tamperedImport = await request(app)
      .post("/api/plots/import")
      .set("Cookie", cookieHeader)
      .set("Content-Type", "application/json")
      .set(importHeaders)
      .send(tamperedImportBody);
    expect(tamperedImport.status).toBe(403);
    expect(tamperedImport.body.code).toBe("PAYLOAD_TAMPERED");

    // 3. Gửi multipart /api/uploads không chữ ký -> 403 INTEGRITY_REQUIRED; có chữ ký multipart:<sha256> -> 201
    defense.clearState();
    const unsignedUpload = await request(app)
      .post("/api/uploads")
      .set("Cookie", cookieHeader)
      .field("purpose", "journal")
      .attach("file", TINY_PNG, "unsigned.png");
    expect(unsignedUpload.status).toBe(403);
    expect(unsignedUpload.body.code).toBe("INTEGRITY_REQUIRED");

    defense.clearState();
    const pngHash = createHash("sha256").update(TINY_PNG).digest("hex");
    const uploadHeaders = feSec.buildSignedSecurityHeaders(
      "POST",
      "/api/uploads",
      `multipart:${pngHash}`,
      Date.now(),
    );
    const signedUpload = await request(app)
      .post("/api/uploads")
      .set("Cookie", cookieHeader)
      .set("X-Upload-Sha256", pngHash)
      .set(uploadHeaders)
      .field("purpose", "journal")
      .attach("file", TINY_PNG, "signed.png");
    expect(signedUpload.status).toBe(201);

    // 4. Đăng xuất khẩn cấp khi mất htx_csrf (chỉ có timestamp/nonce/hash, không chữ ký) vẫn cho phép 200 OK
    const anonSec = loadFrontendSecurityRuntime({ cookie: "" });
    const logoutBody = "{}";
    const logoutHeaders = anonSec.buildSignedSecurityHeaders("POST", "/api/auth/logout", logoutBody, Date.now());
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", `htx_access=${encodeURIComponent(accessToken)}; htx_refresh=${encodeURIComponent(refreshToken)}`)
      .set("Content-Type", "application/json")
      .set(logoutHeaders)
      .send(logoutBody);
    expect(logoutRes.status).toBe(200);
  });
});

describe("VULN-03, VULN-04, VULN-05, VULN-06, VULN-09, VULN-11 & VULN-13: Cô lập phạm vi, bảo vệ PII và chống dò QR tuần tự", () => {
  it("chặn lật địa bàn thôn, chặn thẻ thẩm định wildcard, che CCCD preview, bảo vệ consent/vi phạm hộ và chặn dò mã QR công khai", async () => {
    const admin = await loggedIn(ADMIN_USERNAME);
    const htx = await loggedIn(HTX_USERNAME);
    const ts = Date.now();

    // 1. VULN-03: Không cho phép đổi tên thôn Cư Né thành tên thôn thuộc xã Ea Khăl để lật phân vùng thẩm quyền
    const vName = `Thôn Kiểm Thử V03 ${ts}`;
    createdVillageNames.push(vName);
    const vCreated = await htx.post("/api/villages").send({ name: vName });
    expect(vCreated.status).toBe(201);
    const flipRes = await htx.patch(`/api/villages/${vCreated.body.id}`).send({
      name: `Thôn Ea Khăl Giả Mạo ${ts}`,
    });
    expect(flipRes.status).toBe(403);

    // 2. VULN-04: Cán bộ kỹ thuật HTX không được tạo thẻ thẩm định không giới hạn vùng trồng và không thu hồi thẻ của Quản trị viên
    const adminPass = await admin.post("/api/field-audit-passes").send({
      delegationName: "Đoàn Cấp Tỉnh VULN04",
      organization: "Sở NN&MT",
      durationHours: 12,
    });
    expect(adminPass.status).toBe(201);
    createdPassIds.push(Number(adminPass.body.id));

    expect(
      (
        await htx.post("/api/field-audit-passes").send({
          delegationName: "Đoàn Wildcard Trái Phép",
          durationHours: 12,
        })
      ).status,
    ).toBe(403);

    expect((await htx.patch(`/api/field-audit-passes/${adminPass.body.id}/revoke`).send({})).status).toBe(403);

    // 3 & 4. VULN-05 & VULN-06: Cán bộ không được tự bật publicTraceConsent=true thay nông hộ, không xóa violation khi còn vi phạm mở, và ?audit=1&preview=1 luôn che CCCD
    const v1Res = await db.query<{ id: number }>("SELECT id FROM villages WHERE name = 'Thôn 1' LIMIT 1");
    const v1Id = Number(v1Res.rows[0].id);
    const hhCode = `V06-H${String(ts).slice(-5)}`;
    const forcedConsent = await htx.post("/api/households").send({
      code: hhCode,
      name: "Hộ Kiểm Thử VULN06",
      cccd: `26099${String(ts).slice(-7)}`,
      phone: `0966${String(ts).slice(-6)}`,
      villageId: v1Id,
      plotCount: 1,
      areaHa: 1.0,
      status: "qualified",
      publicTraceConsent: true,
    });
    expect(forcedConsent.status).toBe(403);

    const hhOk = await htx.post("/api/households").send({
      code: hhCode,
      name: "Hộ Kiểm Thử VULN06",
      cccd: `26099${String(ts).slice(-7)}`,
      phone: `0966${String(ts).slice(-6)}`,
      villageId: v1Id,
      plotCount: 1,
      areaHa: 1.0,
      status: "qualified",
    });
    expect(hhOk.status).toBe(201);
    const hhId = Number(hhOk.body.id);
    createdHouseholdIds.push(hhId);

    const previewAudit = await htx.get(
      `/api/reports/household-logbook?format=json&householdId=${hhId}&audit=1&preview=1`,
    );
    expect(previewAudit.status).toBe(200);
    expect(String(previewAudit.body.householdMeta?.cccd ?? "")).toMatch(/^\*{10}\d{2}$/);

    expect((await htx.patch(`/api/households/${hhId}`).send({ publicTraceConsent: true })).status).toBe(403);

    const violCreated = await admin.post("/api/violations").send({
      householdId: hhId,
      severity: "critical",
      title: "Vi phạm mở VULN06",
      detectedOn: "2026-05-01",
      description: "Chưa khắc phục xong",
    });
    expect(violCreated.status).toBe(201);
    expect((await htx.patch(`/api/households/${hhId}`).send({ status: "qualified" })).status).toBe(400);

    // 5. VULN-09: Tắt xác thực 2 lớp bắt buộc đồng thời mật khẩu hiện tại VÀ mã OTP / mã dự phòng
    const mfaUser = `v09_mfa_${ts}`;
    createdUsernames.push(mfaUser);
    const mfaCreated = await admin.post("/api/accounts").send({
      fullName: "Kiểm Tra Tắt 2FA Kép",
      username: mfaUser,
      password: "MfaPassword123",
      role: "inspector",
      assignedRegion: "Tỉnh Đắk Lắk",
    });
    expect(mfaCreated.status).toBe(201);
    const mfaAgent = await loggedIn(mfaUser, "MfaPassword123");
    const setup2fa = await mfaAgent.post("/api/auth/2fa/setup");
    expect(setup2fa.status).toBe(200);
    const enableCode = generateTotpCode(setup2fa.body.secret as string, Date.now() - 30_000);
    const enabled2fa = await mfaAgent.post("/api/auth/2fa/enable").send({
      code: enableCode,
      currentPassword: "MfaPassword123",
    });
    expect(enabled2fa.status).toBe(200);
    const backupCodes = enabled2fa.body.backupCodes as string[];

    // Chỉ gửi mật khẩu (thiếu OTP/backup) -> 400; chỉ gửi mã dự phòng (thiếu mật khẩu) -> 400
    expect((await mfaAgent.post("/api/auth/2fa/disable").send({ currentPassword: "MfaPassword123" })).status).toBe(400);
    expect((await mfaAgent.post("/api/auth/2fa/disable").send({ code: backupCodes[0] })).status).toBe(400);
    // Đủ cả hai yếu tố -> 200 OK
    expect(
      (
        await mfaAgent.post("/api/auth/2fa/disable").send({
          currentPassword: "MfaPassword123",
          code: backupCodes[0],
        })
      ).status,
    ).toBe(200);

    // 6. VULN-11: Tệp tải lên purpose='news' chưa gắn vào bản tin published không được mở công khai ẩn danh
    const draftNewsUpload = await htx.post("/api/uploads").field("purpose", "news").attach("file", TINY_PNG, "draft.png");
    expect(draftNewsUpload.status).toBe(201);
    const anonDraftFetch = await request(app).get(draftNewsUpload.body.url as string);
    expect(anonDraftFetch.status).toBe(404);
    const staffDraftFetch = await htx.get(draftNewsUpload.body.url as string);
    expect(staffDraftFetch.status).toBe(200);

    // 7. VULN-13: Khách chưa đăng nhập chỉ mở được bằng qr_token ngẫu nhiên, chặn toàn bộ mã tuần tự (lô, thửa, hộ, vùng)
    for (const seqCode of ["LH-2024-038", "KB-H001-000001", "TH1-001", hhCode, "VN-DLOR-0086"]) {
      expect((await request(app).get(`/api/public/trace/${encodeURIComponent(seqCode)}`)).status).toBe(404);
    }
    const seedLotQr = (
      await db.query<{ qr_token: string }>("SELECT qr_token FROM harvest_lots WHERE code = 'LH-2024-038' LIMIT 1")
    ).rows[0].qr_token;
    const validQrScan = await request(app).get(`/api/public/trace/${encodeURIComponent(seedLotQr)}`);
    expect(validQrScan.status).toBe(200);
  });
});

describe("Node.js Tháng 10-11/2026 CVEs: Phòng thủ chống Node2Shell (CVE-2026-111497) & giả mạo Host Unicode (CVE-2026-105483)", () => {
  it("chạy trên Node.js đã vá (>= 22.23.5) và chặn ngay gói tin Content-Encoding: br / Host Unicode dị dạng trước body-parser", async () => {
    const [major, minor, patch] = process.versions.node.split(".").map((n) => Number(n));
    const isPatchedNode =
      major > 22 ||
      (major === 22 && (minor > 23 || (minor === 23 && patch >= 5)));
    expect(isPatchedNode).toBe(true);

    // Chặn luồng nén Brotli độc hại (CVE-2026-111497 Node2Shell) ngay tại tầng khiên HTTP trước khi chạm node:zlib
    const brotliProbe = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "br")
      .send(Buffer.from([0xce, 0xb2, 0xcf, 0x81, 0x00, 0xff]));
    expect(brotliProbe.status).toBe(415);
    expect(brotliProbe.body.code).toBe("UNSUPPORTED_CONTENT_ENCODING");

    // Chặn cả Content-Encoding: gzip / chuỗi đa mã hóa trên thân request
    const multiEncodingProbe = await request(app)
      .post("/api/public/trace-access-requests")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "gzip, br")
      .send(Buffer.from("not-compressed", "utf8"));
    expect(multiEncodingProbe.status).toBe(415);
    expect(multiEncodingProbe.body.code).toBe("UNSUPPORTED_CONTENT_ENCODING");

    // Content-Encoding: identity hợp lệ vẫn đi qua bình thường
    const identityProbe = await request(app)
      .get("/api/health")
      .set("Content-Encoding", "identity");
    expect(identityProbe.status).toBe(200);

    // Chặn Host chứa chữ số Unicode fullwidth (CVE-2026-105483) qua socket TCP thô
    const rawHttpRes = await new Promise<string>((resolve, reject) => {
      const wasListening = app.listening;
      const runSocket = () => {
        const addr = app.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        const { createConnection } = require("node:net") as typeof import("node:net");
        const sock = createConnection({ host: "127.0.0.1", port }, () => {
          sock.write(
            Buffer.from(
              "GET /api/health HTTP/1.1\r\nHost: １２７.0.0.1:4000\r\nConnection: close\r\n\r\n",
              "utf8",
            ),
          );
        });
        let chunks = "";
        sock.setEncoding("utf8");
        sock.on("data", (d) => {
          chunks += d;
        });
        sock.on("end", () => {
          if (!wasListening) {
            app.close(() => resolve(chunks));
          } else {
            resolve(chunks);
          }
        });
        sock.on("error", (err) => {
          if (!wasListening) {
            app.close(() => reject(err));
          } else {
            reject(err);
          }
        });
      };
      if (wasListening) {
        runSocket();
      } else {
        app.listen(0, "127.0.0.1", runSocket);
      }
    });
    expect(rawHttpRes).toMatch(/^HTTP\/1\.1 400\b/);
    expect(rawHttpRes).toContain('"BAD_REQUEST"');
  });
});
