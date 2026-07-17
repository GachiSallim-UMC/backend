import { IsInt, IsNotEmpty, IsArray, IsEnum } from 'class-validator';
import { ApiProperty} from '@nestjs/swagger';

export class CalculateExpenseDto {
  @ApiProperty({ description: '총 지출 금액 (1원 이상)', example: 90000 })
  @IsInt()
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
    description: '분담 대상 유저 ID 목록', 
    type: [Number], 
    example: [1, 2, 3] 
  })
  @IsArray()
  @IsInt({ each: true })
  @IsNotEmpty()
  participants!: number[];
}