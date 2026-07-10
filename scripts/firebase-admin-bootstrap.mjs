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

export function resolveFirebaseAdminProjectId(fallback = 'bin-group-57c60') {
  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return process.env.GCP_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || serviceAccount?.project_id
    || fallback;
}

export function initializeFirebaseAdmin(admin, fallbackProjectId = 'bin-group-57c60') {
  if (admin.apps?.length) return admin.app();

  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
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
