import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Aws, CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2Targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

const DATABASE_PORT = 5432;
const HOSTED_ZONE_ID = 'Z030555518IT8GMAZA4RP';
const ROOT_DOMAIN = 'gachisallim.com';
const PRODUCTION_DOMAIN = `api.${ROOT_DOMAIN}`;
const DEVELOPMENT_DOMAIN = `dev-api.${ROOT_DOMAIN}`;

interface BackendStackProps extends StackProps {
  readonly artifactBucket: s3.IBucket;
}

interface AuthenticationResources {
  readonly client: cognito.UserPoolClient;
  readonly domain: cognito.UserPoolDomain;
  readonly issuer: string;
  readonly jwksEndpoint: string;
  readonly pool: cognito.UserPool;
}

interface RuntimeEnvironment {
  readonly authDomainPrefix: string;
  readonly branch: 'main' | 'develop';
  readonly corsOrigin: string;
  readonly databaseName: string;
  readonly domain: string;
  readonly id: 'Production' | 'Development';
  readonly nodeEnvironment: 'production' | 'development';
  readonly port: number;
  readonly socialAuthSecretName: string;
  readonly webAppUrl: string;
}

const RUNTIME_ENVIRONMENTS: RuntimeEnvironment[] = [
  {
    authDomainPrefix: 'gachisallim-prod-auth',
    branch: 'main',
    corsOrigin: 'https://gachisallim.com',
    databaseName: 'gachisallim',
    domain: PRODUCTION_DOMAIN,
    id: 'Production',
    nodeEnvironment: 'production',
    port: 3000,
    socialAuthSecretName: 'gachisallim/main/social-auth',
    webAppUrl: 'https://gachisallim.com',
  },
  {
    authDomainPrefix: 'gachisallim-dev-auth',
    branch: 'develop',
    corsOrigin: '*',
    databaseName: 'gachisallim_develop',
    domain: DEVELOPMENT_DOMAIN,
    id: 'Development',
    nodeEnvironment: 'development',
    port: 3001,
    socialAuthSecretName: 'gachisallim/develop/social-auth',
    webAppUrl: 'https://dev.gachisallim.com',
  },
];

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ROOT_DOMAIN,
    });

    const natProvider = ec2.NatProvider.instanceV2({
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
      associatePublicIpAddress: true,
      creditSpecification: ec2.CpuCredits.STANDARD,
      defaultAllowedTraffic: ec2.NatTrafficDirection.OUTBOUND_ONLY,
    });
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: natProvider,
      subnetConfiguration: [
        {
          name: 'Ingress',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Backend',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    const loadBalancerSecurityGroup = new ec2.SecurityGroup(this, 'LoadBalancerSecurityGroup', {
      vpc,
      allowAllOutbound: false,
      description: 'Allows public HTTPS traffic to the backend load balancer.',
    });
    loadBalancerSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    loadBalancerSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    loadBalancerSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allows HTTPS access to the Cognito JWKS endpoints.',
    );

    const applicationSecurityGroup = new ec2.SecurityGroup(this, 'ApplicationSecurityGroup', {
      vpc,
      allowAllOutbound: false,
      description: 'Allows backend traffic only from the load balancer.',
    });
    for (const environment of RUNTIME_ENVIRONMENTS) {
      applicationSecurityGroup.addIngressRule(
        loadBalancerSecurityGroup,
        ec2.Port.tcp(environment.port),
      );
      loadBalancerSecurityGroup.addEgressRule(
        applicationSecurityGroup,
        ec2.Port.tcp(environment.port),
      );
    }

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      allowAllOutbound: false,
      description: 'Allows PostgreSQL traffic only from the backend instance.',
    });
    databaseSecurityGroup.addIngressRule(applicationSecurityGroup, ec2.Port.tcp(DATABASE_PORT));
    applicationSecurityGroup.addEgressRule(databaseSecurityGroup, ec2.Port.tcp(DATABASE_PORT));

    const endpointSecurityGroup = new ec2.SecurityGroup(this, 'EndpointSecurityGroup', {
      vpc,
      allowAllOutbound: false,
      description: 'Allows the backend instance to use private AWS service endpoints.',
    });
    endpointSecurityGroup.addIngressRule(applicationSecurityGroup, ec2.Port.tcp(443));
    applicationSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allows HTTPS to VPC endpoints and public AWS service endpoints.',
    );
    natProvider.connections.allowFrom(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allows HTTPS forwarding from private VPC resources.',
    );

    const backendSubnets: ec2.SubnetSelection = {
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    };
    const applicationSubnet: ec2.SubnetSelection = {
      subnets: [vpc.privateSubnets[0]],
    };
    const endpointOptions = {
      subnets: applicationSubnet,
      securityGroups: [endpointSecurityGroup],
      open: false,
      privateDnsEnabled: true,
    };
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      ...endpointOptions,
    });
    vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ...endpointOptions,
    });
    vpc.addInterfaceEndpoint('SystemsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      ...endpointOptions,
    });
    vpc.addInterfaceEndpoint('SystemsManagerMessagesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      ...endpointOptions,
    });
    vpc.addInterfaceEndpoint('SqsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SQS,
      ...endpointOptions,
    });
    vpc.addInterfaceEndpoint('SchedulerEndpoint', {
      service: new ec2.InterfaceVpcEndpointAwsService('scheduler'),
      ...endpointOptions,
    });
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [applicationSubnet],
    });

    const profileImageBucket = new s3.Bucket(this, 'ProfileImageBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.POST],
          allowedOrigins: [
            ...RUNTIME_ENVIRONMENTS.map(({ webAppUrl }) => webAppUrl),
            'http://localhost:5173',
          ],
          exposedHeaders: ['ETag'],
          maxAge: 300,
        },
      ],
    });
    const profileImageDistribution = new cloudfront.Distribution(this, 'ProfileImageDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(profileImageBucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    const applicationLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
      logGroupName: '/gachisallim/backend/application',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const notificationQueueKey = new kms.Key(this, 'NotificationQueueKey', {
      alias: 'alias/gachisallim-notification-queues',
      description: 'Encrypts notification delivery queues.',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const notificationPushQueues = new Map<string, sqs.Queue>();
    const notificationPushResultQueues = new Map<string, sqs.Queue>();
    const notificationVapidSecrets = new Map<string, secretsmanager.ISecret>();
    const notificationVapidPublicKeys = new Map<string, string>();
    const notificationCommandQueues = new Map<string, sqs.Queue>();
    const notificationCommandDeadLetterQueues = new Map<string, sqs.Queue>();
    const choreDueScheduleGroups = new Map<string, scheduler.CfnScheduleGroup>();
    const choreDueScheduleRoles = new Map<string, iam.Role>();
    for (const environment of RUNTIME_ENVIRONMENTS) {
      const deadLetterQueue = new sqs.Queue(
        this,
        `${environment.id}NotificationPushDeadLetterQueue`,
        {
          queueName: `gachisallim-${environment.branch}-notification-push-dlq`,
          encryption: sqs.QueueEncryption.KMS,
          encryptionMasterKey: notificationQueueKey,
          enforceSSL: true,
          retentionPeriod: Duration.days(14),
          removalPolicy: RemovalPolicy.RETAIN,
        },
      );
      const queue = new sqs.Queue(this, `${environment.id}NotificationPushQueue`, {
        queueName: `gachisallim-${environment.branch}-notification-push`,
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: notificationQueueKey,
        enforceSSL: true,
        receiveMessageWaitTime: Duration.seconds(20),
        retentionPeriod: Duration.days(4),
        visibilityTimeout: Duration.seconds(180),
        deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 5 },
        removalPolicy: RemovalPolicy.RETAIN,
      });
      notificationPushQueues.set(environment.branch, queue);

      const resultDeadLetterQueue = new sqs.Queue(
        this,
        `${environment.id}NotificationPushResultDeadLetterQueue`,
        {
          queueName: `gachisallim-${environment.branch}-notification-push-result-dlq`,
          encryption: sqs.QueueEncryption.KMS,
          encryptionMasterKey: notificationQueueKey,
          enforceSSL: true,
          retentionPeriod: Duration.days(14),
          removalPolicy: RemovalPolicy.RETAIN,
        },
      );
      const commandDeadLetterQueue = new sqs.Queue(
        this,
        `${environment.id}NotificationCommandDeadLetterQueue`,
        {
          queueName: `gachisallim-${environment.branch}-notification-command-dlq`,
          encryption: sqs.QueueEncryption.KMS,
          encryptionMasterKey: notificationQueueKey,
          enforceSSL: true,
          retentionPeriod: Duration.days(14),
          removalPolicy: RemovalPolicy.RETAIN,
        },
      );
      const resultQueue = new sqs.Queue(this, `${environment.id}NotificationPushResultQueue`, {
        queueName: `gachisallim-${environment.branch}-notification-push-result`,
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: notificationQueueKey,
        enforceSSL: true,
        receiveMessageWaitTime: Duration.seconds(20),
        retentionPeriod: Duration.days(4),
        visibilityTimeout: Duration.seconds(60),
        deadLetterQueue: { queue: resultDeadLetterQueue, maxReceiveCount: 5 },
        removalPolicy: RemovalPolicy.RETAIN,
      });
      notificationPushResultQueues.set(environment.branch, resultQueue);

      const vapidSecret = secretsmanager.Secret.fromSecretNameV2(
        this,
        `${environment.id}NotificationVapidSecret`,
        `gachisallim/${environment.branch}/notification-vapid`,
      );
      notificationVapidSecrets.set(environment.branch, vapidSecret);
      notificationVapidPublicKeys.set(
        environment.branch,
        ssm.StringParameter.valueForStringParameter(
          this,
          `/gachisallim/${environment.branch}/notification-vapid-public-key`,
        ),
      );

      const worker = new lambdaNodejs.NodejsFunction(
        this,
        `${environment.id}NotificationWebPushWorker`,
        {
          functionName: `gachisallim-${environment.branch}-notification-web-push`,
          entry: join(__dirname, '../lambda/notification-web-push.ts'),
          handler: 'handler',
          runtime: lambda.Runtime.NODEJS_22_X,
          architecture: lambda.Architecture.ARM_64,
          timeout: Duration.seconds(30),
          memorySize: 256,
          reservedConcurrentExecutions: 20,
          logGroup: new logs.LogGroup(this, `${environment.id}NotificationWebPushWorkerLogGroup`, {
            logGroupName: `/aws/lambda/gachisallim-${environment.branch}-notification-web-push`,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: RemovalPolicy.RETAIN,
          }),
          environment: {
            NOTIFICATION_VAPID_SECRET_ID: vapidSecret.secretArn,
            NOTIFICATION_PUSH_RESULT_QUEUE_URL: resultQueue.queueUrl,
          },
          bundling: { sourceMap: true, minify: true },
        },
      );
      worker.addEventSource(
        new lambdaEventSources.SqsEventSource(queue, {
          batchSize: 10,
          maxConcurrency: 10,
          reportBatchItemFailures: true,
        }),
      );
      vapidSecret.grantRead(worker);
      resultQueue.grantSendMessages(worker);
      const commandQueue = new sqs.Queue(this, `${environment.id}NotificationCommandQueue`, {
        queueName: `gachisallim-${environment.branch}-notification-command`,
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: notificationQueueKey,
        enforceSSL: true,
        receiveMessageWaitTime: Duration.seconds(20),
        retentionPeriod: Duration.days(4),
        visibilityTimeout: Duration.seconds(60),
        deadLetterQueue: { queue: commandDeadLetterQueue, maxReceiveCount: 5 },
        removalPolicy: RemovalPolicy.RETAIN,
      });
      notificationCommandQueues.set(environment.branch, commandQueue);
      notificationCommandDeadLetterQueues.set(environment.branch, commandDeadLetterQueue);

      const scheduleGroupName = `gachisallim-${environment.branch}-chore-due`;
      const scheduleGroup = new scheduler.CfnScheduleGroup(
        this,
        `${environment.id}ChoreDueScheduleGroup`,
        { name: scheduleGroupName },
      );
      choreDueScheduleGroups.set(environment.branch, scheduleGroup);
      const scheduleGroupArn = this.formatArn({
        service: 'scheduler',
        resource: 'schedule-group',
        resourceName: scheduleGroupName,
      });
      const scheduleRole = new iam.Role(this, `${environment.id}ChoreDueScheduleRole`, {
        roleName: `gachisallim-${environment.branch}-chore-due-scheduler`,
        assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
          conditions: {
            StringEquals: { 'aws:SourceAccount': Aws.ACCOUNT_ID },
            ArnEquals: { 'aws:SourceArn': scheduleGroupArn },
          },
        }),
      });
      commandQueue.grantSendMessages(scheduleRole);
      commandDeadLetterQueue.grantSendMessages(scheduleRole);
      choreDueScheduleRoles.set(environment.branch, scheduleRole);
    }

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromGeneratedSecret('postgres'),
      databaseName: 'gachisallim',
      vpc,
      vpcSubnets: backendSubnets,
      securityGroups: [databaseSecurityGroup],
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: Duration.days(7),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      engineLifecycleSupport: rds.EngineLifecycleSupport.OPEN_SOURCE_RDS_EXTENDED_SUPPORT_DISABLED,
    });

    const preSignupLinkLogGroup = new logs.LogGroup(this, 'PreSignupLinkLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const preSignupLinkFunction = new lambdaNodejs.NodejsFunction(this, 'PreSignupLinkFunction', {
      entry: join(__dirname, '../lambda/pre-signup-link.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: Duration.seconds(10),
      logGroup: preSignupLinkLogGroup,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    const authentication = new Map<string, AuthenticationResources>();
    for (const environment of RUNTIME_ENVIRONMENTS) {
      const pool = new cognito.UserPool(this, `${environment.id}UserPool`, {
        userPoolName: `gachisallim-${environment.branch}-users`,
        selfSignUpEnabled: true,
        signInAliases: { email: true },
        autoVerify: { email: true },
        accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        email: cognito.UserPoolEmail.withSES({
          fromEmail: `noreply@${ROOT_DOMAIN}`,
          fromName: 'GachiSallim',
          sesRegion: Aws.REGION,
          sesVerifiedDomain: ROOT_DOMAIN,
        }),
        passwordPolicy: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: false,
        },
        deletionProtection: true,
        removalPolicy: RemovalPolicy.RETAIN,
      });
      pool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignupLinkFunction);
      const passwordResetMessageLogGroup = new logs.LogGroup(
        this,
        `${environment.id}PasswordResetMessageLogGroup`,
        {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.RETAIN,
        },
      );
      const passwordResetMessageFunction = new lambdaNodejs.NodejsFunction(
        this,
        `${environment.id}PasswordResetMessageFunction`,
        {
          entry: join(__dirname, '../lambda/password-reset-message.ts'),
          handler: 'handler',
          runtime: lambda.Runtime.NODEJS_22_X,
          memorySize: 128,
          timeout: Duration.seconds(10),
          logGroup: passwordResetMessageLogGroup,
          environment: {
            PASSWORD_RESET_URL: `${environment.webAppUrl}/reset-password`,
          },
          bundling: {
            minify: true,
            sourceMap: true,
          },
        },
      );
      pool.addTrigger(cognito.UserPoolOperation.CUSTOM_MESSAGE, passwordResetMessageFunction);
      const domain = pool.addDomain(`${environment.id}UserPoolDomain`, {
        cognitoDomain: { domainPrefix: environment.authDomainPrefix },
      });
      const socialAuthSecret = secretsmanager.Secret.fromSecretNameV2(
        this,
        `${environment.id}SocialAuthSecret`,
        environment.socialAuthSecretName,
      );
      const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
        this,
        `${environment.id}GoogleProvider`,
        {
          userPool: pool,
          clientId: socialAuthSecret.secretValueFromJson('googleClientId').unsafeUnwrap(),
          clientSecretValue: socialAuthSecret.secretValueFromJson('googleClientSecret'),
          scopes: ['openid', 'email', 'profile'],
          attributeMapping: {
            email: cognito.ProviderAttribute.GOOGLE_EMAIL,
            emailVerified: cognito.ProviderAttribute.GOOGLE_EMAIL_VERIFIED,
            fullname: cognito.ProviderAttribute.GOOGLE_NAME,
            profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
          },
        },
      );
      const kakaoProvider = new cognito.UserPoolIdentityProviderOidc(
        this,
        `${environment.id}KakaoProvider`,
        {
          userPool: pool,
          name: 'Kakao',
          clientId: socialAuthSecret.secretValueFromJson('kakaoClientId').unsafeUnwrap(),
          clientSecret: socialAuthSecret.secretValueFromJson('kakaoClientSecret').unsafeUnwrap(),
          issuerUrl: 'https://kauth.kakao.com',
          scopes: ['openid', 'profile', 'account_email'],
          attributeMapping: {
            email: cognito.ProviderAttribute.other('email'),
            emailVerified: cognito.ProviderAttribute.other('email_verified'),
            nickname: cognito.ProviderAttribute.other('nickname'),
            profilePicture: cognito.ProviderAttribute.other('picture'),
          },
        },
      );
      const callbackUrls = [`${environment.webAppUrl}/auth/callback`];
      const logoutUrls = [`${environment.webAppUrl}/login`];
      if (environment.branch === 'develop') {
        callbackUrls.push('http://localhost:5173/auth/callback');
        logoutUrls.push('http://localhost:5173/login');
      }
      const client = pool.addClient(`${environment.id}UserPoolClient`, {
        userPoolClientName: `gachisallim-${environment.branch}-web`,
        generateSecret: false,
        authFlows: { userPassword: true },
        preventUserExistenceErrors: true,
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
          cognito.UserPoolClientIdentityProvider.GOOGLE,
          cognito.UserPoolClientIdentityProvider.custom('Kakao'),
        ],
        oAuth: {
          flows: { authorizationCodeGrant: true },
          scopes: [
            cognito.OAuthScope.OPENID,
            cognito.OAuthScope.EMAIL,
            cognito.OAuthScope.PROFILE,
            cognito.OAuthScope.COGNITO_ADMIN,
          ],
          callbackUrls,
          logoutUrls,
        },
        accessTokenValidity: Duration.hours(1),
        idTokenValidity: Duration.hours(1),
        refreshTokenValidity: Duration.days(30),
        enableTokenRevocation: true,
      });
      client.node.addDependency(googleProvider, kakaoProvider);
      const issuer = `https://cognito-idp.${Aws.REGION}.${Aws.URL_SUFFIX}/${pool.userPoolId}`;
      authentication.set(environment.branch, {
        client,
        domain,
        issuer,
        jwksEndpoint: `${issuer}/.well-known/jwks.json`,
        pool,
      });
    }
    const preSignupLinkRole = preSignupLinkFunction.role;
    if (!preSignupLinkRole) {
      throw new Error('Pre-signup link function role was not created');
    }
    new iam.CfnPolicy(this, 'PreSignupLinkPolicy', {
      policyName: 'gachisallim-pre-signup-link',
      roles: [preSignupLinkRole.roleName],
      policyDocument: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['cognito-idp:AdminLinkProviderForUser', 'cognito-idp:ListUsers'],
            resources: Array.from(authentication.values(), ({ pool }) => pool.userPoolArn),
          }),
        ],
      }),
    });

    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Allows the backend instance to receive deployments and access runtime data.',
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
    });
    const databaseSecret = database.secret!;
    databaseSecret.grantRead(instanceRole);
    props.artifactBucket.grantRead(instanceRole, 'releases/*');
    for (const environment of RUNTIME_ENVIRONMENTS) {
      profileImageBucket.grantPut(instanceRole, `${environment.branch}/profiles/*`);
    }
    applicationLogGroup.grantWrite(instanceRole);
    for (const queue of notificationPushQueues.values()) {
      queue.grantSendMessages(instanceRole);
    }
    for (const queue of notificationPushResultQueues.values()) {
      queue.grantConsumeMessages(instanceRole);
    }
    for (const queue of notificationCommandQueues.values()) {
      queue.grantSendMessages(instanceRole);
      queue.grantConsumeMessages(instanceRole);
    }
    for (const environment of RUNTIME_ENVIRONMENTS) {
      const scheduleGroup = choreDueScheduleGroups.get(environment.branch)!;
      const scheduleRole = choreDueScheduleRoles.get(environment.branch)!;
      instanceRole.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            'scheduler:CreateSchedule',
            'scheduler:UpdateSchedule',
            'scheduler:DeleteSchedule',
            'scheduler:GetSchedule',
          ],
          resources: [
            this.formatArn({
              service: 'scheduler',
              resource: 'schedule',
              resourceName: `${scheduleGroup.name}/*`,
            }),
          ],
        }),
      );
      instanceRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [scheduleRole.roleArn],
          conditions: { StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' } },
        }),
      );
    }
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminDeleteUser', 'cognito-idp:AdminGetUser'],
        resources: Array.from(authentication.values()).map(({ pool }) => pool.userPoolArn),
      }),
    );

    const instance = new ec2.Instance(this, 'ApplicationInstance', {
      vpc,
      vpcSubnets: applicationSubnet,
      securityGroup: applicationSecurityGroup,
      role: instanceRole,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.resolveSsmParameterAtLaunch(
        '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64',
        { os: ec2.OperatingSystemType.LINUX },
      ),
      associatePublicIpAddress: false,
      requireImdsv2: true,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(16, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });
    Tags.of(instance).add('GachiSallimDeploymentTarget', 'true');

    // Keep this bootstrap payload stable. Mutable scripts and configuration are applied below
    // through SSM State Manager so an update does not rely on UserData running again.
    const bootstrapDeployScript = readFileSync(
      join(__dirname, '../../scripts/bootstrap-deploy-release.sh'),
      'utf8',
    );
    instance.userData.addCommands(
      'mkdir -p /etc/gachisallim /opt/gachisallim/current /opt/gachisallim/releases',
      `cat > /usr/local/bin/gachisallim-deploy <<'DEPLOY_SCRIPT'\n${bootstrapDeployScript}\nDEPLOY_SCRIPT`,
      'chmod 0755 /usr/local/bin/gachisallim-deploy',
      `cat > /etc/systemd/system/gachisallim@.service <<'SYSTEMD_UNIT'
[Unit]
Description=GachiSallim backend (%i)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
EnvironmentFile=/etc/gachisallim/%i.env
WorkingDirectory=/opt/gachisallim/current/%i
ExecStart=/opt/gachisallim/current/%i/bin/node dist/main.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SYSTEMD_UNIT`,
      'systemctl daemon-reload',
      'systemctl enable amazon-ssm-agent --now',
    );
    for (const environment of RUNTIME_ENVIRONMENTS) {
      const auth = authentication.get(environment.branch)!;
      instance.userData.addCommands(
        `cat > /etc/gachisallim/${environment.branch}.config <<'ENVIRONMENT_CONFIG'
ARTIFACT_BUCKET='${props.artifactBucket.bucketName}'
DATABASE_SECRET_ARN='${databaseSecret.secretArn}'
DATABASE_NAME='${environment.databaseName}'
NODE_ENV='${environment.nodeEnvironment}'
PORT='${environment.port}'
APP_NAME='GachiSallim Backend (${environment.branch})'
APP_VERSION='0.1.0'
CORS_ORIGIN='${environment.corsOrigin}'
AWS_REGION='${Aws.REGION}'
COGNITO_USER_POOL_ID='${auth.pool.userPoolId}'
COGNITO_CLIENT_ID='${auth.client.userPoolClientId}'
PROFILE_IMAGE_BUCKET='${profileImageBucket.bucketName}'
PROFILE_IMAGE_OBJECT_PREFIX='${environment.branch}/profiles'
PROFILE_IMAGE_PUBLIC_BASE_URL='https://${profileImageDistribution.distributionDomainName}'
ENVIRONMENT_CONFIG`,
        `chmod 0600 /etc/gachisallim/${environment.branch}.config`,
      );
    }

    const deployScript = readFileSync(join(__dirname, '../../scripts/deploy-release.sh'), 'utf8');
    const runtimeConfigurationCommands = [
      'set -euo pipefail',
      'mkdir -p /etc/gachisallim /opt/gachisallim/current /opt/gachisallim/releases',
      `cat > /usr/local/bin/gachisallim-deploy <<'DEPLOY_SCRIPT'\n${deployScript}\nDEPLOY_SCRIPT`,
      'chmod 0755 /usr/local/bin/gachisallim-deploy',
    ];
    for (const environment of RUNTIME_ENVIRONMENTS) {
      const auth = authentication.get(environment.branch)!;
      runtimeConfigurationCommands.push(
        `cat > /etc/gachisallim/${environment.branch}.config <<'ENVIRONMENT_CONFIG'
ARTIFACT_BUCKET='${props.artifactBucket.bucketName}'
DATABASE_SECRET_ARN='${databaseSecret.secretArn}'
DATABASE_NAME='${environment.databaseName}'
NODE_ENV='${environment.nodeEnvironment}'
PORT='${environment.port}'
APP_NAME='GachiSallim Backend (${environment.branch})'
APP_VERSION='0.1.0'
CORS_ORIGIN='${environment.corsOrigin}'
AWS_REGION='${Aws.REGION}'
COGNITO_USER_POOL_ID='${auth.pool.userPoolId}'
COGNITO_CLIENT_ID='${auth.client.userPoolClientId}'
PROFILE_IMAGE_BUCKET='${profileImageBucket.bucketName}'
PROFILE_IMAGE_OBJECT_PREFIX='${environment.branch}/profiles'
PROFILE_IMAGE_PUBLIC_BASE_URL='https://${profileImageDistribution.distributionDomainName}'
NOTIFICATION_PUSH_QUEUE_URL='${notificationPushQueues.get(environment.branch)!.queueUrl}'
NOTIFICATION_PUSH_RESULT_QUEUE_URL='${notificationPushResultQueues.get(environment.branch)!.queueUrl}'
NOTIFICATION_VAPID_PUBLIC_KEY='${notificationVapidPublicKeys.get(environment.branch)!}'
NOTIFICATION_COMMAND_QUEUE_URL='${notificationCommandQueues.get(environment.branch)!.queueUrl}'
NOTIFICATION_COMMAND_QUEUE_ARN='${notificationCommandQueues.get(environment.branch)!.queueArn}'
NOTIFICATION_COMMAND_DLQ_ARN='${notificationCommandDeadLetterQueues.get(environment.branch)!.queueArn}'
CHORE_DUE_SCHEDULE_GROUP='${choreDueScheduleGroups.get(environment.branch)!.name}'
CHORE_DUE_SCHEDULE_ROLE_ARN='${choreDueScheduleRoles.get(environment.branch)!.roleArn}'
CHORE_DUE_SCHEDULE_PREFIX='${environment.branch}'
ENVIRONMENT_CONFIG`,
        `chmod 0600 /etc/gachisallim/${environment.branch}.config`,
      );
    }
    runtimeConfigurationCommands.push(
      'systemctl daemon-reload',
      `for environment_name in main develop; do
  if [[ -e "/opt/gachisallim/current/\${environment_name}/dist/main.js" ]]; then
    systemctl enable "gachisallim@\${environment_name}.service"
  fi
done`,
      'echo "Applied runtime configuration {{ ConfigurationVersion }}"',
    );
    const runtimeConfigurationScript = runtimeConfigurationCommands.join('\n');
    const runtimeConfigurationVersion = createHash('sha256')
      .update(readFileSync(__filename, 'utf8'))
      .update('\0')
      .update(deployScript)
      .digest('hex');
    const runtimeConfigurationDocument = new ssm.CfnDocument(
      this,
      'ApplicationRuntimeConfigurationDocument',
      {
        documentType: 'Command',
        targetType: '/AWS::EC2::Instance',
        updateMethod: 'NewVersion',
        content: {
          schemaVersion: '2.2',
          description: 'Applies mutable GachiSallim application runtime configuration.',
          parameters: {
            ConfigurationVersion: {
              type: 'String',
              description: 'Hash of the desired runtime configuration.',
            },
          },
          mainSteps: [
            {
              action: 'aws:runShellScript',
              name: 'configureApplicationRuntime',
              inputs: { runCommand: [runtimeConfigurationScript] },
            },
          ],
        },
      },
    );
    const runtimeConfigurationAssociation = new ssm.CfnAssociation(
      this,
      'ApplicationRuntimeConfigurationAssociation',
      {
        name: runtimeConfigurationDocument.ref,
        associationName: 'gachisallim-application-runtime-configuration',
        documentVersion: '$LATEST',
        parameters: { ConfigurationVersion: [runtimeConfigurationVersion] },
        targets: [{ key: 'InstanceIds', values: [instance.instanceId] }],
        waitForSuccessTimeoutSeconds: 600,
      },
    );
    runtimeConfigurationAssociation.addDependency(runtimeConfigurationDocument);

    const targetGroups = new Map<string, elbv2.ApplicationTargetGroup>();
    for (const environment of RUNTIME_ENVIRONMENTS) {
      targetGroups.set(
        environment.branch,
        new elbv2.ApplicationTargetGroup(this, `${environment.id}TargetGroup`, {
          vpc,
          protocol: elbv2.ApplicationProtocol.HTTP,
          port: environment.port,
          targets: [new elbv2Targets.InstanceTarget(instance, environment.port)],
          healthCheck: {
            path: '/api/v1/health',
            healthyHttpCodes: '200',
          },
        }),
      );
    }

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: loadBalancerSecurityGroup,
      idleTimeout: Duration.seconds(120),
    });
    loadBalancer.addRedirect({
      sourceProtocol: elbv2.ApplicationProtocol.HTTP,
      sourcePort: 80,
      targetProtocol: elbv2.ApplicationProtocol.HTTPS,
      targetPort: 443,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: PRODUCTION_DOMAIN,
      subjectAlternativeNames: [DEVELOPMENT_DOMAIN],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    const httpsListener = loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'application/json',
        messageBody: '{"message":"Not Found"}',
      }),
    });

    for (const [index, environment] of RUNTIME_ENVIRONMENTS.entries()) {
      const priorityOffset = index * 100;
      const targetGroup = targetGroups.get(environment.branch)!;
      const auth = authentication.get(environment.branch)!;
      const hostCondition = elbv2.ListenerCondition.hostHeaders([environment.domain]);

      httpsListener.addAction(`${environment.id}PublicAuthRoutes`, {
        priority: priorityOffset + 10,
        conditions: [
          hostCondition,
          elbv2.ListenerCondition.pathPatterns([
            '/api/v1/auth/signup',
            '/api/v1/auth/signup/confirm',
          ]),
          elbv2.ListenerCondition.httpRequestMethods(['POST']),
        ],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
      httpsListener.addAction(`${environment.id}PublicSessionRoutes`, {
        priority: priorityOffset + 11,
        conditions: [
          hostCondition,
          elbv2.ListenerCondition.pathPatterns([
            '/api/v1/auth/login',
            '/api/v1/auth/token/refresh',
          ]),
          elbv2.ListenerCondition.httpRequestMethods(['POST']),
        ],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
      httpsListener.addAction(`${environment.id}PublicPasswordResetRoutes`, {
        priority: priorityOffset + 12,
        conditions: [
          hostCondition,
          elbv2.ListenerCondition.pathPatterns([
            '/api/v1/auth/password/forgot',
            '/api/v1/auth/password/reset',
          ]),
          elbv2.ListenerCondition.httpRequestMethods(['POST']),
        ],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
      httpsListener.addAction(`${environment.id}PublicHealth`, {
        priority: priorityOffset + 20,
        conditions: [
          hostCondition,
          elbv2.ListenerCondition.pathPatterns(['/api/v1/health']),
          elbv2.ListenerCondition.httpRequestMethods(['GET']),
        ],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
      if (environment.branch === 'develop') {
        httpsListener.addAction('DevelopmentPublicSwagger', {
          priority: priorityOffset + 21,
          conditions: [
            hostCondition,
            elbv2.ListenerCondition.pathPatterns(['/api-docs', '/api-docs/*', '/api-docs-json']),
            elbv2.ListenerCondition.httpRequestMethods(['GET']),
          ],
          action: elbv2.ListenerAction.forward([targetGroup]),
        });
      }
      httpsListener.addAction(`${environment.id}CorsPreflight`, {
        priority: priorityOffset + 30,
        conditions: [hostCondition, elbv2.ListenerCondition.httpRequestMethods(['OPTIONS'])],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
      httpsListener.addAction(`${environment.id}SocketIo`, {
        priority: priorityOffset + 40,
        conditions: [hostCondition, elbv2.ListenerCondition.pathPatterns(['/socket.io/*'])],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
      const protectedRule = new elbv2.ApplicationListenerRule(
        this,
        `${environment.id}ProtectedRoutes`,
        {
          listener: httpsListener,
          priority: priorityOffset + 50,
          conditions: [hostCondition],
          action: elbv2.ListenerAction.authenticateJwt({
            issuer: auth.issuer,
            jwksEndpoint: auth.jwksEndpoint,
            next: elbv2.ListenerAction.forward([targetGroup]),
          }),
        },
      );
      const cfnProtectedRule = protectedRule.node.defaultChild as elbv2.CfnListenerRule;
      cfnProtectedRule.addPropertyOverride('Actions.0.JwtValidationConfig.AdditionalClaims', [
        {
          Format: 'single-string',
          Name: 'token_use',
          Values: ['access'],
        },
        {
          Format: 'single-string',
          Name: 'client_id',
          Values: [auth.client.userPoolClientId],
        },
      ]);

      new route53.ARecord(this, `${environment.id}AliasRecord`, {
        zone: hostedZone,
        recordName: environment.domain,
        target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(loadBalancer)),
      });

      new CfnOutput(this, `${environment.id}ApplicationUrl`, {
        value: `https://${environment.domain}`,
      });
      new CfnOutput(this, `${environment.id}UserPoolId`, {
        value: auth.pool.userPoolId,
      });
      new CfnOutput(this, `${environment.id}UserPoolClientId`, {
        value: auth.client.userPoolClientId,
      });
      new CfnOutput(this, `${environment.id}CognitoIssuerUrl`, {
        value: auth.issuer,
      });
      new CfnOutput(this, `${environment.id}CognitoDomainUrl`, {
        value: auth.domain.baseUrl(),
      });
      new CfnOutput(this, `${environment.id}CognitoIdpResponseUrl`, {
        value: `${auth.domain.baseUrl()}/oauth2/idpresponse`,
      });
      new CfnOutput(this, `${environment.id}NotificationPushQueueUrl`, {
        value: notificationPushQueues.get(environment.branch)!.queueUrl,
      });
      new CfnOutput(this, `${environment.id}NotificationPushResultQueueUrl`, {
        value: notificationPushResultQueues.get(environment.branch)!.queueUrl,
      });
      new CfnOutput(this, `${environment.id}NotificationCommandQueueUrl`, {
        value: notificationCommandQueues.get(environment.branch)!.queueUrl,
      });
      new CfnOutput(this, `${environment.id}ChoreDueScheduleGroupName`, {
        value: choreDueScheduleGroups.get(environment.branch)!.name!,
      });
    }

    new CfnOutput(this, 'LoadBalancerDnsName', {
      value: loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
    });
    new CfnOutput(this, 'DatabaseEndpoint', {
      value: database.dbInstanceEndpointAddress,
    });
    new CfnOutput(this, 'DatabaseSecretArn', {
      value: databaseSecret.secretArn,
    });
    new CfnOutput(this, 'ApplicationLogGroupName', {
      value: applicationLogGroup.logGroupName,
    });
  }
}
