import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOnboardingState,
  canTransitionOnboarding,
  isOwnerDashboardUnlockEligible,
  buildOnboardingRecoverySnapshot,
} from '../src/lib/onboardingStateMachine.ts';

test('normalizes fragmented onboarding statuses onto the canonical machine', () => {
  assert.equal(normalizeOnboardingState('AUTH_CREATED'), 'account_created');
  assert.equal(normalizeOnboardingState('pending_admin_review'), 'admin_review');
  assert.equal(normalizeOnboardingState('PAYMENT_PENDING'), 'deposit_pending');
  assert.equal(normalizeOnboardingState('payment_pending_approval'), 'deposit_processing');
  assert.equal(normalizeOnboardingState('PENDING_ADMIN_PAYMENT_VERIFICATION'), 'deposit_processing');
  assert.equal(normalizeOnboardingState('PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL'), 'admin_review');
  assert.equal(normalizeOnboardingState('APPROVED_PENDING_OWNER_SIGNATURE'), 'signature_pending');
  assert.equal(normalizeOnboardingState('ACTIVE'), 'active');
});

test('requires account creation before property onboarding', () => {
  assert.equal(canTransitionOnboarding('draft', 'property_details_complete'), false);
  assert.equal(canTransitionOnboarding('draft', 'account_created'), true);
  assert.equal(canTransitionOnboarding('account_created', 'property_details_complete'), true);
  assert.equal(canTransitionOnboarding('draft', 'active'), false);
});

test('allows the verified deposit to admin-review path', () => {
  assert.equal(canTransitionOnboarding('deposit_processing', 'deposit_paid'), true);
  assert.equal(canTransitionOnboarding('admin_review', 'approved'), true);
  assert.equal(canTransitionOnboarding('approved', 'active'), true);
});

test('owner dashboard unlock stays fail-closed without server flags', () => {
  assert.equal(isOwnerDashboardUnlockEligible({
    status: 'active',
    paymentVerified: true,
    adminApproved: true,
    dashboardUnlocked: true,
    activeContractId: '',
    onboardingStatus: 'approved',
  }), false);
  assert.equal(isOwnerDashboardUnlockEligible({
    status: 'active',
    paymentVerified: true,
    adminApproved: true,
    dashboardUnlocked: true,
    dashboardLocked: false,
    activeContractId: 'contract_1',
    onboardingStatus: 'active',
  }), true);
  assert.equal(isOwnerDashboardUnlockEligible({
    status: 'active',
    paymentVerified: true,
    adminApproved: true,
    dashboardUnlocked: true,
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
