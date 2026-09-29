import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  rentApprovalDecision,
  rentRejectionDecision,
} from '../functions/rentPaymentStatus.ts';

const approval = readFileSync(new URL('../functions/paymentTransactionApproval.ts', import.meta.url), 'utf8');

test('open owner rent can be approved or rejected once', () => {
  const submitted = {
    recordType: 'OWNER_RENT_PAYMENT',
    status: 'PAID',
    paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    paymentVerified: false,
    approved: false,
  };
  assert.equal(rentApprovalDecision(submitted), 'approve');
  assert.equal(rentRejectionDecision(submitted), 'reject');
});

test('approved or verified rent replays approval and refuses rejection', () => {
  const approved = { status: 'APPROVED', paymentStatus: 'APPROVED', paymentVerified: true, approved: true };
  assert.equal(rentApprovalDecision(approved), 'replay');
  assert.equal(rentRejectionDecision(approved), 'refuse_approved');

  const verifiedOnly = { status: 'PAID', paymentVerified: true, approved: false };
  assert.equal(rentApprovalDecision(verifiedOnly), 'replay');
  assert.equal(rentRejectionDecision(verifiedOnly), 'refuse_approved');

  const statusOnly = { status: 'APPROVED', paymentVerified: false, approved: false };
  assert.equal(rentApprovalDecision(statusOnly), 'replay');
  assert.equal(rentRejectionDecision(statusOnly), 'refuse_approved');
});

test('rejected rent replays rejection and cannot be approved in place', () => {
  const rejected = { status: 'REJECTED', paymentStatus: 'REJECTED', paymentVerified: false, approved: false };
  assert.equal(rentRejectionDecision(rejected), 'replay');
  assert.equal(rentApprovalDecision(rejected), 'refuse_rejected');
  assert.equal(rentRejectionDecision({ paymentStatus: 'REJECTED', status: 'PAID' }), 'replay');
});

test('rent approval and rejection re-check the fresh ledger row inside the transaction', () => {
  const approveStart = approval.indexOf('if (isRentCollectionPayment(payment))');
  const activationStart = approval.indexOf('const { contractId, intakeId } = resolveActivationIds(paymentId, payment);');
  const rejectStart = approval.indexOf('export const adminRejectPayment');
  assert.ok(approveStart > 0 && activationStart > approveStart && rejectStart > activationStart);
  const approveBlock = approval.slice(approveStart, activationStart);
  const rejectBlock = approval.slice(rejectStart, approval.indexOf('resolveActivationIds(paymentId, payment);', rejectStart));

  assert.match(approveBlock, /const decision = rentApprovalDecision\(freshSnap\.data\(\) \|\| \{\}\)/);
  assert.match(approveBlock, /idempotent: rentApprovalIdempotent/);
  assert.match(rejectBlock, /const decision = rentRejectionDecision\(freshSnap\.data\(\) \|\| \{\}\)/);
  assert.match(rejectBlock, /An approved rent payment cannot be rejected/);
  assert.match(rejectBlock, /idempotent: rentRejectionIdempotent/);
  assert.match(approval, /An activated payment cannot be rejected/);
});
