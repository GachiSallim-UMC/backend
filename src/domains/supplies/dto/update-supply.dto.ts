import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupplyCategory } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

// 전달된 필드만 부분 수정한다. 상태(status) 변경은 SUP-STATUS-01(/status)에서 처리한다.
// assigneeId/memo에 null을 보내면 '미지정'으로 해제된다. (@IsOptional은 null도 통과시킴)
export class UpdateSupplyDto {
  @ApiPropertyOptional({ example: '두루마리 화장지', description: '물품명 (최대 100자)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    enum: SupplyCategory,
    example: SupplyCategory.BATHROOM,
    description: '물품 카테고리',
  })
  @IsOptional()
  @IsEnum(SupplyCategory)
  category?: SupplyCategory;

  @ApiPropertyOptional({
    example: 5,
    nullable: true,
    description: '구매 담당자 사용자 ID (null이면 미지정으로 해제)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  assigneeId?: number | null;

  @ApiPropertyOptional({
    example: '매달 구매, 마트에서 대용량으로 구입',
    nullable: true,
    description: '메모 (최대 255자, null이면 삭제)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string | null;
}
