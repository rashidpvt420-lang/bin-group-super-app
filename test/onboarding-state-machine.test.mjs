import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOnboardingState,
  canTransitionOnboarding,
  isOwnerDashboardUnlockEligible,
  buildOnboardingRecoverySnapshot,
} from '../src/lib/onboardingStateMachine.ts';

test('normalizes fragmented onboarding statuses onto the canonical machine', () => {
  assert.equal(normalizeOnboardingState('pending_admin_review'), 'admin_review');
  assert.equal(normalizeOnboardingState('PAYMENT_PENDING'), 'deposit_pending');
  assert.equal(normalizeOnboardingState('APPROVED_PENDING_OWNER_SIGNATURE'), 'signature_pending');
  assert.equal(normalizeOnboardingState('ACTIVE'), 'active');
});

test('rejects illegal onboarding transitions and allows deposit -> admin_review path', () => {
  assert.equal(canTransitionOnboarding('draft', 'active'), false);
  assert.equal(canTransitionOnboarding('deposit_processing', 'deposit_paid'), true);
  assert.equal(canTransitionOnboarding('admin_review', 'approved'), true);
  assert.equal(canTransitionOnboarding('approved', 'active'), true);
});

test('owner dashboard unlock stays fail-closed without server flags', () => {
  assert.equal(isOwnerDashboardUnlockEligible({
    paymentVerified: true,
    adminApproved: true,
    activeContractId: '',
    onboardingStatus: 'approved',
  }), false);
  assert.equal(isOwnerDashboardUnlockEligible({
    paymentVerified: true,
    adminApproved: true,
    activeContractId: 'contract_1',
    onboardingStatus: 'approved',
  }), true);
  assert.equal(isOwnerDashboardUnlockEligible({
    paymentVerified: true,
    adminApproved: true,
    activeContractId: 'contract_1',
    onboardingStatus: 'suspended',
  }), false);
});

test('recovery snapshot exposes progress, blocker, and next step without unlocking on admin_review', () => {
  const snapshot = buildOnboardingRecoverySnapshot({
    status: 'pending_admin_review',
    supportReferenceId: 'intake_1',
    lastCompletedStep: 'onboarding_package_submitted',
  });
  assert.equal(snapshot.status, 'admin_review');
  assert.equal(snapshot.unlocksDashboard, false);
  assert.equal(snapshot.supportReferenceId, 'intake_1');
  assert.ok(snapshot.progressPercent >= 80);
  assert.match(snapshot.currentBlocker, /admin/i);
  assert.match(snapshot.nextRequiredStep, /admin/i);
});
