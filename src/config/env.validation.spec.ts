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
    PROFILE_IMAGE_BUCKET: 'gachisallim-profile-images',
    PROFILE_IMAGE_OBJECT_PREFIX: 'develop/profiles',
    PROFILE_IMAGE_PUBLIC_BASE_URL: 'https://example.cloudfront.net',
    NOTIFICATION_PUSH_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/123456789012/push',
    NOTIFICATION_PUSH_RESULT_QUEUE_URL:
      'https://sqs.ap-northeast-2.amazonaws.com/123456789012/push-result',
    NOTIFICATION_VAPID_PUBLIC_KEY: 'public-key',
    NOTIFICATION_COMMAND_QUEUE_URL: 'https://sqs.ap-northeast-2.amazonaws.com/123456789012/command',
    NOTIFICATION_COMMAND_QUEUE_ARN: 'arn:aws:sqs:ap-northeast-2:123456789012:notification-command',
    NOTIFICATION_COMMAND_DLQ_ARN:
      'arn:aws:sqs:ap-northeast-2:123456789012:notification-command-dlq',
    CHORE_DUE_SCHEDULE_GROUP: 'gachisallim-develop-chore-due',
    CHORE_DUE_SCHEDULE_ROLE_ARN:
      'arn:aws:iam::123456789012:role/gachisallim-develop-chore-due-scheduler',
    CHORE_DUE_SCHEDULE_PREFIX: 'develop',
    CHAT_CONNECTIONS_TABLE_NAME: 'gachisallim-develop-chat-connections',
    CHAT_WEBSOCKET_CALLBACK_URL: 'https://example.execute-api.ap-northeast-2.amazonaws.com/develop',
  };

  it('accepts the Cognito runtime configuration', () => {
    const result = ENV_VALIDATION_SCHEMA.validate(validEnvironment);

    expect(result.error).toBeUndefined();
  });

  it.each([
    'AWS_REGION',
    'COGNITO_USER_POOL_ID',
    'COGNITO_CLIENT_ID',
    'PROFILE_IMAGE_BUCKET',
    'PROFILE_IMAGE_OBJECT_PREFIX',
    'PROFILE_IMAGE_PUBLIC_BASE_URL',
    'NOTIFICATION_PUSH_QUEUE_URL',
    'NOTIFICATION_PUSH_RESULT_QUEUE_URL',
    'NOTIFICATION_VAPID_PUBLIC_KEY',
    'NOTIFICATION_COMMAND_QUEUE_URL',
    'NOTIFICATION_COMMAND_QUEUE_ARN',
    'NOTIFICATION_COMMAND_DLQ_ARN',
    'CHORE_DUE_SCHEDULE_GROUP',
    'CHORE_DUE_SCHEDULE_ROLE_ARN',
    'CHORE_DUE_SCHEDULE_PREFIX',
    'CHAT_CONNECTIONS_TABLE_NAME',
    'CHAT_WEBSOCKET_CALLBACK_URL',
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
      NOTIFICATION_OUTBOX_MAX_ATTEMPTS: 10,
      NOTIFICATION_RESULT_POLL_INTERVAL_MS: 5000,
      CHORE_DUE_NOTIFICATION_TIME: '09:00',
      CHORE_DUE_TIME_ZONE: 'Asia/Seoul',
      NOTIFICATION_COMMAND_POLL_INTERVAL_MS: 5000,
    });
  });
});
