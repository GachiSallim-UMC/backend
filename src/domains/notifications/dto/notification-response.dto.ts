import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ example: 101, description: '알림 ID' })
  notificationId!: number;

  @ApiPropertyOptional({ example: 3, nullable: true, description: '관련 그룹 ID' })
  groupId!: number | null;

  @ApiProperty({ enum: NotificationType, example: NotificationType.CHORE_DUE })
  type!: NotificationType;

  @ApiPropertyOptional({ example: 42, nullable: true, description: '관련 리소스 ID' })
  refId!: number | null;

  @ApiProperty({ example: '오늘까지 완료할 집안일이 있습니다.' })
  message!: string;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiProperty({ example: '2026-07-16T09:00:00.000Z' })
  createdAt!: string;
}
