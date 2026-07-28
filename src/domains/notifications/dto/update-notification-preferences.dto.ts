import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  choreDue?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  supplyStatusChanged?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  newMessage?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  expenseRequest?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  ruleAgreementRequest?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: '그룹에 속한 모든 알림의 웹 푸시 상위 설정',
  })
  @IsOptional()
  @IsBoolean()
  groupActivity?: boolean;
}
