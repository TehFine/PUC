import { IsNumber, IsPositive, Max } from "class-validator";
import { OneOf, Text } from "../../common/validation/fields";
import { OptionalAttachmentId } from "../common/portal-fields";

/** Hộ dân tự kích hoạt tem dán quả sầu riêng tại vườn. */
export class ActivatePortalStampDto {
  @Text(40)
  serialCode!: string;

  @Text(30)
  plotCode!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(15)
  fruitWeightKg!: number;

  @OneOf(["A", "B", "C"])
  grade!: "A" | "B" | "C";

  @OptionalAttachmentId()
  photoId?: number | null;
}
