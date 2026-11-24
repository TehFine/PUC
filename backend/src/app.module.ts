import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { OriginGuard } from "./auth/guards/origin.guard";
import { PermissionsGuard } from "./auth/guards/permissions.guard";
import { RequestIntegrityGuard } from "./auth/guards/request-integrity.guard";
import { AllExceptionsFilter } from "./common/errors/all-exceptions.filter";
import { CacheModule } from "./common/cache/cache.module";
import { IdempotencyInterceptor } from "./common/idempotency/idempotency.interceptor";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { AppValidationPipe } from "./common/pipes/validation.pipes";
import { AppThrottlerGuard } from "./common/throttler/app-throttler.guard";
import { RateLimitModule } from "./common/throttler/rate-limit.module";
import { TraceDeviceModule } from "./common/trace-device/trace-device.module";
import { configuration } from "./config/configuration";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { AuthenticatedTraceController, PublicController } from "./public/public.controller";
import { TraceabilityService } from "./public/traceability.service";
import { PlotsModule } from "./plots/plots.module";
import { PortalModule } from "./portal/portal.module";
import { RegistrationsModule } from "./registrations/registrations.module";
import { ResourcesModule } from "./resources/resources.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { UploadsModule } from "./uploads/uploads.module";
import { CareProtocolModule } from "./care-protocol/care-protocol.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], cache: true }),
    CacheModule,
    RateLimitModule,
    DatabaseModule,
    IdempotencyModule,
    AuditModule,
    UploadsModule,
    NotificationsModule,
    AuthModule,
    TraceDeviceModule,
    PlotsModule,
    PortalModule,
    CareProtocolModule,
    RegistrationsModule,
    ResourcesModule,
  ],
  controllers: [HealthController, PublicController, AuthenticatedTraceController],
  providers: [
    TraceabilityService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useClass: AppValidationPipe },
    // Thứ tự guard: giới hạn tần suất đa tầng -> chống CSRF -> chống bắt gói tin/phát lại -> đăng nhập -> phân quyền.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: RequestIntegrityGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
