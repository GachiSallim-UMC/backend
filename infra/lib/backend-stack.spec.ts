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
            Scope: 'openid email aws.cognito.signin.user.admin',
            SessionTimeout: '86400',
          }),
        }),
        Match.objectLike({ Type: 'forward' }),
      ]),
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthScopes: Match.arrayWith(['openid', 'email', 'aws.cognito.signin.user.admin']),
      GenerateSecret: true,
      LogoutURLs: [{ Ref: 'LogoutRedirectUri' }],
      SupportedIdentityProviders: ['COGNITO'],
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: Match.objectLike({ AllowAdminCreateUserOnly: true }),
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Priority: 10,
      Conditions: Match.arrayWith([
        Match.objectLike({
          Field: 'path-pattern',
          PathPatternConfig: {
            Values: ['/api/v1/auth/signup', '/api/v1/auth/login'],
          },
        }),
        Match.objectLike({
          Field: 'http-request-method',
          HttpRequestMethodConfig: { Values: ['POST'] },
        }),
      ]),
      Actions: Match.arrayWith([Match.objectLike({ Type: 'forward' })]),
    });
  });

  it('creates one private ARM instance with NAT egress and an 8 GiB root volume', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 1);
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
            Ref: Match.stringLikeRegexp('ApplicationSubnet'),
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

  it('preserves the existing Backend subnets before adding Application subnets', () => {
    const subnets = template.findResources('AWS::EC2::Subnet');
    const backendSubnetIds = Object.keys(subnets).filter((logicalId) =>
      /^VpcBackendSubnet[12]Subnet/.test(logicalId),
    );
    const applicationSubnetIds = Object.keys(subnets).filter((logicalId) =>
      /^VpcApplicationSubnet[12]Subnet/.test(logicalId),
    );

    expect(backendSubnetIds).toHaveLength(2);
    expect(applicationSubnetIds).toHaveLength(2);
    for (const cidrBlock of ['10.0.2.0/24', '10.0.3.0/24']) {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        CidrBlock: cidrBlock,
        Tags: Match.arrayWith([{ Key: 'aws-cdk:subnet-name', Value: 'Backend' }]),
      });
    }
    for (const cidrBlock of ['10.0.4.0/24', '10.0.5.0/24']) {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        CidrBlock: cidrBlock,
        Tags: Match.arrayWith([{ Key: 'aws-cdk:subnet-name', Value: 'Application' }]),
      });
    }
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

  it('allows the application instance to manage Cognito signup users', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              'cognito-idp:AdminCreateUser',
              'cognito-idp:AdminSetUserPassword',
              'cognito-idp:AdminDeleteUser',
            ],
            Effect: 'Allow',
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
