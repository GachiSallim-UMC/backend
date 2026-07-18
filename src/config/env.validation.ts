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
  NOTIFICATION_OUTBOX_POLL_INTERVAL_MS: joi.number().integer().min(1000).default(5000),
  NOTIFICATION_OUTBOX_BATCH_SIZE: joi.number().integer().min(1).max(100).default(10),
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS: joi.number().integer().min(1).max(100).default(10),
});
