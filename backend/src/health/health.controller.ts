import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/auth.decorators";
import { DatabaseService } from "../database/database.service";

@Controller("health")
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      await this.db.query("SELECT 1");
      return { status: "ok", database: "up" };
    } catch {
      res.status(503);
      return { status: "degraded", database: "down" };
    }
  }
}
