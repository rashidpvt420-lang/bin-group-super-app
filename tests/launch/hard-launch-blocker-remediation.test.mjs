import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('public AI is local-only and every authenticated response exposes provider health', async () => {
  const [app, chat, shell] = await Promise.all([
    read('src/App.tsx'),
    read('src/components/SovereignAIChat.tsx'),
    read('src/components/AuthenticatedShell.tsx'),
  ]);

  assert.match(app, /role=["']unknown["'][\s\S]*allowLiveProvider=\{false\}[\s\S]*isAuthenticated=\{false\}/);
  assert.match(chat, /providerStatusLabel/);
  assert.match(chat, /operationalStatus\?: ['"]healthy['"] \| ['"]degraded['"] \| ['"]error['"] \| ['"]ready['"]/);
  assert.match(chat, /LOCAL GUIDANCE — NOT LIVE AI OR AUTHORITATIVE/);
  assert.match(chat, /AI SERVICE ERROR — NO LIVE ANSWER/);
  assert.match(chat, /data\.live === true/);
  assert.match(chat, /DEGRADED ·/);
  assert.match(chat, /SERVICE ERROR/);
  assert.doesNotMatch(chat, /LIVE PROPERTY TRUTH ASSISTANT/);

  assert.match(shell, /Boolean\(user\?\.uid\)/);
  assert.match(shell, /allowLiveProvider/);
  assert.match(shell, /isAuthenticated=\{Boolean\(user\?\.uid\)\}/);
  assert.match(shell, /authUserId=\{user\?\.uid \|\| null\}/);
});

test('production builds enable HR and sensitive staff files remain behind Storage rules', async () => {
  const [writer, verifier, hrPage, privacyHardener, packageJsonText] = await Promise.all([
    read('scripts/write-production-env.mjs'),
    read('scripts/verify-production-workflow-env.mjs'),
    read('src/technician/pages/TechnicianHRPageV2.tsx'),
    read('scripts/harden-hr-privacy-rules.mjs'),
    read('package.json'),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.match(writer, /\[['"]VITE_ENABLE_HR_MODULE['"],\s*['"]true['"]\]/);
  assert.match(writer, /\[['"]REACT_APP_ENABLE_HR_MODULE['"],\s*['"]true['"]\]/);
  assert.match(verifier, /hrEnabledByProductionWriter/);
  assert.match(verifier, /write-production-env\.mjs must enable both VITE_ENABLE_HR_MODULE and REACT_APP_ENABLE_HR_MODULE/);

  assert.match(hrPage, /customMetadata/);
  assert.match(hrPage, /accessMode:\s*['"]firebase_storage_rules['"]/);
  assert.match(hrPage, /downloadTokenPersisted:\s*false/);
  assert.match(hrPage, /sensitiveDocument:\s*true/);
  assert.doesNotMatch(hrPage, /getDownloadURL/);
  assert.doesNotMatch(hrPage, /documentFileUrl/);
  assert.doesNotMatch(hrPage, /\bfileUrl\b/);

  assert.match(packageJson.scripts['prepare:rules'], /harden:hr-privacy/);
  assert.match(privacyHardener, /allow read: if isHr\(\) \|\| staffCanRead\(resource\.data\);/);
  assert.match(privacyHardener, /Wellbeing and distress signals are restricted/);
  assert.match(privacyHardener, /allow read: if isHrManagerTier\(\) \|\| staffCanRead\(resource\.data\);/);
  const hardenedStaffDocuments = privacyHardener.slice(
    privacyHardener.indexOf('const hardenedStaffDocuments ='),
    privacyHardener.indexOf('`;', privacyHardener.indexOf('const hardenedStaffDocuments =')),
  );
  assert.doesNotMatch(hardenedStaffDocuments, /isFinance\(\)/);
});

test('Broker production suite proves UI attribution, deterministic commission and single-use payout', async () => {
  const [suite, runner, commissionFunction] = await Promise.all([
    read('tests/e2e/business-broker.spec.ts'),
    read('scripts/run-broker-production-evidence.mjs'),
    read('functions/brokerCommissions.ts'),
  ]);

  assert.match(suite, /run-broker-production-evidence\.mjs/);
  assert.match(suite, /E2E_BROKER_LEAD_NAME/);
  assert.match(suite, /leadCreatedThroughUi:\s*true/);
  assert.match(suite, /countAfterActivationReplay:\s*1/);
  assert.match(suite, /deterministicIdPreserved:\s*true/);
  assert.match(suite, /mailboxReceiptVerified:\s*true/);
  assert.match(suite, /replayRejected:\s*true/);

  assert.match(runner, /status:\s*['"]ACTIVE['"]/);
  assert.match(runner, /CONTRACT_ACTIVATION/);
  assert.match(runner, /commissionCountAfterReplay\.size === 1/);
  assert.match(runner, /submitBrokerPayoutRequest/);
  assert.match(runner, /callFunctionExpectingFailure/);

  assert.match(commissionFunction, /doc\(`commission_\$\{contractId\}`\)/);
  assert.match(commissionFunction, /transaction\.create\(commissionRef/);
  assert.match(commissionFunction, /reconcileBrokerCommissionOnContractActivation/);
});
