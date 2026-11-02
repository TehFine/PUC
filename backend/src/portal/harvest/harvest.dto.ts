import { IsNumber, IsPositive, Max } from "class-validator";
import { IsoDate, OptionalField, OptionalText, Text } from "../../common/validation/fields";
import { OptionalAttachmentId, OptionalNumberIn } from "../common/portal-fields";

/** Hộ dân tự khai báo nhật ký thu hái tại vườn. */
export class CreateHarvestDeclarationDto {
  @Text(30)
  plotCode!: string;

  @OptionalField()
  @IsoDate()
  harvestedOn?: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(100_000)
  weightKg!: number;

  @OptionalNumberIn(0, 100_000)
  gradeAKg?: number;

  @OptionalNumberIn(0, 100_000)
  gradeBKg?: number;

  @OptionalText(50)
  qualityRating?: string | null;

  @OptionalText(300)
  note?: string | null;

  @OptionalAttachmentId()
  photoId?: number | null;
}
