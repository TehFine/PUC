import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength } from "class-validator";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { RateLimitTier } from "../../common/throttler/rate-limit.policy";
import { PortalTranslateService, type SupportedTranslateTarget } from "./translate.service";

export class TranslateBatchDto {
  @IsIn(["en", "zh"], { message: "Ngôn ngữ đích không hợp lệ." })
  target!: SupportedTranslateTarget;

  @IsArray({ message: "Danh sách văn bản cần dịch không hợp lệ." })
  @ArrayMaxSize(50, { message: "Tối đa 50 chuỗi mỗi lần dịch." })
  @IsString({ each: true, message: "Mỗi mục dịch phải là chuỗi văn bản." })
  @MaxLength(600, { each: true, message: "Mỗi chuỗi dịch tối đa 600 ký tự." })
  texts!: string[];
}

/** `POST /api/portal/translate` - Dịch tự động theo lô cho nội dung mới phát sinh trên Cổng Xã viên (tuân thủ CSP 'self'). */
@Controller("portal")
export class PortalTranslateController {
  constructor(private readonly service: PortalTranslateService) {}

  @Post("translate")
  @HttpCode(200)
  @Throttle(RateLimitTier.ACCOUNT_ISSUE)
  @Authorize("portal", "read")
  translate(@Body() dto: TranslateBatchDto, @CurrentUser() user: AuthUser) {
    return this.service.translateBatch(dto.target, dto.texts, user.id);
  }
}

