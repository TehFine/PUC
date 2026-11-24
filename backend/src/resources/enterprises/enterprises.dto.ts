import { PartialType } from "@nestjs/mapped-types";
import { IsIn } from "class-validator";
import { OptionalField, OptionalIsoDate, OptionalText, Text } from "../../common/validation/fields";

export class CreateEnterpriseDto {
  @Text(40)
  code!: string;

  @Text(200)
  name!: string;

  @OptionalText(40)
  taxCode?: string | null;

  @OptionalText(100)
  representative?: string | null;

  @OptionalText(30)
  phone?: string | null;

  @OptionalText(300)
  address?: string | null;

  @OptionalText(50)
  packhouseCode?: string | null;

  @OptionalText(60)
  gaccCode?: string | null;

  @OptionalIsoDate()
  mardApprovedOn?: string | null;

  @OptionalIsoDate()
  gaccApprovedOn?: string | null;

  @OptionalField()
  @IsIn(["active", "suspended", "revoked", "inactive"])
  status?: "active" | "suspended" | "revoked" | "inactive";
}

export class UpdateEnterpriseDto extends PartialType(CreateEnterpriseDto) { }
