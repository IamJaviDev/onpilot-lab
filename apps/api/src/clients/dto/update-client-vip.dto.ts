import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateClientVipDto {
  @IsBoolean()
  isVip: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  vipDiscountPercent: number;
}
