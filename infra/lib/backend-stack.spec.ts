import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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
      AllowedOAuthScopes: Match.arrayWith([
        'openid',
        'email',
        'profile',
        'aws.cognito.signin.user.admin',
      ]),
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
        authorize_scopes: 'openid account_email',
      }),
    });

    const providers = JSON.stringify(
      template.findResources('AWS::Cognito::UserPoolIdentityProvider'),
    );
    expect(providers).toContain('secret:gachisallim/main/social-auth:SecretString:');
    expect(providers).toContain('secret:gachisallim/develop/social-auth:SecretString:');
  });

  it('links only supported external identities through the pre-signup trigger', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: Match.objectLike({
        CustomMessage: Match.anyValue(),
        PreSignUp: Match.anyValue(),
      }),
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

  it('uses the existing SES domain for environment-specific password reset links', () => {
    template.resourceCountIs('AWS::SES::EmailIdentity', 0);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      EmailConfiguration: Match.objectLike({
        EmailSendingAccount: 'DEVELOPER',
        From: 'GachiSallim <noreply@gachisallim.com>',
        SourceArn: Match.anyValue(),
      }),
    });
    expect(JSON.stringify(template.findResources('AWS::Cognito::UserPool'))).toContain(
      'identity/gachisallim.com',
    );
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          PASSWORD_RESET_URL: 'https://gachisallim.com/reset-password',
        },
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          PASSWORD_RESET_URL: 'https://dev.gachisallim.com/reset-password',
        },
      },
    });
  });

  it('exposes password reset endpoints without JWT authentication', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Actions: Match.arrayWith([Match.objectLike({ Type: 'forward' })]),
      Conditions: Match.arrayWith([
        Match.objectLike({
          Field: 'path-pattern',
          PathPatternConfig: {
            Values: Match.arrayWith([
              '/api/v1/auth/password/forgot',
              '/api/v1/auth/password/reset',
            ]),
          },
        }),
      ]),
    });

    const listenerRules = template.findResources('AWS::ElasticLoadBalancingV2::ListenerRule');
    const passwordResetRules = Object.values(listenerRules).filter((rule) =>
      JSON.stringify(rule).includes('/api/v1/auth/password/forgot'),
    );

    expect(passwordResetRules).toHaveLength(2);
    for (const rule of passwordResetRules) {
      expect(JSON.stringify(rule)).not.toContain('/api/v1/auth/signup');
    }
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

  it('creates one private ARM application instance sized for two release trees', () => {
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

  it('routes backend HTTPS through one ARM NAT instance', () => {
    template.resourceCountIs('AWS::EC2::Instance', 2);
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't4g.nano',
      SourceDestCheck: false,
      NetworkInterfaces: Match.arrayWith([
        Match.objectLike({
          AssociatePublicIpAddress: true,
          SubnetId: { Ref: Match.stringLikeRegexp('IngressSubnet') },
        }),
      ]),
    });
    template.hasResourceProperties('AWS::EC2::Route', {
      DestinationCidrBlock: '0.0.0.0/0',
      InstanceId: { Ref: Match.stringLikeRegexp('NatInstance') },
      RouteTableId: { Ref: Match.stringLikeRegexp('BackendSubnet') },
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security Group for NAT instances',
      SecurityGroupIngress: [
        {
          CidrIp: { 'Fn::GetAtt': ['Vpc8378EB38', 'CidrBlock'] },
          Description: 'Allows HTTPS forwarding from private VPC resources.',
          FromPort: 443,
          IpProtocol: 'tcp',
          ToPort: 443,
        },
      ],
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

  it('keeps private AWS service endpoints while Cognito uses public egress', () => {
    const endpoints = JSON.stringify(template.findResources('AWS::EC2::VPCEndpoint'));

    expect(endpoints).toContain('.secretsmanager');
    expect(endpoints).toContain('.logs');
    expect(endpoints).not.toContain('.cognito-idp');
    expect(endpoints).toContain('.ssm');
    expect(endpoints).toContain('.ssmmessages');
    expect(endpoints).toContain('.s3');
    expect(endpoints).toContain('.sqs');
    expect(endpoints).toContain('.scheduler');
  });

  it('creates a private profile image bucket served through CloudFront and a private, CDN-less receipt image bucket', () => {
    template.resourceCountIs('AWS::S3::Bucket', 2);
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
      CorsConfiguration: {
        CorsRules: [
          Match.objectLike({
            AllowedMethods: ['POST'],
            AllowedOrigins: [
              'https://gachisallim.com',
              'https://dev.gachisallim.com',
              'http://localhost:5173',
            ],
            MaxAge: 300,
          }),
        ],
      },
      OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: [
          Match.objectLike({
            AllowedMethods: ['POST', 'GET'],
          }),
        ],
      },
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
        Enabled: true,
        PriceClass: 'PriceClass_100',
      }),
    });

    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('s3:PutObject');
    expect(policies).toContain('s3:GetObject');
    expect(policies).toContain('s3:DeleteObject');
    expect(policies).toContain('/main/profiles/*');
    expect(policies).toContain('/develop/profiles/*');
    expect(policies).toContain('/main/receipts/*');
    expect(policies).toContain('/develop/receipts/*');

    const userData = JSON.stringify(template.findResources('AWS::EC2::Instance'));
    expect(userData).toContain('PROFILE_IMAGE_BUCKET');
    expect(userData).toContain("PROFILE_IMAGE_OBJECT_PREFIX='main/profiles'");
    expect(userData).toContain("PROFILE_IMAGE_OBJECT_PREFIX='develop/profiles'");
    expect(userData).toContain('PROFILE_IMAGE_PUBLIC_BASE_URL');
    expect(userData).toContain('RECEIPT_IMAGE_BUCKET');
    expect(userData).toContain("RECEIPT_IMAGE_OBJECT_PREFIX='main/receipts'");
    expect(userData).toContain("RECEIPT_IMAGE_OBJECT_PREFIX='develop/receipts'");
    expect(userData).not.toContain('RECEIPT_IMAGE_PUBLIC_BASE_URL');

    const runtimeConfiguration = JSON.stringify(template.findResources('AWS::SSM::Document'));
    expect(runtimeConfiguration).toContain('PROFILE_IMAGE_BUCKET');
    expect(runtimeConfiguration).toContain('PROFILE_IMAGE_OBJECT_PREFIX');
    expect(runtimeConfiguration).toContain('PROFILE_IMAGE_PUBLIC_BASE_URL');
    expect(runtimeConfiguration).toContain('RECEIPT_IMAGE_BUCKET');
    expect(runtimeConfiguration).toContain('RECEIPT_IMAGE_OBJECT_PREFIX');
    expect(runtimeConfiguration).not.toContain('RECEIPT_IMAGE_PUBLIC_BASE_URL');
  });

  it('deploys all default avatars to stable CloudFront paths', () => {
    const avatarDirectory = join(__dirname, '../assets/default-avatars');
    const avatarFiles = readdirSync(avatarDirectory).sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );

    expect(avatarFiles).toEqual(
      Array.from({ length: 10 }, (_, index) => `avatar-${index + 1}.png`),
    );
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      DestinationBucketKeyPrefix: 'default-avatars',
      DistributionPaths: ['/default-avatars/*'],
      SystemMetadata: {
        'cache-control': 'public, max-age=86400',
        'content-type': 'image/png',
      },
    });
    expect(JSON.stringify(template.toJSON().Outputs)).toContain('DefaultAvatarBaseUrl');
    expect(JSON.stringify(template.toJSON().Outputs)).toContain('/default-avatars');
  });

  it('creates encrypted notification push queues and dead-letter queues per environment', () => {
    template.resourceCountIs('AWS::SQS::Queue', 12);
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

    const runtimeConfiguration = JSON.stringify(template.findResources('AWS::SSM::Document'));
    expect(runtimeConfiguration).toContain('NOTIFICATION_PUSH_QUEUE_URL');
    expect(runtimeConfiguration).toContain('NOTIFICATION_PUSH_RESULT_QUEUE_URL');
    expect(runtimeConfiguration).toContain('NOTIFICATION_VAPID_PUBLIC_KEY');
    expect(runtimeConfiguration).not.toContain('NOTIFICATION_VAPID_SECRET_ID');
  });

  it('runs isolated web push workers with partial batch retry and VAPID secret access', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gachisallim-main-notification-web-push',
      Architectures: ['arm64'],
      MemorySize: 256,
      ReservedConcurrentExecutions: 20,
      Runtime: 'nodejs22.x',
      Timeout: 30,
      Environment: {
        Variables: Match.objectLike({ NOTIFICATION_VAPID_SECRET_ID: Match.anyValue() }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 10,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
      ScalingConfig: { MaximumConcurrency: 10 },
    });

    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain('sqs:ReceiveMessage');
    expect(JSON.stringify(template.toJSON())).toContain(
      '/gachisallim/main/notification-vapid-public-key',
    );
  });

  it('creates environment-scoped chore due Scheduler resources and command queues', () => {
    template.resourceCountIs('AWS::Scheduler::ScheduleGroup', 2);
    template.hasResourceProperties('AWS::Scheduler::ScheduleGroup', {
      Name: 'gachisallim-main-chore-due',
    });
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'gachisallim-main-notification-command',
      ReceiveMessageWaitTimeSeconds: 20,
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
    });

    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('scheduler:CreateSchedule');
    expect(policies).toContain('scheduler:UpdateSchedule');
    expect(policies).toContain('scheduler:DeleteSchedule');
    expect(policies).toContain('iam:PassRole');
    expect(policies).toContain('iam:PassedToService');

    const runtimeConfiguration = JSON.stringify(template.findResources('AWS::SSM::Document'));
    expect(runtimeConfiguration).toContain('NOTIFICATION_COMMAND_QUEUE_URL');
    expect(runtimeConfiguration).toContain('CHORE_DUE_SCHEDULE_GROUP');
    expect(runtimeConfiguration).toContain('CHORE_DUE_SCHEDULE_ROLE_ARN');
  });

  it('applies mutable instance configuration through an SSM association', () => {
    template.resourceCountIs('AWS::SSM::Document', 1);
    template.hasResourceProperties('AWS::SSM::Document', {
      DocumentType: 'Command',
      TargetType: '/AWS::EC2::Instance',
      UpdateMethod: 'NewVersion',
      Content: Match.objectLike({
        schemaVersion: '2.2',
        mainSteps: [
          Match.objectLike({
            action: 'aws:runShellScript',
            name: 'configureApplicationRuntime',
          }),
        ],
      }),
    });
    template.hasResourceProperties('AWS::SSM::Association', {
      AssociationName: 'gachisallim-application-runtime-configuration',
      DocumentVersion: '$LATEST',
      Parameters: {
        ConfigurationVersion: [Match.stringLikeRegexp('^[0-9a-f]{64}$')],
      },
      Targets: [
        {
          Key: 'InstanceIds',
          Values: [Match.anyValue()],
        },
      ],
      WaitForSuccessTimeoutSeconds: 600,
    });

    const userData = JSON.stringify(template.findResources('AWS::EC2::Instance'));
    expect(userData).not.toContain('NOTIFICATION_PUSH_QUEUE_URL');
    expect(userData).not.toContain('NOTIFICATION_COMMAND_QUEUE_URL');

    const runtimeConfiguration = JSON.stringify(template.findResources('AWS::SSM::Document'));
    expect(runtimeConfiguration).toContain('/usr/local/bin/gachisallim-deploy');
    expect(runtimeConfiguration).toContain('systemctl enable');
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
    const instancePolicies = Object.values(template.findResources('AWS::IAM::Policy')).filter(
      (policy) => JSON.stringify(policy).includes('InstanceRole'),
    );
    expect(JSON.stringify(instancePolicies)).not.toContain('notification-vapid');
  });

  it('provisions a chat WebSocket API with connect/disconnect Lambdas and a connections table per environment', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 2);
    template.resourceCountIs('AWS::ApiGatewayV2::Stage', 2);
    template.resourceCountIs('AWS::DynamoDB::Table', 2);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'gachisallim-main-chat-ws',
      ProtocolType: 'WEBSOCKET',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'gachisallim-develop-chat-ws',
      ProtocolType: 'WEBSOCKET',
    });
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'gachisallim-main-chat-connections',
      KeySchema: [
        { AttributeName: 'connectionId', KeyType: 'HASH' },
        { AttributeName: 'chatRoomId', KeyType: 'RANGE' },
      ],
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'chatRoomId-index',
        }),
      ]),
    });

    const lambdaFunctions = JSON.stringify(template.findResources('AWS::Lambda::Function'));
    expect(lambdaFunctions).toContain('gachisallim-main-chat-ws-connect');
    expect(lambdaFunctions).toContain('gachisallim-main-chat-ws-disconnect');
    expect(lambdaFunctions).toContain('gachisallim-develop-chat-ws-connect');
    expect(lambdaFunctions).toContain('gachisallim-develop-chat-ws-disconnect');

    const instancePolicies = JSON.stringify(
      Object.values(template.findResources('AWS::IAM::Policy')).filter((policy) =>
        JSON.stringify(policy).includes('InstanceRole'),
      ),
    );
    expect(instancePolicies).toContain('execute-api:ManageConnections');
    expect(instancePolicies).toContain('dynamodb:GetItem');
  });

  it('protects the chat WebSocket $connect route with a Lambda authorizer and adds a roomJoin route', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 2);
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'REQUEST',
      IdentitySource: ['route.request.querystring.token'],
    });

    const routes = JSON.stringify(template.findResources('AWS::ApiGatewayV2::Route'));
    expect(routes).toContain('roomJoin');
    expect(routes).not.toContain('room:join');
    expect(routes).toContain('$connect');
    expect(routes).toContain('$disconnect');

    const lambdaFunctions = JSON.stringify(template.findResources('AWS::Lambda::Function'));
    expect(lambdaFunctions).toContain('gachisallim-main-chat-ws-authorizer');
    expect(lambdaFunctions).toContain('gachisallim-main-chat-ws-join');
    expect(lambdaFunctions).toContain('gachisallim-develop-chat-ws-authorizer');
    expect(lambdaFunctions).toContain('gachisallim-develop-chat-ws-join');

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gachisallim-main-chat-ws-join',
      Environment: {
        Variables: Match.objectLike({
          CHAT_CONNECTIONS_TABLE_NAME: Match.anyValue(),
          CHAT_API_BASE_URL: Match.anyValue(),
          CHAT_WEBSOCKET_CALLBACK_URL: Match.anyValue(),
        }),
      },
    });

    const joinPolicies = JSON.stringify(
      Object.values(template.findResources('AWS::IAM::Policy')).filter((policy) =>
        JSON.stringify(policy).includes('ChatWebSocketJoinFunction'),
      ),
    );
    expect(joinPolicies).toContain('execute-api:ManageConnections');
    expect(joinPolicies).toContain('dynamodb:UpdateItem');
  });

  it('adds a roomLeave route with its own Lambda and lets $disconnect query and delete every row for a connection', () => {
    const routes = JSON.stringify(template.findResources('AWS::ApiGatewayV2::Route'));
    expect(routes).toContain('roomLeave');
    expect(routes).not.toContain('room:leave');

    const lambdaFunctions = JSON.stringify(template.findResources('AWS::Lambda::Function'));
    expect(lambdaFunctions).toContain('gachisallim-main-chat-ws-leave');
    expect(lambdaFunctions).toContain('gachisallim-develop-chat-ws-leave');

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gachisallim-main-chat-ws-leave',
      Environment: {
        Variables: Match.objectLike({
          CHAT_CONNECTIONS_TABLE_NAME: Match.anyValue(),
          CHAT_WEBSOCKET_CALLBACK_URL: Match.anyValue(),
        }),
      },
    });

    const leavePolicies = JSON.stringify(
      Object.values(template.findResources('AWS::IAM::Policy')).filter((policy) =>
        JSON.stringify(policy).includes('ChatWebSocketLeaveFunction'),
      ),
    );
    expect(leavePolicies).toContain('execute-api:ManageConnections');
    expect(leavePolicies).toContain('dynamodb:DeleteItem');

    const disconnectPolicies = JSON.stringify(
      Object.values(template.findResources('AWS::IAM::Policy')).filter((policy) =>
        JSON.stringify(policy).includes('ChatWebSocketDisconnectFunction'),
      ),
    );
    expect(disconnectPolicies).toContain('dynamodb:Query');
    expect(disconnectPolicies).toContain('dynamodb:DeleteItem');
  });
});
