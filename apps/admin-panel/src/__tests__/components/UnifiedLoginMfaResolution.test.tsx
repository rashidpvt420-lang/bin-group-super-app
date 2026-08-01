import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UnifiedLogin from '../../components/UnifiedLogin';
import { useAuth } from '../../context/AuthContext';
import { getMultiFactorResolver, signOut } from 'firebase/auth';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@bin/shared', () => ({
  __esModule: true,
  useLanguage: () => ({ t: (key: string) => key, isRTL: false }),
}), { virtual: true });

jest.mock('../../components/security/AdminMfaSignInChallenge', () => {
  return function MockAdminMfaSignInChallenge(props: { onResolved: () => void; onCancel: () => void }) {
    return (
      <div data-testid="mfa-challenge">
        <button type="button" onClick={props.onResolved}>Resolve MFA</button>
        <button type="button" onClick={props.onCancel}>Cancel MFA</button>
      </div>
    );
  };
});

jest.mock('firebase/app', () => ({
  __esModule: true,
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}));

jest.mock('firebase/auth', () => {
  const g = global as any;
  if (!g.__mockFocusedSignIn) g.__mockFocusedSignIn = jest.fn();
  if (!g.__mockFocusedPersistence) g.__mockFocusedPersistence = jest.fn(() => Promise.resolve());

  return {
    __esModule: true,
    getAuth: jest.fn(() => ({ config: { authDomain: 'test-domain.firebaseapp.com' } })),
    browserLocalPersistence: 'browserLocalPersistence',
    setPersistence: (...args: any[]) => g.__mockFocusedPersistence(...args),
    signInWithEmailAndPassword: (...args: any[]) => g.__mockFocusedSignIn(...args),
    getMultiFactorResolver: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    signOut: jest.fn(),
  };
});

jest.mock('firebase/firestore', () => ({ getFirestore: jest.fn(), connectFirestoreEmulator: jest.fn() }));
jest.mock('firebase/storage', () => ({ getStorage: jest.fn() }));
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn() }));
jest.mock('firebase/messaging', () => ({ getMessaging: jest.fn() }));
jest.mock('firebase/app-check', () => ({ initializeAppCheck: jest.fn(), ReCaptchaV3Provider: jest.fn() }));

describe('UnifiedLogin MFA authorization handoff', () => {
  const originalLocation = window.location;
  const g = global as any;

  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '', replace: jest.fn(), href: 'http://localhost/login' },
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    window.location.search = '';
    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: false,
      status: 'idle',
    });
    g.__mockFocusedPersistence.mockResolvedValue(undefined);
    (signOut as jest.Mock).mockResolvedValue(undefined);
  });

  const enterPrimaryCredential = async () => {
    const mfaError = Object.assign(new Error('MFA required'), { code: 'auth/multi-factor-auth-required' });
    g.__mockFocusedSignIn.mockRejectedValueOnce(mfaError);
    (getMultiFactorResolver as jest.Mock).mockReturnValueOnce({ hints: [], session: {} });

    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'founder@example.test' } });
    fireEvent.change(screen.getByPlaceholderText('login.password'), { target: { value: 'not-a-real-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signin' }));

    await waitFor(() => expect(screen.getByTestId('mfa-challenge')).toBeInTheDocument());
  };

  test('resolved MFA waits for authorized claims/profile checks, then navigates once without another primary sign-in', async () => {
    window.location.search = '?returnTo=%2Fprofile%3Ftab%3Dmfa';
    const { rerender } = render(<UnifiedLogin />);

    await enterPrimaryCredential();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve MFA' }));

    expect(screen.getByText('common.auth_sync')).toBeInTheDocument();
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();

    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: true,
      status: 'authorized',
    });
    rerender(<UnifiedLogin />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile?tab=mfa', { replace: true });
    });
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
  });

  test('authorization failure after MFA remains fail-closed and does not navigate', async () => {
    const { rerender } = render(<UnifiedLogin />);

    await enterPrimaryCredential();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve MFA' }));

    (useAuth as jest.Mock).mockReturnValue({
      error: 'Access denied: missing or invalid Admin claims.',
      isAuthenticated: false,
      status: 'failed',
    });
    rerender(<UnifiedLogin />);

    expect(await screen.findByText('Access denied: missing or invalid Admin claims.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'login.signin' })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
  });

  test('an already authorized session leaves login and rejects an external returnTo', async () => {
    window.location.search = '?returnTo=https%3A%2F%2Fevil.example%2Fsteal';
    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: true,
      status: 'authorized',
    });

    render(<UnifiedLogin />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  test('does not navigate while authorization checks are still running', () => {
    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: true,
      status: 'verifying-profile',
    });

    render(<UnifiedLogin />);

    expect(screen.getByText('common.auth_sync')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
