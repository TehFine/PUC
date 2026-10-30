import { Body, Controller, Get, Ip, Post } from "@nestjs/common";
import type { AuthUser } from "../auth/auth-user";
import { Authorize, CurrentUser } from "../auth/auth.decorators";
import { strictPipe } from "../common/pipes/validation.pipes";
import { CreatePortalApprovalDto, CreatePortalJournalDto, CreatePortalSprayDto } from "./dto/portal.dto";
import { PortalService } from "./portal.service";

/** Cổng hộ dân: `/api/portal/*`. Chỉ vai trò nông dân; dữ liệu luôn là của hộ gắn với tài khoản đăng nhập. */
@Controller("portal")
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Get("overview")
  @Authorize("portal", "read")
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user);
  }

  @Get("plots")
  @Authorize("portal", "read")
  plots(@CurrentUser() user: AuthUser) {
    return this.service.plots(user);
  }

  @Get("journal")
  @Authorize("portal", "read")
  journal(@CurrentUser() user: AuthUser) {
    return this.service.journal(user);
  }

  @Post("journal")
  @Authorize("portal", "create")
  addJournal(@Body(strictPipe(CreatePortalJournalDto)) dto: CreatePortalJournalDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.addJournal(dto, user, { ip });
  }

  @Get("spray")
  @Authorize("portal", "read")
  spray(@CurrentUser() user: AuthUser) {
    return this.service.spray(user);
  }

  @Post("spray")
  @Authorize("portal", "create")
  addSpray(@Body(strictPipe(CreatePortalSprayDto)) dto: CreatePortalSprayDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.addSpray(dto, user, { ip });
  }

  @Get("lab-tests")
  @Authorize("portal", "read")
  labTests(@CurrentUser() user: AuthUser) {
    return this.service.labTests(user);
  }

  @Get("schedule")
  @Authorize("portal", "read")
  schedule(@CurrentUser() user: AuthUser) {
    return this.service.schedule(user);
  }

  @Get("violations")
  @Authorize("portal", "read")
  violations(@CurrentUser() user: AuthUser) {
    return this.service.violations(user);
  }

  @Get("harvest")
  @Authorize("portal", "read")
  harvest(@CurrentUser() user: AuthUser) {
    return this.service.harvest(user);
  }

  @Get("approvals")
  @Authorize("portal", "read")
  approvals(@CurrentUser() user: AuthUser) {
    return this.service.approvals(user);
  }

  @Post("approvals")
  @Authorize("portal", "create")
  addApproval(@Body(strictPipe(CreatePortalApprovalDto)) dto: CreatePortalApprovalDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.service.addApproval(dto, user, { ip });
  }

  @Get("stamps")
  @Authorize("portal", "read")
  stamps(@CurrentUser() user: AuthUser) {
    return this.service.stamps(user);
  }

  @Post("stamps/activate")
  @Authorize("portal", "create")
  activateStamp(
    @Body() dto: import("./dto/portal.dto").ActivatePortalStampDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.service.activateStamp(dto, user, { ip });
  }

  @Get("harvest-declarations")
  @Authorize("portal", "read")
  harvestDeclarations(@CurrentUser() user: AuthUser) {
    return this.service.harvestDeclarations(user);
  }

  @Post("harvest-declarations")
  @Authorize("portal", "create")
  addHarvestDeclaration(
    @Body() dto: import("./dto/portal.dto").CreateHarvestDeclarationDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.service.addHarvestDeclaration(dto, user, { ip });
  }
}
