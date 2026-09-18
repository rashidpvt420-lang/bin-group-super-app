import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/repair-frozen-sovereign-ai-runtime.yml', import.meta.url);
const probeUrl = new URL('../../scripts/verify-ai-live-privacy-repair.mjs', import.meta.url);

const read = async (url) => readFile(url, 'utf8');

test('frozen Sovereign AI repair stays isolated from hard-launch evidence', async () => {
  const workflow = await read(workflowUrl);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /FROZEN_RELEASE_SHA: 26b3609457fa80a70db56767db7c85be01d7b015/);
  assert.match(workflow, /git ls-remote --exit-code origin refs\/heads\/main/);
  assert.match(workflow, /firebase deploy --only functions:runSovereignAI/);
  assert.match(workflow, /verify-ai-live-privacy-repair\.mjs/);
  assert.doesNotMatch(workflow, /verify-ai-live-evidence\.mjs/);
  assert.doesNotMatch(workflow, /PRODUCTION_DEPLOY_RUN_ID/);
  assert.doesNotMatch(workflow, /VALIDATED_ARTIFACT_DIGEST/);
});

test('repair-only live privacy probe is protected, real, and non-publishing', async () => {
  const probe = await read(probeUrl);
  assert.match(probe, /GITHUB_ACTIONS !== 'true'/);
  assert.match(probe, /GITHUB_EVENT_NAME !== 'workflow_dispatch'/);
  assert.match(probe, /GITHUB_REF !== 'refs\/heads\/main'/);
  assert.match(probe, /EXPECTED_WORKFLOW = 'Repair Frozen Sovereign AI Runtime'/);
  assert.match(probe, /EXPECTED_FROZEN_RELEASE_SHA = '26b3609457fa80a70db56767db7c85be01d7b015'/);
  assert.match(probe, /execFileSync\('git', \['rev-parse', 'HEAD'\]/);
  assert.match(probe, /exchangeAppCheckToken/);
  assert.match(probe, /createCustomToken/);
  assert.match(probe, /ai-privacy-repair-/);
  assert.match(probe, /provider: 'gemini'|\['gemini', 'openai'\]/);
  assert.match(probe, /redactionsApplied < 4/);
  assert.match(probe, /echoed a protected test identifier/);
  assert.match(probe, /removeOwnedFirestore/);
  assert.match(probe, /deleteUser\(uid\)/);
  assert.match(probe, /minimumRedactionsObserved/);
  assert.doesNotMatch(probe, /launch_package\/ai-provider-health-proof\.json/);
  assert.doesNotMatch(probe, /PRODUCTION_DEPLOY_RUN_ID/);
  assert.doesNotMatch(probe, /VALIDATED_ARTIFACT_DIGEST/);
});
