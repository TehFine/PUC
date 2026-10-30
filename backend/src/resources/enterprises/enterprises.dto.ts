import { PartialType } from "@nestjs/mapped-types";
import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateEnterpriseDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  taxCode?: string;

  @IsString()
  @IsOptional()
  representative?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  packhouseCode?: string;

  @IsIn(["active", "inactive"])
  @IsOptional()
  status?: "active" | "inactive";
}

export class UpdateEnterpriseDto extends PartialType(CreateEnterpriseDto) {}
