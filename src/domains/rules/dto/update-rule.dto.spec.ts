/// <reference types="jest" />
import { validate } from 'class-validator';

import { RuleStatusValue, UpdateRuleDto } from './update-rule.dto';

describe('UpdateRuleDto', () => {
  it('status 직접 변경 요청을 거부한다', async () => {
    const dto = Object.assign(new UpdateRuleDto(), {
      categoryId: 1,
      title: '공용 공간 정리하기',
      description: '사용 후 바로 정리합니다.',
      status: RuleStatusValue.ACTIVE,
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'status' })]),
    );
  });
});
