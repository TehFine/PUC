import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsIn, IsOptional } from "class-validator";
import { IsoDate, NonNegative, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

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

  @OptionalText(140)
  labAccreditationCode?: string | null;

  @OptionalText(80)
  externalVerifyCode?: string | null;

  @OptionalText(300)
  externalVerifyUrl?: string | null;
}

export class UpdateLabTestDto extends PartialType(CreateLabTestDto) {}
