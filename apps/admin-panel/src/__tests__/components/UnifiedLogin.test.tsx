import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import UnifiedLogin from '../../components/UnifiedLogin';
import { useAuth } from '../../context/AuthContext';

// We import the direct NPM modules used by UnifiedLogin to configure their mocks,
// but for the ones wrapped by firebase.ts we use global delegates.
import { getMultiFactorResolver, sendPasswordResetEmail, signOut } from 'firebase/auth';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ state: null, search: '?email=admin@bingroup.com' }),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@bin/shared', () => ({
  __esModule: true,
  useLanguage: () => ({ t: (k: string) => k, isRTL: false }),
}));

jest.mock('../../components/security/AdminMfaSignInChallenge', () => {
  return function MockAdminMfaSignInChallenge() {
    return <div data-testid="mfa-challenge">MFA Challenge</div>;
  };
});

// 1. Factory for firebase/app
jest.mock('firebase/app', () => ({
  __esModule: true,
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}));

// 2. Factory for firebase/auth using global delegates to guarantee reference equality
jest.mock('firebase/auth', () => {
  const g = global as any;
  if (!g.__mockSignIn) g.__mockSignIn = jest.fn();
  if (!g.__mockSetPersistence) g.__mockSetPersistence = jest.fn(() => Promise.resolve());
  
  return {
    __esModule: true,
    getAuth: jest.fn(() => ({ config: { authDomain: 'test-domain.firebaseapp.com' } })),
    browserLocalPersistence: 'browserLocalPersistence',
    setPersistence: (...args: any[]) => g.__mockSetPersistence(...args),
    signInWithEmailAndPassword: (...args: any[]) => g.__mockSignIn(...args),
    getMultiFactorResolver: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    signOut: jest.fn(),
  };
});

// Remaining Firebase services
jest.mock('firebase/firestore', () => ({ getFirestore: jest.fn(), connectFirestoreEmulator: jest.fn() }));
jest.mock('firebase/storage', () => ({ getStorage: jest.fn() }));
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn() }));
jest.mock('firebase/messaging', () => ({ getMessaging: jest.fn() }));
jest.mock('firebase/app-check', () => ({ initializeAppCheck: jest.fn(), ReCaptchaV3Provider: jest.fn() }));

describe('UnifiedLogin', () => {
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

    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: false,
      status: 'idle',
      retryAuthorization: jest.fn(),
    });

    g.__mockSignIn.mockReset();
    g.__mockSetPersistence.mockReset();
    
    g.__mockSignIn.mockReturnValue(new Promise(() => {}));
    g.__mockSetPersistence.mockResolvedValue(undefined);
    (signOut as jest.Mock).mockResolvedValue(undefined);
  });

  test('1. renders the email/password login form by default', () => {
    render(<UnifiedLogin />);
    expect(screen.getByPlaceholderText('login.email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('login.password')).toBeInTheDocument();
  });

  test('2. pre-fills email from URL parameters', () => {
    window.location.search = '?email=admin@bingroup.com';
    render(<UnifiedLogin />);
    expect(screen.getByDisplayValue('admin@bingroup.com')).toBeInTheDocument();
    window.location.search = ''; // reset
  });

  test('3. sets loading and calls signInWithEmailAndPassword', async () => {
    g.__mockSignIn.mockResolvedValueOnce({ user: { uid: '123' } });
    render(<UnifiedLogin />);
    
    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'test@admin.com' } });
    fireEvent.change(screen.getByPlaceholderText('login.password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signin' }));

    expect(screen.getByText('common.auth_sync')).toBeInTheDocument();
    await waitFor(() => {
      expect(g.__mockSignIn).toHaveBeenCalledTimes(1);
    });
  });

  test('4. handles auth/wrong-password mapped error', async () => {
    const error = Object.assign(new Error('Wrong'), { code: 'auth/wrong-password' });
    g.__mockSignIn.mockRejectedValueOnce(error);
    
    render(<UnifiedLogin />);
    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'test@admin.com' } });
    fireEvent.change(screen.getByPlaceholderText('login.password'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signin' }));

    await waitFor(() => {
      expect(screen.getByText(/admin email or password is incorrect/i)).toBeInTheDocument();
    });
  });

  test('5. handles auth/multi-factor-auth-required by showing MFA challenge', async () => {
    const mfaError = Object.assign(new Error('MFA'), { code: 'auth/multi-factor-auth-required' });
    g.__mockSignIn.mockRejectedValueOnce(mfaError);
    (getMultiFactorResolver as jest.Mock).mockReturnValueOnce({ hints: [] });
    
    render(<UnifiedLogin />);
    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'test@admin.com' } });
    fireEvent.change(screen.getByPlaceholderText('login.password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signin' }));

    await waitFor(() => {
      expect(screen.getByTestId('mfa-challenge')).toBeInTheDocument();
    });
  });

  test('6. does not log passwords when handling auth errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('Network'), { code: 'auth/network-request-failed' });
    g.__mockSignIn.mockRejectedValueOnce(error);
    
    render(<UnifiedLogin />);
    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'secret@admin.com' } });
    fireEvent.change(screen.getByPlaceholderText('login.password'), { target: { value: 'SUPER_SECRET_PASSWORD' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signin' }));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
      const logContent = JSON.stringify(consoleSpy.mock.calls[0]);
      expect(logContent).not.toContain('SUPER_SECRET_PASSWORD');
      expect(logContent).toContain('sec***@admin.com');
    });
    consoleSpy.mockRestore();
  });

  test('7. handles ADMIN_SIGN_IN_TIMEOUT', async () => {
    jest.useFakeTimers();
    g.__mockSignIn.mockReturnValueOnce(new Promise(() => {}));
    
    render(<UnifiedLogin />);
    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'test@admin.com' } });
    fireEvent.change(screen.getByPlaceholderText('login.password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signin' }));
    
    await waitFor(() => {
      expect(g.__mockSignIn).toHaveBeenCalled();
    });
    
    act(() => {
      jest.advanceTimersByTime(25000); // Exceeds 20_000ms
    });

    await waitFor(() => {
      expect(screen.getByText(/did not respond within 20 seconds/i)).toBeInTheDocument();
    });
    jest.useRealTimers();
  });

  test('8. clears loading state if useAuth status becomes failed', () => {
    const { rerender } = render(<UnifiedLogin />);
    
    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('login.password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signin' }));

    (useAuth as jest.Mock).mockReturnValue({
      error: 'Invalid Admin Claims',
      isAuthenticated: false,
      status: 'failed',
      retryAuthorization: jest.fn(),
    });
    
    rerender(<UnifiedLogin />);
    
    expect(screen.getByText('Invalid Admin Claims')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'login.signin' })).not.toBeDisabled();
  });

  test('9. displays useAuth error prop', () => {
    (useAuth as jest.Mock).mockReturnValue({
      error: 'Context Error Message',
      isAuthenticated: false,
      status: 'failed',
      retryAuthorization: jest.fn(),
    });
    render(<UnifiedLogin />);
    expect(screen.getByText('Context Error Message')).toBeInTheDocument();
  });

  test('10. shows loader when useAuth status is verifying-token', () => {
    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: false,
      status: 'verifying-token',
      retryAuthorization: jest.fn(),
    });
    render(<UnifiedLogin />);
    expect(screen.getByText('common.auth_sync')).toBeInTheDocument();
  });

  test('11. shows loader when useAuth status is verifying-profile', () => {
    (useAuth as jest.Mock).mockReturnValue({
      error: null,
      isAuthenticated: false,
      status: 'verifying-profile',
      retryAuthorization: jest.fn(),
    });
    render(<UnifiedLogin />);
    expect(screen.getByText('common.auth_sync')).toBeInTheDocument();
  });

  test('12. handles reset password email success', async () => {
    (sendPasswordResetEmail as jest.Mock).mockResolvedValueOnce(undefined);
    render(<UnifiedLogin />);
    
    fireEvent.change(screen.getByPlaceholderText('login.email'), { target: { value: 'admin@bingroup.com' } });
    fireEvent.click(screen.getByText('login.forgot_password'));

    await waitFor(() => {
      expect(screen.getByText(/Password reset email sent. Check your inbox./i)).toBeInTheDocument();
    });
  });

  test('13. reset secure session correctly signs out and replaces window location', async () => {
    render(<UnifiedLogin />);
    fireEvent.click(screen.getByText(/Reset secure session/i));
    
    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalledWith('/login?email=admin%40bingroup.com&session=reset');
    });
  });
});
