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
  };

  it('accepts the Cognito runtime configuration', () => {
    const result = ENV_VALIDATION_SCHEMA.validate(validEnvironment);

    expect(result.error).toBeUndefined();
  });

  it.each(['AWS_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'])('requires %s', (key) => {
    const environment = { ...validEnvironment };
    delete environment[key as keyof typeof environment];

    const result = ENV_VALIDATION_SCHEMA.validate(environment);

    expect(result.error).toBeDefined();
  });
});
