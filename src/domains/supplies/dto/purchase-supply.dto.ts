import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

// categoryId/amount 누락 시 각각 다른 에러코드(SUP_400_CATEGORY / COMMON_INVALID_PARAMETER)를
// 반환해야 하므로, DTO에서는 optional로 두고 서비스에서 순서대로 필수 검증한다.
export class PurchaseSupplyDto {
  @ApiProperty({ example: 3, description: '정산 카테고리 ID (필수)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiProperty({ example: 8900, description: '구매 금액 (필수, 원 단위)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount?: number;
}
