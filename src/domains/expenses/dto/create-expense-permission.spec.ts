/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateExpenseDto } from './create-expense.dto';

describe('CreateExpenseDto - 사용자 ID(payerId, targetMemberIds) 양의 정수 검증', () => {
  const basePayload = {
    groupId: 1,
    title: '저녁 식사',
    amount: 30000,
    payerId: '10',
    date: '2026-07-28',
    splitType: 'EQUAL',
    category: 'FOOD',
    targetMemberIds: [{ userId: '20' }],
  };

  it('올바른 양의 정수 문자열 ID인 경우 검증을 통과해야 한다', async () => {
    const dto = plainToInstance(CreateExpenseDto, basePayload);
    const errors: ValidationError[] = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it.each(['abc', '0', '-5', '1.5', ''])(
    'payerId가 유효하지 않은 값(%s)이면 검증 에러가 발생해야 한다',
    async (invalidPayerId: string) => {
      const dto = plainToInstance(CreateExpenseDto, {
        ...basePayload,
        payerId: invalidPayerId,
      });

      const errors: ValidationError[] = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      const hasPayerIdError = errors.some(
        (e: ValidationError) => e.property === 'payerId',
      );
      expect(hasPayerIdError).toBe(true);
    },
  );

  it.each(['abc', '0', '-10', '2.4', ''])(
    'targetMemberIds[].userId가 유효하지 않은 값(%s)이면 검증 에러가 발생해야 한다',
    async (invalidUserId: string) => {
      const dto = plainToInstance(CreateExpenseDto, {
        ...basePayload,
        targetMemberIds: [{ userId: invalidUserId }],
      });

      const errors: ValidationError[] = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      const hasTargetMembersError = errors.some(
        (e: ValidationError) => e.property === 'targetMemberIds',
      );
      expect(hasTargetMembersError).toBe(true);
    },
  );
});