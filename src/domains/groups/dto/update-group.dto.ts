import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateGroupDto {
  @ApiProperty({ description: '그룹 이름', example: '자취방 메이트', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  @ApiProperty({ description: '그룹 설명', example: '2인 자취 공유 그룹', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiProperty({ description: '최대 인원', example: 4, minimum: 2, maximum: 10, required: false })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  maxMembers?: number;
}
