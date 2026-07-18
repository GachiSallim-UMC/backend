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
    expect(endpoints).toContain('.sqs');
  });

  it('creates encrypted notification push queues and dead-letter queues per environment', () => {
    template.resourceCountIs('AWS::SQS::Queue', 8);
    template.resourceCountIs('AWS::KMS::Key', 1);
    template.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'gachisallim-main-notification-push',
      ReceiveMessageWaitTimeSeconds: 20,
      VisibilityTimeout: 180,
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
    });
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'gachisallim-develop-notification-push',
      ReceiveMessageWaitTimeSeconds: 20,
      VisibilityTimeout: 180,
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
    });

    const userData = JSON.stringify(template.findResources('AWS::EC2::Instance'));
    expect(userData).toContain('NOTIFICATION_PUSH_QUEUE_URL');
    expect(userData).toContain('NOTIFICATION_PUSH_RESULT_QUEUE_URL');
    expect(userData).toContain('NOTIFICATION_VAPID_SECRET_ID');
  });

  it('runs isolated web push workers with partial batch retry and VAPID secret access', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gachisallim-main-notification-web-push',
      Architectures: ['arm64'],
      MemorySize: 256,
      ReservedConcurrentExecutions: 20,
      Runtime: 'nodejs22.x',
      Timeout: 30,
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 10,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
      ScalingConfig: { MaximumConcurrency: 10 },
    });

    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain('sqs:ReceiveMessage');
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
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('sqs:SendMessage');
  });
});
