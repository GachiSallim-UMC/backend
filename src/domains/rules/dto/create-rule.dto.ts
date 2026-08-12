import { IsInt, IsNotEmpty, IsString, Length, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRuleDto {
  @ApiProperty({ example: 1, description: '공동생활 그룹 ID' })
  @IsInt()
  @Min(1)
  groupId!: number;

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
}
