/**
 * Firebase App Check REST helpers (firebaseappcheck.googleapis.com/v1beta).
 * Works without `gcloud firebase appcheck` — only needs gcloud auth + project describe.
 */
import { execSync } from 'node:child_process';

const API_BASE = 'https://firebaseappcheck.googleapis.com/v1beta';

/** Supported App Check product service IDs (Firebase docs). */
export const APPCHECK_SERVICES = [
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
];

export function getAccessToken() {
  if (process.env.GCLOUD_ACCESS_TOKEN) return process.env.GCLOUD_ACCESS_TOKEN.trim();
  try {
    return execSync('gcloud auth print-access-token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

export function getProjectNumber(projectId) {
  if (process.env.FIREBASE_PROJECT_NUMBER) return String(process.env.FIREBASE_PROJECT_NUMBER).trim();
  try {
    return execSync(`gcloud projects describe ${projectId} --format=value(projectNumber)`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

export function isEnforced(mode) {
  return String(mode || '').toUpperCase().includes('ENFORC');
}

async function appCheckRequest(path, { method = 'GET', body, token, quotaProject }) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(quotaProject ? { 'X-Goog-User-Project': quotaProject } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-json error body
  }
  if (!res.ok) {
    const err = new Error(json?.error?.message || text || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function listAppCheckServices(projectId, token = getAccessToken()) {
  const projectNumber = getProjectNumber(projectId);
  if (!token) return { ok: false, reason: 'no_access_token', projectNumber, services: [] };
  if (!projectNumber) return { ok: false, reason: 'no_project_number', projectNumber: null, services: [] };
  const data = await appCheckRequest(`/projects/${projectNumber}/services`, { token, quotaProject: projectId });
  return { ok: true, projectNumber, services: data.services || [] };
}

export async function getAppCheckService(projectId, serviceId, token = getAccessToken()) {
  const projectNumber = getProjectNumber(projectId);
  if (!token || !projectNumber) return { ok: false, reason: 'missing_auth_or_project' };
  const data = await appCheckRequest(
    `/projects/${projectNumber}/services/${encodeURIComponent(serviceId)}`,
    { token, quotaProject: projectId }
  );
  return { ok: true, service: data };
}

export async function enforceAppCheckService(projectId, serviceId, token = getAccessToken()) {
  const projectNumber = getProjectNumber(projectId);
  if (!token || !projectNumber) return { ok: false, reason: 'missing_auth_or_project' };
  const name = `projects/${projectNumber}/services/${serviceId}`;
  const data = await appCheckRequest(
    `/projects/${projectNumber}/services/${encodeURIComponent(serviceId)}?updateMask=enforcementMode`,
    {
      method: 'PATCH',
      token,
      quotaProject: projectId,
      body: { name, enforcementMode: 'ENFORCED' },
    }
  );
  return { ok: true, service: data };
}

export function serviceIdFromName(name) {
  const parts = String(name || '').split('/');
  return parts[parts.length - 1] || 'unknown';
}

export function printManualRunbook(projectId = 'bin-group-57c60') {
  console.log('\nManual App Check enforcement (Firebase Console):');
  console.log(`1. https://console.firebase.google.com/project/${projectId}/appcheck/products`);
  console.log('2. Cloud Firestore → Enforce');
  console.log('3. Cloud Storage for Firebase → Enforce');
  console.log('4. Add Playwright debug token under App Check → Apps → Manage debug tokens');
  console.log('5. Re-run: npm run test:gate12:appcheck && npm run test:e2e:gate11:production');
  console.log('\nAuth for REST automation: gcloud auth login && gcloud config set project ' + projectId);
  console.log('Optional: gcloud auth application-default set-quota-project ' + projectId);
}
