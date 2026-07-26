import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('functions/aiAssistant.ts', 'utf8');

test('Sovereign AI remains App Check protected, authenticated and advisory only', () => {
  assert.match(source, /enforceAppCheck: true/);
  assert.match(source, /if \(!request\.auth\?\.uid\)/);
  assert.match(source, /advisoryOnly: true/);
  assert.match(source, /clientContextAuthoritative: false/);
  assert.match(source, /Never approve or reject payments/);
});

test('complete provider retry chain is bounded below the live latency SLO', () => {
  assert.match(source, /LIVE_PROVIDER_BUDGET_MS = Math\.min\(18_000, AI_OPERATIONAL_SLO\.maxLiveLatencyMs - 1_000\)/);
  assert.match(source, /PER_MODEL_TIMEOUT_MS = 6_000/);
  assert.match(source, /providerDeadlineMs = startedAt \+ LIVE_PROVIDER_BUDGET_MS/);
  assert.match(source, /attemptTimeoutMs\(providerDeadlineMs\)/);
  assert.match(source, /remainingBudgetMs\(providerDeadlineMs\) >= MIN_PROVIDER_ATTEMPT_MS/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => controller\.abort\(\), 8_000\)/);
  assert.doesNotMatch(source, /new OpenAI\(\{ apiKey, timeout: 8_000 \}\)/);
});

test('AI provider SDK retries are disabled and quota release remains fail closed', () => {
  assert.match(source, /maxRetries: 0/);
  assert.match(source, /settleAiUsageQuota\(quota, false\)/);
  assert.match(source, /operationalStatus: "degraded"/);
  assert.match(source, /No live AI answer was produced/);
});
