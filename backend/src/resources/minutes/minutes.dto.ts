import { PartialType } from "@nestjs/mapped-types";
import { IsIn, IsNumber, IsOptional, Max, Min } from "class-validator";
import { IsoDate, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateMinuteDto {
  @Text(40)
  code!: string;

  @IsoDate()
  heldOn!: string;

  @Text(200)
  location!: string;

  @Text(100)
  officer!: string;

  @IsIn(["pass", "fail", "improve"])
  result!: "pass" | "fail" | "improve";

  @OptionalText(40)
  plotCode?: string | null;

  @IsOptional()
  @RecordId()
  householdId?: number | null;

  @IsOptional()
  @RecordId()
  photoId?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @OptionalText(250)
  lateReason?: string | null;
}

export class UpdateMinuteDto extends PartialType(CreateMinuteDto) {}
