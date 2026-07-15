import {
  Aws,
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2Targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

const APPLICATION_PORT = 3000;
const DATABASE_PORT = 5432;

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const applicationDomain = new CfnParameter(this, 'ApplicationDomain', {
      type: 'String',
      description: 'Lowercase DNS name used to access the backend.',
      allowedPattern: '^[a-z0-9.-]+$',
    });
    const certificateArn = new CfnParameter(this, 'CertificateArn', {
      type: 'String',
      description: 'ARN of an ACM certificate for ApplicationDomain.',
    });

    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Ingress',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Backend',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
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
      'Allows HTTPS access to the Cognito JWKS endpoint.',
    );

    const applicationSecurityGroup = new ec2.SecurityGroup(this, 'ApplicationSecurityGroup', {
      vpc,
      allowAllOutbound: false,
      description: 'Allows backend traffic only from the load balancer.',
    });
    applicationSecurityGroup.addIngressRule(
      loadBalancerSecurityGroup,
      ec2.Port.tcp(APPLICATION_PORT),
    );
    loadBalancerSecurityGroup.addEgressRule(
      applicationSecurityGroup,
      ec2.Port.tcp(APPLICATION_PORT),
    );

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
    applicationSecurityGroup.addEgressRule(endpointSecurityGroup, ec2.Port.tcp(443));

    const backendSubnets: ec2.SubnetSelection = {
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    };
    const applicationSubnet: ec2.SubnetSelection = {
      subnets: [vpc.isolatedSubnets[0]],
    };
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: applicationSubnet,
      securityGroups: [endpointSecurityGroup],
      open: false,
      privateDnsEnabled: true,
    });
    vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: applicationSubnet,
      securityGroups: [endpointSecurityGroup],
      open: false,
      privateDnsEnabled: true,
    });
    vpc.addInterfaceEndpoint('CognitoEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      subnets: applicationSubnet,
      securityGroups: [endpointSecurityGroup],
      open: false,
      privateDnsEnabled: true,
    });

    const applicationLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
      logGroupName: '/gachisallim/backend/application',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

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

    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Allows the backend instance to read its secret and write application logs.',
    });
    const databaseSecret = database.secret!;
    databaseSecret.grantRead(instanceRole);
    applicationLogGroup.grantWrite(instanceRole);

    const instance = new ec2.Instance(this, 'ApplicationInstance', {
      vpc,
      vpcSubnets: applicationSubnet,
      securityGroup: applicationSecurityGroup,
      role: instanceRole,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      associatePublicIpAddress: false,
      requireImdsv2: true,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: APPLICATION_PORT,
      targets: [new elbv2Targets.InstanceTarget(instance, APPLICATION_PORT)],
      healthCheck: {
        path: '/api/v1/health',
        healthyHttpCodes: '200',
      },
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'gachisallim-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
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
    const userPoolClient = userPool.addClient('UserPoolClient', {
      userPoolClientName: 'gachisallim-web',
      generateSecret: false,
      disableOAuth: true,
      authFlows: {
        userPassword: true,
      },
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
    });
    const cognitoIssuer = `https://cognito-idp.${Aws.REGION}.${Aws.URL_SUFFIX}/${userPool.userPoolId}`;
    const cognitoJwksEndpoint = `${cognitoIssuer}/.well-known/jwks.json`;

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

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      certificateArn.valueAsString,
    );
    const httpsListener = loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elbv2.ListenerAction.authenticateJwt({
        issuer: cognitoIssuer,
        jwksEndpoint: cognitoJwksEndpoint,
        next: elbv2.ListenerAction.forward([targetGroup]),
      }),
    });
    const cfnHttpsListener = httpsListener.node.defaultChild as elbv2.CfnListener;
    cfnHttpsListener.addPropertyOverride('DefaultActions.0.JwtValidationConfig.AdditionalClaims', [
      {
        Format: 'single-string',
        Name: 'token_use',
        Values: ['access'],
      },
      {
        Format: 'single-string',
        Name: 'client_id',
        Values: [userPoolClient.userPoolClientId],
      },
    ]);

    httpsListener.addAction('PublicAuthRoutes', {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns([
          '/api/v1/auth/signup',
          '/api/v1/auth/signup/confirm',
        ]),
        elbv2.ListenerCondition.httpRequestMethods(['POST']),
      ],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });
    httpsListener.addAction('PublicSessionRoutes', {
      priority: 11,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/api/v1/auth/login', '/api/v1/auth/token/refresh']),
        elbv2.ListenerCondition.httpRequestMethods(['POST']),
      ],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });
    httpsListener.addAction('PublicHealth', {
      priority: 20,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/api/v1/health']),
        elbv2.ListenerCondition.httpRequestMethods(['GET']),
      ],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });
    httpsListener.addAction('CorsPreflight', {
      priority: 30,
      conditions: [elbv2.ListenerCondition.httpRequestMethods(['OPTIONS'])],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });
    httpsListener.addAction('SocketIo', {
      priority: 40,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/socket.io/*'])],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    new CfnOutput(this, 'LoadBalancerDnsName', {
      value: loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, 'ApplicationUrl', {
      value: `https://${applicationDomain.valueAsString}`,
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
    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, 'CognitoIssuerUrl', {
      value: cognitoIssuer,
    });
    new CfnOutput(this, 'ApplicationLogGroupName', {
      value: applicationLogGroup.logGroupName,
    });
  }
}
