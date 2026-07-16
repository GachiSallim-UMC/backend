import { ApiProperty } from '@nestjs/swagger';

export class ReadAllNotificationsResponseDto {
  @ApiProperty({ example: 3 })
  updatedCount!: number;
}
