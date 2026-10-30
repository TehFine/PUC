import { PartialType } from "@nestjs/mapped-types";
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsNumber()
  @IsNotEmpty()
  enterpriseId!: number;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsDateString()
  @IsNotEmpty()
  signedOn!: string;

  @IsDateString()
  @IsNotEmpty()
  validUntil!: string;

  @IsNumber()
  @IsOptional()
  targetTons?: number;

  @IsString()
  @IsOptional()
  priceGuarantee?: string;

  @IsString()
  @IsOptional()
  market?: string;

  @IsIn(["active", "completed", "expired"])
  @IsOptional()
  status?: "active" | "completed" | "expired";

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}
