import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('check-ses-production-access.sh', () => {
  const script = resolve(__dirname, 'check-ses-production-access.sh');

  it('allows deployment when SES production access is enabled', () => {
    const result = runWithAwsOutput('True');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SES production access is enabled in ap-northeast-2.');
  });

  it('blocks deployment while the SES account is in the sandbox', () => {
    const result = runWithAwsOutput('False');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SES production access is required in ap-northeast-2');
  });

  it('blocks deployment when the SES account cannot be checked', () => {
    const result = runWithAwsOutput('', 2);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unable to verify SES production access');
  });

  it('gates generic and backend CDK deployments with the SES check', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['cdk:deploy']).toContain('ses:check-production-access');
    expect(packageJson.scripts['cdk:deploy:backend']).toContain('ses:check-production-access');
    expect(packageJson.scripts['cdk:deploy:foundation']).not.toContain(
      'ses:check-production-access',
    );
  });

  function runWithAwsOutput(output: string, exitCode = 0) {
    const binDirectory = mkdtempSync(join(tmpdir(), 'ses-production-access-'));
    const awsStub = join(binDirectory, 'aws');
    writeFileSync(
      awsStub,
      `#!/usr/bin/env bash\nprintf '%s\\n' '${output}'\nexit ${exitCode}\n`,
    );
    chmodSync(awsStub, 0o755);

    try {
      return spawnSync('bash', [script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          AWS_REGION: 'ap-northeast-2',
          PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
        },
      });
    } finally {
      rmSync(binDirectory, { recursive: true, force: true });
    }
  }
});
