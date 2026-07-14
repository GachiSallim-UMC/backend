import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { BackendStack } from './backend-stack';

describe('BackendStack', () => {
  const app = new App();
  const stack = new BackendStack(app, 'TestBackendStack');
  const template = Template.fromStack(stack);

  it('creates the public load balancer with Cognito authentication', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Scheme: 'internet-facing',
      Type: 'application',
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 443,
      Protocol: 'HTTPS',
      DefaultActions: Match.arrayWith([
        Match.objectLike({
          Type: 'authenticate-cognito',
          AuthenticateCognitoConfig: Match.objectLike({
            Scope: 'openid email',
            SessionTimeout: '86400',
          }),
        }),
        Match.objectLike({ Type: 'forward' }),
      ]),
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      GenerateSecret: true,
      SupportedIdentityProviders: ['COGNITO'],
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
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);
  });

  it('creates private endpoints and the application log group', () => {
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 2);
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      PrivateDnsEnabled: true,
      VpcEndpointType: 'Interface',
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/gachisallim/backend/application',
      RetentionInDays: 30,
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
