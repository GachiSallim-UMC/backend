import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdateGroupDto {
  @ApiPropertyOptional({ description: '그룹 이름', example: '자취방 메이트' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  @ApiPropertyOptional({ description: '그룹 설명', example: '2인 자취 공유 그룹' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiPropertyOptional({
    description: '그룹 이미지 URL. null이면 기존 이미지를 제거합니다.',
    example: 'https://example.com/group.png',
    nullable: true,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @IsUrl()
  @MaxLength(512)
  groupImage?: string | null;

  @ApiPropertyOptional({ description: '최대 인원', example: 4, minimum: 2, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  maxMembers?: number;
}
