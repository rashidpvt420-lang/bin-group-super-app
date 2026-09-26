import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Phase 17 Owner Tenant and Admin Design Studio callables enforce App Check and server roles', async () => {
  const [studio, compat, payments] = await Promise.all([read('functions/aiDesignStudio.ts'), read('functions/aiDesignStudioCompat.ts'), read('functions/designPayments.ts')]);
  assert.match(studio, /enforceAppCheck:\s*true/);
  assert.ok(studio.includes('new Set(["owner", "tenant", "admin", "super_admin", "ceo", "operations_admin"])'));
  assert.match(compat, /enforceAppCheck:\s*true/);
  assert.ok(compat.includes('new Set(["admin", "super_admin", "ceo", "operations_admin"])'));
  assert.match(payments, /enforceAppCheck:\s*true/);
});

test('Phase 17 retires the legacy Gemini Design Studio execution bypass', async () => {
  const legacy = await read('functions/index.ts');
  const start = legacy.indexOf('export const generateDesignConcept = onCall');
  const end = legacy.indexOf('// ─── SCHEDULED MISSIONS', start);
  const block = legacy.slice(start, end);
  assert.ok(block.includes('Legacy Design Studio generation is retired.'));
  assert.ok(!block.includes('generativelanguage.googleapis.com'));
  assert.ok(!block.includes('gemini-2.0-flash'));
});

test('Phase 17 validates image MIME signature and size before provider execution', async () => {
  const source = await read('functions/aiDesignStudio.ts');
  for (const token of ['MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024','ALLOWED_IMAGE_MIME_TYPES','hasExpectedImageSignature','Reference image content does not match its MIME type','MAX_GENERATED_IMAGE_BYTES = 8 * 1024 * 1024']) assert.ok(source.includes(token));
});

test('Phase 17 Design Studio quota is reserved then charged only after successful canonical workflow creation', async () => {
  const source = await read('functions/aiDesignStudio.ts');
  const reserve = source.indexOf('reserveAiUsageQuota(request.auth, "design"');
  const provider = source.indexOf('editReferenceImage(apiKey');
  const create = source.indexOf('transaction.create(requestRef, requestPayload)');
  const charge = source.indexOf('settleAiUsageQuota(quota, true)');
  const release = source.indexOf('settleAiUsageQuota(quota, false)');
  assert.ok(reserve >= 0 && provider > reserve && create > provider && charge > create);
  assert.ok(release > charge);
});

test('Phase 17 private reference and generated media are server-only and digest-bound', async () => {
  const [source, rules] = await Promise.all([read('functions/aiDesignStudio.ts'), read('storage.rules')]);
  assert.ok(source.includes('cacheControl: "private,no-store"'));
  assert.ok(source.includes('PRIVATE_MEDIA_URL_TTL_MS = 15 * 60 * 1000'));
  assert.ok(source.includes('generatedImageSha256'));
  assert.ok(source.includes('inputImageSha256: reference.sha256'));
  assert.match(rules, /match \/design_requests\/\{userId\}\/\{allPaths=\*\*\}[\s\S]*?allow read, write: if false;/);
  assert.match(rules, /match \/ai_design_renders\/\{userId\}\/\{allPaths=\*\*\}[\s\S]*?allow read, write: if false;/);
});

test('Phase 17 canonical quote Owner approval payment verification and engineer handoff stay server-only', async () => {
  const [studio, payments, rules] = await Promise.all([read('functions/aiDesignStudio.ts'), read('functions/designPayments.ts'), read('firestore.rules')]);
  for (const token of ['SERVER_CALCULATED_DESIGN_STUDIO_V1','quoteHash','mobilizationPercent: 15','design_quotes','design_approvals']) assert.ok(studio.includes(token));
  for (const token of ['submitDesignOwnerDecision','createDesignPaymentRequest','adminReviewDesignPayment','adminHandoffDesignRequest','paymentVerified','ENGINEER_REVIEW','READY_FOR_SCOPE_REVIEW']) assert.ok(payments.includes(token));
  for (const collection of ['design_requests','design_quotes','design_approvals']) {
    const start = rules.indexOf('match /' + collection + '/');
    const next = rules.indexOf('\n    match /', start + 1);
    const block = rules.slice(start, next > start ? next : undefined);
    assert.ok(block.includes('allow create: if false;'));
  }
});

test('Phase 17 production-provider evidence remains exact-SHA App Check protected and live-provider based', async () => {
  const [workflow, evidence] = await Promise.all([read('.github/workflows/operational-provider-evidence.yml'), read('scripts/verify-ai-live-evidence.mjs')]);
  for (const token of ['aiProviderHealth','Verify live Sovereign AI providers, privacy, quota and SLO','expected_commit_sha','production_deploy_run_id','VITE_FIREBASE_APPCHECK_DEBUG_TOKEN']) assert.ok(workflow.includes(token));
  for (const token of ['GITHUB_REF !== \'refs/heads/main\'','same-SHA production deployment binding is required','exchangeAppCheckToken','invalid App Check token was not rejected','run-scoped AI evidence']) assert.ok(evidence.includes(token));
});