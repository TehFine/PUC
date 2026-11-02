import { IsInt, Max, Min } from "class-validator";
import { Count, OptionalField, OptionalText, RecordId } from "../../common/validation/fields";

export class CreateStampAllocationDto {
  @RecordId()
  householdId!: number;

  @OptionalText(40)
  plotCode?: string | null;

  @OptionalText(40)
  season?: string | null;

  @OptionalField()
  @Count()
  maxQuotaStamps?: number;

  @IsInt()
  @Min(1)
  @Max(5000)
  quantity!: number;

  @OptionalText(500)
  notes?: string | null;
}
