import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UnifiedLogin from '../../components/UnifiedLogin';
import { useAuth } from '../../context/AuthContext';
import { getMultiFactorResolver, signOut } from 'firebase/auth';

const mockNavigate = jest.fn();
const mockRetryAuthorization = jest.fn(() => Promise.resolve());

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
  if (!g.__mockFocusedAuth) g.__mockFocusedAuth = { currentUser: null, config: { authDomain: 'test-domain.firebaseapp.com' } };

  return {
    __esModule: true,
    getAuth: jest.fn(() => g.__mockFocusedAuth),
    browserLocalPersistence: 'browserLocalPersistence',
    browserSessionPersistence: 'browserSessionPersistence',
    inMemoryPersistence: 'inMemoryPersistence',
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
jest.mock('firebase/app-check', () => ({ initializeAppCheck: jest.fn(), ReCaptchaEnterpriseProvider: jest.fn() }));

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
    mockRetryAuthorization.mockResolvedValue(undefined);
    window.location.search = '';
    g.__mockFocusedAuth.currentUser = null;
    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: false,
      retryAuthorization: mockRetryAuthorization,
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

  test('falls back to a bounded in-memory session when mobile browser storage is unavailable', async () => {
    g.__mockFocusedPersistence
      .mockRejectedValueOnce(Object.assign(new Error('storage unavailable'), { code: 'auth/web-storage-unsupported' }))
      .mockResolvedValueOnce(undefined);

    render(<UnifiedLogin />);
    await enterPrimaryCredential();

    expect(g.__mockFocusedPersistence).toHaveBeenNthCalledWith(1, g.__mockFocusedAuth, 'browserSessionPersistence');
    expect(g.__mockFocusedPersistence).toHaveBeenNthCalledWith(2, g.__mockFocusedAuth, 'inMemoryPersistence');
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('admin-persistence-warning')).toHaveTextContent('this Admin session will end when the page reloads');
  });

  test('stops before credential submission when the protected in-memory fallback cannot initialize', async () => {
    g.__mockFocusedPersistence
      .mockRejectedValueOnce(Object.assign(new Error('storage unavailable'), { code: 'auth/web-storage-unsupported' }))
      .mockRejectedValueOnce(Object.assign(new Error('memory timeout'), { code: 'ADMIN_MEMORY_PERSISTENCE_TIMEOUT' }));

    render(<UnifiedLogin />);
    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'founder@example.test' } });
    fireEvent.change(screen.getByPlaceholderText('login.password'), { target: { value: 'not-a-real-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signin' }));

    expect(await screen.findByText('Secure in-memory Admin session could not be initialized. Sign-in was stopped before credentials were submitted.')).toBeInTheDocument();
    expect(g.__mockFocusedPersistence).toHaveBeenCalledTimes(2);
    expect(g.__mockFocusedSignIn).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mfa-challenge')).not.toBeInTheDocument();
  });

  test('resolved MFA recovers a published session when the auth-state listener does not start authorization', async () => {
    window.location.search = '?returnTo=%2Fprofile%3Ftab%3Dmfa';
    const { rerender } = render(<UnifiedLogin />);

    await enterPrimaryCredential();
    g.__mockFocusedAuth.currentUser = { uid: 'founder' };
    fireEvent.click(screen.getByRole('button', { name: 'Resolve MFA' }));

    expect(screen.getByText('common.auth_sync')).toBeInTheDocument();
    await waitFor(() => expect(mockRetryAuthorization).toHaveBeenCalledTimes(1));
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();

    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: true,
      retryAuthorization: mockRetryAuthorization,
      status: 'authorized',
    });
    rerender(<UnifiedLogin />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile?tab=mfa', { replace: true });
    });
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
  });

  test('ignores a failed status that predates the MFA handoff and retries the published session', async () => {
    const { rerender } = render(<UnifiedLogin />);

    await enterPrimaryCredential();
    (useAuth as jest.Mock).mockReturnValue({
      error: 'Firebase Auth did not respond before primary sign-in started.',
      isAuthenticated: false,
      retryAuthorization: mockRetryAuthorization,
      status: 'failed',
    });
    rerender(<UnifiedLogin />);

    g.__mockFocusedAuth.currentUser = { uid: 'founder' };
    fireEvent.click(screen.getByRole('button', { name: 'Resolve MFA' }));

    await waitFor(() => expect(mockRetryAuthorization).toHaveBeenCalledTimes(1));
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('post-MFA handoff failure supersedes a stale pre-MFA context error', async () => {
    const staleError = 'Firebase Auth did not respond before primary sign-in started.';
    const { rerender } = render(<UnifiedLogin />);

    await enterPrimaryCredential();
    (useAuth as jest.Mock).mockReturnValue({
      error: staleError,
      isAuthenticated: false,
      retryAuthorization: mockRetryAuthorization,
      status: 'failed',
    });
    rerender(<UnifiedLogin />);

    g.__mockFocusedAuth.currentUser = { uid: 'founder' };
    mockRetryAuthorization.mockRejectedValueOnce(new Error('authorization could not start'));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve MFA' }));

    expect(screen.getByText('common.auth_sync')).toBeInTheDocument();
    expect(screen.queryByText(staleError)).not.toBeInTheDocument();
    expect(await screen.findByText('MFA was accepted, but secure Admin authorization could not start. Retry or reset the secure session.')).toBeInTheDocument();
    expect(screen.queryByText(staleError)).not.toBeInTheDocument();
  });

  test('does not create a competing retry after the auth-state listener has started verification', async () => {
    const { rerender } = render(<UnifiedLogin />);

    await enterPrimaryCredential();
    g.__mockFocusedAuth.currentUser = { uid: 'founder' };
    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: false,
      retryAuthorization: mockRetryAuthorization,
      status: 'verifying-token',
    });
    rerender(<UnifiedLogin />);

    fireEvent.click(screen.getByRole('button', { name: 'Resolve MFA' }));

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(mockRetryAuthorization).not.toHaveBeenCalled();
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
  });

  test('authorization failure retains the Firebase session and exposes retry and reset actions', async () => {
    const { rerender } = render(<UnifiedLogin />);

    await enterPrimaryCredential();
    g.__mockFocusedAuth.currentUser = { uid: 'founder' };
    fireEvent.click(screen.getByRole('button', { name: 'Resolve MFA' }));

    (useAuth as jest.Mock).mockReturnValue({
      error: 'Access denied: missing or invalid Admin claims.',
      isAuthenticated: false,
      retryAuthorization: mockRetryAuthorization,
      status: 'failed',
    });
    rerender(<UnifiedLogin />);

    expect(await screen.findByText('Access denied: missing or invalid Admin claims.')).toBeInTheDocument();
    expect(screen.getByTestId('admin-retry-authorization')).toBeInTheDocument();
    expect(screen.getByTestId('admin-reset-failed-session')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'login.signin' })).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(g.__mockFocusedSignIn).toHaveBeenCalledTimes(1);
  });

  test('retry action reuses the retained session instead of starting primary sign-in again', async () => {
    g.__mockFocusedAuth.currentUser = { uid: 'founder' };
    (useAuth as jest.Mock).mockReturnValue({
      error: 'Admin profile lookup timed out. Please check your network connection and try again.',
      isAuthenticated: false,
      retryAuthorization: mockRetryAuthorization,
      status: 'failed',
    });

    render(<UnifiedLogin />);
    fireEvent.click(screen.getByTestId('admin-retry-authorization'));

    await waitFor(() => expect(mockRetryAuthorization).toHaveBeenCalledTimes(1));
    expect(g.__mockFocusedSignIn).not.toHaveBeenCalled();
  });

  test('an already authorized session leaves login and rejects an external returnTo', async () => {
    window.location.search = '?returnTo=https%3A%2F%2Fevil.example%2Fsteal';
    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: true,
      retryAuthorization: mockRetryAuthorization,
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
      retryAuthorization: mockRetryAuthorization,
      status: 'verifying-profile',
    });

    render(<UnifiedLogin />);

    expect(screen.getByText('common.auth_sync')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
