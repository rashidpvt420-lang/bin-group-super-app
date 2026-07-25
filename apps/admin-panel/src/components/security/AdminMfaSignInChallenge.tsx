import React from 'react';
import type { MultiFactorInfo, MultiFactorResolver } from 'firebase/auth';
import {
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
} from 'firebase/auth';
import { KeyRound, MessageSquareText, RefreshCw, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase';

type Props = {
  resolver: MultiFactorResolver;
  onResolved: () => void;
  onCancel: () => void;
};

const maskPhone = (value: string) => {
  const phone = String(value || '').trim();
  if (phone.length < 7) return '••••';
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
};

const phoneValue = (hint: MultiFactorInfo) => {
  const candidate = hint as MultiFactorInfo & { phoneNumber?: string };
  return candidate.phoneNumber || '';
};

export default function AdminMfaSignInChallenge({ resolver, onResolved, onCancel }: Props) {
  const phoneHints = React.useMemo(
    () => resolver.hints.filter((hint) => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID),
    [resolver],
  );
  const [selectedUid, setSelectedUid] = React.useState(phoneHints[0]?.uid || '');
  const [verificationId, setVerificationId] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const verifierRef = React.useRef<RecaptchaVerifier | null>(null);
  const recaptchaId = 'admin-mfa-signin-recaptcha';

  React.useEffect(() => () => {
    verifierRef.current?.clear();
    verifierRef.current = null;
  }, []);

  const clearChallenge = () => {
    verifierRef.current?.clear();
    verifierRef.current = null;
    setVerificationId('');
    setCode('');
    setError('');
    setNotice('');
  };

  const friendlyError = (mfaError: unknown) => {
    const codeValue = typeof mfaError === 'object' && mfaError !== null && 'code' in mfaError
      ? String((mfaError as { code?: unknown }).code || '')
      : '';
    if (codeValue === 'auth/invalid-verification-code') return 'The MFA verification code is incorrect.';
    if (codeValue === 'auth/code-expired') return 'The MFA verification code expired. Request another code.';
    if (codeValue === 'auth/too-many-requests') return 'Too many MFA attempts. Try again later.';
    return 'Admin MFA verification failed.';
  };

  const sendCode = async () => {
    const hint = phoneHints.find((candidate) => candidate.uid === selectedUid) || phoneHints[0];
    if (!hint) {
      setError('No supported phone MFA factor is enrolled for this Admin account.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      verifierRef.current?.clear();
      verifierRef.current = new RecaptchaVerifier(auth, recaptchaId, { size: 'invisible' });
      const provider = new PhoneAuthProvider(auth);
      const id = await provider.verifyPhoneNumber({
        multiFactorHint: hint,
        session: resolver.session,
      }, verifierRef.current);
      setVerificationId(id);
      setCode('');
      setNotice('Firebase sent an MFA code to the enrolled Admin phone.');
    } catch (mfaError) {
      clearChallenge();
      setError(friendlyError(mfaError));
    } finally {
      verifierRef.current?.clear();
      verifierRef.current = null;
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!verificationId || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError('');
    try {
      const credential = PhoneAuthProvider.credential(verificationId, code);
      const assertion = PhoneMultiFactorGenerator.assertion(credential);
      await resolver.resolveSignIn(assertion);
      onResolved();
    } catch (mfaError) {
      setError(friendlyError(mfaError));
    } finally {
      setBusy(false);
    }
  };

  if (!phoneHints.length) {
    return (
      <div data-testid="admin-mfa-unsupported" className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
        This Admin account has no supported phone MFA factor. Contact the security administrator.
      </div>
    );
  }

  return (
    <div data-testid="admin-mfa-signin-challenge" className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-[#C6A75E]/30 bg-[#C6A75E]/10 p-4">
        <ShieldCheck className="w-5 h-5 text-[#C6A75E] shrink-0 mt-0.5" />
        <div>
          <div className="text-white font-black text-sm">Admin MFA required</div>
          <div className="text-[#94a3b8] text-xs mt-1">Complete the enrolled Firebase second factor before the Admin portal opens.</div>
        </div>
      </div>

      {phoneHints.length > 1 && (
        <label className="block text-xs text-[#94a3b8] font-bold">
          Enrolled factor
          <select
            data-testid="admin-mfa-factor-select"
            value={selectedUid}
            onChange={(event) => {
              setSelectedUid(event.target.value);
              clearChallenge();
            }}
            disabled={busy || Boolean(verificationId)}
            className="mt-2 w-full bg-[#1e293b] border border-white/10 rounded-xl px-4 py-3 text-white"
          >
            {phoneHints.map((hint, index) => (
              <option key={hint.uid} value={hint.uid}>
                {hint.displayName || `Admin phone ${index + 1}`} {maskPhone(phoneValue(hint))}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-bold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs font-bold">{notice}</div>}

      {!verificationId ? (
        <button
          data-testid="admin-mfa-send-signin-code"
          type="button"
          onClick={sendCode}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-[#C6A75E] text-black font-black py-4 rounded-xl disabled:opacity-50"
        >
          {busy ? 'Sending…' : <><MessageSquareText className="w-5 h-5" /> Send MFA code</>}
        </button>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs text-[#94a3b8] font-bold">
            6-digit MFA code
            <input
              data-testid="admin-mfa-signin-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              disabled={busy}
              className="mt-2 w-full bg-[#1e293b] border border-white/10 rounded-xl px-4 py-3 text-white"
            />
          </label>
          <button
            data-testid="admin-mfa-resolve-signin"
            type="button"
            onClick={verifyCode}
            disabled={busy || code.length !== 6}
            className="w-full flex items-center justify-center gap-2 bg-[#C6A75E] text-black font-black py-4 rounded-xl disabled:opacity-50"
          >
            {busy ? 'Verifying…' : <><KeyRound className="w-5 h-5" /> Verify MFA and sign in</>}
          </button>
          <button
            data-testid="admin-mfa-resend-signin-code"
            type="button"
            onClick={clearChallenge}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 text-[#C6A75E] font-black py-2"
          >
            <RefreshCw className="w-4 h-4" /> Request another code
          </button>
        </div>
      )}

      <button
        data-testid="admin-mfa-cancel-signin"
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="w-full text-[#94a3b8] text-xs font-bold py-2"
      >
        Cancel and return to credential login
      </button>
      <div id={recaptchaId} />
    </div>
  );
}
