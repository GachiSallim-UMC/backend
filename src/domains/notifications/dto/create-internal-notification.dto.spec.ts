import { NotificationType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateInternalNotificationDto } from './create-internal-notification.dto';

describe('CreateInternalNotificationDto', () => {
  it('accepts positive safe IDs, a NotificationType, and a nonblank message', async () => {
    const dto = plainToInstance(CreateInternalNotificationDto, {
      userId: 8,
      groupId: 3,
      type: NotificationType.RULE_CHANGED,
      refId: 42,
      message: '생활 규칙이 변경되었습니다.',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid IDs, enum values, and blank messages', async () => {
    const dto = plainToInstance(CreateInternalNotificationDto, {
      userId: 0,
      groupId: -1,
      type: 'UNKNOWN',
      refId: Number.MAX_SAFE_INTEGER + 1,
      message: '   ',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['userId', 'groupId', 'type', 'refId', 'message']),
    );
  });

  it('rejects messages longer than the database column', async () => {
    const dto = plainToInstance(CreateInternalNotificationDto, {
      userId: 8,
      groupId: 3,
      type: NotificationType.RULE_CHANGED,
      message: 'a'.repeat(256),
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('message');
  });
});
