import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class NotificationGroupQueryDto {
  @ApiProperty({ example: 3, description: '조회할 그룹 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId!: number;
}
