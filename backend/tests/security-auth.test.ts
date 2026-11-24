import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { TokensService } from "../src/auth/tokens.service";
import { SEALED_PREFIX_V1 } from "../src/common/crypto/secret-box";
import { generateTotpCode } from "../src/common/crypto/totp";
import { loadConfig } from "../src/config/configuration";
import { DatabaseService } from "../src/database/database.service";
import { TEST_PASSWORD } from "./constants";

const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000c49444154789c6360f8cf00000101010018dd8db00000000049454e44ae426082",
  "hex",
);

const USERS = {
  admin: "0901234567",
  htx: "0912345678",
};

const FX = {
  mfaUsername: "sec08_mfa_inspector",
  mfaPassword: "Sec08Password123",
  cccdFarmerUsername: "0977001301",
  cccdFarmerPassword: "Sec13Farmer123",
  cccdFarmerHousehold: {
    code: "SEC13-T1-H801",
    name: "Nông Hộ Kiểm Thử SEC13",
    cccd: "260888001301",
    phone: "0977001301",
  },
  cccdStaffUsername: "sec13_staff_guard",
  cccdStaffPassword: "Sec13Staff123",
  regPhone: "0977001717",
  regPassword: "Sec17RegPassword123",
  regHousehold: {
    code: "SEC17-T2-H802",
    name: "Nông Hộ Duyệt Thôn Hai",
    cccd: "260888001702",
    phone: "0977001717",
  },
};

let nest: INestApplication;
let app: Server;
let db: DatabaseService;
let tokens: TokensService;
const cleanupIds: {
  households: number[];
  usernames: string[];
  journals: number[];
} = {
  households: [],
  usernames: [FX.mfaUsername, FX.cccdFarmerUsername, FX.cccdStaffUsername, FX.regPhone],
  journals: [],
};

async function loggedIn(username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

async function villageIdOf(name: string): Promise<number> {
  const res = await db.query<{ id: number }>("SELECT id FROM villages WHERE name = $1", [name]);
  return Number(res.rows[0].id);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(instance);
  await instance.init();
  nest = instance;
  app = instance.getHttpServer() as Server;
  db = instance.get(DatabaseService);
  tokens = instance.get(TokensService);
});

afterAll(async () => {
  try {
    if (cleanupIds.journals.length > 0) {
      await db.query("DELETE FROM journal_entries WHERE id = ANY($1::bigint[])", [cleanupIds.journals]);
    }
    await db.query("DELETE FROM users WHERE username = ANY($1::text[])", [cleanupIds.usernames]);
    if (cleanupIds.households.length > 0) {
      await db.query("DELETE FROM households WHERE id = ANY($1::bigint[])", [cleanupIds.households]);
    }
  } finally {
    await nest.close();
  }
});

describe("SEC-07 & SEC-12: chốt chặn cấu hình TLS CSDL và TRUST_PROXY trên production", () => {
  const baseProdEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    PORT: "4000",
    CORS_ORIGIN: "https://puc.daklak.gov.vn",
    DATABASE_URL: "postgres://puc_prod:K9vR4mP8xQ2wL7nZ3tB6yF1jH5cD0sA9@db.internal.puc.vn:5432/puc_prod",
    JWT_ACCESS_SECRET: "A9fK3mP7xQ2wL8nZ4tB6yF1jH5cD0sG9vR4uY8eW2qT6pM1k",
    COOKIE_SECURE: "true",
    TRUST_PROXY: "1",
  };

  it("bắt buộc mã hóa TLS tới CSDL từ xa trên production, tương thích pooler đám mây và chặn TRUST_PROXY mở toàn bộ", () => {
    expect(() =>
      loadConfig({
        ...baseProdEnv,
        DATABASE_SSL: "false",
      }),
    ).toThrow(/DATABASE_SSL/);

    const cloudPoolerCfg = loadConfig(baseProdEnv);
    expect(cloudPoolerCfg.database.ssl).toBe(true);
    expect(cloudPoolerCfg.database.sslRejectUnauthorized).toBe(false);

    const strictCaCfg = loadConfig({
      ...baseProdEnv,
      DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
    });
    expect(strictCaCfg.database.ssl).toBe(true);
    expect(strictCaCfg.database.sslRejectUnauthorized).toBe(true);

    // Khi chạy trên Render (RENDER=true) mà chưa khai báo TRUST_PROXY, tự nhận 1 bước nhảy proxy thay vì dừng tiến trình
    const renderDefaultCfg = loadConfig({
      ...baseProdEnv,
      RENDER: "true",
      TRUST_PROXY: undefined,
    });
    expect(renderDefaultCfg.trustProxy).toBe(1);

    expect(() =>
      loadConfig({
        ...baseProdEnv,
        TRUST_PROXY: "true",
      }),
    ).toThrow(/TRUST_PROXY/);
  });
});

describe("SEC-08: một thử thách OTP duy nhất, mã hóa khóa TOTP, tiêu thụ mã dự phòng nguyên tử và khóa cấp người dùng", () => {
  it("yêu cầu currentPassword khi bật 2FA, lưu khóa enc:v1, hủy challenge cũ, chống đua backup code và khóa theo user", async () => {
    const admin = await loggedIn(USERS.admin);
    const created = await admin.post("/api/accounts").send({
      fullName: "Thanh Tra Kiểm Thử SEC08",
      username: FX.mfaUsername,
      password: FX.mfaPassword,
      role: "inspector",
      assignedRegion: "Tỉnh Đắk Lắk",
    });
    expect(created.status).toBe(201);
    const userId = Number(created.body.id);

    const agent = await loggedIn(FX.mfaUsername, FX.mfaPassword);
    const setupRes = await agent.post("/api/auth/2fa/setup");
    expect(setupRes.status).toBe(200);
    const plainSecret = setupRes.body.secret as string;

    // Khóa chờ kích hoạt trong CSDL phải được mã hóa AES-256-GCM (enc:v1:...)
    const pendingRow = await db.query<{ two_factor_pending_secret: string | null }>(
      "SELECT two_factor_pending_secret FROM users WHERE id = $1",
      [userId],
    );
    expect(pendingRow.rows[0].two_factor_pending_secret?.startsWith(SEALED_PREFIX_V1)).toBe(true);
    expect(pendingRow.rows[0].two_factor_pending_secret).not.toContain(plainSecret);

    const validSetupCode = generateTotpCode(plainSecret, Date.now() - 30_000);

    // Thiếu currentPassword -> 400; sai currentPassword -> 400
    expect((await agent.post("/api/auth/2fa/enable").send({ code: validSetupCode })).status).toBe(400);
    expect(
      (
        await agent.post("/api/auth/2fa/enable").send({
          code: validSetupCode,
          currentPassword: "WrongPassword999",
        })
      ).status,
    ).toBe(400);

    // Đúng currentPassword + OTP -> kích hoạt thành công
    const enableRes = await agent.post("/api/auth/2fa/enable").send({
      code: validSetupCode,
      currentPassword: FX.mfaPassword,
    });
    expect(enableRes.status).toBe(200);
    const backupCodes = enableRes.body.backupCodes as string[];
    expect(backupCodes).toHaveLength(8);

    // Khóa chính thức trong bảng users phải ở dạng enc:v1:... và mã dự phòng dạng HMAC h2:...
    const stored2fa = await db.query<{
      two_factor_secret: string | null;
      two_factor_pending_secret: string | null;
      two_factor_backup_codes: string[];
      two_factor_last_used_step: number | null;
    }>(
      "SELECT two_factor_secret, two_factor_pending_secret, two_factor_backup_codes, two_factor_last_used_step FROM users WHERE id = $1",
      [userId],
    );
    expect(stored2fa.rows[0].two_factor_secret?.startsWith(SEALED_PREFIX_V1)).toBe(true);
    expect(stored2fa.rows[0].two_factor_secret).not.toContain(plainSecret);
    expect(stored2fa.rows[0].two_factor_pending_secret).toBeNull();
    expect(stored2fa.rows[0].two_factor_last_used_step).not.toBeNull();
    expect(stored2fa.rows[0].two_factor_backup_codes.every((h) => h.startsWith("h2:"))).toBe(true);

    // 1. Chỉ giữ một thử thách OTP còn hiệu lực: tạo challenge mới làm vô hiệu challenge cũ ngay lập tức
    const login1 = await request(app).post("/api/auth/login").send({
      username: FX.mfaUsername,
      password: FX.mfaPassword,
    });
    expect(login1.status).toBe(200);
    const challenge1 = login1.body.challengeToken as string;

    const login2 = await request(app).post("/api/auth/login").send({
      username: FX.mfaUsername,
      password: FX.mfaPassword,
    });
    expect(login2.status).toBe(200);
    const challenge2 = login2.body.challengeToken as string;
    expect(challenge2).not.toBe(challenge1);

    const staleTry = await request(app).post("/api/auth/verify-otp").send({
      challengeToken: challenge1,
      code: backupCodes[0],
    });
    expect(staleTry.status).toBe(401);

    // 2. Đua song song (Promise.all) với 2 challenge hợp lệ dùng CÙNG một mã dự phòng -> chỉ đúng 1 bên thắng
    const extraRawA = randomBytes(32).toString("base64url");
    await db.query(
      `INSERT INTO auth_otp_challenges (challenge_token_hash, user_id, auth_method, expires_at)
       VALUES ($1, $2, 'password', now() + interval '5 minutes')`,
      [tokens.hashToken(extraRawA), userId],
    );

    const [raceSame1, raceSame2] = await Promise.all([
      request(app).post("/api/auth/verify-otp").send({ challengeToken: challenge2, code: backupCodes[0] }),
      request(app).post("/api/auth/verify-otp").send({ challengeToken: extraRawA, code: backupCodes[0] }),
    ]);
    const sameStatuses = [raceSame1.status, raceSame2.status].sort((a, b) => a - b);
    expect(sameStatuses).toEqual([200, 401]);

    // 3. Đua song song (Promise.all) với 2 challenge dùng 2 mã dự phòng KHÁC NHAU -> cả 2 tiêu thụ nguyên tử, không làm sống lại mã [0]
    const rawC1 = randomBytes(32).toString("base64url");
    const rawC2 = randomBytes(32).toString("base64url");
    await db.query(
      `INSERT INTO auth_otp_challenges (challenge_token_hash, user_id, auth_method, expires_at)
       VALUES ($1, $3, 'password', now() + interval '5 minutes'),
              ($2, $3, 'password', now() + interval '5 minutes')`,
      [tokens.hashToken(rawC1), tokens.hashToken(rawC2), userId],
    );

    const [raceDiff1, raceDiff2] = await Promise.all([
      request(app).post("/api/auth/verify-otp").send({ challengeToken: rawC1, code: backupCodes[1] }),
      request(app).post("/api/auth/verify-otp").send({ challengeToken: rawC2, code: backupCodes[2] }),
    ]);
    expect(raceDiff1.status).toBe(200);
    expect(raceDiff2.status).toBe(200);

    const afterBackupRace = await db.query<{ two_factor_backup_codes: string[] }>(
      "SELECT two_factor_backup_codes FROM users WHERE id = $1",
      [userId],
    );
    // Đã tiêu thụ đúng 3 mã ([0], [1], [2]) -> còn đúng 5 mã, không mã nào bị ghi đè sống lại
    expect(afterBackupRace.rows[0].two_factor_backup_codes).toHaveLength(5);

    const checkResurrectLogin = await request(app).post("/api/auth/login").send({
      username: FX.mfaUsername,
      password: FX.mfaPassword,
    });
    const resurrectedTry = await request(app).post("/api/auth/verify-otp").send({
      challengeToken: checkResurrectLogin.body.challengeToken,
      code: backupCodes[0],
    });
    expect(resurrectedTry.status).toBe(401);

    // 4. Khóa cấp người dùng khi đoán sai OTP rải qua nhiều phiên thử thách mới (không bị xóa khi qua bước mật khẩu)
    await db.query("UPDATE users SET two_factor_failed_count = 0, locked_until = NULL WHERE id = $1", [userId]);

    let latestStatus = 0;
    for (let i = 0; i < 5; i++) {
      const freshLogin = await request(app).post("/api/auth/login").send({
        username: FX.mfaUsername,
        password: FX.mfaPassword,
      });
      expect(freshLogin.status).toBe(200);
      const wrongTry = await request(app).post("/api/auth/verify-otp").send({
        challengeToken: freshLogin.body.challengeToken,
        code: "000000",
      });
      latestStatus = wrongTry.status;
      if (i < 4) {
        expect(wrongTry.status).toBe(401);
      }
    }
    expect(latestStatus).toBe(429);

    // Khi đã bị khóa OTP, đăng nhập bước 1 cũng trả về 429 ACCOUNT_LOCKED
    const blockedStep1 = await request(app).post("/api/auth/login").send({
      username: FX.mfaUsername,
      password: FX.mfaPassword,
    });
    expect(blockedStep1.status).toBe(429);
  });
});

describe("SEC-13: cách ly khóa CCCD khỏi đăng nhập chính, phản hồi đồng nhất giữa cán bộ/nông hộ và bắt buộc fullName", () => {
  it("bắt buộc fullName, khóa cccd_reset_locked_until không khóa đăng nhập mật khẩu, không phân biệt vai trò", async () => {
    const admin = await loggedIn(USERS.admin);
    const htx = await loggedIn(USERS.htx);
    const v1 = await villageIdOf("Thôn 1");

    const hhRes = await htx.post("/api/households").send({
      ...FX.cccdFarmerHousehold,
      villageId: v1,
      plotCount: 1,
      areaHa: 1.0,
      status: "qualified",
    });
    expect(hhRes.status).toBe(201);
    const hhId = Number(hhRes.body.id);
    cleanupIds.households.push(hhId);

    const farmerAcc = await htx.post(`/api/households/${hhId}/issue-account`).send({
      username: FX.cccdFarmerUsername,
      password: FX.cccdFarmerPassword,
    });
    expect(farmerAcc.status).toBe(200);

    const staffAcc = await admin.post("/api/accounts").send({
      fullName: "Cán Bộ Kiểm Thử SEC13",
      username: FX.cccdStaffUsername,
      password: FX.cccdStaffPassword,
      role: "htx_officer",
    });
    expect(staffAcc.status).toBe(201);

    // 1. Thiếu fullName -> 400 từ tầng DTO; sai fullName dù đúng CCCD -> 400
    const missingName = await request(app)
      .post("/api/auth/forgot-password/verify-cccd")
      .set("X-Forwarded-For", "10.99.13.10")
      .send({
        username: FX.cccdFarmerUsername,
        cccd: FX.cccdFarmerHousehold.cccd,
        newPassword: "NewPassword123",
      });
    expect(missingName.status).toBe(400);

    // 2. Nhập sai 3 lần trên nông hộ -> khóa cccd_reset_locked_until, lần thứ 4 trả 429, nhưng đăng nhập mật khẩu vẫn 200
    const farmerStatuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/auth/forgot-password/verify-cccd")
        .set("X-Forwarded-For", "10.99.13.11")
        .send({
          username: FX.cccdFarmerUsername,
          cccd: "999999999999",
          fullName: FX.cccdFarmerHousehold.name,
          newPassword: "NewPassword123",
        });
      farmerStatuses.push(res.status);
    }
    expect(farmerStatuses).toEqual([400, 400, 400, 429]);

    const lockCols = await db.query<{ locked_until: Date | null; cccd_reset_locked_until: Date | null }>(
      "SELECT locked_until, cccd_reset_locked_until FROM users WHERE username = $1",
      [FX.cccdFarmerUsername],
    );
    expect(lockCols.rows[0].locked_until).toBeNull();
    expect(lockCols.rows[0].cccd_reset_locked_until).not.toBeNull();

    const normalFarmerLogin = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", "10.99.13.12")
      .send({ username: FX.cccdFarmerUsername, password: FX.cccdFarmerPassword });
    expect(normalFarmerLogin.status).toBe(200);

    // 3. Tài khoản cán bộ/quản trị có chuỗi mã trạng thái khóa [400, 400, 400, 429] giống hệt nông hộ (chống dò vai trò)
    const staffStatuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/auth/forgot-password/verify-cccd")
        .set("X-Forwarded-For", "10.99.13.21")
        .send({
          username: FX.cccdStaffUsername,
          cccd: "888888888888",
          fullName: "Cán Bộ Kiểm Thử SEC13",
          newPassword: "NewPassword123",
        });
      staffStatuses.push(res.status);
    }
    expect(staffStatuses).toEqual([400, 400, 400, 429]);

    const normalStaffLogin = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", "10.99.13.22")
      .send({ username: FX.cccdStaffUsername, password: FX.cccdStaffPassword });
    expect(normalStaffLogin.status).toBe(200);
  });
});

describe("SEC-17: tự đăng ký bỏ qua email thô chưa xác minh Google và đồng bộ village_id theo hộ khi duyệt", () => {
  it("không lưu email khi thiếu googleCredential và cập nhật village_id khớp hồ sơ hộ lúc cán bộ duyệt", async () => {
    const htx = await loggedIn(USERS.htx);
    const [village1, village2] = await Promise.all([villageIdOf("Thôn 1"), villageIdOf("Thôn 2")]);

    const regRes = await request(app).post("/api/auth/register").send({
      fullName: FX.regHousehold.name,
      phone: FX.regPhone,
      password: FX.regPassword,
      villageId: village1,
      email: "unverified-spoof-sec17@gmail.com",
      note: "Đăng ký kiểm thử SEC-17",
    });
    expect(regRes.status).toBe(201);
    expect(regRes.body.status).toBe("pending");

    const pendingUser = await db.query<{ id: number; email: string | null; village_id: number | null }>(
      "SELECT id, email, village_id FROM users WHERE username = $1",
      [FX.regPhone],
    );
    expect(pendingUser.rows[0].email).toBeNull();
    expect(Number(pendingUser.rows[0].village_id)).toBe(village1);

    // Tạo hộ thật thuộc Thôn 2 rồi duyệt gắn đăng ký vào hộ này
    const hhRes = await htx.post("/api/households").send({
      ...FX.regHousehold,
      villageId: village2,
      plotCount: 1,
      areaHa: 1.1,
      status: "qualified",
    });
    expect(hhRes.status).toBe(201);
    const hhId = Number(hhRes.body.id);
    cleanupIds.households.push(hhId);

    const approveRes = await htx
      .post(`/api/registrations/${pendingUser.rows[0].id}/approve`)
      .send({ householdId: hhId });
    expect(approveRes.status).toBe(200);

    const approvedUser = await db.query<{
      status: string;
      email: string | null;
      household_id: number | null;
      village_id: number | null;
    }>("SELECT status, email, household_id, village_id FROM users WHERE id = $1", [pendingUser.rows[0].id]);
    expect(approvedUser.rows[0]).toEqual({
      status: "active",
      email: null,
      household_id: hhId,
      village_id: village2,
    });
  });
});

describe("SEC-19: X-Idempotency-Key kiểm tra dấu vân tay SHA-256 của nội dung yêu cầu", () => {
  it("phát lại khi trùng nội dung nhưng từ chối 422 khi dùng lại khóa với nội dung khác", async () => {
    const farmerAn = await loggedIn("0905123456");
    const up = await farmerAn.post("/api/uploads").field("purpose", "journal").attach("file", TINY_PNG, "sec19.png");
    expect(up.status).toBe(201);

    const idemKey = `sec19_hash_guard_${Date.now()}`;
    const firstRes = await farmerAn
      .post("/api/portal/journal")
      .set("X-Idempotency-Key", idemKey)
      .send({
        plotCode: "TH1-001",
        activity: "Tưới nước",
        detail: "Nội dung gốc SEC-19",
        photoId: up.body.id,
      });
    expect(firstRes.status).toBe(201);
    cleanupIds.journals.push(Number(firstRes.body.id));

    // Cùng nội dung (đổi thứ tự khóa JSON) -> phát lại 201
    const sameBodyReplay = await farmerAn
      .post("/api/portal/journal")
      .set("X-Idempotency-Key", idemKey)
      .send({
        detail: "Nội dung gốc SEC-19",
        photoId: up.body.id,
        activity: "Tưới nước",
        plotCode: "TH1-001",
      });
    expect(sameBodyReplay.status).toBe(201);
    expect(sameBodyReplay.headers["x-idempotency-replayed"]).toBe("true");
    expect(sameBodyReplay.body.id).toBe(firstRes.body.id);

    // Cùng khóa X-Idempotency-Key, cùng đường dẫn nhưng thay đổi nội dung -> bị từ chối 422
    const mutatedBodyRes = await farmerAn
      .post("/api/portal/journal")
      .set("X-Idempotency-Key", idemKey)
      .send({
        plotCode: "TH1-001",
        activity: "Bón phân",
        detail: "Nội dung bị tráo đổi SEC-19",
        photoId: up.body.id,
      });
    expect(mutatedBodyRes.status).toBe(422);
    expect(mutatedBodyRes.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});
