import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';

import { BackendStack } from './backend-stack';

describe('BackendStack', () => {
  const app = new App();
  const artifactStack = new Stack(app, 'ArtifactStack');
  const artifactBucket = new s3.Bucket(artifactStack, 'ArtifactBucket');
  const stack = new BackendStack(app, 'TestBackendStack', { artifactBucket });
  const template = Template.fromStack(stack);

  it('routes the two domains to separate ports and Cognito pools', () => {
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 2);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/api/v1/health',
      Matcher: { HttpCode: '200' },
      Port: 3000,
      Protocol: 'HTTP',
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/api/v1/health',
      Matcher: { HttpCode: '200' },
      Port: 3001,
      Protocol: 'HTTP',
    });
    template.resourceCountIs('AWS::Cognito::UserPool', 2);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);

    const listenerRules = JSON.stringify(
      template.findResources('AWS::ElasticLoadBalancingV2::ListenerRule'),
    );
    expect(listenerRules).toContain('api.gachisallim.com');
    expect(listenerRules).toContain('dev-api.gachisallim.com');
    expect(listenerRules).toContain('jwt-validation');
    expect(listenerRules).toContain('token_use');
    expect(listenerRules).toContain('client_id');
  });

  it('adds code-grant social login without replacing the existing Cognito clients', () => {
    expect(Object.keys(template.findResources('AWS::Cognito::UserPool'))).toEqual(
      expect.arrayContaining(['ProductionUserPoolD7CBD407', 'DevelopmentUserPool1D648632']),
    );
    expect(Object.keys(template.findResources('AWS::Cognito::UserPoolClient'))).toEqual(
      expect.arrayContaining([
        'ProductionUserPoolProductionUserPoolClient10192707',
        'DevelopmentUserPoolDevelopmentUserPoolClient3C175F59',
      ]),
    );
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 2);
    template.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 4);
    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'gachisallim-prod-auth',
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'gachisallim-dev-auth',
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthScopes: Match.arrayWith(['openid', 'email', 'profile']),
      CallbackURLs: ['https://gachisallim.com/auth/callback'],
      LogoutURLs: ['https://gachisallim.com/login'],
      SupportedIdentityProviders: Match.arrayWith(['COGNITO', 'Google', 'Kakao']),
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      CallbackURLs: [
        'https://dev.gachisallim.com/auth/callback',
        'http://localhost:5173/auth/callback',
      ],
      LogoutURLs: ['https://dev.gachisallim.com/login', 'http://localhost:5173/login'],
    });
  });

  it('maps verified social identity attributes and keeps provider credentials secret', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
      ProviderName: 'Google',
      ProviderType: 'Google',
      AttributeMapping: Match.objectLike({
        email: 'email',
        email_verified: 'email_verified',
      }),
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
      ProviderName: 'Kakao',
      ProviderType: 'OIDC',
      AttributeMapping: Match.objectLike({
        email: 'email',
        email_verified: 'email_verified',
      }),
      ProviderDetails: Match.objectLike({
        oidc_issuer: 'https://kauth.kakao.com',
        authorize_scopes: 'openid profile account_email',
      }),
    });

    const providers = JSON.stringify(
      template.findResources('AWS::Cognito::UserPoolIdentityProvider'),
    );
    expect(providers).toContain('secret:gachisallim/main/social-auth:SecretString:');
    expect(providers).toContain('secret:gachisallim/develop/social-auth:SecretString:');
  });

  it('links only supported external identities through the pre-signup trigger', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: Match.objectLike({ PreSignUp: Match.anyValue() }),
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['cognito-idp:AdminLinkProviderForUser', 'cognito-idp:ListUsers'],
            Effect: 'Allow',
            Resource: Match.anyValue(),
          }),
        ]),
        Version: '2012-10-17',
      },
    });
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('cognito-idp:AdminLinkProviderForUser');
    expect(policies).toContain('ProductionUserPoolD7CBD407');
    expect(policies).toContain('DevelopmentUserPool1D648632');
    expect(policies).not.toContain(':userpool/*');
  });

  it('exposes Swagger documents only on the development domain', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Actions: Match.arrayWith([Match.objectLike({ Type: 'forward' })]),
      Conditions: Match.arrayWith([
        {
          Field: 'host-header',
          HostHeaderConfig: { Values: ['dev-api.gachisallim.com'] },
        },
        {
          Field: 'path-pattern',
          PathPatternConfig: {
            Values: ['/api-docs', '/api-docs/*', '/api-docs-json'],
          },
        },
        {
          Field: 'http-request-method',
          HttpRequestMethodConfig: { Values: ['GET'] },
        },
      ]),
    });

    const listenerRules = template.findResources('AWS::ElasticLoadBalancingV2::ListenerRule');
    const publicSwaggerRules = Object.values(listenerRules).filter((rule) =>
      JSON.stringify(rule).includes('/api-docs-json'),
    );

    expect(publicSwaggerRules).toHaveLength(1);
  });

  it('creates DNS-validated TLS and aliases for both backend domains', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'api.gachisallim.com',
      SubjectAlternativeNames: ['dev-api.gachisallim.com'],
      ValidationMethod: 'DNS',
    });
    template.resourceCountIs('AWS::Route53::RecordSet', 2);
    const records = JSON.stringify(template.findResources('AWS::Route53::RecordSet'));
    expect(records).toContain('api.gachisallim.com');
    expect(records).toContain('dev-api.gachisallim.com');
  });

  it('creates one private ARM instance sized for two release trees', () => {
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't4g.small',
      ImageId: Match.stringLikeRegexp('al2023-ami-kernel-default-arm64'),
      BlockDeviceMappings: Match.arrayWith([
        {
          DeviceName: '/dev/xvda',
          Ebs: {
            DeleteOnTermination: true,
            Encrypted: true,
            VolumeSize: 16,
            VolumeType: 'gp3',
          },
        },
      ]),
      NetworkInterfaces: Match.arrayWith([
        Match.objectLike({
          AssociatePublicIpAddress: false,
          SubnetId: { Ref: Match.stringLikeRegexp('BackendSubnet') },
        }),
      ]),
      Tags: Match.arrayWith([{ Key: 'GachiSallimDeploymentTarget', Value: 'true' }]),
    });
    template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
      LaunchTemplateData: { MetadataOptions: { HttpTokens: 'required' } },
    });
  });

  it('keeps one RDS instance and bootstraps the develop database during deployment', () => {
    template.resourceCountIs('AWS::RDS::DBInstance', 1);
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.t4g.micro',
      DBName: 'gachisallim',
      Engine: 'postgres',
      EngineVersion: '16',
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
    });

    const userData = JSON.stringify(template.findResources('AWS::EC2::Instance'));
    expect(userData).toContain("DATABASE_NAME='gachisallim'");
    expect(userData).toContain("DATABASE_NAME='gachisallim_develop'");
    expect(userData).toContain("CORS_ORIGIN='https://gachisallim.com'");
    expect(userData).toContain("CORS_ORIGIN='*'");
    expect(userData).toContain('gachisallim@.service');
  });

  it('provides private deployment and runtime service endpoints without NAT', () => {
    const endpoints = JSON.stringify(template.findResources('AWS::EC2::VPCEndpoint'));

    expect(endpoints).toContain('.secretsmanager');
    expect(endpoints).toContain('.logs');
    expect(endpoints).toContain('.cognito-idp');
    expect(endpoints).toContain('.ssm');
    expect(endpoints).toContain('.ssmmessages');
    expect(endpoints).toContain('.s3');
  });

  it('allows the instance to receive SSM commands and access only required Cognito pools', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.arrayWith([
        {
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([Match.stringLikeRegexp('AmazonSSMManagedInstanceCore')]),
          ]),
        },
      ]),
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['cognito-idp:AdminDeleteUser', 'cognito-idp:AdminGetUser'],
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });
});
