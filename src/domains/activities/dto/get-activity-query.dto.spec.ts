import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GetActivityQueryDto } from './get-activity-query.dto';

describe('GetActivityQueryDto', () => {
  it('page가 1 이상일 때 유효성 검증을 통과해야 한다', async () => {
    const dto = plainToInstance(GetActivityQueryDto, {
      groupId: 1,
      page: 1,
    });

    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('page가 0 이하일 때 @Min(1) 조건으로 유효성 검증에 실패해야 한다', async () => {
    const dto = plainToInstance(GetActivityQueryDto, {
      groupId: 1,
      page: 0, // ❌ 0 이하의 값 (0 또는 음수)
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('page');
    expect(errors[0].constraints).toHaveProperty('min');
  });
});