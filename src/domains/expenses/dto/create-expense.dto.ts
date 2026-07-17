import { IsInt, IsString, IsNotEmpty, IsEnum, IsArray, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiProperty({ description: '그룹 ID', example: 1 })
  @IsInt()
  @IsNotEmpty()
  groupId!: number;

  @ApiProperty({ description: '카테고리 ID', example: 2 })
  @IsInt()
  @IsNotEmpty()
  categoryId!: number;

  @ApiProperty({ description: '선지불자 유저 ID (비용 등록 주체)', example: 1 })
  @IsInt()
  @IsNotEmpty()
  userId!: number;

  @ApiProperty({ description: '지출 항목명', example: '5월 관리비' })
  @IsString()
  @IsNotEmpty()
  title!: string;

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
    description: '분담 대상 유저 ID 목록 (선지불자 본인 포함 가능)', 
    type: [Number], 
    example: [1, 2, 3] 
  })
  @IsArray()
  @IsInt({ each: true })
  @IsNotEmpty()
  participants!: number[];

  @ApiPropertyOptional({ 
    description: '영수증 이미지 S3 URL', 
    example: 'https://s3.amazonaws.com/receipt/123.jpg' 
  })
  @IsUrl()
  @IsOptional()
  receiptUrl?: string;
}