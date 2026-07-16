import { ApiProperty } from '@nestjs/swagger';

export class ReadNotificationResponseDto {
  @ApiProperty({ example: 101 })
  notificationId!: number;

  @ApiProperty({ example: true })
  isRead!: true;
}
