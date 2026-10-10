import admin from 'firebase-admin';
import { generateTotp } from './totp.mjs';

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const FINANCE_ROLES = new Set(['admin', 'super_admin', 'ceo', 'finance_admin']);

// Include only recognized provider codes, never arbitrary response text or credentials.
const providerCode = (payload) => {
  const code = text(payload?.error?.message).split(/\s|:/)[0];
  return /^[A-Z][A-Z0-9_]{1,79}$/.test(code) ? code : 'UNKNOWN_PROVIDER_ERROR';
};

// Separate from the canonical Founder helper: no Founder cache or fallback identity.
export async function signInFinanceApproverMfa({
  apiKey, email, password, totpSecret, recorderUid,
  referer = 'https://bin-group-admin-panel.web.app/',
  fetchImpl = fetch,
  verifyIdTokenImpl = (token) => admin.auth().verifyIdToken(token, true),
  nowImpl = () => Date.now(),
  waitImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const expectedEmail = lower(email);
  if (!text(apiKey) || !expectedEmail || !text(password) || !text(totpSecret) || !text(recorderUid)) {
    throw new Error('Distinct Finance Admin email, password, TOTP secret and recorder UID are required.');
  }
  const request = async (endpoint, data) => {
    const url = new URL(`https://identitytoolkit.googleapis.com/${endpoint}`);
    url.searchParams.set('key', apiKey);
    const response = await fetchImpl(url, {
      method: 'POST', headers: { 'content-type': 'application/json', Referer: referer },
      body: JSON.stringify(data),
    });
    let payload;
    try { payload = await response.json(); } catch { payload = {}; }
    return { ok: response.ok, status: response.status, payload };
  };
  const signedIn = await request('v1/accounts:signInWithPassword', {
    email: expectedEmail, password, returnSecureToken: true,
  });
  if (!signedIn.ok) throw new Error(`Finance Admin first-factor sign-in failed (HTTP ${signedIn.status}): ${providerCode(signedIn.payload)}.`);
  const factors = Array.isArray(signedIn.payload.mfaInfo) ? signedIn.payload.mfaInfo : [];
  const factor = factors.find((value) => Boolean(value?.totpInfo) || lower(value?.factorId) === 'totp');
  const enrollmentId = text(factor?.mfaEnrollmentId);
  let idToken = text(signedIn.payload.idToken);
  if (!idToken) {
    const pendingCredential = text(signedIn.payload.mfaPendingCredential);
    if (!pendingCredential || !enrollmentId) throw new Error('Finance Admin has no enrolled TOTP challenge.');
    const finalize = () => request('v2/accounts/mfaSignIn:finalize', {
      mfaPendingCredential: pendingCredential, mfaEnrollmentId: enrollmentId,
      totpVerificationInfo: { verificationCode: generateTotp(totpSecret, nowImpl()) },
    });
    const remaining = () => 30_000 - (nowImpl() % 30_000);
    if (remaining() < 10_000) await waitImpl(remaining() + 250);
    let result = await finalize();
    if (!result.ok && result.status === 400 && /INVALID_VERIFICATION_CODE|INVALID_CODE|CODE_EXPIRED|INCORRECT|EXPIRED/i.test(text(result.payload?.error?.message))) {
      await waitImpl(remaining() + 250);
      result = await finalize();
    }
    if (!result.ok || !text(result.payload.idToken)) throw new Error(`Finance Admin TOTP sign-in failed: ${providerCode(result.payload)}.`);
    idToken = text(result.payload.idToken);
  }
  if (idToken.split('.').length !== 3) throw new Error('Finance Admin ID token is malformed.');
  let decoded;
  try { decoded = await verifyIdTokenImpl(idToken, true); }
  catch { throw new Error('Firebase rejected the Finance Admin MFA ID token.'); }
  const uid = text(decoded?.uid || decoded?.sub);
  const role = lower(decoded?.role || decoded?.userRole || decoded?.primaryRole);
  const authorized = FINANCE_ROLES.has(role) || ['admin', 'isAdmin', 'superAdmin', 'super_admin', 'ceo'].some((key) => decoded?.[key] === true);
  if (!uid || uid === text(recorderUid)) throw new Error('Payment approval requires a different Finance Admin UID.');
  if (lower(decoded?.email) !== expectedEmail || decoded?.email_verified !== true || decoded?.suspended === true || !authorized) {
    throw new Error('Finance Admin token lacks verified identity or Finance Admin authority.');
  }
  const secondFactorType = lower(decoded?.firebase?.sign_in_second_factor);
  const secondFactorIdentifier = text(decoded?.firebase?.second_factor_identifier);
  if (secondFactorType !== 'totp' || !secondFactorIdentifier || (enrollmentId && secondFactorIdentifier !== enrollmentId)) {
    throw new Error('Finance Admin token lacks the verified TOTP challenge binding.');
  }
  return { idToken, uid, secondFactorType, secondFactorIdentifier };
}
