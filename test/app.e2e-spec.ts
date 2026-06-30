import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.APP_NAME = 'GachiSallim Backend';
    process.env.APP_VERSION = '0.1.0';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/gachisallim?schema=public';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    const httpServer = app.getHttpServer() as Server;

    return request(httpServer).get('/').expect(200).expect({
      name: 'GachiSallim Backend',
      version: '0.1.0',
    });
  });
});
