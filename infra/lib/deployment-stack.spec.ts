import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { DeploymentStack } from './deployment-stack';

describe('DeploymentStack', () => {
  const app = new App();
  const stack = new DeploymentStack(app, 'TestDeploymentStack', {
    env: { account: '585384908164', region: 'ap-northeast-2' },
  });
  const template = Template.fromStack(stack);

  it('stores immutable release bundles in a private retained bucket', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ ExpirationInDays: 30, Prefix: 'releases/', Status: 'Enabled' }),
        ]),
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('trusts only the repository production and development environments through OIDC', () => {
    const roles = JSON.stringify(template.findResources('AWS::IAM::Role'));

    expect(roles).toContain('sts:AssumeRoleWithWebIdentity');
    expect(roles).toContain('token.actions.githubusercontent.com:aud');
    expect(roles).toContain('sts.amazonaws.com');
    expect(roles).toContain('repo:GachiSallim-UMC/backend:environment:production');
    expect(roles).toContain('repo:GachiSallim-UMC/backend:environment:development');
  });

  it('creates fixed main and develop deployment documents', () => {
    template.hasResourceProperties('AWS::SSM::Document', {
      Name: 'GachiSallimDeployMain',
      DocumentType: 'Command',
      Content: Match.objectLike({
        parameters: {
          CommitSha: Match.objectLike({ allowedPattern: '^[0-9a-f]{40}$' }),
        },
      }),
    });
    template.hasResourceProperties('AWS::SSM::Document', {
      Name: 'GachiSallimDeployDevelop',
      DocumentType: 'Command',
    });
    template.hasOutput('ArtifactBucketName', { Value: Match.anyValue() });
    template.hasOutput('MainDeployRoleArn', { Value: Match.anyValue() });
    template.hasOutput('DevelopDeployRoleArn', { Value: Match.anyValue() });
  });
});
