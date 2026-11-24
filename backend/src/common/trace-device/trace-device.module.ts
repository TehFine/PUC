import { Global, Module } from "@nestjs/common";
import { TraceDeviceGuardService } from "./trace-device-guard.service";

@Global()
@Module({
  providers: [TraceDeviceGuardService],
  exports: [TraceDeviceGuardService],
})
export class TraceDeviceModule {}

