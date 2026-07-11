import { existsSync } from 'node:fs';

function parseServiceAccount(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;

  const candidates = [raw];
  try {
    candidates.push(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    // The value may already be plain JSON.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.private_key) {
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
      }
      if (parsed?.client_email && parsed?.private_key) return parsed;
    } catch {
      // Try the next supported encoding.
    }
  }

  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON or its base64 encoding.');
}

function tryParseServiceAccount(rawValue) {
  try {
    return parseServiceAccount(rawValue);
  } catch {
    return null;
  }
}

export function credentialStatus() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath && !existsSync(credPath)) {
    return {
      ok: false,
      reason: `GOOGLE_APPLICATION_CREDENTIALS points to a missing file:\n  ${credPath}`,
    };
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    return { ok: true, mode: 'inline-json' };
  }
  if (credPath && existsSync(credPath)) {
    return { ok: true, mode: 'service-account-file' };
  }
  return { ok: true, mode: 'application-default' };
}

export function assertFirebaseAdminCredentials() {
  const status = credentialStatus();
  if (!status.ok) {
    console.error(`[FAIL] ${status.reason}`);
    console.error('\nOr clear the bad path and use Application Default Credentials:');
    console.error('  Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue');
    console.error('  gcloud auth application-default login');
    process.exit(1);
  }
}

export function sanitizeProcessEnvForFirebaseAdmin(env = process.env) {
  const next = { ...env };
  const credPath = next.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath && !existsSync(credPath)) {
    delete next.GOOGLE_APPLICATION_CREDENTIALS;
  }
  return next;
}

export function applyFirebaseAdminEnvSanitize() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath && !existsSync(credPath)) {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}

export function resolveFirebaseAdminProjectId(fallback = 'bin-group-57c60') {
  const serviceAccount = tryParseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return process.env.GCP_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || serviceAccount?.project_id
    || fallback;
}

export function initializeFirebaseAdmin(admin, fallbackProjectId = 'bin-group-57c60') {
  applyFirebaseAdminEnvSanitize();
  if (admin.apps?.length) return admin.app();

  const serviceAccount = tryParseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = process.env.GCP_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || serviceAccount?.project_id
    || fallbackProjectId;

  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  // GOOGLE_APPLICATION_CREDENTIALS and GitHub Workload Identity are consumed
  // automatically by application-default credentials in the Admin SDK.
  return admin.initializeApp({ projectId });
}
