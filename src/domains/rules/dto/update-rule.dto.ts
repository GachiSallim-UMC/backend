import { ApiProperty } from '@nestjs/swagger';
import { IsEmpty, IsInt, IsNotEmpty, IsOptional, IsString, Length, Min } from 'class-validator';

export enum RuleStatusValue {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export class UpdateRuleDto {
  @ApiProperty({ example: 1, description: '규칙 카테고리 ID' })
  @IsInt()
  @Min(1)
  categoryId!: number;

  @ApiProperty({ example: '밤 11시 이후 조용히 하기', description: '규칙 제목 (1~30자)' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 30)
  title!: string;

  @ApiProperty({ example: '늦은 시간에는 소음을 줄여주세요.', description: '규칙 상세 설명' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({
    enum: RuleStatusValue,
    example: RuleStatusValue.INACTIVE,
    description: '동의 현황에 따라 서버에서 결정되는 읽기 전용 상태',
    readOnly: true,
    required: false,
  })
  @IsOptional()
  @IsEmpty({ message: 'status는 동의 현황에 따라 자동으로 결정됩니다.' })
  status?: RuleStatusValue;
}
