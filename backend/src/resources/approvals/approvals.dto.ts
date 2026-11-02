import { PartialType } from "@nestjs/mapped-types";
import { IsIn, IsOptional } from "class-validator";
import { Count, IsoDate, OptionalField, OptionalText, RecordId, Text } from "../../common/validation/fields";

export class CreateApprovalDto {
  @Text(40)
  code!: string;

  @Text(100)
  applicantName!: string;

  @Text(100)
  requestType!: string;

  @IsoDate()
  submittedOn!: string;

  @OptionalField()
  @Count()
  docsCount?: number;

  @OptionalField()
  @IsIn(["high", "medium", "low"])
  priority?: "high" | "medium" | "low";

  @OptionalField()
  @IsIn(["pending", "approved", "rejected", "cancelled"])
  status?: "pending" | "approved" | "rejected" | "cancelled";

  /** Hộ gửi hồ sơ (null = hồ sơ không gắn với hộ cụ thể). */
  @IsOptional()
  @RecordId()
  householdId?: number | null;

  @OptionalText(2000)
  note?: string | null;

  @OptionalText(40)
  plotCode?: string | null;
}

export class UpdateApprovalDto extends PartialType(CreateApprovalDto) {}

export class ApproveDto {
  @OptionalText(1000)
  note?: string | null;
}

export class RejectDto {
  @Text(1000)
  note!: string;
}
