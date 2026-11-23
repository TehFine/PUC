import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import {
  CreateDeletionRequestDto,
  ListDeletionRequestsQueryDto,
  ReviewDeletionRequestDto,
} from "./deletion-requests.dto";
import { DeletionRequestsService } from "./deletion-requests.service";

@Controller("deletion-requests")
export class DeletionRequestsController {
  constructor(private readonly deletionRequests: DeletionRequestsService) {}

  @Get()
  @Authorize("deletion-requests", "read")
  list(@Query() query: ListDeletionRequestsQueryDto, @CurrentUser() user: AuthUser) {
    return this.deletionRequests.list(query, user);
  }

  @Post()
  @Authorize("deletion-requests", "create")
  create(@Body() dto: CreateDeletionRequestDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.deletionRequests.requestDeletion(dto, user, ip, { strictConflict: true });
  }

  @Post(":id/approve")
  @HttpCode(200)
  @Authorize("deletion-requests", "update")
  approve(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: ReviewDeletionRequestDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.deletionRequests.approve(id, user, dto, ip);
  }

  @Post(":id/reject")
  @HttpCode(200)
  @Authorize("deletion-requests", "update")
  reject(
    @Param("id", ParseRecordIdPipe) id: number,
    @Body() dto: ReviewDeletionRequestDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.deletionRequests.reject(id, user, dto, ip);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @Authorize("deletion-requests", "delete")
  cancel(
    @Param("id", ParseRecordIdPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.deletionRequests.cancel(id, user, ip);
  }
}

