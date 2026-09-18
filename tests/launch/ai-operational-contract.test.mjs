import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertReviewedAiVerifierSource,
  transformReviewedAiVerifierQuotaBoundary,
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
  assert.match(workflow, /Record live AI probe window/);
  assert.match(workflow, /Report redacted live-provider failure category/);
  assert.match(workflow, /Probe Gemini endpoint with redacted status only/);
  assert.match(workflow, /gcloud secrets versions access latest --secret=GEMINI_API_KEY/);
  assert.match(workflow, /::add-mask::\$gemini_key/);
  assert.match(workflow, /gemini-3\.6-flash/);
  assert.match(workflow, /gemini-2\.5-flash/);
  assert.match(workflow, /\[gemini-redacted-diagnostic\] model=\$\{model\} http=\$\{httpStatus\} apiStatus=\$\{apiStatus\}/);
  assert.doesNotMatch(workflow, /payload\?\.error\?\.message/);
  assert.doesNotMatch(workflow, /console\.log\([^\n]*(?:apiKey|gemini_key|GEMINI_DIAGNOSTIC_KEY)/);
  assert.match(workflow, /logging\.googleapis\.com\/v2\/entries:list/);
  assert.match(workflow, /allowedCodes = new Set/);
  assert.match(workflow, /attempt < 4/);
  assert.match(workflow, /entries\.map\(\(value\) => JSON\.stringify\(value\)\)/);
  assert.match(workflow, /entry\.matchAll\(\/\\bgemini:\(\[a-z-\]\+\)\\b\/g\)/);
  assert.doesNotMatch(workflow, /entry\.includes\('\[runSovereignAI\] Live providers unavailable'\)/);
  assert.doesNotMatch(workflow, /forcedProvider.*gemini/);
  assert.match(workflow, /Redacted Sovereign AI failure category/);
  assert.doesNotMatch(workflow, /console\.(?:log|error)\((?:entry|entries|response|response\.data)/);
  assert.match(verifier, /provider: 'gemini'/);
  assert.match(verifier, /provider: 'openai'/);
  assert.match(verifier, /invalid App Check token/);
  assert.match(verifier, /rejectedAttemptUncharged/);
  assert.match(verifier, /isolatedUsageRemoved/);
  assert.match(verifier, /providerSuccessRate/);
  assert.match(verifier, /measuredProviderUsageRequired/);
  assert.match(verifier, /maxBudgetEnvelopeAedMicrosPerChatRequest/);
  assert.match(verifier, /nested\.person@example\.com/);
  assert.match(verifier, /\+971509876543/);
  assert.match(verifier, /Passport B7654321/);
  assert.match(verifier, /Account 9876543210/);
  assert.match(verifier, /redactionsApplied\) \? redactionsApplied : 'invalid'/);
  assert.match(publisher, /AI SLO .*missing or non-numeric/);
  assert.match(publisher, /measured token\/cost evidence invalid/);
  assert.match(finalizer, /aiProviderHealth: 'workflow-artifact'/);
  assert.match(gate, /'aiProviderHealth'/);
});

test('AI evidence uses an exact reviewed run-scoped identity without touching a live user quota', () => {
  const wrapper = read('scripts/run-frozen-release-evidence.mjs');
  const workflow = read('.github/workflows/operational-provider-evidence.yml');
  const verifier = read('scripts/verify-ai-live-evidence.mjs');
  const publisher = read('scripts/publish-operational-provider-evidence.mjs');

  assert.doesNotThrow(() => assertReviewedAiVerifierSource(verifier));
  assert.throws(
    () => assertReviewedAiVerifierSource(verifier.replace("role: 'ai_evidence_probe'", "role: 'admin'")),
    /unreviewed isolated AI verifier/,
  );
  assert.match(wrapper, /REVIEWED_AI_VERIFIER_BLOB = '9c613db118a2e05efc3b089ef7890a7d48d4ee03'/);
  assert.match(wrapper, /assertReviewedAiVerifier\(releaseRoot\)/);
  assert.match(workflow, /cp control-plane\/scripts\/verify-ai-live-evidence\.mjs release\/scripts\/verify-ai-live-evidence\.mjs/);
  assert.match(workflow, /Enforce run-scoped AI evidence fallback cleanup/);
  assert.match(workflow, /if: always\(\) && inputs\.gate == 'aiProviderHealth'/);
  assert.match(workflow, /refusing to clean an Auth identity not owned by this exact AI evidence run/);
  assert.match(workflow, /transaction\.get\(usageQuery\)/);
  assert.match(workflow, /Object\.keys\(disabledUser\.customClaims \|\| \{\}\)\.length === 0/);
  assert.doesNotMatch(workflow, /Provision run-scoped AI evidence Admin|AI_EVIDENCE_ADMIN_EMAIL|setCustomUserClaims/);

  assert.match(verifier, /const evidenceUid = `ai-evidence-\$\{workflowRunId\}-\$\{workflowRunAttempt\}`/);
  assert.match(verifier, /authAdmin\.createUser\(\{/);
  assert.match(verifier, /authAdmin\.verifyIdToken\(idToken, true\)/);
  assert.doesNotMatch(verifier, /payload\?\.localId/);
  assert.match(verifier, /role: 'ai_evidence_probe'/);
  assert.match(verifier, /transaction\.create\(profileRef/);
  assert.match(verifier, /transaction\.create\(usageRef/);
  assert.match(verifier, /setIsolatedQuotaBoundary/);
  assert.match(verifier, /disableAndRevokeEvidenceAuth/);
  assert.match(verifier, /removeEvidenceFirestore/);
  assert.match(verifier, /deleteEvidenceAuth/);
  assert.match(verifier, /persistentCustomClaims: false/);
  assert.match(verifier, /canonicalFounderUsed: false/);
  assert.doesNotMatch(verifier, /getUserByEmail|adminEmail|originalUsage|originalData|usageRef\.set/);
  assert.doesNotMatch(verifier, /createUser\(\{[\s\S]{0,200}email:/);
  assert.doesNotMatch(verifier, /setCustomUserClaims/);
  assert.match(publisher, /proof\.quota\?\.isolatedUsageRemoved !== true/);
  assert.match(publisher, /AI authenticated UID is not bound to this run attempt/);
  assert.match(publisher, /AI run-scoped evidence identity lifecycle invalid/);
  assert.doesNotMatch(publisher, /originalUsageRestored/);
});

test('reviewed AI quota boundary adapter preserves the >=4 privacy assertion on the final allowed request', () => {
  const verifier = read('scripts/verify-ai-live-evidence.mjs');
  const adapted = transformReviewedAiVerifierQuotaBoundary(verifier);
  const privacyBearingGeminiCalls = adapted.match(/data: \{ \.\.\.sensitiveProbe, provider: 'gemini' \}/g) || [];

  assert.equal(privacyBearingGeminiCalls.length, 2);
  assert.doesNotMatch(adapted, /Return a brief advisory-only boundary statement\./);
  assert.match(adapted, /const boundarySuccess = assertLiveProbe\(boundarySuccessResult, 'gemini'\)/);
  assert.throws(
    () => transformReviewedAiVerifierQuotaBoundary(verifier.replace('Return a brief advisory-only boundary statement.', 'changed boundary probe')),
    /unreviewed isolated AI verifier/,
  );
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