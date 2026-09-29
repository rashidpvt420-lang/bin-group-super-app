import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('design concept compatibility charges quota only after a live render', () => {
  const source = read('functions/aiDesignStudioCompat.ts');
  const keyCheck = source.indexOf('if (!apiKey)');
  const reserve = source.indexOf('await reserveAiUsageQuota');
  const settleTrue = source.indexOf('settleAiUsageQuota(quota, true)');
  const settleFalse = source.indexOf('settleAiUsageQuota(quota, false)');
  assert.ok(keyCheck >= 0 && reserve > keyCheck, 'missing image key must fail before a design reservation');
  assert.ok(settleTrue > reserve && settleFalse > settleTrue, 'a failed render must release the reservation');
  assert.doesNotMatch(source, /enforceAiUsageQuota/);
});

test('public design requests reserve quota only after validation and release on failure', () => {
  const source = read('functions/aiDesignStudio.ts');
  const idempotent = source.indexOf('idempotent: true');
  const reserve = source.indexOf('await reserveAiUsageQuota');
  const missingKey = source.indexOf('AI image generation is not configured');
  const missingOwner = source.indexOf('The canonical property owner could not be resolved');
  assert.ok(idempotent >= 0 && reserve > idempotent, 'an idempotent replay must not reserve design quota');
  assert.ok(missingKey > 0 && reserve > missingKey, 'a missing image key must not reserve design quota');
  assert.ok(missingOwner > 0 && reserve > missingOwner, 'a missing owner must not reserve design quota');
  assert.match(source, /settleAiUsageQuota\(quota, true\)/);
  assert.match(source, /settleAiUsageQuota\(quota, false\)/);
});

test('mission guidance charges the 12 chat units only for a live provider', () => {
  const source = read('functions/missionGuidanceV2.ts');
  assert.match(source, /reserveAiUsageQuota\(request\.auth, "chat", ALLOWED_ROLES, 12\)/);
  assert.match(source, /provider === "gemini" \|\| provider === "openai"/);
  assert.match(source, /settleAiUsageQuota\(quota, true\)/);
  assert.match(source, /settleAiUsageQuota\(quota, false\)/);
  assert.doesNotMatch(source, /enforceAiUsageQuota/);
});
