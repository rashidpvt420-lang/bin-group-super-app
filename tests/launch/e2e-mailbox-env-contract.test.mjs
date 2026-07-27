import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const envGuard = readFileSync('scripts/verify-e2e-env.mjs', 'utf8');
const owner = readFileSync('scripts/run-owner-onboarding-production-evidence.mjs', 'utf8');
const ownerSecure = readFileSync('scripts/run-owner-onboarding-production-evidence-secure.mjs', 'utf8');
const broker = readFileSync('scripts/run-broker-production-evidence.mjs', 'utf8');

test('application login identities remain separate from read-only Gmail mailbox identities', () => {
  assert.match(owner, /E2E_OWNER_EMAIL/);
  assert.doesNotMatch(owner, /E2E_OWNER_MAILBOX_EMAIL/);
  assert.match(ownerSecure, /E2E_OWNER_MAILBOX_EMAIL/);
  assert.match(broker, /const brokerEmail = text\(process\.env\.E2E_BROKER_EMAIL\)/);
  assert.match(broker, /const brokerMailboxEmail = text\(process\.env\.E2E_BROKER_MAILBOX_EMAIL\)/);
  assert.match(envGuard, /E2E_\$\{role\}_EMAIL/);
  assert.match(envGuard, /E2E_REQUIRE_MAILBOX_EVIDENCE/);
});
