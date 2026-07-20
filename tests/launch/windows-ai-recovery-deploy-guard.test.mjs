import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../scripts/windows-ai-live-recovery.ps1', import.meta.url),
  'utf8',
);
const focusedWorkflow = await readFile(
  new URL('../../.github/workflows/five-profile-onboarding-audit.yml', import.meta.url),
  'utf8',
);

const guardPath = 'tests/launch/windows-ai-recovery-deploy-guard.test.mjs';

test('Windows AI recovery script cannot bypass protected production deployment', () => {
  assert.doesNotMatch(source, /^\s*firebase\s+deploy\b/im);
  assert.doesNotMatch(source, /--only\s+hosting/i);
  assert.doesNotMatch(source, /--only\s+functions:/i);
  assert.match(source, /No Firebase deployment was performed/i);
  assert.match(source, /START HERE - Firebase Production Deploy/i);
});

test('Windows AI recovery preflight is exact-main and deterministic', () => {
  assert.match(source, /git fetch origin main --quiet/i);
  assert.match(source, /git rev-parse HEAD/i);
  assert.match(source, /git rev-parse origin\/main/i);
  assert.match(source, /\$headSha -ne \$originMainSha/i);
  assert.match(source, /npm ci --include=optional --legacy-peer-deps/i);
  assert.doesNotMatch(source, /^\s*npm\s+install\b/im);
  assert.doesNotMatch(source, /VITE_SKIP_MINIFY/i);
});

test('secret mutation is explicit and does not imply deployment', () => {
  assert.match(source, /\[switch\]\$ConfigureSecrets/i);
  assert.match(source, /if \(\$ConfigureSecrets\)/i);
  assert.match(source, /functions:secrets:set OPENAI_API_KEY/i);
  assert.match(source, /functions:secrets:set IMAGE_GENERATION_API_KEY/i);
  assert.match(source, /functions:secrets:set GEMINI_API_KEY/i);
});

test('focused launch audit cannot silently drop the Windows AI deployment guard', () => {
  const occurrences = focusedWorkflow.split(guardPath).length - 1;
  assert.equal(
    occurrences,
    2,
    'focused audit must include the guard in both pull-request path filters and the node --test command',
  );
  assert.match(focusedWorkflow, /scripts\/windows-ai-live-recovery\.ps1/i);
});
