import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertAiEvidenceIdentitySeparation,
  transformFrozenAiVerifier,
} from '../../scripts/run-frozen-release-evidence.mjs';

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
  const rootChat = read('src/components/SovereignAIChat.tsx');

  assert.match(assistant, /operationalStatus: "healthy"/);
  assert.match(assistant, /operationalStatus: "degraded"/);
  assert.match(assistant, /provider: "rule-based-fallback"/);
  assert.match(assistant, /clientContextAuthoritative: false/);
  assert.match(assistant, /advisoryOnly: true/);
  assert.match(chat, /AI SERVICE ERROR — NO LIVE ANSWER/);
  assert.match(chat, /DEGRADED ·/);
  assert.match(chat, /ADVISORY ONLY · APPROVALS, PAYMENTS, ASSIGNMENTS, QUOTATIONS AND COMPLIANCE REMAIN SERVER-AUTHORITATIVE/);
  assert.doesNotMatch(chat, /I can still guide you with deterministic platform rules/);
  assert.match(rootChat, /AI SERVICE ERROR — NO LIVE ANSWER/);
  assert.match(rootChat, /DEGRADED AI - LOCAL RULE GUIDANCE ONLY/);
  assert.match(rootChat, /LOCAL GUIDANCE — NOT AI OR AUTHORITATIVE/);
  assert.match(rootChat, /ADVISORY ASSISTANT .* PROVIDER STATUS SHOWN/);
  assert.match(rootChat, /AUTHENTICATED SESSION .* STATUS SHOWN/);
  assert.match(rootChat, /LOCAL GUIDANCE ONLY .* SIGN IN FOR LIVE AI/);
  assert.doesNotMatch(rootChat, /LIVE PROPERTY TRUTH ASSISTANT/);
  assert.doesNotMatch(rootChat, /LIVE PROPERTY TRUTH SESSION/);
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
  assert.match(workflow, /production-deployment-\$\{\{ inputs\.frozen_release_sha \}\}/);
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

test('frozen AI evidence uses an exact-run disposable Admin and never the Founder quota identity', () => {
  const wrapper = read('scripts/run-frozen-release-evidence.mjs');
  const workflow = read('.github/workflows/operational-provider-evidence.yml');
  const originalBinding = 'const adminEmail = text(process.env.E2E_ADMIN_EMAIL).toLowerCase();';
  const adapted = transformFrozenAiVerifier(originalBinding);

  assert.equal(adapted, 'const adminEmail = text(process.env.AI_EVIDENCE_ADMIN_EMAIL).toLowerCase();');
  assert.throws(
    () => transformFrozenAiVerifier('const adminEmail = text(process.env.OTHER_EMAIL).toLowerCase();'),
    /source drift/,
  );
  assert.doesNotThrow(() => assertAiEvidenceIdentitySeparation({
    E2E_ADMIN_EMAIL: 'e2e-admin@example.test',
    AI_EVIDENCE_ADMIN_EMAIL: 'e2e-admin+ai-evidence-123-1@example.test',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
  }));
  assert.throws(
    () => assertAiEvidenceIdentitySeparation({
      E2E_ADMIN_EMAIL: 'ceo@bin-groups.com',
      AI_EVIDENCE_ADMIN_EMAIL: 'ceo+ai-evidence-123-1@bin-groups.com',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
    }),
    /refuses to alias E2E_ADMIN_EMAIL to the canonical Founder/,
  );
  assert.throws(
    () => assertAiEvidenceIdentitySeparation({
      E2E_ADMIN_EMAIL: 'e2e-admin@example.test',
      AI_EVIDENCE_ADMIN_EMAIL: 'e2e-admin+ai-evidence-999-1@example.test',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
    }),
    /not bound to this exact workflow run and attempt/,
  );
  assert.match(wrapper, /FROZEN_AI_VERIFIER_BLOB = '6964c56352d6b50450c01bbc6e0d066c889c05e3'/);
  assert.match(wrapper, /installReviewedAiIsolatedPrincipalAdapter/);
  assert.match(wrapper, /AI_EVIDENCE_ADMIN_EMAIL/);
  assert.match(wrapper, /unreviewed frozen AI verifier/);
  assert.match(wrapper, /restores\.reverse\(\)/);
  assert.doesNotMatch(wrapper, /FROZEN_AI_FOUNDER_BINDING/);
  assert.match(workflow, /E2E_ADMIN_EMAIL:\s*\$\{\{ secrets\.E2E_ADMIN_EMAIL \}\}/);
  assert.doesNotMatch(workflow, /E2E_ADMIN_EMAIL:\s*\$\{\{ secrets\.E2E_FOUNDER_EMAIL \}\}/);
  assert.match(workflow, /Provision run-scoped AI evidence Admin/);
  assert.match(workflow, /aiEvidenceRunId: runId/);
  assert.match(workflow, /aiEvidenceRunAttempt: runAttempt/);
  assert.match(workflow, /Retire only the run-scoped AI evidence Admin/);
  assert.match(workflow, /if: always\(\) && inputs\.gate == 'aiProviderHealth'/);
  assert.match(workflow, /refusing to retire an AI evidence identity not owned by this exact run/);
  assert.match(workflow, /collection\('ai_usage'\)\.doc\(`\$\{user\.uid\}_\$\{day\}`\)\.delete\(\)/);
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
