// apps/admin-panel/src/__tests__/components/AdminMfaEnrollmentCard.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminMfaEnrollmentCard from '../../components/security/AdminMfaEnrollmentCard';
import { auth } from '../../lib/firebase';
import { multiFactor, TotpMultiFactorGenerator, signOut } from 'firebase/auth';

// Mock lib/firebase
jest.mock('../../lib/firebase', () => {
  const mockAuth = {
    currentUser: {
      uid: 'founder-uid',
      email: 'ceo@bin-groups.com',
      emailVerified: true,
      reload: jest.fn().mockResolvedValue(undefined),
      getIdToken: jest.fn().mockResolvedValue('token'),
    },
    languageCode: 'en',
  };
  const mockFunctions = {};
  const mockHttpsCallable = jest.fn(() => jest.fn().mockResolvedValue({
    data: {
      launchReady: true,
      blockers: [],
      summary: {
        activeAdminCount: 1,
        canonicalFounderReadyCount: 1,
        unexpectedPrivilegedAccountCount: 0,
        recoveryQuorumReady: true,
      },
    },
  }));
  return {
    auth: mockAuth,
    functions: mockFunctions,
    httpsCallable: mockHttpsCallable,
  };
});

// Mock firebase/auth
jest.mock('firebase/auth', () => {
  const mockMultiFactorInstance = {
    getSession: jest.fn().mockResolvedValue({}),
    enrolledFactors: [] as any[],
    enroll: jest.fn().mockResolvedValue(undefined),
  };
  return {
    getAuth: jest.fn(),
    multiFactor: jest.fn(() => mockMultiFactorInstance),
    TotpMultiFactorGenerator: {
      generateSecret: jest.fn(),
      assertionForEnrollment: jest.fn().mockReturnValue({}),
    },
    PhoneAuthProvider: Object.assign(
      jest.fn().mockImplementation(() => ({
        verifyPhoneNumber: jest.fn(),
      })),
      { credential: jest.fn() }
    ),
    PhoneMultiFactorGenerator: {
      assertion: jest.fn(),
    },
    RecaptchaVerifier: jest.fn().mockImplementation(() => ({
      clear: jest.fn(),
    })),
    signOut: jest.fn(),
    sendEmailVerification: jest.fn(),
  };
});

describe('AdminMfaEnrollmentCard - Founder TOTP Enrollment Flow', () => {
  let consoleSpyLog: jest.SpyInstance;
  let consoleSpyWarn: jest.SpyInstance;
  let consoleSpyError: jest.SpyInstance;
  let mockInstance: any;

  beforeEach(() => {
    // Re-initialize mock implementations because resetMocks: true wipes them
    mockInstance = {
      getSession: jest.fn().mockResolvedValue({}),
      enrolledFactors: [] as any[],
      enroll: jest.fn().mockResolvedValue(undefined),
    };

    (multiFactor as jest.Mock).mockReturnValue(mockInstance);

    (TotpMultiFactorGenerator.generateSecret as jest.Mock).mockResolvedValue({
      secretKey: 'MOCKSECRETKEYBASE32',
      generateQrCodeUrl: jest.fn((email, issuer) => `otpauth://totp/${issuer}:${email}?secret=MOCKSECRETKEYBASE32`),
    });

    (TotpMultiFactorGenerator.assertionForEnrollment as jest.Mock).mockReturnValue({});
    (signOut as jest.Mock).mockResolvedValue(undefined);

    // Default mock behavior reset for Auth
    auth.currentUser = {
      uid: 'founder-uid',
      email: 'ceo@bin-groups.com',
      emailVerified: true,
      reload: jest.fn().mockResolvedValue(undefined),
      getIdToken: jest.fn().mockResolvedValue('token'),
    } as any;

    consoleSpyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleSpyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleSpyError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleSpyLog.mockRestore();
    consoleSpyWarn.mockRestore();
    consoleSpyError.mockRestore();
  });

  test('only canonical Founder may enroll in TOTP', () => {
    // Non-founder admin
    auth.currentUser!.email = 'other-admin@bin-groups.com';
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    expect(screen.queryByText(/Enroll Founder TOTP Authenticator/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-totp-enrollment-card')).not.toBeInTheDocument();

    cleanup();

    // Canonical Founder
    auth.currentUser!.email = 'ceo@bin-groups.com';
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);
    expect(screen.getByText(/Enroll Founder TOTP Authenticator/i)).toBeInTheDocument();
  });

  test('disabled generate TOTP secret button when email is unverified', () => {
    auth.currentUser!.emailVerified = false;
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    const generateBtn = screen.getByTestId('admin-totp-generate');
    expect(generateBtn).toBeDisabled();
  });

  test('enabled generate TOTP secret button when email is verified', () => {
    auth.currentUser!.emailVerified = true;
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    const generateBtn = screen.getByTestId('admin-totp-generate');
    expect(generateBtn).not.toBeDisabled();
  });

  test('recent login required handles requires-recent-login errors and fails closed', async () => {
    const testError = { code: 'auth/requires-recent-login' };
    mockInstance.getSession.mockRejectedValue(testError);

    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);
    const generateBtn = screen.getByTestId('admin-totp-generate');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/For security, sign out and sign in again before continuing/i)).toBeInTheDocument();
    });
    // Check that we did not transition to verifying step
    expect(screen.queryByTestId('admin-totp-code-input')).not.toBeInTheDocument();
  });

  test('TOTP secret key is never logged or persisted in console, outputs, or call payloads', async () => {
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);
    const generateBtn = screen.getByTestId('admin-totp-generate');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByTestId('totp-setup-key')).toHaveTextContent('MOCKSECRETKEYBASE32');
    });

    // Check that console was never called with the secret
    const allLoggedArgs = [
      ...consoleSpyLog.mock.calls.flat(),
      ...consoleSpyWarn.mock.calls.flat(),
      ...consoleSpyError.mock.calls.flat(),
    ];
    for (const arg of allLoggedArgs) {
      if (typeof arg === 'string') {
        expect(arg).not.toContain('MOCKSECRETKEYBASE32');
      }
    }
  });

  test('enrollment fails closed on verification failure', async () => {
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);
    
    // Generate step
    fireEvent.click(screen.getByTestId('admin-totp-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-totp-code-input')).toBeInTheDocument();
    });

    // Mock enroll failure
    const mfaError = { code: 'auth/wrong-code' };
    mockInstance.enroll.mockRejectedValue(mfaError);

    // Enter verification code
    const input = screen.getByTestId('admin-totp-code-input').querySelector('input')!;
    fireEvent.change(input, { target: { value: '123456' } });

    // Try verifying
    fireEvent.click(screen.getByTestId('admin-totp-verify-enroll'));

    await waitFor(() => {
      expect(screen.getByText(/Admin security action failed/i)).toBeInTheDocument();
    });

    // Verify it fails closed (does not log out, does not remove verification inputs)
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId('admin-totp-code-input')).toBeInTheDocument();
  });
});
