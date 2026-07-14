import { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { Server } from 'http';
import request from 'supertest';

import { PrismaService } from '../../../prisma/prisma.service';
import { AlbAuthGuard } from '../core/alb-auth.guard';
import { AuthenticatedRequest } from '../core/auth-context.interface';
import { CognitoAuthGateway } from '../core/cognito-auth.gateway';
import { AuthSessionController } from './auth-session.controller';

const CONFIG: Record<string, string> = {
  COGNITO_DOMAIN: 'https://auth.example.com/prefix',
  COGNITO_USER_POOL_CLIENT_ID: 'client-id',
  AUTH_LOGOUT_REDIRECT_URI: 'https://client.example.com/logout?source=app',
};

describe('AuthSessionController', () => {
  const globalSignOut = jest.fn<Promise<void>, [string]>();
  const cognitoAuthGateway = { globalSignOut } as unknown as CognitoAuthGateway;
  const configService = {
    getOrThrow: jest.fn((key: string): string => CONFIG[key]),
  } as unknown as ConfigService;
  let controller: AuthSessionController;

  beforeEach(() => {
    jest.clearAllMocks();
    globalSignOut.mockResolvedValue();
    controller = new AuthSessionController(cognitoAuthGateway, configService);
  });

  it('redirects login requests to the protected me endpoint with 303', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthSessionController],
      providers: [
        { provide: CognitoAuthGateway, useValue: cognitoAuthGateway },
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: {} },
        { provide: AlbAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    const httpServer = app.getHttpServer() as Server;

    await request(httpServer)
      .post('/api/v1/auth/login')
      .expect(303)
      .expect('Location', '/api/v1/auth/me');

    await app.close();
  });

  it('serves logout at the globally prefixed auth route', async () => {
    const authenticatedGuard = {
      canActivate: jest.fn((context: ExecutionContext): boolean => {
        const authenticatedRequest = context.switchToHttp().getRequest<AuthenticatedRequest>();
        authenticatedRequest.authContext = {
          accessToken: 'route-access-token',
          user: {
            id: 1n,
            cognitoSub: 'cognito-sub',
            email: 'user@example.com',
            nickname: '사용자',
            profileImage: null,
            createdAt: new Date('2026-07-14T00:00:00.000Z'),
          },
        };

        return true;
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthSessionController],
      providers: [
        { provide: CognitoAuthGateway, useValue: cognitoAuthGateway },
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(AlbAuthGuard)
      .useValue(authenticatedGuard)
      .compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    const httpServer = app.getHttpServer() as Server;

    await request(httpServer)
      .post('/api/v1/auth/logout')
      .set('Cookie', 'AWSELBAuthSessionCookie=value')
      .expect(302)
      .expect(
        'Location',
        'https://auth.example.com/logout?client_id=client-id&logout_uri=https%3A%2F%2Fclient.example.com%2Flogout%3Fsource%3Dapp',
      );

    expect(globalSignOut).toHaveBeenCalledWith('route-access-token');
    await app.close();
  });

  it('globally signs out, expires every ALB auth cookie shard, and redirects to Cognito', async () => {
    const setHeader = jest.fn();
    const redirect = jest.fn();
    const response = { setHeader, redirect } as unknown as Response;

    await controller.logout(
      'access-token',
      [
        'AWSELBAuthSessionCookie=base',
        'AWSELBAuthSessionCookie-0=first',
        'unrelated=value',
        'AWSELBAuthSessionCookie-1=second',
      ].join('; '),
      response,
    );

    expect(globalSignOut).toHaveBeenCalledWith('access-token');
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', [
      'AWSELBAuthSessionCookie=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; HttpOnly; SameSite=None',
      'AWSELBAuthSessionCookie-0=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; HttpOnly; SameSite=None',
      'AWSELBAuthSessionCookie-1=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; HttpOnly; SameSite=None',
    ]);
    expect(redirect).toHaveBeenCalledWith(
      302,
      'https://auth.example.com/logout?client_id=client-id&logout_uri=https%3A%2F%2Fclient.example.com%2Flogout%3Fsource%3Dapp',
    );
  });

  it('expires the ALB cookie when Cognito global sign-out fails', async () => {
    const providerError = new Error('provider failure');
    const setHeader = jest.fn();
    const redirect = jest.fn();
    const response = { setHeader, redirect } as unknown as Response;
    globalSignOut.mockRejectedValue(providerError);

    await expect(
      controller.logout('access-token', 'AWSELBAuthSessionCookie=value', response),
    ).rejects.toBe(providerError);
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', [
      'AWSELBAuthSessionCookie=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; HttpOnly; SameSite=None',
    ]);
    expect(redirect).not.toHaveBeenCalled();
  });
});
