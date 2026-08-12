import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class GetDashboardQueryDto {
  @ApiProperty({ example: 1, description: 'Group ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId!: number;
}

