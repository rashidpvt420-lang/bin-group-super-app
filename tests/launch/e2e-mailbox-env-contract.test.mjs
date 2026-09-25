import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const envGuard = readFileSync('scripts/verify-e2e-env.mjs', 'utf8');
const owner = readFileSync('scripts/run-owner-onboarding-production-evidence.mjs', 'utf8');
const ownerSecure = readFileSync('scripts/run-owner-onboarding-production-evidence-secure.mjs', 'utf8');
const ownerCanonical = readFileSync('scripts/run-owner-inspection-first-production-evidence.mjs', 'utf8');
const broker = readFileSync('scripts/run-broker-production-evidence.mjs', 'utf8');

test('application login identities remain separate from read-only Gmail mailbox identities', () => {
  assert.match(owner, /run-owner-inspection-first-production-evidence\.mjs/);
  assert.match(ownerSecure, /run-owner-inspection-first-production-evidence\.mjs/);
  assert.match(ownerCanonical, /E2E_OWNER_EMAIL/);
  assert.match(ownerCanonical, /E2E_OWNER_MAILBOX_EMAIL/);
  assert.match(ownerCanonical, /E2E_OWNER_MAILBOX_REFRESH_TOKEN/);
  assert.doesNotMatch(ownerCanonical, /BANK_TRANSFER/);
  assert.match(broker, /const brokerEmail = text\(process\.env\.E2E_BROKER_EMAIL\)/);
  assert.match(broker, /const brokerMailboxEmail = text\(process\.env\.E2E_BROKER_MAILBOX_EMAIL\)/);
  assert.match(broker, /const brokerAuthEmail = brokerMailboxEmail/);
  assert.match(broker, /auth\.getUserByEmail\(brokerMailboxEmail\)/);
  assert.match(broker, /signIn\(brokerAuthEmail, brokerPassword\)/);
  assert.doesNotMatch(broker, /auth\.getUserByEmail\(brokerEmail\)/);
  assert.doesNotMatch(broker, /signIn\(brokerEmail, brokerPassword\)/);
  assert.match(envGuard, /E2E_\$\{role\}_EMAIL/);
  assert.match(envGuard, /E2E_REQUIRE_MAILBOX_EVIDENCE/);
});
