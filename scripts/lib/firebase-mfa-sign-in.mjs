import { generateTotp } from './totp.mjs';

const text = (value) => String(value ?? '').trim();

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

function requireMfaToken(token) {
  const payload = decodeJwtPayload(token);
  const secondFactor = text(payload?.firebase?.sign_in_second_factor);
  if (!secondFactor) {
    throw new Error('Firebase sign-in did not produce a verified second-factor session.');
  }
  return {
    uid: text(payload.user_id || payload.sub),
    secondFactor,
  };
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
    const verified = requireMfaToken(directToken);
    return { idToken: directToken, uid: verified.uid, secondFactor: verified.secondFactor };
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

  const verified = requireMfaToken(idToken);
  return {
    idToken,
    uid: verified.uid,
    secondFactor: verified.secondFactor,
  };
}
