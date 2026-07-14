/// <reference types="jest" />
import { jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { validate } from 'class-validator';

import { ErrorCode } from '../../../common/constants/error-code.constant';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../prisma/prisma.service';
import { CognitoAuthGateway } from '../core/cognito-auth.gateway';
import { AuthSignupService } from './auth-signup.service';
import { SignupDto } from './dto/signup.dto';

type MockedPrisma = {
  user: {
    findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
    create: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
  };
};

type MockedCognitoAuthGateway = {
  createConfirmedUser: jest.MockedFunction<(email: string, password: string) => Promise<string>>;
  deleteAdminUser: jest.MockedFunction<(email: string) => Promise<void>>;
};

const SIGNUP_DTO: SignupDto = {
  email: 'example@gmail.com',
  password: 'Password1',
  nickname: '길동',
};

describe('AuthSignupService', () => {
  let service: AuthSignupService;
  let prisma: MockedPrisma;
  let cognitoAuthGateway: MockedCognitoAuthGateway;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn<() => Promise<unknown>>(),
        create: jest.fn<() => Promise<unknown>>(),
      },
    };
    cognitoAuthGateway = {
      createConfirmedUser: jest.fn<() => Promise<string>>(),
      deleteAdminUser: jest.fn<() => Promise<void>>(),
    };
    service = new AuthSignupService(
      prisma as unknown as PrismaService,
      cognitoAuthGateway as unknown as CognitoAuthGateway,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a confirmed Cognito user and the linked service account', async () => {
    const createdAt = new Date('2026-07-14T00:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue(null);
    cognitoAuthGateway.createConfirmedUser.mockResolvedValue('cognito-sub');
    prisma.user.create.mockResolvedValue({
      id: 1n,
      email: SIGNUP_DTO.email,
      nickname: SIGNUP_DTO.nickname,
      profileImage: null,
      createdAt,
    });

    await expect(service.signup(SIGNUP_DTO)).resolves.toEqual({
      id: '1',
      email: SIGNUP_DTO.email,
      nickname: SIGNUP_DTO.nickname,
      profileImage: null,
      createdAt: createdAt.toISOString(),
    });
    expect(cognitoAuthGateway.createConfirmedUser).toHaveBeenCalledWith(
      SIGNUP_DTO.email,
      SIGNUP_DTO.password,
    );
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: SIGNUP_DTO.email,
        name: SIGNUP_DTO.nickname,
        nickname: SIGNUP_DTO.nickname,
        authIdentities: {
          create: {
            provider: 'COGNITO',
            cognitoSub: 'cognito-sub',
            email: SIGNUP_DTO.email,
          },
        },
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        profileImage: true,
        createdAt: true,
      },
    });
  });

  it('rejects an email that already belongs to a service account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1n });

    await expect(service.signup(SIGNUP_DTO)).rejects.toMatchObject({
      code: ErrorCode.AUTH_EMAIL_ALREADY_EXISTS.code,
    });
    expect(cognitoAuthGateway.createConfirmedUser).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('propagates a Cognito creation failure without writing to the database', async () => {
    const providerError = new BusinessException(ErrorCode.AUTH_PROVIDER_ERROR);
    prisma.user.findUnique.mockResolvedValue(null);
    cognitoAuthGateway.createConfirmedUser.mockRejectedValue(providerError);

    await expect(service.signup(SIGNUP_DTO)).rejects.toBe(providerError);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(cognitoAuthGateway.deleteAdminUser).not.toHaveBeenCalled();
  });

  it('logs a failed Cognito compensation and preserves the database failure', async () => {
    const databaseError = new Error('database unavailable');
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.user.findUnique.mockResolvedValue(null);
    cognitoAuthGateway.createConfirmedUser.mockResolvedValue('cognito-sub');
    prisma.user.create.mockRejectedValue(databaseError);
    cognitoAuthGateway.deleteAdminUser.mockRejectedValue(new Error('cleanup failed'));

    await expect(service.signup(SIGNUP_DTO)).rejects.toBe(databaseError);
    expect(cognitoAuthGateway.deleteAdminUser).toHaveBeenCalledWith(SIGNUP_DTO.email);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining(SIGNUP_DTO.email),
      expect.any(String),
    );
  });

  it('maps an email unique constraint race to the duplicate email contract', async () => {
    const uniqueEmailError = new Prisma.PrismaClientKnownRequestError('duplicate email', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['email'] },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    cognitoAuthGateway.createConfirmedUser.mockResolvedValue('cognito-sub');
    prisma.user.create.mockRejectedValue(uniqueEmailError);

    await expect(service.signup(SIGNUP_DTO)).rejects.toMatchObject({
      code: ErrorCode.AUTH_EMAIL_ALREADY_EXISTS.code,
    });
    expect(cognitoAuthGateway.deleteAdminUser).toHaveBeenCalledWith(SIGNUP_DTO.email);
  });

  it('rejects invalid email, password, and nickname values', async () => {
    const dto = Object.assign(new SignupDto(), {
      email: 'not-an-email',
      password: 'password',
      nickname: '!',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property).sort()).toEqual(['email', 'nickname', 'password']);
  });
});
