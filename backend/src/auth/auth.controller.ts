import { Body, Controller, Get, HttpCode, Ip, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AuthUser } from "./auth-user";
import { CurrentUser, Public } from "./auth.decorators";
import { AuthService, RefreshRejected } from "./auth.service";
import { ChangePasswordDto, LoginDto, RegisterDto } from "./dto/auth.dto";
import { REFRESH_COOKIE, TokensService } from "./tokens.service";

// Giới hạn chặt hơn cho đăng nhập (nới ra khi chạy test).
const LOGIN_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// Đăng ký: tối đa 5 lần/giờ cho mỗi IP để chống tạo tài khoản rác hàng loạt.
const REGISTER_LIMIT = process.env.NODE_ENV === "test" ? 1000 : 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

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
    const { tokens, ...session } = await this.auth.login(dto, { ip, userAgent: req.get("user-agent") });
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
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    this.tokens.clearAuthCookies(res);
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.sessionOf(user);
  }

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
}
