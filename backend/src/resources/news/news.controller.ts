import { Controller, HttpCode, Ip, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth-user";
import { Authorize, CurrentUser } from "../../auth/auth.decorators";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { ParseRecordIdPipe } from "../../common/pipes/validation.pipes";
import { CreateNewsArticleDto, UpdateNewsArticleDto } from "./news.dto";
import { NewsService } from "./news.service";

@Controller("news")
export class NewsController extends CrudController("news", CreateNewsArticleDto, UpdateNewsArticleDto) {
  constructor(private readonly news: NewsService) {
    super(news);
  }

  @Post(":id/publish")
  @HttpCode(200)
  @Authorize("news", "update")
  publish(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.news.publish(id, user, ip);
  }

  @Post(":id/unpublish")
  @HttpCode(200)
  @Authorize("news", "update")
  unpublish(@Param("id", ParseRecordIdPipe) id: number, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.news.unpublish(id, user, ip);
  }
}
