import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsIn, IsOptional } from "class-validator";
import { IsoDate, NonNegative, OptionalField, RecordId, Text } from "../../common/validation/fields";

export class CreateLabTestDto {
  @Text(40)
  code!: string;

  @RecordId()
  householdId!: number;

  @Text(40)
  plotCode!: string;

  @IsoDate()
  sampledOn!: string;

  @NonNegative()
  cdMgKg!: number;

  @OptionalField()
  @IsBoolean()
  yellowOPositive?: boolean;

  @NonNegative()
  residueMgKg!: number;

  @IsOptional()
  @NonNegative()
  chlorpyrifosMgKg?: number | null;

  @IsIn(["pass", "fail"])
  result!: "pass" | "fail";

  @Text(100)
  lab!: string;

  @IsOptional()
  @RecordId()
  scanAttachmentId?: number | null;

  @OptionalField()
  @IsIn(["draft", "verified"])
  recordStatus?: "draft" | "verified";
}

export class UpdateLabTestDto extends PartialType(CreateLabTestDto) {}
