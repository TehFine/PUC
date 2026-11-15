import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean } from "class-validator";
import { IsoDate, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateJournalDto {
  @IsoDate()
  entryOn!: string;

  @RecordId()
  householdId!: number;

  @Text(40)
  plotCode!: string;

  @Text(100)
  activity!: string;

  @OptionalText(500)
  detail?: string | null;

  @OptionalText(100)
  recorder?: string | null;

  @OptionalField()
  @IsBoolean()
  hasPhoto?: boolean;

  @OptionalText(250)
  lateReason?: string | null;
}

export class UpdateJournalDto extends PartialType(CreateJournalDto) {}
