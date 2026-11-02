import { Global, Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

/** Tệp đính kèm dùng chung cho mọi nghiệp vụ (ảnh nhật ký, ảnh thu hoạch, hồ sơ, ảnh bản tin...). */
@Global()
@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
