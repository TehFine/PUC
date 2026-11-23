import { Controller, Get, Optional, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import type { AuthUser } from "../auth/auth-user";
import { CurrentUser, OptionalAuth, Public } from "../auth/auth.decorators";
import { RateLimitTier } from "../common/throttler/rate-limit.policy";
import { DatabaseService } from "../database/database.service";
import { SystemAlertsService } from "../notifications/system-alerts.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly systemAlerts?: SystemAlertsService,
  ) { }

  @Public()
  @OptionalAuth()
  @Throttle(RateLimitTier.PUBLIC_READ)
  @Get()
  async check(@CurrentUser() user: AuthUser | undefined, @Res({ passthrough: true }) res: Response) {
    const checkedAt = new Date().toISOString();
    try {
      const dbStartedAt = performance.now();
      await this.db.query("SELECT 1");
      const dbLatencyMs = Math.max(1, Math.round(performance.now() - dbStartedAt));
      const rawAlert = (await this.systemAlerts?.getActive()) ?? null;
      const visible =
        rawAlert &&
        (rawAlert.audience === "all" ||
          (rawAlert.audience === "farmer" && user?.role === "farmer") ||
          (rawAlert.audience === "staff" && Boolean(user && user.role !== "farmer")));

      const alert = visible
        ? {
          id: rawAlert.id,
          severity: rawAlert.severity,
          title: rawAlert.title,
          message: rawAlert.message,
          audience: rawAlert.audience,
          active: rawAlert.active,
          createdBy: null,
          createdByName: null,
          resolvedBy: null,
          resolvedAt: null,
          createdAt: rawAlert.createdAt,
        }
        : null;
      return {
        status: "ok",
        database: "up",
        dbLatencyMs: user && user.role !== "farmer" ? dbLatencyMs : null,
        checkedAt,
        alert,
      };
    } catch {
      res.status(503);
      return { status: "degraded", database: "down", dbLatencyMs: null, checkedAt, alert: null };
    }
  }
}
