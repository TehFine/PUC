import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ProfileService } from "./profile.service";

/** `GET /api/portal/profile`. */
@Controller("portal")
export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  @Get("profile")
  @Authorize("portal", "read")
  profile(@CurrentUser() user: AuthUser) {
    return this.service.profile(user);
  }
}
