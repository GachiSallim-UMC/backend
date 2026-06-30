import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              const values: Record<string, string> = {
                APP_NAME: 'GachiSallim Backend',
                APP_VERSION: '0.1.0',
              };

              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('returns application metadata', () => {
    expect(service.getMetadata()).toEqual({
      name: 'GachiSallim Backend',
      version: '0.1.0',
    });
  });
});
