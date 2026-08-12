import { IsInt, IsNotEmpty, IsArray, IsEnum, Min, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CalculateExpenseDto {
  @ApiProperty({ description: '총 지출 금액 (1원 이상)', example: 90000 })
  @IsInt()
  @Min(1, { message: 'totalAmount는 최소 1원 이상의 양수여야 합니다.' })
  @IsNotEmpty()
  totalAmount!: number;

  @ApiProperty({ 
    description: '분담 방식', 
    enum: ['EQUAL', 'RATIO', 'CUSTOM'], 
    example: 'EQUAL' 
  })
  @IsEnum(['EQUAL', 'RATIO', 'CUSTOM'])
  @IsNotEmpty()
  splitType!: 'EQUAL' | 'RATIO' | 'CUSTOM';

  @ApiProperty({ 
    description: '분담 대상 유저 ID 목록 (최소 1명 이상)', 
    type: [Number], 
    example: [1, 2, 3] 
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'participants 배열은 비어있을 수 없습니다.' })
  @IsInt({ each: true, message: '유저 ID는 정수형이어야 합니다.' })
  @Min(1, { each: true, message: '유저 ID는 양수여야 합니다.' })
  @IsNotEmpty()
  participants!: number[];
}