'use strict';
// F-4 downstream regression: callables must not accept a contract `status` string as
// proof of Owner signature. Only server-written ownerSigned / signatureState evidence counts.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { createOwnerPaymentTransaction } = lib('contractActivation.js');
const { ownerSignContractAndQueuePdf } = lib('adminOwnerOperations.js');
const QUOTE_HASH = 'a'.repeat(64);

let owner;
test.before(async () => {
  owner = await createUser('owner_f4_cb', { role: 'owner' }, { email: 'owner-f4-cb@example.invalid' });
});
test.beforeEach(clearFirestore);

function contract(overrides) {
  return {
    ownerId: owner.uid,
    ownerUid: owner.uid,
    ownerEmail: owner.token.email,
    quoteHash: QUOTE_HASH,
    otpVerificationId: 'otp_fixture',
    ownerSigned: false,
    signatureState: { ownerSigned: false },
    ...overrides,
  };
}

test('createOwnerPaymentTransaction rejects a contract whose only signature proof is status "signed"', async () => {
  await db.doc('contracts/f4_status_only').set(contract({ status: 'signed' }));
  const error = await expectHttpsError(call(createOwnerPaymentTransaction, owner, { contractId: 'f4_status_only' }), 'failed-precondition');
  assert.match(error.message, /must be signed/i);
});

for (const status of ['SIGNED', 'READY_FOR_ACTIVATION', 'PENDING_ACTIVATION']) {
  test(`ownerSignContractAndQueuePdf does not short-circuit on client-style status ${status}`, async () => {
    await db.doc('contracts/f4_spoofed').set(contract({ status }));
    let result;
    let failure;
    try {
      result = await call(ownerSignContractAndQueuePdf, owner, { contractId: 'f4_spoofed', signatureName: 'Owner F4' });
    } catch (error) {
      failure = error;
    }
    assert.equal(result?.idempotent, undefined, `status ${status} must not be treated as already signed`);
    assert.ok(failure, 'signing without OTP evidence must fail');
    const stored = (await db.doc('contracts/f4_spoofed').get()).data();
    assert.equal(stored.ownerSigned, false);
  });
}

test('ownerSignContractAndQueuePdf stays idempotent for server-signed and ACTIVE contracts', async () => {
  await db.doc('contracts/f4_signed').set(contract({ status: 'PENDING_OWNER_SIGNATURE', ownerSigned: true, signatureState: { ownerSigned: true }, signedPdfUrl: 'https://example.invalid/c.pdf' }));
  const signed = await call(ownerSignContractAndQueuePdf, owner, { contractId: 'f4_signed', signatureName: 'Owner F4' });
  assert.equal(signed.idempotent, true);
  await db.doc('contracts/f4_active').set(contract({ status: 'ACTIVE' }));
  const active = await call(ownerSignContractAndQueuePdf, owner, { contractId: 'f4_active', signatureName: 'Owner F4' });
  assert.equal(active.idempotent, true);
});
