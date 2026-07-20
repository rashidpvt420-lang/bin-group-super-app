#!/usr/bin/env node

import admin from 'firebase-admin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFirebaseAdmin } from './firebase-admin-bootstrap.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
export const REQUIRED_ADMIN_MFA_DOMAINS = Object.freeze([
  'bin-group-57c60.web.app',
  'bin-group-57c60.firebaseapp.com',
  'bin-group-admin-panel.web.app',
  'bin-group-admin-panel.firebaseapp.com',
]);

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase();
}

export function mergeAuthorizedDomains(existingDomains, requiredDomains = REQUIRED_ADMIN_MFA_DOMAINS) {
  const ordered = [];
  const seen = new Set();
  for (const domain of [...(Array.isArray(existingDomains) ? existingDomains : []), ...requiredDomains]) {
    const normalized = normalizeDomain(domain);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

async function getAccessToken(projectId) {
  const app = initializeFirebaseAdmin(admin, projectId);
  const credential = app.options.credential || admin.credential.applicationDefault();
  const accessToken = await credential.getAccessToken();
  const token = String(accessToken?.access_token || '').trim();
  if (!token) throw new Error('Application Default Credentials did not return an access token.');
  return token;
}

async function requestConfig(projectId, token) {
  const endpoint = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Identity Toolkit config lookup failed with HTTP ${response.status}.`);
  return response.json();
}

async function patchAuthorizedDomains(projectId, token, authorizedDomains) {
  const endpoint = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config?updateMask=authorizedDomains`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ authorizedDomains }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Identity Toolkit authorized-domain update failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : '.'}`);
  }
  return response.json();
}

export async function ensureAdminMfaAuthorizedDomains({
  projectId = process.env.GCP_PROJECT_ID || EXPECTED_PROJECT_ID,
  requiredDomains = REQUIRED_ADMIN_MFA_DOMAINS,
} = {}) {
  if (String(projectId).trim() !== EXPECTED_PROJECT_ID) {
    throw new Error(`GCP_PROJECT_ID must equal ${EXPECTED_PROJECT_ID}.`);
  }

  const token = await getAccessToken(EXPECTED_PROJECT_ID);
  const before = await requestConfig(EXPECTED_PROJECT_ID, token);
  const currentDomains = Array.isArray(before?.authorizedDomains) ? before.authorizedDomains : [];
  const mergedDomains = mergeAuthorizedDomains(currentDomains, requiredDomains);
  const currentSet = new Set(currentDomains.map(normalizeDomain));
  const missingDomains = requiredDomains.map(normalizeDomain).filter((domain) => !currentSet.has(domain));

  if (missingDomains.length > 0) {
    console.log(`[admin-mfa-domain-repair] adding ${missingDomains.length} required Admin MFA authorized domain(s)`);
    await patchAuthorizedDomains(EXPECTED_PROJECT_ID, token, mergedDomains);
  } else {
    console.log('[admin-mfa-domain-repair] all required Admin MFA authorized domains are already present');
  }

  const after = await requestConfig(EXPECTED_PROJECT_ID, token);
  const afterSet = new Set((Array.isArray(after?.authorizedDomains) ? after.authorizedDomains : []).map(normalizeDomain));
  const stillMissing = requiredDomains.map(normalizeDomain).filter((domain) => !afterSet.has(domain));
  if (stillMissing.length > 0) {
    throw new Error(`Admin MFA authorized-domain repair did not persist: ${stillMissing.join(', ')}`);
  }

  const evidence = {
    schemaVersion: 1,
    status: 'passed',
    projectId: EXPECTED_PROJECT_ID,
    requiredDomainsPresent: true,
    requiredDomainCount: requiredDomains.length,
    authorizedDomainCount: afterSet.size,
    changed: missingDomains.length > 0,
    commitSha: String(process.env.GITHUB_SHA || '').trim() || null,
    repository: String(process.env.GITHUB_REPOSITORY || '').trim() || null,
    workflowRunId: String(process.env.GITHUB_RUN_ID || '').trim() || null,
    verifiedAt: new Date().toISOString(),
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };
  console.log('[admin-mfa-domain-repair] production Admin MFA domains verified');
  return evidence;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  ensureAdminMfaAuthorizedDomains().catch((error) => {
    console.error(`[admin-mfa-domain-repair] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
