import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";
import { AppCacheService } from "./app-cache.service";

@Global()
@Module({
  providers: [
    {
      provide: AppCacheService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const cacheCfg = config.get("cache", { infer: true });
        return new AppCacheService(cacheCfg.maxKeys);
      },
    },
  ],
  exports: [AppCacheService],
})
export class CacheModule {}

