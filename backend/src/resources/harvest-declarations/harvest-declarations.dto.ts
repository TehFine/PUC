import { OptionalText, Text } from "../../common/validation/fields";

export class ConfirmHarvestDeclarationDto {
  @OptionalText(1000)
  note?: string | null;
}

export class RejectHarvestDeclarationDto {
  @Text(1000)
  note!: string;
}
