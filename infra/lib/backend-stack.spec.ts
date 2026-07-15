import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { BackendStack } from './backend-stack';

describe('BackendStack', () => {
  const app = new App();
  const stack = new BackendStack(app, 'TestBackendStack');
  const template = Template.fromStack(stack);

  it('validates Cognito access tokens at the public load balancer', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Scheme: 'internet-facing',
      Type: 'application',
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 443,
      Protocol: 'HTTPS',
      DefaultActions: Match.arrayWith([
        Match.objectLike({
          Type: 'jwt-validation',
          JwtValidationConfig: Match.objectLike({
            AdditionalClaims: Match.arrayWith([
              {
                Format: 'single-string',
                Name: 'token_use',
                Values: ['access'],
              },
              Match.objectLike({
                Format: 'single-string',
                Name: 'client_id',
                Values: Match.anyValue(),
              }),
            ]),
            Issuer: Match.anyValue(),
            JwksEndpoint: Match.anyValue(),
          }),
        }),
        Match.objectLike({ Type: 'forward' }),
      ]),
      SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AccessTokenValidity: 60,
      AllowedOAuthFlowsUserPoolClient: false,
      EnableTokenRevocation: true,
      ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      GenerateSecret: false,
      IdTokenValidity: 60,
      RefreshTokenValidity: 43200,
      SupportedIdentityProviders: ['COGNITO'],
      TokenValidityUnits: {
        AccessToken: 'minutes',
        IdToken: 'minutes',
        RefreshToken: 'minutes',
      },
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AutoVerifiedAttributes: ['email'],
      UsernameAttributes: ['email'],
      VerificationMessageTemplate: Match.objectLike({
        DefaultEmailOption: 'CONFIRM_WITH_CODE',
      }),
    });
    template.hasOutput('CognitoIssuerUrl', {
      Value: Match.anyValue(),
    });
  });

  it('forwards public HTTP and Socket.IO routes without ALB JWT validation', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Priority: 10,
      Conditions: Match.arrayWith([
        {
          Field: 'path-pattern',
          PathPatternConfig: {
            Values: [
              '/api/v1/auth/signup',
              '/api/v1/auth/signup/confirm',
              '/api/v1/auth/login',
              '/api/v1/auth/token/refresh',
            ],
          },
        },
        {
          Field: 'http-request-method',
          HttpRequestMethodConfig: { Values: ['POST'] },
        },
      ]),
      Actions: Match.arrayWith([Match.objectLike({ Type: 'forward' })]),
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Priority: 20,
      Conditions: Match.arrayWith([
        Match.objectLike({
          Field: 'path-pattern',
          PathPatternConfig: { Values: ['/api/v1/health'] },
        }),
      ]),
      Actions: Match.arrayWith([Match.objectLike({ Type: 'forward' })]),
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Priority: 30,
      Conditions: Match.arrayWith([
        Match.objectLike({
          Field: 'http-request-method',
          HttpRequestMethodConfig: { Values: ['OPTIONS'] },
        }),
      ]),
      Actions: Match.arrayWith([Match.objectLike({ Type: 'forward' })]),
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Priority: 40,
      Conditions: Match.arrayWith([
        Match.objectLike({
          Field: 'path-pattern',
          PathPatternConfig: { Values: ['/socket.io/*'] },
        }),
      ]),
      Actions: Match.arrayWith([Match.objectLike({ Type: 'forward' })]),
    });
  });

  it('creates one private ARM instance with an 8 GiB root volume', () => {
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't4g.small',
      ImageId: {
        Ref: Match.stringLikeRegexp('arm64'),
      },
      BlockDeviceMappings: Match.arrayWith([
        {
          DeviceName: '/dev/xvda',
          Ebs: {
            DeleteOnTermination: true,
            Encrypted: true,
            VolumeSize: 8,
            VolumeType: 'gp3',
          },
        },
      ]),
      NetworkInterfaces: Match.arrayWith([
        Match.objectLike({
          AssociatePublicIpAddress: false,
          SubnetId: {
            Ref: Match.stringLikeRegexp('BackendSubnet'),
          },
        }),
      ]),
    });
    template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
      LaunchTemplateData: {
        MetadataOptions: { HttpTokens: 'required' },
      },
    });
  });

  it('creates a private Single-AZ PostgreSQL 16 database', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      AllocatedStorage: '20',
      DBInstanceClass: 'db.t4g.micro',
      DBName: 'gachisallim',
      Engine: 'postgres',
      EngineVersion: '16',
      EngineLifecycleSupport: 'open-source-rds-extended-support-disabled',
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      StorageType: 'gp3',
    });
    template.hasResource('AWS::SecretsManager::Secret', {});
  });

  it('creates private endpoints and the application log group', () => {
    const endpoints = JSON.stringify(template.findResources('AWS::EC2::VPCEndpoint'));

    expect(endpoints).toContain('.secretsmanager');
    expect(endpoints).toContain('.logs');
    expect(endpoints).toContain('.cognito-idp');
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      PrivateDnsEnabled: true,
      VpcEndpointType: 'Interface',
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/gachisallim/backend/application',
      RetentionInDays: 30,
    });
  });

  it('allows only the scoped Cognito admin actions required by AUTH flows', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['cognito-idp:AdminDeleteUser', 'cognito-idp:AdminGetUser'],
            Effect: 'Allow',
            Resource: {
              'Fn::GetAtt': [Match.stringLikeRegexp('UserPool'), 'Arn'],
            },
          }),
        ]),
      },
    });
  });

  it('checks backend health through the existing endpoint', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/api/v1/health',
      Matcher: { HttpCode: '200' },
      Port: 3000,
      Protocol: 'HTTP',
    });
  });
});
