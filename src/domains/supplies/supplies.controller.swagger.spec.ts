import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import {
  ExpenseCategory,
  ExpenseSplitStatus,
  ExpenseStatus,
  SplitType,
  SupplyStatus,
} from '@prisma/client';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { CognitoAccessTokenGuard } from '../auth/common/cognito-access-token.guard';
import { SuppliesController } from './supplies.controller';
import { SuppliesService } from './supplies.service';

type JsonSchema = {
  type?: string;
  $ref?: string;
  allOf?: JsonSchema[];
  nullable?: boolean;
  required?: string[];
  format?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
};

let app: INestApplication;
/** 런타임 Swagger의 컴포넌트 스키마 모음 ($ref 해석용) */
let swaggerComponents: Record<string, JsonSchema>;
/** 런타임 Swagger의 SUP-BUY-01 200 응답 스키마 */
let runtimeOkSchema: JsonSchema;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [SuppliesController],
    providers: [{ provide: SuppliesService, useValue: {} }],
  })
    .overrideGuard(CognitoAccessTokenGuard)
    .useValue({ canActivate: () => true })
    .compile();

  app = moduleRef.createNestApplication({ logger: false });

  const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const paths = document.paths as Record<
    string,
    { post?: { responses: Record<string, { content: Record<string, { schema: JsonSchema }> }> } }
  >;

  const purchasePath = Object.keys(paths).find((path) => path.endsWith('/purchase'));
  expect(purchasePath).toBeDefined();

  runtimeOkSchema =
    paths[purchasePath as string].post!.responses['200'].content['application/json'].schema;
  swaggerComponents = (document.components?.schemas ?? {}) as Record<string, JsonSchema>;
});

afterAll(async () => {
  await app.close();
});

/**
 * 전역 ResponseInterceptor가 반환값을 `{ statusCode, data, error }`로 감싸므로
 * 런타임 Swagger 문서도 envelope를 포함해야 실제 wire 응답과 일치한다. (#223 리뷰)
 * DTO를 `type`으로 그대로 노출하면 클라이언트가 최상위에서 필드를 찾아 파싱에 실패하므로,
 * 계약이 다시 어긋나지 않도록 생성된 문서를 직접 검증한다.
 */
describe('SuppliesController Swagger 문서 (SUP-BUY-01)', () => {
  let schemas: Record<string, JsonSchema>;
  let purchaseOkSchema: JsonSchema;

  beforeAll(() => {
    schemas = swaggerComponents;
    purchaseOkSchema = runtimeOkSchema;
  });

  it('200 응답을 공통 envelope 형태로 문서화한다', () => {
    expect(purchaseOkSchema.type).toBe('object');
    expect(purchaseOkSchema.required).toEqual(['statusCode', 'data', 'error']);
    expect(purchaseOkSchema.properties?.statusCode?.type).toBe('integer');
    expect(purchaseOkSchema.properties?.error?.nullable).toBe(true);
  });

  it('envelope의 data가 PurchaseSupplyResponseDto를 참조한다', () => {
    expect(purchaseOkSchema.properties?.data?.$ref).toBe(
      '#/components/schemas/PurchaseSupplyResponseDto',
    );
    // 최상위에 DTO 필드가 노출되면 클라이언트가 envelope를 벗기지 않고 파싱하게 된다.
    expect(purchaseOkSchema.properties?.supplyId).toBeUndefined();
    expect(purchaseOkSchema.properties?.expense).toBeUndefined();
  });

  it('중첩 DTO가 모두 컴포넌트 스키마로 등록된다', () => {
    for (const name of [
      'PurchaseSupplyResponseDto',
      'PurchaseSupplyLogDto',
      'PurchaseSupplyExpenseDto',
      'PurchaseSupplyExpenseSplitDto',
    ]) {
      expect(schemas[name]).toBeDefined();
    }

    expect(schemas.PurchaseSupplyExpenseDto.properties?.splits?.type).toBe('array');
    expect(schemas.PurchaseSupplyExpenseDto.properties?.splits?.items?.$ref).toBe(
      '#/components/schemas/PurchaseSupplyExpenseSplitDto',
    );
  });

  it('nullable union 필드에 실제 타입이 지정된다', () => {
    const linkedExpenseId = schemas.PurchaseSupplyResponseDto.properties?.linkedExpenseId;
    expect(linkedExpenseId?.type).toBe('integer');
    expect(linkedExpenseId?.nullable).toBe(true);

    const note = schemas.PurchaseSupplyLogDto.properties?.note;
    expect(note?.type).toBe('string');
    expect(note?.nullable).toBe(true);

    // reflect-metadata가 nullable union을 Object로 추론하면 type이 object로 새어 나온다.
    expect(linkedExpenseId?.type).not.toBe('object');
    expect(note?.type).not.toBe('object');
  });

  it('splitId를 반환해 정산 완료 API로 바로 이어갈 수 있다', () => {
    const splits = schemas.PurchaseSupplyExpenseSplitDto.properties;

    expect(splits?.splitId?.type).toBe('integer');
    expect(schemas.PurchaseSupplyExpenseSplitDto.required).toEqual([
      'splitId',
      'userId',
      'amount',
      'status',
    ]);
  });

  it('ID·금액 필드를 integer로 문서화한다', () => {
    // reflect-metadata의 Number 추론은 `type: number`가 되어 정수 보장이 사라진다.
    // 루트 openapi.json이 integer로 기술하고 있으므로 런타임 문서도 맞춘다.
    expect(schemas.PurchaseSupplyResponseDto.properties?.supplyId?.type).toBe('integer');
    expect(schemas.PurchaseSupplyResponseDto.properties?.linkedExpenseId?.type).toBe('integer');

    for (const field of ['expenseId', 'payerId', 'totalAmount']) {
      expect(schemas.PurchaseSupplyExpenseDto.properties?.[field]?.type).toBe('integer');
    }

    for (const field of ['splitId', 'userId', 'amount']) {
      expect(schemas.PurchaseSupplyExpenseSplitDto.properties?.[field]?.type).toBe('integer');
    }
  });
});

/**
 * 루트 `openapi.json`은 Pages로 배포되는 손으로 관리하는 문서라 런타임 Swagger와 쉽게 어긋난다.
 * SUP-BUY-01 200 응답에 한해 두 문서가 같은 계약을 기술하는지 확인한다. (#223 리뷰)
 */
describe('openapi.json과 런타임 Swagger 정합성 (SUP-BUY-01)', () => {
  type MediaType = { schema: JsonSchema; example?: PurchaseExample };
  type Operation = {
    requestBody: { content: Record<string, MediaType> };
    responses: Record<string, { content: Record<string, MediaType> }>;
  };
  type PurchaseExample = {
    data: {
      expense: { splits: Array<Record<string, unknown>> } & Record<string, unknown>;
    } & Record<string, unknown>;
  };

  const publicDoc = JSON.parse(readFileSync(join(__dirname, '../../../openapi.json'), 'utf-8')) as {
    paths: Record<string, { post: Operation }>;
  };

  const operation = publicDoc.paths['/api/v1/supplies/{supplyId}/purchase'].post;
  const purchase = operation.responses['200'].content['application/json'];
  const data = purchase.schema.properties?.data as JsonSchema;
  const expense = data.properties?.expense as JsonSchema;
  const split = expense.properties?.splits?.items as JsonSchema;

  it('공통 envelope 구조를 동일하게 기술한다', () => {
    expect(Object.keys(purchase.schema.properties ?? {})).toEqual(['statusCode', 'data', 'error']);
  });

  it('런타임 Swagger와 구조가 완전히 일치한다', () => {
    // 필드를 하나씩 단언하면 새로 추가된 항목을 놓치므로, 두 문서를 재귀적으로 훑어 차이를 모은다.
    // 런타임 쪽은 $ref / allOf로 쪼개져 있으므로 평탄화한 뒤 비교한다.
    const runtimeSchemas = swaggerComponents;

    const flatten = (schema: JsonSchema): JsonSchema => {
      if (schema.$ref) {
        return flatten(runtimeSchemas[schema.$ref.split('/').pop() as string]);
      }
      if (schema.allOf?.length === 1) {
        const { allOf, ...rest } = schema;
        return { ...flatten(allOf[0]), ...rest };
      }
      return schema;
    };

    const COMPARED = ['type', 'enum', 'nullable', 'format', 'required'] as const;
    const differences: string[] = [];

    const walk = (runtimeNode: JsonSchema, publicNode: JsonSchema, path: string): void => {
      const runtime = flatten(runtimeNode);

      for (const key of COMPARED) {
        const a = JSON.stringify(runtime[key]);
        const b = JSON.stringify(publicNode[key]);
        if (a !== b) {
          differences.push(`${path}.${key}: 런타임=${a ?? '없음'} / openapi.json=${b ?? '없음'}`);
        }
      }

      const runtimeProps = runtime.properties ?? {};
      const publicProps = publicNode.properties ?? {};
      for (const key of new Set([...Object.keys(runtimeProps), ...Object.keys(publicProps)])) {
        if (!(key in runtimeProps) || !(key in publicProps)) {
          differences.push(`${path}.${key}: 한쪽 문서에만 존재`);
          continue;
        }
        walk(runtimeProps[key], publicProps[key], `${path}.${key}`);
      }

      if (runtime.items && publicNode.items) {
        walk(runtime.items, publicNode.items, `${path}[]`);
      }
    };

    walk(runtimeOkSchema, purchase.schema, '200');

    expect(differences).toEqual([]);
  });

  it('필드 구성이 런타임 DTO와 일치한다', () => {
    expect(data.required).toEqual([
      'supplyId',
      'status',
      'linkedExpenseId',
      'log',
      'expense',
      'updatedAt',
    ]);
    expect(expense.required).toEqual([
      'expenseId',
      'category',
      'title',
      'payerId',
      'totalAmount',
      'splitType',
      'status',
      'splits',
    ]);
    expect(split.required).toEqual(['splitId', 'userId', 'amount', 'status']);
  });

  it('enum 값이 Prisma 정의와 일치한다', () => {
    expect(data.properties?.status?.enum).toEqual(Object.values(SupplyStatus));
    expect(expense.properties?.category?.enum).toEqual(Object.values(ExpenseCategory));
    expect(expense.properties?.splitType?.enum).toEqual(Object.values(SplitType));
    expect(expense.properties?.status?.enum).toEqual(Object.values(ExpenseStatus));
    expect(split.properties?.status?.enum).toEqual(Object.values(ExpenseSplitStatus));

    // 요청 본문의 category도 실제 허용값(@IsEnum(ExpenseCategory))과 같아야 한다.
    const requestSchema = operation.requestBody.content['application/json'].schema;
    expect(requestSchema.properties?.category?.enum).toEqual(Object.values(ExpenseCategory));
  });

  it('nullable 필드를 enum이 아닌 nullable 플래그로 표현한다', () => {
    const prevStatus = data.properties?.log?.properties?.prevStatus;

    expect(prevStatus?.enum).toEqual(Object.values(SupplyStatus));
    expect(prevStatus?.enum).not.toContain(null);
    expect(data.properties?.linkedExpenseId?.nullable).toBe(true);
    expect(data.properties?.log?.properties?.note?.nullable).toBe(true);
  });

  it('200 예시가 실제 응답 필드 구성을 따른다', () => {
    const example = purchase.example as PurchaseExample;

    expect(Object.keys(example.data)).toEqual(data.required);
    expect(Object.keys(example.data.expense)).toEqual(expense.required);
    for (const item of example.data.expense.splits) {
      expect(Object.keys(item)).toEqual(split.required);
    }
  });
});
