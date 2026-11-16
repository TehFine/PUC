import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Request } from "express";
import type { AppConfig } from "../../config/configuration";
import { BoundedThrottlerStorage } from "./bounded-throttler.storage";
import {
  resolveRateLimit,
  THROTTLER_BURST_TTL_MS,
  THROTTLER_DEFAULT_TTL_MS,
  THROTTLER_WRITE_TTL_MS,
} from "./rate-limit.policy";

const SAFE_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, BoundedThrottlerStorage],
      useFactory: (config: ConfigService<AppConfig, true>, storage: BoundedThrottlerStorage) => {
        const rl = config.get("rateLimit", { infer: true });
        return {
          storage,
          throttlers: [
            {
              name: "burst",
              ttl: THROTTLER_BURST_TTL_MS,
              limit: () => resolveRateLimit(rl.burstMax),
            },
            {
              name: "write",
              ttl: THROTTLER_WRITE_TTL_MS,
              limit: () => resolveRateLimit(rl.writeMax),
              skipIf: (ctx) => {
                const req = ctx.switchToHttp().getRequest<Request>();
                return SAFE_READ_METHODS.has((req.method ?? "GET").toUpperCase());
              },
            },
            {
              name: "default",
              ttl: THROTTLER_DEFAULT_TTL_MS,
              limit: () => resolveRateLimit(rl.defaultMax),
            },
          ],
        };
      },
    }),
  ],
  providers: [
    {
      provide: BoundedThrottlerStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const rl = config.get("rateLimit", { infer: true });
        return new BoundedThrottlerStorage(rl.maxKeys);
      },
    },
  ],
  exports: [ThrottlerModule, BoundedThrottlerStorage],
})
export class RateLimitModule {}

