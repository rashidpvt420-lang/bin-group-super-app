/**
 * Quick REST login check for all five E2E roles (no browser).
 */
import { loadProjectEnv, resolveFirebaseWebApiKey, firebaseRestHeaders } from './load-project-env.mjs';

loadProjectEnv();

const apiKey = resolveFirebaseWebApiKey();
if (!apiKey) {
  console.error(
    '[FAIL] Set VITE_FIREBASE_API_KEY in .env, .env.local, or .env.production for REST login check.'
  );
  process.exit(1);
}

const roles = ['ADMIN', 'OWNER', 'TENANT', 'TECHNICIAN', 'BROKER'];
let failed = 0;

async function signIn(email, password) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: firebaseRestHeaders(),
        body: JSON.stringify({ email, password, returnSecureToken: true }),
        signal: controller.signal,
      }
    );
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && Boolean(body?.idToken), message: body?.error?.message || String(res.status) };
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'request timed out (15s)' : String(error?.message || error);
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

for (const role of roles) {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (!email || !password) {
    console.log(`[SKIP] ${role} — missing email/password in .env.e2e`);
    failed += 1;
    continue;
  }
  const result = await signIn(email, password);
  if (result.ok) console.log(`[PASS] ${role} — ${email}`);
  else {
    console.log(`[FAIL] ${role} — ${email} — ${result.message}`);
    failed += 1;
  }
}

process.exit(failed ? 1 : 0);
