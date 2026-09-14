import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../../.github/workflows/operational-application-evidence.yml', import.meta.url);

test('repair-and-sync payment evidence continues in production after verified credential repair', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(
    workflow,
    /environment:\s*\$\{\{ \(inputs\.founder_totp_operation == 'verify' \|\| inputs\.founder_totp_operation == 'repair-and-sync'\) && 'production' \|\| 'hard-public-launch' \}\}/,
  );
});
