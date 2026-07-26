import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('AI quota is reserved before providers and charged only on live success', () => {
  const quota = read('functions/aiUsageQuota.ts');
  const assistant = read('functions/aiAssistant.ts');
  const damage = read('functions/damageAssessment.ts');

  assert.match(quota, /reserveAiUsageQuota/);
  assert.match(quota, /settleAiUsageQuota/);
  assert.match(quota, /reservations/);
  assert.match(quota, /transaction\.update\(ref, \{/);
  assert.match(assistant, /settleAiUsageQuota\(quota, true\)/);
  assert.match(assistant, /settleAiUsageQuota\(quota, false\)/);
  assert.match(damage, /settleAiUsageQuota\(quota, true\)/);
  assert.match(damage, /settleAiUsageQuota\(quota, false\)/);
  assert.doesNotMatch(assistant, /enforceAiUsageQuota/);
  assert.doesNotMatch(damage, /enforceAiUsageQuota/);
});

test('AI privacy scanner covers free text and nested innocent-looking fields', () => {
  const safety = read('functions/aiSafety.ts');
  const assistant = read('functions/aiAssistant.ts');
  const damage = read('functions/damageAssessment.ts');

  assert.match(safety, /redactSensitiveText/);
  assert.match(safety, /AE\(\?:\[\\s-\]\?\\d\)\{21\}/);
  assert.match(safety, /784\[-\\s\]\?\\d\{4\}/);
  assert.match(safety, /A-Z0-9\._%\+\-/);
  assert.match(safety, /sanitizeRecursive/);
  assert.match(assistant, /redactSensitiveText\(/);
  assert.match(assistant, /safeExternalAiJson\(data\?\.pageContext/);
  assert.match(damage, /redactSensitiveText\(notes/);
});

test('Sovereign AI exposes healthy, degraded, and callable-error states honestly', () => {
  const assistant = read('functions/aiAssistant.ts');
  const chat = read('packages/shared/src/components/SovereignAIChat.tsx');

  assert.match(assistant, /operationalStatus: "healthy"/);
  assert.match(assistant, /operationalStatus: "degraded"/);
  assert.match(assistant, /provider: "rule-based-fallback"/);
  assert.match(assistant, /clientContextAuthoritative: false/);
  assert.match(assistant, /advisoryOnly: true/);
  assert.match(chat, /AI SERVICE ERROR — NO LIVE ANSWER/);
  assert.match(chat, /DEGRADED ·/);
  assert.match(chat, /ADVISORY ONLY · APPROVALS, PAYMENTS, ASSIGNMENTS, QUOTATIONS AND COMPLIANCE REMAIN SERVER-AUTHORITATIVE/);
  assert.doesNotMatch(chat, /I can still guide you with deterministic platform rules/);
});

test('damage assessment is strict, App Check protected, and never returns fallback success or quotation', () => {
  const damage = read('functions/damageAssessment.ts');
  const page = read('src/owner/pages/OwnerDamageEstimatePage.tsx');

  assert.match(damage, /enforceAppCheck: true/);
  assert.match(damage, /responseSchema: GEMINI_DAMAGE_SCHEMA/);
  assert.match(damage, /type: "json_schema"/);
  assert.match(damage, /validateDamageAssessment/);
  assert.match(damage, /additionalProperties: false/);
  assert.match(damage, /success: false/);
  assert.match(damage, /estimatedCostMin: null/);
  assert.match(damage, /commercialStatus: "NOT_A_QUOTATION"/);
  assert.doesNotMatch(damage, /success: true,[\s\S]{0,300}provider: "rule-based-fallback"/);
  assert.match(page, /AI PRE-SCREEN · NOT INSPECTED · NOT A QUOTATION/);
  assert.match(page, /INDICATIVE PLANNING RANGE/);
  assert.match(page, /Request On-Site Inspection/);
  assert.match(page, /data\.success !== true/);
});

test('AI provider evidence is exact-SHA, deployment-bound, protected, and hard-launch mandatory', () => {
  const workflow = read('.github/workflows/operational-provider-evidence.yml');
  const verifier = read('scripts/verify-ai-live-evidence.mjs');
  const publisher = read('scripts/publish-operational-provider-evidence.mjs');
  const finalizer = read('scripts/finalize-operational-provider-evidence.mjs');
  const gate = read('scripts/lib/hard-launch-gate.mjs');

  assert.match(workflow, /aiProviderHealth/);
  assert.match(workflow, /production-deployment-\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /verify-ai-live-evidence\.mjs/);
  assert.match(workflow, /environment: hard-public-launch/);
  assert.match(verifier, /provider: 'gemini'/);
  assert.match(verifier, /provider: 'openai'/);
  assert.match(verifier, /invalid App Check token/);
  assert.match(verifier, /rejectedAttemptUncharged/);
  assert.match(verifier, /providerSuccessRate/);
  assert.match(verifier, /measuredProviderUsageRequired/);
  assert.match(verifier, /maxBudgetEnvelopeAedMicrosPerChatRequest/);
  assert.match(publisher, /AI SLO .*missing or non-numeric/);
  assert.match(publisher, /measured token\/cost evidence invalid/);
  assert.match(finalizer, /aiProviderHealth: 'workflow-artifact'/);
  assert.match(gate, /'aiProviderHealth'/);
});

test('AI observability records non-PII aggregate SLO, token and cost-envelope metrics', () => {
  const observability = read('functions/aiObservability.ts');
  const assistant = read('functions/aiAssistant.ts');
  assert.match(observability, /ai_health_daily/);
  assert.match(observability, /liveSuccesses/);
  assert.match(observability, /degradedFallbacks/);
  assert.match(observability, /functionErrors/);
  assert.match(observability, /providerFailures/);
  assert.match(observability, /invalidOutputs/);
  assert.match(observability, /redactionsApplied/);
  assert.match(observability, /quotaCharged/);
  assert.match(observability, /inputTokens/);
  assert.match(observability, /outputTokens/);
  assert.match(observability, /totalTokens/);
  assert.match(observability, /budgetEnvelopeAedMicros/);
  assert.match(observability, /tokenBudgetBreaches/);
  assert.match(observability, /costEnvelopeBreaches/);
  assert.match(assistant, /usageMetadata\?\.totalTokenCount/);
  assert.match(assistant, /usage\?\.total_tokens/);
  assert.match(assistant, /sloTokenBudgetMet: true/);
  assert.match(assistant, /sloCostEnvelopeMet: true/);
  assert.doesNotMatch(observability, /metric\.(?:uid|email|phone|prompt|message)/i);
  assert.doesNotMatch(observability, /collection\("users"\)/);
});
