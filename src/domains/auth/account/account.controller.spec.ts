/// <reference types="jest" />
import { StreamableFile } from '@nestjs/common';

import { AuthAccountController } from './account.controller';
import { AuthAccountService } from './account.service';
import { ProfileImageService } from './profile-image.service';

describe('AuthAccountController', () => {
  it('returns the data export as an unwrapped CSV attachment', async () => {
    const content = Buffer.from('\uFEFFrecordType,recordId\r\n', 'utf8');
    const accountService = {
      exportMyData: jest.fn().mockResolvedValue({
        filename: 'gachisallim-my-data-2026-07-30.csv',
        content,
      }),
    };
    const controller = new AuthAccountController(
      accountService as unknown as AuthAccountService,
      {} as ProfileImageService,
    );

    const result = await controller.exportMyData({
      cognitoSub: 'cognito-sub',
      accessToken: 'access-token',
    });

    expect(accountService.exportMyData).toHaveBeenCalledWith('cognito-sub');
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getHeaders()).toEqual({
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="gachisallim-my-data-2026-07-30.csv"',
      length: content.length,
    });
  });
});
