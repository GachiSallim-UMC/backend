import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe.each(['deploy-release.sh', 'bootstrap-deploy-release.sh'])('%s', (scriptName) => {
  const script = readFileSync(join(__dirname, scriptName), 'utf8');

  it('copies profile image configuration into the systemd environment file', () => {
    expect(script).toContain('PROFILE_IMAGE_BUCKET=${PROFILE_IMAGE_BUCKET}');
    expect(script).toContain('PROFILE_IMAGE_OBJECT_PREFIX=${PROFILE_IMAGE_OBJECT_PREFIX}');
    expect(script).toContain('PROFILE_IMAGE_PUBLIC_BASE_URL=${PROFILE_IMAGE_PUBLIC_BASE_URL}');
  });
});
