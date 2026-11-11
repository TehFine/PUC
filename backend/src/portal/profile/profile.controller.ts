import { Body, Controller, Get, Ip, Patch } from "@nestjs/common";
import { IsInt, IsOptional, Min } from "class-validator";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ProfileService } from "./profile.service";

export class UpdateHouseholdAvatarDto {
  @IsOptional()
  @IsInt({ message: "Mã ảnh đại diện không hợp lệ." })
  @Min(1, { message: "Mã ảnh đại diện không hợp lệ." })
  avatarId?: number | null;
}

/** `GET /api/portal/profile` & `PATCH /api/portal/profile/avatar`. */
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
}
