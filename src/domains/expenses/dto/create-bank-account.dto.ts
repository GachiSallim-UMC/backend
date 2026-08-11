import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumberString, Length } from 'class-validator';
import { Bank } from '@prisma/client';

export class CreateBankAccountDto {
  @ApiProperty({
    enum: Bank,
    example: Bank.SHINHAN,
    description: '은행 코드 (토스 송금 딥링크의 bank 파라미터 값과 동일)',
  })
  @IsEnum(Bank)
  bankName!: Bank;

  @ApiProperty({
    example: '110123456789',
    description: '계좌번호 (하이픈 없이 숫자만)',
  })
  @IsNumberString()
  @Length(1, 30)
  accountNumber!: string;
}
