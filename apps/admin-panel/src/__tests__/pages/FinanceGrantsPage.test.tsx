// Finance grants screen: the UI disables and explains; the server stays the authority.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockCall = jest.fn();
let mockAuthState: any = {};
let mockRTL = false;

jest.mock('../../lib/firebase', () => ({
  functions: { mocked: 'functions' },
  httpsCallable: (_functions: unknown, name: string) => (payload: unknown) => mockCall(name, payload),
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuthState }));
jest.mock('@bin/shared', () => ({ useLanguage: () => ({ isRTL: mockRTL }) }), { virtual: true });

// eslint-disable-next-line import/first
import FinanceGrantsPage from '../../pages/financials/FinanceGrantsPage';

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const overview = (viewer: any) => ({
  nowMs: NOW,
  viewer,
  pending: [{
    authorizationId: 'auth_1', actionType: 'REGRANT_FINANCE_AUTHORITY', targetUid: 'fa_uid', targetEmail: 'fa@example.invalid',
    targetRole: 'finance_admin', previousRole: 'finance_admin', requesterId: 'founder_uid', requesterEmail: 'ceo@example.invalid',
    requesterRole: 'ceo', createdAtMs: NOW - HOUR, expiresAtMs: NOW + 23 * HOUR, isExpired: false,
    viewerIsRequester: viewer.uid === 'founder_uid', viewerIsTarget: viewer.uid === 'fa_uid',
    viewerCanApprove: viewer.uid !== 'founder_uid', viewerCanReject: viewer.uid !== 'founder_uid',
  }],
  financeAccounts: [{
    uid: 'fa_uid', email: 'fa@example.invalid', displayName: 'Finance Admin', role: 'finance_admin', status: 'ACTIVE', active: true,
    explicitClaim: true, totpEnrolled: true, financeApprovalPending: false, grantedAtMs: NOW - 30 * HOUR, grantAgeMs: 30 * HOUR,
    grantExpiresAtMs: NOW - 6 * HOUR, grantFresh: false, pendingRegrant: true, viewerIsTarget: false, viewerCanRequestRegrant: false,
  }],
});

beforeEach(() => {
  mockCall.mockReset();
  mockRTL = false;
});

test('roles outside Super Admin / CEO / Finance Controller see no data and nothing is called', () => {
  mockAuthState = { user: { role: 'finance_admin', claims: { role: 'finance_admin' } }, mfaVerified: true };
  render(<FinanceGrantsPage />);
  expect(screen.getByTestId('finance-grants-not-authorized')).toBeInTheDocument();
  expect(mockCall).not.toHaveBeenCalled();
});

test('without a verified MFA session nothing is loaded', () => {
  mockAuthState = { user: { role: 'ceo', claims: { role: 'ceo', ceo: true } }, mfaVerified: false };
  render(<FinanceGrantsPage />);
  expect(screen.getByTestId('finance-grants-mfa-required')).toBeInTheDocument();
  expect(mockCall).not.toHaveBeenCalled();
});

test('the requester sees Approve disabled with the reason; re-grant shows expired grant and pending state', async () => {
  mockAuthState = { user: { uid: 'founder_uid', role: 'ceo', claims: { role: 'ceo', ceo: true } }, mfaVerified: true };
  mockCall.mockResolvedValue({ data: overview({ uid: 'founder_uid', role: 'ceo', canRequest: true, canApprove: true }) });
  render(<FinanceGrantsPage />);
  const row = await screen.findByTestId('finance-grant-auth_1');
  expect(within(row).getByTestId('finance-grant-approve')).toBeDisabled();
  expect(within(row).getByTestId('finance-grant-reject')).toBeDisabled();
  expect(within(row).getByText(/A different person must approve it/)).toBeInTheDocument();
  const account = screen.getByTestId('finance-account-fa_uid');
  expect(within(account).getByText(/Expired or missing/)).toBeInTheDocument();
  expect(within(account).getByTestId('finance-account-request-regrant')).toBeDisabled();
  expect(mockCall).toHaveBeenCalledWith('adminListFinanceGrantOverview', {});
});

test('an independent approver must confirm before the approve callable is sent', async () => {
  mockAuthState = { user: { uid: 'second_uid', role: 'super_admin', claims: { role: 'super_admin', super_admin: true } }, mfaVerified: true };
  mockCall.mockImplementation((name: string) => Promise.resolve({ data: name === 'adminListFinanceGrantOverview' ? overview({ uid: 'second_uid', role: 'super_admin', canRequest: true, canApprove: true }) : { success: true } }));
  render(<FinanceGrantsPage />);
  const row = await screen.findByTestId('finance-grant-auth_1');
  fireEvent.click(within(row).getByTestId('finance-grant-approve'));
  const submit = await screen.findByTestId('finance-grant-approve-submit');
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByLabelText('independent review confirmation'));
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(mockCall).toHaveBeenCalledWith('adminApproveFinanceRoleAssignment', { authorizationId: 'auth_1' }));
});

test('Arabic copy renders', async () => {
  mockRTL = true;
  mockAuthState = { user: { uid: 'fc_uid', role: 'finance_controller', claims: { role: 'finance_controller', finance_controller: true } }, mfaVerified: true };
  mockCall.mockResolvedValue({ data: overview({ uid: 'fc_uid', role: 'finance_controller', canRequest: false, canApprove: true }) });
  render(<FinanceGrantsPage />);
  expect(await screen.findByText('صلاحيات المالية')).toBeInTheDocument();
  expect(await screen.findByText('الطلبات المعلقة')).toBeInTheDocument();
});
