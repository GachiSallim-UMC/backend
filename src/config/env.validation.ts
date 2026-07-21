import joi from 'joi';

export const ENV_VALIDATION_SCHEMA = joi.object({
  NODE_ENV: joi.string().valid('development', 'test', 'production').default('development'),
  PORT: joi.number().port().default(3000),
  APP_NAME: joi.string().min(1).required(),
  APP_VERSION: joi.string().min(1).required(),
  CORS_ORIGIN: joi.string().min(1).required(),
  DATABASE_URL: joi
    .string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  AWS_REGION: joi.string().min(1).required(),
  COGNITO_USER_POOL_ID: joi.string().min(1).required(),
  COGNITO_CLIENT_ID: joi.string().min(1).required(),
  NOTIFICATION_PUSH_QUEUE_URL: joi
    .string()
    .uri({ scheme: ['https'] })
    .required(),
  NOTIFICATION_PUSH_RESULT_QUEUE_URL: joi
    .string()
    .uri({ scheme: ['https'] })
    .required(),
  NOTIFICATION_VAPID_PUBLIC_KEY: joi.string().min(1).required(),
  NOTIFICATION_OUTBOX_POLL_INTERVAL_MS: joi.number().integer().min(1000).default(5000),
  NOTIFICATION_OUTBOX_BATCH_SIZE: joi.number().integer().min(1).max(100).default(10),
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS: joi.number().integer().min(1).max(100).default(10),
  NOTIFICATION_RESULT_POLL_INTERVAL_MS: joi.number().integer().min(1000).default(5000),
  NOTIFICATION_COMMAND_QUEUE_URL: joi
    .string()
    .uri({ scheme: ['https'] })
    .required(),
  NOTIFICATION_COMMAND_QUEUE_ARN: joi
    .string()
    .pattern(/^arn:aws[a-z-]*:sqs:/)
    .required(),
  NOTIFICATION_COMMAND_DLQ_ARN: joi
    .string()
    .pattern(/^arn:aws[a-z-]*:sqs:/)
    .required(),
  CHORE_DUE_SCHEDULE_GROUP: joi.string().min(1).max(64).required(),
  CHORE_DUE_SCHEDULE_ROLE_ARN: joi
    .string()
    .pattern(/^arn:aws[a-z-]*:iam:/)
    .required(),
  CHORE_DUE_SCHEDULE_PREFIX: joi
    .string()
    .pattern(/^[0-9A-Za-z_-]+$/)
    .max(40)
    .required(),
  CHORE_DUE_NOTIFICATION_TIME: joi
    .string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('09:00'),
  CHORE_DUE_TIME_ZONE: joi.string().min(1).default('Asia/Seoul'),
  NOTIFICATION_COMMAND_POLL_INTERVAL_MS: joi.number().integer().min(1000).default(5000),
});
