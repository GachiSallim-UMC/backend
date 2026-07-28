/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ArgumentMetadata, ValidationPipe, BadRequestException } from '@nestjs/common';
import { CreateExpenseDto } from './create-expense.dto';
import { ExpenseCategory, SplitType } from '@prisma/client';

describe('CreateExpenseDto - 사용자 ID 양의 정수 검증 테스트', () => {
  let target: ValidationPipe;
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateExpenseDto,
    data: '',
  };

  beforeEach(() => {
    target = new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => new BadRequestException(errors),
    });
  });

  const createValidPayload = (): Record<string, any> => ({
    groupId: 1,
    title: '장보기',
    amount: 30000,
    payerId: '12',
    date: '2026-07-28',
    splitType: SplitType.EQUAL,
    category: ExpenseCategory.FOOD,
    targetMemberIds: [{ userId: '12' }, { userId: '13' }],
  });

  it('올바른 양의 정수 문자열 ID일 경우 통과해야 한다', async () => {
    const payload = createValidPayload();
    const result = await target.transform(payload, metadata);
    expect(result).toBeDefined();
    expect(result.payerId).toBe('12');
  });

  describe('payerId 검증 실패 케이스', () => {
    it.each([
      ['문자열 포함', 'abc'],
      ['0 입력', '0'],
      ['음수 입력', '-1'],
      ['소수점 입력', '1.5'],
      ['특수문자 포함', '12#'],
      ['공백 문자열', '  '],
    ])('payerId가 %s(%p)일 때 400 에러를 던져야 한다', async (_, invalidPayerId) => {
      const payload = { ...createValidPayload(), payerId: invalidPayerId };

      await expect(target.transform(payload, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('targetMemberIds[].userId 검증 실패 케이스', () => {
    it.each([
      ['문자열 포함', 'abc'],
      ['0 입력', '0'],
      ['음수 입력', '-12'],
      ['소수점 입력', '3.14'],
    ])('targetMemberIds 내 userId가 %s(%p)일 때 400 에러를 던져야 한다', async (_, invalidUserId) => {
      const payload = {
        ...createValidPayload(),
        targetMemberIds: [{ userId: '12' }, { userId: invalidUserId }],
      };

      await expect(target.transform(payload, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});