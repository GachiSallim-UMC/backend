import { ApiProperty } from '@nestjs/swagger';

export class WithdrawAuthAccountResponseDto {
  @ApiProperty({ example: true })
  withdrawn!: boolean;
}
