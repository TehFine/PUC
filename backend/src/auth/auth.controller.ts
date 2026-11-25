import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { ParseRecordIdPipe } from "../common/pipes/validation.pipes";
import { RateLimitTier } from "../common/throttler/rate-limit.policy";
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

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  @Public()
  @Throttle(RateLimitTier.AUTH_LOGIN)
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
  @Throttle(RateLimitTier.AUTH_OTP)
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
  @Throttle(RateLimitTier.PUBLIC_READ)
  @Get("google/config")
  googleConfig() {
    return this.auth.googleConfig();
  }

  @Public()
  @Throttle(RateLimitTier.AUTH_LOGIN)
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
  @Throttle(RateLimitTier.AUTH_REGISTER)
  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.register(dto, { ip, userAgent: req.get("user-agent") });
  }

  @Public()
  @Throttle(RateLimitTier.AUTH_SESSION)
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
  @Throttle(RateLimitTier.AUTH_SESSION)
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

  @Throttle(RateLimitTier.AUTH_SENSITIVE_ACCOUNT)
  @Patch("profile")
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto, @Ip() ip: string) {
    return this.auth.updateProfile(user, dto, ip);
  }

  @Throttle(RateLimitTier.AUTH_SENSITIVE_ACCOUNT)
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
  @Throttle(RateLimitTier.AUTH_FORGOT_PASSWORD)
  @Post("forgot-password/verify-cccd")
  @HttpCode(200)
  async resetPasswordWithCccd(@Body() dto: ForgotPasswordCccdDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.resetPasswordWithCccd(dto, { ip, userAgent: req.get("user-agent") });
  }

  @Public()
  @Throttle(RateLimitTier.AUTH_FORGOT_PASSWORD)
  @Post("forgot-password/request")
  @HttpCode(200)
  async requestPasswordReset(@Body() dto: ForgotPasswordRequestDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.requestPasswordReset(dto, { ip, userAgent: req.get("user-agent") });
  }

  @Throttle(RateLimitTier.AUTH_SENSITIVE_ACCOUNT)
  @Post("2fa/setup")
  @HttpCode(200)
  setupTwoFactor(@CurrentUser() user: AuthUser) {
    return this.auth.setupTwoFactor(user);
  }

  @Throttle(RateLimitTier.AUTH_OTP)
  @Post("2fa/enable")
  @HttpCode(200)
  enableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: EnableTwoFactorDto, @Ip() ip: string) {
    return this.auth.enableTwoFactor(user, dto, ip);
  }

  @Throttle(RateLimitTier.AUTH_SENSITIVE_ACCOUNT)
  @Post("2fa/disable")
  @HttpCode(200)
  disableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: DisableTwoFactorDto, @Ip() ip: string) {
    return this.auth.disableTwoFactor(user, dto, ip);
  }

  @Throttle(RateLimitTier.AUTH_SESSION)
  @Get("sessions")
  listSessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user);
  }

  @Throttle(RateLimitTier.AUTH_SESSION)
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

  @Throttle(RateLimitTier.AUTH_SESSION)
  @Post("sessions/revoke-others")
  @HttpCode(200)
  revokeOtherSessions(@CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.auth.revokeOtherSessions(user, ip);
  }
}
