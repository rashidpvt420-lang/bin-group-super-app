import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminMfaSignInChallenge from '../../components/security/AdminMfaSignInChallenge';

jest.mock('../../lib/firebase', () => ({
  auth: {},
}));

jest.mock('firebase/auth', () => {
  const g = global as any;

  class MockPhoneAuthProvider {
    static credential(...args: any[]) {
      return g.__mockPhoneCredential(...args);
    }

    verifyPhoneNumber(...args: any[]) {
      return g.__mockVerifyPhoneNumber(...args);
    }
  }

  class MockRecaptchaVerifier {
    clear() {
      g.__mockClearRecaptcha();
    }
  }

  return {
    __esModule: true,
    PhoneAuthProvider: MockPhoneAuthProvider,
    RecaptchaVerifier: MockRecaptchaVerifier,
    PhoneMultiFactorGenerator: {
      FACTOR_ID: 'phone',
      assertion: (...args: any[]) => g.__mockPhoneAssertion(...args),
    },
    TotpMultiFactorGenerator: {
      FACTOR_ID: 'totp',
      assertionForSignIn: (...args: any[]) => g.__mockTotpAssertion(...args),
    },
  };
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('AdminMfaSignInChallenge', () => {
  const g = global as any;

  beforeEach(() => {
    jest.clearAllMocks();
    g.__mockVerifyPhoneNumber = jest.fn();
    g.__mockPhoneCredential = jest.fn((verificationId: string, code: string) => ({ verificationId, code }));
    g.__mockPhoneAssertion = jest.fn((credential: unknown) => ({ factor: 'phone', credential }));
    g.__mockTotpAssertion = jest.fn((uid: string, code: string) => ({ factor: 'totp', uid, code }));
    g.__mockClearRecaptcha = jest.fn();
  });

  test('TOTP success calls onResolved only after Firebase resolves the second factor', async () => {
    const completion = deferred<unknown>();
    const resolver = {
      hints: [{ uid: 'totp-factor', factorId: 'totp', displayName: 'Founder authenticator' }],
      session: {},
      resolveSignIn: jest.fn(() => completion.promise),
    } as any;
    const onResolved = jest.fn();

    render(<AdminMfaSignInChallenge resolver={resolver} onResolved={onResolved} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByTestId('admin-mfa-send-signin-code'));
    fireEvent.change(screen.getByTestId('admin-mfa-signin-code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('admin-mfa-resolve-signin'));

    await waitFor(() => {
      expect(resolver.resolveSignIn).toHaveBeenCalledWith({ factor: 'totp', uid: 'totp-factor', code: '123456' });
    });
    expect(onResolved).not.toHaveBeenCalled();

    await act(async () => {
      completion.resolve({ user: { uid: 'founder' } });
      await completion.promise;
    });

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
  });

  test('phone success keeps reCAPTCHA alive and resolves the Firebase phone assertion before onResolved', async () => {
    const completion = deferred<unknown>();
    g.__mockVerifyPhoneNumber.mockResolvedValueOnce('phone-verification-id');
    const resolver = {
      hints: [{ uid: 'phone-factor', factorId: 'phone', displayName: 'Founder phone', phoneNumber: '+971500000000' }],
      session: { id: 'mfa-session' },
      resolveSignIn: jest.fn(() => completion.promise),
    } as any;
    const onResolved = jest.fn();

    render(<AdminMfaSignInChallenge resolver={resolver} onResolved={onResolved} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByTestId('admin-mfa-send-signin-code'));
    await waitFor(() => expect(g.__mockVerifyPhoneNumber).toHaveBeenCalledTimes(1));
    expect(g.__mockClearRecaptcha).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('admin-mfa-signin-code'), { target: { value: '654321' } });
    fireEvent.click(screen.getByTestId('admin-mfa-resolve-signin'));

    await waitFor(() => {
      expect(g.__mockPhoneCredential).toHaveBeenCalledWith('phone-verification-id', '654321');
      expect(resolver.resolveSignIn).toHaveBeenCalledWith({
        factor: 'phone',
        credential: { verificationId: 'phone-verification-id', code: '654321' },
      });
    });
    expect(onResolved).not.toHaveBeenCalled();

    await act(async () => {
      completion.resolve({ user: { uid: 'founder' } });
      await completion.promise;
    });

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(g.__mockClearRecaptcha).toHaveBeenCalled();
  });

  test('failed MFA remains on the challenge and never reports a resolved session', async () => {
    const resolver = {
      hints: [{ uid: 'totp-factor', factorId: 'totp', displayName: 'Founder authenticator' }],
      session: {},
      resolveSignIn: jest.fn().mockRejectedValue({ code: 'auth/invalid-verification-code' }),
    } as any;
    const onResolved = jest.fn();

    render(<AdminMfaSignInChallenge resolver={resolver} onResolved={onResolved} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByTestId('admin-mfa-send-signin-code'));
    fireEvent.change(screen.getByTestId('admin-mfa-signin-code'), { target: { value: '111111' } });
    fireEvent.click(screen.getByTestId('admin-mfa-resolve-signin'));

    expect(await screen.findByText('The MFA verification code is incorrect.')).toBeInTheDocument();
    expect(screen.getByTestId('admin-mfa-signin-challenge')).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
