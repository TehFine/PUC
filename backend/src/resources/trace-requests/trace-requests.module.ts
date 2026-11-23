import { Module } from "@nestjs/common";
import {
  PublicTraceRequestsController,
  TraceRequestsController,
} from "./trace-requests.controller";
import { TraceRequestsService } from "./trace-requests.service";

@Module({
  controllers: [PublicTraceRequestsController, TraceRequestsController],
  providers: [TraceRequestsService],
  exports: [TraceRequestsService],
})
export class TraceRequestsModule { }

