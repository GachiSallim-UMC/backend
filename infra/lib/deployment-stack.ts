import { Aws, CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

const GITHUB_REPOSITORY = 'GachiSallim-UMC/backend';
const GITHUB_OIDC_PROVIDER_ARN =
  'arn:aws:iam::585384908164:oidc-provider/token.actions.githubusercontent.com';

interface DeploymentEnvironment {
  readonly branch: 'main' | 'develop';
  readonly githubEnvironment: 'production' | 'development';
  readonly id: 'Main' | 'Develop';
}

const DEPLOYMENT_ENVIRONMENTS: DeploymentEnvironment[] = [
  { branch: 'main', githubEnvironment: 'production', id: 'Main' },
  { branch: 'develop', githubEnvironment: 'development', id: 'Develop' },
];

export class DeploymentStack extends Stack {
  readonly artifactBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `gachisallim-deployments-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'ExpireOldReleases',
          expiration: Duration.days(30),
          prefix: 'releases/',
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubProvider',
      GITHUB_OIDC_PROVIDER_ARN,
    );

    new CfnOutput(this, 'ArtifactBucketName', {
      value: this.artifactBucket.bucketName,
    });

    for (const environment of DEPLOYMENT_ENVIRONMENTS) {
      const document = new ssm.CfnDocument(this, `${environment.id}DeployDocument`, {
        documentType: 'Command',
        name: `GachiSallimDeploy${environment.id}`,
        content: {
          schemaVersion: '2.2',
          description: `Deploys the ${environment.branch} GachiSallim release.`,
          parameters: {
            CommitSha: {
              type: 'String',
              allowedPattern: '^[0-9a-f]{40}$',
              description: 'Full Git commit SHA of the release.',
            },
          },
          mainSteps: [
            {
              action: 'aws:runShellScript',
              name: 'deployRelease',
              inputs: {
                timeoutSeconds: '900',
                runCommand: [
                  `/usr/local/bin/gachisallim-deploy ${environment.branch} {{ CommitSha }}`,
                ],
              },
            },
          ],
        },
      });

      const role = new iam.Role(this, `${environment.id}GitHubDeployRole`, {
        roleName: `GachiSallimGitHubDeploy${environment.id}`,
        assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPOSITORY}:environment:${environment.githubEnvironment}`,
          },
        }),
        description: `Allows ${environment.githubEnvironment} GitHub Actions deployments.`,
        maxSessionDuration: Duration.hours(1),
      });

      role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['s3:AbortMultipartUpload', 's3:PutObject'],
          resources: [this.artifactBucket.arnForObjects(`releases/${environment.branch}/*`)],
        }),
      );
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['ssm:SendCommand'],
          resources: [
            Stack.of(this).formatArn({
              service: 'ssm',
              resource: 'document',
              resourceName: document.ref,
            }),
          ],
        }),
      );
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['ssm:SendCommand'],
          resources: [
            Stack.of(this).formatArn({
              service: 'ec2',
              resource: 'instance',
              resourceName: '*',
            }),
          ],
          conditions: {
            StringEquals: {
              'ssm:resourceTag/GachiSallimDeploymentTarget': 'true',
            },
          },
        }),
      );
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['ec2:DescribeInstances', 'ssm:GetCommandInvocation'],
          resources: ['*'],
        }),
      );

      new CfnOutput(this, `${environment.id}DeployRoleArn`, {
        value: role.roleArn,
      });
    }
  }
}
