import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/exceptions/validation-exception.factory';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { parseCorsOrigin } from './config/cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigin = configService.getOrThrow<string>('CORS_ORIGIN');

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: parseCorsOrigin(corsOrigin),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle(configService.getOrThrow<string>('APP_NAME'))
    .setDescription('GachiSallim backend API')
    .setVersion(configService.getOrThrow<string>('APP_VERSION'))
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
}

void bootstrap();
