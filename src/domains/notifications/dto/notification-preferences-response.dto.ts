import { ApiProperty } from '@nestjs/swagger';

export class NotificationPreferencesResponseDto {
  @ApiProperty({ example: true })
  choreDue!: boolean;

  @ApiProperty({ example: true })
  supplyStatusChanged!: boolean;

  @ApiProperty({ example: true })
  newMessage!: boolean;

  @ApiProperty({ example: true })
  expenseRequest!: boolean;

  @ApiProperty({ example: true })
  ruleAgreementRequest!: boolean;

  @ApiProperty({ example: true })
  groupActivity!: boolean;
}
