import { Body, Delete, Get, Ip, Param, Patch, Post, Put, Query, Type } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import type { ResourceKey } from "../../auth/permissions";
import { ParseRecordIdPipe, strictPipe } from "../pipes/validation.pipes";
import type { BaseCrudService } from "./base-crud.service";
import { ListQueryDto } from "./list-query.dto";

/**
 * Controller chỉ đọc: GET /, GET /:id. Lớp con cần là @Controller('<đường dẫn>') và truyền service vào `super`.
 * Quyền được khai báo bằng @Authorize theo ma trận trong auth/permissions.ts.
 */
export function ReadOnlyCrudController(resource: ResourceKey) {
  class ReadOnlyController {
    constructor(protected readonly service: BaseCrudService) {}

    @Get()
    @Authorize(resource, "read")
    list(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto) {
      return this.service.list(user, query as ListQueryDto & Record<string, unknown>);
    }

    @Get(":id")
    @Authorize(resource, "read")
    findOne(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser) {
      return this.service.findOne(id, user);
    }
  }
  return ReadOnlyController;
}

/** Controller CRUD đầy đủ; `createDto`/`updateDto` quyết định cách kiểm tra body. */
export function CrudController(resource: ResourceKey, createDto: Type<object>, updateDto: Type<object>) {
  class Controller extends ReadOnlyCrudController(resource) {
    @Post()
    @Authorize(resource, "create")
    create(@Body(strictPipe(createDto)) dto: object, @CurrentUser() user: AuthUser, @Ip() ip: string) {
      return this.service.create(dto, user, ip);
    }

    @Patch(":id")
    @Authorize(resource, "update")
    patch(
      @Param("id", ParseRecordIdPipe) id: number,
      @Body(strictPipe(updateDto)) dto: object,
      @CurrentUser() user: AuthUser,
      @Ip() ip: string,
    ) {
      return this.service.update(id, dto, user, ip);
    }

    @Put(":id")
    @Authorize(resource, "update")
    put(
      @Param("id", ParseRecordIdPipe) id: number,
      @Body(strictPipe(updateDto)) dto: object,
      @CurrentUser() user: AuthUser,
      @Ip() ip: string,
    ) {
      return this.service.update(id, dto, user, ip);
    }

    @Delete(":id")
    @Authorize(resource, "delete")
    remove(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
      return this.service.remove(id, user, ip);
    }
  }
  return Controller;
}
