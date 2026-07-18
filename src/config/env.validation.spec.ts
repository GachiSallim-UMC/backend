import { ENV_VALIDATION_SCHEMA } from './env.validation';

describe('ENV_VALIDATION_SCHEMA', () => {
  const validEnvironment = {
    APP_NAME: 'GachiSallim Backend',
    APP_VERSION: '0.1.0',
    CORS_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/gachisallim',
    AWS_REGION: 'ap-northeast-2',
    COGNITO_USER_POOL_ID: 'ap-northeast-2_example',
    COGNITO_CLIENT_ID: 'exampleclientid',
    NOTIFICATION_PUSH_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/123456789012/push',
    NOTIFICATION_PUSH_RESULT_QUEUE_URL:
      'https://sqs.ap-northeast-2.amazonaws.com/123456789012/push-result',
    NOTIFICATION_VAPID_PUBLIC_KEY: 'public-key',
  };

  it('accepts the Cognito runtime configuration', () => {
    const result = ENV_VALIDATION_SCHEMA.validate(validEnvironment);

    expect(result.error).toBeUndefined();
  });

  it.each([
    'AWS_REGION',
    'COGNITO_USER_POOL_ID',
    'COGNITO_CLIENT_ID',
    'NOTIFICATION_PUSH_QUEUE_URL',
    'NOTIFICATION_PUSH_RESULT_QUEUE_URL',
    'NOTIFICATION_VAPID_PUBLIC_KEY',
  ])('requires %s', (key) => {
    const environment = { ...validEnvironment };
    delete environment[key as keyof typeof environment];

    const result = ENV_VALIDATION_SCHEMA.validate(environment);

    expect(result.error).toBeDefined();
  });

  it('applies bounded outbox publisher defaults', () => {
    const result = ENV_VALIDATION_SCHEMA.validate(validEnvironment);

    expect(result.value).toMatchObject({
      NOTIFICATION_OUTBOX_POLL_INTERVAL_MS: 5000,
      NOTIFICATION_OUTBOX_BATCH_SIZE: 10,
      NOTIFICATION_RESULT_POLL_INTERVAL_MS: 5000,
    });
  });
});
