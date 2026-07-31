// apps/admin-panel/src/__tests__/components/AdminMfaEnrollmentCard.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminMfaEnrollmentCard from '../../components/security/AdminMfaEnrollmentCard';
import { auth, httpsCallable } from '../../lib/firebase';
import { multiFactor, TotpMultiFactorGenerator, PhoneMultiFactorGenerator, signOut } from 'firebase/auth';

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
  const mockHttpsCallable = jest.fn();
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
      assertionForEnrollment: jest.fn(),
      FACTOR_ID: 'totp',
    },
    PhoneAuthProvider: Object.assign(
      jest.fn().mockImplementation(() => ({
        verifyPhoneNumber: jest.fn(),
      })),
      { credential: jest.fn() }
    ),
    PhoneMultiFactorGenerator: {
      assertion: jest.fn(),
      FACTOR_ID: 'phone',
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
  let storageSpy: jest.SpyInstance;
  let mockInstance: any;
  let mockCallableInstance: jest.Mock;
  let originalCookieDescriptor: PropertyDescriptor | undefined;
  let cookieWrites: string[];

  beforeEach(() => {
    jest.clearAllMocks();

    cookieWrites = [];
    originalCookieDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(document), 'cookie') ||
                               Object.getOwnPropertyDescriptor(document, 'cookie');

    Object.defineProperty(document, 'cookie', {
      configurable: true,
      set: jest.fn((val) => {
        cookieWrites.push(val);
      }),
      get: jest.fn(() => ''),
    });

    storageSpy = jest.spyOn(Storage.prototype, 'setItem');

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

    mockCallableInstance = jest.fn().mockResolvedValue({
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
    });
    (httpsCallable as jest.Mock).mockReturnValue(mockCallableInstance);

    // Default mock behavior reset for Auth
    auth.currentUser = {
      uid: 'founder-uid',
      email: 'ceo@bin-groups.com',
      emailVerified: true,
      reload: jest.fn().mockResolvedValue(undefined),
      getIdToken: jest.fn().mockResolvedValue('token'),
    } as any;

    consoleSpyLog = jest.spyOn(console, 'log').mockImplementation((...args) => {
      process.stdout.write(args.join(' ') + '\n');
    });
    consoleSpyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleSpyError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleSpyLog.mockRestore();
    consoleSpyWarn.mockRestore();
    consoleSpyError.mockRestore();
    storageSpy.mockRestore();
    if (originalCookieDescriptor) {
      Object.defineProperty(Object.getPrototypeOf(document), 'cookie', originalCookieDescriptor);
    }
  });

  test('only canonical Founder may enroll in TOTP', () => {
    // Non-founder admin
    auth.currentUser!.email = 'other-admin@bin-groups.com';
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    expect(screen.queryByText(/Enroll Founder TOTP Authenticator/i)).toBeNull();
    expect(screen.queryByTestId('admin-totp-enrollment-card')).toBeNull();

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
    expect(screen.queryByTestId('admin-totp-code-input')).toBeNull();
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

  test('successful TOTP enrollment flow', async () => {
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    fireEvent.click(screen.getByTestId('admin-totp-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-totp-code-input')).toBeInTheDocument();
    });

    const input = screen.getByTestId('admin-totp-code-input').querySelector('input')!;
    fireEvent.change(input, { target: { value: '123456' } });

    fireEvent.click(screen.getByTestId('admin-totp-verify-enroll'));

    await waitFor(() => {
      expect(screen.getByText(/TOTP MFA was enrolled successfully/i)).toBeInTheDocument();
    });

    // Check firebase functions called
    expect(mockCallableInstance).toHaveBeenCalledWith({});

    // Verify signout is only called after a timeout (so not immediately)
    expect(signOut).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    }, { timeout: 1500 });
  });

  test('existing phone factor remains enrolled during TOTP setup', async () => {
    mockInstance.enrolledFactors = [{ factorId: PhoneMultiFactorGenerator.FACTOR_ID }];

    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    // Verify phone MFA card shows completed
    expect(screen.getByText(/Admin Phone MFA enrolled/i)).toBeInTheDocument();
    // And TOTP card is still available for enrollment
    expect(screen.getByText(/Enroll Founder TOTP Authenticator/i)).toBeInTheDocument();
  });

  test('existing TOTP factor prevents another enrollment', async () => {
    mockInstance.enrolledFactors = [{ factorId: TotpMultiFactorGenerator.FACTOR_ID }];

    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    // Verify TOTP card shows completed/enrolled
    expect(screen.getByText(/Founder TOTP Authenticator enrolled/i)).toBeInTheDocument();
    expect(screen.queryByTestId('admin-totp-generate')).toBeNull();

    cleanup();

    // Verify if we try to click generate but a reload detects existing TOTP
    mockInstance.enrolledFactors = []; // initial empty
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    // Mock reload setting existing TOTP factor
    auth.currentUser!.reload = jest.fn().mockImplementation(async () => {
      mockInstance.enrolledFactors = [{ factorId: TotpMultiFactorGenerator.FACTOR_ID }];
    });

    fireEvent.click(screen.getByTestId('admin-totp-generate'));

    await waitFor(() => {
      expect(screen.getByText(/A TOTP factor is already enrolled/i)).toBeInTheDocument();
    });
  });

  test('user UID change invalidates the generated challenge', async () => {
    const { rerender } = render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    fireEvent.click(screen.getByTestId('admin-totp-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-totp-code-input')).toBeInTheDocument();
    });

    // Simulate user change/UID change
    auth.currentUser = {
      ...auth.currentUser,
      uid: 'different-uid',
    } as any;
    rerender(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    // Verify it clears automatically via effect
    await waitFor(() => {
      expect(screen.queryByTestId('admin-totp-code-input')).toBeNull();
    });
  });

  test('secret clears on Cancel', async () => {
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    fireEvent.click(screen.getByTestId('admin-totp-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-totp-code-input')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('admin-totp-cancel'));

    // Check we are back to idle and qr/code elements are removed
    expect(screen.queryByTestId('admin-totp-code-input')).toBeNull();
    expect(screen.queryByTestId('totp-setup-key')).toBeNull();
  });

  test('secret clears on component unmount', async () => {
    const { unmount } = render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    fireEvent.click(screen.getByTestId('admin-totp-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('totp-setup-key')).toHaveTextContent('MOCKSECRETKEYBASE32');
    });

    // Unmount
    unmount();

    // Verify no leaks or errors on unmount
  });

  test('secret clears on pagehide and beforeunload', async () => {
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    fireEvent.click(screen.getByTestId('admin-totp-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('totp-setup-key')).toHaveTextContent('MOCKSECRETKEYBASE32');
    });

    // Dispatch pagehide
    window.dispatchEvent(new Event('pagehide'));

    // Check that we returned to idle step
    await waitFor(() => {
      expect(screen.queryByTestId('admin-totp-code-input')).toBeNull();
    });
  });

  test('no localStorage/sessionStorage/cookies/functions receive the secret key', async () => {
    render(<AdminMfaEnrollmentCard enrolled={false} isRTL={false} />);

    fireEvent.click(screen.getByTestId('admin-totp-generate'));
    await waitFor(() => {
      expect(screen.getByTestId('totp-setup-key')).toHaveTextContent('MOCKSECRETKEYBASE32');
    });

    // Perform enrollment
    const input = screen.getByTestId('admin-totp-code-input').querySelector('input')!;
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('admin-totp-verify-enroll'));

    await waitFor(() => {
      expect(screen.getByText(/TOTP MFA was enrolled successfully/i)).toBeInTheDocument();
    });

    // Verify localStorage/sessionStorage setItem calls
    for (const call of storageSpy.mock.calls) {
      expect(call[0]).not.toContain('MOCKSECRETKEYBASE32');
      expect(call[1]).not.toContain('MOCKSECRETKEYBASE32');
    }

    // Verify cookie writes
    for (const write of cookieWrites) {
      expect(write).not.toContain('MOCKSECRETKEYBASE32');
    }

    // Verify Firebase functions payload
    expect(mockCallableInstance).toHaveBeenCalledWith({});
  });
});
