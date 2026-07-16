import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum RuleAgreementStatusValue {
  AGREED = 'AGREED',
  DISAGREED = 'DISAGREED',
  PENDING = 'PENDING',
}

export class UpdateRuleAgreementDto {
  @ApiProperty({
    enum: RuleAgreementStatusValue,
    example: RuleAgreementStatusValue.AGREED,
    description: '규칙 확인 및 동의 상태',
  })
  @IsEnum(RuleAgreementStatusValue)
  status!: RuleAgreementStatusValue;
}
