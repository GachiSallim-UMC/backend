import { ApiProperty } from '@nestjs/swagger';

export class UnreadNotificationCountResponseDto {
  @ApiProperty({ example: 4 })
  unreadCount!: number;
}
