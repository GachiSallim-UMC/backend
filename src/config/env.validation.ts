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
});
