import { Transform } from "class-transformer";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto } from "../../common/crud/list-query.dto";
import { OptionalText, RecordId } from "../../common/validation/fields";

export type DeletionTargetType = "account" | "household";
export type DeletionRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export class ListDeletionRequestsQueryDto extends ListQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" && value.trim() ? value.trim() : undefined))
  @IsIn(["pending", "approved", "rejected", "cancelled"])
  status?: DeletionRequestStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" && value.trim() ? value.trim() : undefined))
  @IsIn(["account", "household"])
  targetType?: DeletionTargetType;
}

export class CreateDeletionRequestDto {
  @IsIn(["account", "household"])
  targetType!: DeletionTargetType;

  @RecordId()
  targetId!: number;

  @OptionalText(500)
  reason?: string | null;
}

export class ReviewDeletionRequestDto {
  @OptionalText(500)
  note?: string | null;
}

