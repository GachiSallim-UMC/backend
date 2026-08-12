import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { NotificationGroupQueryDto } from './notification-group-query.dto';

describe('NotificationGroupQueryDto', () => {
  it('transforms and accepts a positive integer groupId', async () => {
    const dto = plainToInstance(NotificationGroupQueryDto, { groupId: '3' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.groupId).toBe(3);
  });

  it.each([
    ['missing', {}],
    ['zero', { groupId: 0 }],
    ['negative', { groupId: -1 }],
    ['decimal', { groupId: 1.5 }],
    ['non-numeric', { groupId: 'group-a' }],
  ])('rejects a %s groupId', async (_case, input) => {
    const dto = plainToInstance(NotificationGroupQueryDto, input);

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'groupId' })]),
    );
  });
});
