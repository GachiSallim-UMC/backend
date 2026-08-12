import { ResidenceType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ description: '그룹 이름', example: '자취방 메이트' })
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiProperty({ description: '그룹 설명', example: '2인 자취 공유 그룹', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiProperty({ description: '최대 인원', example: 4, minimum: 2, maximum: 12, required: false })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(12)
  maxMembers?: number;

  @ApiProperty({ description: '거주 타입', enum: ResidenceType, example: ResidenceType.ROOMMATE, required: false })
  @IsOptional()
  @IsEnum(ResidenceType)
  residenceType?: ResidenceType;
}
