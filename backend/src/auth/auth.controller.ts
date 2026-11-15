import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import type { AuthUser } from "./auth-user";
import { CurrentUser, Public } from "./auth.decorators";
import { AuthService, RefreshRejected } from "./auth.service";
import {
  ChangePasswordDto,
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  ForgotPasswordCccdDto,
  ForgotPasswordRequestDto,
  GoogleLoginDto,
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
  VerifyOtpChallengeDto,
} from "./dto/auth.dto";
import { ACCESS_COOKIE, REFRESH_COOKIE, TokensService } from "./tokens.service";

// Giới hạn chặt hơn cho đăng nhập (nới ra khi chạy test).
const LOGIN_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const OTP_VERIFY_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 12;
// Đăng ký: tối đa 5 lần/giờ cho mỗi IP để chống tạo tài khoản rác hàng loạt.
const REGISTER_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
// Làm mới phiên: giới hạn 30 lần/phút mỗi IP.
const REFRESH_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 30;
const REFRESH_WINDOW_MS = 60 * 1000;
// Đổi mật khẩu: giới hạn 10 lần/15 phút để chống dò mật khẩu hiện tại.
const CHANGE_PASSWORD_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 10;
// Quên mật khẩu: giới hạn 8 lần/15 phút mỗi IP để chống dò số CCCD hoặc gửi yêu cầu rác.
const FORGOT_PASSWORD_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 8;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: LOGIN_WINDOW_MS } })
  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, { ip, userAgent: req.get("user-agent") });
    if ("mfaRequired" in result) {
      return result;
    }
    const { tokens, ...session } = result;
    this.tokens.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return session;
  }

  @Public()
  @Throttle({ default: { limit: OTP_VERIFY_LIMIT, ttl: LOGIN_WINDOW_MS } })
  @Post("verify-otp")
  @HttpCode(200)
  async verifyOtp(
    @Body() dto: VerifyOtpChallengeDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, ...session } = await this.auth.verifyOtpLogin(dto, { ip, userAgent: req.get("user-agent") });
    this.tokens.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return session;
  }

  @Public()
  @Get("google/config")
  googleConfig() {
    return this.auth.googleConfig();
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: LOGIN_WINDOW_MS } })
  @Post("google")
  @HttpCode(200)
  async loginWithGoogle(
    @Body() dto: GoogleLoginDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.loginWithGoogle(dto, { ip, userAgent: req.get("user-agent") });
    if ("mfaRequired" in result) {
      return result;
    }
    const { tokens, ...session } = result;
    this.tokens.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return session;
  }

  @Public()
  @Throttle({ default: { limit: REGISTER_LIMIT, ttl: REGISTER_WINDOW_MS } })
  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.register(dto, { ip, userAgent: req.get("user-agent") });
  }

  @Public()
  @Throttle({ default: { limit: REFRESH_LIMIT, ttl: REFRESH_WINDOW_MS } })
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    try {
      const issued = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE] as string | undefined, {
        ip,
        userAgent: req.get("user-agent"),
      });
      this.tokens.setAuthCookies(res, issued.accessToken, issued.refreshToken);
      return { ok: true };
    } catch (error) {
      if (error instanceof RefreshRejected) this.tokens.clearAuthCookies(res);
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(
      req.cookies?.[REFRESH_COOKIE] as string | undefined,
      req.cookies?.[ACCESS_COOKIE] as string | undefined,
    );
    this.tokens.clearAuthCookies(res);
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.sessionOf(user);
  }

  @Patch("profile")
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto, @Ip() ip: string) {
    return this.auth.updateProfile(user, dto, ip);
  }

  @Throttle({ default: { limit: CHANGE_PASSWORD_LIMIT, ttl: LOGIN_WINDOW_MS } })
  @Post("change-password")
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user, dto, ip);
    this.tokens.clearAuthCookies(res);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: FORGOT_PASSWORD_LIMIT, ttl: LOGIN_WINDOW_MS } })
  @Post("forgot-password/verify-cccd")
  @HttpCode(200)
  async resetPasswordWithCccd(@Body() dto: ForgotPasswordCccdDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.resetPasswordWithCccd(dto, { ip, userAgent: req.get("user-agent") });
  }

  @Public()
  @Throttle({ default: { limit: FORGOT_PASSWORD_LIMIT, ttl: LOGIN_WINDOW_MS } })
  @Post("forgot-password/request")
  @HttpCode(200)
  async requestPasswordReset(@Body() dto: ForgotPasswordRequestDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.requestPasswordReset(dto, { ip, userAgent: req.get("user-agent") });
  }

  @Post("2fa/setup")
  @HttpCode(200)
  setupTwoFactor(@CurrentUser() user: AuthUser) {
    return this.auth.setupTwoFactor(user);
  }

  @Throttle({ default: { limit: OTP_VERIFY_LIMIT, ttl: LOGIN_WINDOW_MS } })
  @Post("2fa/enable")
  @HttpCode(200)
  enableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: EnableTwoFactorDto, @Ip() ip: string) {
    return this.auth.enableTwoFactor(user, dto, ip);
  }

  @Throttle({ default: { limit: CHANGE_PASSWORD_LIMIT, ttl: LOGIN_WINDOW_MS } })
  @Post("2fa/disable")
  @HttpCode(200)
  disableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: DisableTwoFactorDto, @Ip() ip: string) {
    return this.auth.disableTwoFactor(user, dto, ip);
  }

  @Get("sessions")
  listSessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user);
  }

  @Delete("sessions/:id")
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseRecordIdPipe) id: number,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.revokeSession(user, id, ip);
    if (result.revokedCurrent) {
      this.tokens.clearAuthCookies(res);
    }
    return result;
  }

  @Post("sessions/revoke-others")
  @HttpCode(200)
  revokeOtherSessions(@CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.auth.revokeOtherSessions(user, ip);
  }
}
