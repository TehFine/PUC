import { IsIn } from "class-validator";
import { UPLOAD_PURPOSES, type UploadPurpose } from "./uploads.service";

export class UploadDto {
  @IsIn(UPLOAD_PURPOSES, { message: "Mục đích tải tệp không hợp lệ." })
  purpose!: UploadPurpose;
}
