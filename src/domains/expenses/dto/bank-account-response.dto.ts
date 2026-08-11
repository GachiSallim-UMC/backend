import { ApiProperty } from '@nestjs/swagger';
import { Bank } from '@prisma/client';

export class BankAccountResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ enum: Bank, example: Bank.SHINHAN })
  bankName!: Bank;

  @ApiProperty({ example: '110123456789' })
  accountNumber!: string;

  @ApiProperty({ example: true, description: '정산 송금 링크 생성 시 사용될 기본 계좌 여부' })
  isPrimary!: boolean;
}
