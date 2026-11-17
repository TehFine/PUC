import { IsInt, Max, Min } from "class-validator";
import { Count, OptionalField, OptionalText, RecordId } from "../../common/validation/fields";

export class CreateStampAllocationDto {
  @RecordId()
  @Max(Number.MAX_SAFE_INTEGER)
  householdId!: number;

  @OptionalText(40)
  plotCode?: string | null;

  @OptionalText(40)
  season?: string | null;

  @OptionalField()
  @Count()
  @Max(5_000_000)
  maxQuotaStamps?: number;

  @IsInt()
  @Min(1)
  @Max(5000)
  quantity!: number;

  @OptionalText(500)
  notes?: string | null;
}
