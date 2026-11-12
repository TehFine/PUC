import { IsOptional } from "class-validator";
import { OneOf, Text } from "../common/validation/fields";

export const SYSTEM_ALERT_SEVERITIES = ["critical", "warning"] as const;
export type SystemAlertSeverity = (typeof SYSTEM_ALERT_SEVERITIES)[number];

export const SYSTEM_ALERT_AUDIENCES = ["all", "farmer", "staff"] as const;
export type SystemAlertAudience = (typeof SYSTEM_ALERT_AUDIENCES)[number];

export class CreateSystemAlertDto {
  @IsOptional()
  @OneOf(SYSTEM_ALERT_SEVERITIES)
  severity?: SystemAlertSeverity;

  @Text(160)
  title!: string;

  @Text(600)
  message!: string;

  @IsOptional()
  @OneOf(SYSTEM_ALERT_AUDIENCES)
  audience?: SystemAlertAudience;
}

