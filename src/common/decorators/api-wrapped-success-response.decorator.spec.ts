import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ApiWrappedSuccessResponse } from './api-wrapped-success-response.decorator';

class WrappedDataDto {
  @ApiProperty({ example: true })
  value!: boolean;
}

@Controller('wrapped')
class WrappedController {
  @Get()
  @ApiWrappedSuccessResponse({ status: 200, description: 'wrapped response', type: WrappedDataDto })
  getWrapped(): WrappedDataDto {
    return { value: true };
  }
}

describe('ApiWrappedSuccessResponse', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('documents data inside the common success response envelope', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WrappedController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());

    expect(document.paths['/wrapped']?.get?.responses['200']).toMatchObject({
      description: 'wrapped response',
      content: {
        'application/json': {
          schema: {
            allOf: [
              { $ref: '#/components/schemas/ApiSuccessResponseDto' },
              {
                required: ['data'],
                properties: { data: { $ref: '#/components/schemas/WrappedDataDto' } },
              },
            ],
          },
        },
      },
    });
  });
});
