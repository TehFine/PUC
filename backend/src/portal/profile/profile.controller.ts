import { Body, Controller, Get, Ip, Patch } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, Min } from "class-validator";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ProfileService } from "./profile.service";

export class UpdateHouseholdAvatarDto {
  @IsOptional()
  @IsInt({ message: "Mã ảnh đại diện không hợp lệ." })
  @Min(1, { message: "Mã ảnh đại diện không hợp lệ." })
  avatarId?: number | null;
}

export class UpdateTraceConsentDto {
  @IsBoolean({ message: "Giá trị đồng ý hiển thị không hợp lệ." })
  publicTraceConsent!: boolean;
}

/** `GET /api/portal/profile`, `PATCH /api/portal/profile/avatar` & `PATCH /api/portal/profile/trace-consent`. */
@Controller("portal")
export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  @Get("profile")
  @Authorize("portal", "read")
  profile(@CurrentUser() user: AuthUser) {
    return this.service.profile(user);
  }

  @Patch("profile/avatar")
  @Authorize("portal", "create")
  updateAvatar(@Body() dto: UpdateHouseholdAvatarDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.updateAvatar(dto.avatarId ?? null, user, { ip });
  }

  @Patch("profile/trace-consent")
  @Authorize("portal", "create")
  updateTraceConsent(@Body() dto: UpdateTraceConsentDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.updateTraceConsent(dto.publicTraceConsent, user, { ip });
  }
}
