import { generateTotp } from './totp.mjs';

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

function decodeJwtPayload(token) {
  const parts = text(token).split('.');
  if (parts.length !== 3) throw new Error('Firebase ID token is malformed.');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Firebase ID token payload could not be decoded.');
  }
}

function requireTotpMfaToken(token) {
  const payload = decodeJwtPayload(token);
  const uid = text(payload.user_id || payload.sub);
  const secondFactorType = lower(payload?.firebase?.sign_in_second_factor);
  const secondFactorIdentifier = text(payload?.firebase?.second_factor_identifier);
  if (!uid) throw new Error('Firebase MFA ID token has no authenticated user identifier.');
  if (secondFactorType !== 'totp') {
    throw new Error('Firebase sign-in did not produce a verified TOTP second-factor session.');
  }
  if (!secondFactorIdentifier) {
    throw new Error('Firebase TOTP session did not include the verified factor identifier.');
  }
  return { uid, secondFactorType, secondFactorIdentifier };
}

export async function signInWithRequiredTotpMfa({
  apiKey,
  email,
  password,
  totpSecret,
  referer = 'https://admin.bin-groups.com/',
  fetchImpl = fetch,
}) {
  const normalizedApiKey = text(apiKey);
  const normalizedEmail = text(email).toLowerCase();
  const normalizedPassword = text(password);
  const normalizedTotpSecret = text(totpSecret);
  if (!normalizedApiKey || !/^\S+@\S+\.\S+$/.test(normalizedEmail) || !normalizedPassword) {
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
    const verified = requireTotpMfaToken(directToken);
    return { idToken: directToken, ...verified };
  }

  const pendingCredential = text(signInPayload?.mfaPendingCredential);
  const factors = Array.isArray(signInPayload?.mfaInfo) ? signInPayload.mfaInfo : [];
  const totpFactor = factors.find((factor) =>
    Boolean(factor?.totpInfo) || lower(factor?.factorId) === 'totp',
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

  const verified = requireTotpMfaToken(idToken);
  if (verified.secondFactorIdentifier !== enrollmentId) {
    throw new Error('Firebase TOTP token factor identifier does not match the completed challenge.');
  }
  return { idToken, ...verified };
}
