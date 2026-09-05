import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createBusinessEvidenceRunScope,
  resolveBusinessEvidenceAttempt,
} from '../../scripts/lib/business-evidence-run-scope.mjs';
import {
  BROKER_COMMISSION_SCAN_LIMIT,
  BROKER_EVIDENCE_COMMISSION_PREFIX,
  BROKER_EVIDENCE_TYPE,
  isStaleSyntheticBrokerCommission,
} from '../../scripts/lib/broker-e2e-fixture-isolation.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const protectedEnvironment = (businessAttempt) => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW: 'Firebase Production Deploy',
  DEPLOYMENT_ENVIRONMENT: 'production',
  E2E_STRICT_LIVE: 'true',
  GITHUB_RUN_ID: '33901905659',
  GITHUB_RUN_ATTEMPT: '1',
  BUSINESS_EVIDENCE_ATTEMPT: businessAttempt,
});

test('protected business retries always receive different deterministic run scopes', () => {
  const first = createBusinessEvidenceRunScope(protectedEnvironment('1'), { maxLength: 42 });
  const second = createBusinessEvidenceRunScope(protectedEnvironment('2'), { maxLength: 42 });

  assert.notEqual(first, second);
  assert.match(first, /-business-1$/);
  assert.match(second, /-business-2$/);
  assert.ok(first.length <= 42 && second.length <= 42);
});

test('protected business scope fails closed when the inner retry identity is absent or invalid', () => {
  for (const attempt of [undefined, '', '0', '3', '../2']) {
    assert.throws(
      () => resolveBusinessEvidenceAttempt(protectedEnvironment(attempt)),
      /BUSINESS_EVIDENCE_ATTEMPT=1 or 2/,
    );
  }
});

test('Broker cleanup selects only owned synthetic evidence and preserves the canonical fixture', () => {
  const brokerUid = 'dedicated-broker-uid';
  const canonicalCommissionId = 'e2e-live-broker-commission-dedicated-broker-uid';
  const candidate = (documentId, data) => isStaleSyntheticBrokerCommission({
    documentId,
    data,
    brokerUid,
    canonicalCommissionId,
  });

  assert.equal(candidate(canonicalCommissionId, { brokerId: brokerUid, e2eLaunchSeed: true }), false);
  assert.equal(candidate('unrelated-real-commission', { brokerId: brokerUid, status: 'APPROVED' }), false);
  assert.equal(candidate('other-broker-fixture', { brokerId: 'another-broker', e2eLaunchSeed: true }), false);
  assert.equal(candidate('tagged-evidence', { brokerId: brokerUid, e2eEvidenceType: BROKER_EVIDENCE_TYPE }), true);
  assert.equal(candidate('seeded-evidence', { brokerUid, e2eLaunchSeed: true }), true);
  assert.equal(candidate(`${BROKER_EVIDENCE_COMMISSION_PREFIX}run_lead`, {
    brokerId: brokerUid,
    contractId: 'e2e_broker_contract_run_lead',
  }), true);
  assert.equal(candidate(`${BROKER_EVIDENCE_COMMISSION_PREFIX}lookalike`, {
    brokerId: brokerUid,
    contractId: 'real-contract',
  }), false);
});

test('protected sources apply bounded Broker cleanup and attempt-scoped Admin/Broker identities', () => {
  const preparation = read('scripts/prepare-broker-payout-otp-e2e.mjs');
  const adminSpec = read('tests/e2e/business-admin.spec.ts');
  const brokerRunner = read('scripts/run-broker-production-evidence.mjs');

  assert.equal(BROKER_COMMISSION_SCAN_LIMIT, 200);
  assert.match(preparation, /where\('brokerId', '==', brokerUid\)/);
  assert.match(preparation, /limit\(BROKER_COMMISSION_SCAN_LIMIT\)/);
  assert.match(preparation, /isStaleSyntheticBrokerCommission/);
  assert.match(preparation, /cleanupBatch\.delete\(document\.ref\)/);
  assert.doesNotMatch(preparation, /collection\('broker_commissions'\)\.get\(\)/);

  assert.match(adminSpec, /createBusinessEvidenceRunScope\(process\.env/);
  assert.match(adminSpec, /adminAssignTechnician/);
  assert.match(adminSpec, /callable failed HTTP/);
  assert.match(brokerRunner, /createBusinessEvidenceRunScope\(process\.env\)/);
});
