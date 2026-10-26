import { PartialType } from "@nestjs/mapped-types";
import { IsIn } from "class-validator";
import { Count, IsoDate, OptionalField, Text } from "../../common/validation/fields";

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
  @IsIn(["pending", "approved", "rejected"])
  status?: "pending" | "approved" | "rejected";
}

export class UpdateApprovalDto extends PartialType(CreateApprovalDto) {}
