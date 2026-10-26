import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { OriginGuard } from "./auth/guards/origin.guard";
import { PermissionsGuard } from "./auth/guards/permissions.guard";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { AppValidationPipe } from "./common/pipes/validation.pipes";
import { type AppConfig, configuration } from "./config/configuration";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { PublicController } from "./public/public.controller";
import { PlotsModule } from "./plots/plots.module";
import { PortalModule } from "./portal/portal.module";
import { RegistrationsModule } from "./registrations/registrations.module";
import { ResourcesModule } from "./resources/resources.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], cache: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => [
        { ttl: 60_000, limit: config.get("nodeEnv", { infer: true }) === "test" ? 10_000 : 600 },
      ],
    }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    PlotsModule,
    PortalModule,
    RegistrationsModule,
    ResourcesModule,
  ],
  controllers: [HealthController, PublicController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useClass: AppValidationPipe },
    // Thứ tự guard: giới hạn tần suất -> chống CSRF -> đăng nhập -> phân quyền.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
