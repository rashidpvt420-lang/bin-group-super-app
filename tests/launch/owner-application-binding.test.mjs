// F-1 unit coverage for the pure binding decision (runs in CI via test:launch-honesty).
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Output inside node_modules/.cache so firebase-functions resolves from the workspace install.
const outDir = path.resolve('node_modules/.cache/owner-application-binding-test');
fs.mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, `binding-${process.pid}.cjs`);
await build({ entryPoints: ['functions/ownerApplicationBinding.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, external: ['firebase-functions', 'firebase-functions/*'], logLevel: 'silent' });
const { decideOwnerApplicationSubmission, assertOtpApplicationBinding } = createRequire(import.meta.url)(outfile);

const uuid = '3f0e6c1a-8b2d-4c3e-9f10-1234567890ab';
const code = (fn) => { try { fn(); return 'OK'; } catch (error) { return error.code; } };
const decide = (records, callerUid = 'a', applicationId = uuid) => code(() => decideOwnerApplicationSubmission({ callerUid, applicationId, records }));

test('new UUID application is allowed; guessable foreign IDs are not', () => {
  assert.equal(decideOwnerApplicationSubmission({ callerUid: 'a', applicationId: uuid, records: {} }), 'NEW');
  assert.equal(decideOwnerApplicationSubmission({ callerUid: 'a', applicationId: 'owner_a', records: {} }), 'NEW');
  assert.equal(decide({}, 'a', 'owner_b'), 'invalid-argument');
  assert.equal(decide({}, 'a', 'b'), 'invalid-argument');
});

test('records bound to another Owner, or unbound, are refused', () => {
  assert.equal(decide({ intake: { ownerUid: 'b', status: 'SUBMITTED_FOR_PROPERTY_INSPECTION' } }), 'permission-denied');
  assert.equal(decide({ intake: { ownerUid: 'a' }, properties: [{ ownerUid: 'b' }] }), 'permission-denied');
  assert.equal(decide({ contract: { status: 'ACTIVE' } }), 'permission-denied');
});

test('submitted replay is idempotent; progressed applications cannot be reset', () => {
  assert.equal(decideOwnerApplicationSubmission({ callerUid: 'a', applicationId: uuid, records: { intake: { ownerUid: 'a', status: 'SUBMITTED_FOR_PROPERTY_INSPECTION' } } }), 'IDEMPOTENT');
  for (const status of ['ACTIVE', 'INSPECTIONS_COMPLETE', 'ADMIN_REVIEW', 'REJECTED']) {
    assert.equal(decide({ intake: { ownerUid: 'a', status } }), 'failed-precondition', status);
  }
  assert.equal(decide({ intake: { ownerUid: 'a', status: '' }, payment: { ownerUid: 'a', status: 'APPROVED' } }), 'failed-precondition');
  assert.equal(decide({ intake: { ownerUid: 'a', status: '' }, contract: { ownerUid: 'a', status: 'ACTIVE' } }), 'failed-precondition');
  assert.equal(decide({ contract: { ownerUid: 'a', status: 'SIGNED' } }), 'failed-precondition');
});

test('profile-created intake (no status yet) can be submitted by its Owner', () => {
  assert.equal(decideOwnerApplicationSubmission({ callerUid: 'a', applicationId: uuid, records: { intake: { ownerUid: 'a' } } }), 'RESUBMIT');
});

test('OTP binding refuses another Owner application and malformed new references', () => {
  assert.equal(code(() => assertOtpApplicationBinding({ callerUid: 'a', applicationId: uuid, contract: { ownerUid: 'b' } })), 'permission-denied');
  assert.equal(code(() => assertOtpApplicationBinding({ callerUid: 'a', applicationId: 'guess', intake: null, contract: null })), 'invalid-argument');
  assert.equal(code(() => assertOtpApplicationBinding({ callerUid: 'a', applicationId: uuid, intake: { ownerUid: 'a' }, contract: { ownerId: 'a' } })), 'OK');
  assert.equal(code(() => assertOtpApplicationBinding({ callerUid: 'a', applicationId: 'owner_application_a' })), 'OK');
});
