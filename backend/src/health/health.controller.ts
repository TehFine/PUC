import { Controller, Get, Optional, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/auth.decorators";
import { DatabaseService } from "../database/database.service";
import { SystemAlertsService } from "../notifications/system-alerts.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly systemAlerts?: SystemAlertsService,
  ) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      await this.db.query("SELECT 1");
      const alert = (await this.systemAlerts?.getActive()) ?? null;
      return { status: "ok", database: "up", alert };
    } catch {
      res.status(503);
      return { status: "degraded", database: "down", alert: null };
    }
  }
}
