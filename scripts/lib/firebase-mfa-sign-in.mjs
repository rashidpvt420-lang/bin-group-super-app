import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from '../firebase-admin-bootstrap.mjs';
import { generateTotp } from './totp.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';
const FOUNDER_ROLES = new Set(['ceo', 'super_admin']);

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function providerError(payload, fallback) {
  const code = text(payload?.error?.message || payload?.error?.status);
  return code ? code.slice(0, 180) : fallback;
}

async function defaultVerifyIdToken(idToken) {
  const projectId = resolveFirebaseAdminProjectId();
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Unexpected Firebase project for Founder MFA verification: ${projectId || '(missing)'}.`);
  }
  initializeFirebaseAdmin(admin, projectId);
  return admin.auth().verifyIdToken(idToken, true);
}

function founderRole(decodedToken) {
  const claims = decodedToken || {};
  const explicit = lower(claims.role || claims.userRole || claims.primaryRole);
  if (FOUNDER_ROLES.has(explicit)) return explicit;
  if (claims.ceo === true) return 'ceo';
  if (claims.super_admin === true || claims.superAdmin === true) return 'super_admin';
  return '';
}

async function requireVerifiedTotpMfaToken(token, verifyIdTokenImpl) {
  const idToken = text(token);
  if (idToken.split('.').length !== 3) throw new Error('Firebase ID token is malformed.');

  let decoded;
  try {
    decoded = await verifyIdTokenImpl(idToken, true);
  } catch {
    throw new Error('Firebase Admin SDK rejected the Founder MFA ID token.');
  }

  const uid = text(decoded?.uid || decoded?.user_id || decoded?.sub);
  const email = lower(decoded?.email);
  const secondFactorType = lower(decoded?.firebase?.sign_in_second_factor);
  const secondFactorIdentifier = text(decoded?.firebase?.second_factor_identifier);
  if (!uid) throw new Error('Firebase MFA ID token has no authenticated user identifier.');
  if (email !== CANONICAL_FOUNDER_EMAIL || decoded?.email_verified !== true) {
    throw new Error('Firebase MFA ID token is not bound to the verified canonical Founder email.');
  }
  if (!founderRole(decoded)) {
    throw new Error('Firebase MFA ID token does not carry CEO or Super Admin Founder authority.');
  }
  if (secondFactorType !== 'totp') {
    throw new Error('Firebase sign-in did not produce a verified TOTP second-factor session.');
  }
  if (!secondFactorIdentifier) {
    throw new Error('Firebase TOTP session did not include the verified factor identifier.');
  }
  return {
    uid,
    secondFactorType,
    secondFactorIdentifier,
    // Compatibility alias for existing evidence fields. The value is the
    // unique verified factor identifier, never the constant factor type.
    secondFactor: secondFactorIdentifier,
  };
}

export async function signInWithRequiredTotpMfa({
  apiKey,
  email,
  password,
  totpSecret,
  referer = 'https://admin.bin-groups.com/',
  fetchImpl = fetch,
  verifyIdTokenImpl = defaultVerifyIdToken,
}) {
  const normalizedApiKey = text(apiKey);
  const normalizedEmail = text(email).toLowerCase();
  const normalizedPassword = text(password);
  const normalizedTotpSecret = text(totpSecret);
  if (
    !normalizedApiKey ||
    normalizedEmail !== CANONICAL_FOUNDER_EMAIL ||
    !normalizedPassword
  ) {
    throw new Error('Firebase API key and canonical Founder credentials are required.');
  }
  if (!normalizedTotpSecret) {
    throw new Error('E2E_FOUNDER_TOTP_SECRET is required for automated MFA payment evidence.');
  }

  const signInEndpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
  signInEndpoint.searchParams.set('key', normalizedApiKey);
  const signInResponse = await fetchImpl(signInEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: referer },
    body: JSON.stringify({
      email: normalizedEmail,
      password: normalizedPassword,
      returnSecureToken: true,
    }),
  });
  const signInPayload = await parseJson(signInResponse);
  if (!signInResponse.ok) {
    throw new Error(
      `Firebase first-factor sign-in failed: ${providerError(signInPayload, `HTTP ${signInResponse.status}`)}`,
    );
  }

  const directToken = text(signInPayload?.idToken);
  if (directToken) {
    const verified = await requireVerifiedTotpMfaToken(directToken, verifyIdTokenImpl);
    return { idToken: directToken, ...verified };
  }

  const pendingCredential = text(signInPayload?.mfaPendingCredential);
  const factors = Array.isArray(signInPayload?.mfaInfo) ? signInPayload.mfaInfo : [];
  const totpFactor = factors.find((factor) =>
    Boolean(factor?.totpInfo) || text(factor?.factorId).toLowerCase() === 'totp',
  );
  const enrollmentId = text(totpFactor?.mfaEnrollmentId);
  if (!pendingCredential || !enrollmentId) {
    throw new Error('Firebase did not return an enrolled TOTP challenge for the Founder account.');
  }

  const verificationCode = generateTotp(normalizedTotpSecret);
  if (!/^\d{6}$/.test(verificationCode)) {
    throw new Error('Founder TOTP generation did not produce a six-digit code.');
  }

  const finalizeEndpoint = new URL('https://identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize');
  finalizeEndpoint.searchParams.set('key', normalizedApiKey);
  const finalizeResponse = await fetchImpl(finalizeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: referer },
    body: JSON.stringify({
      mfaPendingCredential: pendingCredential,
      mfaEnrollmentId: enrollmentId,
      totpVerificationInfo: { verificationCode },
    }),
  });
  const finalizePayload = await parseJson(finalizeResponse);
  const idToken = text(finalizePayload?.idToken);
  if (!finalizeResponse.ok || !idToken) {
    throw new Error(
      `Firebase TOTP sign-in failed: ${providerError(finalizePayload, `HTTP ${finalizeResponse.status}`)}`,
    );
  }

  const verified = await requireVerifiedTotpMfaToken(idToken, verifyIdTokenImpl);
  if (verified.secondFactorIdentifier !== enrollmentId) {
    throw new Error('Firebase TOTP token factor identifier does not match the completed challenge.');
  }
  return { idToken, ...verified };
}
