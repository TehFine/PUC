import { IsInt, IsPositive } from "class-validator";

/** Duyệt tài khoản: bắt buộc chọn hộ mà tài khoản sẽ được xem dữ liệu. */
export class ApproveRegistrationDto {
  @IsInt()
  @IsPositive()
  householdId!: number;
}
