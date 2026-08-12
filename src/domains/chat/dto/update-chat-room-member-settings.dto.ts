import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateChatRoomMemberSettingsDto {
  @ApiProperty({ description: '알림 수신 여부', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  notificationEnabled?: boolean;

  @ApiProperty({ description: '상단 고정 여부', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
