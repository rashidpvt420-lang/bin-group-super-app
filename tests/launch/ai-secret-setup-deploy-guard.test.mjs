import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const setupScript = await readFile(
  new URL('../../scripts/setup-ai-secrets.ps1', import.meta.url),
  'utf8',
);
const focusedWorkflow = await readFile(
  new URL('../../.github/workflows/five-profile-onboarding-audit.yml', import.meta.url),
  'utf8',
);

const guardPath = 'tests/launch/ai-secret-setup-deploy-guard.test.mjs';

test('AI secret setup cannot deploy production code', () => {
  assert.doesNotMatch(setupScript, /^\s*firebase\s+deploy\b/im);
  assert.doesNotMatch(setupScript, /--only\s+hosting/i);
  assert.doesNotMatch(setupScript, /--only\s+functions:/i);
  assert.match(setupScript, /No Firebase deployment was performed/i);
  assert.match(setupScript, /START HERE - Firebase Production Deploy/i);
});

test('AI secret mutation requires an explicit exact-main preflight', () => {
  assert.match(setupScript, /\[switch\]\$ConfigureSecrets/i);
  assert.match(setupScript, /if \(-not \$ConfigureSecrets\)/i);
  assert.match(setupScript, /git fetch origin main --quiet/i);
  assert.match(setupScript, /git rev-parse HEAD/i);
  assert.match(setupScript, /git rev-parse origin\/main/i);
  assert.match(setupScript, /\$headSha -ne \$originMainSha/i);
  assert.match(setupScript, /npm ci --include=optional --legacy-peer-deps/i);
  assert.match(setupScript, /npm run build:functions/i);
  assert.doesNotMatch(setupScript, /^\s*npm\s+install\b/im);
});

test('focused launch audit cannot silently drop the AI secret deployment guard', () => {
  const occurrences = focusedWorkflow.split(guardPath).length - 1;
  assert.equal(
    occurrences,
    2,
    'focused audit must include the AI secret guard in both path filters and the node --test command',
  );
  assert.match(focusedWorkflow, /scripts\/setup-ai-secrets\.ps1/i);
});
