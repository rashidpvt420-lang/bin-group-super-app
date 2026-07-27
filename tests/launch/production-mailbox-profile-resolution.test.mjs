import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const resolver = readFileSync('scripts/resolve-production-mailbox-identities.mjs', 'utf8');
const workflows = [
  '.github/workflows/firebase-production-deploy.yml',
  '.github/workflows/live-role-smoke.yml',
  '.github/workflows/admin-production-evidence.yml',
];

test('mailbox identities are derived from authenticated Gmail profiles', () => {
  assert.match(resolver, /users\/me\/profile/);
  assert.match(resolver, /exchangeGmailAccessToken/);
  assert.match(resolver, /MAILBOX_EMAIL_CONFIGURED/);
  assert.match(resolver, /OAuth identity does not match the configured mailbox/);
  assert.match(resolver, /appendFileSync\(githubEnv/);
  assert.match(resolver, /::add-mask::/);
  assert.doesNotMatch(resolver, /console\.log\([^\n]*ownerEmail/);
  assert.doesNotMatch(resolver, /console\.log\([^\n]*brokerEmail/);
});

test('protected workflows resolve identities before strict environment checks', () => {
  for (const workflowPath of workflows) {
    const source = readFileSync(workflowPath, 'utf8');
    assert.match(source, /Resolve protected Gmail mailbox identities/);
    assert.match(source, /run: node scripts\/resolve-production-mailbox-identities\.mjs/);
    assert.match(source, /E2E_OWNER_MAILBOX_EMAIL_CONFIGURED:/);
    assert.match(source, /E2E_BROKER_MAILBOX_EMAIL_CONFIGURED:/);
    assert.doesNotMatch(source, /^\s{10,}E2E_OWNER_MAILBOX_EMAIL:/m);
    assert.doesNotMatch(source, /^\s{10,}E2E_BROKER_MAILBOX_EMAIL:/m);
  }
});
