import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export enum SplitType {
  EQUAL = 'EQUAL',
  RATIO = 'RATIO',
  CUSTOM = 'CUSTOM',
}

export class CreateExpenseDto {
  @IsInt()
  @IsNotEmpty()
  groupId!: number;

  @IsInt()
  @IsNotEmpty()
  categoryId!: number;

  @IsInt()
  @IsNotEmpty()
  userId!: number; // API 호출자(선지불자/등록자) ID

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsInt()
  @Min(1, { message: '유효한 금액을 입력해 주세요. (1원 이상)' })
  @IsNotEmpty()
  totalAmount!: number;

  @IsEnum(SplitType)
  @IsNotEmpty()
  splitType!: SplitType;

  @IsArray()
  @IsInt({ each: true })
  @IsNotEmpty()
  participants!: number[]; // 분담 대상 유저 ID 배열

  @IsString()
  @IsOptional()
  receiptUrl?: string;
}